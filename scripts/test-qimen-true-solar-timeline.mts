import assert from "node:assert/strict";
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

const ny = { timezone: "America/New_York", longitude: -74.006 };
function interval(value: { startAt: string; endAt: string; shichenKey: string }) {
  return { startAt: value.startAt, endAt: value.endAt, shichenKey: value.shichenKey };
}
const springBefore = runtime.trueSolarShichenWindow({ ...ny, instant: "2026-03-08T06:55:00.000Z" });
const springAfter = runtime.trueSolarShichenWindow({ ...ny, instant: "2026-03-08T07:05:00.000Z" });
assert.deepEqual(interval(springBefore), {
  startAt: "2026-03-08T06:07:33.783Z",
  endAt: "2026-03-08T08:07:33.783Z",
  shichenKey: "chou",
});
assert.deepEqual(interval(springAfter), interval(springBefore), "a DST gap must not split or duplicate a true-solar shichen");

const fallBefore = runtime.trueSolarShichenWindow({ ...ny, instant: "2026-11-01T05:30:00.000Z" });
const fallAfter = runtime.trueSolarShichenWindow({ ...ny, instant: "2026-11-01T06:30:00.000Z" });
assert.deepEqual(interval(fallBefore), {
  startAt: "2026-11-01T03:39:35.700Z",
  endAt: "2026-11-01T05:39:35.700Z",
  shichenKey: "zi",
});
assert.deepEqual(interval(fallAfter), {
  startAt: fallBefore.endAt,
  endAt: "2026-11-01T07:39:35.700Z",
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

console.log("qimen monotonic true-solar timeline tests passed");
