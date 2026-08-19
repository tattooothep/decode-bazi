import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildZibaiSnapshot } from "../src/lib/zibai-science.ts";

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "C"] as const;
const MONTHS = [
  { code: "xiaohan", jieqiMonth: 12, monthBranch: "丑" },
  { code: "lichun", jieqiMonth: 1, monthBranch: "寅" },
  { code: "jingzhe", jieqiMonth: 2, monthBranch: "卯" },
  { code: "qingming", jieqiMonth: 3, monthBranch: "辰" },
  { code: "lixia", jieqiMonth: 4, monthBranch: "巳" },
  { code: "mangzhong", jieqiMonth: 5, monthBranch: "午" },
  { code: "xiaoshu", jieqiMonth: 6, monthBranch: "未" },
  { code: "liqiu", jieqiMonth: 7, monthBranch: "申" },
  { code: "bailu", jieqiMonth: 8, monthBranch: "酉" },
  { code: "hanlu", jieqiMonth: 9, monthBranch: "戌" },
  { code: "lidong", jieqiMonth: 10, monthBranch: "亥" },
  { code: "daxue", jieqiMonth: 11, monthBranch: "子" },
] as const;

const YEARS = [
  {
    year: 2024,
    branchBeforeLichun: "卯",
    branchFromLichun: "辰",
    boundaries: [
      ["2024-01-05T20:49:22.000Z", "2024-01-20T14:07:22.000Z", "2024-02-04T08:27:07.000Z"],
      ["2024-02-04T08:27:07.000Z", "2024-02-19T04:13:12.000Z", "2024-03-05T02:22:45.000Z"],
      ["2024-03-05T02:22:45.000Z", "2024-03-20T03:06:25.000Z", "2024-04-04T07:02:17.000Z"],
      ["2024-04-04T07:02:17.000Z", "2024-04-19T13:59:47.000Z", "2024-05-05T00:10:05.000Z"],
      ["2024-05-05T00:10:05.000Z", "2024-05-20T12:59:31.000Z", "2024-06-05T04:09:54.000Z"],
      ["2024-06-05T04:09:54.000Z", "2024-06-20T20:51:00.000Z", "2024-07-06T14:20:03.000Z"],
      ["2024-07-06T14:20:03.000Z", "2024-07-22T07:44:26.000Z", "2024-08-07T00:09:16.000Z"],
      ["2024-08-07T00:09:16.000Z", "2024-08-22T14:55:03.000Z", "2024-09-07T03:11:20.000Z"],
      ["2024-09-07T03:11:20.000Z", "2024-09-22T12:43:42.000Z", "2024-10-07T18:59:57.000Z"],
      ["2024-10-07T18:59:57.000Z", "2024-10-22T22:14:47.000Z", "2024-11-06T22:20:04.000Z"],
      ["2024-11-06T22:20:04.000Z", "2024-11-21T19:56:31.000Z", "2024-12-06T15:17:03.000Z"],
      ["2024-12-06T15:17:03.000Z", "2024-12-21T09:20:35.000Z", "2025-01-05T02:32:47.000Z"],
    ],
  },
  {
    year: 2025,
    branchBeforeLichun: "辰",
    branchFromLichun: "巳",
    boundaries: [
      ["2025-01-05T02:32:47.000Z", "2025-01-19T20:00:08.000Z", "2025-02-03T14:10:28.000Z"],
      ["2025-02-03T14:10:28.000Z", "2025-02-18T10:06:34.000Z", "2025-03-05T08:07:18.000Z"],
      ["2025-03-05T08:07:18.000Z", "2025-03-20T09:01:29.000Z", "2025-04-04T12:48:36.000Z"],
      ["2025-04-04T12:48:36.000Z", "2025-04-19T19:56:01.000Z", "2025-05-05T05:57:13.000Z"],
      ["2025-05-05T05:57:13.000Z", "2025-05-20T18:54:39.000Z", "2025-06-05T09:56:32.000Z"],
      ["2025-06-05T09:56:32.000Z", "2025-06-21T02:42:16.000Z", "2025-07-06T20:04:59.000Z"],
      ["2025-07-06T20:04:59.000Z", "2025-07-22T13:29:27.000Z", "2025-08-07T05:51:35.000Z"],
      ["2025-08-07T05:51:35.000Z", "2025-08-22T20:33:51.000Z", "2025-09-07T08:51:57.000Z"],
      ["2025-09-07T08:51:57.000Z", "2025-09-22T18:19:20.000Z", "2025-10-08T00:41:13.000Z"],
      ["2025-10-08T00:41:13.000Z", "2025-10-23T03:50:56.000Z", "2025-11-07T04:04:04.000Z"],
      ["2025-11-07T04:04:04.000Z", "2025-11-22T01:35:35.000Z", "2025-12-06T21:04:37.000Z"],
      ["2025-12-06T21:04:37.000Z", "2025-12-21T15:03:05.000Z", "2026-01-05T08:23:10.000Z"],
    ],
  },
  {
    year: 2026,
    branchBeforeLichun: "巳",
    branchFromLichun: "午",
    boundaries: [
      ["2026-01-05T08:23:10.000Z", "2026-01-20T01:44:56.000Z", "2026-02-03T20:02:08.000Z"],
      ["2026-02-03T20:02:08.000Z", "2026-02-18T15:51:56.000Z", "2026-03-05T13:59:00.000Z"],
      ["2026-03-05T13:59:00.000Z", "2026-03-20T14:45:59.000Z", "2026-04-04T18:40:00.000Z"],
      ["2026-04-04T18:40:00.000Z", "2026-04-20T01:39:08.000Z", "2026-05-05T11:48:44.000Z"],
      ["2026-05-05T11:48:44.000Z", "2026-05-21T00:36:45.000Z", "2026-06-05T15:48:21.000Z"],
      ["2026-06-05T15:48:21.000Z", "2026-06-21T08:24:30.000Z", "2026-07-07T01:56:57.000Z"],
      ["2026-07-07T01:56:57.000Z", "2026-07-22T19:13:05.000Z", "2026-08-07T11:42:43.000Z"],
      ["2026-08-07T11:42:43.000Z", "2026-08-23T02:18:49.000Z", "2026-09-07T14:41:16.000Z"],
      ["2026-09-07T14:41:16.000Z", "2026-09-23T00:05:14.000Z", "2026-10-08T06:29:17.000Z"],
      ["2026-10-08T06:29:17.000Z", "2026-10-23T09:37:57.000Z", "2026-11-07T09:52:05.000Z"],
      ["2026-11-07T09:52:05.000Z", "2026-11-22T07:23:21.000Z", "2026-12-07T02:52:32.000Z"],
      ["2026-12-07T02:52:32.000Z", "2026-12-21T20:50:14.000Z", "2027-01-05T14:09:58.000Z"],
    ],
  },
] as const;

const LOCATIONS = [
  { label: "New York DST-observing longitude", longitude: -74.006 },
  { label: "Greenwich", longitude: 0 },
  { label: "Bangkok", longitude: 100.5018 },
  { label: "Sydney DST-observing longitude", longitude: 151.2093 },
] as const;

const EXPECTED_CENTERS = {
  ziwumaoyou: [8, 7, 6, 5, 4, 3, 2, 1, 9, 8, 7, 6],
  chenxuchouwei: [5, 4, 3, 2, 1, 9, 8, 7, 6, 5, 4, 3],
  yinshensihai: [2, 1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 9],
} as const;

const EXPECTED_FORWARD_PALACES = {
  1: { C: 1, NW: 2, W: 3, NE: 4, S: 5, N: 6, SW: 7, E: 8, SE: 9 },
  2: { C: 2, NW: 3, W: 4, NE: 5, S: 6, N: 7, SW: 8, E: 9, SE: 1 },
  3: { C: 3, NW: 4, W: 5, NE: 6, S: 7, N: 8, SW: 9, E: 1, SE: 2 },
  4: { C: 4, NW: 5, W: 6, NE: 7, S: 8, N: 9, SW: 1, E: 2, SE: 3 },
  5: { C: 5, NW: 6, W: 7, NE: 8, S: 9, N: 1, SW: 2, E: 3, SE: 4 },
  6: { C: 6, NW: 7, W: 8, NE: 9, S: 1, N: 2, SW: 3, E: 4, SE: 5 },
  7: { C: 7, NW: 8, W: 9, NE: 1, S: 2, N: 3, SW: 4, E: 5, SE: 6 },
  8: { C: 8, NW: 9, W: 1, NE: 2, S: 3, N: 4, SW: 5, E: 6, SE: 7 },
  9: { C: 9, NW: 1, W: 2, NE: 3, S: 4, N: 5, SW: 6, E: 7, SE: 8 },
} as const;

type MonthLayer = Readonly<{
  palaces: Readonly<Record<string, number>>;
  startAt: string;
  endAt: string;
  flight: "順" | "逆";
  meta: Readonly<{
    yearBranch: string;
    monthBranch: string;
    jieqiMonth: number;
    startTermCode: string;
    endTermCode: string;
  }>;
}>;

function monthAt(iso: string, longitude: number, label: string): MonthLayer {
  const snapshot = buildZibaiSnapshot(new Date(iso), longitude);
  assert.ok(snapshot.month, `${label}: canonical snapshot must expose a month layer`);
  return snapshot.month;
}

function assertPermutation(palaces: Readonly<Record<string, number>>, label: string) {
  assert.deepEqual(Object.keys(palaces).sort(), [...DIRECTIONS].sort(), `${label}: exact palace keys`);
  assert.deepEqual(Object.values(palaces).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9], `${label}: exact 1-9 permutation`);
}

function branchGroup(branch: string): string {
  if (["子", "午", "卯", "酉"].includes(branch)) return "ziwumaoyou";
  if (["辰", "戌", "丑", "未"].includes(branch)) return "chenxuchouwei";
  return "yinshensihai";
}

const observedGroups = new Set<string>();

for (const yearCase of YEARS) {
  assert.equal(yearCase.boundaries.length, MONTHS.length, `${yearCase.year}: all twelve 節 fixtures`);

  for (let index = 0; index < MONTHS.length; index += 1) {
    const month = MONTHS[index];
    const nextMonth = MONTHS[(index + 1) % MONTHS.length];
    const [startAt, qiAt, endAt] = yearCase.boundaries[index];
    const boundaryMs = Date.parse(startAt);
    const label = `${yearCase.year} ${month.code}`;
    const before = monthAt(new Date(boundaryMs - 1_000).toISOString(), LOCATIONS[0].longitude, `${label} -1s`);
    const exact = monthAt(startAt, LOCATIONS[0].longitude, `${label} exact`);
    const after = monthAt(new Date(boundaryMs + 1_000).toISOString(), LOCATIONS[0].longitude, `${label} +1s`);
    const expectedYearBranch = index === 0 ? yearCase.branchBeforeLichun : yearCase.branchFromLichun;

    assert.equal(before.endAt, startAt, `${label}: preceding month ends at the global section instant`);
    assert.equal(before.meta.endTermCode, month.code, `${label}: preceding month names the incoming section`);
    assert.notDeepEqual(before.palaces, exact.palaces, `${label}: month flight changes at the section`);
    assert.deepEqual(exact, after, `${label}: exact boundary is inclusive`);
    assert.equal(exact.startAt, startAt, `${label}: exact global start`);
    assert.equal(exact.endAt, endAt, `${label}: exact global end`);
    assert.equal(exact.flight, "順", `${label}: month flight direction`);
    assert.deepEqual(exact.meta, {
      yearBranch: expectedYearBranch,
      monthBranch: month.monthBranch,
      jieqiMonth: month.jieqiMonth,
      startTermCode: month.code,
      endTermCode: nextMonth.code,
    }, `${label}: canonical month metadata`);
    assertPermutation(exact.palaces, label);
    const group = branchGroup(exact.meta.yearBranch) as keyof typeof EXPECTED_CENTERS;
    const expectedCenter = EXPECTED_CENTERS[group][month.jieqiMonth - 1];
    assert.equal(exact.palaces.C, expectedCenter, `${label}: fixed ${group} month-center oracle`);
    assert.deepEqual(exact.palaces, EXPECTED_FORWARD_PALACES[expectedCenter], `${label}: fixed forward-flight oracle`);
    observedGroups.add(group);

    const qiMs = Date.parse(qiAt);
    const qiBefore = monthAt(new Date(qiMs - 1_000).toISOString(), LOCATIONS[0].longitude, `${label} 中氣 -1s`);
    const qiExact = monthAt(qiAt, LOCATIONS[0].longitude, `${label} 中氣 exact`);
    const qiAfter = monthAt(new Date(qiMs + 1_000).toISOString(), LOCATIONS[0].longitude, `${label} 中氣 +1s`);
    assert.deepEqual(qiBefore, exact, `${label}: month is stable before 中氣`);
    assert.deepEqual(qiExact, exact, `${label}: 中氣 does not start a month`);
    assert.deepEqual(qiAfter, exact, `${label}: month is stable after 中氣`);

    for (const location of LOCATIONS) {
      const locationBefore = monthAt(new Date(boundaryMs - 1_000).toISOString(), location.longitude, `${label} ${location.label} -1s`);
      const locationExact = monthAt(startAt, location.longitude, `${label} ${location.label} exact`);
      assert.equal(locationBefore.endAt, startAt, `${label}: ${location.label} cannot move the incoming boundary`);
      assert.deepEqual(locationExact, exact, `${label}: ${location.label} cannot move month data`);
    }
  }
}

assert.deepEqual([...observedGroups].sort(), ["chenxuchouwei", "yinshensihai", "ziwumaoyou"]);

// Process-local time zones and their DST rules must not affect a global term
// instant. These April/November probes exercise opposite DST seasons in New
// York and Sydney and would catch accidental use of local Date getters.
const originalTimezone = process.env.TZ;
try {
  for (const boundaryAt of ["2026-04-04T18:40:00.000Z", "2026-11-07T09:52:05.000Z"]) {
    process.env.TZ = "UTC";
    const utcBefore = monthAt(new Date(Date.parse(boundaryAt) - 1_000).toISOString(), 100.5018, `${boundaryAt} UTC -1s`);
    const utcExact = monthAt(boundaryAt, 100.5018, `${boundaryAt} UTC exact`);
    for (const timezone of ["America/New_York", "Australia/Sydney"]) {
      process.env.TZ = timezone;
      assert.deepEqual(
        monthAt(new Date(Date.parse(boundaryAt) - 1_000).toISOString(), 100.5018, `${boundaryAt} ${timezone} -1s`),
        utcBefore,
        `${boundaryAt}: ${timezone} DST rules cannot move the preceding month`,
      );
      assert.deepEqual(
        monthAt(boundaryAt, 100.5018, `${boundaryAt} ${timezone} exact`),
        utcExact,
        `${boundaryAt}: ${timezone} DST rules cannot move the incoming month`,
      );
    }
  }
} finally {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
}

const canonical = buildZibaiSnapshot(new Date("2026-08-16T03:07:00.000Z"), 100.5018);
assert.equal(canonical.snapshotSchema, 2);
assert.equal(canonical.interpretationVersion, "zibai-3layer-rule-v1");
assert.ok(Object.isFrozen(canonical), "canonical snapshot is frozen");
for (const layerName of ["month", "day", "shichen"] as const) {
  const layer = canonical[layerName];
  assert.ok(Object.isFrozen(layer), `${layerName} layer is frozen`);
  assert.ok(Object.isFrozen(layer.palaces), `${layerName} palaces are frozen`);
  assert.ok(Object.isFrozen(layer.meta), `${layerName} metadata is frozen`);
  assertPermutation(layer.palaces, `canonical.${layerName}`);
}
assert.deepEqual(canonical.month.meta, {
  yearBranch: "午", monthBranch: "申", jieqiMonth: 7,
  startTermCode: "liqiu", endTermCode: "bailu",
});
assert.deepEqual(canonical.day, {
  palaces: canonical.dayPalaces,
  startAt: "2026-08-15T16:22:49.886Z",
  endAt: "2026-08-16T16:22:38.132Z",
  flight: canonical.dayFlight,
  meta: { apparentSolarDate: "2026-08-16", dayPillar: canonical.dayPillar },
});
assert.deepEqual(canonical.shichen, {
  palaces: canonical.shichenPalaces,
  startAt: "2026-08-16T02:22:45.060Z",
  endAt: "2026-08-16T04:22:44.083Z",
  flight: canonical.shichenFlight,
  meta: { key: "si" },
});
assert.strictEqual(canonical.monthPalaces, canonical.month.palaces, "legacy month projection reuses canonical palaces");
assert.strictEqual(canonical.dayPalaces, canonical.day.palaces, "legacy day projection reuses canonical palaces");
assert.strictEqual(canonical.shichenPalaces, canonical.shichen.palaces, "legacy shichen projection reuses canonical palaces");
assert.equal(canonical.apparentSolarDate, canonical.day.meta.apparentSolarDate);
assert.equal(canonical.shichenKey, canonical.shichen.meta.key);
assert.equal(canonical.startAt, canonical.shichen.startAt);
assert.equal(canonical.endAt, canonical.shichen.endAt);

const scienceImplementation = readFileSync(new URL("../src/lib/zibai-science.ts", import.meta.url), "utf8");
const payloadImplementation = readFileSync(new URL("../src/lib/notification-payload.cjs", import.meta.url), "utf8");
assert.match(scienceImplementation, /solarTermRuntime\.solarTermMonthWindowFromReference/u,
  "science delegates month boundaries to the shared canonical helper");
assert.match(payloadImplementation, /solarTermRuntime\.isCanonicalSolarTermMonthWindow/u,
  "payload validation delegates named instant truth to the same helper");
assert.doesNotMatch(`${scienceImplementation}\n${payloadImplementation}`, /(?:const|let|var)\s+(?:SOLAR_SECTION_CODES|ZIBAI_SECTION_TERMS)\b/u,
  "month boundary names are not copied across production consumers");

console.log("ZIBAI_MONTH_BOUNDARIES_OK");
