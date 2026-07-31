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

const push = require("../src/lib/push-send.cjs");

/**
 * ส่งทั้งชุดผ่านตัวส่งกลาง — ส่งตรงถึงกูเกิล ไม่ผ่านคนกลาง
 *
 * 🔴 เดิมยิงไปบริการกลางของ Expo ซึ่ง **480 รอบได้ expo_ok=0 ทุกรอบ**
 * ไม่เคยสำเร็จเลยสักครั้ง เพราะต้องเอากุญแจโครงการไปฝากที่นั่นอีกที
 * ท่อส่งตรงพิสูจน์แล้วว่าถึงเครื่องจริง (30 ก.ค. เจ้าของยืนยันเอง)
 *
 * คืนรูปเดิม {ok, fail} เพื่อไม่ต้องแก้บรรทัดรายงานผลท้ายไฟล์
 * แต่เพิ่ม gone/noToken ให้รู้ว่าเครื่องตายกี่เครื่อง ยังไม่มีกุญแจกี่เครื่อง
 */
async function sendExpo(messages, db) {
  const r = await push.sendAll(messages, { db: db ?? null, dry: DRY });
  if (r.noToken > 0) {
    console.log(`  ℹ️ ${r.noToken} เครื่องยังไม่มีกุญแจแบบส่งตรง (ต้องลงแอพรุ่นใหม่)`);
  }
  if (r.gone > 0) {
    console.log(`  🗑️ ปิดกุญแจเครื่องที่ไม่รับแล้ว ${r.gone} เครื่อง`);
  }
  return { ok: r.sent, fail: r.failed };
}

const guard = require("../src/lib/push-guard.cjs");

async function main() {
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();
  const { rows: users } = await db.query(`
    SELECT u.id, u.email,
           array_agg(json_build_object('token', t.device_push_token, 'locale', COALESCE(t.locale,'th'))) AS tokens,
           np2.yam_enabled, np2.auspicious_enabled, np2.daily_enabled,
           np2.quiet_start, np2.quiet_end, np2.max_per_day, np2.paused_until,
           COALESCE(np2.timezone, u.timezone) AS user_timezone,
           (np2.user_id IS NOT NULL) AS has_prefs,
           (SELECT count(*) FROM mobile_push_log l
             WHERE l.user_id = u.id AND l.sent_at >= now() - interval '24 hours') AS sent_today
      FROM mobile_push_tokens t JOIN users u ON u.id = t.user_id
      LEFT JOIN mobile_notification_prefs np2 ON np2.user_id = u.id
      LEFT JOIN mobile_notification_prefs p ON p.user_id = u.id
     WHERE t.enabled = true AND u.deleted_at IS NULL
     GROUP BY u.id, np2.user_id, np2.yam_enabled, np2.auspicious_enabled,
              np2.daily_enabled, np2.quiet_start, np2.quiet_end, np2.paused_until,
              np2.max_per_day, np2.timezone, u.timezone`);

  /**
   * 🔴 ห้ามคิดวันที่ให้ทุกคนจากเวลาไทย (แก้ 30 ก.ค. 69)
   * เดิมบวก 7 ชั่วโมงตายตัวแล้วใช้วันนั้นกับทุกคน
   * คนอยู่คนละเขตเวลาจะได้ "ดวงวันนี้" ของวันผิด ไม่ใช่แค่เวลาผิด
   * ค่าตรงนี้เหลือไว้เป็นค่าตั้งต้นของรอบเท่านั้น — ของจริงคิดทีละคนในลูป
   */
  const runAt = new Date();
  const serverDay = guard.localDateStr(guard.FALLBACK_TZ, runAt);
  const mIdx = Number(serverDay.slice(5, 7)) - 1;
  const year = Number(serverDay.slice(0, 4));
  const monthKey = `${year}-${String(mIdx + 1).padStart(2, "0")}`;
  console.log(`[mobile-monthly-push] ${new Date().toISOString()} month=${monthKey} users=${users.length} dry=${DRY}`);

  let sent = 0, skipped = 0;
  const messages = [];
  for (const u of users) {
    try {

      /**
       * 🔴 ทุกใบต้องผ่านตัวคุมกลาง (30 ก.ค. 69)
       *
       * เดิมตัวยิงนี้เขียนเงื่อนไขเอง `COALESCE(p.daily_enabled, true)`
       * = คนที่ไม่เคยตั้งค่าถือว่าเปิด → ได้รับโดยไม่เคยกดยินยอม
       * และไม่มีช่วงห้ามรบกวนเลย ยิงกลางดึกได้
       *
       * ตัวคุมกลางบังคับครบ: ยินยอม · ช่วงห้ามรบกวนตามเขตเวลาผู้ใช้ · เพดานต่อวัน
       */
      const verdict = guard.mayNotify({
        category: "daily",
        prefs: u.has_prefs ? u : null,
        timezone: u.user_timezone,
        sentToday: Number(u.sent_today || 0),
      });
      if (!verdict.allow) {
        skipped++;
        if (DRY) console.log(`[DRY] ข้าม ${u.email}: ${verdict.reason}`);
        continue;
      }
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
        messages.push({ deviceToken: entry.token, title: m.title, body: m.body, url: "hourkey://calendar", data: { url: "hourkey://calendar", monthly: yamKey } });
      }
      sent++;
      if (DRY) console.log(`[DRY] ${u.email} → ${thMsg.title}`);
    } catch (e) { console.error(`[mobile-monthly-push] user=${u.id}`, e.message); }
  }

  if (!DRY) {
    const r = await sendExpo(messages, db);
    console.log(`[mobile-monthly-push] users_notified=${sent} skipped=${skipped} expo_ok=${r.ok} expo_fail=${r.fail}`);
  } else {
    console.log(`[mobile-monthly-push] DRY users_would_notify=${sent} skipped=${skipped} msgs=${messages.length}`);
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
