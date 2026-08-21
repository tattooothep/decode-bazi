import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-notification-advisory.cjs") as {
  apparentSolarCoordinate(longitude: number, instant: Date | string): {
    coordinate: Date;
  };
  trueSolarShichenWindow(input: {
    timezone: string;
    longitude: number;
    instant: Date | string;
  }): {
    startAt: string;
    endAt: string;
    shichenKey: string;
  };
  trueSolarDayWindow(input: {
    timezone: string;
    longitude: number;
    instant: Date | string;
  }): {
    startAt: string;
    endAt: string;
    apparentDate: string;
  };
};
const enginePath = process.env.QIMEN_ENGINE_SOURCE_PATH || "/root/qimen-api/src/qimenEngine.js";
const engineSourceDigest = crypto.createHash("sha256").update(fs.readFileSync(enginePath)).digest("hex");
assert.equal(engineSourceDigest, "d0abb00d9d6cff7dfb72471441eb038f9eddd1d01930d2c7e9079d1e9b4caa63");
const engine = require(enginePath) as {
  _internals: {
    parseInputDateTime(input: Date | string, timezone: string): unknown;
    applyTrueSolarTime(input: unknown, longitude: number): {
      apparentCoordinateDt: { toMillis(): number };
    };
  };
};

const ny = { timezone: "America/New_York", longitude: -74.006 };
function interval(value: { startAt: string; endAt: string; shichenKey: string }) {
  return { startAt: value.startAt, endAt: value.endAt, shichenKey: value.shichenKey };
}
const springBefore = runtime.trueSolarShichenWindow({ ...ny, instant: "2026-03-08T06:55:00.000Z" });
const springAfter = runtime.trueSolarShichenWindow({ ...ny, instant: "2026-03-08T07:05:00.000Z" });
assert.deepEqual(interval(springBefore), {
  startAt: "2026-03-08T06:07:23.146Z",
  endAt: "2026-03-08T08:07:21.949Z",
  shichenKey: "chou",
});
assert.deepEqual(interval(springAfter), interval(springBefore), "a DST gap must not split or duplicate a true-solar shichen");

const fallBefore = runtime.trueSolarShichenWindow({ ...ny, instant: "2026-11-01T05:30:00.000Z" });
const fallAfter = runtime.trueSolarShichenWindow({ ...ny, instant: "2026-11-01T06:30:00.000Z" });
assert.deepEqual(interval(fallBefore), {
  startAt: "2026-11-01T03:39:38.643Z",
  endAt: "2026-11-01T05:39:38.623Z",
  shichenKey: "zi",
});
assert.deepEqual(interval(fallAfter), {
  startAt: fallBefore.endAt,
  endAt: "2026-11-01T07:39:38.609Z",
  shichenKey: "chou",
}, "a DST fold must remain one monotonic sequence with no overlap");

for (const boundaryIso of [springBefore.startAt, springBefore.endAt, fallBefore.endAt]) {
  const boundary = Date.parse(boundaryIso);
  const before = runtime.trueSolarShichenWindow({ ...ny, instant: new Date(boundary - 1) });
  const at = runtime.trueSolarShichenWindow({ ...ny, instant: new Date(boundary) });
  const after = runtime.trueSolarShichenWindow({ ...ny, instant: new Date(boundary + 1) });
  assert.equal(before.endAt, boundaryIso, "T-1 belongs to the closing interval");
  assert.equal(at.startAt, boundaryIso, "T belongs to the opening half-open interval");
  assert.deepEqual(interval(after), interval(at), "T and T+1 belong to the same opening interval");
}

for (const center of ["2026-03-08T07:00:00.000Z", "2026-11-01T06:00:00.000Z"]) {
  let previousCoordinate = Number.NEGATIVE_INFINITY;
  for (let deltaMinutes = -240; deltaMinutes <= 240; deltaMinutes += 1) {
    const instant = new Date(Date.parse(center) + deltaMinutes * 60_000);
    const coordinate = runtime.apparentSolarCoordinate(ny.longitude, instant).coordinate.valueOf();
    assert.ok(coordinate > previousCoordinate, "apparent-solar coordinate must never reverse at DST");
    previousCoordinate = coordinate;
    const window = runtime.trueSolarShichenWindow({ ...ny, instant });
    assert.ok(Date.parse(window.startAt) <= instant.valueOf());
    assert.ok(instant.valueOf() < Date.parse(window.endAt));
  }
}

const bangkok = { timezone: "Asia/Bangkok", longitude: 100.5018 };
const day = runtime.trueSolarDayWindow({ ...bangkok, instant: "2026-08-21T12:00:00.000Z" });
const dayEnd = Date.parse(day.endAt);
const closingDay = runtime.trueSolarDayWindow({ ...bangkok, instant: new Date(dayEnd - 1) });
const openingDay = runtime.trueSolarDayWindow({ ...bangkok, instant: new Date(dayEnd) });
assert.equal(closingDay.endAt, day.endAt);
assert.equal(openingDay.startAt, day.endAt, "true-solar days partition time as [start,end)");
assert.notEqual(openingDay.apparentDate, closingDay.apparentDate);

for (const longitude of [14.6875, -0.3125]) {
  for (const midnight of ["2025-12-21T00:00:00.000Z", "2026-01-01T00:00:00.000Z"]) {
    const at = Date.parse(midnight);
    const before = runtime.apparentSolarCoordinate(longitude, new Date(at - 1)).coordinate.valueOf();
    const exact = runtime.apparentSolarCoordinate(longitude, new Date(at)).coordinate.valueOf();
    const after = runtime.apparentSolarCoordinate(longitude, new Date(at + 20_000)).coordinate.valueOf();
    assert.ok(exact > before, `EoT must not reverse A(t) at ${midnight} longitude ${longitude}`);
    assert.ok(after > exact, `EoT must remain increasing after ${midnight} longitude ${longitude}`);
  }
}

const adversarialLongitudes = [-15.3125, -0.3125, 14.6875];
const adversarialHours = [23, 0, 1];
const adversarialAt = new Date("2025-12-21T00:00:00.000Z");
for (const [index, longitude] of adversarialLongitudes.entries()) {
  const coordinate = runtime.apparentSolarCoordinate(longitude, adversarialAt).coordinate;
  assert.equal(coordinate.getUTCHours(), adversarialHours[index],
    `adversarial longitude ${longitude} must exercise apparent hour ${adversarialHours[index]}`);

  const shichen = runtime.trueSolarShichenWindow({ timezone: "UTC", longitude, instant: adversarialAt });
  const shichenStart = Date.parse(shichen.startAt);
  const shichenEnd = Date.parse(shichen.endAt);
  assert.ok(shichenStart <= adversarialAt.valueOf() && adversarialAt.valueOf() < shichenEnd);
  assert.ok(shichenEnd - shichenStart >= 119 * 60_000 && shichenEnd - shichenStart <= 121 * 60_000,
    `true-solar shichen at longitude ${longitude} must remain approximately two hours`);
  const closingShichen = runtime.trueSolarShichenWindow({ timezone: "UTC", longitude, instant: new Date(shichenEnd - 1) });
  const openingShichen = runtime.trueSolarShichenWindow({ timezone: "UTC", longitude, instant: new Date(shichenEnd) });
  assert.equal(closingShichen.endAt, shichen.endAt);
  assert.equal(openingShichen.startAt, shichen.endAt,
    `true-solar shichen at longitude ${longitude} must have no gap or overlap`);

  const solarDay = runtime.trueSolarDayWindow({ timezone: "UTC", longitude, instant: adversarialAt });
  const solarDayStart = Date.parse(solarDay.startAt);
  const solarDayEnd = Date.parse(solarDay.endAt);
  assert.ok(solarDayStart <= adversarialAt.valueOf() && adversarialAt.valueOf() < solarDayEnd);
  assert.ok(solarDayEnd - solarDayStart >= 23.9 * 3_600_000 && solarDayEnd - solarDayStart <= 24.1 * 3_600_000,
    `true-solar day at longitude ${longitude} must remain approximately 24 hours`);
  const openingDayAtBoundary = runtime.trueSolarDayWindow({ timezone: "UTC", longitude, instant: new Date(solarDayEnd) });
  assert.equal(openingDayAtBoundary.startAt, solarDay.endAt,
    `true-solar days at longitude ${longitude} must have no gap or overlap`);
}

let midnightCount = 0;
for (let utcMidnight = Date.UTC(2000, 0, 1); utcMidnight < Date.UTC(2051, 0, 1); utcMidnight += 86_400_000) {
  midnightCount += 1;
  for (const longitude of adversarialLongitudes) {
    const before = runtime.apparentSolarCoordinate(longitude, new Date(utcMidnight - 20_000)).coordinate.valueOf();
    const exact = runtime.apparentSolarCoordinate(longitude, new Date(utcMidnight)).coordinate.valueOf();
    const after = runtime.apparentSolarCoordinate(longitude, new Date(utcMidnight + 20_000)).coordinate.valueOf();
    assert.ok(before < exact && exact < after,
      `A(t) must be strictly increasing across UTC midnight ${new Date(utcMidnight).toISOString()} at ${longitude}`);

    const engineInput = engine._internals.parseInputDateTime(new Date(utcMidnight), "UTC");
    const engineCoordinate = engine._internals.applyTrueSolarTime(engineInput, longitude).apparentCoordinateDt.toMillis();
    assert.ok(Math.abs(engineCoordinate - exact) < 1,
      `backend/engine apparent coordinate must match at ${new Date(utcMidnight).toISOString()} longitude ${longitude}`);
  }
}
assert.equal(midnightCount, 18_628, "the exhaustive supported-range audit must cover every UTC midnight from 2000 through 2050");

console.log(`qimen monotonic true-solar timeline tests passed midnights=${midnightCount} engineParity=exact`);
