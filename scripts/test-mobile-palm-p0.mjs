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
const userA = crypto.randomUUID(), userB = crypto.randomUUID(), orgId = crypto.randomUUID();
const profileA = crypto.randomUUID(), profileB = crypto.randomUUID(), jobId = crypto.randomUUID();
const run = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
let checks = 0;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks += 1;
  console.log(`PASS ${message}`);
}
async function jwt(userId, email) {
  return new SignJWT({ userId, email, orgId, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("20m")
    .sign(new TextEncoder().encode(env.AUTH_SECRET));
}
async function api(path, token, options = {}) {
  const headers = { Accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.body instanceof FormData ? {} : { "content-type": "application/json" }), ...(options.headers || {}) };
  const response = await fetch(`${base}${path}`, { ...options, headers });
  return { response, data: await response.json().catch(() => ({})) };
}

try {
  await db.connect();
  const emailA = `mobile-palm-a-${run}@example.test`, emailB = `mobile-palm-b-${run}@example.test`;
  for (const [id, email] of [[userA, emailA], [userB, emailB]]) {
    await db.query(`INSERT INTO users(id,email,name,is_active,tier,hour_balance,session_version,created_at) VALUES($1,$2,'Palm fixture',true,'free',1000,0,now())`, [id, email]);
  }
  await db.query(`INSERT INTO organizations(id,owner_user_id,name,slug,created_at) VALUES($1,$2,'Palm fixture',$3,now())`, [orgId, userA, `mobile-palm-${run}`]);
  await db.query(`INSERT INTO org_members(id,org_id,user_id,role,status,joined_at) VALUES(gen_random_uuid(),$1,$2,'owner','active',now()),(gen_random_uuid(),$1,$3,'member','active',now())`, [orgId, userA, userB]);
  await db.query(`UPDATE users SET current_org_id=$1 WHERE id=ANY($2::uuid[])`, [orgId, [userA, userB]]);
  await db.query(
    `INSERT INTO profiles(id,org_id,created_by_user_id,name,birth_datetime,birth_time_known,day_boundary,is_archived,created_at,updated_at)
     VALUES($1,$3,$4,'Palm A','1990-01-01T08:00:00+07:00',true,'23:00',false,now(),now()),
           ($2,$3,$5,'Palm B','1991-01-01T08:00:00+07:00',true,'23:00',false,now(),now())`,
    [profileA, profileB, orgId, userA, userB]
  );
  await db.query(
    `INSERT INTO palm_jobs(id,user_id,org_id,status,lang,result,engine,created_at,updated_at)
     VALUES($1,$2,$3,'done','en',$4::jsonb,'private-provider-model',now(),now())`,
    [jobId, userA, orgId, JSON.stringify({ ok: true, engine: "private-provider-model", clarity_overall: 88, reading: { summary: "Verified palm fixture", lines: { life: { text: "Life line fixture" } } } })]
  );
  const [tokenA, tokenB] = await Promise.all([jwt(userA, emailA), jwt(userB, emailB)]);

  let result = await api(`/api/mobile/v1/palm/jobs/${jobId}`, null);
  check(result.response.status === 401, "palm job requires a mobile session");
  result = await api(`/api/mobile/v1/palm/jobs/${jobId}`, tokenA);
  check(result.response.status === 200 && result.data.status === "done" && !Object.hasOwn(result.data, "engine"), "owner polls a completed palm job without model disclosure");
  result = await api(`/api/mobile/v1/palm/jobs/${jobId}`, tokenB);
  check(result.response.status === 403, "another account cannot poll the palm job");

  result = await api("/api/mobile/v1/palm/readings", tokenA, { method: "POST", body: JSON.stringify({ job_id: jobId, profile_id: profileA }) });
  check(result.response.status === 201 && result.data.id === jobId, "completed server job saves to the owner's chart");
  await api("/api/mobile/v1/palm/readings", tokenA, { method: "POST", body: JSON.stringify({ job_id: jobId, profile_id: profileA }) });
  const dedupe = await db.query(`SELECT count(*)::int n FROM palm_readings WHERE id=$1`, [jobId]);
  check(dedupe.rows[0].n === 1, "saving the same palm job is idempotent");
  result = await api("/api/mobile/v1/palm/readings", tokenA, { method: "POST", body: JSON.stringify({ job_id: jobId, profile_id: profileB }) });
  check(result.response.status === 404, "same-organization profile from another account is rejected");
  result = await api("/api/mobile/v1/palm/readings", tokenB, { method: "POST", body: JSON.stringify({ job_id: jobId, profile_id: profileB }) });
  check(result.response.status === 409, "another account cannot save the owner's completed job");

  result = await api(`/api/mobile/v1/palm/readings?profile_id=${profileA}`, tokenA);
  check(result.response.status === 200 && result.data.readings.length === 1 && !Object.hasOwn(result.data.readings[0], "engine"), "owner lists saved palm metadata without model disclosure");
  result = await api(`/api/mobile/v1/palm/readings?profile_id=${profileA}`, tokenB);
  check(result.response.status === 200 && result.data.readings.length === 0, "saved palm list is isolated by account");
  result = await api(`/api/mobile/v1/palm/readings/${jobId}`, tokenB, { method: "DELETE" });
  check(result.response.status === 404, "another account cannot delete a saved palm reading");

  const empty = new FormData();
  empty.append("lang", "en");
  result = await api("/api/mobile/v1/palm/read", tokenA, { method: "POST", body: empty });
  check(result.response.status === 400 && result.data.error === "no_image", "mobile multipart boundary delegates to the existing palm validator");
  result = await api(`/api/mobile/v1/palm/readings/${jobId}`, tokenA, { method: "DELETE" });
  check(result.response.status === 200, "owner deletes the saved palm reading");
  console.log(`${checks} mobile palm checks passed`);
} finally {
  if (db._connected) {
    await db.query(`DELETE FROM palm_readings WHERE id=$1`, [jobId]).catch(() => null);
    await db.query(`DELETE FROM palm_jobs WHERE id=$1`, [jobId]).catch(() => null);
    await db.query(`DELETE FROM profiles WHERE id=ANY($1::uuid[])`, [[profileA, profileB]]).catch(() => null);
    await db.query(`DELETE FROM org_members WHERE user_id=ANY($1::uuid[])`, [[userA, userB]]).catch(() => null);
    await db.query(`UPDATE users SET current_org_id=NULL WHERE id=ANY($1::uuid[])`, [[userA, userB]]).catch(() => null);
    await db.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
    await db.query(`DELETE FROM users WHERE id=ANY($1::uuid[])`, [[userA, userB]]).catch(() => null);
    await db.end().catch(() => null);
  }
}
