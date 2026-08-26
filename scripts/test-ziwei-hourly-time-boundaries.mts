import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  buildZiweiHourlyNotificationFacts,
  resolveEligibleZiweiBirthWallClock,
} from "../src/lib/astro/ziwei/hourly-preview";
import * as scheduler from "./mobile-ziwei-hourly-push-cron.mts";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/ziwei-hourly-notification.cjs");

const birth = Object.freeze({
  birthInstant: new Date("1984-12-31T06:15:00.000Z"),
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "M" as const,
});

assert.throws(() => resolveEligibleZiweiBirthWallClock("1984-12-31T13:15:00", "CET"),
  /ziwei_hourly_invalid_birth_timezone/u,
  "Ziwei natal input rejects abbreviation-only zones that PostgreSQL and Intl resolve differently");
assert.throws(() => resolveEligibleZiweiBirthWallClock("1900-01-31T12:00:00", "Europe/Paris"),
  /ziwei_hourly_ambiguous_birth_wall_clock/u,
  "historical sub-minute offsets outside the shared minute-precision resolver fail closed");

for (const [alias, canonical] of [["GMT", "UTC"], ["CET", "Europe/Brussels"], ["EST", "America/Panama"]] as const) {
  const aliasFacts = buildZiweiHourlyNotificationFacts({
    ...birth,
    referenceInstant: new Date("2026-08-26T12:30:00.000Z"),
    referenceTimezone: alias,
  });
  assert.equal(aliasFacts.reference.timezone, canonical,
    `${alias} is canonicalized before the scheduler persists its window identity`);
}

const goldens = [
  // Northern-hemisphere spring gaps and fall folds.
  ["New York spring gap", "America/New_York", "2026-03-08T06:30:00.000Z", "2026-03-08T06:00:00.000Z", "2026-03-08T07:00:00.000Z"],
  ["New York fall fold first occurrence", "America/New_York", "2026-11-01T05:30:00.000Z", "2026-11-01T05:00:00.000Z", "2026-11-01T08:00:00.000Z"],
  ["New York fall fold second occurrence", "America/New_York", "2026-11-01T06:30:00.000Z", "2026-11-01T05:00:00.000Z", "2026-11-01T08:00:00.000Z"],
  ["Berlin spring gap", "Europe/Berlin", "2026-03-29T00:30:00.000Z", "2026-03-29T00:00:00.000Z", "2026-03-29T01:00:00.000Z"],
  ["Berlin fall fold first occurrence", "Europe/Berlin", "2026-10-25T00:30:00.000Z", "2026-10-24T23:00:00.000Z", "2026-10-25T02:00:00.000Z"],
  ["Berlin fall fold second occurrence", "Europe/Berlin", "2026-10-25T01:30:00.000Z", "2026-10-24T23:00:00.000Z", "2026-10-25T02:00:00.000Z"],
  // Southern-hemisphere transitions run in the opposite part of the year.
  ["Sydney fall fold first occurrence", "Australia/Sydney", "2026-04-04T15:30:00.000Z", "2026-04-04T14:00:00.000Z", "2026-04-04T17:00:00.000Z"],
  ["Sydney fall fold second occurrence", "Australia/Sydney", "2026-04-04T16:30:00.000Z", "2026-04-04T14:00:00.000Z", "2026-04-04T17:00:00.000Z"],
  ["Sydney spring gap", "Australia/Sydney", "2026-10-03T15:30:00.000Z", "2026-10-03T15:00:00.000Z", "2026-10-03T16:00:00.000Z"],
  ["Troll two-hour fall shift first occurrence", "Antarctica/Troll", "2026-10-25T01:30:00.000Z", "2026-10-24T23:00:00.000Z", "2026-10-25T03:00:00.000Z"],
  ["Troll two-hour fall shift second occurrence", "Antarctica/Troll", "2026-10-25T02:30:00.000Z", "2026-10-24T23:00:00.000Z", "2026-10-25T03:00:00.000Z"],
  ["Casey three-hour fall shift five-hour shichen", "Antarctica/Casey", "2020-03-07T15:30:00.000Z", "2020-03-07T14:00:00.000Z", "2020-03-07T19:00:00.000Z"],
  // No-DST control.
  ["Bangkok ordinary shichen", "Asia/Bangkok", "2026-08-26T12:30:00.000Z", "2026-08-26T12:00:00.000Z", "2026-08-26T14:00:00.000Z"],
] as const;

for (const [label, referenceTimezone, instant, validFrom, validUntil] of goldens) {
  const facts = buildZiweiHourlyNotificationFacts({
    ...birth,
    referenceInstant: new Date(instant),
    referenceTimezone,
  });
  assert.equal(facts.reference.validFrom, validFrom, `${label}: realized start`);
  assert.equal(facts.reference.validUntil, validUntil, `${label}: realized end`);
  assert.ok(Date.parse(validFrom) <= Date.parse(instant) && Date.parse(instant) < Date.parse(validUntil),
    `${label}: reference belongs to the half-open interval`);
  const snapshot = runtime.buildZiweiHourlyNotificationSnapshot({
    accountId: "00000000-0000-4000-8000-000000000001",
    profile: { id: "00000000-0000-4000-8000-000000000002", name: "Owner", isSelf: true },
    facts,
  });
  assert.equal(runtime.verifyZiweiHourlyNotificationSnapshot(snapshot), true, `${label}: payload admits realized window`);
  const admissionAt = new Date(Date.parse(validFrom) + 60_000);
  assert.equal(scheduler.admissionDecision({
    reference_timezone: referenceTimezone, quiet_start: 0, quiet_end: 0,
  }, snapshot, admissionAt).allow, true, `${label}: scheduler admits realized window`);
}

const nyFoldKeys = goldens.slice(1, 3).map(([, referenceTimezone, instant]) => {
  const facts = buildZiweiHourlyNotificationFacts({ ...birth, referenceInstant: new Date(instant), referenceTimezone });
  return [facts.reference.windowKey, facts.reference.validFrom, facts.reference.validUntil];
});
assert.deepEqual(nyFoldKeys[0], nyFoldKeys[1], "both fold instants map to one logical shichen, not duplicate windows");

const realizedReference = (validFrom: string, validUntil: string, instant = validFrom) => ({
  validFrom, validUntil, instant,
});
assert.equal(runtime.realizedShichenWindow(realizedReference(
  "2026-01-01T00:00:00.000Z", "2026-01-01T01:30:00.000Z", "2026-01-01T00:30:00.000Z",
)), true, "fractional timezone shifts remain valid when their exact civil boundaries are attested");
assert.equal(runtime.realizedShichenWindow(realizedReference(
  "2026-10-24T23:00:00.000Z", "2026-10-25T03:00:00.000Z", "2026-10-25T01:30:00.000Z",
)), true, "a real two-hour timezone fold produces one four-hour civil shichen");
for (const reference of [
  realizedReference("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
  realizedReference("2026-01-01T01:00:00.000Z", "2026-01-01T00:00:00.000Z"),
]) assert.equal(runtime.realizedShichenWindow(reference), false);

console.log("PASS ziwei hourly time boundaries — deterministic realized shichen across gaps and folds");
