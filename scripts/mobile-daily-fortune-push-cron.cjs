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

async function getJson(user, url) {
  const token = signSession(user);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Cookie: `decode_auth=${token}` } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
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
  if (SLOT !== "morning" && SLOT !== "evening") throw new Error(`bad slot ${SLOT}`);
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();
  const { rows: users } = await db.query(`
    SELECT u.id, u.email, u.current_org_id, u.session_version,
           array_agg(json_build_object('token', t.device_push_token, 'locale', COALESCE(t.locale,'th'))) AS tokens,
           (SELECT p.id FROM profiles p WHERE p.created_by_user_id = u.id
             AND COALESCE(p.is_archived,false)=false
             ORDER BY (p.relationship_type IS NULL OR btrim(p.relationship_type::text)='') DESC, p.created_at ASC LIMIT 1) AS profile_id,
           np2.yam_enabled, np2.auspicious_enabled, np2.daily_enabled,
           np2.quiet_start, np2.quiet_end, np2.max_per_day,
           COALESCE(np2.timezone, u.timezone) AS user_timezone,
           (np2.user_id IS NOT NULL) AS has_prefs,
           (SELECT count(*) FROM mobile_push_log l
             WHERE l.user_id = u.id AND l.sent_at >= now() - interval '24 hours') AS sent_today
      FROM mobile_push_tokens t JOIN users u ON u.id = t.user_id
      LEFT JOIN mobile_notification_prefs np2 ON np2.user_id = u.id
      LEFT JOIN mobile_notification_prefs p ON p.user_id = u.id
     WHERE t.enabled = true AND u.deleted_at IS NULL
     GROUP BY u.id, np2.user_id, np2.yam_enabled, np2.auspicious_enabled,
              np2.daily_enabled, np2.quiet_start, np2.quiet_end,
              np2.max_per_day, np2.timezone, u.timezone`);
  console.log(`[mobile-daily-push] ${new Date().toISOString()} slot=${SLOT} users=${users.length} dry=${DRY}`);

  // ค่ำ = ดวงพรุ่งนี้ (วันไทย +1) · เช้า = ดวงวันนี้
  const thaiNow = new Date(Date.now() + 7 * 3600_000);
  const dateStr = new Date(thaiNow.getTime() + (SLOT === "evening" ? 86_400_000 : 0)).toISOString().slice(0, 10);
  const thaiDate = `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;

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
      const guardVerdict = guard.mayNotify({
        category: "daily",
        prefs: u.has_prefs ? u : null,
        timezone: u.user_timezone,
        sentToday: Number(u.sent_today || 0),
      });
      if (!guardVerdict.allow) {
        skipped++;
        if (DRY) console.log(`[DRY] ข้าม ${u.email}: ${guardVerdict.reason}`);
        continue;
      }
      if (!u.profile_id) { skipped++; continue; }
      const today = await getJson(u, `${BASE}/api/mobile/v1/today?date=${dateStr}&profileId=${u.profile_id}`);
      if (!today || today.ok === false) { skipped++; continue; }
      // ฟิลด์จริงจาก engine เท่านั้น — ไม่มี = ไม่พูดถึง (ห้ามปั้น) · ฟันธงรายวันอยู่ใต้ verdict
      const verdict = today.verdict && typeof today.verdict === "object" ? today.verdict : {};
      const score = Number.isFinite(Number(verdict.score)) ? Number(verdict.score) : null;
      const label = typeof verdict.label === "string" && verdict.label ? verdict.label : "";
      const yi = today.tongshu && Array.isArray(today.tongshu.yi) ? today.tongshu.yi.slice(0, 2) : [];
      const token = signSession(u);
      const hoursRes = await fetch(`${BASE}/api/today/hours`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `decode_auth=${token}` },
        body: JSON.stringify({ date: dateStr, profileId: u.profile_id }),
      }).catch(() => null);
      const hoursData = hoursRes && hoursRes.ok ? await hoursRes.json().catch(() => null) : null;
      const hours = hoursData && Array.isArray(hoursData.hours) ? hoursData.hours : [];
      // เช้า = เอาเฉพาะยามที่ยังไม่ผ่าน (แจ้ง 07:00 แล้วชี้ยามตี 1 = ไร้ประโยชน์) · ค่ำชี้พรุ่งนี้ทั้งวัน
      const nowMin = SLOT === "morning" ? thaiNow.getUTCHours() * 60 + thaiNow.getUTCMinutes() : -1;
      const usable = hours.filter((h) => {
        const m = /^(\d{2}):(\d{2})-/.exec(String(h.range || ""));
        return m ? Number(m[1]) * 60 + Number(m[2]) >= nowMin : false;
      });
      const golden = usable.find((h) => String(h.quality || "") === "best") || usable.find((h) => String(h.quality || "") === "good");

      // เนื้อหา 3 ภาษาตาม locale ของเครื่อง (กฎ zh ห้ามไทยปน) — yi จาก engine ใส่เฉพาะ th
      // (yi อาจเป็นข้อความไทย → ห้ามหลุดเข้า en/zh)
      const build = (loc) => {
        const parts = [];
        if (loc === "zh") {
          if (score != null) parts.push(`日力 ${score}${label ? `（${label}）` : ""}`);
          if (golden && golden.range) parts.push(`黃金時 ${golden.range}`);
        } else if (loc === "en") {
          if (score != null) parts.push(`Day power ${score}${label ? ` (${label})` : ""}`);
          if (golden && golden.range) parts.push(`golden hour ${golden.range}`);
        } else {
          if (score != null) parts.push(`พลังวัน ${score}${label ? ` (${label})` : ""}`);
          if (yi.length) parts.push(`เหมาะ: ${yi.join(" · ")}`);
          if (golden && golden.range) parts.push(`ยามทอง ${golden.range}`);
        }
        const title = loc === "zh"
          ? (SLOT === "morning" ? `☀️ 今日運勢（${thaiDate}）` : `🌙 明日運勢（${thaiDate}）搶先規劃`)
          : loc === "en"
            ? (SLOT === "morning" ? `☀️ Your fortune today (${thaiDate})` : `🌙 Tomorrow's fortune (${thaiDate}) — plan ahead`)
            : (SLOT === "morning" ? `☀️ ดวงวันนี้ของคุณ (${thaiDate})` : `🌙 ดวงพรุ่งนี้ (${thaiDate}) — วางแผนก่อนใคร`);
        return { title, body: parts.join(" · ") };
      };
      const thMsg = build("th");
      if (!thMsg.body) { skipped++; continue; }

      const yamKey = `daily|${SLOT}|${dateStr}|${u.profile_id}`;
      const dup = await db.query(
        `INSERT INTO mobile_push_log (user_id, yam_key, kind, title, body, payload)
         VALUES ($1,$2,'daily',$3,$4,$5::jsonb)
         ON CONFLICT (user_id, yam_key) DO NOTHING RETURNING id`,
        [u.id, yamKey, thMsg.title, thMsg.body, JSON.stringify({ url: "hourkey://today", slot: SLOT, date: dateStr })]);
      if (!dup.rows.length) { skipped++; continue; }
      for (const tk of u.tokens || []) {
        const entry = typeof tk === "object" && tk ? tk : { token: tk, locale: "th" };
        const loc = entry.locale === "en" || entry.locale === "zh" ? entry.locale : "th";
        const m = build(loc);
        if (!m.body) continue;
        messages.push({ deviceToken: entry.token, title: m.title, body: m.body, url: "hourkey://today", data: { url: "hourkey://today", daily: yamKey } });
      }
      sent++;
      if (DRY) console.log(`[DRY] ${u.email} → ${thMsg.title} | ${thMsg.body}`);
    } catch (e) { console.error(`[mobile-daily-push] user=${u.id}`, e.message); }
  }

  if (!DRY) {
    const r = await sendExpo(messages, db);
    console.log(`[mobile-daily-push] slot=${SLOT} users_notified=${sent} skipped=${skipped} expo_ok=${r.ok} expo_fail=${r.fail}`);
  } else {
    console.log(`[mobile-daily-push] DRY slot=${SLOT} users_would_notify=${sent} skipped=${skipped} msgs=${messages.length}`);
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
