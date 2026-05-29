/* Regression: HK_STRICT_GEJU_AUDIT_V1 reaches packet/prompt without replacing engine structure.
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-strict-geju-packet.mjs */
import { buildChartExtensions } from "../src/lib/chart-extensions.ts";
import { buildStructuredChartPacket, renderChartPrompt, validateChartPacket } from "../src/lib/chart-packet.ts";

const P = (y, m, d, h) => {
  const one = (x) => ({ stem: x[0], branch: x[1] });
  return { year: one(y), month: one(m), day: one(d), hour: h ? one(h) : null };
};

let pass = 0, fail = 0;
function ok(desc, cond) {
  console.log(`${cond ? "✓" : "✗"} ${desc}`);
  cond ? pass++ : fail++;
}

const pillars = P("丙寅", "壬辰", "丙戌", "丙申");
const calc = {
  mode: "4p",
  pillars,
  pillarsZh: { year: "丙寅", month: "壬辰", day: "丙戌", hour: "丙申" },
  dayMaster: "丙",
  geJu: { structure: "雜氣正印格", basis: "mock current wrapper label", confidence: "high" },
  strength: { percent: 50, level: "กลาง" },
  yongshen: [{ stem: "甲", element: "wood" }],
  climate: "damp",
  tst: null,
};
const ext = buildChartExtensions(
  pillars,
  new Date("2026-05-29T12:00:00+07:00"),
  "M",
  new Date("1984-04-01T12:00:00+07:00"),
  10,
  calc.geJu.structure,
  calc.strength.percent,
  calc.yongshen[0].element,
  calc.yongshen.map((x) => x.element),
);
const rootedness = {
  dmElement: "fire",
  dmLabel: "rooted",
  isExtremelyWeak: false,
  isTokenOnly: false,
  all: { wood: "rooted", fire: "rooted", earth: "strong_root", metal: "partial_root", water: "partial_root" },
};
const packet = buildStructuredChartPacket(calc, ext, "丙", 42, {}, rootedness, "M", null, {
  dayBoundary: "00:00",
  dayBoundarySource: "explicit",
});
const prompt = renderChartPrompt(packet);
const a = packet.strictGeJuAudit;
const validation = validateChartPacket(packet);

ok("packet has strict geju audit tag", a?.tag === "HK_STRICT_GEJU_AUDIT_V1");
ok("strict audit does not replace structure.label", packet.structure.label === "雜氣正印格");
ok("strict audit catches strict label separately", a?.strictLabel === "食神格" && a?.matchesCurrent === false);
ok("strict audit preserves source rule", a?.sourceRuleIds.includes("ZPZQ-GE-003") && a?.canonicalChinese === "不透不會，則僅以土論");
ok("prompt renders audit-only line", prompt.includes("格局 strict audit (HK_STRICT_GEJU_AUDIT_V1") && prompt.includes("audit-only ไม่ใช่ข้อจำกัดคำตอบ"));
ok("prompt does not leak raw percent", !/[0-9.]+%/.test(prompt));
ok("validateChartPacket stays clean", validation.ok === true);

// Paa regression: raw wrapper label 假從兒格 must not close 病藥 when strict audit says 七殺格
const paaPillars = P("甲辰", "甲戌", "壬寅", "乙巳");
const paaCalc = {
  mode: "4p",
  pillars: paaPillars,
  pillarsZh: { year: "甲辰", month: "甲戌", day: "壬寅", hour: "乙巳" },
  dayMaster: "壬",
  geJu: { structure: "假從兒格", basis: "mock raw wrapper label", confidence: "moderate" },
  strength: { percent: 28, level: "very_weak" },
  yongshen: [{ stem: "庚", element: "metal" }, { stem: "壬", element: "water" }],
  climate: "dry",
  tst: null,
};
const paaExt = buildChartExtensions(
  paaPillars,
  new Date("2026-05-29T12:00:00+07:00"),
  "M",
  new Date("1970-10-20T09:00:00+07:00"),
  10,
  paaCalc.geJu.structure,
  paaCalc.strength.percent,
  paaCalc.yongshen[0].element,
  paaCalc.yongshen.map((x) => x.element),
);
const paaRootedness = {
  dmElement: "water",
  dmLabel: "token_root",
  isExtremelyWeak: true,
  isTokenOnly: true,
  all: { wood: "rooted", fire: "rooted", earth: "rooted", metal: "token_root", water: "token_root" },
};
const paaPacket = buildStructuredChartPacket(paaCalc, paaExt, "壬", 56, {}, paaRootedness, "M", null, {
  dayBoundary: "00:00",
  dayBoundarySource: "explicit",
});
const paaPrompt = renderChartPrompt(paaPacket);
ok("Paa strict audit catches 七殺格 under raw 假從兒格", paaPacket.strictGeJuAudit?.strictLabel === "七殺格" && paaPacket.strictGeJuAudit?.matchesCurrent === false);
ok("false-follow guard reaches prompt", paaPrompt.includes("HK_FALSE_FOLLOW_GUARD_V1") && paaPrompt.includes("候選/ป้ายเตือน"));
ok("false-follow prompt promotes strict label as primary", paaPrompt.includes("candidate หลัก=七殺格") && !paaPrompt.includes("โครงดวง: 假從兒格"));
ok("false-follow raw label is candidate only", paaPrompt.includes("raw engine候選=假從兒格") && paaPrompt.includes("candidate รอง"));
ok("false-follow BY-11 does not call raw label the disease", !paaPrompt.includes("病=假從"));
ok("false-follow does not close 病藥", paaPacket.bingYao?.status === "ok" && paaPacket.bingYao?.primary?.id === "BY-11");
ok("false-follow uses 扶抑 instead of 從勢 gate", paaPacket.yongShenProtocols?.fuyi.mode === "扶");
ok("Paa strict 調候 separates 壬戌月 as 甲/丙", paaPacket.yongShenProtocols?.tiaoHou.strict?.primaryStems?.[0] === "甲" && paaPacket.yongShenProtocols?.tiaoHou.strict?.secondaryStems?.[0] === "丙");
ok("prompt renders strict 調候 before climate補助", paaPrompt.includes("調候用神=strict 壬日戌月 主=甲/ไม้ 次=丙/ไฟ") && paaPrompt.includes("climate補助="));

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "❌ FAIL" : "✅ PASS"} ===`);
process.exit(fail ? 1 : 0);
