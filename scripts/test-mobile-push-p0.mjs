import crypto from "node:crypto";
import fs from "node:fs";
import { SignJWT } from "jose";
import pg from "pg";

const env = {};
if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
for (const key of ["AUTH_SECRET", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"]) {
  if (!env[key] && process.env[key]) env[key] = process.env[key];
}
if (!/^notification_integrity_(?:api_)?test(?:_|$)/.test(String(env.PGDATABASE || ""))) {
  throw new Error("REFUSE non-disposable database: test-mobile-push-p0 requires notification_integrity_*_test");
}
const base = process.env.BASE_URL || "http://127.0.0.1:3370";
const db = new pg.Client({ host: env.PGHOST, port: Number(env.PGPORT), database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD });
const orgId = crypto.randomUUID();
const users = [crypto.randomUUID(), crypto.randomUUID()];
const emails = users.map((_, index) => `mobile-push-${Date.now()}-${index}@example.test`);
const installs = [crypto.randomUUID(), crypto.randomUUID()];
const pushTokenA = "ExponentPushToken[abcdefghijklmnopqrstuv]";
const pushTokenB = "ExponentPushToken[zyxwvutsrqponmlkjihgfe]";
const transferInstallation = crypto.randomUUID();
const transferExpoA = `ExponentPushToken[nativeownera${Date.now()}]`;
const transferExpoB = `ExponentPushToken[nativeownerb${Date.now()}]`;
const nativeToken = `fcm-native-owner-${Date.now()}`;
const omittedNativeInstallation = crypto.randomUUID();
const omittedNativeExpo = `ExponentPushToken[legacyclear${Date.now()}]`;
const omittedNativeToken = `fcm-legacy-clear-${Date.now()}`;
const raceInstallation = crypto.randomUUID();
const raceExpo = `ExponentPushToken[raceowner${Date.now()}]`;
const forcedFailureExpo = "ExponentPushToken[forcedfailurefixture]";
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

async function waitForAdvisoryWaiters(minimum) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await db.query(`SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND NOT granted`);
    if (result.rows[0].n >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`FAIL expected ${minimum} waiting advisory locks`);
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
  check(result.response.status === 200 && result.data.subscribed === true, `iOS installation registers an Expo push token (${result.response.status}/${result.data.error || "ok"})`);
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

  result = await api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({
    expo_push_token: transferExpoA, installation_id: transferInstallation, platform: "android",
    device_push_token: nativeToken, device_token_type: "fcm",
  }) });
  check(result.response.status === 200, "first account registers a native installation identity");
  result = await api("/api/mobile/v1/push", tokens[1], { method: "POST", body: JSON.stringify({
    expo_push_token: transferExpoB, installation_id: transferInstallation, platform: "android",
    device_push_token: nativeToken, device_token_type: "fcm",
  }) });
  check(result.response.status === 200, "second account atomically takes over the same native installation");
  rows = await db.query(
    `SELECT user_id::text,enabled FROM mobile_push_tokens
      WHERE installation_id=$1 OR device_push_token=$2 ORDER BY created_at`,
    [transferInstallation, nativeToken],
  );
  check(rows.rows.filter((row) => row.enabled).length === 1 && rows.rows.find((row) => row.enabled)?.user_id === users[1], "only the new account remains active for the shared installation/native token");

  result = await api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({
    expo_push_token: omittedNativeExpo, installation_id: transferInstallation, platform: "android",
    device_push_token: omittedNativeToken, device_token_type: "fcm",
  }) });
  check(result.response.status === 200, "first account can register an Expo/native pair for legacy-clear coverage");
  result = await api("/api/mobile/v1/push", tokens[1], { method: "POST", body: JSON.stringify({
    expo_push_token: omittedNativeExpo, installation_id: omittedNativeInstallation, platform: "android",
  }) });
  check(result.response.status === 200, "same Expo token can transfer through a legacy registration without a native token");
  rows = await db.query(
    `SELECT user_id::text,installation_id::text,device_push_token,device_token_type,enabled
       FROM mobile_push_tokens WHERE expo_push_token=$1`,
    [omittedNativeExpo],
  );
  check(rows.rowCount === 1 && rows.rows[0].user_id === users[1]
    && rows.rows[0].installation_id === omittedNativeInstallation
    && rows.rows[0].device_push_token === null && rows.rows[0].device_token_type === null
    && rows.rows[0].enabled === true, "legacy registration clears a transferred stored native identity instead of resurrecting it");

  result = await api("/api/mobile/v1/push", tokens[1], { method: "DELETE", body: JSON.stringify({ installation_id: transferInstallation }) });
  check(result.response.status === 200 && result.data.subscribed === false, "unregister disables the current installation");
  result = await api("/api/mobile/v1/push", tokens[1], { method: "DELETE", body: JSON.stringify({ installation_id: transferInstallation }) });
  check(result.response.status === 200 && result.data.subscribed === false, "a repeated unregister is idempotent");
  rows = await db.query(`SELECT count(*)::int n FROM mobile_push_tokens WHERE installation_id=$1 AND enabled=true`, [transferInstallation]);
  check(rows.rows[0].n === 0, "unregister leaves no active token for the installation");

  await db.query("SELECT pg_advisory_lock(hashtextextended('mobile-push-user:' || $1::text, 0))", [users[0]]);
  const racingPost = api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({
    expo_push_token: raceExpo, installation_id: raceInstallation, platform: "ios",
  }) });
  await waitForAdvisoryWaiters(1);
  const racingDelete = api("/api/mobile/v1/push", tokens[0], { method: "DELETE", body: JSON.stringify({ installation_id: raceInstallation }) });
  await waitForAdvisoryWaiters(2);
  await db.query("SELECT pg_advisory_unlock(hashtextextended('mobile-push-user:' || $1::text, 0))", [users[0]]);
  const [racingPostResult, racingDeleteResult] = await Promise.all([racingPost, racingDelete]);
  check(racingPostResult.response.status === 200 && racingDeleteResult.response.status === 200, "concurrent registration and unregister both complete through shared transaction locks");
  rows = await db.query(`SELECT count(*)::int n FROM mobile_push_tokens WHERE installation_id=$1 AND enabled=true`, [raceInstallation]);
  check(rows.rows[0].n === 0, "the queued unregister linearizes after an in-flight registration and leaves no active token");

  result = await api("/api/mobile/v1/push", tokens[1], { method: "POST", body: JSON.stringify({
    expo_push_token: forcedFailureExpo, installation_id: crypto.randomUUID(), platform: "ios",
  }) });
  check(result.response.status === 500 && result.data.error === "push_registration_failed"
    && !JSON.stringify(result.data).includes("forcedfailurefixture"), "database registration failures return a sanitized response without provider-token details");

  result = await api("/api/mobile/v1/notifications", tokens[1]);
  check(result.response.status === 200 && result.data.prefs?.privacyPreview === false && result.data.prefs?.locale === "th", "privacy-preview and locale default safely for an account without preferences");
  result = await api("/api/mobile/v1/notifications", tokens[1], { method: "POST", body: JSON.stringify({ action: "prefs", privacyPreview: true, locale: "en" }) });
  check(result.response.status === 200 && result.data.prefs?.privacyPreview === true && result.data.prefs?.locale === "en", "preferences persist privacy-preview opt-in and supported locale");
  result = await api("/api/mobile/v1/notifications", tokens[1]);
  check(result.response.status === 200 && result.data.prefs?.privacyPreview === true && result.data.prefs?.locale === "en", "preferences return persisted privacy-preview and locale values");
  result = await api("/api/mobile/v1/notifications", tokens[1], { method: "POST", body: JSON.stringify({ action: "prefs", locale: "invalid" }) });
  check(result.response.status === 200 && result.data.prefs?.locale === "en", "unsupported preference locale is rejected without replacing the stored supported value");

  result = await api("/api/mobile/v1/push", tokens[1], { method: "DELETE", body: JSON.stringify({}) });
  check(result.response.status === 200 && result.data.subscribed === false, `unregister-all serializes and completes without a SQL grouping error (${result.response.status}/${result.data.error || "ok"})`);
  rows = await db.query(`SELECT count(*)::int n FROM mobile_push_tokens WHERE user_id=$1 AND enabled=true`, [users[1]]);
  check(rows.rows[0].n === 0, "unregister-all leaves no active token for its account");

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
