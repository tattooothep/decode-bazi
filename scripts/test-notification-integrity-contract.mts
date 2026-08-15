import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = "migrations/20260815_mobile_notification_integrity.sql";
const rollbackPath = "migrations/20260815_mobile_notification_integrity.rollback.sql";
assert.equal(existsSync(migrationPath), true, "notification integrity migration must exist");
assert.equal(existsSync(rollbackPath), true, "notification integrity rollback must exist");
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const route = readFileSync("src/app/api/mobile/v1/push/route.ts", "utf8");
const notificationsRoute = readFileSync("src/app/api/mobile/v1/notifications/route.ts", "utf8");
const notificationPreferences = readFileSync("src/lib/mobile-notification-preferences.ts", "utf8");
const notificationPreferenceSources = `${notificationsRoute}\n${notificationPreferences}`;

assert.match(migration, /CREATE UNIQUE INDEX[^;]+mobile_push_tokens[^;]+installation_id[^;]+WHERE enabled=true/isu);
assert.match(migration, /CREATE UNIQUE INDEX[^;]+mobile_push_tokens[^;]+device_push_token[^;]+WHERE enabled=true[^;]+device_push_token IS NOT NULL/isu);
assert.match(migration, /privacy_preview\s+boolean\s+NOT NULL\s+DEFAULT false/iu);
assert.match(migration, /locale\s+text\s+NOT NULL\s+DEFAULT 'th'/iu);
assert.match(migration, /mobile_notification_prefs_locale_check/iu);
assert.match(rollback, /DROP COLUMN IF EXISTS privacy_preview/iu);
assert.match(rollback, /DROP COLUMN IF EXISTS locale/iu);
assert.doesNotMatch(rollback, /DROP INDEX IF EXISTS ux_mobile_push_tokens_active_/iu,
  "rollback must retain active-owner enforcement");

assert.match(
  route,
  /BEGIN[\s\S]+UPDATE mobile_push_tokens[\s\S]+user_id<>\$1[\s\S]+installation_id=\$2::uuid[\s\S]+device_push_token=\$\d+[\s\S]+INSERT INTO mobile_push_tokens[\s\S]+COMMIT/u,
  "registration must transfer installation/native-token ownership before upsert in one transaction",
);
assert.doesNotMatch(
  route,
  /\/\/ A reinstall[\s\S]+await q\(/u,
  "the one-active-installation update may not run after commit",
);

assert.match(route, /pg_advisory_xact_lock/iu, "ownership transfers must serialize concurrent registrations");
assert.match(route, /lockIdentitySet\(client, "user"/iu, "registration and unregister must serialize same-account lifecycle changes");
assert.match(
  route,
  /await lockIdentitySet\(client, "user"[\s\S]+await lockIdentitySet\(client, "expo"[\s\S]+await lockIdentitySet\(client, "installation"[\s\S]+await lockIdentitySet\(client, "native"/u,
  "all mutations must take identity advisory locks in one global user/expo/installation/native order",
);
const postStart = route.indexOf('export async function POST');
const deleteStart = route.indexOf('export async function DELETE');
const postRoute = route.slice(postStart, deleteStart);
const deleteRoute = route.slice(deleteStart);
assert.ok(
  postRoute.indexOf("FOR UPDATE") > postRoute.indexOf("await lockPushIdentities"),
  "POST must acquire all advisory identity locks before row locks",
);
assert.ok(
  deleteRoute.indexOf("FOR UPDATE") > deleteRoute.indexOf("await lockPushIdentities"),
  "DELETE must acquire advisory installation locks before row locks",
);
assert.match(
  route,
  /async function DELETE[\s\S]+UPDATE mobile_push_tokens SET enabled=false[\s\S]+return NextResponse\.json\(\{ ok: true, subscribed: false \}\)/u,
  "unregister must stay idempotent and always return an unsubscribed result",
);
assert.doesNotMatch(route, /console\.(?:log|info|warn|error)[\s\S]{0,160}(?:expo_push_token|device_push_token|deviceToken|token)/iu,
  "push route must never log a raw provider token");
assert.doesNotMatch(route, /device_push_token=COALESCE\(EXCLUDED\.device_push_token/iu,
  "legacy registrations must clear rather than resurrect a stored native token");
assert.match(route, /push_registration_conflict|push_registration_failed/iu,
  "database failures must return a sanitized registration error");

assert.match(notificationPreferenceSources, /privacy_preview:\s*boolean/iu,
  "notification preferences must read the privacy-preview column");
assert.match(notificationsRoute, /privacyPreview:\s*row\.privacy_preview/iu,
  "preference responses must expose the persisted privacy-preview value");
assert.match(notificationPreferenceSources, /privacy_preview:\s*false/iu,
  "missing preference rows must default privacy preview to false");
assert.match(notificationPreferenceSources, /body\??\.privacyPreview/iu,
  "preference updates must accept privacyPreview");
assert.match(notificationPreferences, /privacy_preview[\s\S]+\$18/iu,
  "preference upserts must persist privacy-preview values");
assert.match(notificationPreferenceSources, /locale:\s*string/iu,
  "notification preferences must read the server locale");
assert.match(notificationPreferenceSources, /locale:\s*"th"/iu,
  "missing preference rows must default locale safely");
assert.match(notificationsRoute, /locale:\s*row\.locale/iu,
  "preference responses must expose the persisted locale");
assert.match(notificationPreferenceSources, /body\??\.locale/iu,
  "preference updates must accept locale");
assert.match(notificationsRoute, /delivery_status\s+IN\s*\('accepted','delivered'\)/iu,
  "provider-accepted and receipt-delivered notifications must both remain visible");
assert.match(notificationsRoute, /delivery_status:\s*r\.delivery_status/iu,
  "notification history must expose provider acceptance versus receipt delivery");

for (const cronPath of [
  "scripts/mobile-yam-push-cron.cjs",
  "scripts/mobile-daily-fortune-push-cron.cjs",
  "scripts/mobile-auspicious-push-cron.cjs",
  "scripts/mobile-personal-reminders-cron.cjs",
]) {
  const cron = readFileSync(cronPath, "utf8");
  assert.match(cron, /delivery_status\s+IN\s*\('accepted','delivered'\)/iu,
    `${cronPath} must count accepted and delivered parents toward notification caps`);
}

console.log("NOTIFICATION_INTEGRITY_CONTRACT_OK");
