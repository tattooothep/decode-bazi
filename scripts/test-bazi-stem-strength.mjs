/* Stem strength base tests — Step 0 for interaction resolvers.
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-bazi-stem-strength.mjs */
import { assessStemStrength, hasRootForElement, seasonSupportsElement } from "../src/lib/bazi-stem-strength.ts";

const P = (y, m, d, h) => ({
  year: { stem: y[0], branch: y[1] },
  month: { stem: m[0], branch: m[1] },
  day: { stem: d[0], branch: d[1] },
  hour: { stem: h[0], branch: h[1] },
});

const cases = [
  {
    name: "戊 visible controller rooted and adjacent → strong",
    pillars: P("丙子", "辛亥", "戊辰", "甲寅"),
    input: { pillar: "day", stem: "戊", branch: "辰", comboPillars: ["year", "month"], monthBranch: "亥" },
    expectVerdict: "strong",
    expectCodes: ["visible_stem", "rooted_in_own_branch", "adjacent_to_combo"],
  },
  {
    name: "戊 visible controller remote despite root → weak",
    pillars: P("丙子", "辛亥", "甲寅", "戊辰"),
    input: { pillar: "hour", stem: "戊", branch: "辰", comboPillars: ["year", "month"], monthBranch: "亥" },
    expectVerdict: "weak",
    expectCodes: ["visible_stem", "rooted_in_own_branch", "gap1_to_combo"],
  },
  {
    name: "戊 visible controller floating/no root near combo → weak",
    pillars: P("丙子", "辛亥", "戊子", "甲子"),
    input: { pillar: "day", stem: "戊", branch: "子", comboPillars: ["year", "month"], monthBranch: "亥" },
    expectVerdict: "weak",
    expectCodes: ["visible_stem", "adjacent_to_combo"],
  },
  {
    name: "庚 in 酉 month gets season support and root",
    pillars: P("乙卯", "庚酉", "己丑", "丁卯"),
    input: { pillar: "month", stem: "庚", branch: "酉", comboPillars: ["year", "month"], monthBranch: "酉" },
    expectVerdict: "strong",
    expectCodes: ["season_supports_stem_element", "rooted_in_own_branch"],
  },
];

let pass = 0, fail = 0;
function mark(ok, label, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `\n  ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

console.log("=== bazi stem strength Step 0 ===");
for (const c of cases) {
  const got = assessStemStrength({ ...c.input, allPillars: c.pillars });
  const okVerdict = got?.verdict === c.expectVerdict;
  const okCodes = c.expectCodes.every((code) => got?.reasonCodes.includes(code));
  mark(Boolean(got && okVerdict && okCodes), c.name, got ? `verdict=${got.verdict} score=${got.score} codes=${got.reasonCodes.join("/")}` : "no result");
}

mark(hasRootForElement(P("甲子", "丙寅", "己丑", "庚申"), "metal") === true, "hasRootForElement metal from 申");
mark(seasonSupportsElement("亥", "water") === true, "seasonSupportsElement 亥 supports water");
mark(seasonSupportsElement("午", "water") === false, "seasonSupportsElement 午 does not support water");

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"} ===`);
process.exit(fail ? 1 : 0);
