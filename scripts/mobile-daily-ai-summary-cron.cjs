#!/usr/bin/env node
/**
 * สรุปดวงเช้า AI fusion — งานกลางคืน (goal สาย ข · เคาะ 6 ก.ย. 2569)
 *
 * ทุก 15 นาที: หา user ที่เปิดรับแจ้งเตือนรายวัน แล้วสร้างสรุปดวงล่วงหน้า
 *  - ช่วง 03:30–06:45 ตามเขตเวลาผู้ใช้ → สรุป "วันนี้" (รอบเช้า 07:00 หยิบไปส่ง)
 *  - ช่วง 17:30–19:15 ตามเขตเวลาผู้ใช้ → สรุป "พรุ่งนี้" (รอบค่ำ 19:30)
 *
 * ข้อมูลทุกตัวมาจาก engine จริงผ่าน API (ห้ามคำนวณเองในสคริปต์):
 *  bazi+tongshu = /api/mobile/v1/today · ยาม = /api/today/hours ·
 *  ฉีเหมิน = /api/mobile/v1/qimen · ดาวจริง = /api/internal/jobs/daily-sky (Day Sniper)
 * AI (src/lib/daily-ai-summary.cjs) แค่แปลงเป็นภาษาคน 3 ภาษา — พัง/ตอบผิดโครง
 * = บันทึก failed แล้วตัวยิงเช้าใช้ข้อความสูตรเดิม ไม่มีวันเงียบ
 *
 * Usage: node scripts/mobile-daily-ai-summary-cron.cjs [--dry] [--mock-ai] [--user=<uuid>]
 */
const path = require("node:path");
const fs = require("node:fs");
const { Client } = require("pg");

const DRY = process.argv.includes("--dry");
const MOCK_AI = process.argv.includes("--mock-ai");
const ONLY_USER = (process.argv.find((a) => a.startsWith("--user=")) || "").slice(7) || null;
const BASE = process.env.PUSH_INTERNAL_BASE || "http://127.0.0.1:3350";
const MAX_AI_PER_RUN = 6;

(function loadEnv() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
})();

const guard = require("../src/lib/push-guard.cjs");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const schedulerHeartbeat = require("../src/lib/notification-scheduler-heartbeat.cjs");
const summaryLib = require("../src/lib/daily-ai-summary.cjs");
const fortuneCron = require("./mobile-daily-fortune-push-cron.cjs");

function shiftCivilDate(date, offsetDays) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

async function postJson(user, url, payload, extraHeaders) {
  const token = fortuneCron.signSession(user);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `decode_auth=${token}`,
        ...(extraHeaders || {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDailySky(profileId, date) {
  const token = process.env.HOURKEY_INTERNAL_JOB_TOKEN || "";
  if (!token) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${BASE}/api/internal/jobs/daily-sky`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ profileId, date }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && data.ok === true ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function firstStrings(list, max) {
  return Array.isArray(list)
    ? list.filter((x) => typeof x === "string" && x).slice(0, max)
    : [];
}

/** ประกอบ facts ย่อจากผล engine — ตัวเลขทุกตัวมาจาก API ล้วน */
async function buildFacts(user, dateStr) {
  const today = await fortuneCron.getJson(user, `${BASE}/api/mobile/v1/today?date=${dateStr}&profileId=${user.profile_id}`);
  if (!today || today.ok === false) return null;
  const hoursData = await postJson(user, `${BASE}/api/today/hours`, { date: dateStr, profileId: user.profile_id });
  const hours = Array.isArray(hoursData?.hours)
    ? hoursData.hours
        .filter((h) => h && typeof h.range === "string")
        .map((h) => ({ range: h.range, quality: String(h.quality || "flat") }))
        .slice(0, 12)
    : [];
  const golden = hours.find((h) => h.quality === "best") || hours.find((h) => h.quality === "good") || null;

  const verdict = today.verdict && typeof today.verdict === "object" ? today.verdict : {};
  const facts = {
    date: dateStr,
    timezone: user.user_timezone || "Asia/Bangkok",
    bazi: {
      score: Number.isFinite(Number(verdict.score)) ? Number(verdict.score) : null,
      label: typeof verdict.label === "string" ? verdict.label : "",
      reasons: firstStrings(verdict.reasons, 4),
    },
    tongshu: today.tongshu && typeof today.tongshu === "object"
      ? {
          yi: firstStrings(today.tongshu.yi, 5),
          ji: firstStrings(today.tongshu.ji, 5),
          starsGood: firstStrings(today.tongshu.stars_detail?.good?.map?.((s) => s?.name_th || s?.name || null), 4),
          starsBad: firstStrings(today.tongshu.stars_detail?.bad?.map?.((s) => s?.name_th || s?.name || null), 4),
        }
      : null,
    hours,
    goldenHour: golden ? { range: golden.range, quality: golden.quality } : null,
    qimen: null,
    sky: null,
  };

  // ฉีเหมิน ณ ยามทอง (พังได้ ไม่ล้มงาน — AI จะถูกจำกัดไม่ให้พูดถึง)
  const qimenTime = golden ? `${golden.range.slice(0, 5)}:00` : "09:00:00";
  const qimen = await postJson(user, `${BASE}/api/mobile/v1/qimen`, {
    date: dateStr,
    time: qimenTime.slice(0, 8),
    lat: 13.7563,
    lng: 100.5018,
    timezone: user.user_timezone || "Asia/Bangkok",
  });
  if (qimen && qimen.ok !== false) {
    const layers = qimen.layers && typeof qimen.layers === "object" ? qimen.layers : {};
    const hourDirection = layers.hour_stars?.direction ?? qimen.hour_direction ?? null;
    if (hourDirection || qimen.summary) {
      facts.qimen = {
        atHour: qimenTime.slice(0, 5),
        direction: typeof hourDirection === "string" ? hourDirection : null,
        summary: typeof qimen.summary === "string" ? qimen.summary.slice(0, 300) : null,
      };
    }
  }

  // ดาวจริง Day Sniper (พังได้เช่นกัน)
  const sky = await fetchDailySky(user.profile_id, dateStr);
  if (sky && sky.day && typeof sky.day === "object") {
    const day = sky.day;
    facts.sky = {
      flag: typeof day.flag === "string" ? day.flag : null,
      notes: firstStrings(
        (Array.isArray(day.hits) ? day.hits : []).map((h) => (typeof h === "string" ? h : h?.labelTh || h?.label || null)),
        4,
      ),
      skipped: sky.skipped || null,
    };
    if (!facts.sky.flag && facts.sky.notes.length === 0 && !facts.sky.skipped) facts.sky = null;
  }
  return facts;
}

function mockSummaryFor(facts) {
  const sciences = summaryLib.availableSciences(facts);
  const entry = (tag) => ({
    pushTitle: `สรุปทดสอบ ${tag}`,
    pushBody: `ข้อความทดสอบท่อ AI (${tag}) — ไม่ใช่คำทำนายจริง`,
    verdict: `ข้อความทดสอบระบบ (${tag}) ตรวจท่อครบวงจรโดยไม่เรียกโมเดลจริง`,
    agree: sciences.slice(0, 2),
    life: summaryLib.LIFE_KEYS.map((key) => ({ key, stars: 3, text: `ทดสอบหมวด ${key} (${tag})`, tip: `ทดสอบคำแนะนำ ${key}` })),
    doList: ["รายการทดสอบ 1", "รายการทดสอบ 2"],
    avoidList: ["รายการทดสอบเลี่ยง 1"],
    scienceNotes: sciences.slice(0, 2).map((science) => ({ science, stance: "neutral", text: `บันทึกทดสอบ ${science}` })),
  });
  return JSON.stringify({ th: entry("th"), en: entry("en"), zh: entry("zh") });
}

async function upsertSummary(db, user, dateStr, row) {
  await db.query(
    `INSERT INTO mobile_daily_ai_summaries
       (user_id, profile_id, forecast_date, status, facts, facts_digest, summary, model, error_code, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (user_id, profile_id, forecast_date) DO UPDATE SET
       status = EXCLUDED.status, facts = EXCLUDED.facts, facts_digest = EXCLUDED.facts_digest,
       summary = EXCLUDED.summary, model = EXCLUDED.model, error_code = EXCLUDED.error_code,
       updated_at = now()`,
    [user.id, user.profile_id, dateStr, row.status, JSON.stringify(row.facts),
      row.factsDigest, row.summary ? JSON.stringify(row.summary) : null, row.model, row.errorCode || null],
  );
}

async function main() {
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();
  const runLease = await delivery.trySchedulerRunLease(db, "daily-ai-summary");
  if (!runLease.acquired) { console.log("[daily-ai-summary] overlap skipped"); await db.end(); return; }
  try {
    const users = await fortuneCron.loadDailyUsers(db);
    const runAt = new Date();
    let generated = 0, skipped = 0, failed = 0;
    for (const u of users) {
      if (generated >= MAX_AI_PER_RUN) break;
      try {
        if (ONLY_USER && u.id !== ONLY_USER) { skipped++; continue; }
        // ยินยอมก่อนเสมอ: ไม่เคยตั้งค่า/ปิดรายวัน/พักอยู่ = ไม่สร้าง (ไม่เปลืองและไม่แอบประมวลดวง)
        const paused = u.paused_until ? new Date(u.paused_until) > runAt : false;
        if (!u.has_prefs || u.daily_enabled !== true || paused || !u.profile_id) { skipped++; continue; }
        const localMin = guard.localMinutes(u.user_timezone, runAt);
        if (localMin === null) { skipped++; continue; }
        let offsetDays = null;
        if (localMin >= 210 && localMin < 405) offsetDays = 0;        // 03:30–06:45 → วันนี้
        else if (localMin >= 1050 && localMin < 1155) offsetDays = 1; // 17:30–19:15 → พรุ่งนี้
        if (offsetDays === null && !DRY) { skipped++; continue; }
        const baseDay = guard.localDateStr(u.user_timezone, runAt);
        const dateStr = shiftCivilDate(baseDay, offsetDays === null ? 0 : offsetDays);

        const existing = await db.query(
          `SELECT status, updated_at FROM mobile_daily_ai_summaries
            WHERE user_id=$1 AND profile_id=$2 AND forecast_date=$3`,
          [u.id, u.profile_id, dateStr],
        );
        const row = existing.rows[0];
        if (row && (row.status === "ready"
          || (row.status === "failed" && Date.now() - new Date(row.updated_at).getTime() < 45 * 60_000))) {
          skipped++;
          continue;
        }
        if (DRY) { console.log(`[daily-ai-summary] dry_candidate user=${u.id.slice(0, 8)} date=${dateStr}`); skipped++; continue; }

        const facts = await buildFacts(u, dateStr);
        if (!facts || summaryLib.availableSciences(facts).length < 2) {
          failed++;
          await upsertSummary(db, u, dateStr, { status: "failed", facts: facts || {}, factsDigest: summaryLib.factsDigest(facts || {}), summary: null, model: "none", errorCode: "facts_insufficient" });
          continue;
        }
        try {
          const result = await summaryLib.generateDailySummary(facts, MOCK_AI ? { invoke: async () => mockSummaryFor(facts), model: "mock" } : {});
          await upsertSummary(db, u, dateStr, { status: "ready", facts, factsDigest: result.factsDigest, summary: result.summary, model: result.model });
          generated++;
          console.log(`[daily-ai-summary] ready user=${u.id.slice(0, 8)} date=${dateStr} model=${result.model}`);
        } catch (error) {
          failed++;
          const code = error instanceof Error ? error.message.slice(0, 60) : "error";
          await upsertSummary(db, u, dateStr, { status: "failed", facts, factsDigest: summaryLib.factsDigest(facts), summary: null, model: MOCK_AI ? "mock" : "claude-max-cli", errorCode: code });
          console.error(`[daily-ai-summary] failed user=${u.id.slice(0, 8)} date=${dateStr} error_code=${code}`);
        }
      } catch {
        failed++;
        console.error("[daily-ai-summary] user_failed");
      }
    }
    console.log(`[daily-ai-summary] ${DRY ? "DRY " : ""}generated=${generated} failed=${failed} skipped=${skipped}`);
  } finally {
    await runLease.release();
    await db.end();
    await schedulerHeartbeat.writeSchedulerHeartbeat("daily-ai-summary");
  }
}

module.exports = { buildFacts, main, mockSummaryFor, shiftCivilDate };

if (require.main === module) main().catch((error) => {
  console.error(`[daily-ai-summary] scheduler_failed ${error instanceof Error ? error.message.slice(0, 120) : "error"}`);
  process.exit(1);
});
