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
  if (SLOT !== "morning" && SLOT !== "evening") throw new Error(`bad slot ${SLOT}`);
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();
  const { rows: users } = await db.query(`
    SELECT u.id, u.email, u.current_org_id, u.session_version,
           array_agg(json_build_object('token', t.expo_push_token, 'locale', COALESCE(t.locale,'th'))) AS tokens,
           (SELECT p.id FROM profiles p WHERE p.created_by_user_id = u.id
             AND COALESCE(p.is_archived,false)=false
             ORDER BY (p.relationship_type IS NULL OR btrim(p.relationship_type::text)='') DESC, p.created_at ASC LIMIT 1) AS profile_id
      FROM mobile_push_tokens t JOIN users u ON u.id = t.user_id
      LEFT JOIN mobile_notification_prefs p ON p.user_id = u.id
     WHERE t.enabled = true AND u.deleted_at IS NULL
       AND COALESCE(p.daily_enabled, true) = true
     GROUP BY u.id`);
  console.log(`[mobile-daily-push] ${new Date().toISOString()} slot=${SLOT} users=${users.length} dry=${DRY}`);

  // ค่ำ = ดวงพรุ่งนี้ (วันไทย +1) · เช้า = ดวงวันนี้
  const thaiNow = new Date(Date.now() + 7 * 3600_000);
  const dateStr = new Date(thaiNow.getTime() + (SLOT === "evening" ? 86_400_000 : 0)).toISOString().slice(0, 10);
  const thaiDate = `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;

  let sent = 0, skipped = 0;
  const messages = [];
  for (const u of users) {
    try {
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
        messages.push({ to: entry.token, sound: "default", title: m.title, body: m.body, data: { url: "hourkey://today", daily: yamKey } });
      }
      sent++;
      if (DRY) console.log(`[DRY] ${u.email} → ${thMsg.title} | ${thMsg.body}`);
    } catch (e) { console.error(`[mobile-daily-push] user=${u.id}`, e.message); }
  }

  if (!DRY) {
    const r = await sendExpo(messages);
    console.log(`[mobile-daily-push] slot=${SLOT} users_notified=${sent} skipped=${skipped} expo_ok=${r.ok} expo_fail=${r.fail}`);
  } else {
    console.log(`[mobile-daily-push] DRY slot=${SLOT} users_would_notify=${sent} skipped=${skipped} msgs=${messages.length}`);
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
