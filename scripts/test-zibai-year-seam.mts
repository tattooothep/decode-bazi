import assert from "node:assert/strict";
import {
  apparentSolarInstant,
  buildZibaiSnapshot,
  equationOfTimeMinutes,
  nextShichenBoundary,
  shichenAt,
} from "../src/lib/zibai-science.ts";

const DAY_MS = 86_400_000;
const SEAM_YEARS = [2024, 2025, 2028, 2029, 2100] as const;
const LONGITUDES = [-179.5, -14.33010681505132, 0, 100.5018, 179.5] as const;
const CRITICAL_WALL_OFFSETS = [-3_600_000, 0, 3_600_000] as const;

function daysInOracleYear(year: number): number {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
}

/** Baseline NOAA phase retained only to bound the numerical correction. */
function oldEquationOfTimeMinutes(at: Date): number {
  const start = Date.UTC(at.getUTCFullYear(), 0, 1);
  const day = Math.floor((at.getTime() - start) / DAY_MS) + 1;
  const fractionalHour = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600;
  const gamma = 2 * Math.PI / daysInOracleYear(at.getUTCFullYear())
    * (day - 1 + (fractionalHour - 12) / 24);
  return 229.18 * (
    0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
  );
}

function wrapLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function assertContains(start: number, end: number, requested: number, label: string): void {
  assert.ok(start <= requested && requested < end, `${label} must contain the requested instant`);
}

const seam = Date.parse("2028-01-01T00:00:00.000Z");
const longitude = -14.33010681505132;
assert.doesNotThrow(
  () => buildZibaiSnapshot(new Date(seam), longitude),
  "the reproduced leap-year seam belongs to an active snapshot",
);

let continuityCases = 0;
for (const year of SEAM_YEARS) {
  const seamMs = Date.UTC(year, 0, 1);
  for (const candidateLongitude of LONGITUDES) {
    for (let delta = -100; delta < 100; delta += 1) {
      const before = apparentSolarInstant(new Date(seamMs + delta), candidateLongitude).valueOf();
      const after = apparentSolarInstant(new Date(seamMs + delta + 1), candidateLongitude).valueOf();
      assert.ok(
        after >= before && after - before <= 2,
        `apparent time cannot reverse or jump at ${year} longitude ${candidateLongitude} delta ${delta}`,
      );
      continuityCases += 1;
    }
  }
}

let activeIntervalCases = 0;
for (const year of SEAM_YEARS) {
  const seamMs = Date.UTC(year, 0, 1);
  const equationMs = equationOfTimeMinutes(new Date(seamMs)) * 60_000;
  for (const targetWallOffset of CRITICAL_WALL_OFFSETS) {
    const criticalLongitude = wrapLongitude((targetWallOffset - equationMs) / 240_000);
    for (const delta of [-1, 0, 1] as const) {
      const requested = seamMs + delta;
      const requestedAt = new Date(requested);
      const snapshot = buildZibaiSnapshot(requestedAt, criticalLongitude);
      const shichen = shichenAt(requestedAt, criticalLongitude);
      assertContains(Date.parse(snapshot.month.startAt), Date.parse(snapshot.month.endAt), requested, "month interval");
      assertContains(Date.parse(snapshot.day.startAt), Date.parse(snapshot.day.endAt), requested, "day interval");
      assertContains(Date.parse(snapshot.shichen.startAt), Date.parse(snapshot.shichen.endAt), requested, "snapshot shichen interval");
      assertContains(shichen.start.getTime(), shichen.end.getTime(), requested, "direct shichen interval");
      assert.ok(nextShichenBoundary(requestedAt, criticalLongitude).getTime() > requested, "next shichen boundary must be future");
      activeIntervalCases += 1;
    }
  }
}

let commonMaxDifferenceMinutes = 0;
let leapMaxDifferenceMinutes = 0;
let numericalCases = 0;
for (const year of [2027, 2028] as const) {
  for (let day = 0; day < daysInOracleYear(year); day += 1) {
    const at = new Date(Date.UTC(year, 0, 1, 12, 34, 56) + day * DAY_MS);
    const differenceMinutes = Math.abs(equationOfTimeMinutes(at) - oldEquationOfTimeMinutes(at));
    if (year === 2027) commonMaxDifferenceMinutes = Math.max(commonMaxDifferenceMinutes, differenceMinutes);
    else leapMaxDifferenceMinutes = Math.max(leapMaxDifferenceMinutes, differenceMinutes);
    numericalCases += 1;
  }
}
assert.ok(
  commonMaxDifferenceMinutes < 1e-9,
  `non-leap second-aligned values changed by ${commonMaxDifferenceMinutes} minutes`,
);
assert.ok(
  leapMaxDifferenceMinutes < 0.1 / 60,
  `leap-year values changed by ${leapMaxDifferenceMinutes * 60} seconds`,
);

const maximumClockCorrectionMs = Math.max(commonMaxDifferenceMinutes, leapMaxDifferenceMinutes) * 60_000;
console.log(
  `zibai year-seam regression passed: ${continuityCases} continuity cases, `
  + `${activeIntervalCases} active-interval cases, ${numericalCases} numerical samples; `
  + `maximum clock correction ${maximumClockCorrectionMs.toFixed(6)} ms `
  + `(common ${commonMaxDifferenceMinutes.toExponential(3)} min, leap ${leapMaxDifferenceMinutes.toExponential(9)} min)`,
);
