import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pillarRuntime = require("../src/lib/qimen-canonical-pillars.cjs") as {
  canonicalQimenPillars(input: { instant: Date | string; longitude: number }): {
    yearPillarZh: string;
    monthPillarZh: string;
    dayPillarZh: string;
    hourPillarZh: string;
  };
  assertEnginePillars(engine: Record<string, string>, canonical: Record<string, string>): boolean;
};
const solarRuntime = require("../src/lib/zibai-solar-term-runtime.cjs") as {
  canonicalSolarTermInstant(year: number, index: number): string;
};
const advisoryRuntime = require("../src/lib/qimen-notification-advisory.cjs") as {
  trueSolarDayWindow(input: { timezone: string; longitude: number; instant: Date | string }): {
    startAt: string;
    endAt: string;
  };
  trueSolarShichenWindow(input: { timezone: string; longitude: number; instant: Date | string }): {
    startAt: string;
    endAt: string;
    shichenKey: string;
  };
};

const locations = [100.5018, -74.006, 139.6917];
for (let index = 1; index <= 23; index += 2) {
  const boundary = Date.parse(solarRuntime.canonicalSolarTermInstant(2026, index));
  const before = locations.map((longitude) => pillarRuntime.canonicalQimenPillars({ instant: new Date(boundary - 1), longitude }));
  const at = locations.map((longitude) => pillarRuntime.canonicalQimenPillars({ instant: new Date(boundary), longitude }));
  const after = locations.map((longitude) => pillarRuntime.canonicalQimenPillars({ instant: new Date(boundary + 1), longitude }));
  assert.equal(new Set(before.map((value) => `${value.yearPillarZh}|${value.monthPillarZh}`)).size, 1);
  assert.equal(new Set(at.map((value) => `${value.yearPillarZh}|${value.monthPillarZh}`)).size, 1);
  assert.deepEqual(after.map((value) => [value.yearPillarZh, value.monthPillarZh]), at.map((value) => [value.yearPillarZh, value.monthPillarZh]));
  assert.notEqual(
    `${before[0].yearPillarZh}|${before[0].monthPillarZh}`,
    `${at[0].yearPillarZh}|${at[0].monthPillarZh}`,
    `Jie index ${index} must change the canonical year/month tuple at T`,
  );
}

const lichun = Date.parse(solarRuntime.canonicalSolarTermInstant(2026, 3));
const lichunBefore = pillarRuntime.canonicalQimenPillars({ instant: new Date(lichun - 1), longitude: 100.5018 });
const lichunAt = pillarRuntime.canonicalQimenPillars({ instant: new Date(lichun), longitude: 100.5018 });
assert.equal(lichunBefore.yearPillarZh, "乙巳");
assert.equal(lichunAt.yearPillarZh, "丙午");

const newYorkAfterLichun = pillarRuntime.canonicalQimenPillars({ instant: "2026-02-04T01:00:00.000Z", longitude: -74.006 });
assert.equal(newYorkAfterLichun.yearPillarZh, "丙午");
assert.equal(newYorkAfterLichun.monthPillarZh, "庚寅");
assert.equal(newYorkAfterLichun.apparentDate, "2026-02-03");

const bangkok = { timezone: "Asia/Bangkok", longitude: 100.5018 };
const daytime = advisoryRuntime.trueSolarDayWindow({ ...bangkok, instant: "2026-08-21T12:00:00.000Z" });
const midnight = Date.parse(daytime.endAt);
const dayBefore = pillarRuntime.canonicalQimenPillars({ instant: new Date(midnight - 1_000), longitude: bangkok.longitude });
const dayAfter = pillarRuntime.canonicalQimenPillars({ instant: new Date(midnight + 1_000), longitude: bangkok.longitude });
assert.notEqual(dayBefore.dayPillarZh, dayAfter.dayPillarZh, "day pillar advances exactly once at true-solar midnight");

const haiWindow = advisoryRuntime.trueSolarShichenWindow({ ...bangkok, instant: new Date(midnight - 90 * 60_000) });
assert.equal(haiWindow.shichenKey, "hai");
const ziStart = Date.parse(haiWindow.endAt);
const beforeZi = pillarRuntime.canonicalQimenPillars({ instant: new Date(ziStart - 1_000), longitude: bangkok.longitude });
const atZi = pillarRuntime.canonicalQimenPillars({ instant: new Date(ziStart + 1_000), longitude: bangkok.longitude });
assert.notEqual(beforeZi.hourPillarZh, atZi.hourPillarZh, "Zi hour starts at apparent 23:00");
assert.equal(beforeZi.dayPillarZh, atZi.dayPillarZh, "day pillar remains unchanged at the Zi-hour boundary");

const canonical = pillarRuntime.canonicalQimenPillars({ instant: "2026-08-21T06:00:00.000Z", longitude: 100.5018 });
assert.equal(pillarRuntime.assertEnginePillars(canonical, canonical), true);
assert.throws(
  () => pillarRuntime.assertEnginePillars({ ...canonical, monthPillarZh: "己丑" }, canonical),
  /QIMEN_ENGINE_PILLARS_MISMATCH/u,
  "a syntactically valid but incorrect engine pillar fails closed",
);

console.log("qimen canonical independent pillar tests passed");
