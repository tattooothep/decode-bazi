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

assert.match(migration, /CREATE UNIQUE INDEX[^;]+mobile_push_tokens[^;]+installation_id[^;]+WHERE enabled=true/isu);
assert.match(migration, /CREATE UNIQUE INDEX[^;]+mobile_push_tokens[^;]+device_push_token[^;]+WHERE enabled=true[^;]+device_push_token IS NOT NULL/isu);
assert.match(migration, /privacy_preview\s+boolean\s+NOT NULL\s+DEFAULT false/iu);
assert.match(rollback, /DROP COLUMN IF EXISTS privacy_preview/iu);

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
assert.match(
  route,
  /async function DELETE[\s\S]+UPDATE mobile_push_tokens SET enabled=false[\s\S]+return NextResponse\.json\(\{ ok: true, subscribed: false \}\)/u,
  "unregister must stay idempotent and always return an unsubscribed result",
);
assert.doesNotMatch(route, /console\.(?:log|info|warn|error)[\s\S]{0,160}(?:expo_push_token|device_push_token|deviceToken|token)/iu,
  "push route must never log a raw provider token");

assert.match(notificationsRoute, /privacy_preview:\s*boolean/iu,
  "notification preferences must read the privacy-preview column");
assert.match(notificationsRoute, /privacyPreview:\s*row\.privacy_preview/iu,
  "preference responses must expose the persisted privacy-preview value");
assert.match(notificationsRoute, /privacy_preview:\s*false/iu,
  "missing preference rows must default privacy preview to false");
assert.match(notificationsRoute, /body\?\.privacyPreview/iu,
  "preference updates must accept privacyPreview");
assert.match(notificationsRoute, /privacy_preview[\s\S]+\$18/iu,
  "preference upserts must persist privacy-preview values");

console.log("NOTIFICATION_INTEGRITY_CONTRACT_OK");
