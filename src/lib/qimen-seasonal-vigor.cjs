"use strict";

// 煙波釣叟歌, 九星旺衰 / 旺相休囚: star and month are the operands.
// This is NOT the ordinary seasonal five-element table and is NOT a door rule.
const NINE_STAR_METHOD = "YANBO_NINE_STAR_MONTH_V1";
const NINE_STAR_SOURCE_SHA256 = "cc3a5a5dbc4742467551456b3f296efd7e7c4b36336cbb4b9133162093b5c16e";
const SEASONAL_EVIDENCE_VERSION = "QIMEN_SEASONAL_VIGOR_EVIDENCE_V1";
const SEASONAL_HOUR_CALCULATION_VERSION = "QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_MONTH_V2";
const MONTH_BOUNDARY_CLOCK = "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1";
const ELEMENTS = Object.freeze(["木", "火", "土", "金", "水"]);
const MONTH_ELEMENT = Object.freeze({
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火",
  午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水",
});
const GENERATES = Object.freeze({ 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" });
const CONTROLS = Object.freeze({ 木: "土", 火: "金", 土: "水", 金: "木", 水: "火" });
const STAR_STATES = Object.freeze(["旺", "相", "休", "囚", "廢"]);
const STAR_ELEMENT = Object.freeze({
  TIAN_PENG: "水", TIAN_RUI: "土", TIAN_CHONG: "木", TIAN_FU: "木", TIAN_QIN: "土",
  TIAN_XIN: "金", TIAN_ZHU: "金", TIAN_REN: "土", TIAN_YING: "火",
});
const DOOR_ELEMENT = Object.freeze({
  XIU_MEN: "水", SHENG_MEN: "土", SI_MEN: "土", SHANG_MEN: "木", DU_MEN: "木",
  KAI_MEN: "金", JING_FEAR_MEN: "金", JING_VIEW_MEN: "火",
});
const DOOR_METHODS = Object.freeze({
  STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1: Object.freeze({
    sourceSha256: "2fa78ecd8ad36c07ff372d2786a0b0c974c7e2761267afd537ab7f9031bc0a51",
    provenance: "EXISTING_EDITORIAL_PRODUCT_POLICY_V1",
    states: Object.freeze(["旺", "相", "休", "囚", "死"]),
  }),
  TONGZONG_DARK_RESIDUAL_QI_DOOR_MONTH_V1: Object.freeze({
    sourceSha256: "2fa78ecd8ad36c07ff372d2786a0b0c974c7e2761267afd537ab7f9031bc0a51",
    provenance: "TONGZONG_PRIMARY_DARK_RESIDUAL_QI_V1",
    states: Object.freeze(["旺", "相", "休", "囚", "廢"]),
  }),
});

function nineStarVigorForMonthBranch(monthBranch) {
  if (typeof monthBranch !== "string" || !Object.hasOwn(MONTH_ELEMENT, monthBranch)) {
    throw new TypeError("qimen_seasonal_month_branch_invalid");
  }
  const monthElement = MONTH_ELEMENT[monthBranch];
  const byElement = Object.freeze(Object.fromEntries(ELEMENTS.map((starElement) => {
    let state;
    if (GENERATES[starElement] === monthElement) state = "旺"; // 我生之月
    else if (starElement === monthElement) state = "相"; // 與我同行
    else if (CONTROLS[starElement] === monthElement) state = "休"; // 休於財
    else if (CONTROLS[monthElement] === starElement) state = "囚"; // 囚於鬼
    else if (GENERATES[monthElement] === starElement) state = "廢"; // 廢於父母
    else throw new Error("qimen_seasonal_relation_unavailable");
    return [starElement, state];
  })));
  const order = Object.freeze(STAR_STATES.map((state) => ELEMENTS.find((element) => byElement[element] === state)));
  if (order.some((element) => element === undefined) || new Set(order).size !== 5) {
    throw new Error("qimen_seasonal_relation_unavailable");
  }
  return Object.freeze({
    method: NINE_STAR_METHOD,
    sourceSha256: NINE_STAR_SOURCE_SHA256,
    monthBranch,
    monthElement,
    byElement,
    order,
  });
}

function nineStarVigorForMonthPillar(monthPillarZh) {
  const stems = "甲乙丙丁戊己庚辛壬癸";
  const branches = "子丑寅卯辰巳午未申酉戌亥";
  if (typeof monthPillarZh !== "string" || monthPillarZh.length !== 2
    || !stems.includes(monthPillarZh[0]) || !branches.includes(monthPillarZh[1])
    || stems.indexOf(monthPillarZh[0]) % 2 !== branches.indexOf(monthPillarZh[1]) % 2) {
    throw new TypeError("qimen_seasonal_month_pillar_invalid");
  }
  const month = nineStarVigorForMonthBranch(monthPillarZh[1]);
  return Object.freeze({
    ...month,
    monthPillarZh,
    byStarCode: Object.freeze(Object.fromEntries(Object.entries(STAR_ELEMENT)
      .map(([code, element]) => [code, month.byElement[element]]))),
  });
}

// No default: policy selection must be explicit and separate from the fixed
// Yanbo star rule. Supporting a candidate does not activate/select it for users.
function separatedVigorForMonthPillar(monthPillarZh, doorMethod) {
  if (typeof doorMethod !== "string" || !Object.hasOwn(DOOR_METHODS, doorMethod)) {
    throw new TypeError("qimen_seasonal_door_method_required");
  }
  const star = nineStarVigorForMonthPillar(monthPillarZh);
  const method = DOOR_METHODS[doorMethod];
  const monthElement = star.monthElement;
  const ordinary = doorMethod === "STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1";
  const byElement = Object.freeze(Object.fromEntries(ELEMENTS.map((doorElement) => {
    let state;
    if (doorElement === monthElement) state = "旺";
    else if (ordinary) {
      if (GENERATES[monthElement] === doorElement) state = "相";
      else if (GENERATES[doorElement] === monthElement) state = "休";
      else if (CONTROLS[doorElement] === monthElement) state = "囚";
      else if (CONTROLS[monthElement] === doorElement) state = "死";
    } else {
      if (GENERATES[doorElement] === monthElement) state = "相";
      else if (CONTROLS[doorElement] === monthElement) state = "休";
      else if (CONTROLS[monthElement] === doorElement) state = "囚";
      else if (GENERATES[monthElement] === doorElement) state = "廢";
    }
    if (!state) throw new Error("qimen_seasonal_relation_unavailable");
    return [doorElement, state];
  })));
  return Object.freeze({
    star,
    door: Object.freeze({
      method: doorMethod,
      sourceSha256: method.sourceSha256,
      provenance: method.provenance,
      monthPillarZh,
      monthBranch: star.monthBranch,
      monthElement,
      byElement,
      order: Object.freeze(method.states.map((state) => ELEMENTS.find((element) => byElement[element] === state))),
      byDoorCode: Object.freeze(Object.fromEntries(Object.entries(DOOR_ELEMENT).map(([code, element]) => [code, byElement[element]]))),
    }),
  });
}

const EVIDENCE_INPUT_KEYS = Object.freeze([
  "monthPillarZh", "monthBoundaryClock", "monthValidFrom", "monthValidUntil", "doorMethod",
]);
const EVIDENCE_KEYS = Object.freeze([
  "version", "monthPillarZh", "monthBoundaryClock", "monthValidFrom", "monthValidUntil",
  "starMethod", "starSourceSha256", "doorMethod", "doorSourceSha256", "doorProvenance",
]);

function captureExactRecord(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => !keys.includes(key))) return null;
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function canonicalIso(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

// This pure method/shape contract is not an astronomical calendar oracle.
// Producers derive these bounds/pillars from the canonical global Jie clock;
// full snapshot readers additionally bind them to the month layer and enforce
// whole-hour containment. Never accept this object alone as chart evidence.
function buildSeasonalVigorEvidence(input) {
  const record = captureExactRecord(input, EVIDENCE_INPUT_KEYS);
  if (!record || record.monthBoundaryClock !== MONTH_BOUNDARY_CLOCK
    || !canonicalIso(record.monthValidFrom) || !canonicalIso(record.monthValidUntil)
    || Date.parse(record.monthValidFrom) >= Date.parse(record.monthValidUntil)) {
    throw new TypeError("qimen_seasonal_evidence_invalid");
  }
  const maps = separatedVigorForMonthPillar(record.monthPillarZh, record.doorMethod);
  return Object.freeze({
    version: SEASONAL_EVIDENCE_VERSION,
    monthPillarZh: record.monthPillarZh,
    monthBoundaryClock: record.monthBoundaryClock,
    monthValidFrom: record.monthValidFrom,
    monthValidUntil: record.monthValidUntil,
    starMethod: maps.star.method,
    starSourceSha256: maps.star.sourceSha256,
    doorMethod: maps.door.method,
    doorSourceSha256: maps.door.sourceSha256,
    doorProvenance: maps.door.provenance,
  });
}

function verifySeasonalVigorEvidence(value) {
  try {
    const record = captureExactRecord(value, EVIDENCE_KEYS);
    if (!record) return false;
    const expected = buildSeasonalVigorEvidence(Object.fromEntries(EVIDENCE_INPUT_KEYS.map((key) => [key, record[key]])));
    return EVIDENCE_KEYS.every((key) => expected[key] === record[key]);
  } catch {
    return false;
  }
}

module.exports = Object.freeze({
  NINE_STAR_METHOD,
  NINE_STAR_SOURCE_SHA256,
  SEASONAL_EVIDENCE_VERSION,
  SEASONAL_HOUR_CALCULATION_VERSION,
  MONTH_BOUNDARY_CLOCK,
  nineStarVigorForMonthBranch,
  nineStarVigorForMonthPillar,
  separatedVigorForMonthPillar,
  DOOR_METHODS,
  buildSeasonalVigorEvidence,
  verifySeasonalVigorEvidence,
});
