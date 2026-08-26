import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("migrations/20260827_ziwei_birth_context_recovery.sql");
const preferences = read("src/lib/mobile-notification-preferences.ts");
const push = read("src/app/api/mobile/v1/push/route.ts");
const scheduler = read("scripts/mobile-ziwei-hourly-push-cron.mts");
const preview = read("src/app/api/mobile/v1/ziwei/hourly-preview/route.ts");
const chart = read("src/app/api/mobile/v1/ziwei/route.ts");

assert.match(migration, /ADD COLUMN IF NOT EXISTS birth_context_fingerprint text/u);
assert.match(migration, /hourkey_ziwei_birth_context_confirmed/u);
assert.match(migration, /source_value IN \('user_confirmed_iana','user_confirmed_exact_offset','verified_import'\)/u);
assert.match(migration, /hourkey_ziwei_birth_context_confirmed\(NEW\.birth_tz_source,NEW\.birth_tz_confirmed_at\)/u);

for (const [name, source] of [
  ["preferences", preferences],
  ["push", push],
  ["scheduler", scheduler],
  ["preview", preview],
] as const) {
  assert.match(source, /resolveCanonicalZiweiHourlyContext/u,
    `${name} must consume the one backend-owned canonical hourly context resolver`);
}
assert.match(chart, /resolveCanonicalZiweiContext/u,
  "the ordinary chart keeps the canonical legacy-compatible context resolver");

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

console.log("PASS Ziwei canonical consumers — chart/preview/prefs/push/scheduler share one resolver fingerprint");
