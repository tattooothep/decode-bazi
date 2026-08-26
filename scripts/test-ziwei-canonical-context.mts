import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ziweiChart } from "../src/lib/astro/ziwei/engine";
import { ZIWEI_HOURLY_LINEAGE } from "../src/lib/astro/ziwei/hourly-lineage";
import {
  resolveCanonicalZiweiContext,
  resolveCanonicalZiweiHourlyContext,
  type CanonicalZiweiContextResult,
} from "../src/lib/astro/ziwei/context-resolver";

const birthWallClock = "1984-12-31T13:15:00";
const referenceInstant = new Date("2026-08-26T12:30:00.000Z");

function resolve(overrides: Record<string, unknown> = {}): CanonicalZiweiContextResult {
  return resolveCanonicalZiweiContext({
    mode: "strict",
    birthWallClock,
    birthTimezone: "Asia/Bangkok",
    birthTimezoneSource: "profile",
    referenceInstant,
    referenceTimezone: "Asia/Tokyo",
    ...overrides,
  });
}

const canonical = resolve();
assert.equal(canonical.status, "resolved");
if (canonical.status !== "resolved") throw new Error("canonical context did not resolve");
assert.equal(canonical.contractVersion, "ziwei-canonical-context-v1");
assert.equal(canonical.lineage.id, ZIWEI_HOURLY_LINEAGE);
assert.equal(canonical.lineage.adapterVersion, "hourkey-forward-zi-adapter-v1");
assert.equal(canonical.birth.wallClock, birthWallClock);
assert.equal(canonical.birth.timezone, "Asia/Bangkok");
assert.equal(canonical.birth.timezoneSource, "profile");
assert.equal(canonical.birth.instant, "1984-12-31T06:15:00.000Z");
assert.equal(canonical.birth.utcOffsetMinutes, 420);
assert.equal(canonical.reference.instant, referenceInstant.toISOString());
assert.equal(canonical.reference.timezone, "Asia/Tokyo");
assert.equal(canonical.reference.utcOffsetMinutes, 540);
assert.match(canonical.fingerprint, /^[0-9a-f]{64}$/u);
assert.match(canonical.birthFingerprint, /^[0-9a-f]{64}$/u);
assert.equal(resolve().status, "resolved");
assert.equal((resolve() as typeof canonical).fingerprint, canonical.fingerprint,
  "the same scientific inputs and locked lineage have one stable identity");

const differentReferenceZone = resolve({ referenceTimezone: "America/New_York" });
assert.equal(differentReferenceZone.status, "resolved");
if (differentReferenceZone.status !== "resolved") throw new Error("reference timezone did not resolve");
assert.equal(differentReferenceZone.birth.instant, canonical.birth.instant,
  "reference timezone must never reinterpret the birth wall clock");
assert.notEqual(differentReferenceZone.reference.timezone, canonical.reference.timezone);
assert.notEqual(differentReferenceZone.fingerprint, canonical.fingerprint);
assert.equal(differentReferenceZone.birthFingerprint, canonical.birthFingerprint,
  "birth-context identity must remain stable across later reference times/zones");
const laterReference = resolve({ referenceInstant: new Date("2026-08-26T14:30:00.000Z") });
assert.equal(laterReference.status, "resolved");
if (laterReference.status !== "resolved") throw new Error("later reference did not resolve");
assert.equal(laterReference.birthFingerprint, canonical.birthFingerprint);
assert.notEqual(laterReference.fingerprint, canonical.fingerprint);

for (const value of ["0", "7", "+7", "0700", "CET", "EST"]) {
  const result = resolve({ birthTimezone: value });
  assert.deepEqual(
    { status: result.status, reason: result.status === "blocked" ? result.reason : null },
    { status: "blocked", reason: "birth_timezone_invalid" },
    `${value} must not acquire canonical timezone provenance`,
  );
}

for (const [wallClock, label] of [
  ["2026-03-08T02:30:00", "DST gap"],
  ["2026-11-01T01:30:00", "DST fold"],
] as const) {
  const result = resolve({ birthWallClock: wallClock, birthTimezone: "America/New_York" });
  assert.deepEqual(
    { status: result.status, reason: result.status === "blocked" ? result.reason : null },
    { status: "blocked", reason: "birth_wall_clock_ambiguous" },
    `${label} must fail closed`,
  );
}

const missingStrict = resolve({ birthTimezone: null, birthTimezoneSource: undefined });
assert.deepEqual(
  { status: missingStrict.status, reason: missingStrict.status === "blocked" ? missingStrict.reason : null },
  { status: "blocked", reason: "birth_timezone_missing" },
);

for (const [wallClock, reason] of [
  ["1984-12-31T23:30:00", "birth_late_zi_unsupported"],
  ["1900-01-30T12:00:00", "birth_calendar_range_unsupported"],
  ["2101-01-01T12:00:00", "birth_calendar_range_unsupported"],
] as const) {
  const hourly = resolveCanonicalZiweiHourlyContext({
    mode: "strict",
    birthWallClock: wallClock,
    birthTimezone: "Asia/Bangkok",
    birthTimezoneSource: "profile",
    referenceInstant,
    referenceTimezone: "Asia/Tokyo",
  });
  assert.deepEqual(
    { status: hourly.status, reason: hourly.status === "blocked" ? hourly.reason : null },
    { status: "blocked", reason },
    "hourly enrollment must reject a natal domain the locked engine cannot calculate",
  );
}
assert.equal(resolve({ birthWallClock: "1984-12-31T23:30:00" }).status, "resolved",
  "the hourly capability gate must not silently change the established ordinary chart domain");

const compatibility = resolve({
  mode: "legacy_chart",
  birthTimezone: null,
  birthTimezoneSource: undefined,
  referenceTimezone: "+07:00",
});
assert.equal(compatibility.status, "compatibility_only");
if (compatibility.status !== "compatibility_only") throw new Error("legacy compatibility did not resolve");
assert.equal(compatibility.reason, "birth_timezone_missing_legacy_bangkok");
assert.equal(compatibility.birth.timezone, "+07:00");
assert.equal(compatibility.birth.timezoneSource, "legacy_bangkok");
assert.equal(compatibility.birth.instant, "1984-12-31T06:15:00.000Z");
assert.match(compatibility.fingerprint, /^[0-9a-f]{64}$/u);

const missingCoordinates = resolve();
const explicitCoordinates = resolveCanonicalZiweiContext({
  mode: "strict",
  birthWallClock,
  birthTimezone: "Asia/Bangkok",
  birthTimezoneSource: "profile",
  referenceInstant,
  referenceTimezone: "Asia/Tokyo",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
} as Parameters<typeof resolveCanonicalZiweiContext>[0] & { birthLocation: { lat: number; lng: number } });
assert.equal(explicitCoordinates.status, "resolved");
if (missingCoordinates.status !== "resolved" || explicitCoordinates.status !== "resolved") {
  throw new Error("coordinates changed resolver eligibility");
}
assert.equal(explicitCoordinates.fingerprint, missingCoordinates.fingerprint,
  "coordinates are metadata-only in the locked Ziwei lineage");

const badReference = resolve({ referenceTimezone: "CET" });
assert.deepEqual(
  { status: badReference.status, reason: badReference.status === "blocked" ? badReference.reason : null },
  { status: "blocked", reason: "reference_timezone_invalid" },
);

function chartFromContext(context: typeof canonical | typeof compatibility) {
  return ziweiChart(
    new Date(context.birth.instant),
    13.7563,
    100.5018,
    "M",
    true,
    { refDate: referenceInstant, gmtOffsetHours: context.birth.utcOffsetMinutes / 60 },
  );
}

const established = ziweiChart(
  new Date("1984-12-31T06:15:00.000Z"), 13.7563, 100.5018, "M", true,
  { refDate: referenceInstant, gmtOffsetHours: 7 },
);
assert.deepEqual(chartFromContext(canonical), established,
  "resolved context must not change the established chart facts");
assert.deepEqual(chartFromContext(compatibility), established,
  "explicit legacy Bangkok compatibility must not change established chart facts");

const dstLegacyContext = resolve({
  mode: "legacy_chart",
  birthWallClock: "1984-01-15T13:15:00",
  birthTimezone: "America/New_York",
  referenceInstant: new Date("2026-07-15T12:30:00.000Z"),
  referenceTimezone: "America/New_York",
  legacyReferenceUsesBirthOffset: true,
});
assert.equal(dstLegacyContext.status, "compatibility_only");
if (dstLegacyContext.status !== "compatibility_only") throw new Error("legacy DST context was not explicit");
assert.equal(dstLegacyContext.reason, "reference_timezone_legacy_birth_offset");
assert.equal(dstLegacyContext.birth.utcOffsetMinutes, -300);
assert.equal(dstLegacyContext.reference.utcOffsetMinutes, -300,
  "legacy chart reference facts must retain the historical birth offset");
assert.equal(dstLegacyContext.reference.timezone, "-05:00");
const dstLegacyEstablished = ziweiChart(
  new Date(dstLegacyContext.birth.instant), 13.7563, 100.5018, "M", true,
  { refDate: new Date(dstLegacyContext.reference.instant), gmtOffsetHours: -5 },
);
const dstLegacyCanonical = ziweiChart(
  new Date(dstLegacyContext.birth.instant), 13.7563, 100.5018, "M", true,
  {
    refDate: new Date(dstLegacyContext.reference.instant),
    gmtOffsetHours: dstLegacyContext.birth.utcOffsetMinutes / 60,
    refGmtOffsetHours: dstLegacyContext.reference.utcOffsetMinutes / 60,
  },
);
assert.deepEqual(dstLegacyCanonical, dstLegacyEstablished,
  "canonical legacy chart must not drift when birth and reference dates have different DST offsets");

const chartRoute = readFileSync("src/app/api/mobile/v1/ziwei/route.ts", "utf8");
assert.match(chartRoute, /resolveCanonicalZiweiContext/u);
assert.match(chartRoute, /mode:\s*"legacy_chart"/u);
assert.match(chartRoute, /legacyReferenceUsesBirthOffset:\s*true/u);
assert.match(chartRoute, /ziweiContext/u);
assert.doesNotMatch(chartRoute, /wallClockToUtc/u);

const previewRoute = readFileSync("src/app/api/mobile/v1/ziwei/hourly-preview/route.ts", "utf8");
assert.match(previewRoute, /resolveCanonicalZiweiHourlyContext/u);
assert.doesNotMatch(previewRoute, /row\.birth_lat === null \|\| row\.birth_lng === null/u,
  "coordinates cannot gate a timezone-resolved Ziwei preview");
assert.match(previewRoute, /birthLocation:\s*birthLocation/u);

console.log("PASS canonical Ziwei context — strict time evidence, explicit compatibility, no chart fact drift");
