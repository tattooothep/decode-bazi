#!/usr/bin/env node
/**
 * r524: แจ้งเตือน "ยามดีกำลังมา" ถึงมือถือ (Expo push) — คู่ขนานกับ web push เดิมของเว็บ
 * ทุก 30 นาที: ไล่ user ที่เปิดแจ้งเตือน (mobile_push_tokens.enabled) → คำนวณ 12 ชั่วยามของดวงตัวเอง
 * ผ่าน /api/today/hours (engine จริง — ห้ามคำนวณเองในสคริปต์) → ยามคุณภาพ best/good
 * ที่จะเริ่มภายใน 60 นาที → ส่ง 1 ครั้งต่อยาม (กันซ้ำด้วย mobile_push_log)
 * Usage: node scripts/mobile-yam-push-cron.cjs [--dry]
 */
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { Client } = require("pg");
const qimenAdvisory = require("../src/lib/qimen-notification-advisory.cjs");

const DRY = process.argv.includes("--dry");
/**
 * แกล้งทำเป็นว่าตอนนี้เป็นเวลาอื่น — สำหรับตรวจสอบเท่านั้น (31 ก.ค. 69)
 *
 * 🔴 ทำไมต้องมี: ตัวยิงนี้จะทำงานก็ต่อเมื่อมียามดีเริ่มใน 45 นาทีข้างหน้า
 * เวลาที่เหลือมันข้ามเงียบๆ ทำให้ทดสอบไม่ได้เลยว่าใบที่ส่งหน้าตาเป็นยังไง
 * ใช้ได้เฉพาะคู่กับ --dry เพื่อกันเผลอยิงของจริงด้วยเวลาปลอม
 */
const FORCE_TIME = (process.argv.find((a) => a.startsWith("--force-time=")) || "").slice(13);
const BASE = process.env.PUSH_INTERNAL_BASE || "http://127.0.0.1:3350";

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

async function fetchHours(user, profileId, dateStr, signal) {
  signal?.throwIfAborted();
  const token = signSession(user);
  const res = await fetch(`${BASE}/api/today/hours`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `decode_auth=${token}` },
    body: JSON.stringify({ date: dateStr, profileId }),
    signal,
  });
  signal?.throwIfAborted();
  if (!res.ok) return null;
  try {
    const data = await res.json();
    signal?.throwIfAborted();
    return data;
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}


/**
 * ── ทิศมงคลกับองค์เทพประจำยาม จากผังฉีเหมินจริง (31 ก.ค. 69) ──
 *
 * เจ้าของสั่งเอง: "เพิ่มชื่อเทพไปหน่อยสิ ว่าฤกษ์นี้เทพอะไร รองรับทุกภาษานะ"
 *
 * 🔴 ก่อนหน้านี้ใบยามไม่มีฉีเหมินเลยสักบรรทัด
 * ข้อความคือ "เหมาะลงมือเรื่องสำคัญของคุณ" ซึ่งเป็นคำตายตัว
 * พูดกับทุกคนเหมือนกันหมดทุกใบ ไม่ได้มาจากศาสตร์ใดเลย
 *
 * 🔴 ข้อจำกัดที่ต้องพูดตรง: ผังฉีเหมินของยามเป็นของ **ทุกคนเหมือนกัน**
 * ไม่ได้ผูกกับดวงผู้ใช้ ข้อความจึงห้ามเขียนให้เข้าใจว่าคำนวณจากดวงเขา
 *
 * ไม่มีผัง = ส่งใบแบบเดิม ไม่ใช่เดาทิศให้ — เพราะผู้ใช้จะหันหน้าไปจริง
 */
/**
 * ขอผังฉีเหมิน canonical สำหรับจุดตัวอย่างในช่วงที่กำลังจะมาถึง
 * แล้วให้ advisory layer ตัดสินจากประตู–ดาว–เทพ–旺衰–格局ร่วมกัน
 *
 * @returns {Promise<null | object>}
 */
async function fetchQimenHighlight(user, dateStr, startTime, lat, lng, timezone, instant, signal) {
  try {
    signal?.throwIfAborted();
    return await qimenAdvisory.fetchCanonicalQimenAdvisory({
      date: dateStr, time: startTime, lat, lng, timezone, instant: instant.toISOString(),
    }, {
      signal,
    });
  } catch (error) {
    signal?.throwIfAborted();
    // ห้ามเงียบ — ผังหายแล้วไม่มีใครรู้ว่าเพราะอะไร
    console.error("[mobile-yam-push] ขอผังฉีเหมินไม่สำเร็จ category=yam error_code=qimen_fetch_failed");
    return null;
  }
}

/** ท่อนทิศ+องค์เทพ 3 ภาษา — ต่อท้ายเนื้อใบ */
function qimenLine(highlight, locale) {
  return qimenAdvisory.buildQimenYamLine(highlight, locale);
}

function buildYamCopy(upcoming, branch, highlight, locale) {
  const raw = String(locale || "th").toLowerCase();
  const loc = raw === "th" ? "th" : raw === "zh" || raw === "cn" || raw.startsWith("zh-") ? "zh" : "en";
  const range = String(upcoming?.range || "");
  const best = upcoming?.quality === "best";
  if (loc === "zh") return {
    title: `🔔 ${best ? "最佳吉時" : "吉時"}即將開始`,
    body: `${range} ${branch ? `(${branch}) ` : ""}適合處理重要事項 · 開啟今日運勢查看完整時段${qimenLine(highlight, loc)}`,
  };
  if (loc === "en") return {
    title: `🔔 ${best ? "Best hour" : "Good hour"} starts soon`,
    body: `${range} ${branch ? `(${branch}) ` : ""}is suitable for important action · Open Today to review the full window${qimenLine(highlight, loc)}`,
  };
  return {
    title: `🔔 ${best ? "ยามดีมาก" : "ยามดี"}กำลังมาถึง`,
    body: `${range} ${branch ? `(${branch}) ` : ""}เหมาะลงมือเรื่องสำคัญ · เปิดดวงวันนี้เพื่อดูช่วงเวลาเต็ม${qimenLine(highlight, loc)}`,
  };
}

const guard = require("../src/lib/push-guard.cjs");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const science = require("../src/lib/notification-science.cjs");
const notificationPayload = require("../src/lib/notification-payload.cjs");
const schedulerHeartbeat = require("../src/lib/notification-scheduler-heartbeat.cjs");

function buildYamProducer(user, input) {
  const hours = Array.isArray(input?.hoursApi?.hours) ? input.hoursApi.hours : [];
  const nowMinutes = Number(input?.nowMinutes);
  const leadMinutes = [15, 30, 60].includes(Number(user?.yam_lead_minutes)) ? Number(user.yam_lead_minutes) : 60;
  const minQuality = user?.yam_min_quality === "good" ? "good" : "best";
  const upcoming = input?.upcoming || hours.find((hour) => {
    const quality = String(hour?.quality || "");
    if (quality !== "best" && !(minQuality === "good" && quality === "good")) return false;
    const match = /^(\d{2}):(\d{2})-/u.exec(String(hour?.range || ""));
    if (!match || !Number.isFinite(nowMinutes)) return false;
    const diff = Number(match[1]) * 60 + Number(match[2]) - nowMinutes;
    return diff >= 0 && diff <= leadMinutes;
  });
  if (!upcoming || !user?.id || !user?.profile_id) return null;
  const date = String(input?.date || "");
  const branch = String(upcoming.branch || "");
  const highlight = input?.highlight || null;
  let yamWindow;
  try {
    yamWindow = qimenAdvisory.civilRangeWindow(date, String(upcoming.range || ""), user.user_timezone);
  } catch {
    return null;
  }
  const eventEndAt = qimenAdvisory.earliestExpiry(yamWindow.endAt, highlight?.validUntil);
  const build = (locale) => buildYamCopy(upcoming, branch, highlight, locale);
  const historyCopies = delivery.localizedHistoryCopies(build);
  const payload = notificationPayload.buildNotificationPayload("yam", String(user.id), {
    range: String(upcoming.range || ""), quality: String(upcoming.quality || ""), date, url: "/today",
  });
  return {
    userId: user.id,
    key: `${date}|${String(upcoming.range || "")}|${user.profile_id}`,
    kind: "yam",
    ...historyCopies.th,
    historyCopies,
    payload,
    sourceFacts: {
      eventStartAt: yamWindow.startAt,
      eventEndAt,
      profileId: user.profile_id,
      timezone: user.user_timezone,
      branch,
      qimen: highlight ? qimenAdvisory.qimenSourceFacts(highlight).qimen : null,
    },
    messages: (user.tokens || []).map((entry) => {
      const raw = entry && typeof entry === "object" ? entry : { device: entry, locale: "th" };
      const locale = notificationPayload.normalizedLocale(raw.locale);
      return {
        tokenId: raw.id, deviceToken: raw.device, deviceTokenType: raw.deviceType,
        expoToken: raw.expo, platform: raw.platform, category: "yam", locale,
        ...build(locale), url: "/today", data: payload,
      };
    }),
  };
}

function qimenSampleTime(range) {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/u.exec(String(range || ""));
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  let end = Number(match[3]) * 60 + Number(match[4]);
  if (end <= start) end += 24 * 60;
  const midpoint = Math.floor((start + end) / 2) % (24 * 60);
  return `${String(Math.floor(midpoint / 60)).padStart(2, "0")}:${String(midpoint % 60).padStart(2, "0")}`;
}

const YAM_USERS_SQL = `
    SELECT u.id, u.email, u.current_org_id, u.session_version,
           array_agg(json_build_object(
             'id', t.id, 'device', t.device_push_token, 'deviceType', t.device_token_type,
             'expo', t.expo_push_token, 'platform', t.platform,
             'locale', COALESCE(t.locale,'th')
           )) AS tokens,
           (SELECT p.id FROM profiles p WHERE p.created_by_user_id = u.id
             AND p.org_id = u.current_org_id
             AND COALESCE(p.is_archived,false)=false
             ORDER BY (p.relationship_type IS NULL OR btrim(p.relationship_type::text)='') DESC, p.created_at ASC LIMIT 1) AS profile_id,
           np.yam_enabled, np.auspicious_enabled, np.daily_enabled,
           np.qimen_enabled, np.shrine_enabled, np.goal_enabled, np.saved_date_enabled,
           np.yam_min_quality, np.yam_lead_minutes,
           CASE WHEN np.qimen_enabled=true THEN np.qimen_latitude END AS qimen_latitude,
           CASE WHEN np.qimen_enabled=true THEN np.qimen_longitude END AS qimen_longitude,
           CASE WHEN np.qimen_enabled=true THEN np.qimen_location_updated_at END AS qimen_location_updated_at,
           np.quiet_start, np.quiet_end, np.max_per_day, np.paused_until,
           COALESCE(np.timezone, u.timezone) AS user_timezone,
           (np.user_id IS NOT NULL) AS has_prefs,
           (SELECT count(*) FROM mobile_push_log l
             WHERE l.user_id=u.id AND l.delivery_status IN ('accepted','delivered')
               AND (COALESCE(l.sent_at,l.accepted_at,l.updated_at) AT TIME ZONE COALESCE(np.timezone,u.timezone,'Asia/Bangkok'))::date
                   = (now() AT TIME ZONE COALESCE(np.timezone,u.timezone,'Asia/Bangkok'))::date) AS sent_today
      FROM mobile_push_tokens t JOIN users u ON u.id = t.user_id
      LEFT JOIN mobile_notification_prefs np ON np.user_id = u.id
     WHERE t.enabled = true AND u.deleted_at IS NULL
     GROUP BY u.id, np.user_id, np.yam_enabled, np.auspicious_enabled,
              np.daily_enabled, np.qimen_enabled, np.shrine_enabled, np.goal_enabled,
              np.saved_date_enabled, np.yam_min_quality, np.yam_lead_minutes,
              np.qimen_latitude, np.qimen_longitude, np.qimen_location_updated_at,
              np.quiet_start, np.quiet_end, np.max_per_day, np.paused_until, np.timezone, u.timezone`;

async function loadYamUsers(db) {
  const result = await db.query(YAM_USERS_SQL);
  return result.rows;
}

async function runScheduler(db, schedulerSignal) {
  schedulerSignal.throwIfAborted();
  const users = await loadYamUsers(db);
  schedulerSignal.throwIfAborted();
  console.log(`[mobile-yam-push] ${new Date().toISOString()} users=${users.length} dry=${DRY}`);

  /**
   * 🔴 ห้ามคิดวันที่/เวลาให้ทุกคนจากเวลาไทย (แก้ 30 ก.ค. 69)
   * เดิม `new Date(Date.now() + 7 * 3600_000)` แล้วใช้ค่านั้นกับทุกคน
   * คนอยู่คนละเขตเวลาจะได้ยามของวันผิด ไม่ใช่แค่เวลาผิด
   * ตอนนี้คิดใหม่ทีละคนในลูป ตามเขตเวลาของเจ้าตัว
   */
  const runAt = new Date();
  let sent = 0, failed = 0, skipped = 0;

  for (const u of users) {
    schedulerSignal.throwIfAborted();
    try {
      if (!u.profile_id) { skipped++; continue; }

      /**
       * 🔴 ทุกใบต้องผ่านตัวคุมกลาง (30 ก.ค. 69)
       *
       * เดิมตัวยิงนี้เขียนเงื่อนไขเอง `COALESCE(p.yam_enabled, true)`
       * = คนที่ไม่เคยตั้งค่าถือว่าเปิด → ได้รับโดยไม่เคยกดยินยอม
       * และไม่มีช่วงห้ามรบกวนเลย → วิ่งทุก 30 นาทีตลอด 24 ชั่วโมง
       * ยิงตอนตีสามได้สบายๆ
       *
       * ตัวคุมกลางบังคับครบ: ยินยอม · ช่วงห้ามรบกวนตามเขตเวลาผู้ใช้ · เพดานต่อวัน
       */
      const verdict = guard.mayNotify({
        category: "yam",
        prefs: u.has_prefs ? u : null,
        timezone: u.user_timezone,
        sentToday: Number(u.sent_today || 0),
      });
      if (!verdict.allow) {
        skipped++;
        if (DRY) console.log(`[mobile-yam-push] category=yam dry_skip=1 error_code=${verdict.reason}`);
        continue;
      }
      // วันที่และนาทีตามปฏิทินของผู้ใช้คนนี้ ไม่ใช่ของเครื่องแม่ข่าย
      const dateStr = guard.localDateStr(u.user_timezone, runAt);
      let nowMin = guard.localMinutes(u.user_timezone, runAt);
      if (DRY && /^\d{2}:\d{2}$/.test(FORCE_TIME)) {
        nowMin = Number(FORCE_TIME.slice(0, 2)) * 60 + Number(FORCE_TIME.slice(3, 5));
        console.log(`[DRY] แกล้งทำเป็นเวลา ${FORCE_TIME} น.`);
      }
      if (nowMin === null) { skipped++; continue; }

      const data = await fetchHours(u, u.profile_id, dateStr, schedulerSignal);
      const hours = data && Array.isArray(data.hours) ? data.hours : [];
      const leadMin = [15, 30, 60].includes(Number(u.yam_lead_minutes)) ? Number(u.yam_lead_minutes) : 60;
      const minQuality = u.yam_min_quality === "good" ? "good" : "best";
      // ผู้ใช้เลือกได้ว่าจะรับเฉพาะ best หรือรับ good ด้วย และเตือนล่วงหน้าเท่าไร
      const upcoming = hours.find((h) => {
        const q = String(h.quality || "");
        if (q !== "best" && !(minQuality === "good" && q === "good")) return false;
        const m = /^(\d{2}):(\d{2})-/.exec(String(h.range || ""));
        if (!m) return false;
        const startMin = Number(m[1]) * 60 + Number(m[2]);
        const diff = startMin - nowMin;
        return diff >= 0 && diff <= leadMin;
      });
      if (!upcoming) { skipped++; continue; }
      // Today Hours เป็นช่วงนาฬิกา แต่ Qimen ใช้เวลาสุริยะจริง จึงสุ่มที่
      // กึ่งกลางช่วงและแสดงขอบเขต Qimen จริงแยกในข้อความ ห้ามครอบทั้งยาม
      const sampleTime = qimenSampleTime(upcoming.range);
      const highlight = sampleTime === null ? null : await science.yamQimenHighlight({
        qimenEnabled: u.qimen_enabled === true,
        location: u.qimen_enabled === true ? {
          fresh: Boolean(u.qimen_location_updated_at)
            && runAt.getTime() - new Date(u.qimen_location_updated_at).getTime() <= 30 * 86_400_000,
          latitude: u.qimen_latitude,
          longitude: u.qimen_longitude,
        } : null,
        fetchHighlight: (lat, lng) => fetchQimenHighlight(
          u, dateStr, sampleTime, lat, lng, u.user_timezone || guard.FALLBACK_TZ, runAt, schedulerSignal,
        ),
      });

      const notice = buildYamProducer(u, {
        date: dateStr, nowMinutes: nowMin, hoursApi: data, upcoming, highlight,
      });
      if (!notice) { skipped++; continue; }
      const result = await delivery.deliver(db, notice, { dry: DRY });
      if (result.status === "accepted" || result.status === "dry") sent++;
      else if (result.status === "failed") failed++;
      else skipped++;
      if (DRY) console.log(`[mobile-yam-push] category=yam dry_candidate=1 qimen=${highlight !== null}`);
      schedulerSignal.throwIfAborted();
    } catch (e) {
      schedulerSignal.throwIfAborted();
      console.error("[mobile-yam-push] category=yam error_code=user_failed");
    }
  }

  console.log(`[mobile-yam-push] ${DRY ? "DRY " : ""}accepted=${sent} failed=${failed} skipped=${skipped}`);
  return { sent, failed, skipped };
}

async function main() {
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();
  try {
    const outcome = await delivery.withSchedulerRunLease(db, "yam", (signal) => runScheduler(db, signal), { timeoutMs: 12_000 });
    if (!outcome.acquired) console.log("[mobile-yam-push] overlap skipped");
    else await schedulerHeartbeat.writeSchedulerHeartbeat("yam");
  } finally {
    await db.end();
  }
}

module.exports = { YAM_USERS_SQL,buildYamCopy,buildYamProducer,fetchHours,fetchQimenHighlight,loadYamUsers,main,qimenLine,qimenSampleTime,runScheduler };

if (require.main === module) main().catch(() => { console.error("[mobile-yam-push] category=yam error_code=scheduler_failed"); process.exit(1); });
