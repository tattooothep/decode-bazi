"use strict";

const { SolarTime } = require("tyme4ts");
const advisoryRuntime = require("./qimen-notification-advisory.cjs");

const PILLAR_RE = /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/u;

function canonicalError(code = "QIMEN_CANONICAL_PILLARS_UNAVAILABLE") {
  const error = new Error(code);
  error.code = code;
  return error;
}

function utcParts(at) {
  return Object.freeze({
    year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate(),
    hour: at.getUTCHours(), minute: at.getUTCMinutes(), second: at.getUTCSeconds(),
  });
}

function eightChar(parts) {
  return SolarTime.fromYmdHms(
    parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second,
  ).getLunarHour().getEightChar();
}

/**
 * Canonical notification pillars use two explicit clocks:
 * - 年/月: the pinned astronomical Jie timeline represented in BJT, the
 *   native coordinate of tyme4ts. A Jie changes at one global instant.
 * - 日/時: monotonic apparent-solar fields. 日 changes at apparent midnight;
 *   時 retains the library's 子-hour convention beginning at 23:00.
 */
function canonicalQimenPillars(input) {
  const at = input?.instant instanceof Date ? new Date(input.instant.valueOf()) : new Date(input?.instant);
  const longitude = Number(input?.longitude);
  if (!Number.isFinite(at.valueOf()) || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw canonicalError();
  }
  const bjt = utcParts(new Date(at.valueOf() + 8 * 3_600_000));
  const bjtEight = eightChar(bjt);
  const apparent = advisoryRuntime.apparentSolarCoordinate(longitude, at).parts;
  const apparentEight = eightChar(apparent);
  // tyme4ts advances the day pillar at 23:00. The notification contract uses
  // true-solar midnight for 日家, while retaining 子-hour for the hour pillar.
  const dayAnchor = apparent.hour === 23
    ? { ...apparent, hour: 22, minute: 59, second: 59 }
    : apparent;
  const dayEight = apparent.hour === 23 ? eightChar(dayAnchor) : apparentEight;
  const result = Object.freeze({
    yearPillarZh: bjtEight.getYear().getName(),
    monthPillarZh: bjtEight.getMonth().getName(),
    dayPillarZh: dayEight.getDay().getName(),
    hourPillarZh: apparentEight.getHour().getName(),
    apparentDate: `${String(apparent.year).padStart(4, "0")}-${String(apparent.month).padStart(2, "0")}-${String(apparent.day).padStart(2, "0")}`,
    apparentTime: `${String(apparent.hour).padStart(2, "0")}:${String(apparent.minute).padStart(2, "0")}:${String(apparent.second).padStart(2, "0")}`,
    yearMonthBoundaryClock: "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1",
    dayBoundaryPolicy: "TRUE_SOLAR_MIDNIGHT_ZI_HOUR_23_V1",
  });
  if (![result.yearPillarZh, result.monthPillarZh, result.dayPillarZh, result.hourPillarZh].every((pillar) => PILLAR_RE.test(pillar))) {
    throw canonicalError();
  }
  return result;
}

function assertEnginePillars(enginePillars, canonical) {
  if (!enginePillars || typeof enginePillars !== "object") throw canonicalError("QIMEN_ENGINE_PILLARS_MISMATCH");
  for (const key of ["yearPillarZh", "monthPillarZh", "dayPillarZh", "hourPillarZh"]) {
    if (String(enginePillars[key] || "") !== canonical[key]) {
      throw canonicalError("QIMEN_ENGINE_PILLARS_MISMATCH");
    }
  }
  return true;
}

module.exports = Object.freeze({ assertEnginePillars, canonicalQimenPillars });
