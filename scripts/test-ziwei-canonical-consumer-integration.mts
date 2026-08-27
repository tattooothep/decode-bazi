import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("migrations/20260827_ziwei_birth_context_recovery.sql");
const preferences = read("src/lib/mobile-notification-preferences.ts");
const push = read("src/app/api/mobile/v1/push/route.ts");
const scheduler = read("scripts/mobile-ziwei-hourly-push-cron.mts");
const recoveryPreflight = read("scripts/preflight-ziwei-birth-context-recovery.mts");
const preview = read("src/app/api/mobile/v1/ziwei/hourly-preview/route.ts");
const chart = read("src/app/api/mobile/v1/ziwei/route.ts");
const recoveryCompat = read("src/app/api/mobile/v1/notifications/ziwei-recovery/route.ts");

assert.match(migration, /ADD COLUMN IF NOT EXISTS birth_context_fingerprint text/u);
assert.match(migration, /hourkey_ziwei_birth_context_confirmed/u);
assert.match(migration, /source_value IN \('user_confirmed_iana','user_confirmed_exact_offset','verified_import'\)/u);
assert.match(migration, /hourkey_ziwei_birth_context_confirmed\(NEW\.birth_tz_source,NEW\.birth_tz_confirmed_at\)/u);

for (const [name, source] of [
  ["preferences", preferences],
  ["push", push],
  ["scheduler", scheduler],
  ["recovery preflight", recoveryPreflight],
  ["preview", preview],
] as const) {
  assert.match(source, /resolveCanonicalZiweiHourlyContext/u,
    `${name} must consume the one backend-owned canonical hourly context resolver`);
}
assert.match(chart, /resolveCanonicalZiweiContext/u,
  "the ordinary chart keeps the canonical legacy-compatible context resolver");
assert.match(chart, /created_by_user_id=\$3/u,
  "the chart profile must be owned by the authenticated mobile user, not merely share an organization");
assert.match(chart, /birth_tz_source,birth_tz_confirmed_at/u,
  "the chart must read the same stored timezone provenance used by hourly enrollment");
assert.match(chart, /APPROVED_BIRTH_TIMEZONE_SOURCES\.has/u,
  "the chart must reject unconfirmed timezone provenance instead of treating it as canonical");
assert.doesNotMatch(chart, /requestedTimezone|url\.searchParams\.get\("tz"\)/u,
  "the chart must not override stored birth truth with a mobile query parameter");
assert.doesNotMatch(chart, /Number\(row\.birth_lat \|\| 13\.7563\)|Number\(row\.birth_lng \|\| 100\.5018\)/u,
  "the chart must not manufacture Bangkok coordinates when profile facts are absent");
assert.match(chart, /\? \{ lat: birthLat, lng: birthLng \}[\s\S]{0,80}: \{ lat: 0, lng: 0 \}/u,
  "missing metadata coordinates must use the same explicit neutral policy as hourly preview");
assert.doesNotMatch(chart, /charAt\(0\) === "f" \? "F" : "M"/u,
  "the chart must not manufacture male gender from missing or invalid profile facts");

assert.match(preferences, /birth_tz_source/u);
assert.match(preferences, /birth_tz_confirmed_at/u);
assert.match(preferences, /canonicalContext\.status !== "resolved"/u);
assert.match(preferences, /canonicalContext\.birthFingerprint/u);
assert.match(preferences, /birth_context_fingerprint/u);
assert.doesNotMatch(preferences, /parseTz\(owned/u,
  "preferences must not maintain a second authoritative timezone parser");

assert.match(push, /ziweiCanonicalContext/u);
assert.match(push, /ziweiCanonicalContext\.status === "resolved"/u);
assert.match(push, /birth_context_fingerprint/u);
assert.match(push, /user_confirmed_iana/u);
assert.match(push, /verified_import/u);

assert.match(scheduler, /birth_context_fingerprint/u);
assert.match(scheduler, /birth_tz_source/u);
assert.match(scheduler, /birth_tz_confirmed_at/u);
assert.match(scheduler, /canonicalContext\.birthFingerprint !== row\.birth_context_fingerprint/u);
assert.doesNotMatch(scheduler, /resolveEligibleZiweiBirthWallClock/u,
  "scheduler must consume the canonical hourly resolver instead of maintaining a second eligibility path");
assert.match(recoveryCompat, /i\.profile_id=\$3::uuid[\s\S]+i\.birth_context_fingerprint=\$4/u,
  "recovery UI installation truth must match the same profile and immutable natal fingerprint as the scheduler");

console.log("PASS Ziwei canonical consumers — chart/preview/prefs/push/scheduler share one resolver fingerprint");
