import assert from "node:assert/strict";
import { astro } from "iztro";
import {
  buildZiweiHourlyPreview, resolveUnambiguousIanaWallClock, ZIWEI_HOURLY_LINEAGE,
} from "../src/lib/astro/ziwei/hourly-preview";

const BRANCH_BY_GROUND = ["寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子", "丑"];
const S2T: Record<string, string> = {
  太阳: "太陽", 太阴: "太陰", 天机: "天機", 廉贞: "廉貞", 贪狼: "貪狼",
  巨门: "巨門", 七杀: "七殺", 破军: "破軍", 左辅: "左輔", 右弼: "右弼",
  文昌: "文昌", 文曲: "文曲", 武曲: "武曲", 天同: "天同", 天梁: "天梁",
  紫微: "紫微",
};
const FLOW_NAME: Record<string, string> = {
  时魁: "流時天魁", 时钺: "流時天鉞", 时昌: "流時文昌", 时曲: "流時文曲",
  时禄: "流時祿存", 时羊: "流時擎羊", 时陀: "流時陀羅", 时马: "流時天馬",
  时鸾: "流時紅鸞", 时喜: "流時天喜",
};
const LAYER_FLOW_NAMES = {
  yearly: {
    流魁: "流年天魁", 流钺: "流年天鉞", 流昌: "流年文昌", 流曲: "流年文曲",
    流禄: "流年祿存", 流羊: "流年擎羊", 流陀: "流年陀羅", 流马: "流年天馬",
    流鸾: "流年紅鸞", 流喜: "流年天喜",
  },
  monthly: {
    月魁: "流月天魁", 月钺: "流月天鉞", 月昌: "流月文昌", 月曲: "流月文曲",
    月禄: "流月祿存", 月羊: "流月擎羊", 月陀: "流月陀羅", 月马: "流月天馬",
    月鸾: "流月紅鸞", 月喜: "流月天喜",
  },
  daily: {
    日魁: "流日天魁", 日钺: "流日天鉞", 日昌: "流日文昌", 日曲: "流日文曲",
    日禄: "流日祿存", 日羊: "流日擎羊", 日陀: "流日陀羅", 日马: "流日天馬",
    日鸾: "流日紅鸞", 日喜: "流日天喜",
  },
} as const;

type OracleFlowLayer = {
  index: number;
  heavenlyStem: string;
  earthlyBranch: string;
  mutagen: string[];
  stars: Array<Array<{ name: string }>>;
};

function oracleLayerStars(layer: OracleFlowLayer, names: Record<string, string>): string[] {
  return layer.stars.flatMap((stars, ground) => stars.flatMap((star) => {
    const mapped = names[star.name];
    return mapped ? [`${mapped}@${BRANCH_BY_GROUND[ground]}`] : [];
  })).sort();
}

function bangkokInstant(y: number, m: number, d: number, hour: number, minute = 30): Date {
  return new Date(Date.UTC(y, m - 1, d, hour - 7, minute, 0));
}

const birthInstant = bangkokInstant(1984, 12, 31, 13, 15);
const natalOracle = astro.bySolar("1984-12-31", 7, "male", true, "zh-CN");
const representativeHours = [0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];

for (const [timeIndex, hour] of representativeHours.entries()) {
  const referenceInstant = bangkokInstant(2026, 8, 26, hour);
  const result = buildZiweiHourlyPreview({
    birthInstant,
    birthTimezone: "Asia/Bangkok",
    birthLocation: { lat: 13.7563, lng: 100.5018 },
    gender: "M",
    referenceInstant,
    referenceTimezone: "Asia/Bangkok",
  });

  // The locked forward-Zi contract assigns 23:00–23:59 to the following
  // calendar calculation day. This avoids iztro's raw late-Zi split state.
  const effectiveDate = timeIndex === 12 ? "2026-8-27" : "2026-8-26";
  const oracleIndex = timeIndex === 12 ? 0 : timeIndex;
  const oracle = oracleIndex === 0
    ? natalOracle.horoscope(effectiveDate)
    : natalOracle.horoscope(effectiveDate, oracleIndex);

  assert.equal(result.lineage, ZIWEI_HOURLY_LINEAGE);
  assert.equal(result.reference.timeIndex, timeIndex);
  assert.equal(result.reference.boundaryPolicy, "forward_zi");
  assert.equal(result.layers.liuNian.mingBranch, BRANCH_BY_GROUND[oracle.yearly.index]);
  assert.equal(result.layers.liuNian.ganzhi, oracle.yearly.heavenlyStem + oracle.yearly.earthlyBranch);
  assert.deepEqual(result.layers.liuNian.siHua.map((item) => item.star), oracle.yearly.mutagen.map((star) => S2T[star] || star));
  assert.deepEqual(result.layers.liuNian.annualStars.map((item) => `${item.star}@${item.branch}`).sort(),
    oracleLayerStars(oracle.yearly, LAYER_FLOW_NAMES.yearly));
  assert.equal(result.layers.liuYue.mingBranch, BRANCH_BY_GROUND[oracle.monthly.index]);
  assert.equal(result.layers.liuYue.ganzhi, oracle.monthly.heavenlyStem + oracle.monthly.earthlyBranch);
  assert.deepEqual(result.layers.liuYue.siHua.map((item) => item.star), oracle.monthly.mutagen.map((star) => S2T[star] || star));
  assert.deepEqual(result.layers.liuYue.monthlyStars.map((item) => `${item.star}@${item.branch}`).sort(),
    oracleLayerStars(oracle.monthly, LAYER_FLOW_NAMES.monthly));
  assert.equal(result.layers.liuRi.mingBranch, BRANCH_BY_GROUND[oracle.daily.index]);
  assert.equal(result.layers.liuRi.ganzhi, oracle.daily.heavenlyStem + oracle.daily.earthlyBranch);
  assert.deepEqual(result.layers.liuRi.siHua.map((item) => item.star), oracle.daily.mutagen.map((star) => S2T[star] || star));
  assert.deepEqual(result.layers.liuRi.dailyStars.map((item) => `${item.star}@${item.branch}`).sort(),
    oracleLayerStars(oracle.daily, LAYER_FLOW_NAMES.daily));
  assert.equal(result.layers.liuShi.mingBranch, BRANCH_BY_GROUND[oracle.hourly.index]);
  assert.equal(result.layers.liuShi.ganzhi, oracle.hourly.heavenlyStem + oracle.hourly.earthlyBranch);
  assert.deepEqual(result.layers.liuShi.siHua.map((item) => item.star), oracle.hourly.mutagen.map((star) => S2T[star] || star));
  const actualStars = result.layers.liuShi.hourlyStars.map((item) => `${item.star}@${item.branch}`).sort();
  const oracleStars = oracle.hourly.stars.flatMap((stars, ground) => stars.map((star) => `${FLOW_NAME[star.name]}@${BRANCH_BY_GROUND[ground]}`)).sort();
  assert.deepEqual(actualStars, oracleStars);
  assert.ok(Date.parse(result.reference.validFrom) <= referenceInstant.getTime());
  assert.ok(Date.parse(result.reference.validUntil) > referenceInstant.getTime());
  assert.equal(Date.parse(result.reference.validUntil) - Date.parse(result.reference.validFrom), 2 * 3_600_000);
  assert.equal(result.decisionSupported, false);
  assert.equal("score" in result, false);
  assert.equal("verdict" in result, false);
}

// `normal` lineage changes 流年 on lunar new year and 流月 on lunar-month
// boundaries, not at 立春/節氣. This fixture caught a five-day yearly drift
// and a wider monthly drift when the BaZi solar-term cycles were used here.
const lunarBoundaryReference = bangkokInstant(2024, 2, 9, 21, 30);
const lunarBoundary = buildZiweiHourlyPreview({
  birthInstant,
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "M",
  referenceInstant: lunarBoundaryReference,
  referenceTimezone: "Asia/Bangkok",
});
const lunarBoundaryOracle = natalOracle.horoscope("2024-2-9", 11);
assert.equal(lunarBoundary.layers.liuNian.ganzhi,
  lunarBoundaryOracle.yearly.heavenlyStem + lunarBoundaryOracle.yearly.earthlyBranch);
assert.equal(lunarBoundary.layers.liuNian.mingBranch, BRANCH_BY_GROUND[lunarBoundaryOracle.yearly.index]);
assert.equal(lunarBoundary.layers.liuYue.ganzhi,
  lunarBoundaryOracle.monthly.heavenlyStem + lunarBoundaryOracle.monthly.earthlyBranch);
assert.equal(lunarBoundary.layers.liuYue.mingBranch, BRANCH_BY_GROUND[lunarBoundaryOracle.monthly.index]);
assert.equal(lunarBoundary.layers.liuRi.mingBranch, BRANCH_BY_GROUND[lunarBoundaryOracle.daily.index]);
assert.equal(lunarBoundary.layers.liuShi.mingBranch, BRANCH_BY_GROUND[lunarBoundaryOracle.hourly.index]);

// `fixLeap:true` in the locked iztro `normal` lineage advances the monthly
// ganzhi after day 15 of a leap lunar month, not only the monthly palace.
// This exact vector guards the 2023 leap-second-month seam.
const lateLeapMonth = buildZiweiHourlyPreview({
  birthInstant,
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "M",
  referenceInstant: bangkokInstant(2023, 4, 19, 12),
  referenceTimezone: "Asia/Bangkok",
});
const lateLeapMonthOracle = natalOracle.horoscope("2023-4-19", 6);
assert.equal(lateLeapMonth.layers.liuYue.effectiveMonth, 3);
assert.equal(lateLeapMonth.layers.liuYue.ganzhi,
  lateLeapMonthOracle.monthly.heavenlyStem + lateLeapMonthOracle.monthly.earthlyBranch);
assert.equal(lateLeapMonth.layers.liuYue.mingBranch, BRANCH_BY_GROUND[lateLeapMonthOracle.monthly.index]);
assert.deepEqual(lateLeapMonth.layers.liuYue.siHua.map((item) => item.star),
  lateLeapMonthOracle.monthly.mutagen.map((star) => S2T[star] || star));
assert.deepEqual(lateLeapMonth.layers.liuYue.monthlyStars.map((item) => `${item.star}@${item.branch}`).sort(),
  oracleLayerStars(lateLeapMonthOracle.monthly, LAYER_FLOW_NAMES.monthly));

for (const sweepYear of [2023, 2024]) {
for (let day = new Date(Date.UTC(sweepYear, 0, 1)); day.getUTCFullYear() === sweepYear; day.setUTCDate(day.getUTCDate() + 1)) {
  const y = day.getUTCFullYear();
  const m = day.getUTCMonth() + 1;
  const d = day.getUTCDate();
  const result = buildZiweiHourlyPreview({
    birthInstant,
    birthTimezone: "Asia/Bangkok",
    birthLocation: { lat: 13.7563, lng: 100.5018 },
    gender: "M",
    referenceInstant: bangkokInstant(y, m, d, 12),
    referenceTimezone: "Asia/Bangkok",
  });
  const oracle = natalOracle.horoscope(`${y}-${m}-${d}`, 6);
  const vector = `${y}-${m}-${d}`;
  assert.equal(result.layers.liuNian.ganzhi, oracle.yearly.heavenlyStem + oracle.yearly.earthlyBranch, `${vector} yearly ganzhi`);
  assert.equal(result.layers.liuNian.mingBranch, BRANCH_BY_GROUND[oracle.yearly.index], `${vector} yearly palace`);
  assert.equal(result.layers.liuYue.ganzhi, oracle.monthly.heavenlyStem + oracle.monthly.earthlyBranch, `${vector} monthly ganzhi`);
  assert.equal(result.layers.liuYue.mingBranch, BRANCH_BY_GROUND[oracle.monthly.index], `${vector} monthly palace`);
  assert.equal(result.layers.liuRi.mingBranch, BRANCH_BY_GROUND[oracle.daily.index], `${vector} daily palace`);
  assert.equal(result.layers.liuShi.mingBranch, BRANCH_BY_GROUND[oracle.hourly.index], `${vector} hourly palace`);
}
}

assert.throws(() => buildZiweiHourlyPreview({
  birthInstant,
  birthTimezone: "",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "M",
  referenceInstant: bangkokInstant(2026, 8, 26, 12),
  referenceTimezone: "Asia/Bangkok",
}), /ziwei_hourly_invalid_birth_timezone/);

assert.throws(() => buildZiweiHourlyPreview({
  birthInstant,
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "M",
  referenceInstant: new Date(Number.NaN),
  referenceTimezone: "Asia/Bangkok",
}), /ziwei_hourly_invalid_reference_instant/);

// Official upstream fixture, plus HourKey's normalized late-Zi/leap seam.
const officialBirth = bangkokInstant(2000, 8, 16, 3, 30);
const officialOracle = astro.bySolar("2000-8-16", 2, "female", true, "zh-CN");
const official = buildZiweiHourlyPreview({
  birthInstant: officialBirth,
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "F",
  referenceInstant: bangkokInstant(2023, 8, 19, 3, 12),
  referenceTimezone: "Asia/Bangkok",
});
const officialExpected = officialOracle.horoscope("2023-8-19", 2);
assert.equal(official.layers.liuShi.mingBranch, BRANCH_BY_GROUND[officialExpected.hourly.index]);
assert.equal(official.layers.liuShi.ganzhi, "丙寅");
const officialFixedBirthOffset = buildZiweiHourlyPreview({
  birthInstant: officialBirth,
  birthTimezone: "+07:00",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "F",
  referenceInstant: bangkokInstant(2023, 8, 19, 3, 12),
  referenceTimezone: "Asia/Bangkok",
});
assert.deepEqual(officialFixedBirthOffset.layers, official.layers,
  "a fixed birth offset accepted by the profile UI must produce the same natal/hourly facts as its equivalent IANA offset");

const lateLeap = buildZiweiHourlyPreview({
  birthInstant: officialBirth,
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "F",
  referenceInstant: bangkokInstant(2023, 4, 5, 23, 30),
  referenceTimezone: "Asia/Bangkok",
});
const earlyLeap = buildZiweiHourlyPreview({
  birthInstant: officialBirth,
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "F",
  referenceInstant: bangkokInstant(2023, 4, 6, 0, 30),
  referenceTimezone: "Asia/Bangkok",
});
assert.equal(lateLeap.reference.effectiveTimeIndex, 0);
assert.equal(lateLeap.reference.windowKey, earlyLeap.reference.windowKey);
assert.equal(lateLeap.reference.validFrom, earlyLeap.reference.validFrom);
assert.equal(lateLeap.reference.validUntil, earlyLeap.reference.validUntil);
assert.equal(lateLeap.layers.liuRi.mingBranch, earlyLeap.layers.liuRi.mingBranch);
assert.equal(lateLeap.layers.liuShi.mingBranch, earlyLeap.layers.liuShi.mingBranch);
assert.equal(lateLeap.layers.liuShi.ganzhi, earlyLeap.layers.liuShi.ganzhi);

assert.throws(() => buildZiweiHourlyPreview({
  birthInstant: bangkokInstant(2023, 4, 5, 23, 30),
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "F",
  referenceInstant: bangkokInstant(2023, 4, 6, 3, 30),
  referenceTimezone: "Asia/Bangkok",
}), /ziwei_hourly_late_zi_birth_unsupported/);

assert.throws(() => buildZiweiHourlyPreview({
  birthInstant: officialBirth,
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "F",
  referenceInstant: bangkokInstant(2100, 12, 31, 23, 30),
  referenceTimezone: "Asia/Bangkok",
}), /ziwei_hourly_calendar_range_unsupported/);

const santiagoTransition = resolveUnambiguousIanaWallClock("2026-09-05T23:30:00", "America/Santiago");
const santiagoPreview = buildZiweiHourlyPreview({
  birthInstant: officialBirth,
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "F",
  referenceInstant: santiagoTransition,
  referenceTimezone: "America/Santiago",
});
assert.equal(santiagoPreview.reference.validFrom, "2026-09-06T03:00:00.000Z");
assert.equal(santiagoPreview.reference.validUntil, "2026-09-06T04:00:00.000Z");
assert.equal(santiagoPreview.reference.calculationDate, "2026-09-06",
  "a midnight DST gap keeps one realized forward-Zi window instead of dropping the shichen");

console.log("PASS ziwei liushi preview — 13 indices, official vector, leap/forward-Zi seam, strict inputs");
