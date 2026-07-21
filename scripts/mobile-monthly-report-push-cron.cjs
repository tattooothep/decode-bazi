#!/usr/bin/env node
/**
 * 21 ก.ค. 2569: แจ้งเตือนต้นเดือน "รายงานดวงประจำเดือนพร้อมแล้ว" (Expo push)
 * ชี้เข้าปฏิทินดวง + ปุ่มบันทึก PDF ที่มีอยู่จริงในแอพ (/api/mobile/v1/export/summary?page=calendar)
 * ไม่เจนเนื้อหาใหม่ในสคริปต์ — เนื้อหาเดือนมาจาก engine ตอนผู้ใช้เปิด (สดเสมอ)
 * cron: 1 ทุกเดือน 08:00 ไทย · กันซ้ำ mobile_push_log unique(user_id, yam_key)
 * Usage: node scripts/mobile-monthly-report-push-cron.cjs [--dry]
 */
const path = require("node:path");
const fs = require("node:fs");
const { Client } = require("pg");

const DRY = process.argv.includes("--dry");

(function loadEnv() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
})();

const MONTH_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildMsg(loc, mIdx, year) {
  if (loc === "zh") return {
    title: `📔 ${year}年${mIdx + 1}月運勢月報已就緒`,
    body: "本月吉日、注意日與黃金時辰 — 開啟命理日曆即可查看並存成 PDF",
  };
  if (loc === "en") return {
    title: `📔 Your ${MONTH_EN[mIdx]} ${year} fortune report is ready`,
    body: "Good days, caution days and golden hours — open the calendar and save as PDF",
  };
  return {
    title: `📔 รายงานดวงเดือน ${MONTH_TH[mIdx]} ${year + 543} พร้อมแล้ว`,
    body: "วันดี วันระวัง ยามทองทั้งเดือนของคุณ — เปิดปฏิทินดวงแล้วกดบันทึก PDF ได้เลย",
  };
}

async function sendExpo(messages) {
  if (!messages.length) return { ok: 0, fail: 0 };
  let ok = 0, fail = 0;
  for (let i = 0; i < messages.length; i += 90) {
    const chunk = messages.slice(i, i + 90);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(chunk),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    const tickets = data && Array.isArray(data.data) ? data.data : [];
    tickets.forEach((t) => (t.status === "ok" ? ok++ : fail++));
    if (!tickets.length) fail += chunk.length;
  }
  return { ok, fail };
}

async function main() {
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();
  const { rows: users } = await db.query(`
    SELECT u.id, u.email,
           array_agg(json_build_object('token', t.expo_push_token, 'locale', COALESCE(t.locale,'th'))) AS tokens
      FROM mobile_push_tokens t JOIN users u ON u.id = t.user_id
      LEFT JOIN mobile_notification_prefs p ON p.user_id = u.id
     WHERE t.enabled = true AND u.deleted_at IS NULL
       AND COALESCE(p.daily_enabled, true) = true
     GROUP BY u.id`);

  const thaiNow = new Date(Date.now() + 7 * 3600_000);
  const mIdx = thaiNow.getUTCMonth();
  const year = thaiNow.getUTCFullYear();
  const monthKey = `${year}-${String(mIdx + 1).padStart(2, "0")}`;
  console.log(`[mobile-monthly-push] ${new Date().toISOString()} month=${monthKey} users=${users.length} dry=${DRY}`);

  let sent = 0, skipped = 0;
  const messages = [];
  for (const u of users) {
    try {
      const thMsg = buildMsg("th", mIdx, year);
      const yamKey = `monthly|${monthKey}`;
      const dup = await db.query(
        `INSERT INTO mobile_push_log (user_id, yam_key, kind, title, body, payload)
         VALUES ($1,$2,'daily',$3,$4,$5::jsonb)
         ON CONFLICT (user_id, yam_key) DO NOTHING RETURNING id`,
        [u.id, yamKey, thMsg.title, thMsg.body, JSON.stringify({ url: "hourkey://calendar", month: monthKey })]);
      if (!dup.rows.length) { skipped++; continue; }
      for (const tk of u.tokens || []) {
        const entry = typeof tk === "object" && tk ? tk : { token: tk, locale: "th" };
        const loc = entry.locale === "en" || entry.locale === "zh" ? entry.locale : "th";
        const m = buildMsg(loc, mIdx, year);
        messages.push({ to: entry.token, sound: "default", title: m.title, body: m.body, data: { url: "hourkey://calendar", monthly: yamKey } });
      }
      sent++;
      if (DRY) console.log(`[DRY] ${u.email} → ${thMsg.title}`);
    } catch (e) { console.error(`[mobile-monthly-push] user=${u.id}`, e.message); }
  }

  if (!DRY) {
    const r = await sendExpo(messages);
    console.log(`[mobile-monthly-push] users_notified=${sent} skipped=${skipped} expo_ok=${r.ok} expo_fail=${r.fail}`);
  } else {
    console.log(`[mobile-monthly-push] DRY users_would_notify=${sent} skipped=${skipped} msgs=${messages.length}`);
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
