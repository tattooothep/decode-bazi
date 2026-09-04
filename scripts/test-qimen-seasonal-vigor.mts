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
const actual = advisory.buildQimenAdvisory({ data: response }, { timezone: "Asia/Bangkok", longitude, purpose: "travel" });
assert.ok(actual, "the complete reproduction must reach seasonal classification");
assert.equal(actual.star.vigor, "旺", "Yanbo: 木生午火 means 天輔(木) is 旺, never cached-chart 休");

console.log("QIMEN_SEASONAL_VIGOR_OK source-month-reproduction");
