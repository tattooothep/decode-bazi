import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextCivilMinute, parseZibaiMutation, sanitizeZibaiStatus } from "../src/lib/mobile-zibai-installation.ts";

const next = nextCivilMinute(new Date("2026-11-01T04:30:00.000Z"), "America/New_York", 7 * 60);
assert.equal(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(next), "07:00");
assert.ok(next.getTime() > Date.parse("2026-11-01T04:30:00.000Z"));

assert.deepEqual(parseZibaiMutation({
  action: "settings", installationId: "10000000-0000-4000-8000-000000000001",
  dailyEnabled: true, shichenEnabled: false, dailyMinute: 420,
}), {
  action: "settings", installationId: "10000000-0000-4000-8000-000000000001",
  dailyEnabled: true, shichenEnabled: false, dailyMinute: 420,
});
assert.throws(() => parseZibaiMutation({ action: "settings", installationId: "bad", dailyEnabled: true }), /zibai_input_invalid/u);
assert.deepEqual(parseZibaiMutation({
  action: "background_location", installationId: "10000000-0000-4000-8000-000000000001",
  latitude: 13.75, longitude: 100.5, timezone: "Asia/Bangkok", capturedAt: "2026-08-16T00:59:00.000Z",
}), {
  action: "background_location", installationId: "10000000-0000-4000-8000-000000000001",
  latitude: 13.75, longitude: 100.5, timezone: "Asia/Bangkok", capturedAt: "2026-08-16T00:59:00.000Z",
});
assert.throws(() => parseZibaiMutation({
  action: "location", installationId: "10000000-0000-4000-8000-000000000001",
  permission: "background", latitude: 91, longitude: 100, timezone: "Asia/Bangkok", capturedAt: new Date().toISOString(),
}), /zibai_input_invalid/u);

const status = sanitizeZibaiStatus({
  daily_enabled: false, shichen_enabled: false, daily_minute: 420, quiet_start: 22, quiet_end: 7, location_permission: "background",
  latitude: 13.75, longitude: 100.5, location_timezone: "Asia/Bangkok",
  location_captured_at: "2026-08-16T00:00:00.000Z", location_expires_at: "2026-08-17T00:00:00.000Z",
  next_daily_at: null, next_shichen_at: "2026-08-16T01:00:00.000Z", last_skip_reason: "location_stale",
}, new Date("2026-08-16T01:00:00.000Z"));
assert.equal(status.locationFresh, true);
assert.equal(status.locationAgeSeconds, 3_600);
assert.match(status.apparentSolarTime || "", /^\d{2}:\d{2}$/u);
assert.match(status.nextShichenSolarTime || "", /^\d{2}:\d{2}$/u);
assert.equal(status.locationTimezone, "Asia/Bangkok");
assert.equal("latitude" in status, false);
assert.equal("longitude" in status, false);
assert.equal(JSON.stringify(status).includes("13.75"), false);
assert.equal(JSON.stringify(status).includes("100.5"), false);

const almostSevenDays = sanitizeZibaiStatus({
  daily_enabled: true, shichen_enabled: true, daily_minute: 420, quiet_start: 22, quiet_end: 7, location_permission: "background",
  latitude: 13.75, longitude: 100.5, location_timezone: "Asia/Bangkok",
  location_captured_at: "2026-08-16T00:00:00.000Z", location_expires_at: "2026-08-23T00:00:00.000Z",
  next_daily_at: null, next_shichen_at: null, last_skip_reason: null,
}, new Date("2026-08-22T23:59:59.000Z"));
assert.equal(almostSevenDays.locationFresh, true, "a permitted location remains usable until the seven-day lease expires");
assert.equal(almostSevenDays.locationAgeSeconds, null,
  "the unversioned status omits ages beyond the installed v216 wire limit while the lease stays fresh for seven days");

const sevenDaysExpired = sanitizeZibaiStatus({
  daily_enabled: true, shichen_enabled: true, daily_minute: 420, quiet_start: 22, quiet_end: 7, location_permission: "background",
  latitude: 13.75, longitude: 100.5, location_timezone: "Asia/Bangkok",
  location_captured_at: "2026-08-16T00:00:00.000Z", location_expires_at: "2026-08-23T00:00:00.000Z",
  next_daily_at: null, next_shichen_at: null, last_skip_reason: null,
}, new Date("2026-08-23T00:00:00.000Z"));
assert.equal(sevenDaysExpired.locationFresh, false, "the seven-day lease expires at its exact boundary");
assert.equal(sevenDaysExpired.locationAgeSeconds, null, "an expired lease exposes no retained-location age");

const absentLocation = sanitizeZibaiStatus({
  daily_enabled: false, shichen_enabled: false, daily_minute: 420, quiet_start: 22, quiet_end: 7, location_permission: "unknown",
  latitude: null, longitude: null, location_timezone: null, location_captured_at: null, location_expires_at: null,
  next_daily_at: null, next_shichen_at: null, last_skip_reason: null,
}, new Date("2026-08-16T01:00:00.000Z"));
assert.equal(absentLocation.apparentSolarTime, null, "SQL NULL longitude must not become a fabricated Greenwich clock");

const expiredLocation = sanitizeZibaiStatus({
  daily_enabled: true, shichen_enabled: false, daily_minute: 420, quiet_start: 22, quiet_end: 7, location_permission: "foreground",
  latitude: 13.75, longitude: 100.5, location_timezone: "Asia/Bangkok",
  location_captured_at: "2026-08-14T00:00:00.000Z", location_expires_at: "2026-08-15T00:00:00.000Z",
  next_daily_at: null, next_shichen_at: null, last_skip_reason: "location_expired",
}, new Date("2026-08-16T01:00:00.000Z"));
assert.equal(expiredLocation.locationAgeSeconds, null, "an overdue purge cannot emit an out-of-contract age");
assert.equal(expiredLocation.apparentSolarTime, null, "expired retained coordinates cannot produce status data");

const futureStatus = sanitizeZibaiStatus({
  daily_enabled: true, shichen_enabled: true, daily_minute: 420, quiet_start: 22, quiet_end: 7, location_permission: "background",
  latitude: 13.75, longitude: 100.5, location_timezone: "Asia/Bangkok",
  location_captured_at: "2026-08-16T01:06:00.000Z", location_expires_at: "2026-08-17T01:06:00.000Z",
  next_daily_at: null, next_shichen_at: null, last_skip_reason: null,
}, new Date("2026-08-16T01:00:00.000Z"));
assert.equal(futureStatus.locationFresh, false, "a location timestamp beyond the accepted clock-skew window must fail closed");

const implementation = readFileSync("src/lib/mobile-zibai-installation.ts", "utf8");
assert.match(implementation, /shichen_enabled=CASE WHEN \$3='background' THEN shichen_enabled ELSE false END/u,
  "a foreground-only permission downgrade must atomically disable shichen alerts");
assert.match(implementation, /WHEN shichen_enabled THEN 'background_permission_missing'/u);

console.log("ZIBAI_INSTALLATION_STATE_OK");
