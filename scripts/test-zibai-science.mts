import assert from "node:assert/strict";
import {
  ZIBAI_CALCULATION_VERSION,
  ZIBAI_INTERPRETATION_VERSION,
  apparentSolarInstant,
  apparentSolarParts,
  buildZibaiSnapshot,
  equationOfTimeMinutes,
  nextShichenBoundary,
  shichenAt,
  solarDayKey,
  starPalaceRelation,
} from "../src/lib/zibai-science.ts";

function permutation(values: Record<string, number>) {
  assert.deepEqual([...Object.values(values)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
}

assert.equal(ZIBAI_CALCULATION_VERSION, "zibai-zaoming-true-solar-v3");
assert.equal(ZIBAI_INTERPRETATION_VERSION, "zibai-3layer-rule-v1");

// Worked five-element relations. 宮生星 nourishes the star; 星生宮 expends
// star qi into the sector. These two directions must never be reversed.
assert.equal(starPalaceRelation(1, "W"), "palace-generates-star", "metal palace nourishes water star");
assert.equal(starPalaceRelation(1, "E"), "generates-palace", "water star generates wood palace");
assert.equal(starPalaceRelation(9, "W"), "controls-palace", "fire star controls metal palace");
assert.equal(starPalaceRelation(9, "NE"), "generates-palace", "fire star generates earth palace");

// NOAA fractional-year equation-of-time reference values (minute precision).
assert.ok(Math.abs(equationOfTimeMinutes(new Date("2026-02-11T12:00:00Z")) - -14.2) < 0.7);
assert.ok(Math.abs(equationOfTimeMinutes(new Date("2026-11-03T12:00:00Z")) - 16.4) < 0.7);

// Greenwich near an EoT zero is essentially UTC solar time.
const greenwich = apparentSolarParts(new Date("2026-04-15T12:00:00Z"), 0);
assert.equal(greenwich.year, 2026);
assert.equal(greenwich.month, 4);
assert.equal(greenwich.day, 15);
assert.ok(greenwich.hour === 11 || greenwich.hour === 12);

// Longitude is applied exactly once: 15° east is about one solar hour ahead.
const base = new Date("2026-09-01T00:00:00Z");
const atZero = apparentSolarInstant(base, 0).getTime();
const atEast = apparentSolarInstant(base, 15).getTime();
assert.ok(Math.abs((atEast - atZero) - 3_600_000) < 1);

// The Zi hour owns the new solar day from 23:00, not midnight.
assert.equal(solarDayKey(new Date("2026-01-02T22:50:00Z"), 0), "2026-01-02");
assert.equal(solarDayKey(new Date("2026-01-02T23:10:00Z"), 0), "2026-01-03");
assert.equal(shichenAt(new Date("2026-01-02T23:30:00Z"), 0).key, "zi");
assert.equal(shichenAt(new Date("2026-01-03T01:10:00Z"), 0).key, "chou");

// Inversion remains bounded and the returned boundary is a real apparent-solar odd hour.
for (const fixture of [
  { at: "2026-03-08T06:30:00Z", longitude: -74.006 }, // New York DST day
  { at: "2026-09-06T03:30:00Z", longitude: -70.6693 }, // Santiago midnight DST transition
  { at: "2026-12-15T11:00:00Z", longitude: 179.5 },
  { at: "2026-12-15T11:00:00Z", longitude: -179.5 },
]) {
  const now = new Date(fixture.at);
  const next = nextShichenBoundary(now, fixture.longitude);
  assert.ok(next.getTime() > now.getTime());
  assert.ok(next.getTime() - now.getTime() <= 2 * 60 * 60 * 1000 + 2 * 60 * 1000);
  const p = apparentSolarParts(next, fixture.longitude);
  assert.ok([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23].includes(p.hour));
  assert.ok(p.minute === 0 && p.second <= 1);
}

// Solar terms are global instants for the month layer. Day and shichen adopt
// their active regime at their own apparent-solar starts, so the same UTC
// instant can legitimately belong to different latched local windows.
for (const at of ["2026-06-21T12:00:00.000Z", "2026-06-21T20:00:00.000Z", "2026-12-21T20:00:00.000Z"]) {
  const snapshots = [-74.006, 0, 100.5018, 151.2093].map((longitude) => buildZibaiSnapshot(new Date(at), longitude));
  assert.equal(new Set(snapshots.map((snapshot) => snapshot.month.startAt)).size, 1, `${at} month start remains global`);
  assert.equal(new Set(snapshots.map((snapshot) => snapshot.month.endAt)).size, 1, `${at} month end remains global`);
  for (const snapshot of snapshots) {
    const instant = Date.parse(at);
    assert.ok(Date.parse(snapshot.day.startAt) <= instant && instant < Date.parse(snapshot.day.endAt));
    assert.ok(Date.parse(snapshot.shichen.startAt) <= instant && instant < Date.parse(snapshot.shichen.endAt));
  }
}

// Canonical tyme4ts / 造命 engine output; never the legacy day_branch % 9 shortcut.
for (const fixture of [
  { at: "2026-01-15T03:00:00Z", longitude: 100.5018 },
  { at: "2026-06-21T12:00:00Z", longitude: -0.1276 },
  { at: "2026-12-21T12:00:00Z", longitude: 151.2093 },
]) {
  const snapshot = buildZibaiSnapshot(new Date(fixture.at), fixture.longitude);
  assert.equal(snapshot.snapshotSchema, 2);
  assert.equal(snapshot.calculationVersion, ZIBAI_CALCULATION_VERSION);
  assert.equal(snapshot.interpretationVersion, ZIBAI_INTERPRETATION_VERSION);
  permutation(snapshot.month.palaces);
  permutation(snapshot.day.palaces);
  permutation(snapshot.shichen.palaces);
  permutation(snapshot.dayPalaces);
  permutation(snapshot.shichenPalaces);
  assert.ok(Object.isFrozen(snapshot.month) && Object.isFrozen(snapshot.month.meta));
  assert.ok(Object.isFrozen(snapshot.day) && Object.isFrozen(snapshot.day.meta));
  assert.ok(Object.isFrozen(snapshot.shichen) && Object.isFrozen(snapshot.shichen.meta));
  assert.strictEqual(snapshot.monthPalaces, snapshot.month.palaces);
  assert.strictEqual(snapshot.dayPalaces, snapshot.day.palaces);
  assert.strictEqual(snapshot.shichenPalaces, snapshot.shichen.palaces);
  assert.equal(snapshot.apparentSolarDate, snapshot.day.meta.apparentSolarDate);
  assert.equal(snapshot.dayPillar, snapshot.day.meta.dayPillar);
  assert.equal(snapshot.shichenKey, snapshot.shichen.meta.key);
  assert.equal(snapshot.startAt, snapshot.shichen.startAt);
  assert.equal(snapshot.endAt, snapshot.shichen.endAt);
  assert.deepEqual(snapshot.focus.map((x) => x.star).sort((a, b) => a - b), [1, 2, 5, 9]);
  assert.equal(new Set(snapshot.focus.map((x) => x.shichenDirection)).size, 4);
}

console.log("ZIBAI_SCIENCE_OK");
