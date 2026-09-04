import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pillars = require("../src/lib/qimen-canonical-pillars.cjs");
const solar = require("../src/lib/zibai-solar-term-runtime.cjs");
const timeline = require("../src/lib/qimen-notification-advisory.cjs");
const seasonal = require("../src/lib/qimen-seasonal-vigor.cjs");

// Explicit source oracle, not derived from the helper's GENERATES/CONTROLS
// relations. Values are element order in Yanbo 旺/相/休/囚/廢, NOT door states.
const ORACLE = {
  子: { element: "水", order: "金水土火木" },
  丑: { element: "土", order: "火土木水金" },
  寅: { element: "木", order: "水木金土火" },
  卯: { element: "木", order: "水木金土火" },
  辰: { element: "土", order: "火土木水金" },
  巳: { element: "火", order: "木火水金土" },
  午: { element: "火", order: "木火水金土" },
  未: { element: "土", order: "火土木水金" },
  申: { element: "金", order: "土金火木水" },
  酉: { element: "金", order: "土金火木水" },
  戌: { element: "土", order: "火土木水金" },
  亥: { element: "水", order: "金水土火木" },
} as const;
type Branch = keyof typeof ORACLE;
const STATES = ["旺", "相", "休", "囚", "廢"] as const;
// Independent expected incoming canonical month pillars for the pinned 2026
// timeline. Astronomical instants come from the established runtime; this is
// not an independent ephemeris-accuracy test.
const JIE = [
  { index: 1, code: "xiaohan", pillar: "己丑", branch: "丑" },
  { index: 3, code: "lichun", pillar: "庚寅", branch: "寅" },
  { index: 5, code: "jingzhe", pillar: "辛卯", branch: "卯" },
  { index: 7, code: "qingming", pillar: "壬辰", branch: "辰" },
  { index: 9, code: "lixia", pillar: "癸巳", branch: "巳" },
  { index: 11, code: "mangzhong", pillar: "甲午", branch: "午" },
  { index: 13, code: "xiaoshu", pillar: "乙未", branch: "未" },
  { index: 15, code: "liqiu", pillar: "丙申", branch: "申" },
  { index: 17, code: "bailu", pillar: "丁酉", branch: "酉" },
  { index: 19, code: "hanlu", pillar: "戊戌", branch: "戌" },
  { index: 21, code: "lidong", pillar: "己亥", branch: "亥" },
  { index: 23, code: "daxue", pillar: "庚子", branch: "子" },
] as const;
const LONGITUDES = [100.5018, -74.006, 139.6917] as const;
const TIMEZONES = ["UTC", "Asia/Bangkok", "America/New_York", "Asia/Tokyo"] as const;
const OFFSETS = [-1, 0, 1] as const;

function termMs(year: number, index: number): number {
  const iso = solar.canonicalSolarTermInstant(year, index);
  assert.equal(typeof iso, "string", `term ${year}/${index} available`);
  const value = Date.parse(iso);
  assert.ok(Number.isFinite(value));
  return value;
}

function checkMap(monthBranch: Branch) {
  const expected = ORACLE[monthBranch];
  const actual = seasonal.nineStarVigorForMonthBranch(monthBranch);
  assert.equal(actual.method, "YANBO_NINE_STAR_MONTH_V1");
  assert.equal(actual.sourceSha256, "cc3a5a5dbc4742467551456b3f296efd7e7c4b36336cbb4b9133162093b5c16e");
  assert.equal(actual.monthBranch, monthBranch);
  assert.equal(actual.monthElement, expected.element);
  assert.deepEqual(actual.order, [...expected.order]);
  const expectedMap = Object.fromEntries([...expected.order].map((element, index) => [element, STATES[index]]));
  assert.deepEqual(actual.byElement, expectedMap, `${monthBranch}: all five labels match the source oracle`);
  return actual;
}

function checkAt(requested: number, expectedPillar: string, expectedBranch: Branch) {
  const instant = new Date(requested);
  const month = solar.solarTermMonthWindow(instant);
  assert.ok(Date.parse(month.startAt) <= requested && requested < Date.parse(month.endAt));
  let commonMonthTuple: string | undefined;
  let commonMap: ReturnType<typeof checkMap> | undefined;
  for (const longitude of LONGITUDES) {
    // This API deliberately has no timezone operand: only year/month use the
    // global BJT Jie clock; longitude changes the day/hour apparent clock.
    const canonical = pillars.canonicalQimenPillars({ instant, longitude });
    assert.equal(canonical.monthPillarZh, expectedPillar);
    assert.equal(canonical.monthPillarZh.slice(-1), expectedBranch);
    assert.equal(canonical.yearMonthBoundaryClock, "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1");
    const tuple = `${canonical.yearPillarZh}|${canonical.monthPillarZh}`;
    if (commonMonthTuple === undefined) commonMonthTuple = tuple;
    else assert.equal(tuple, commonMonthTuple, "canonical year/month is longitude independent");
    const map = checkMap(canonical.monthPillarZh.slice(-1));
    if (commonMap === undefined) commonMap = map;
    else assert.deepEqual(map, commonMap, "same canonical month means identical seasonal maps");

    let commonHour: { startAt: string; endAt: string; shichenKey: string } | undefined;
    for (const timezone of TIMEZONES) {
      const hour = timeline.trueSolarShichenWindow({ instant, longitude, timezone });
      assert.ok(Date.parse(hour.startAt) <= requested && requested < Date.parse(hour.endAt));
      const bounds = { startAt: hour.startAt, endAt: hour.endAt, shichenKey: hour.shichenKey };
      if (commonHour === undefined) commonHour = bounds;
      else assert.deepEqual(bounds, commonHour, "timezone labels cannot shift true-solar hour bounds");
      // Feed the same timezone-bearing transport input to the JS pillar API:
      // unrelated civil timezone data must not become month authority.
      const transported = pillars.canonicalQimenPillars({ instant, longitude, timezone });
      assert.equal(transported.monthPillarZh, expectedPillar);
      assert.deepEqual(checkMap(transported.monthPillarZh.slice(-1)), commonMap);
      transportCases += 1;
    }
  }
  return month;
}

let transportCases = 0;
let jieInstants = 0;
let zhongqiInstants = 0;
let straddlingHours = 0;
const earthBranches = new Set<Branch>();
const containmentWitnesses: object[] = [];

for (const [position, entry] of JIE.entries()) {
  const seam = termMs(2026, entry.index);
  const previous = position === 0
    ? { code: "daxue", pillar: "戊子", branch: "子" as const }
    : JIE[position - 1];
  const next = JIE[(position + 1) % JIE.length];
  const beforeMap = checkMap(previous.branch);
  const incomingMap = checkMap(entry.branch);
  if (ORACLE[previous.branch].element === ORACLE[entry.branch].element) {
    assert.deepEqual(beforeMap.byElement, incomingMap.byElement, "a new branch in the same element retains vigor");
  } else {
    assert.notDeepEqual(beforeMap.byElement, incomingMap.byElement, "a different month element changes the vigor map");
  }

  const beforeMonth = solar.solarTermMonthWindow(new Date(seam - 1));
  const incomingMonth = solar.solarTermMonthWindow(new Date(seam));
  assert.equal(Date.parse(beforeMonth.endAt), seam, "outgoing canonical month ends at Jie");
  assert.equal(Date.parse(incomingMonth.startAt), seam, "incoming canonical month includes exact Jie");
  assert.equal(incomingMonth.endTermCode, next.code);
  for (const delta of OFFSETS) {
    const expected = delta < 0 ? previous : entry;
    const month = checkAt(seam + delta, expected.pillar, expected.branch);
    assert.equal(month.startTermCode, expected.code);
    jieInstants += 1;
  }

  // A Jie usually falls inside an unchanged true-solar shichen. Neither
  // adjacent month then contains that entire hour: production must retain
  // fail-closed containment or separately approve a split validity contract.
  for (const longitude of LONGITUDES) {
    const outgoing = timeline.trueSolarShichenWindow({ instant: new Date(seam - 1), longitude, timezone: "UTC" });
    const incoming = timeline.trueSolarShichenWindow({ instant: new Date(seam), longitude, timezone: "UTC" });
    assert.equal(outgoing.startAt, incoming.startAt);
    assert.equal(outgoing.endAt, incoming.endAt);
    assert.ok(Date.parse(incoming.startAt) < seam && seam < Date.parse(incoming.endAt));
    assert.ok(Date.parse(outgoing.endAt) > Date.parse(beforeMonth.endAt), "outgoing month cannot contain whole crossing hour");
    assert.ok(Date.parse(incoming.startAt) < Date.parse(incomingMonth.startAt), "incoming month cannot contain whole crossing hour");
    straddlingHours += 1;
    if (entry.code === "qingming") {
      containmentWitnesses.push({ jie: entry.code, at: new Date(seam).toISOString(), longitude, hourStart: incoming.startAt, hourEnd: incoming.endAt });
    }
  }

  // Index zero is the winter solstice preceding that tyme4ts solar-term year.
  const zhongqi = entry.index === 23 ? termMs(2027, 0) : termMs(2026, entry.index + 1);
  assert.ok(seam < zhongqi && zhongqi < Date.parse(incomingMonth.endAt));
  for (const delta of OFFSETS) {
    const month = checkAt(zhongqi + delta, entry.pillar, entry.branch);
    assert.deepEqual(month, incomingMonth, "Zhongqi cannot change canonical month or its validity window");
    zhongqiInstants += 1;
  }

  if (entry.branch === "丑" || entry.branch === "辰" || entry.branch === "未" || entry.branch === "戌") {
    earthBranches.add(entry.branch);
    assert.equal(incomingMap.monthElement, "土");
    assert.equal(incomingMap.byElement.水, "囚", "source water-star example includes every earth month");
    assert.equal(incomingMap.byElement.土, "相", "Yanbo same-element star label, not generic earth-season 旺");
    for (const requested of [seam, Math.floor((seam + Date.parse(incomingMonth.endAt)) / 2), Date.parse(incomingMonth.endAt) - 1]) {
      assert.deepEqual(checkAt(requested, entry.pillar, entry.branch), incomingMonth, "earth policy covers the whole Jie month, not an 18-day suffix");
    }
  }
}

assert.deepEqual([...earthBranches].sort(), ["丑", "辰", "未", "戌"].sort());
assert.equal(jieInstants, 36);
assert.equal(zhongqiInstants, 36);
assert.equal(straddlingHours, 36);
// Dynamic imports of an external engine or DB-capable runtime would make a
// supposedly pure oracle unsafe; none are needed by these application helpers.
assert.equal(Object.keys(require.cache).some((filename) => /[/\\]qimen-api[/\\]|[/\\]node_modules[/\\](?:pg|better-sqlite3|sqlite3)[/\\]/u.test(filename)), false);
console.log(`QIMEN_SEASONAL_MONTH_BOUNDARIES_OK ${jieInstants} Jie instants; ${zhongqiInstants} Zhongqi instants; ${transportCases} longitude/timezone cases; ${earthBranches.size} whole earth months; ${straddlingHours} straddling-hour containment challenges`);
console.log(`QIMEN_MONTH_HOUR_CONTAINMENT_WITNESSES ${JSON.stringify(containmentWitnesses)}`);
