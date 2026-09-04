"use strict";

// 煙波釣叟歌, 九星旺衰 / 旺相休囚: star and month are the operands.
// This is NOT the ordinary seasonal five-element table and is NOT a door rule.
const NINE_STAR_METHOD = "YANBO_NINE_STAR_MONTH_V1";
const NINE_STAR_SOURCE_SHA256 = "cc3a5a5dbc4742467551456b3f296efd7e7c4b36336cbb4b9133162093b5c16e";
const ELEMENTS = Object.freeze(["木", "火", "土", "金", "水"]);
const MONTH_ELEMENT = Object.freeze({
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火",
  午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水",
});
const GENERATES = Object.freeze({ 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" });
const CONTROLS = Object.freeze({ 木: "土", 火: "金", 土: "水", 金: "木", 水: "火" });
const STAR_STATES = Object.freeze(["旺", "相", "休", "囚", "廢"]);

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

module.exports = Object.freeze({
  NINE_STAR_METHOD,
  NINE_STAR_SOURCE_SHA256,
  nineStarVigorForMonthBranch,
});
