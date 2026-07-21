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
const db = new pg.Client({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  database: env.PGDATABASE,
  user: env.PGUSER,
  password: env.PGPASSWORD,
});
const userId = crypto.randomUUID();
const orgId = crypto.randomUUID();
const email = `mobile-qimen-parity-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
let checks = 0;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks += 1;
  console.log(`PASS ${message}`);
}

async function post(path, token, body) {
  const response = await fetch(`${base}${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: token ? `Bearer ${token}` : "",
      "content-type": "application/json",
    },
    method: "POST",
  });
  return { response, data: await response.json().catch(() => ({})) };
}

try {
  await db.connect();
  await db.query(
    `INSERT INTO users(id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,trial_ends_at,session_version,created_at)
     VALUES($1,$2,'test-only','Mobile Qi Men Parity','th','Asia/Bangkok','dark',true,true,'free',1000,now()+interval '7 days',0,now())`,
    [userId, email]
  );
  await db.query(
    `INSERT INTO organizations(id,owner_user_id,name,slug,created_at)
     VALUES($1,$2,'Mobile Qi Men Parity Fixture',$3,now())`,
    [orgId, userId, `mobile-qimen-parity-${Date.now()}`]
  );
  await db.query(
    `INSERT INTO org_members(id,org_id,user_id,role,status,joined_at)
     VALUES(gen_random_uuid(),$1,$2,'owner','active',now())`,
    [orgId, userId]
  );
  await db.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
  const token = await new SignJWT({ userId, email, orgId, sv: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(new TextEncoder().encode(env.AUTH_SECRET));
  const validSearch = {
    activity: "work_start",
    dateFrom: "2026-07-11",
    dateTo: "2026-07-11",
    latitude: 13.7563,
    longitude: 100.5018,
    mode: "activity",
    school: "chaibu",
  };

  let result = await post("/api/mobile/v1/qimen/search", null, validSearch);
  check(result.response.status === 401, "Qi Men search requires a mobile session");
  result = await post("/api/mobile/v1/qimen/search", token, { ...validSearch, dateFrom: "2026-07-12", dateTo: "2026-07-11" });
  check(result.response.status === 400 && result.data.error === "bad_date_range", "Qi Men search rejects a reversed date range");
  result = await post("/api/mobile/v1/qimen/search", token, { ...validSearch, dateTo: "2026-08-10" });
  check(result.response.status === 400 && result.data.error === "date_range_too_large", "Qi Men search caps scanning at 30 days");
  result = await post("/api/mobile/v1/qimen/search", token, { ...validSearch, latitude: undefined, longitude: undefined });
  check(result.response.status === 422 && result.data.error === "location_required", "Qi Men search fails closed without explicit coordinates");
  result = await post("/api/mobile/v1/qimen/search", token, { ...validSearch, school: "unsupported" });
  check(result.response.status === 400 && result.data.error === "unsupported_school", "Qi Men search rejects an unsupported school");
  result = await post("/api/mobile/v1/qimen/search", token, { ...validSearch, mode: "spec", spec: {} });
  check(result.response.status === 400 && result.data.error === "qimen_spec_required", "Qi Men component search requires a concrete specification");
  result = await post("/api/mobile/v1/qimen/search", token, validSearch);
  check(result.response.status === 403 && result.data.code === "qimen_search_locked", "Qi Men search preserves the production trial entitlement lock");

  result = await post("/api/mobile/v1/qimen/sifu", null, { message: "อ่านผังนี้", payload: {} });
  check(result.response.status === 401, "Qi Men Sifu requires a mobile session");
  result = await post("/api/mobile/v1/qimen/sifu", token, { message: "", payload: {} });
  check(result.response.status === 400 && result.data.error === "message_required", "Qi Men Sifu requires a question");
  result = await post("/api/mobile/v1/qimen/sifu", token, { message: "อ่านผังนี้", payload: { qimen: { raw: "x".repeat(230_000) } } });
  check(result.response.status === 413 && result.data.error === "qimen_payload_too_large", "Qi Men Sifu caps chart context size");
  result = await post("/api/mobile/v1/qimen/sifu", token, { message: "อ่านผังนี้", lang: "vi", payload: {} });
  check(result.response.status === 403 && result.data.code === "qimen_sifu_locked", "Qi Men Sifu preserves the production trial entitlement lock");
  check(!/(claude|openai|gemini|provider|model_name)/i.test(JSON.stringify(result.data)), "Qi Men Sifu does not disclose model or provider names");

  console.log(`${checks} mobile Qi Men parity checks passed`);
} finally {
  if (db._connected) {
    await db.query(`DELETE FROM org_members WHERE user_id=$1`, [userId]).catch(() => null);
    await db.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [userId]).catch(() => null);
    await db.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
    await db.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => null);
    await db.end().catch(() => null);
  }
}
