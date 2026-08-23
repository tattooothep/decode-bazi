import assert from "node:assert/strict";
import solarTermRuntime from "../src/lib/zibai-solar-term-runtime.cjs";
import {
  buildZibaiSnapshot,
  solarDayWindow,
} from "../src/lib/zibai-science.ts";

const BANGKOK_LONGITUDE = 100.5018;
const ONE_MILLISECOND = 1;

function atOffset(iso: string, offsetMs: number): Date {
  return new Date(Date.parse(iso) + offsetMs);
}

function sameDayMap(left: ReturnType<typeof buildZibaiSnapshot>, right: ReturnType<typeof buildZibaiSnapshot>, message: string) {
  assert.equal(left.day.startAt, right.day.startAt, `${message}: day start`);
  assert.equal(left.day.endAt, right.day.endAt, `${message}: day end`);
  assert.equal(left.day.meta.apparentSolarDate, right.day.meta.apparentSolarDate, `${message}: solar date`);
  assert.equal(left.day.meta.dayPillar, right.day.meta.dayPillar, `${message}: day pillar`);
  assert.equal(left.day.flight, right.day.flight, `${message}: day flight`);
  assert.deepEqual(left.day.palaces, right.day.palaces, `${message}: day palaces`);
}

function sameShichenMap(left: ReturnType<typeof buildZibaiSnapshot>, right: ReturnType<typeof buildZibaiSnapshot>, message: string) {
  assert.equal(left.shichen.startAt, right.shichen.startAt, `${message}: shichen start`);
  assert.equal(left.shichen.endAt, right.shichen.endAt, `${message}: shichen end`);
  assert.equal(left.shichen.meta.key, right.shichen.meta.key, `${message}: shichen key`);
  assert.equal(left.shichen.flight, right.shichen.flight, `${message}: shichen flight`);
  assert.deepEqual(left.shichen.palaces, right.shichen.palaces, `${message}: shichen palaces`);
}

const chushu = solarTermRuntime.canonicalSolarTermInstant(2026, 16);
assert.equal(chushu, "2026-08-23T02:18:49.000Z", "fixture pins the production 處暑 instant");

const chushuBefore = buildZibaiSnapshot(atOffset(chushu, -ONE_MILLISECOND), BANGKOK_LONGITUDE);
const chushuExact = buildZibaiSnapshot(atOffset(chushu, 0), BANGKOK_LONGITUDE);
const chushuAfter = buildZibaiSnapshot(atOffset(chushu, ONE_MILLISECOND), BANGKOK_LONGITUDE);

assert.equal(chushuBefore.day.meta.apparentSolarDate, "2026-08-23");
assert.equal(chushuBefore.day.meta.dayPillar, "己巳");
assert.equal(chushuBefore.day.palaces.C, 4, "reported day begins with Four Green in the centre");
sameDayMap(chushuBefore, chushuExact, "處暑 exact instant cannot split the advertised day");
sameDayMap(chushuBefore, chushuAfter, "處暑 +1ms cannot split the advertised day");

const reportedDayWindow = solarDayWindow(new Date(chushuBefore.day.startAt), BANGKOK_LONGITUDE);
const nextDay = buildZibaiSnapshot(reportedDayWindow.end, BANGKOK_LONGITUDE);
assert.equal(nextDay.day.meta.apparentSolarDate, "2026-08-24");
assert.equal(nextDay.day.meta.dayPillar, "庚午");
assert.equal(nextDay.day.palaces.C, 6, "the incoming 處暑 regime starts at the next apparent-solar day");

const dailyRegimeTermIndexes = [0, 4, 8, 12, 16, 20] as const;
const longitudes = [100.5018, 0, -74.006, 151.2093] as const;
for (const termIndex of dailyRegimeTermIndexes) {
  const term = solarTermRuntime.canonicalSolarTermInstant(2026, termIndex);
  assert.ok(term, `term ${termIndex} exists`);
  for (const longitude of longitudes) {
    const before = buildZibaiSnapshot(atOffset(term, -ONE_MILLISECOND), longitude);
    const exact = buildZibaiSnapshot(atOffset(term, 0), longitude);
    const after = buildZibaiSnapshot(atOffset(term, ONE_MILLISECOND), longitude);
    if (before.day.startAt === exact.day.startAt && before.day.endAt === exact.day.endAt) {
      sameDayMap(before, exact, `term ${termIndex} exact at longitude ${longitude}`);
    }
    if (before.day.startAt === after.day.startAt && before.day.endAt === after.day.endAt) {
      sameDayMap(before, after, `term ${termIndex} +1ms at longitude ${longitude}`);
    }
  }
}

for (const termIndex of [0, 12] as const) {
  const term = solarTermRuntime.canonicalSolarTermInstant(2026, termIndex);
  assert.ok(term, `solstice ${termIndex} exists`);
  for (const longitude of longitudes) {
    const before = buildZibaiSnapshot(atOffset(term, -ONE_MILLISECOND), longitude);
    const exact = buildZibaiSnapshot(atOffset(term, 0), longitude);
    const after = buildZibaiSnapshot(atOffset(term, ONE_MILLISECOND), longitude);
    if (before.shichen.startAt === exact.shichen.startAt && before.shichen.endAt === exact.shichen.endAt) {
      sameShichenMap(before, exact, `solstice ${termIndex} exact at longitude ${longitude}`);
    }
    if (before.shichen.startAt === after.shichen.startAt && before.shichen.endAt === after.shichen.endAt) {
      sameShichenMap(before, after, `solstice ${termIndex} +1ms at longitude ${longitude}`);
    }
  }
}

console.log("ZIBAI_V3_BOUNDARY_LATCHING_OK");
