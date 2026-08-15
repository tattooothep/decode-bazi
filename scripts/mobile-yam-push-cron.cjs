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

async function fetchHours(user, profileId, dateStr) {
  const token = signSession(user);
  const res = await fetch(`${BASE}/api/today/hours`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `decode_auth=${token}` },
    body: JSON.stringify({ date: dateStr, profileId }),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
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
const QIMEN_DIRECTION_NAMES = {
  N:  { th: "เหนือ", en: "north", zh: "北方" },
  NE: { th: "ตะวันออกเฉียงเหนือ", en: "northeast", zh: "東北方" },
  E:  { th: "ตะวันออก", en: "east", zh: "東方" },
  SE: { th: "ตะวันออกเฉียงใต้", en: "southeast", zh: "東南方" },
  S:  { th: "ใต้", en: "south", zh: "南方" },
  SW: { th: "ตะวันตกเฉียงใต้", en: "southwest", zh: "西南方" },
  W:  { th: "ตะวันตก", en: "west", zh: "西方" },
  NW: { th: "ตะวันตกเฉียงเหนือ", en: "northwest", zh: "西北方" },
};

/**
 * ขอผังฉีเหมินของยามที่กำลังจะมาถึง แล้วเลือกกังที่ดีที่สุด
 *
 * @returns {Promise<null | {direction: object, deity: object, advice: object}>}
 */
async function fetchQimenHighlight(user, dateStr, startTime, lat, lng) {
  try {
    const token = signSession(user);
    const res = await fetch(`${BASE}/api/qimen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `decode_auth=${token}` },
      body: JSON.stringify({ date: dateStr, time: startTime, lat, lng, school: "chaibu", system_type: "hour" }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const palaces = data && data.data && Array.isArray(data.data.palaces) ? data.data.palaces : null;
    if (!palaces || palaces.length === 0) return null;

    // เลือกกังที่คะแนนสูงสุด และต้องเป็นทิศจริง ไม่ใช่กังกลาง
    let best = null;
    for (const p of palaces) {
      const code = String(p.direction || "").toUpperCase();
      if (!QIMEN_DIRECTION_NAMES[code]) continue;          // ตัดกังกลางออก
      const score = Number(p.display_score);
      if (!Number.isFinite(score)) continue;
      if (best === null || score > best.score) best = { row: p, score, code };
    }
    /**
     * 🔴 เกณฑ์คะแนน — ตั้งไว้ 70 ตอนแรกแล้วไม่มีทิศไหนผ่านเลยสักยาม
     * ตรวจของจริง 3 ยามพบคะแนนสูงสุดอยู่ที่ 57-67 เท่านั้น
     *
     * มาตรวัดของระบบ (src/app/api/today/route.ts): L1≥80 · L2≥65 · L3≥50 · L4≥35
     * เอา 50 ขึ้นไป (L3 ขึ้นไป) = ทิศที่ใช้ได้จริง ไม่ใช่ทิศที่ตำราว่าร้าย
     *
     * และเราพูดว่า "ทิศที่ดีที่สุดของยามนี้" ซึ่งเป็นการเทียบกันเองใน 8 ทิศ
     * ไม่ได้พูดว่า "ทิศมงคล" ลอยๆ จึงไม่เกินสิ่งที่ผังบอกจริง
     */
    if (best === null || best.score < 50) return null;

    const row = best.row;
    const deity = {
      th: String(row.deity_name_th || "").trim(),
      en: String(row.deity_name_en || "").trim(),
      zh: String(row.deity_zh || row.deity_name_zh || "").trim(),
    };
    if (deity.th === "" && deity.en === "" && deity.zh === "") return null;

    return {
      direction: QIMEN_DIRECTION_NAMES[best.code],
      deity,
      advice: {
        th: String(row.door_action_advice_th || "").trim(),
        en: String(row.door_action_advice_en || "").trim(),
        zh: String(row.door_action_advice_zh || "").trim(),
      },
      score: best.score,
    };
  } catch (error) {
    // ห้ามเงียบ — ผังหายแล้วไม่มีใครรู้ว่าเพราะอะไร
    console.error("[mobile-yam-push] ขอผังฉีเหมินไม่สำเร็จ", String(error && error.message ? error.message : error));
    return null;
  }
}

/** ท่อนทิศ+องค์เทพ 3 ภาษา — ต่อท้ายเนื้อใบ */
function qimenLine(highlight, locale) {
  if (highlight === null) return "";
  const dir = highlight.direction[locale] || highlight.direction.th;
  const deity = highlight.deity[locale] || highlight.deity.th || highlight.deity.zh;
  const advice = highlight.advice[locale] || "";
  if (locale === "zh") {
    return `\n🧭 此時最吉方：${dir}（${deity}值位）${advice ? ` · ${advice}` : ""}`;
  }
  if (locale === "en") {
    return `\n🧭 Best direction this hour: ${dir} — ${deity} presides${advice ? ` · ${advice}` : ""}`;
  }
  return `\n🧭 ทิศดีสุดของยามนี้: ${dir} — องค์${deity}ประจำทิศ${advice ? ` · ${advice}` : ""}`;
}

const guard = require("../src/lib/push-guard.cjs");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");

async function main() {
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();
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
           (SELECT p.birth_lat FROM profiles p WHERE p.created_by_user_id = u.id
             AND COALESCE(p.is_archived,false)=false ORDER BY p.created_at ASC LIMIT 1) AS lat,
           (SELECT p.birth_lng FROM profiles p WHERE p.created_by_user_id = u.id
             AND COALESCE(p.is_archived,false)=false ORDER BY p.created_at ASC LIMIT 1) AS lng,
           np.yam_enabled, np.auspicious_enabled, np.daily_enabled,
           np.qimen_enabled, np.shrine_enabled, np.goal_enabled, np.saved_date_enabled,
           np.yam_min_quality, np.yam_lead_minutes,
           np.qimen_latitude, np.qimen_longitude, np.qimen_location_updated_at,
           np.quiet_start, np.quiet_end, np.max_per_day, np.paused_until,
           COALESCE(np.timezone, u.timezone) AS user_timezone,
           (np.user_id IS NOT NULL) AS has_prefs,
           (SELECT count(*) FROM mobile_push_log l
             WHERE l.user_id = u.id AND l.delivery_status IN ('accepted','delivered')
               AND l.sent_at >= now() - interval '24 hours') AS sent_today
      FROM mobile_push_tokens t JOIN users u ON u.id = t.user_id
      LEFT JOIN mobile_notification_prefs np ON np.user_id = u.id
     WHERE t.enabled = true AND u.deleted_at IS NULL
     GROUP BY u.id, np.user_id, np.yam_enabled, np.auspicious_enabled,
              np.daily_enabled, np.qimen_enabled, np.shrine_enabled, np.goal_enabled,
              np.saved_date_enabled, np.yam_min_quality, np.yam_lead_minutes,
              np.qimen_latitude, np.qimen_longitude, np.qimen_location_updated_at,
              np.quiet_start, np.quiet_end, np.max_per_day, np.paused_until, np.timezone, u.timezone`);
  console.log(`[mobile-yam-push] ${new Date().toISOString()} users=${users.length} dry=${DRY}`);

  /**
   * 🔴 ห้ามคิดวันที่/เวลาให้ทุกคนจากเวลาไทย (แก้ 30 ก.ค. 69)
   * เดิม `new Date(Date.now() + 7 * 3600_000)` แล้วใช้ค่านั้นกับทุกคน
   * คนอยู่คนละเขตเวลาจะได้ยามของวันผิด ไม่ใช่แค่เวลาผิด
   * ตอนนี้คิดใหม่ทีละคนในลูป ตามเขตเวลาของเจ้าตัว
   */
  const runAt = new Date();
  const QUAL_WORD = { best: "ยามดีมาก", good: "ยามดี" };
  let sent = 0, failed = 0, skipped = 0;

  for (const u of users) {
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
        if (DRY) console.log(`[DRY] ข้าม ${u.email}: ${verdict.reason}`);
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

      const data = await fetchHours(u, u.profile_id, dateStr);
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
      const yamKey = `${dateStr}|${String(upcoming.range || "")}|${u.profile_id}`;
      const word = QUAL_WORD[String(upcoming.quality)] || "ยามดี";
      const zhi = String(upcoming.branch || "");
      /**
       * ทิศมงคลกับองค์เทพประจำยามนี้ — ขอผังของ **เวลาที่ยามเริ่ม** ไม่ใช่เวลาปัจจุบัน
       * เพราะผังฉีเหมินเปลี่ยนทุกสองชั่วโมงตามยาม ถ้าใช้เวลาตอนยิงจะได้ผังของยามก่อนหน้า
       */
      const startTime = (/^(\d{2}:\d{2})/.exec(String(upcoming.range || "")) || [])[1] || null;
      const locationFresh = u.qimen_location_updated_at
        && Date.now() - new Date(u.qimen_location_updated_at).getTime() <= 30 * 86_400_000;
      const highlight = startTime === null || !locationFresh
        || !Number.isFinite(Number(u.qimen_latitude)) || !Number.isFinite(Number(u.qimen_longitude))
        ? null
        : await fetchQimenHighlight(
            u,
            dateStr,
            startTime,
            Number(u.qimen_latitude),
            Number(u.qimen_longitude),
          );

      const baseBody = `${String(upcoming.range || "")} ${zhi ? `(${zhi}) ` : ""}เหมาะลงมือเรื่องสำคัญของคุณ`;
      const body = baseBody + qimenLine(highlight, "th");
      const title = `🔔 ${word}กำลังมาถึง`;
      const userMessages = [];
      for (const entry of u.tokens || []) {
        const raw = entry && typeof entry === "object" ? entry : { device: entry, locale: "th" };
        const localeValue = String(raw.locale || "th").toLowerCase();
        const loc = localeValue === "th"
          ? "th"
          : localeValue === "zh" || localeValue === "cn" || localeValue.startsWith("zh-")
            ? "zh"
            : "en";
        const localizedTitle = loc === "zh"
          ? `🔔 ${upcoming.quality === "best" ? "最佳吉時" : "吉時"}即將開始`
          : loc === "en"
            ? `🔔 ${upcoming.quality === "best" ? "Best hour" : "Good hour"} starts soon`
            : title;
        const localizedBase = loc === "zh"
          ? `${String(upcoming.range || "")} ${zhi ? `(${zhi}) ` : ""}適合處理重要事項`
          : loc === "en"
            ? `${String(upcoming.range || "")} ${zhi ? `(${zhi}) ` : ""}is suitable for important action`
            : baseBody;
        userMessages.push({
          tokenId: raw.id,
          deviceToken: raw.device,
          deviceTokenType: raw.deviceType,
          expoToken: raw.expo,
          platform: raw.platform,
          category: "yam",
          title: localizedTitle,
          body: localizedBase + qimenLine(highlight, loc),
          url: "/today",
          data: { url: "/today", yam: yamKey },
        });
      }
      const result = await delivery.deliver(db, {
        userId: u.id,
        key: yamKey,
        kind: "yam",
        title,
        body,
        payload: { url: "/today", range: String(upcoming.range || ""), quality: String(upcoming.quality || "") },
        messages: userMessages,
      }, { dry: DRY });
      if (result.status === "accepted" || result.status === "dry") sent++;
      else if (result.status === "failed") failed++;
      else skipped++;
      if (DRY) {
        console.log(`[DRY] ${u.email} → ${word} ${body}`);
        if (highlight === null) console.log("       (ไม่มีทิศมงคลพอในยามนี้ จึงไม่บอกทิศ)");
        else console.log(`       ทิศ ${highlight.direction.th} · องค์ ${highlight.deity.th} · คะแนน ${highlight.score}`);
      }
    } catch (e) { console.error(`[mobile-yam-push] user=${u.id}`, e.message); }
  }

  console.log(`[mobile-yam-push] ${DRY ? "DRY " : ""}accepted=${sent} failed=${failed} skipped=${skipped}`);
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
