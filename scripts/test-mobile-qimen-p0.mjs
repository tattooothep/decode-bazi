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
const email = `mobile-qimen-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
let checks = 0;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks += 1; console.log(`PASS ${message}`);
}

async function api(auth, body) {
  const response = await fetch(`${base}/api/mobile/v1/qimen`, {
    body: JSON.stringify(body), headers: { authorization: auth ? `Bearer ${auth}` : "", "content-type": "application/json" }, method: "POST",
  });
  return { response, data: await response.json().catch(() => ({})) };
}

try {
  await db.connect();
  await db.query(
    `INSERT INTO users(id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,trial_ends_at,session_version,created_at)
     VALUES($1,$2,'test-only','Mobile Qi Men','th','Asia/Bangkok','dark',true,true,'free',1000,now()+interval '7 days',0,now())`,
    [userId, email]
  );
  await db.query(`INSERT INTO organizations(id,owner_user_id,name,slug,created_at) VALUES($1,$2,'Mobile Qi Men Fixture',$3,now())`, [orgId, userId, `mobile-qimen-${Date.now()}`]);
  await db.query(`INSERT INTO org_members(id,org_id,user_id,role,status,joined_at) VALUES(gen_random_uuid(),$1,$2,'owner','active',now())`, [orgId, userId]);
  await db.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
  const token = await new SignJWT({ userId, email, orgId, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("20m").sign(new TextEncoder().encode(env.AUTH_SECRET));
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const valid = { date, time, latitude: 13.7563, longitude: 100.5018, school: "chaibu", system_type: "hour", question: "Should I negotiate now?" };

  let result = await api(null, valid);
  check(result.response.status === 401, "Qi Men requires a mobile session");
  result = await api(token, { ...valid, latitude: undefined, longitude: undefined });
  check(result.response.status === 422 && result.data.error === "location_required", "Qi Men fails closed without an explicit location");
  result = await api(token, { ...valid, school: "unsupported" });
  check(result.response.status === 400 && result.data.error === "unsupported_school", "Qi Men rejects an unsupported school");
  result = await api(token, valid);
  check(result.response.status === 200 && result.data.ok === true, "trial account casts the current Qi Men hour");
  check(result.data.request_context?.location_source === "mobile_explicit" && result.data.request_context?.latitude === 13.7563, "Qi Men returns explicit location provenance");
  check(result.data.product?.plan === "trial" && Array.isArray(result.data.data?.palaces) && result.data.data.palaces.length === 9, "Qi Men returns a plan-shaped nine-palace chart");
  check(!/(model|provider|engine_name)/i.test(JSON.stringify(result.data)), "Qi Men public response does not disclose AI implementation names");

  console.log(`${checks} mobile Qi Men checks passed`);
} finally {
  if (db._connected) {
    await db.query(`DELETE FROM org_members WHERE user_id=$1`, [userId]).catch(() => null);
    await db.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [userId]).catch(() => null);
    await db.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
    await db.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => null);
    await db.end().catch(() => null);
  }
}
