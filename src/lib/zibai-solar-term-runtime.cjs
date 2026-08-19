"use strict";

const { SolarTerm, SolarTime } = require("tyme4ts");

const SOLAR_SECTION_CODES = Object.freeze([
  "xiaohan", "lichun", "jingzhe", "qingming", "lixia", "mangzhong",
  "xiaoshu", "liqiu", "bailu", "hanlu", "lidong", "daxue",
]);

function validInstant(at) {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) throw new TypeError("zibai_invalid_instant");
  return at;
}

/** tyme4ts exposes solar-term wall fields in Chinese standard time (UTC+8). */
function globalTermReferenceAt(at) {
  const termInstant = new Date(validInstant(at).getTime() + 8 * 3_600_000);
  return Object.freeze({
    year: termInstant.getUTCFullYear(), month: termInstant.getUTCMonth() + 1,
    day: termInstant.getUTCDate(), hour: termInstant.getUTCHours(),
    minute: termInstant.getUTCMinutes(), second: termInstant.getUTCSeconds(),
  });
}

function solarTimeFromReference(reference) {
  return SolarTime.fromYmdHms(
    reference.year, reference.month, reference.day,
    reference.hour, reference.minute, reference.second,
  );
}

function termUtcIso(term) {
  const parts = term.getJulianDay().getSolarTime();
  return new Date(Date.UTC(
    parts.getYear(), parts.getMonth() - 1, parts.getDay(), parts.getHour() - 8,
    parts.getMinute(), parts.getSecond(),
  )).toISOString();
}

function codeForTerm(term) {
  const code = SOLAR_SECTION_CODES[(term.getIndex() - 1) / 2];
  if (!code) throw new Error("zibai_solar_boundary_unavailable");
  return code;
}

function windowFromStartTerm(startTerm) {
  const endTerm = startTerm.next(2);
  return Object.freeze({
    startAt: termUtcIso(startTerm),
    endAt: termUtcIso(endTerm),
    startTermCode: codeForTerm(startTerm),
    endTermCode: codeForTerm(endTerm),
  });
}

function solarTermMonthWindowFromReference(reference) {
  const currentTerm = solarTimeFromReference(reference).getTerm();
  return windowFromStartTerm(currentTerm.isJie() ? currentTerm : currentTerm.next(-1));
}

function solarTermMonthWindow(at) {
  return solarTermMonthWindowFromReference(globalTermReferenceAt(at));
}

function canonicalSolarTermMonthWindow(year, startTermCode) {
  const codeIndex = SOLAR_SECTION_CODES.indexOf(startTermCode);
  if (!Number.isInteger(year) || codeIndex < 0) return null;
  try {
    return windowFromStartTerm(SolarTerm.fromIndex(year, codeIndex * 2 + 1));
  } catch {
    return null;
  }
}

function isCanonicalSolarTermMonthWindow(value) {
  if (!value || typeof value !== "object" || typeof value.startAt !== "string") return false;
  const start = new Date(value.startAt);
  if (!Number.isFinite(start.getTime()) || start.toISOString() !== value.startAt) return false;
  const canonical = canonicalSolarTermMonthWindow(start.getUTCFullYear(), value.startTermCode);
  return canonical !== null
    && value.startAt === canonical.startAt
    && value.endAt === canonical.endAt
    && value.endTermCode === canonical.endTermCode;
}

module.exports = Object.freeze({
  SOLAR_SECTION_CODES,
  globalTermReferenceAt,
  solarTermMonthWindowFromReference,
  solarTermMonthWindow,
  canonicalSolarTermMonthWindow,
  isCanonicalSolarTermMonthWindow,
});
