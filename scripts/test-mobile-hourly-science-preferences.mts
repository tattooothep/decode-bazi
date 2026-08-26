import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ziweiNotificationContextChanged } from "../src/lib/mobile-notification-preferences";
import { resolveEligibleZiweiBirthWallClock } from "../src/lib/astro/ziwei/hourly-preview";

const prefs = readFileSync("src/lib/mobile-notification-preferences.ts", "utf8");
const route = readFileSync("src/app/api/mobile/v1/notifications/route.ts", "utf8");
const push = readFileSync("src/app/api/mobile/v1/push/route.ts", "utf8");
const scheduler = readFileSync("scripts/mobile-ziwei-hourly-push-cron.mts", "utf8");
const migration = readFileSync("migrations/20260826_mobile_hourly_sciences.sql", "utf8");

for (const token of ["ziwei_hourly_enabled", "ziwei_profile_id", "qizheng_electional_enabled"]) {
  assert.match(prefs, new RegExp(`\\b${token}\\b`, "u"));
  assert.match(route, new RegExp(`\\b${token}\\b`, "u"));
}
assert.match(prefs, /body\.ziweiHourly/u);
assert.match(prefs, /body\.ziweiProfileId/u);
assert.match(prefs, /body\.qizhengElectional === true/u);
assert.match(prefs, /qizheng_electional_unavailable/u);
assert.match(prefs, /created_by_user_id=\$2/u);
assert.match(prefs, /relationship_type IS NULL OR btrim\(relationship_type\) = ''/u);
assert.match(prefs, /gender IN \('M','F'\)/u);
assert.doesNotMatch(prefs, /birth_lat BETWEEN -90 AND 90|birth_lng BETWEEN -180 AND 180/u,
  "Ziwei consent must not require metadata-only coordinates when birth timezone is explicit");
assert.match(prefs, /parseTz\(owned\.rows\[0\]\.birth_tz\)/u,
  "consent must validate the durable birth timezone with the shared parser");
assert.match(prefs, /if \(ziweiHourly \|\| body\.ziweiProfileId !== undefined\)/u,
  "enabling/changing selection is strict while disabling always remains reachable");
assert.match(prefs, /mobile_ziwei_hourly_installations/u);
assert.match(prefs, /t\.ziwei_payload_schema=2/u);
assert.match(prefs, /if \(ziweiSchema\.rows\[0\]\?\.available === true && ziweiContextChanged\)/u,
  "unrelated preference writes must not invalidate an admitted Ziwei occurrence");

const context = Object.freeze({
  enabled: true,
  profileId: "00000000-0000-4000-8000-000000000001",
  referenceTimezone: "Asia/Bangkok",
  quietStart: 22,
  quietEnd: 7,
  locale: "th",
  privacyPreview: false,
});
assert.equal(ziweiNotificationContextChanged(context, { ...context }), false);
for (const changed of [
  { enabled: false },
  { profileId: "00000000-0000-4000-8000-000000000002" },
  { referenceTimezone: "Asia/Tokyo" },
  { quietStart: 21 },
  { quietEnd: 8 },
  { locale: "en" },
  { privacyPreview: true },
]) assert.equal(ziweiNotificationContextChanged(context, { ...context, ...changed }), true);

const historyKinds = route.slice(route.indexOf("const KINDS"), route.indexOf("const UUID_RE"));
assert.match(historyKinds, /"ziwei"/u);
assert.doesNotMatch(historyKinds, /"qizheng"/u,
  "Qizheng cannot become a notification-history category before its rule pack is reproducible");
assert.match(route, /ziweiHourly: row\.ziwei_hourly_enabled/u);
assert.match(route, /ziweiProfileId: row\.ziwei_profile_id/u);
assert.match(route, /qizhengElectional: false/u);
assert.match(route, /qizhengElectionalAvailable: false/u);

assert.match(push, /ziweiPayloadSchema/u);
assert.match(push, /qizhengPayloadSchema/u);
assert.match(push, /ziwei_payload_schema,qizheng_payload_schema/u);
assert.match(push, /DELETE FROM mobile_ziwei_hourly_installations/u);
assert.match(push, /COALESCE\(\$4,np\.timezone,u\.timezone,'Asia\/Bangkok'\)/u,
  "authenticated device timezone wins immediately when refreshing the Ziwei installation");
assert.doesNotMatch(push, /last_skip_reason='registration_refresh'/u,
  "an idempotent foreground registration must not invalidate the current Ziwei occurrence");
assert.match(push, /const accountLocaleChanged =/u);
assert.match(push, /WHERE mobile_ziwei_hourly_installations\.profile_id IS DISTINCT FROM EXCLUDED\.profile_id/u,
  "registration may advance generation only when the Ziwei context materially changes");
assert.match(push, /OR mobile_ziwei_hourly_installations\.enabled IS DISTINCT FROM EXCLUDED\.enabled/u);
assert.match(push, /OR mobile_ziwei_hourly_installations\.reference_timezone IS DISTINCT FROM EXCLUDED\.reference_timezone/u);
for (const source of [push, scheduler]) {
  assert.match(source, /p\.gender IN \('M','F'\)/u);
  assert.doesNotMatch(source, /p\.birth_lat BETWEEN -90 AND 90|p\.birth_lng BETWEEN -180 AND 180/u);
  assert.match(source, /NULLIF\(btrim\(p\.birth_tz\),''\) IS NOT NULL/u);
  assert.match(source, /hourkey_ziwei_birth_wall_eligible\(p\.birth_datetime,p\.birth_tz\)/u,
    "registration and scheduling must share the exact natal wall-clock eligibility gate");
}
assert.match(scheduler, /const birthLocation =[\s\S]*?\? \{ lat: latitude, lng: longitude \}[\s\S]*?: null/u,
  "missing metadata coordinates must remain explicit null, never invented as a real birthplace");
assert.match(migration, /hourkey_reconcile_ziwei_hourly_profile/u);
assert.match(migration, /last_skip_reason='profile_ineligible'/u);
assert.match(migration, /last_skip_reason='profile_changed'/u);

assert.equal(
  resolveEligibleZiweiBirthWallClock("1984-12-31T13:15:00", "Asia/Bangkok").toISOString(),
  "1984-12-31T06:15:00.000Z",
);
assert.equal(
  resolveEligibleZiweiBirthWallClock("1984-12-31T13:15:00", "+07:00").toISOString(),
  "1984-12-31T06:15:00.000Z",
  "fixed-offset natal clocks remain eligible",
);
for (const [wall, timezone, error] of [
  ["1984-12-31T23:30:00", "Asia/Bangkok", /ziwei_hourly_late_zi_birth_unsupported/u],
  ["1900-01-30T12:00:00", "Asia/Bangkok", /ziwei_hourly_calendar_range_unsupported/u],
  ["2101-01-01T12:00:00", "+07:00", /ziwei_hourly_calendar_range_unsupported/u],
  ["2026-03-08T02:30:00", "America/New_York", /ziwei_hourly_ambiguous_birth_wall_clock/u],
  ["2026-11-01T01:30:00", "America/New_York", /ziwei_hourly_ambiguous_birth_wall_clock/u],
] as const) {
  assert.throws(() => resolveEligibleZiweiBirthWallClock(wall, timezone), error);
}

console.log("PASS mobile hourly science preferences — separate toggles, self profile, Qizheng hard unavailable");
