import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import pg from "pg";
import { resolveNotificationPayload } from "../../hourkey-v197-mobile/src/navigation/notificationPayload.ts";

const require = createRequire(import.meta.url);
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const yam = require("./mobile-yam-push-cron.cjs");
const daily = require("./mobile-daily-fortune-push-cron.cjs");
const personal = require("./mobile-personal-reminders-cron.cjs");
const shrine = require("./mobile-auspicious-push-cron.cjs");
const monthly = require("./mobile-monthly-report-push-cron.cjs");
const network = require("./mobile-network-morning-push-cron.cjs");
const admin = await import("./workers/admin-notify-watcher.mjs");
const fixture = JSON.parse(readFileSync("test-fixtures/notifications/task3-source-results.sanitized.json", "utf8"));

const token = {
  id: fixture.tokenId, expo_push_token: "ExponentPushToken[source-replay]", expo: "ExponentPushToken[source-replay]",
  device_push_token: null, device: null, device_token_type: "apns", deviceType: "apns",
  platform: "ios", locale: "en",
};
const user = {
  id: fixture.accountId, profile_id: fixture.profileId, tokens: [token], user_timezone: fixture.timezone,
  yam_min_quality: "good", yam_lead_minutes: 60,
};
const runAt = new Date(fixture.runAt);

const notices: Array<{ name: string; accountLocale: string; notice: any; parse: boolean }> = [
  { name: "yam", accountLocale: "en", notice: yam.buildYamProducer(user, fixture.yam), parse: true },
  { name: "daily", accountLocale: "zh", notice: daily.buildDailyProducer(user, fixture.daily), parse: true },
  { name: "monthly", accountLocale: "ja", notice: monthly.buildMonthlyNotice(user, fixture.monthly.date), parse: false },
  { name: "network", accountLocale: "cn", notice: network.buildNetworkNotice(user, fixture.network.date, fixture.network.api), parse: false },
  { name: "saved_date", accountLocale: "en", notice: personal.buildSavedDateProducer(user, fixture.savedDate, runAt), parse: true },
  { name: "qimen", accountLocale: "zh", notice: personal.buildQimenProducer(user, fixture.qimen.request, fixture.qimen.api), parse: true },
  { name: "shrine", accountLocale: "cn", notice: shrine.buildShrineProducer(user, fixture.shrine), parse: true },
  { name: "goal", accountLocale: "vi", notice: personal.buildGoalProducer(user, fixture.goal), parse: true },
  { name: "security", accountLocale: "th", notice: admin.buildAdminMobileNotice({
    userId: user.id, eventId: fixture.security.eventId, eventType: fixture.security.eventType,
    eventPayload: fixture.security.eventPayload, msg: admin.messageFor(fixture.security.eventType, "th", fixture.security.eventPayload), tokens: [token],
  }), parse: true },
  { name: "service", accountLocale: "en", notice: admin.buildAdminMobileNotice({
    userId: user.id, eventId: fixture.service.eventId, eventType: fixture.service.eventType,
    eventPayload: fixture.service.eventPayload, msg: admin.messageFor(fixture.service.eventType, "en", fixture.service.eventPayload), tokens: [token],
  }), parse: true },
];

for (const item of notices) {
  assert.ok(item.notice && item.notice.historyCopies, `${item.name} live producer must return a durable localized notice`);
  assert.equal(item.notice.payload.accountId, fixture.accountId);
  assert.equal(item.notice.messages[0].data, item.notice.payload, `${item.name} producer must share one typed payload instance`);
}

const database = `notification_source_replay_test_${process.pid}`;
const role = `notification_source_replay_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
assert.match(database, /^notification_source_replay_test_/u);
function psql(db: string, sql: string) {
  return execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"], {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
let pool: pg.Pool | null = null;
try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY,timezone text,locale text);
    CREATE TABLE mobile_notification_prefs(user_id uuid PRIMARY KEY,timezone text,max_per_day int,privacy_preview boolean,locale text);
    CREATE TABLE mobile_push_tokens(id uuid PRIMARY KEY,user_id uuid,installation_id uuid,device_push_token text,device_token_type text,expo_push_token text,platform text,enabled boolean);
    CREATE TABLE mobile_push_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,yam_key text,kind text,title text,body text,payload jsonb,source_facts jsonb,delivery_status text,attempt_count int,next_retry_at timestamptz,accepted_at timestamptz,sent_at timestamptz,last_error text,updated_at timestamptz,delivery_model_generation smallint NOT NULL DEFAULT 0,UNIQUE(user_id,yam_key));
    CREATE TABLE mobile_push_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),push_log_id uuid,token_id uuid,installation_id uuid,provider text,provider_message jsonb,message_sha256 text,privacy_safe boolean,transactional boolean,status text,next_retry_at timestamptz,updated_at timestamptz,UNIQUE(push_log_id,installation_id));
    INSERT INTO users VALUES('${fixture.accountId}','${fixture.timezone}','th');
    INSERT INTO mobile_notification_prefs VALUES('${fixture.accountId}','${fixture.timezone}',100,false,'en');
    INSERT INTO mobile_push_tokens VALUES('${fixture.tokenId}','${fixture.accountId}','${fixture.installationId}',NULL,'apns','ExponentPushToken[source-replay]','ios',true);
    GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};
  `);
  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 2 });
  for (const item of notices) {
    await pool.query(`UPDATE mobile_notification_prefs SET locale=$2 WHERE user_id=$1`, [fixture.accountId, item.accountLocale]);
    const reservation = await delivery.reserve(pool, item.notice);
    assert.ok(reservation, `${item.name} live notice must use durable reservation`);
    const stored = (await pool.query(`SELECT l.title,l.body,l.payload,l.source_facts,a.provider_message
      FROM mobile_push_log l JOIN mobile_push_attempts a ON a.push_log_id=l.id WHERE l.id=$1`, [reservation.id])).rows[0];
    const family = item.accountLocale === "th" ? "th" : ["zh", "cn"].includes(item.accountLocale) ? "zh" : "en";
    assert.deepEqual({ title: stored.title, body: stored.body }, item.notice.historyCopies[family], `${item.name} parent history locale mismatch`);
    assert.ok(stored.title.length >= 4 && stored.body.length >= 12, `${item.name} parent history must remain useful`);
    assert.deepEqual(stored.source_facts, item.notice.sourceFacts, `${item.name} source facts changed before storage`);
    assert.deepEqual(stored.payload, item.notice.payload, `${item.name} typed payload changed before storage`);
    assert.equal(stored.provider_message.title, "Private notification", `${item.name} privacy-off lock screen title must be redacted`);
    assert.equal(stored.provider_message.body, "Open HourKey to view details", `${item.name} privacy-off lock screen body must be redacted`);
    const { notificationId, ...providerFacts } = stored.provider_message.data;
    assert.equal(notificationId, reservation.id, `${item.name} provider envelope must identify its exact durable parent`);
    assert.deepEqual(providerFacts, stored.payload, `${item.name} provider facts must equal stored payload plus only the server notification ID`);
    if (item.parse) assert.deepEqual(resolveNotificationPayload(providerFacts, item.notice.kind, fixture.accountId), stored.payload);
  }
  const localizedPreview = { ...notices.find((item) => item.name === "daily")!.notice };
  localizedPreview.key = `${localizedPreview.key}|localized-preview`;
  await pool.query(`UPDATE mobile_notification_prefs SET locale='zh',privacy_preview=true WHERE user_id=$1`, [fixture.accountId]);
  const previewReservation = await delivery.reserve(pool, localizedPreview);
  const previewStored = (await pool.query(`SELECT l.title,l.body,a.provider_message
    FROM mobile_push_log l JOIN mobile_push_attempts a ON a.push_log_id=l.id WHERE l.id=$1`, [previewReservation.id])).rows[0];
  assert.deepEqual(
    { title: previewStored.title, body: previewStored.body },
    localizedPreview.historyCopies.zh,
    "authenticated parent history follows the account locale independently of the installation locale",
  );
  assert.deepEqual(
    { title: previewStored.provider_message.title, body: previewStored.provider_message.body },
    { title: localizedPreview.messages[0].title, body: localizedPreview.messages[0].body },
    "privacy-enabled provider preview keeps the individual installation locale",
  );

  // Transactional security/service notifications remain deliverable without
  // a preference row. Their authenticated history follows the account locale,
  // while the provider preview independently follows the installation locale.
  await pool.query(`DELETE FROM mobile_notification_prefs WHERE user_id=$1`, [fixture.accountId]);
  await pool.query(`UPDATE users SET locale='en' WHERE id=$1`, [fixture.accountId]);
  const securityNoPrefs = structuredClone(notices.find((item) => item.name === "security")!.notice);
  securityNoPrefs.key = `${securityNoPrefs.key}|no-prefs-en`;
  securityNoPrefs.messages = securityNoPrefs.messages.map((message: any) => ({
    ...message, locale: "zh", ...securityNoPrefs.historyCopies.zh,
  }));
  const securityReservation = await delivery.reserve(pool, securityNoPrefs);
  const securityStored = (await pool.query(`SELECT l.title,l.body,a.provider_message
    FROM mobile_push_log l JOIN mobile_push_attempts a ON a.push_log_id=l.id WHERE l.id=$1`, [securityReservation.id])).rows[0];
  assert.deepEqual(
    { title: securityStored.title, body: securityStored.body },
    securityNoPrefs.historyCopies.en,
    "no-prefs transactional security history falls back to users.locale=en",
  );
  assert.deepEqual(
    { title: securityStored.provider_message.title, body: securityStored.provider_message.body },
    { title: "私人通知", body: "開啟 HourKey 查看詳情" },
    "no-prefs security provider preview keeps the zh installation locale",
  );

  await pool.query(`UPDATE users SET locale='zh' WHERE id=$1`, [fixture.accountId]);
  const serviceNoPrefs = structuredClone(notices.find((item) => item.name === "service")!.notice);
  serviceNoPrefs.key = `${serviceNoPrefs.key}|no-prefs-zh`;
  serviceNoPrefs.messages = serviceNoPrefs.messages.map((message: any) => ({
    ...message, locale: "en", ...serviceNoPrefs.historyCopies.en,
  }));
  const serviceReservation = await delivery.reserve(pool, serviceNoPrefs);
  const serviceStored = (await pool.query(`SELECT l.title,l.body,a.provider_message
    FROM mobile_push_log l JOIN mobile_push_attempts a ON a.push_log_id=l.id WHERE l.id=$1`, [serviceReservation.id])).rows[0];
  assert.deepEqual(
    { title: serviceStored.title, body: serviceStored.body },
    serviceNoPrefs.historyCopies.zh,
    "no-prefs transactional service history falls back to users.locale=zh",
  );
  assert.deepEqual(
    { title: serviceStored.provider_message.title, body: serviceStored.provider_message.body },
    { title: "Private notification", body: "Open HourKey to view details" },
    "no-prefs service provider preview keeps the en installation locale",
  );

  await pool.query(`UPDATE users SET locale='unsupported-private-locale' WHERE id=$1`, [fixture.accountId]);
  const invalidLocaleService = structuredClone(serviceNoPrefs);
  invalidLocaleService.key = `${invalidLocaleService.key}|safe-th`;
  const invalidLocaleReservation = await delivery.reserve(pool, invalidLocaleService);
  const invalidLocaleStored = (await pool.query(`SELECT title,body FROM mobile_push_log WHERE id=$1`, [invalidLocaleReservation.id])).rows[0];
  assert.deepEqual(
    { title: invalidLocaleStored.title, body: invalidLocaleStored.body },
    invalidLocaleService.historyCopies.th,
    "an invalid no-prefs users.locale falls back deterministically to Thai",
  );
  console.log(`NOTIFICATION_SOURCE_REPLAY_TASK3_OK notices=${notices.length}`);
} finally {
  await pool?.end().catch(() => null);
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`);
}
