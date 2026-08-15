#!/usr/bin/env node
/**
 * เวฟ 2 (23 ก.ค. 2569): แจ้งเตือนเช้า "วันนี้ระวังใคร / ใครคือตัวช่วย" จากเครือข่ายดวง
 * 07:05 (หลังดวงเช้า 5 นาที): ไล่ user ที่เปิดแจ้งเตือนรายวัน (mobile_notification_prefs.daily_enabled)
 * และมีคนในเครือข่าย >= 2 คน → เรียก /api/mobile/v1/network (engine จริง pair-reaction-v2 —
 * ห้ามคำนวณเอง ห้ามแต่งคำ) → เลือกคู่หนุนสุด (คะแนนวันสูงสุด) + คู่เสี่ยงสุด (ต่ำสุด)
 * → ถ้าทั้งคู่ |คะแนนวัน| < 20 ให้ข้าม (ไม่ยิงข้อความจืด) → ยิง 1 ข้อความต่อ user ตาม locale ของเครื่อง
 * ข้อความใช้ถ้อยคำจาก engine เท่านั้น: reading (label 3 ภาษา) + guidance.primary_i18n
 * กันซ้ำด้วย mobile_push_log unique(user_id, yam_key) แบบเดียวกับ cron เดิม
 * Usage: node scripts/mobile-network-morning-push-cron.cjs [--dry]
 *        [--date=YYYY-MM-DD] [--max=8] [--pool=strongest|listorder]
 *
 * หมายเหตุการจำกัด 8 คน: engine ให้คะแนนทุกคนมาใน request เดียวอยู่แล้ว (ไม่มีค่าใช้จ่ายเพิ่มต่อคน)
 * เราจึงคัด "ผู้เข้าชิง 8 คน" จากผู้ที่คะแนนวันเด็ดขาดที่สุด (|คะแนน| มากสุด) แทนการหั่น 8 คนแรก
 * ตามลำดับรายการ (ซึ่งเป็นลำดับ created_at ไม่เกี่ยวกับความแรง และทำให้คนที่มีดวงเยอะโดนข้ามทั้งที่มีคู่แรงจริง)
 * ถ้าต้องการแบบตัวอักษร (8 คนแรกตามลำดับรายการ) ใช้ --pool=listorder
 */
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { Client } = require("pg");

const DRY = process.argv.includes("--dry");
const DATE_ARG = (process.argv.find((a) => a.startsWith("--date=")) || "").slice(7).trim();
const BASE = process.env.PUSH_INTERNAL_BASE || "http://127.0.0.1:3350";
const MAX_RAW = Number((process.argv.find((a) => a.startsWith("--max=")) || "").slice(6));
const MAX_PEOPLE = Number.isFinite(MAX_RAW) && MAX_RAW > 0 ? Math.floor(MAX_RAW) : 8; // จำกัด 8 คนต่อ user (กัน cron บวม)
const POOL_MODE = (process.argv.find((a) => a.startsWith("--pool=")) || "--pool=strongest").slice(7);
// ต่ำกว่านี้ทั้งสองฝั่ง = ไม่ยิง (ค่าจริง 20 · --min= ไว้ทดสอบด่านนี้เท่านั้น ห้ามตั้งใน crontab)
const MIN_RAW = Number((process.argv.find((a) => a.startsWith("--min=")) || "").slice(6));
const MIN_ABS_SCORE = Number.isFinite(MIN_RAW) && MIN_RAW > 0 ? Math.floor(MIN_RAW) : 20;
const USER_GAP_MS = 150;       // เว้นจังหวะกันยิง API รัว
/* ⚠️ ข้อเท็จจริงของ engine (ตรวจแล้ว 23 ก.ค.): computePairReactionV2 รับ date แต่ไม่ได้ใช้
 * (ไม่มีชั้นจร/transit ในคะแนนคู่ — network-score-payload ตั้ง transit: 0) คะแนนคู่จึงเท่าเดิมทุกวัน
 * ถ้ากันซ้ำแค่รายวัน ผู้ใช้จะได้ข้อความเดิมเป๊ะทุกเช้า → กันด้วย cooldown ต่อ "คู่เดิม" เพิ่มอีกชั้น
 * (--cooldown=0 เพื่อปิด ถ้าวันหลัง engine มีชั้นจรรายวันแล้ว) */
const COOLDOWN_RAW = Number((process.argv.find((a) => a.startsWith("--cooldown=")) || "").slice(11));
const COOLDOWN_DAYS = Number.isFinite(COOLDOWN_RAW) && COOLDOWN_RAW >= 0 ? Math.floor(COOLDOWN_RAW) : 7;

// โหลด .env.local ของ release (AUTH_SECRET/PG*) — ไม่ log ค่า
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
/** JWT HS256 โครงเดียวกับ lib/auth signSession (userId/email/orgId/sv) อายุ 10 นาที */
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
  signal?.throwIfAborted();
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Cookie: `decode_auth=${token}` },
      signal,
    });
  } catch {
    signal?.throwIfAborted();
    return null;
  }
  signal?.throwIfAborted();
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    signal?.throwIfAborted();
    return data;
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}

/* ---------- ถ้อยคำ: กรอบข้อความ 3 ภาษาเท่านั้น · เนื้อคำอ่านมาจาก engine ล้วน ---------- */
const FRAME = {
  th: { title: (d) => `🤝 เครือข่ายวันนี้ (${d})`, ally: "ตัวช่วยวันนี้", risk: "ระวังวันนี้", colon: ": ", open: " (", close: ")" },
  en: { title: (d) => `🤝 Your circle today (${d})`, ally: "Ally today", risk: "Watch out today", colon: ": ", open: " (", close: ")" },
  // zh ใช้เครื่องหมายวรรคตอนจีนล้วน (กฎ 3 ภาษาเข้ม)
  zh: { title: (d) => `🤝 今日人脈（${d}）`, ally: "今日助力", risk: "今日留心", colon: "：", open: "（", close: "）" },
};

function personName(p) {
  return String(p.nickname || p.name || "").trim();
}
function dayScore(p) {
  const v = Number(p && p.scores && p.scores.day);
  return Number.isFinite(v) ? Math.round(v) : null;
}
/** label ปฏิกิริยาจาก engine (reading = labels ของ pair-reaction-v2) — ไม่มีภาษานั้น = ไม่ใส่ */
function readingText(p, loc) {
  const r = p && p.reading;
  if (!r || typeof r !== "object") return "";
  return typeof r[loc] === "string" ? r[loc].trim() : "";
}
/** คำแนะนำจาก engine (guidance.primary_i18n) — th ยอม fallback primary เดิม · en/zh ห้ามใช้ไทย */
function adviceText(p, loc) {
  const g = p && p.guidance;
  if (!g || typeof g !== "object") return "";
  const tri = g.primary_i18n;
  if (tri && typeof tri === "object" && typeof tri[loc] === "string" && tri[loc].trim()) return tri[loc].trim();
  if (loc === "th" && typeof g.primary === "string") return g.primary.trim();
  return "";
}
function lineFor(p, loc, f, headWord) {
  const score = dayScore(p);
  const name = personName(p);
  const bits = [readingText(p, loc), score == null ? "" : `${score > 0 ? "+" : ""}${score}`].filter(Boolean);
  const head = `${headWord}${f.colon}${name}${bits.length ? `${f.open}${bits.join(" · ")}${f.close}` : ""}`;
  const advice = adviceText(p, loc);
  return advice ? `${head} — ${advice}` : head;
}
function buildMessage(loc, ally, risk, thaiDate) {
  const f = FRAME[loc] || FRAME.en;
  const lines = [];
  if (ally) lines.push(lineFor(ally, loc, f, f.ally));
  if (risk) lines.push(lineFor(risk, loc, f, f.risk));
  const action = loc === "th" ? "เปิดเครือข่ายเพื่อดูรายละเอียด" : loc === "zh" ? "開啟人脈查看詳情" : "Open Network to review details";
  return { title: f.title(thaiDate), body: `${lines.join("\n")} · ${action}` };
}

async function loadUsers(db) {
  const { rows } = await db.query(`
    SELECT u.id, u.email, u.current_org_id, u.session_version,
           array_agg(json_build_object(
             'id',t.id,'device',t.device_push_token,'deviceType',t.device_token_type,
             'expo',t.expo_push_token,'platform',t.platform,'locale',COALESCE(t.locale,'th')
           )) AS tokens,
           np2.yam_enabled, np2.auspicious_enabled, np2.daily_enabled,np2.service_enabled,
           np2.quiet_start, np2.quiet_end, np2.max_per_day, np2.paused_until,
           COALESCE(np2.timezone, u.timezone) AS user_timezone,
           (np2.user_id IS NOT NULL) AS has_prefs,
           (SELECT count(*) FROM mobile_push_log l
             WHERE l.user_id=u.id AND l.delivery_status IN ('accepted','delivered')
               AND (COALESCE(l.sent_at,l.accepted_at,l.updated_at) AT TIME ZONE COALESCE(np2.timezone,u.timezone,'Asia/Bangkok'))::date
                   = (now() AT TIME ZONE COALESCE(np2.timezone,u.timezone,'Asia/Bangkok'))::date) AS sent_today
      FROM mobile_push_tokens t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN mobile_notification_prefs np2 ON np2.user_id = u.id
     WHERE t.enabled = true AND u.deleted_at IS NULL
       AND (SELECT count(*) FROM profiles pr
             WHERE pr.created_by_user_id = u.id AND COALESCE(pr.is_archived,false) = false) >= 3
     GROUP BY u.id, np2.user_id, np2.yam_enabled, np2.auspicious_enabled,
              np2.daily_enabled,np2.service_enabled, np2.quiet_start, np2.quiet_end, np2.paused_until,
              np2.max_per_day, np2.timezone, u.timezone`);
  return rows;
}

const guard = require("../src/lib/push-guard.cjs");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const notificationPayload = require("../src/lib/notification-payload.cjs");
const schedulerHeartbeat = require("../src/lib/notification-scheduler-heartbeat.cjs");

function buildNetworkProducer(accountId, loc, userDate, centerId, allyPick, riskPick) {
  const allyScore = allyPick ? dayScore(allyPick) : null;
  const riskScore = riskPick ? dayScore(riskPick) : null;
  const label = `${userDate.slice(8, 10)}/${userDate.slice(5, 7)}`;
  return {
    key: `network|morning|${userDate}|${centerId}`,
    copy: buildMessage(notificationPayload.normalizedLocale(loc), allyPick, riskPick, label),
    historyCopies: delivery.localizedHistoryCopies((locale) => buildMessage(locale, allyPick, riskPick, label)),
    payload: notificationPayload.buildNotificationPayload("service", String(accountId), {
      event: "network_morning", referenceId: `network|${userDate}|${centerId}`, url: "/network",
    }),
    sourceFacts: {
      date: userDate, centerProfileId: centerId,
      allyProfileId: allyPick?.id || null, allyDayScore: allyScore,
      riskProfileId: riskPick?.id || null, riskDayScore: riskScore,
      destination: "/network",
    },
  };
}

function buildNetworkNotice(user, userDate, apiResult) {
  const centerId = apiResult?.active_profile?.id || null;
  if (!user?.id || !centerId || !Array.isArray(apiResult?.people)) return null;
  const scored = apiResult.people.filter((person) => dayScore(person) !== null);
  const pool = POOL_MODE === "listorder"
    ? scored
    : scored.slice().sort((left, right) => Math.abs(dayScore(right)) - Math.abs(dayScore(left)));
  const people = pool.slice(0, MAX_PEOPLE);
  if (people.length < 2) return null;
  let ally = people[0];
  let risk = people[0];
  for (const person of people) {
    if (dayScore(person) > dayScore(ally)) ally = person;
    if (dayScore(person) < dayScore(risk)) risk = person;
  }
  const allyScore = dayScore(ally);
  const riskScore = dayScore(risk);
  if (allyScore < MIN_ABS_SCORE && riskScore > -MIN_ABS_SCORE) return null;
  const allyPick = allyScore >= MIN_ABS_SCORE ? ally : null;
  const riskPick = riskScore <= -MIN_ABS_SCORE && risk !== ally ? risk : null;
  if (!allyPick && !riskPick) return null;
  const producer = buildNetworkProducer(user.id, "th", userDate, centerId, allyPick, riskPick);
  return {
    userId: user.id, key: producer.key, kind: "service", ...producer.historyCopies.th,
    historyCopies: producer.historyCopies, payload: producer.payload,
    sourceFacts: { ...producer.sourceFacts, timezone: user.user_timezone },
    messages: (user.tokens || []).map((token) => {
      const entry = typeof token === "object" && token ? token : { device: token, locale: "th" };
      const locale = notificationPayload.normalizedLocale(entry.locale);
      return {
        tokenId: entry.id, deviceToken: entry.device, deviceTokenType: entry.deviceType,
        expoToken: entry.expo, platform: entry.platform, locale, category: "service",
        ...buildMessage(locale, allyPick, riskPick, `${userDate.slice(8, 10)}/${userDate.slice(5, 7)}`),
        url: "/network", data: producer.payload,
      };
    }),
  };
}

async function runScheduler(db, schedulerSignal) {
  schedulerSignal.throwIfAborted();
  const users = await loadUsers(db);
  schedulerSignal.throwIfAborted();
  /**
   * 🔴 ห้ามคิดวันที่ให้ทุกคนจากเวลาไทย (แก้ 30 ก.ค. 69)
   * เดิมบวก 7 ชั่วโมงตายตัวแล้วใช้วันนั้นกับทุกคน
   * คนอยู่คนละเขตเวลาจะได้ "ดวงวันนี้" ของวันผิด ไม่ใช่แค่เวลาผิด
   * ค่าตรงนี้เหลือไว้เป็นค่าตั้งต้นของรอบเท่านั้น — ของจริงคิดทีละคนในลูป
   */
  const runAt = new Date();
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(DATE_ARG)
    ? DATE_ARG
    : guard.localDateStr(guard.FALLBACK_TZ, runAt);
  console.log(`[mobile-network-push] ${new Date().toISOString()} date=${dateStr} users=${users.length} dry=${DRY}`);

  let notified = 0, skipped = 0, failed = 0;
  for (const u of users) {
    schedulerSignal.throwIfAborted();
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
        category: "service",
        prefs: u.has_prefs ? u : null,
        timezone: u.user_timezone,
        sentToday: Number(u.sent_today || 0),
      });
      if (!verdict.allow) {
        skipped++;
        if (DRY) console.log(`[mobile-network-push] category=service dry_skip=1 error_code=${verdict.reason}`);
        continue;
      }
      const userDate = /^\d{4}-\d{2}-\d{2}$/.test(DATE_ARG)
        ? DATE_ARG
        : guard.localDateStr(u.user_timezone, runAt);
      const data = await getJson(u, `${BASE}/api/mobile/v1/network?date=${userDate}`, schedulerSignal);
      if (!data || data.ok === false || !Array.isArray(data.people)) { skipped++; continue; }
      const notice = buildNetworkNotice(u, userDate, data);
      if (!notice) { skipped++; continue; }
      const allyId = notice.sourceFacts.allyProfileId;
      const riskId = notice.sourceFacts.riskProfileId;
      const recent = COOLDOWN_DAYS > 0
        ? await db.query(
            `SELECT 1 FROM mobile_push_log
              WHERE user_id=$1 AND kind='service'
                AND sent_at > now() - ($2 || ' days')::interval
                AND source_facts->>'allyProfileId' IS NOT DISTINCT FROM $3
                AND source_facts->>'riskProfileId' IS NOT DISTINCT FROM $4
              LIMIT 1`,
            [u.id, String(COOLDOWN_DAYS), allyId, riskId])
        : { rows: [] };

      if (DRY) {
        const dup = await db.query(`SELECT 1 FROM mobile_push_log WHERE user_id=$1 AND yam_key=$2`, [u.id, notice.key]);
        console.log(`[mobile-network-push] category=service dry_candidate=1 duplicate=${dup.rows.length > 0} cooldown=${recent.rows.length > 0} people=${data.people.length}`);
        notified++;
        continue;
      }

      // คู่เดิมเพิ่งยิงไปในช่วง cooldown → ข้าม (กันข้อความเดิมซ้ำทุกเช้า)
      if (recent.rows.length) { skipped++; continue; }

      const result = await delivery.deliver(db, notice, { dry: DRY });
      if (result.status === "accepted" || result.status === "dry") notified++;
      else if (result.status === "failed") failed++;
      else skipped++;
    } catch (e) {
      schedulerSignal.throwIfAborted();
      failed++;
      console.error("[mobile-network-push] category=service error_code=user_failed");
    }
    schedulerSignal.throwIfAborted();
    if (USER_GAP_MS) await new Promise((r) => setTimeout(r, USER_GAP_MS));
    schedulerSignal.throwIfAborted();
  }

  console.log(`[mobile-network-push] ${DRY ? "DRY " : ""}date=${dateStr} accepted=${notified} skipped=${skipped} errors=${failed}`);
  return { notified, skipped, failed };
}

async function main() {
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();
  try {
    const outcome = await delivery.withSchedulerRunLease(db, "network-morning", (signal) => runScheduler(db, signal), { timeoutMs: 12_000 });
    if (!outcome.acquired) console.log("[mobile-network-push] overlap skipped");
    else await schedulerHeartbeat.writeSchedulerHeartbeat("network-morning");
  } finally {
    await db.end();
  }
}

module.exports = { buildMessage,buildNetworkNotice,buildNetworkProducer,getJson,loadUsers,main,runScheduler };

if (require.main === module) main().catch(() => { console.error("[mobile-network-push] category=service error_code=scheduler_failed"); process.exit(1); });
