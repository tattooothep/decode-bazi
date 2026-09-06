#!/usr/bin/env node
/**
 * ops: ยิงแจ้งเตือนสรุปดวง AI ของวันที่กำหนดซ้ำทันที (ใช้ตอน demo/ซ่อม)
 * ใช้ท่อเดียวกับตัวยิงเช้าทุกชั้น (producer → AI copy → delivery กลาง)
 * Usage: node scripts/ops-resend-daily-ai.cjs --user=<uuid-prefix> --date=YYYY-MM-DD [--slot=morning|evening]
 */
const f = require("./mobile-daily-fortune-push-cron.cjs");
const ai = require("../src/lib/daily-ai-summary.cjs");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const { Client } = require("pg");

const arg = (name, dflt) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3) || dflt;
const USER_PREFIX = arg("user", "");
const DATE = arg("date", "");
const SLOT = arg("slot", "evening");

(async () => {
  if (!USER_PREFIX || !/^\d{4}-\d{2}-\d{2}$/u.test(DATE)) throw new Error("usage: --user=<uuid-prefix> --date=YYYY-MM-DD");
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1", port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();
  const users = await f.loadDailyUsers(db);
  const u = users.find((x) => x.id.startsWith(USER_PREFIX));
  if (!u) throw new Error("user_not_found");
  const base = process.env.PUSH_INTERNAL_BASE || "http://127.0.0.1:3350";
  const today = await f.getJson(u, `${base}/api/mobile/v1/today?date=${DATE}&profileId=${u.profile_id}`);
  const notice = f.buildDailyProducer(u, {
    slot: SLOT, date: DATE, todayApi: today, hoursApi: null,
    isTomorrow: SLOT === "evening", nowMinutes: -1,
  });
  if (!notice) throw new Error("producer_returned_null");
  const row = await db.query(
    `SELECT summary FROM mobile_daily_ai_summaries
      WHERE user_id=$1 AND profile_id=$2 AND forecast_date=$3 AND status='ready'`,
    [u.id, u.profile_id, DATE],
  );
  const summary = row.rows[0]?.summary || null;
  let final = ai.applyAiCopiesToNotice(notice, summary, {
    dateLabel: `${DATE.slice(8, 10)}/${DATE.slice(5, 7)}`,
    isTomorrow: SLOT === "evening",
    score: Number(today?.verdict?.score),
  });
  final = { ...final, key: `${notice.key}|ops-resend-${Date.now()}` };
  const result = await delivery.deliver(db, final, { dry: false });
  console.log(`[ops-resend] status=${result.status} ai=${summary ? "yes" : "no"} title=${final.title.slice(0, 70)}`);
  await db.end();
})().catch((error) => { console.error(`[ops-resend] failed: ${error.message}`); process.exit(1); });
