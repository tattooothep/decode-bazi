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
const userId = crypto.randomUUID(), orgId = crypto.randomUUID();
const email = `mobile-forecast-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
let checks = 0;
function check(condition, message) { if (!condition) throw new Error(`FAIL ${message}`); checks += 1; console.log(`PASS ${message}`); }
async function api(auth, body) {
  const response = await fetch(`${base}/api/mobile/v1/forecast`, { body: JSON.stringify(body), headers: { authorization: auth ? `Bearer ${auth}` : "", "content-type": "application/json" }, method: "POST" });
  return { response, data: await response.json().catch(() => ({})) };
}

try {
  await db.connect();
  await db.query(`INSERT INTO users(id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,session_version,created_at) VALUES($1,$2,'test-only','Mobile Forecast','th','Asia/Bangkok','dark',true,true,'free',0,0,now())`, [userId, email]);
  await db.query(`INSERT INTO organizations(id,owner_user_id,name,slug,created_at) VALUES($1,$2,'Mobile Forecast Fixture',$3,now())`, [orgId, userId, `mobile-forecast-${Date.now()}`]);
  await db.query(`INSERT INTO org_members(id,org_id,user_id,role,status,joined_at) VALUES(gen_random_uuid(),$1,$2,'owner','active',now())`, [orgId, userId]);
  await db.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
  const token = await new SignJWT({ userId, email, orgId, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("20m").sign(new TextEncoder().encode(env.AUTH_SECRET));
  const coin = { question: "Should I sign this agreement?", method: "coin", category: "business", lang: "en", coin_lines: [7, 8, 9, 6, 7, 8] };

  let result = await api(null, coin);
  check(result.response.status === 401, "Forecast requires a mobile session");
  result = await api(token, { ...coin, method: "qmdj" });
  check(result.response.status === 422 && result.data.error === "location_required", "location-based forecast fails closed without explicit coordinates");
  result = await api(token, { ...coin, coin_lines: [7, 8] });
  check(result.response.status === 400 && result.data.error === "six_coin_lines_required", "coin forecast requires all six ritual lines");
  result = await api(token, coin);
  check(result.response.status === 200 && result.data.ok === true, "coin forecast returns its deterministic calculation without AI credit");
  check(JSON.stringify(result.data.structured?.lines) === JSON.stringify(coin.coin_lines), "forecast uses the six lines supplied by the user");
  check(result.data.request_context?.location_source === "not_applicable" && result.data.ai_error === "insufficient_hours", "coin calculation remains available while AI billing fails closed");
  check(typeof result.data.calculation_html === "string" && !("engine" in result.data), "mobile forecast renames calculation output and hides implementation fields");
  check(!/(model|provider|engine_name)/i.test(JSON.stringify(result.data)), "Forecast public response does not disclose AI implementation names");
  console.log(`${checks} mobile Forecast checks passed`);
} finally {
  if (db._connected) {
    await db.query(`DELETE FROM org_members WHERE user_id=$1`, [userId]).catch(() => null);
    await db.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [userId]).catch(() => null);
    await db.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
    await db.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => null);
    await db.end().catch(() => null);
  }
}
