/* strictGeJu audit tests — ctext-first guard, not wired to production.
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-strict-geju-audit.mjs */
import { auditStrictGeJuFromMonth, auditTwelvePhaseRoot } from "../src/lib/bazi-strict-geju-audit.ts";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { inferGeJu } = require("../data/library/wrappers/3-ge-ju.js");

const P = (y, m, d, h) => {
  const one = (x) => ({ stem: x[0], branch: x[1] });
  return { year: one(y), month: one(m), day: one(d), hour: h ? one(h) : null };
};

let pass = 0, fail = 0;
function mark(ok, label, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `\n  ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

console.log("=== strict 十二長生 audit ===");
{
  const r = auditTwelvePhaseRoot("丁", "酉");
  mark(
    r.phase === "長生" && r.rootClass === "light_root" && r.reasonCodes.includes("yin_changsheng_counts_as_ming_root_not_heavy"),
    "丁酉 = 陰長生 แต่เป็นรากอ่อน/明根 ไม่ใช่ heavy",
    `${r.phase}/${r.rootClass} · ${r.canonicalChinese}`,
  );
}
{
  const r = auditTwelvePhaseRoot("甲", "亥");
  mark(
    r.phase === "長生" && r.rootClass === "heavy_root",
    "甲亥 = 陽長生 เป็น heavy root",
    `${r.phase}/${r.rootClass} · ${r.canonicalChinese}`,
  );
}
{
  const r = auditTwelvePhaseRoot("丁", "丑");
  mark(
    r.phase === "墓" && r.rootClass === "no_root" && r.reasonCodes.includes("yin_storage_not_counted_as_root"),
    "丁丑 = 陰干入墓 ไม่ใช้เป็นรากหลัก",
    `${r.phase}/${r.rootClass} · ${r.canonicalChinese}`,
  );
}

console.log("\n=== strict 月令格局 audit ===");
{
  const natal = P("甲子", "丙子", "己亥", "庚午");
  const r = auditStrictGeJuFromMonth(natal);
  mark(
    r.selectedSource === "pure_main" && r.selectedStem === "癸" && r.structure === "偏財格",
    "子午卯酉 pure month ใช้本氣ตั้ง格",
    r.thaiSummary,
  );
}
{
  const natal = P("壬子", "丙申", "甲子", "丁卯"); // 申藏庚壬戊; 庚ไม่透, 壬透
  const r = auditStrictGeJuFromMonth(natal);
  mark(
    r.selectedSource === "long_life_middle_visible" && r.selectedStem === "壬" && r.structure === "偏印格",
    "寅申巳亥 month: 本氣ไม่透 + 中氣透 → 中氣ขึ้นทำ格",
    r.thaiSummary,
  );
}
{
  const natal = P("甲子", "癸辰", "甲寅", "丁卯"); // 辰藏戊乙癸; 癸透
  const r = auditStrictGeJuFromMonth(natal);
  mark(
    r.selectedSource === "storage_visible" && r.selectedStem === "癸" && r.structure === "正印格",
    "辰戌丑未 storage: มี藏干透干 → เอาตัวที่透",
    r.thaiSummary,
  );
}
{
  const mai = P("丙寅", "壬辰", "丙戌", "丙申"); // current wrapper says 雜氣正印格; strict no透/no會 fallback土→食神格
  const current = inferGeJu(mai);
  const strict = auditStrictGeJuFromMonth(mai);
  mark(
    current.structure === "雜氣正印格" && strict.selectedSource === "storage_earth_fallback" && strict.structure === "食神格",
    "audit-only catches current-wrapper vs strict difference for 雜氣 no透/no會",
    `current=${current.structure} · strict=${strict.structure} · ${strict.canonicalChinese}`,
  );
}

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"} ===`);
process.exit(fail ? 1 : 0);
