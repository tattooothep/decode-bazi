#!/usr/bin/env node
/**
 * ยิงแจ้งเตือนทดสอบเข้าเครื่องจริง — ส่งตรงถึงกูเกิล ไม่ผ่านคนกลาง
 *
 * ── ทำไมต้องมี ─────────────────────────────────────────────
 * 30 ก.ค. เจ้าของแจ้งว่าแอพไม่เคยส่งแจ้งเตือนเลย
 * ตรวจฐานข้อมูลพบผู้สมัครรับ 0 คน · ส่งไปแล้ว 0 ครั้ง
 * ตัวนี้ใช้พิสูจน์ว่าเส้นทั้งเส้นทำงานจริง ไม่ใช่แค่คิดว่าทำงาน
 *
 * รัน: node scripts/send-test-push.mjs [อีเมล]
 */

import { createSign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const KEY_PATH = process.env.FCM_SERVICE_ACCOUNT_PATH
  ?? "/root/secrets/hourkey-fcm-service-account.json";

function query(sql) {
  const out = execFileSync("docker", [
    "exec", "decode-postgres",
    "psql", "-U", "decode_user", "decode_db", "-tAF|", "-c", sql,
  ], { encoding: "utf8" });
  return out.trim().split("\n").filter((line) => line.length > 0);
}

async function getTicket(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(JSON.stringify({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: key.token_uri,
    exp: now + 3600,
    iat: now,
  })).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(key.private_key).toString("base64url");
  const res = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`ขอตั๋วไม่สำเร็จ: ${JSON.stringify(data)}`);
  return data.access_token;
}

const email = process.argv[2] ?? null;
const where = email === null
  ? "t.enabled=true AND t.device_push_token IS NOT NULL"
  : `t.enabled=true AND t.device_push_token IS NOT NULL AND u.email='${email.replace(/'/g, "''")}'`;

const rows = query(
  `SELECT t.device_push_token, u.email FROM mobile_push_tokens t
     JOIN users u ON u.id = t.user_id
    WHERE ${where} ORDER BY t.last_registered_at DESC LIMIT 20`,
);

if (rows.length === 0) {
  console.log("ยังไม่มีเครื่องไหนลงทะเบียนกุญแจแบบส่งตรง");
  const anyToken = query("SELECT count(*) FROM mobile_push_tokens")[0] ?? "0";
  console.log(`(ในตารางมีทั้งหมด ${anyToken} รายการ)`);
  console.log("ให้ลงแอพรุ่นใหม่แล้วล็อกอิน ระบบจะขอสิทธิ์และลงทะเบียนให้เอง");
  process.exit(1);
}

const key = JSON.parse(readFileSync(KEY_PATH, "utf8"));
const ticket = await getTicket(key);
const endpoint = `https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`;

let sent = 0;
for (const line of rows) {
  const [deviceToken, who] = line.split("|");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${ticket}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: {
          title: "ทดสอบระบบแจ้งเตือน",
          body: "ถ้าเห็นข้อความนี้ แปลว่าเส้นแจ้งเตือนทำงานครบทั้งเส้นแล้ว",
        },
        android: { priority: "HIGH", notification: { sound: "default", channel_id: "default" } },
      },
    }),
  });
  if (res.ok) {
    sent += 1;
    console.log(`  ${who} → ส่งสำเร็จ`);
  } else {
    console.log(`  ${who} → ล้ม ${res.status} · ${(await res.text()).slice(0, 160)}`);
  }
}
console.log(`\nส่งสำเร็จ ${sent} จาก ${rows.length} เครื่อง`);
