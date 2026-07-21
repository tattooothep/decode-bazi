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
const BASE = process.env.PUSH_INTERNAL_BASE || "http://127.0.0.1:3350";
const LEAD_MIN = 60;

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
    SELECT u.id, u.email, u.current_org_id, u.session_version,
           array_agg(t.expo_push_token) AS tokens,
           (SELECT p.id FROM profiles p WHERE p.created_by_user_id = u.id
             AND COALESCE(p.is_archived,false)=false
             ORDER BY (p.relationship_type IS NULL OR btrim(p.relationship_type::text)='') DESC, p.created_at ASC LIMIT 1) AS profile_id
      FROM mobile_push_tokens t JOIN users u ON u.id = t.user_id
      LEFT JOIN mobile_notification_prefs p ON p.user_id = u.id
     WHERE t.enabled = true AND u.deleted_at IS NULL
       AND COALESCE(p.yam_enabled, true) = true
     GROUP BY u.id`);
  console.log(`[mobile-yam-push] ${new Date().toISOString()} users=${users.length} dry=${DRY}`);

  const now = new Date(Date.now() + 7 * 3600_000); // เวลาไทย
  const dateStr = now.toISOString().slice(0, 10);
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const QUAL_WORD = { best: "ยามดีมาก", good: "ยามดี" };
  let sent = 0, skipped = 0;
  const messages = [];

  for (const u of users) {
    try {
      if (!u.profile_id) { skipped++; continue; }
      const data = await fetchHours(u, u.profile_id, dateStr);
      const hours = data && Array.isArray(data.hours) ? data.hours : [];
      // ยาม best/good ที่เริ่มภายใน LEAD_MIN นาทีข้างหน้า — field จริงคือ range "HH:MM-HH:MM"
      const upcoming = hours.find((h) => {
        const q = String(h.quality || "");
        if (q !== "best" && q !== "good") return false;
        const m = /^(\d{2}):(\d{2})-/.exec(String(h.range || ""));
        if (!m) return false;
        const startMin = Number(m[1]) * 60 + Number(m[2]);
        const diff = startMin - nowMin;
        return diff >= 0 && diff <= LEAD_MIN;
      });
      if (!upcoming) { skipped++; continue; }
      const yamKey = `${dateStr}|${String(upcoming.range || "")}|${u.profile_id}`;
      const word = QUAL_WORD[String(upcoming.quality)] || "ยามดี";
      const zhi = String(upcoming.branch || "");
      const body = `${String(upcoming.range || "")} ${zhi ? `(${zhi}) ` : ""}เหมาะลงมือเรื่องสำคัญของคุณ`;
      const title = `🔔 ${word}กำลังมาถึง`;
      // เก็บเนื้อหาไว้ให้ศูนย์แจ้งเตือนในแอพอ่านย้อนหลัง (kind=yam) — กันซ้ำด้วย unique(user_id,yam_key)
      const dup = await db.query(
        `INSERT INTO mobile_push_log (user_id, yam_key, kind, title, body, payload)
         VALUES ($1,$2,'yam',$3,$4,$5::jsonb)
         ON CONFLICT (user_id, yam_key) DO NOTHING RETURNING id`,
        [u.id, yamKey, title, body, JSON.stringify({ url: "hourkey://today", range: String(upcoming.range || ""), quality: String(upcoming.quality || "") })]);
      if (!dup.rows.length) { skipped++; continue; }
      for (const tk of u.tokens || []) {
        messages.push({ to: tk, sound: "default", title, body,
          data: { url: "hourkey://today", yam: yamKey } });
      }
      sent++;
      if (DRY) console.log(`[DRY] ${u.email} → ${word} ${body}`);
    } catch (e) { console.error(`[mobile-yam-push] user=${u.id}`, e.message); }
  }

  if (!DRY) {
    const r = await sendExpo(messages);
    console.log(`[mobile-yam-push] users_notified=${sent} skipped=${skipped} expo_ok=${r.ok} expo_fail=${r.fail}`);
  } else {
    console.log(`[mobile-yam-push] DRY users_would_notify=${sent} skipped=${skipped} msgs=${messages.length}`);
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
