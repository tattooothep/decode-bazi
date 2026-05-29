/* hehuaVerdict v1 tests — deterministic 五合 guard.
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-hehua-verdict.mjs */
import { buildHehuaVerdicts, explainHehuaVerdict } from "../src/lib/bazi-hehua-resolver.ts";
import { BAZI_INTERACTION_RULES } from "../src/lib/bazi-interaction-rule-registry.ts";

const STEM_PARITY = { 甲:0, 丙:0, 戊:0, 庚:0, 壬:0, 乙:1, 丁:1, 己:1, 辛:1, 癸:1 };
const BRANCH_PARITY = { 子:0, 寅:0, 辰:0, 午:0, 申:0, 戌:0, 丑:1, 卯:1, 巳:1, 未:1, 酉:1, 亥:1 };
const ALL_PAIRS = ["甲己", "乙庚", "丙辛", "丁壬", "戊癸"];

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
    name: "甲己 adjacent + season/root support + 日主合 → transform_supported",
    pillars: P("庚子", "甲辰", "己丑", "丙午"),
    pair: "甲己",
    expectFinal: "transform_supported",
    expectBinding: "active",
    expectTransform: "supported_candidate",
    expectCodes: ["adjacent_pillars", "season_supports_transform_element", "branch_root_supports_transform_element", "involves_day_master"],
    expectSource: ["ZPZQ-HE-000", "ZPZQ-HE-003"],
    expectDayMaster: true,
  },
  {
    name: "甲己 adjacent but wrong season → 合而不化",
    pillars: P("庚子", "甲子", "己丑", "丙午"),
    pair: "甲己",
    expectFinal: "bound_no_transform",
    expectBinding: "active",
    expectTransform: "not_transformed",
    expectCodes: ["adjacent_pillars", "season_does_not_support_transform_element"],
  },
  {
    name: "甲己 remote year-hour → 遙合力弱",
    pillars: P("甲子", "丙寅", "丁卯", "己未"),
    pair: "甲己",
    expectFinal: "remote_weak",
    expectBinding: "weak",
    expectTransform: "not_evaluated",
    expectCodes: ["remote_pillars"],
    expectSource: ["ZPZQ-HE-000", "ZPZQ-HE-002"],
  },
  {
    name: "甲庚己 separated with 庚 blocker → 隔合不成",
    pillars: P("甲子", "庚寅", "己丑", "丙午"),
    pair: "甲己",
    expectFinal: "blocked_by_intervening_stem",
    expectBinding: "blocked",
    expectTransform: "not_evaluated",
    expectCodes: ["intervening_stem_blocks_combination"],
    expectSource: ["ZPZQ-HE-000", "ZPZQ-HE-001"],
  },
  {
    name: "two 甲 compete for one 己 → 爭合妒合",
    pillars: P("甲子", "甲辰", "己丑", "丙午"),
    pair: "甲己",
    expectFinal: "contested",
    expectBinding: "contested",
    expectTransform: "not_evaluated",
    expectCodes: ["competing_stem_combination"],
    expectSource: ["ZPZQ-HE-000", "ZPZQ-HE-004"],
    expectContested: true,
  },
  {
    name: "乙庚 metal supported by 酉 month → transform_supported",
    pillars: P("壬子", "乙酉", "庚申", "癸未"),
    pair: "乙庚",
    expectFinal: "transform_supported",
    expectBinding: "active",
    expectTransform: "supported_candidate",
    expectCodes: ["season_supports_transform_element"],
  },
  {
    name: "丙辛 water season but rooted-adjacent 戊 controls water → 合而不化",
    pillars: P("丙子", "辛亥", "戊申", "甲辰"),
    pair: "丙辛",
    expectFinal: "bound_no_transform",
    expectBinding: "active",
    expectTransform: "not_transformed",
    expectCodes: ["visible_stem_controls_transform_element"],
    expectSource: ["HK-HE-CTRL-001"],
  },
  {
    name: "丙辛 weak/far 戊 cannot stop water transform support",
    pillars: P("丙子", "辛亥", "甲寅", "戊午"),
    pair: "丙辛",
    expectFinal: "transform_supported",
    expectBinding: "active",
    expectTransform: "supported_candidate",
    expectCodes: ["visible_stem_control_too_weak", "season_supports_transform_element"],
    expectSource: ["HK-HE-CTRL-001"],
  },
  {
    name: "丁壬 wood supported by 寅 month → transform_supported",
    pillars: P("丁卯", "壬寅", "己丑", "辛酉"),
    pair: "丁壬",
    expectFinal: "transform_supported",
    expectBinding: "active",
    expectTransform: "supported_candidate",
    expectCodes: ["season_supports_transform_element"],
  },
  {
    name: "戊癸 fire supported by 巳 month → transform_supported",
    pillars: P("戊午", "癸巳", "乙卯", "辛亥"),
    pair: "戊癸",
    expectFinal: "transform_supported",
    expectBinding: "active",
    expectTransform: "supported_candidate",
    expectCodes: ["season_supports_transform_element"],
  },
  {
    name: "日主 combination rule tag exists and is supported",
    pillars: P("庚子", "甲辰", "己丑", "丁卯"),
    pair: "甲己",
    expectFinal: "transform_supported",
    expectBinding: "active",
    expectTransform: "supported_candidate",
    expectCodes: ["involves_day_master"],
    expectSource: ["ZPZQ-HE-000", "ZPZQ-HE-003"],
    expectDayMaster: true,
    expectCanonical: "本身之合",
  },
];

const noComboCase = {
  name: "no 五合 in visible stems → no verdict",
  pillars: P("庚子", "丙寅", "戊辰", "壬申"),
};

let pass = 0, fail = 0;
function mark(ok, label, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `\n  ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

console.log("=== hehuaVerdict v1 ===");
for (const c of cases) {
  const verdicts = buildHehuaVerdicts(c.pillars);
  const got = verdicts.find((x) => x.pair === c.pair);
  const okFinal = got?.finalVerdict === c.expectFinal && got?.status === c.expectFinal;
  const okBinding = got?.bindingStatus === c.expectBinding;
  const okTransform = got?.transformStatus === c.expectTransform;
  const okCodes = c.expectCodes.every((code) => got?.reasonCodes.includes(code));
  const okSource = (c.expectSource || []).every((id) => got?.sourceRuleIds.includes(id));
  const okMeta = Boolean(got?.affectedPillars?.length && got?.transformElement && got?.canonicalChinese && got?.thaiSummary);
  const okDayMaster = c.expectDayMaster === undefined || got?.involvesDayMaster === c.expectDayMaster;
  const okContested = !c.expectContested || Boolean(got?.contenders?.length && got?.target);
  const okCanonical = !c.expectCanonical || got?.canonicalChinese === c.expectCanonical;
  const ok = okFinal && okBinding && okTransform && okCodes && okSource && okMeta && okDayMaster && okContested && okCanonical;
  mark(ok, c.name, `${got ? explainHehuaVerdict(got) : "ไม่มี verdict"}\n  expect final=${c.expectFinal} binding=${c.expectBinding} transform=${c.expectTransform} codes=${c.expectCodes.join("/")}`);
}

const noCombo = buildHehuaVerdicts(noComboCase.pillars);
mark(noCombo.length === 0, noComboCase.name, `got ${noCombo.length} verdict(s)`);

const coveredPairs = new Set(cases.map((c) => c.pair));
for (const pair of ALL_PAIRS) mark(coveredPairs.has(pair), `coverage has ${pair}`);

const ruleMap = new Map(BAZI_INTERACTION_RULES.map((r) => [r.ruleId, r]));
const requiredRules = ["ZPZQ-HE-000", "ZPZQ-HE-001", "ZPZQ-HE-002", "ZPZQ-HE-003", "ZPZQ-HE-004", "HK-HE-CTRL-001", "ZPZQ-XCH-001", "ZPZQ-MK-001", "HK-ORDER-001"];
for (const id of requiredRules) {
  const r = ruleMap.get(id);
  mark(Boolean(r?.ruleLevel && r?.sourceAnchor && r?.canonicalChinese), `registry metadata ${id}`, r ? `${r.engineStatus} · ${r.ruleLevel} · ${r.canonicalChinese}` : "missing");
}
mark(ruleMap.get("ZPZQ-HE-003")?.engineStatus === "supported", "ZPZQ-HE-003 engineStatus supported");
mark(ruleMap.get("HK-ORDER-001")?.engineStatus !== "not_supported", "HK-ORDER-001 is partial/supported, not not_supported", `${ruleMap.get("HK-ORDER-001")?.engineStatus}`);

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"} ===`);
process.exit(fail ? 1 : 0);
