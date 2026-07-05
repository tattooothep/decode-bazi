/**
 * scripts/test-payment.mjs · integration test ระบบชำระเงิน (r408 · 5 ก.ค. 2026)
 *
 * รันจริงครบวงจร: สตาร์ท next dev ชั่วคราว → hit endpoints จริง → ตรวจ DB
 * ครอบคลุมกฎเหล็กความปลอดภัย:
 *   1. create order = pending (ยังไม่เติม)
 *   2. mock-pay → เติมครั้งเดียว · idempotent (ยิงซ้ำ = ไม่เติมเพิ่ม)
 *   3. amount mismatch = reject (ไม่เติม · order failed)
 *   4. subscription เปิด tier + sub_expires_at ~365 วัน + แถมยาม
 *   5. Stripe webhook: verify signature (ผ่าน = fulfill · เสียลายเซ็น = 400) + idempotent
 *
 * ใช้:  node scripts/test-payment.mjs
 *   TEST_BASE=http://127.0.0.1:3399 node scripts/test-payment.mjs   # ใช้เซิร์ฟเวอร์ที่รันอยู่แล้ว
 */
import { Pool } from "pg";
import { SignJWT } from "jose";
import crypto from "crypto";
import fs from "fs";
import { spawn } from "child_process";

// ── load .env.local ──
const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const PORT = Number(process.env.TEST_PORT || 3399);
const WEBHOOK_SECRET = "whsec_test_payment_local"; // เฉพาะ test process (ไม่แตะ .env.local)
const EXTERNAL_BASE = process.env.TEST_BASE || null;
const BASE = EXTERNAL_BASE || `http://127.0.0.1:${PORT}`;

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.PGPASSWORD,
});

let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name} ${extra}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

async function makeCookie(userId, email) {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const jwt = await new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
  return `decode_auth=${jwt}`;
}

async function api(path, { method = "GET", cookie, body, rawBody, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h["Cookie"] = cookie;
  let payload;
  if (rawBody !== undefined) { payload = rawBody; }
  else if (body !== undefined) { h["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload });
  let json = null; try { json = await res.json(); } catch { /* noop */ }
  return { status: res.status, json };
}

async function waitReady(timeoutMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/payment/create`, { method: "GET" });
      if (r.status === 200) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function balance(userId) {
  const r = await pool.query(`SELECT hour_balance, tier, sub_expires_at FROM users WHERE id=$1`, [userId]);
  return r.rows[0];
}
async function txCount(userId, refPaymentId) {
  const r = await pool.query(`SELECT COUNT(*)::int c FROM hour_transactions WHERE user_id=$1 AND ref_payment_id=$2`, [userId, refPaymentId]);
  return r.rows[0].c;
}
async function orderStatus(orderId) {
  const r = await pool.query(`SELECT status FROM orders WHERE id=$1`, [orderId]);
  return r.rows[0]?.status;
}

async function run() {
  // ── test user ──
  const email = `test-payment-${Date.now()}@decode.local`;
  const uRow = await pool.query(
    `INSERT INTO users(id, email, name, tier, hour_balance, is_active, email_verified)
     VALUES (gen_random_uuid(), $1, 'Payment Test', 'free', 0, true, true) RETURNING id`,
    [email]
  );
  const userId = uRow.rows[0].id;
  const cookie = await makeCookie(userId, email);
  console.log(`\n👤 test user ${userId} (${email})\n`);

  try {
    // ── T0: list packages ──
    console.log("T0 · list packages (GET /api/payment/create)");
    const list = await api("/api/payment/create");
    const codes = (list.json?.packages || []).map((p) => p.code).sort().join(",");
    ok("packages config ครบ 5", codes === "master_1y,premium_1y,topup_100,topup_1700,topup_550", `[${codes}]`);

    // ── T1: create order = pending (ยังไม่เติม) ──
    console.log("\nT1 · create order (auth · pending · ยังไม่เติมยาม)");
    const b0 = await balance(userId);
    const c1 = await api("/api/payment/create", { method: "POST", cookie, body: { packageCode: "topup_100", gateway: "omise", method: "promptpay" } });
    const orderId1 = c1.json?.orderId;
    ok("create คืน orderId", !!orderId1, orderId1 || "");
    ok("mock QR ออกมา (omise sandbox)", !!c1.json?.qrImage, c1.json?.mock ? "mock=true" : "");
    ok("order สถานะ pending", (await orderStatus(orderId1)) === "pending");
    ok("ยังไม่เติมยาม (balance คงเดิม)", (await balance(userId)).hour_balance === b0.hour_balance);

    // create ต้อง auth
    const cNoAuth = await api("/api/payment/create", { method: "POST", body: { packageCode: "topup_100" } });
    ok("create ไม่ auth = 401", cNoAuth.status === 401, `status=${cNoAuth.status}`);

    // ── T1b: status poll = pending ──
    const st1 = await api(`/api/payment/status?orderId=${orderId1}`, { cookie });
    ok("status = pending", st1.json?.status === "pending");

    // ── T2: mock-pay → เติมครั้งเดียว ──
    console.log("\nT2 · mock-pay → เติม 100 ยาม · idempotent");
    const mp1 = await api("/api/payment/_mock-pay", { method: "POST", cookie, body: { orderId: orderId1 } });
    ok("mock-pay credited", mp1.json?.result?.status === "credited", mp1.json?.result?.status);
    const bAfter = await balance(userId);
    ok("balance +100", bAfter.hour_balance === b0.hour_balance + 100, `${b0.hour_balance}→${bAfter.hour_balance}`);
    ok("order = paid", (await orderStatus(orderId1)) === "paid");
    ok("hour_transactions ref_payment_id มี 1 แถว", (await txCount(userId, `order_${orderId1}`)) === 1);

    // idempotent: ยิงซ้ำ 2 ครั้ง = ไม่เติมเพิ่ม
    const mp2 = await api("/api/payment/_mock-pay", { method: "POST", cookie, body: { orderId: orderId1 } });
    const mp3 = await api("/api/payment/_mock-pay", { method: "POST", cookie, body: { orderId: orderId1 } });
    ok("ยิงซ้ำ = already", mp2.json?.result?.status === "already" && mp3.json?.result?.status === "already");
    ok("balance ไม่เพิ่ม (ยังคง +100)", (await balance(userId)).hour_balance === b0.hour_balance + 100);
    ok("ref_payment_id ยังมีแค่ 1 แถว", (await txCount(userId, `order_${orderId1}`)) === 1);

    // ── T3: amount mismatch = reject ──
    console.log("\nT3 · amount mismatch = reject (ไม่เติม)");
    const bBeforeMm = (await balance(userId)).hour_balance;
    const c3 = await api("/api/payment/create", { method: "POST", cookie, body: { packageCode: "topup_550", gateway: "omise", method: "promptpay" } });
    const orderId3 = c3.json?.orderId;
    const mm = await api("/api/payment/_mock-pay", { method: "POST", cookie, body: { orderId: orderId3, amountThb: 1 } });
    ok("mismatch = reject", mm.json?.result?.status === "amount_mismatch", JSON.stringify(mm.json?.result || {}));
    ok("order = failed", (await orderStatus(orderId3)) === "failed");
    ok("ไม่เติมยาม (balance คงเดิม)", (await balance(userId)).hour_balance === bBeforeMm);

    // ── T4: subscription → tier + สิ้นสุด ~365 วัน + แถมยาม ──
    console.log("\nT4 · subscription premium_1y → tier + 365 วัน + แถม 120 ยาม");
    const bBeforeSub = (await balance(userId)).hour_balance;
    const c4 = await api("/api/payment/create", { method: "POST", cookie, body: { packageCode: "premium_1y", gateway: "stripe", method: "card" } });
    const orderId4 = c4.json?.orderId;
    ok("subscription create คืน redirectUrl (stripe mock)", !!c4.json?.redirectUrl);
    const mp4 = await api("/api/payment/_mock-pay", { method: "POST", cookie, body: { orderId: orderId4 } });
    ok("subscription credited", mp4.json?.result?.status === "credited");
    const bSub = await balance(userId);
    ok("tier = premium", bSub.tier === "premium", bSub.tier);
    ok("แถม 120 ยาม", bSub.hour_balance === bBeforeSub + 120, `${bBeforeSub}→${bSub.hour_balance}`);
    const days = bSub.sub_expires_at ? (new Date(bSub.sub_expires_at) - Date.now()) / 86400000 : 0;
    ok("sub_expires_at ~365 วัน", days > 360 && days < 366, `${days.toFixed(1)} วัน`);

    // ── T5: Stripe webhook verify signature + idempotent ──
    console.log("\nT5 · Stripe webhook · verify signature + fulfill + idempotent");
    if (!EXTERNAL_BASE) {
      // create order สำหรับ webhook (stripe mock)
      const bBeforeWh = (await balance(userId)).hour_balance;
      const c5 = await api("/api/payment/create", { method: "POST", cookie, body: { packageCode: "topup_100", gateway: "stripe", method: "promptpay" } });
      const orderId5 = c5.json?.orderId;
      const evt = {
        id: "evt_test", type: "checkout.session.completed",
        data: { object: { id: "cs_test_wh", payment_status: "paid", amount_total: 9900, payment_intent: "pi_test_wh", metadata: { order_id: orderId5, amount_thb: "99" } } },
      };
      const payload = JSON.stringify(evt);
      const t = Math.floor(Date.now() / 1000);
      const sig = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
      const goodHeader = `t=${t},v1=${sig}`;

      // เสียลายเซ็น = 400 (ไม่เติม)
      const whBad = await api("/api/payment/webhook/stripe", { method: "POST", rawBody: payload, headers: { "stripe-signature": `t=${t},v1=deadbeef` } });
      ok("ลายเซ็นผิด = 400", whBad.status === 400, `status=${whBad.status}`);
      ok("ลายเซ็นผิด = ไม่เติม", (await balance(userId)).hour_balance === bBeforeWh);
      ok("order ยัง pending หลังลายเซ็นผิด", (await orderStatus(orderId5)) === "pending");

      // ลายเซ็นถูก = fulfill
      const whGood = await api("/api/payment/webhook/stripe", { method: "POST", rawBody: payload, headers: { "stripe-signature": goodHeader } });
      ok("ลายเซ็นถูก = credited", whGood.json?.result?.status === "credited", JSON.stringify(whGood.json?.result || whGood.status));
      ok("webhook เติม +100", (await balance(userId)).hour_balance === bBeforeWh + 100);

      // ยิงซ้ำลายเซ็นถูก = idempotent
      const t2 = Math.floor(Date.now() / 1000);
      const sig2 = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`${t2}.${payload}`).digest("hex");
      const whDup = await api("/api/payment/webhook/stripe", { method: "POST", rawBody: payload, headers: { "stripe-signature": `t=${t2},v1=${sig2}` } });
      ok("webhook ยิงซ้ำ = already", whDup.json?.result?.status === "already", whDup.json?.result?.status);
      ok("balance ไม่เพิ่ม (ยังคง +100)", (await balance(userId)).hour_balance === bBeforeWh + 100);
    } else {
      console.log("  (ข้าม T5 · ใช้ TEST_BASE ภายนอก · webhook secret ไม่ตรง)");
    }

    console.log(`\n──────────────\nRESULT: ${pass} passed · ${fail} failed\n`);
  } finally {
    // cleanup: ลบ test user (cascade orders + hour_transactions)
    await pool.query(`DELETE FROM users WHERE id=$1`, [userId]);
    console.log("🧹 cleaned up test user");
  }
  return fail === 0;
}

// ── orchestrate: start next dev (unless external base) ──
let serverProc = null;
async function main() {
  if (!EXTERNAL_BASE) {
    console.log(`🚀 starting next dev on :${PORT} (STRIPE_WEBHOOK_SECRET=test · sandbox mock gateways)...`);
    serverProc = spawn("node_modules/.bin/next", ["dev", "-p", String(PORT)], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, PAYMENT_MODE: "sandbox", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_SECRET_KEY: "", OMISE_SECRET_KEY: "" },
      stdio: ["ignore", "ignore", "inherit"],
    });
    const ready = await waitReady();
    if (!ready) { console.error("❌ server ไม่พร้อมใน timeout"); process.exit(2); }
  }
  let good = false;
  try { good = await run(); }
  finally {
    await pool.end();
    if (serverProc) serverProc.kill("SIGTERM");
  }
  process.exit(good ? 0 : 1);
}
main().catch((e) => { console.error(e); if (serverProc) serverProc.kill("SIGTERM"); process.exit(3); });
