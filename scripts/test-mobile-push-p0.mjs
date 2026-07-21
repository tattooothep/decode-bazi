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
const orgId = crypto.randomUUID();
const users = [crypto.randomUUID(), crypto.randomUUID()];
const emails = users.map((_, index) => `mobile-push-${Date.now()}-${index}@example.test`);
const installs = [crypto.randomUUID(), crypto.randomUUID()];
const pushTokenA = "ExponentPushToken[abcdefghijklmnopqrstuv]";
const pushTokenB = "ExponentPushToken[zyxwvutsrqponmlkjihgfe]";
let checks = 0;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks += 1;
  console.log(`PASS ${message}`);
}

async function jwt(userId, email) {
  return new SignJWT({ userId, email, orgId, sv: 0 })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("20m")
    .sign(new TextEncoder().encode(env.AUTH_SECRET));
}

async function api(path, token, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) },
  });
  return { response, data: await response.json().catch(() => ({})) };
}

try {
  await db.connect();
  for (let index = 0; index < users.length; index += 1) {
    await db.query(
      `INSERT INTO users(id,email,name,is_active,tier,hour_balance,session_version,created_at)
       VALUES($1,$2,$3,true,'free',1000,0,now())`,
      [users[index], emails[index], `Push ${index}`]
    );
  }
  await db.query(`INSERT INTO organizations(id,owner_user_id,name,slug,created_at) VALUES($1,$2,'Push Fixture',$3,now())`, [orgId, users[0], `push-${Date.now()}`]);
  await db.query(`UPDATE users SET current_org_id=$1 WHERE id=ANY($2::uuid[])`, [orgId, users]);
  const tokens = await Promise.all(users.map((userId, index) => jwt(userId, emails[index])));

  let result = await api("/api/mobile/v1/push", tokens[0]);
  check(result.response.status === 200 && result.data.subscribed === false, "new mobile account has no native push registration");
  result = await api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({ expo_push_token: "bad", installation_id: installs[0], platform: "ios" }) });
  check(result.response.status === 400, "invalid native push token fails closed");

  result = await api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({ expo_push_token: pushTokenA, installation_id: installs[0], platform: "ios", locale: "th", app_version: "1.0.0" }) });
  check(result.response.status === 200 && result.data.subscribed === true, "iOS installation registers an Expo push token");
  result = await api("/api/mobile/v1/push", tokens[0]);
  check(result.data.active_installations === 1, "registration status counts only the current account");
  result = await api(`/api/mobile/v1/push?installation_id=${installs[0]}`, tokens[0]);
  check(result.data.subscribed === true, "registration status identifies the current installation");

  result = await api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({ expo_push_token: pushTokenB, installation_id: installs[0], platform: "ios", locale: "en" }) });
  check(result.response.status === 200, "same installation rotates to a new push token");
  let rows = await db.query(`SELECT expo_push_token,locale FROM mobile_push_tokens WHERE user_id=$1 AND enabled=true`, [users[0]]);
  check(rows.rowCount === 1 && rows.rows[0].expo_push_token === pushTokenB && rows.rows[0].locale === "en", "token rotation remains exactly once");

  result = await api("/api/mobile/v1/push", tokens[1], { method: "POST", body: JSON.stringify({ expo_push_token: pushTokenB, installation_id: installs[1], platform: "android", locale: "vi" }) });
  check(result.response.status === 200, "device token moves to the newly authenticated account");
  rows = await db.query(`SELECT user_id::text,platform FROM mobile_push_tokens WHERE expo_push_token=$1`, [pushTokenB]);
  check(rows.rowCount === 1 && rows.rows[0].user_id === users[1] && rows.rows[0].platform === "android", "one Expo token can never remain linked to two accounts");

  result = await api("/api/mobile/v1/session", tokens[1], { method: "DELETE" });
  check(result.response.status === 200 && result.data.revoked_server_session === true, "logout revokes the mobile session");
  rows = await db.query(`SELECT count(*)::int n FROM mobile_push_tokens WHERE user_id=$1 AND enabled=true`, [users[1]]);
  check(rows.rows[0].n === 0, "logout disables native push for the old account");

  result = await fetch(`${base}/api/internal/jobs/mobile-push-receipts`, { method: "POST" });
  check(result.status === 404, "receipt worker is hidden without its internal bearer secret");
  console.log(`${checks} mobile push checks passed`);
} finally {
  if (db._connected) {
    await db.query(`DELETE FROM mobile_push_tokens WHERE user_id=ANY($1::uuid[])`, [users]).catch(() => null);
    await db.query(`UPDATE users SET current_org_id=NULL WHERE id=ANY($1::uuid[])`, [users]).catch(() => null);
    await db.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
    await db.query(`DELETE FROM users WHERE id=ANY($1::uuid[])`, [users]).catch(() => null);
    await db.end().catch(() => null);
  }
}
