import crypto from "node:crypto";
import fs from "node:fs";
import { SignJWT } from "jose";
import pg from "pg";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
const base = process.env.BASE_URL || "http://127.0.0.1:3370";
const db = new pg.Client({ host: env.PGHOST, port: Number(env.PGPORT), database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD });
const userId = crypto.randomUUID();
const orgId = crypto.randomUUID();
const email = `mobile-store-api-${Date.now()}@example.test`;
let checks = 0;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks += 1;
  console.log(`PASS ${message}`);
}

async function api(path, token, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(options.headers || {}) },
  });
  return { response, data: await response.json().catch(() => ({})) };
}

try {
  await db.connect();
  await db.query(
    `INSERT INTO users(id,email,name,is_active,tier,hour_balance,trial_ends_at,session_version,created_at)
     VALUES($1,$2,'Store API',true,'free',1000,now()+interval '14 days',0,now())`,
    [userId, email]
  );
  await db.query(`INSERT INTO organizations(id,owner_user_id,name,slug,created_at) VALUES($1,$2,'Store API',$3,now())`, [orgId, userId, `store-api-${Date.now()}`]);
  await db.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
  const token = await new SignJWT({ userId, email, orgId, sv: 0 })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("20m")
    .sign(new TextEncoder().encode(env.AUTH_SECRET));

  let result = await api("/api/mobile/v1/store/products", token);
  check(result.response.status === 200 && result.data.products.length === 5, "mobile store exposes only five server-mapped products");
  check(result.data.current.plan === "trial" && result.data.account_binding.apple_app_account_token === userId, "store catalog uses shared entitlement and Apple account binding");
  const expectedHash = crypto.createHash("sha256").update(userId).digest("hex");
  check(result.data.account_binding.google_obfuscated_account_id === expectedHash, "store catalog returns deterministic Google account binding");

  result = await api("/api/mobile/v1/store/verify", token, { method: "POST", body: JSON.stringify({ platform: "apple", product_id: "fake.product", transaction_id: "2000000123456789" }) });
  check(result.response.status === 400, "unknown client product is rejected before store verification");
  result = await api("/api/mobile/v1/store/verify", token, { method: "POST", body: JSON.stringify({ platform: "apple", product_id: "io.hourkey.premium.monthly", transaction_id: "2000000123456789" }) });
  check(result.response.status === 503 && result.data.verified === false, "Apple verification fails closed when server credentials are unavailable");
  result = await api("/api/mobile/v1/store/verify", token, { method: "POST", body: JSON.stringify({ platform: "google", product_id: "io.hourkey.premium.monthly", purchase_token: "google-purchase-token-abcdefghijklmnop" }) });
  check(result.response.status === 503 && result.data.verified === false, "Google verification fails closed when server credentials are unavailable");

  result = await api("/api/payment/webhook/apple-store", null, { method: "POST", body: JSON.stringify({ signedPayload: "not-a-signed-notification" }) });
  check(result.response.status === 401, "unsigned Apple lifecycle notification is rejected");
  result = await api("/api/payment/webhook/google-play", null, { method: "POST", body: JSON.stringify({}) });
  check(result.response.status === 404, "unauthenticated Google Pub/Sub notification is hidden");
  console.log(`${checks} mobile store API checks passed`);
} finally {
  if (db._connected) {
    await db.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [userId]).catch(() => null);
    await db.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
    await db.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => null);
    await db.end().catch(() => null);
  }
}
