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
  if (process.env[key]) env[key] = process.env[key];
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
const forcedFunction = `notification_integrity_forced_error_${process.pid}`;
const forcedTrigger = `notification_integrity_forced_trigger_${process.pid}`;
const forcedPreferenceFunction = `notification_preference_forced_error_${process.pid}`;
const forcedPreferenceTrigger = `notification_preference_forced_trigger_${process.pid}`;
const serverLogPath = process.env.NEXT_DEV_LOG_PATH || ".next/dev/logs/next-development.log";
let checks = 0;
let forcedFixtureCreated = false;
let forcedPreferenceFixtureCreated = false;

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
    const result = await db.query(
      `SELECT count(*)::int n FROM pg_locks
        WHERE locktype='advisory' AND NOT granted
          AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`,
    );
    if (result.rows[0].n >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`FAIL expected ${minimum} waiting advisory locks`);
}

try {
  await db.connect();
  await db.query(`CREATE FUNCTION ${forcedFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.expo_push_token='ExponentPushToken[forcedfailurefixture]' THEN
        RAISE EXCEPTION 'forced provider token %', NEW.expo_push_token;
      END IF;
      RETURN NEW;
    END;
  $$`);
  await db.query(`CREATE TRIGGER ${forcedTrigger}
    BEFORE INSERT OR UPDATE OF expo_push_token ON mobile_push_tokens
    FOR EACH ROW EXECUTE FUNCTION ${forcedFunction}()`);
  forcedFixtureCreated = true;
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
  let rows;

  let result = await api("/api/mobile/v1/push", tokens[0]);
  check(result.response.status === 200 && result.data.subscribed === false, "new mobile account has no native push registration");
  result = await api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({ expo_push_token: "bad", installation_id: installs[0], platform: "ios" }) });
  check(result.response.status === 400, "invalid native push token fails closed");

  result = await api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({
    expo_push_token: pushTokenA, installation_id: installs[0], platform: "ios",
    locale: "th", timezone: "America/New_York", app_version: "1.0.0",
  }) });
  check(result.response.status === 200 && result.data.subscribed === true, `iOS installation registers an Expo push token (${result.response.status}/${result.data.error || "ok"})`);
  rows = await db.query(`SELECT locale,timezone FROM users WHERE id=$1`, [users[0]]);
  check(rows.rows[0].locale === "th" && rows.rows[0].timezone === "America/New_York",
    "authenticated registration synchronizes account notification locale and timezone");
  rows = await db.query(`SELECT count(*)::int n FROM mobile_notification_prefs WHERE user_id=$1`, [users[0]]);
  check(rows.rows[0].n === 0, "registration never creates an opt-in preference row");
  result = await api("/api/mobile/v1/push", tokens[0]);
  check(result.data.active_installations === 1, "registration status counts only the current account");
  result = await api(`/api/mobile/v1/push?installation_id=${installs[0]}`, tokens[0]);
  check(result.data.subscribed === true, "registration status identifies the current installation");

  result = await api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({
    expo_push_token: pushTokenB, installation_id: installs[0], platform: "ios", locale: "en", timezone: "Europe/London",
  }) });
  check(result.response.status === 200, "same installation rotates to a new push token");
  rows = await db.query(`SELECT expo_push_token,locale FROM mobile_push_tokens WHERE user_id=$1 AND enabled=true`, [users[0]]);
  check(rows.rowCount === 1 && rows.rows[0].expo_push_token === pushTokenB && rows.rows[0].locale === "en", "token rotation remains exactly once");
  result = await api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({
    expo_push_token: pushTokenB, installation_id: installs[0], platform: "ios",
  }) });
  check(result.response.status === 200, "legacy registration may omit locale/timezone");
  rows = await db.query(`SELECT locale,timezone FROM users WHERE id=$1`, [users[0]]);
  check(rows.rows[0].locale === "en" && rows.rows[0].timezone === "Europe/London",
    "omitted legacy context preserves the existing account locale/timezone");
  result = await api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({
    expo_push_token: pushTokenB, installation_id: installs[0], platform: "ios", locale: "unsupported-private-locale",
  }) });
  check(result.response.status === 400, "explicit invalid registration locale fails closed");

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

  for (const order of ["post-first", "delete-first"]) {
    const crossInstallation = crypto.randomUUID();
    const crossDestination = crypto.randomUUID();
    const crossExpo = `ExponentPushToken[crossrace${order}${Date.now()}]`;
    const crossNative = `fcm-cross-race-${order}-${Date.now()}`;
    result = await api("/api/mobile/v1/push", tokens[0], { method: "POST", body: JSON.stringify({
      expo_push_token: crossExpo, installation_id: crossInstallation, platform: "android",
      device_push_token: crossNative, device_token_type: "fcm",
    }) });
    check(result.response.status === 200, `${order}: account A seeds a transferable active installation`);
    await db.query("SELECT pg_advisory_lock(hashtextextended('mobile-push-user:' || $1::text, 0))", [users[0]]);
    const transfer = () => api("/api/mobile/v1/push", tokens[1], { method: "POST", body: JSON.stringify({
      expo_push_token: crossExpo, installation_id: crossDestination, platform: "android",
    }) });
    const unregisterAll = () => api("/api/mobile/v1/push", tokens[0], { method: "DELETE", body: JSON.stringify({}) });
    const first = order === "post-first" ? transfer() : unregisterAll();
    await waitForAdvisoryWaiters(1);
    const second = order === "post-first" ? unregisterAll() : transfer();
    await waitForAdvisoryWaiters(2);
    await db.query("SELECT pg_advisory_unlock(hashtextextended('mobile-push-user:' || $1::text, 0))", [users[0]]);
    const [firstResult, secondResult] = await Promise.all([first, second]);
    check(firstResult.response.status === 200 && secondResult.response.status === 200, `${order}: cross-user transfer and unregister-all complete without a deadlock or 500`);
    rows = await db.query(`SELECT user_id::text,enabled FROM mobile_push_tokens WHERE expo_push_token=$1`, [crossExpo]);
    check(rows.rowCount === 1 && rows.rows[0].user_id === users[1] && rows.rows[0].enabled === true, `${order}: cross-user transfer leaves account B as the valid active owner`);
  }

  const logOffset = fs.existsSync(serverLogPath) ? fs.statSync(serverLogPath).size : 0;
  result = await api("/api/mobile/v1/push", tokens[1], { method: "POST", body: JSON.stringify({
    expo_push_token: forcedFailureExpo, installation_id: crypto.randomUUID(), platform: "ios",
  }) });
  const serverLogTail = fs.existsSync(serverLogPath) ? fs.readFileSync(serverLogPath, "utf8").slice(logOffset) : "";
  check(result.response.status === 500 && result.data.error === "push_registration_failed"
    && !JSON.stringify(result.data).includes("forcedfailurefixture")
    && !serverLogTail.includes("forcedfailurefixture") && !serverLogTail.includes("forced provider token"), "database registration failures never surface raw provider-token details in response or server log");

  result = await api("/api/mobile/v1/notifications", tokens[1]);
  check(result.response.status === 200 && result.data.prefs?.privacyPreview === false && result.data.prefs?.locale === "vi", "privacy-preview defaults safely while history locale follows the authenticated account context");
  result = await api("/api/mobile/v1/notifications", tokens[1], { method: "POST", body: JSON.stringify({ action: "prefs", privacyPreview: true, locale: "en", timezone: "Asia/Tokyo" }) });
  check(result.response.status === 200 && result.data.prefs?.privacyPreview === true && result.data.prefs?.locale === "en", "preferences persist privacy-preview opt-in and supported locale");
  result = await api("/api/mobile/v1/notifications", tokens[1]);
  check(result.response.status === 200 && result.data.prefs?.privacyPreview === true && result.data.prefs?.locale === "en", "preferences return persisted privacy-preview and locale values");
  result = await api("/api/mobile/v1/notifications", tokens[1], { method: "POST", body: JSON.stringify({ action: "prefs", locale: "invalid" }) });
  check(result.response.status === 400, "unsupported preference locale is rejected without replacing the stored supported value");
  rows = await db.query(`SELECT locale,timezone FROM mobile_notification_prefs WHERE user_id=$1`, [users[1]]);
  check(rows.rows[0].locale === "en" && rows.rows[0].timezone === "Asia/Tokyo", "invalid preference context rolls back without replacing locale/timezone");

  const contextSyncExpo = `ExponentPushToken[contextsync${Date.now()}]`;
  result = await api("/api/mobile/v1/push", tokens[1], { method: "POST", body: JSON.stringify({
    expo_push_token: contextSyncExpo, installation_id: installs[1], platform: "android",
    locale: "zh", timezone: "America/Los_Angeles",
  }) });
  check(result.response.status === 200, "normal registration refreshes an existing notification context");
  rows = await db.query(`SELECT u.locale AS user_locale,u.timezone AS user_timezone,np.locale AS pref_locale,np.timezone AS pref_timezone
      FROM users u JOIN mobile_notification_prefs np ON np.user_id=u.id WHERE u.id=$1`, [users[1]]);
  check(rows.rows[0].user_locale === "zh" && rows.rows[0].pref_locale === "zh"
      && rows.rows[0].user_timezone === "America/Los_Angeles" && rows.rows[0].pref_timezone === "America/Los_Angeles",
    "registration synchronizes existing account history, scheduler, quiet-hours and MUTE context atomically");

  await db.query("SELECT pg_advisory_lock(hashtextextended('mobile-push-user:' || $1::text, 0))", [users[1]]);
  const racingSavedDate = api("/api/mobile/v1/notifications", tokens[1], {
    method: "POST", body: JSON.stringify({ action: "prefs", savedDate: true }),
  });
  await waitForAdvisoryWaiters(1);
  const racingQimen = api("/api/mobile/v1/notifications", tokens[1], {
    method: "POST", body: JSON.stringify({
      action: "prefs", qimen: true, qimenLatitude: 13.7563, qimenLongitude: 100.5018,
    }),
  });
  await waitForAdvisoryWaiters(2);
  await db.query("SELECT pg_advisory_unlock(hashtextextended('mobile-push-user:' || $1::text, 0))", [users[1]]);
  const [savedDateRaceResult, qimenRaceResult] = await Promise.all([racingSavedDate, racingQimen]);
  result = await api("/api/mobile/v1/notifications", tokens[1]);
  check(savedDateRaceResult.response.status === 200 && qimenRaceResult.response.status === 200
    && qimenRaceResult.data.prefs?.qimenLocationFresh === true
    && Number.isFinite(Date.parse(qimenRaceResult.data.prefs?.qimenLocationExpiresAt))
    && result.data.prefs?.savedDate === true && result.data.prefs?.qimen === true
    && result.data.prefs?.qimenLocationFresh === true
    && result.data.prefs?.qimenLocationExpiresAt === qimenRaceResult.data.prefs?.qimenLocationExpiresAt,
  "two concurrent partial preference API writes serialize and merge without lost fields");
  rows = await db.query(`SELECT qimen_latitude,qimen_longitude FROM mobile_notification_prefs WHERE user_id=$1`, [users[1]]);
  check(Number(rows.rows[0]?.qimen_latitude) === 13.7563 && Number(rows.rows[0]?.qimen_longitude) === 100.5018,
    "the serialized Qimen preference write preserves its complete coordinate pair");

  await db.query(`CREATE FUNCTION ${forcedPreferenceFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.locale='ru' THEN RAISE EXCEPTION 'forced private preference failure'; END IF; RETURN NEW; END;
  $$`);
  await db.query(`CREATE TRIGGER ${forcedPreferenceTrigger}
    BEFORE INSERT OR UPDATE ON mobile_notification_prefs FOR EACH ROW EXECUTE FUNCTION ${forcedPreferenceFunction}()`);
  forcedPreferenceFixtureCreated = true;
  result = await api("/api/mobile/v1/notifications", tokens[1], {
    method: "POST", body: JSON.stringify({ action: "prefs", daily: true, locale: "ru" }),
  });
  rows = await db.query(`SELECT np.daily_enabled,np.locale,u.locale AS user_locale,u.timezone AS user_timezone
      FROM mobile_notification_prefs np JOIN users u ON u.id=np.user_id WHERE np.user_id=$1`, [users[1]]);
  check(result.response.status === 500 && result.data.error === "notification_preferences_failed"
    && rows.rows[0].daily_enabled === false && rows.rows[0].locale === "zh"
    && rows.rows[0].user_locale === "zh" && rows.rows[0].user_timezone === "America/Los_Angeles"
    && !JSON.stringify(result.data).includes("forced private"),
  "a failed preference API transaction rolls back all fields and returns only generic error truth");
  await db.query(`DROP TRIGGER ${forcedPreferenceTrigger} ON mobile_notification_prefs`);
  await db.query(`DROP FUNCTION ${forcedPreferenceFunction}()`);
  forcedPreferenceFixtureCreated = false;

  const engagementNotificationId = crypto.randomUUID();
  const engagementAttemptId = crypto.randomUUID();
  const engagementPayload = {
    v: 1,
    kind: "daily",
    accountId: users[1],
    slot: "morning",
    date: "2026-08-16",
    url: "/today",
  };
  await db.query(
    `INSERT INTO mobile_push_log(id,user_id,yam_key,kind,title,body,payload,source_facts,delivery_status,attempt_count,accepted_at,sent_at,updated_at)
     VALUES($1,$2,$3,'daily','Safe','Safe',$4::jsonb,$5::jsonb,'accepted',1,now(),now(),now())`,
    [engagementNotificationId, users[1], `engagement-${engagementNotificationId}`, JSON.stringify(engagementPayload),
      JSON.stringify({ profileId: crypto.randomUUID(), latitude: 13.7563, longitude: 100.5018 })],
  );
  const engagementToken = (await db.query(
    `SELECT id,installation_id FROM mobile_push_tokens WHERE user_id=$1 ORDER BY enabled DESC,updated_at DESC LIMIT 1`,
    [users[1]],
  )).rows[0];
  await db.query(
    `INSERT INTO mobile_push_attempts(id,push_log_id,token_id,installation_id,provider,provider_message,message_sha256,status,
       provider_message_id,send_count,send_started_at,accepted_at,updated_at)
     VALUES($1,$2,$3,$4,'fcm','{}',repeat('e',64),'provider_accepted',$5,1,now()-interval '1 second',now(),now())`,
    [engagementAttemptId, engagementNotificationId, engagementToken.id, engagementToken.installation_id, `engagement-message-${engagementAttemptId}`],
  );
  result = await api("/api/mobile/v1/notifications", tokens[1]);
  const engagementHistory = result.data.items?.find((item) => item.id === engagementNotificationId);
  check(result.response.status === 200
    && engagementHistory?.payload?.notificationId === engagementNotificationId
    && Object.keys(engagementHistory.payload).length === Object.keys(engagementPayload).length + 1
    && !Object.hasOwn(engagementHistory, "source_facts")
    && !JSON.stringify(engagementHistory).includes("latitude"),
  "notification history adds only its authoritative ID and never exposes backend audit facts or coordinates");
  const engagementBody = {
    action: "engagement", notificationId: engagementNotificationId,
    installationId: engagementToken.installation_id, event: "app_received",
  };
  result = await api("/api/mobile/v1/notifications", tokens[1], { method: "POST", body: JSON.stringify(engagementBody) });
  check(result.response.status === 200 && result.data.recorded === true, "authenticated app_received evidence is recorded without claiming OS delivery");
  result = await api("/api/mobile/v1/notifications", tokens[1], { method: "POST", body: JSON.stringify(engagementBody) });
  check(result.response.status === 200 && result.data.recorded === false, "replayed engagement evidence is idempotent");
  result = await api("/api/mobile/v1/notifications", tokens[0], { method: "POST", body: JSON.stringify(engagementBody) });
  check(result.response.status === 404 && result.data.error === "notification_not_found", "cross-account engagement fails without an ownership oracle");
  result = await api("/api/mobile/v1/notifications", tokens[1], { method: "POST", body: JSON.stringify({ ...engagementBody, event: "action" }) });
  check(result.response.status === 400 && result.data.error === "invalid_engagement", "action engagement requires one bounded stable action identifier");

  result = await api("/api/mobile/v1/push", tokens[1], { method: "DELETE", body: JSON.stringify({}) });
  check(result.response.status === 200 && result.data.subscribed === false, `unregister-all serializes and completes without a SQL grouping error (${result.response.status}/${result.data.error || "ok"})`);
  rows = await db.query(`SELECT count(*)::int n FROM mobile_push_tokens WHERE user_id=$1 AND enabled=true`, [users[1]]);
  check(rows.rows[0].n === 0, "unregister-all leaves no active token for its account");

  await db.query(`INSERT INTO mobile_zibai_installations(user_id,installation_id,location_permission,latitude,longitude,location_timezone,location_captured_at,location_expires_at)
    VALUES($1,$2,'background',13.75,100.5,'Asia/Bangkok',now(),now()+interval '24 hours')
    ON CONFLICT(user_id,installation_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude`,
  [users[1], engagementToken.installation_id]);

  result = await api("/api/mobile/v1/session", tokens[1], { method: "DELETE" });
  check(result.response.status === 200 && result.data.revoked_server_session === true, "logout revokes the mobile session");
  rows = await db.query(`SELECT count(*)::int n FROM mobile_push_tokens WHERE user_id=$1 AND enabled=true`, [users[1]]);
  check(rows.rows[0].n === 0, "logout disables native push for the old account");
  rows = await db.query(`SELECT count(*)::int n FROM mobile_zibai_installations WHERE user_id=$1`, [users[1]]);
  check(rows.rows[0].n === 0, "logout immediately deletes retained Zi Bai coordinates for the signed-out account");

  result = await fetch(`${base}/api/internal/jobs/mobile-push-receipts`, { method: "POST" });
  check(result.status === 404, "receipt worker is hidden without its internal bearer secret");
  console.log(`${checks} mobile push checks passed`);
} finally {
  if (db._connected) {
    if (forcedFixtureCreated) {
      await db.query(`DROP TRIGGER IF EXISTS ${forcedTrigger} ON mobile_push_tokens`).catch(() => null);
      await db.query(`DROP FUNCTION IF EXISTS ${forcedFunction}()`).catch(() => null);
    }
    if (forcedPreferenceFixtureCreated) {
      await db.query(`DROP TRIGGER IF EXISTS ${forcedPreferenceTrigger} ON mobile_notification_prefs`).catch(() => null);
      await db.query(`DROP FUNCTION IF EXISTS ${forcedPreferenceFunction}()`).catch(() => null);
    }
    await db.query(`DELETE FROM mobile_notification_engagements WHERE user_id=ANY($1::uuid[])`, [users]).catch(() => null);
    await db.query(`DELETE FROM mobile_push_attempts WHERE push_log_id IN (SELECT id FROM mobile_push_log WHERE user_id=ANY($1::uuid[]))`, [users]).catch(() => null);
    await db.query(`DELETE FROM mobile_push_log WHERE user_id=ANY($1::uuid[])`, [users]).catch(() => null);
    await db.query(`DELETE FROM mobile_push_tokens WHERE user_id=ANY($1::uuid[])`, [users]).catch(() => null);
    await db.query(`UPDATE users SET current_org_id=NULL WHERE id=ANY($1::uuid[])`, [users]).catch(() => null);
    await db.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
    await db.query(`DELETE FROM users WHERE id=ANY($1::uuid[])`, [users]).catch(() => null);
    await db.end().catch(() => null);
  }
}
