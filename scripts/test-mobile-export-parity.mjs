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
const email = `mobile-export-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
let checks = 0;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks += 1; console.log(`PASS ${message}`);
}

async function request(path, token, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { authorization: token ? `Bearer ${token}` : "", ...(init.headers || {}) },
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("json") ? await response.json().catch(() => ({})) : null;
  return { response, data };
}

try {
  await db.connect();
  await db.query(
    `INSERT INTO users(id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,trial_ends_at,session_version,created_at)
     VALUES($1,$2,'test-only','Mobile Export','th','Asia/Bangkok','dark',true,true,'free',1000,now()+interval '7 days',0,now())`,
    [userId, email]
  );
  await db.query(`INSERT INTO organizations(id,owner_user_id,name,slug,created_at) VALUES($1,$2,'Mobile Export Fixture',$3,now())`, [orgId, userId, `mobile-export-${Date.now()}`]);
  await db.query(`INSERT INTO org_members(id,org_id,user_id,role,status,joined_at) VALUES(gen_random_uuid(),$1,$2,'owner','active',now())`, [orgId, userId]);
  await db.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
  const token = await new SignJWT({ userId, email, orgId, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("20m").sign(new TextEncoder().encode(env.AUTH_SECRET));
  const randomId = crypto.randomUUID();

  let result = await request("/api/mobile/v1/export/summary", null, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check(result.response.status === 401, "summary export start requires a mobile session");
  result = await request("/api/mobile/v1/export/summary", token, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
  check(result.response.status === 400 && result.data.error === "invalid_json", "summary export rejects malformed JSON");
  result = await request("/api/mobile/v1/export/summary", token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "unknown", inputs: {} }) });
  check(result.response.status === 400 && result.data.error === "unsupported_page", "summary export accepts only registered production pages");
  result = await request("/api/mobile/v1/export/summary", token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "palm", inputs: { palm: "x".repeat(910_000) } }) });
  check(result.response.status === 413 && result.data.error === "export_payload_too_large", "summary export caps snapshot size before forwarding");
  result = await request("/api/mobile/v1/export/summary", token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "palm", lang: "th", inputs: {} }) });
  check(result.response.status === 400 && result.data.error === "invalid_inputs", "summary export delegates input validation to the production handler");
  result = await request("/api/mobile/v1/export/summary", token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "luopan", lang: "th", inputs: { luopan: { version:"luopan_evidence_v2", house:{ id:"999999999999", facingDegree:15, period:9 }, pins:[], sciences:"forged" } } }) });
  check(result.response.status === 404 && result.data.error === "house_not_owned", `Luo Pan export rejects a client-supplied house that the account does not own (got ${result.response.status}/${result.data.error})`);

  result = await request(`/api/mobile/v1/export/summary/${randomId}`, null);
  check(result.response.status === 401, "summary status requires a mobile session");
  result = await request("/api/mobile/v1/export/summary/not-an-id", token);
  check(result.response.status === 400 && result.data.error === "bad_id", "summary status rejects an invalid job id");
  result = await request(`/api/mobile/v1/export/summary/${randomId}`, token);
  check(result.response.status === 404 && result.data.error === "job_not_found", "summary status delegates owner-scoped job lookup");
  result = await request(`/api/mobile/v1/export/summary/${randomId}/pdf`, null);
  check(result.response.status === 401, "summary PDF requires a mobile session");
  result = await request(`/api/mobile/v1/export/summary/${randomId}/pdf`, token);
  check(result.response.status === 404 && result.data.error === "job_not_found", "summary PDF delegates owner-scoped file lookup");
  check(!/(claude|openai|gemini|provider|model_name)/i.test(JSON.stringify(result.data)), "summary public errors do not disclose AI implementation names");

  console.log(`${checks} mobile summary export checks passed`);
} finally {
  if (db._connected) {
    await db.query(`DELETE FROM org_members WHERE user_id=$1`, [userId]).catch(() => null);
    await db.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [userId]).catch(() => null);
    await db.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
    await db.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => null);
    await db.end().catch(() => null);
  }
}
