import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const advisory = require("../src/lib/qimen-notification-advisory.cjs");
const pillars = require("../src/lib/qimen-canonical-pillars.cjs");
const manifest = require("../src/lib/qimen-canonical-source-manifest.cjs").loadCanonicalSourceManifest();

// Reproduction of the deployed reference table's chart 1062. The month is
// independently checked against the declared Yanbo nine-star rule, not the
// stored chart array. A cached chart must not decide a star's seasonal state.
const instant = new Date("2026-06-22T03:00:00.000Z");
const longitude = 100.5018;
const canonical = pillars.canonicalQimenPillars({ instant, longitude });
assert.equal(canonical.monthPillarZh, "甲午");
assert.equal(canonical.hourPillarZh, "乙巳");
const apparent = advisory.apparentSolarCoordinate(longitude, instant);
const hour = manifest.layers.hour;
const response = {
  calculation: {
    input_datetime: instant.toISOString(),
    input_timezone: "Asia/Bangkok",
    corrected_datetime: new Date(apparent.coordinate.valueOf() - 7 * 3_600_000).toISOString(),
    apparent_solar_coordinate: apparent.coordinate.toISOString(),
    correction_minutes: (apparent.coordinate.valueOf() - instant.valueOf()) / 60_000 - 420,
    time_mode: "true_solar_time",
    ju_method: "chai_bu",
    pillars: canonical,
    engine_contract: {
      version: hour.engineContractVersion,
      source_sha256: hour.engineSourceDigest,
      dependency_closure_version: hour.engineDependencyClosureVersion,
      dependency_closure_sha256: hour.engineDependencyClosureDigest,
      node_runtime: hour.engineNodeRuntime,
      reference_data_version: hour.engineReferenceDataVersion,
      reference_data_sha256: hour.engineReferenceDataDigest,
      profile_id: hour.engineProfileId,
      apparent_timeline: "UTC_PLUS_LONGITUDE_EOT_MONOTONIC_V1",
      equation_of_time: "NOAA_CONTINUOUS_TROPICAL_PHASE_V1",
      year_month_clock: "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1",
      day_boundary_policy: "TRUE_SOLAR_MIDNIGHT_ZI_HOUR_23_V1",
    },
  },
  chart: { dun_type: "yin", ju_number: 9, wang_xiang_status: ["火", "土", "木", "水", "金"] },
  warnings: [],
  palaces: [{
    palace_id: 4, direction: "SE", display_score: 67,
    deity_code: "TAI_YIN", deity_zh: "太陰", deity_name_th: "ไท่อิน", deity_name_en: "Tai Yin",
    deity_quality: "auspicious",
    door_code: "KAI_MEN", door_zh: "開門", door_name_th: "ประตูเปิด", door_name_en: "Open Door",
    door_quality: "auspicious",
    star_code: "TIAN_FU", star_zh: "天輔", star_name_th: "ดาวเทียนฝู่", star_name_en: "Heavenly Assistant",
    star_quality: "auspicious",
    is_void_any: false, classical_flags: [],
    beginner_reading: {
      version: "qimen-beginner-reading-20260605", code: "usable", tone: "ok",
      is_actionable: true, hard_count: 0, caution_count: 0, reasons: [],
    },
  }],
};
const options = { timezone: "Asia/Bangkok", longitude, purpose: "travel", schema: 4,
  doorMethod: "STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1" };
const actual = advisory.buildQimenAdvisory({ data: response }, options);
assert.ok(actual, "the complete reproduction must reach seasonal classification");
assert.equal(actual.star.vigor, "旺", "Yanbo: 木生午火 means 天輔(木) is 旺, never cached-chart 休");
assert.equal(actual.door.vigor, "死", "ordinary metal-door 死 remains separate from Yanbo metal-star 囚");
assert.equal(actual.recommendation, "caution", "a corrected strong star does not override a weak door");
assert.equal(actual.wangXiangOrder, null, "V4 must not imply a shared cached element order");
assert.deepEqual(actual.starWangXiangOrder, ["木", "火", "水", "金", "土"]);
assert.deepEqual(actual.doorWangXiangOrder, ["火", "土", "木", "水", "金"]);
assert.equal(actual.seasonalEvidence.monthPillarZh, "甲午");
assert.equal(actual.seasonalEvidence.starMethod, "YANBO_NINE_STAR_MONTH_V1");
assert.equal(actual.version, "qimen-notification-advisory-month-v2");
assert.equal(advisory.qimenSourceFacts(actual).qimen.seasonalEvidence.monthPillarZh, "甲午");
const legacy = advisory.buildQimenAdvisory({ data: response }, { timezone: "Asia/Bangkok", longitude, purpose: "travel" });
assert.equal(legacy.star.vigor, "休", "unversioned legacy path is frozen, not silently relabeled as corrected");
assert.equal(legacy.version, "qimen-notification-advisory-v1");
assert.equal(Object.hasOwn(legacy, "seasonalEvidence"), false);

const invoke = (change: (value: any) => void, extra: Record<string, unknown> = {}) => {
  const value = structuredClone(response); change(value);
  return advisory.buildQimenAdvisory({ data: value }, { ...options, ...extra });
};
assert.throws(() => invoke(() => {}, { doorMethod: undefined }), /qimen_seasonal_door_method_required/u);
assert.throws(() => invoke(() => {}, { doorMethod: "unknown" }), /qimen_seasonal_door_method_required/u);
assert.throws(() => invoke(() => {}, { schema: undefined }), /qimen_notification_seasonal_schema_required/u);
assert.throws(() => invoke(() => {}, { schema: 5 }), /qimen_notification_advisory_schema_invalid/u);
assert.throws(() => invoke((value) => { value.calculation.pillars.monthPillarZh = "乙未"; }), /QIMEN_ENGINE_PILLARS_MISMATCH/u);
assert.throws(() => invoke((value) => { delete value.calculation.pillars; }), /QIMEN_ENGINE_PILLARS_MISMATCH/u);
assert.equal(invoke((value) => { delete value.chart.wang_xiang_status; }).star.vigor, "旺",
  "V4 never depends on cached array availability");
assert.equal(invoke((value) => { value.chart.wang_xiang_status.reverse(); }).star.vigor, "旺");
const dark = invoke(() => {}, { doorMethod: "TONGZONG_DARK_RESIDUAL_QI_DOOR_MONTH_V1" });
assert.equal(dark.star.vigor, "旺");
assert.equal(dark.door.vigor, "囚");
assert.equal(dark.seasonalEvidence.doorProvenance, "TONGZONG_PRIMARY_DARK_RESIDUAL_QI_V1");

const supportive = (value: any) => {
  Object.assign(value.palaces[0], { door_code: "SHENG_MEN", door_zh: "生門", door_name_th: "ประตูชีวิต", door_name_en: "Life Door" });
};
assert.equal(invoke(supportive).recommendation, "recommended");
assert.equal(invoke((value) => { supportive(value); value.palaces[0].display_score = 59; }).recommendation, "caution");
assert.equal(invoke((value) => { supportive(value); value.palaces[0].beginner_reading.hard_count = 1; }).recommendation, "caution");
assert.equal(invoke((value) => { supportive(value); value.palaces[0].is_fu_yin = true; }).recommendation, "caution");
assert.equal(invoke((value) => { supportive(value); value.warnings = [{ type: "UNKNOWN_WARNING" }]; }).recommendation, "caution");
assert.equal(invoke((value) => { supportive(value); Object.assign(value.palaces[0], { is_void_any: true, is_men_po: true, is_ru_mu: true }); }).recommendation, "caution");
const exhausted = invoke((value) => {
  supportive(value);
  Object.assign(value.palaces[0], { star_code: "TIAN_REN", star_zh: "天任", star_name_th: "ดาวเทียนเริ่น", star_name_en: "Heavenly Ambassador" });
});
assert.equal(exhausted.star.vigor, "廢");
assert.equal(exhausted.recommendation, "caution");
assert.ok(exhausted.warningCodes.includes("STAR_VIGOR_FEI"));
assert.ok(!exhausted.warningCodes.includes("STAR_VIGOR_SI"));
for (const locale of ["th", "en", "zh"]) {
  const copy = advisory.buildQimenStandaloneCopy(exhausted, locale);
  assert.ok(copy.body.includes("廢"));
  assert.ok(!copy.body.includes("STAR_VIGOR_FEI"), `${locale}: localize the new warning`);
}

console.log("QIMEN_SEASONAL_VIGOR_OK source-month-reproduction");
