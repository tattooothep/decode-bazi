#!/usr/bin/env node
/**
 * 21 ก.ค. 2569: แจ้งเตือนดวงรายวันเฉพาะบุคคล (Expo push) — "ดวงมาหาคุณเอง"
 * เช้า 07:00: ดวงวันนี้ (คะแนน+ควรทำ+ยามทองแรก) · ค่ำ 19:30: ดวงพรุ่งนี้ (วางแผนล่วงหน้า)
 * ข้อมูลจาก engine จริงผ่าน /api/today + /api/today/hours (ห้ามคำนวณเองในสคริปต์)
 * กันซ้ำด้วย mobile_push_log unique(user_id, yam_key) · ปิดได้ต่อ user (daily_enabled)
 * Usage: node scripts/mobile-daily-fortune-push-cron.cjs --slot=morning|evening [--dry]
 */
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { Client } = require("pg");

const DRY = process.argv.includes("--dry");
const SLOT = (process.argv.find((a) => a.startsWith("--slot=")) || "--slot=morning").slice(7);
const BASE = process.env.PUSH_INTERNAL_BASE || "http://127.0.0.1:3350";

(function loadEnv() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
})();

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function signSession(user) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("no AUTH_SECRET");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    userId: user.id, email: user.email, orgId: user.current_org_id || null,
    sv: user.session_version || 0, iat: now, exp: now + 600,
  }));
  const sig = b64url(crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

async function getJson(user, url, signal) {
  const token = signSession(user);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Cookie: `decode_auth=${token}` }, signal });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

const guard = require("../src/lib/push-guard.cjs");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const science = require("../src/lib/notification-science.cjs");
const notificationPayload = require("../src/lib/notification-payload.cjs");

function buildDailyCopy({ loc, slot, dateLabel, score, label, tongshuYi, golden }) {
  const family = notificationPayload.normalizedLocale(loc);
  const parts = [];
  if (family === "zh") {
    if (score != null) parts.push(`日力 ${score}`);
    if (golden?.range) parts.push(`黃金時 ${golden.range}`);
    parts.push("開啟今日運勢查看建議");
  } else if (family === "en") {
    if (score != null) parts.push(`Day power ${score}`);
    if (golden?.range) parts.push(`golden hour ${golden.range}`);
    parts.push("Open Today to review the recommendation");
  } else {
    if (score != null) parts.push(`พลังวัน ${score}${label ? ` (${label})` : ""}`);
    if (Array.isArray(tongshuYi) && tongshuYi.length) parts.push(`เหมาะ: ${tongshuYi.join(" · ")}`);
    if (golden?.range) parts.push(`ยามทอง ${golden.range}`);
    parts.push("เปิดดวงวันนี้เพื่อดูคำแนะนำ");
  }
  const title = family === "zh"
    ? (slot === "morning" ? `☀️ 今日運勢（${dateLabel}）` : `🌙 明日運勢（${dateLabel}）搶先規劃`)
    : family === "en"
      ? (slot === "morning" ? `☀️ Your fortune today (${dateLabel})` : `🌙 Tomorrow's fortune (${dateLabel}) — plan ahead`)
      : (slot === "morning" ? `☀️ ดวงวันนี้ของคุณ (${dateLabel})` : `🌙 ดวงพรุ่งนี้ (${dateLabel}) — วางแผนก่อนใคร`);
  return { title, body: parts.join(" · ") };
}

function buildDailyProducer(user, input) {
  const today = input?.todayApi;
  if (!today || today.ok === false || !user?.id || !user?.profile_id) return null;
  const slot = input?.slot === "evening" ? "evening" : "morning";
  const date = String(input?.date || "");
  const dateLabel = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const verdict = today.verdict && typeof today.verdict === "object" ? today.verdict : {};
  const score = Number.isFinite(Number(verdict.score)) ? Number(verdict.score) : null;
  const label = typeof verdict.label === "string" ? verdict.label : "";
  const tongshuYi = Array.isArray(today?.tongshu?.yi) ? today.tongshu.yi.slice(0, 2) : [];
  const hours = Array.isArray(input?.hoursApi?.hours) ? input.hoursApi.hours : [];
  const nowMinutes = slot === "morning" && Number.isFinite(Number(input?.nowMinutes)) ? Number(input.nowMinutes) : -1;
  const usable = hours.filter((hour) => {
    const match = /^(\d{2}):(\d{2})-/u.exec(String(hour?.range || ""));
    return match ? Number(match[1]) * 60 + Number(match[2]) >= nowMinutes : false;
  });
  const golden = usable.find((hour) => String(hour.quality || "") === "best")
    || usable.find((hour) => String(hour.quality || "") === "good") || null;
  const build = (locale) => buildDailyCopy({ loc: locale, slot, dateLabel, score, label, tongshuYi, golden });
  const historyCopies = delivery.localizedHistoryCopies(build);
  const payload = notificationPayload.buildNotificationPayload("daily", String(user.id), { slot, date, url: "/today" });
  return {
    userId: user.id, key: `daily|${slot}|${date}|${user.profile_id}`, kind: "daily",
    ...historyCopies.th, historyCopies, payload,
    sourceFacts: {
      profileId: user.profile_id, timezone: user.user_timezone, score, label, tongshuYi,
      goldenHour: golden ? { range: golden.range, quality: golden.quality } : null,
    },
    messages: (user.tokens || []).map((token) => {
      const entry = typeof token === "object" && token ? token : { device: token, locale: "th" };
      const locale = notificationPayload.normalizedLocale(entry.locale);
      return {
        tokenId: entry.id, deviceToken: entry.device, deviceTokenType: entry.deviceType,
        expoToken: entry.expo, platform: entry.platform, category: "daily", locale,
        ...build(locale), url: "/today", data: payload,
      };
    }),
  };
}

async function main() {
  if (SLOT !== "morning" && SLOT !== "evening") throw new Error(`bad slot ${SLOT}`);
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();
  const runLease = await delivery.trySchedulerRunLease(db, "daily-fortune");
  if (!runLease.acquired) { console.log("[mobile-daily-push] overlap skipped"); await db.end(); return; }
  const { rows: users } = await db.query(`
    SELECT u.id, u.email, u.current_org_id, u.session_version,
           array_agg(json_build_object(
             'id', t.id, 'device', t.device_push_token, 'deviceType', t.device_token_type,
             'expo', t.expo_push_token, 'platform', t.platform,
             'locale', COALESCE(t.locale,'th')
           )) AS tokens,
           (SELECT p.id FROM profiles p WHERE p.created_by_user_id = u.id
             AND COALESCE(p.is_archived,false)=false
             ORDER BY (p.relationship_type IS NULL OR btrim(p.relationship_type::text)='') DESC, p.created_at ASC LIMIT 1) AS profile_id,
           np2.yam_enabled, np2.auspicious_enabled, np2.daily_enabled, np2.daily_slot,
           np2.quiet_start, np2.quiet_end, np2.max_per_day, np2.paused_until,
           COALESCE(np2.timezone, u.timezone) AS user_timezone,
           (np2.user_id IS NOT NULL) AS has_prefs,
           (SELECT count(*) FROM mobile_push_log l
             WHERE l.user_id=u.id AND l.delivery_status IN ('accepted','delivered')
               AND (COALESCE(l.sent_at,l.accepted_at,l.updated_at) AT TIME ZONE COALESCE(np2.timezone,u.timezone,'Asia/Bangkok'))::date
                   = (now() AT TIME ZONE COALESCE(np2.timezone,u.timezone,'Asia/Bangkok'))::date) AS sent_today
      FROM mobile_push_tokens t JOIN users u ON u.id = t.user_id
      LEFT JOIN mobile_notification_prefs np2 ON np2.user_id = u.id
      LEFT JOIN mobile_notification_prefs p ON p.user_id = u.id
     WHERE t.enabled = true AND u.deleted_at IS NULL
     GROUP BY u.id, np2.user_id, np2.yam_enabled, np2.auspicious_enabled,
              np2.daily_enabled, np2.daily_slot, np2.quiet_start, np2.quiet_end, np2.paused_until,
              np2.max_per_day, np2.timezone, u.timezone`);
  console.log(`[mobile-daily-push] ${new Date().toISOString()} slot=${SLOT} users=${users.length} dry=${DRY}`);

  // ค่ำ = ดวงพรุ่งนี้ (วันไทย +1) · เช้า = ดวงวันนี้
  /**
   * 🔴 ห้ามคิดวันที่ให้ทุกคนจากเวลาไทย (แก้ 30 ก.ค. 69)
   * เดิมบวก 7 ชั่วโมงตายตัวแล้วใช้วันนั้นกับทุกคน
   * คนอยู่คนละเขตเวลาจะได้ "ดวงวันนี้" ของวันผิด ไม่ใช่แค่เวลาผิด
   * ค่าตรงนี้เหลือไว้เป็นค่าตั้งต้นของรอบเท่านั้น — ของจริงคิดทีละคนในลูป
   */
  const runAt = new Date();

  let sent = 0, failed = 0, skipped = 0;
  for (const u of users) {
    try {
      const chosenSlot = u.daily_slot === "evening" || u.daily_slot === "both" ? u.daily_slot : "morning";
      if (chosenSlot !== "both" && chosenSlot !== SLOT) { skipped++; continue; }
      const localNowMin = guard.localMinutes(u.user_timezone, runAt);
      const targetMin = SLOT === "morning" ? 7 * 60 : 19 * 60 + 30;
      if (!DRY && (localNowMin === null || localNowMin < targetMin || localNowMin >= targetMin + 15)) {
        skipped++;
        continue;
      }

      /**
       * 🔴 ทุกใบต้องผ่านตัวคุมกลาง (30 ก.ค. 69)
       *
       * เดิมตัวยิงนี้เขียนเงื่อนไขเอง `COALESCE(p.daily_enabled, true)`
       * = คนที่ไม่เคยตั้งค่าถือว่าเปิด → ได้รับโดยไม่เคยกดยินยอม
       * และไม่มีช่วงห้ามรบกวนเลย ยิงกลางดึกได้
       *
       * ตัวคุมกลางบังคับครบ: ยินยอม · ช่วงห้ามรบกวนตามเขตเวลาผู้ใช้ · เพดานต่อวัน
       */
      const guardVerdict = guard.mayNotify({
        category: "daily",
        prefs: u.has_prefs ? u : null,
        timezone: u.user_timezone,
        sentToday: Number(u.sent_today || 0),
      });
      if (!guardVerdict.allow) {
        skipped++;
        if (DRY) console.log(`[mobile-daily-push] category=daily dry_skip=1 error_code=${guardVerdict.reason}`);
        continue;
      }
      if (!u.profile_id) { skipped++; continue; }
      // วันตามปฏิทินของผู้ใช้คนนี้ — รอบค่ำชี้วันพรุ่งนี้ของเขา ไม่ใช่ของไทย
      const baseDay = guard.localDateStr(u.user_timezone, runAt);
      const dateStr = SLOT === "evening"
        ? guard.localDateStr(u.user_timezone, new Date(runAt.getTime() + 86_400_000))
        : baseDay;
      const engine = await science.withTotalTimeout(async (signal) => {
        const todayResult = await getJson(u, `${BASE}/api/mobile/v1/today?date=${dateStr}&profileId=${u.profile_id}`, signal);
        if (!todayResult || todayResult.ok === false) return { today: null, hoursData: null };
        const token = signSession(u);
        const hoursRes = await fetch(`${BASE}/api/today/hours`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `decode_auth=${token}` },
          body: JSON.stringify({ date: dateStr, profileId: u.profile_id }),
          signal,
        }).catch(() => null);
        const hoursData = hoursRes && hoursRes.ok ? await hoursRes.json().catch(() => null) : null;
        return { today: todayResult, hoursData };
      }, 12_000);
      const notice = buildDailyProducer(u, {
        slot: SLOT, date: dateStr, todayApi: engine.today, hoursApi: engine.hoursData,
        nowMinutes: SLOT === "morning" ? (localNowMin ?? 0) : -1,
      });
      if (!notice) { skipped++; continue; }
      const result = await delivery.deliver(db, notice, { dry: DRY });
      if (result.status === "accepted" || result.status === "dry") sent++;
      else if (result.status === "failed") failed++;
      else skipped++;
      if (DRY) console.log("[mobile-daily-push] category=daily dry_candidate=1");
    } catch { console.error("[mobile-daily-push] category=daily error_code=user_failed"); }
  }

  console.log(`[mobile-daily-push] ${DRY ? "DRY " : ""}slot=${SLOT} accepted=${sent} failed=${failed} skipped=${skipped}`);
  await runLease.release();
  await db.end();
}

module.exports = { buildDailyCopy,buildDailyProducer,getJson,main };

if (require.main === module) main().catch(() => { console.error("[mobile-daily-push] category=daily error_code=scheduler_failed"); process.exit(1); });
