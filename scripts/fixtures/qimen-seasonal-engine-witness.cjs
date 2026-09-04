"use strict";

// Synthetic transport/selection fixture. Canonical clock/pillars are real;
// palace arrangements and scores are deliberately controlled, not historical
// engine-output evidence and not a prediction accuracy golden.
const advisory = require("../../src/lib/qimen-notification-advisory.cjs");
const pillars = require("../../src/lib/qimen-canonical-pillars.cjs");
const manifest = require("../../src/lib/qimen-canonical-source-manifest.cjs").loadCanonicalSourceManifest();
const DIRECTIONS = ["N", "SW", "E", "SE", "C", "NW", "W", "NE", "S"];
const INSTRUMENTS = ["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"];
const STARS = [["TIAN_PENG", "天蓬"], ["TIAN_RUI", "天芮"], ["TIAN_CHONG", "天衝"],
  ["TIAN_FU", "天輔"], ["TIAN_QIN", "天禽"], ["TIAN_XIN", "天心"],
  ["TIAN_ZHU", "天柱"], ["TIAN_REN", "天任"], ["TIAN_YING", "天英"]];
const DOORS = [["XIU_MEN", "休門"], ["SI_MEN", "死門"], ["SHANG_MEN", "傷門"], ["SHENG_MEN", "生門"],
  [null, null], ["KAI_MEN", "開門"], ["JING_FEAR_MEN", "驚門"], ["DU_MEN", "杜門"], ["JING_VIEW_MEN", "景門"]];
const DEITIES = [["ZHI_FU", "直符"], ["TENG_SHE", "螣蛇"], ["LIU_HE", "六合"], ["TAI_YIN", "太陰"],
  [null, null], ["XUAN_WU", "玄武"], ["BAI_HU", "白虎"], ["JIU_DI", "九地"], ["JIU_TIAN", "九天"]];

function build(instant = "2026-06-22T03:00:00.000Z", longitude = 100.5018, timezone = "Asia/Bangkok") {
  const at = new Date(instant);
  const apparent = advisory.apparentSolarCoordinate(longitude, at);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    second: "2-digit", hourCycle: "h23",
  }).formatToParts(at).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const timezoneOffset = Math.round((Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    - Math.floor(at.valueOf() / 1000) * 1000) / 60000);
  const hour = manifest.layers.hour;
  return {
    calculation: {
      input_datetime: at.toISOString(), input_timezone: timezone,
      corrected_datetime: new Date(apparent.coordinate.valueOf() - timezoneOffset * 60000).toISOString(),
      apparent_solar_coordinate: apparent.coordinate.toISOString(),
      correction_minutes: (apparent.coordinate.valueOf() - at.valueOf()) / 60000 - timezoneOffset,
      time_mode: "true_solar_time", ju_method: "chai_bu",
      pillars: pillars.canonicalQimenPillars({ instant: at, longitude }),
      engine_contract: {
        version: hour.engineContractVersion, source_sha256: hour.engineSourceDigest,
        dependency_closure_version: hour.engineDependencyClosureVersion,
        dependency_closure_sha256: hour.engineDependencyClosureDigest,
        node_runtime: hour.engineNodeRuntime, reference_data_version: hour.engineReferenceDataVersion,
        reference_data_sha256: hour.engineReferenceDataDigest, profile_id: hour.engineProfileId,
        apparent_timeline: "UTC_PLUS_LONGITUDE_EOT_MONOTONIC_V1", equation_of_time: "NOAA_CONTINUOUS_TROPICAL_PHASE_V1",
        year_month_clock: "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1", day_boundary_policy: "TRUE_SOLAR_MIDNIGHT_ZI_HOUR_23_V1",
      },
    },
    chart: { wang_xiang_status: ["火", "土", "木", "水", "金"] },
    warnings: [],
    palaces: DIRECTIONS.map((direction, index) => ({
      palace_id: index + 1, direction, display_score: direction === "SE" ? 67 : 10,
      earth_stem_zh: INSTRUMENTS[index], heaven_stem_zh: direction === "C" ? null : INSTRUMENTS[(index + 1) % 9],
      star_code: STARS[index][0], star_zh: STARS[index][1], star_quality: "auspicious",
      door_code: DOORS[index][0], door_zh: DOORS[index][1], door_quality: "auspicious",
      deity_code: DEITIES[index][0], deity_zh: DEITIES[index][1], deity_quality: "auspicious",
      classical_flags: [], is_void_any: false, is_traveling_horse: false,
      beginner_reading: { version: "synthetic-selection-test-v1", code: "usable", hard_count: 0, reasons: [] },
    })),
  };
}

module.exports = Object.freeze({ build });
