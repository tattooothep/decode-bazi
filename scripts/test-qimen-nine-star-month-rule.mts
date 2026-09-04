import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const seasonal = require("../src/lib/qimen-seasonal-vigor.cjs");
const states = ["旺", "相", "休", "囚", "廢"];
// Explicitly worked from Yanbo relations, not generated with the production
// relations. Each row lists the star elements in 旺/相/休/囚/廢 order.
const truth = [
  ["寅", "水木金土火"], ["卯", "水木金土火"],
  ["辰", "火土木水金"], ["巳", "木火水金土"],
  ["午", "木火水金土"], ["未", "火土木水金"],
  ["申", "土金火木水"], ["酉", "土金火木水"],
  ["戌", "火土木水金"], ["亥", "金水土火木"],
  ["子", "金水土火木"], ["丑", "火土木水金"],
];
let checked = 0;
for (const [branch, expectedOrder] of truth) {
  const actual = seasonal.nineStarVigorForMonthBranch(branch);
  assert.equal(actual.method, "YANBO_NINE_STAR_MONTH_V1");
  assert.equal(actual.order.join(""), expectedOrder, `${branch} nine-star order`);
  assert.equal(actual.monthBranch, branch);
  assert.ok(Object.isFrozen(actual) && Object.isFrozen(actual.byElement) && Object.isFrozen(actual.order));
  for (const [index, element] of [...expectedOrder].entries()) {
    assert.equal(actual.byElement[element], states[index], `${branch}/${element}`);
    checked += 1;
  }
}
// Source's worked 天蓬(水) example distinguishes star seasonality from ordinary
// five-element seasonality and makes the direction of generation explicit.
assert.equal(seasonal.nineStarVigorForMonthBranch("寅").byElement.水, "旺");
assert.equal(seasonal.nineStarVigorForMonthBranch("亥").byElement.水, "相");
assert.equal(seasonal.nineStarVigorForMonthBranch("午").byElement.水, "休");
assert.equal(seasonal.nineStarVigorForMonthBranch("午").byElement.土, "廢");
assert.equal(seasonal.nineStarVigorForMonthBranch("午").byElement.木, "旺");
for (const invalid of [undefined, null, "", "甲午", "June", " 午", "午 ", "toString", "__proto__", {}, 6]) {
  assert.throws(() => seasonal.nineStarVigorForMonthBranch(invalid), /qimen_seasonal_month_branch_invalid/u);
}
const source = readFileSync("data/library/qmdj/yanbo-diaosou-ge.md");
assert.equal(createHash("sha256").update(source).digest("hex"), seasonal.NINE_STAR_SOURCE_SHA256);
assert.match(source.toString("utf8"), /与我同行即为相，我生之月诚为旺/u);
assert.match(source.toString("utf8"), /废于父母休于财，囚于鬼兮真不妄/u);
console.log(`QIMEN_NINE_STAR_MONTH_RULE_OK ${checked} explicit element/month cells; source hash matched`);
