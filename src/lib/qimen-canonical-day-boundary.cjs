"use strict";

const { canonicalSolarTermInstant } = require("./zibai-solar-term-runtime.cjs");

const CALCULATION_VERSION = "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1";
const BOUNDARY_POLICY = "ASTRONOMICAL_TERM_INSTANT_HALF_OPEN_NO_CARRY_V1";
const TRANSITIONS = Object.freeze([
  Object.freeze({ index: 0, code: "dongzhi", dun: "yang", ju: 1 }),
  Object.freeze({ index: 4, code: "yushui", dun: "yang", ju: 7 }),
  Object.freeze({ index: 8, code: "guyu", dun: "yang", ju: 4 }),
  Object.freeze({ index: 12, code: "xiazhi", dun: "yin", ju: 9 }),
  Object.freeze({ index: 16, code: "chushu", dun: "yin", ju: 3 }),
  Object.freeze({ index: 20, code: "shuangjiang", dun: "yin", ju: 6 }),
]);

function canonicalError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

function resolveFaqiaoDayJu(value) {
  const at = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (!Number.isFinite(at.valueOf())) throw canonicalError("QIMEN_DAY_BOUNDARY_INVALID");
  const utcYear = at.getUTCFullYear();
  const boundaries = [];
  for (let cycleYear = utcYear - 1; cycleYear <= utcYear + 2; cycleYear += 1) {
    for (const transition of TRANSITIONS) {
      const instant = canonicalSolarTermInstant(cycleYear, transition.index);
      if (!instant) throw canonicalError("QIMEN_DAY_BOUNDARY_UNAVAILABLE");
      boundaries.push(Object.freeze({ ...transition, instant }));
    }
  }
  boundaries.sort((left, right) => Date.parse(left.instant) - Date.parse(right.instant));
  let activeIndex = -1;
  for (let index = 0; index < boundaries.length; index += 1) {
    if (Date.parse(boundaries[index].instant) <= at.valueOf()) activeIndex = index;
    else break;
  }
  const active = boundaries[activeIndex];
  const next = boundaries[activeIndex + 1];
  if (!active || !next) throw canonicalError("QIMEN_DAY_BOUNDARY_UNAVAILABLE");
  return Object.freeze({
    calculationVersion: CALCULATION_VERSION,
    boundaryPolicy: BOUNDARY_POLICY,
    termCountEditorialRule: "SOURCE_ENUMERATION_24_TERMS_OPERATIONALIZED_AS_SIX_FOUR_QI_BOUNDARIES_V1",
    dun: active.dun,
    ju: active.ju,
    validFrom: active.instant,
    validUntil: next.instant,
    startTermCode: active.code,
    endTermCode: next.code,
  });
}

module.exports = Object.freeze({
  BOUNDARY_POLICY,
  CALCULATION_VERSION,
  TRANSITIONS,
  resolveFaqiaoDayJu,
});
