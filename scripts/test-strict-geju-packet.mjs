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

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "❌ FAIL" : "✅ PASS"} ===`);
process.exit(fail ? 1 : 0);
