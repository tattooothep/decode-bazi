/* mukuState v1 tests — deterministic 辰戌丑未 storage/tomb guard.
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-muku-state.mjs */
import { buildMukuStates, explainMukuState } from "../src/lib/bazi-muku-state.ts";
import { BAZI_INTERACTION_RULES } from "../src/lib/bazi-interaction-rule-registry.ts";

const STEM_PARITY = { 甲:0, 丙:0, 戊:0, 庚:0, 壬:0, 乙:1, 丁:1, 己:1, 辛:1, 癸:1 };
const BRANCH_PARITY = { 子:0, 寅:0, 辰:0, 午:0, 申:0, 戌:0, 丑:1, 卯:1, 巳:1, 未:1, 酉:1, 亥:1 };

function assertPillar(x, label) {
  if (!x) return null;
  const stem = x[0], branch = x[1];
  if (!(stem in STEM_PARITY)) throw new Error(`${label}: unknown stem ${stem}`);
  if (!(branch in BRANCH_PARITY)) throw new Error(`${label}: unknown branch ${branch}`);
  if (STEM_PARITY[stem] !== BRANCH_PARITY[branch]) throw new Error(`${label}: invalid 干支 ${x}`);
  return { stem, branch };
}

const P = (y, m, d, h) => ({
  year: assertPillar(y, "year"),
  month: assertPillar(m, "month"),
  day: assertPillar(d, "day"),
  hour: assertPillar(h, "hour"),
});

const cases = [
  {
    name: "辰 no 戌 clash → closed storage",
    pillars: P("甲子", "戊辰", "己卯", "丁卯"),
    branch: "辰",
    opts: { usefulElements: ["water"], avoidElements: [] },
    expectFinal: "closed",
    expectCodes: ["storage_not_clashed"],
  },
  {
    name: "辰戌 clash + 辰 water useful → opened_favorable",
    pillars: P("甲子", "戊辰", "己卯", "庚戌"),
    branch: "辰",
    opts: { usefulElements: ["water"], avoidElements: [] },
    expectFinal: "opened_favorable",
    expectCodes: ["storage_pair_clash_present", "stores_useful_element"],
  },
  {
    name: "辰戌 clash + 辰 water avoid → opened_unfavorable",
    pillars: P("甲子", "戊辰", "己卯", "庚戌"),
    branch: "辰",
    opts: { usefulElements: [], avoidElements: ["water"] },
    expectFinal: "opened_unfavorable",
    expectCodes: ["storage_pair_clash_present", "stores_avoid_element"],
  },
  {
    name: "辰戌 clash + useful water + avoid earth → opened_mixed",
    pillars: P("甲子", "戊辰", "己卯", "庚戌"),
    branch: "辰",
    opts: { usefulElements: ["water"], avoidElements: ["earth"] },
    expectFinal: "opened_mixed",
    expectCodes: ["stores_useful_element", "stores_avoid_element"],
  },
  {
    name: "丑未 clash with no useful/avoid hit → opened_neutral",
    pillars: P("癸丑", "丁未", "乙卯", "辛巳"),
    branch: "丑",
    opts: { usefulElements: [], avoidElements: [] },
    expectFinal: "opened_neutral",
    expectCodes: ["storage_pair_clash_present"],
  },
  {
    name: "remote 辰戌 clash is still resolved with remote reason",
    pillars: P("戊辰", "丙寅", "己卯", "庚戌"),
    branch: "辰",
    opts: { usefulElements: ["water"], avoidElements: [] },
    expectFinal: "opened_favorable",
    expectCodes: ["remote_storage_clash"],
    expectConfidence: "medium",
  },
  {
    name: "visible stored stems are tagged",
    pillars: P("癸丑", "戊辰", "己卯", "庚戌"),
    branch: "辰",
    opts: { usefulElements: ["water"], avoidElements: [] },
    expectFinal: "opened_favorable",
    expectCodes: ["stored_stem_visible"],
    expectVisible: ["癸", "戊"],
  },
];

const noStorage = {
  name: "no 辰戌丑未 in branches → no muku state",
  pillars: P("甲子", "丙寅", "戊申", "庚申"),
};

let pass = 0, fail = 0;
function mark(ok, label, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `\n  ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

console.log("=== mukuState v1 ===");
for (const c of cases) {
  const states = buildMukuStates(c.pillars, c.opts);
  const got = states.find((x) => x.branch === c.branch);
  const okFinal = got?.finalVerdict === c.expectFinal && got?.status === c.expectFinal;
  const okCodes = c.expectCodes.every((code) => got?.reasonCodes.includes(code));
  const okSource = got?.sourceRuleIds.includes("ZPZQ-MK-001");
  const okMeta = Boolean(got?.verdictZh && got?.thaiSummary && got?.canonicalChinese && got?.hiddenStems.length);
  const okConfidence = !c.expectConfidence || got?.confidence === c.expectConfidence;
  const visible = got?.visibleStoredStems.map((x) => x.stem) || [];
  const okVisible = !c.expectVisible || c.expectVisible.every((s) => visible.includes(s));
  const ok = okFinal && okCodes && okSource && okMeta && okConfidence && okVisible;
  mark(ok, c.name, `${got ? explainMukuState(got) : "ไม่มี state"}\n  expect final=${c.expectFinal} codes=${c.expectCodes.join("/")}`);
}

const empty = buildMukuStates(noStorage.pillars);
mark(empty.length === 0, noStorage.name, `got ${empty.length} state(s)`);

const ruleMap = new Map(BAZI_INTERACTION_RULES.map((r) => [r.ruleId, r]));
const mk = ruleMap.get("ZPZQ-MK-001");
mark(Boolean(mk?.ruleLevel && mk?.sourceAnchor && mk?.canonicalChinese), "registry metadata ZPZQ-MK-001", mk ? `${mk.engineStatus} · ${mk.ruleLevel} · ${mk.canonicalChinese}` : "missing");
mark(mk?.engineStatus === "partial" || mk?.engineStatus === "supported", "ZPZQ-MK-001 engineStatus partial/supported", `${mk?.engineStatus}`);

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"} ===`);
process.exit(fail ? 1 : 0);
