import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-seasonal-vigor.cjs");
const source = readFileSync("data/library/qmdj/qimen-tongzong-clean.md");
assert.equal(createHash("sha256").update(source).digest("hex"), "2fa78ecd8ad36c07ff372d2786a0b0c974c7e2761267afd537ab7f9031bc0a51");
const text = source.toString("utf8");
assert.match(text, /当时者为旺，我生者为相，我克者为休，克我者为囚，生我者为废/u);
assert.match(text, /系統一律以通行法為準，不採本句訛序/u, "ordinary policy is explicitly editorial, not a unanimous primary formula");
const methods = ["STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1", "TONGZONG_DARK_RESIDUAL_QI_DOOR_MONTH_V1"];
const doors = { XIU_MEN: "水", SHENG_MEN: "土", SI_MEN: "土", SHANG_MEN: "木", DU_MEN: "木", KAI_MEN: "金", JING_FEAR_MEN: "金", JING_VIEW_MEN: "火" };
// Explicit independent tables: [canonical pillar, ordinary 旺相休囚死, 暗餘氣 旺相休囚廢].
const oracle = [
  ["甲子", "水木金土火", "水金土火木"], ["乙丑", "土金火木水", "土火木水金"],
  ["甲寅", "木火水金土", "木水金土火"], ["乙卯", "木火水金土", "木水金土火"],
  ["甲辰", "土金火木水", "土火木水金"], ["乙巳", "火土木水金", "火木水金土"],
  ["甲午", "火土木水金", "火木水金土"], ["乙未", "土金火木水", "土火木水金"],
  ["甲申", "金水土火木", "金土火木水"], ["乙酉", "金水土火木", "金土火木水"],
  ["甲戌", "土金火木水", "土火木水金"], ["乙亥", "水木金土火", "水金土火木"],
];
assert.equal(typeof runtime.separatedVigorForMonthPillar, "function", "star and door classifiers require a separately named explicit method");
let cases = 0;
for (const [pillar, ...orders] of oracle) for (const [index, method] of methods.entries()) {
  const actual = runtime.separatedVigorForMonthPillar(pillar, method);
  assert.equal(actual.door.method, method);
  assert.equal(actual.door.sourceSha256, createHash("sha256").update(source).digest("hex"));
  assert.equal(actual.door.provenance, index === 0 ? "EXISTING_EDITORIAL_PRODUCT_POLICY_V1" : "TONGZONG_PRIMARY_DARK_RESIDUAL_QI_V1");
  assert.deepEqual(actual.star, runtime.nineStarVigorForMonthPillar(pillar), "door selection cannot alter the Yanbo star method");
  const states = index === 0 ? ["旺", "相", "休", "囚", "死"] : ["旺", "相", "休", "囚", "廢"];
  for (const [door, element] of Object.entries(doors)) {
    assert.equal(actual.door.byDoorCode[door], states[orders[index].indexOf(element)], `${pillar}/${method}/${door}`); cases++;
  }
  assert.ok(Object.isFrozen(actual) && Object.isFrozen(actual.door) && Object.isFrozen(actual.door.byDoorCode));
}
const ordinary = runtime.separatedVigorForMonthPillar("甲午", methods[0]);
assert.equal(ordinary.star.byStarCode.TIAN_FU, "旺");
assert.equal(ordinary.door.byDoorCode.SHANG_MEN, "休", "wood star and wood door are not the same seasonal classifier");
assert.equal(ordinary.door.byDoorCode.KAI_MEN, "死");
for (const method of [undefined, null, "", "unknown", "__proto__", {}, 1]) {
  assert.throws(() => runtime.separatedVigorForMonthPillar("甲午", method), /qimen_seasonal_door_method_required/u,
    "no implicit school choice or cached-array fallback");
}
console.log(`QIMEN_SEPARATED_DOOR_MONTH_RULES_OK cases=${cases} methods=2 explicit_only=PASS`);
