/* test-book-charts.mjs · r401 · ภาพพื้นดวงทุกบท + pricing (คัมภีร์ชะตา)
 * รัน: node --experimental-strip-types --import ./scripts/_ts-resolver-account.mjs scripts/test-book-charts.mjs
 * unit ล้วน (ไม่ยิง server · ไม่แตะ DB · ไม่เรียก AI จริง)
 * ครอบ:
 *   [1] dispatcher buildScienceChartSvg — 6 ศาสตร์ (มีเวลาเกิด) คืน inline <svg …>
 *   [2] dispatcher robustness — ศาสตร์ไม่รู้จัก → "" · ไม่มีเวลาเกิดยังไม่ throw
 *   [3] pricing computeBookYam — follows product-entitlement SoT
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

let pass = 0, fail = 0;
const ok = (c, l, d = "") => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (d ? " · " + d : ""))); };

const { buildScienceChartSvg } = await import("../src/lib/book/chart-svg.ts");
const { computeBookYam, BOOK_SCIENCE_YAM, BOOK_SYNTHESIS_YAM } = await import("../src/lib/book-pricing.ts");

/* ═══ [1] dispatcher 6 ศาสตร์ → inline <svg> ═══ */
console.log("[1] buildScienceChartSvg — 6 ศาสตร์ (Mai · มีเวลาเกิด)");
const birth = { dtUTC: new Date("1986-04-12T16:42:00+07:00"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F" };
const SCI = ["bazi", "ziwei", "qizheng", "western", "vedic", "uranian"];
let anyReal = 0;
for (const s of SCI) {
  const svg = buildScienceChartSvg(s, birth);
  const good = typeof svg === "string" && svg.indexOf("<svg") === 0 && svg.includes("</svg>");
  if (good) anyReal++;
  ok(good, `${s} → inline <svg> (len ${typeof svg === "string" ? svg.length : "?"})`, good ? "" : "head=" + String(svg).slice(0, 40));
}
ok(anyReal === 6, "ครบทั้ง 6 ศาสตร์คืนภาพพื้นดวงจริง", "got " + anyReal + "/6");

/* ═══ [2] robustness ═══ */
console.log("[2] dispatcher robustness");
ok(buildScienceChartSvg("nope", birth) === "", "ศาสตร์ที่ไม่รู้จัก → \"\"");
{
  // ไม่มีเวลาเกิด: bazi/western/vedic/uranian ยังต้องวาดได้ (needsBirthTime=false) · ทุกศาสตร์ต้องไม่ throw
  const noTime = { dtUTC: new Date("1986-04-12T12:00:00+07:00"), lat: 13.7563, lng: 100.5018, hasTime: false, gender: "M" };
  let threw = false, baziOk = false;
  try { baziOk = buildScienceChartSvg("bazi", noTime).indexOf("<svg") === 0; for (const s of SCI) buildScienceChartSvg(s, noTime); }
  catch { threw = true; }
  ok(!threw, "ไม่มีเวลาเกิด → dispatcher ไม่ throw (คืน \"\" ถ้าวาดไม่ได้)");
  ok(baziOk, "bazi (needsBirthTime=false) ยังวาดภาพได้แม้ไม่มีเวลาเกิด");
}

/* ═══ [3] pricing computeBookYam(sciences, includeSynthesis) ═══ */
console.log(`[3] pricing ${BOOK_SCIENCE_YAM}×n + synthesis ${BOOK_SYNTHESIS_YAM}`);
const ALL6 = ["bazi", "ziwei", "qizheng", "western", "vedic", "uranian"];
ok(computeBookYam(ALL6, true) === 6 * BOOK_SCIENCE_YAM + BOOK_SYNTHESIS_YAM, "6 ศาสตร์ + หลอมรวมตรง SoT", "got " + computeBookYam(ALL6, true));
ok(computeBookYam(ALL6, false) === 6 * BOOK_SCIENCE_YAM, "6 ศาสตร์ ไม่หลอมรวมตรง SoT", "got " + computeBookYam(ALL6, false));
ok(computeBookYam(["bazi", "western"], true) === 2 * BOOK_SCIENCE_YAM + BOOK_SYNTHESIS_YAM, "2 ศาสตร์ + หลอมรวมตรง SoT", "got " + computeBookYam(["bazi", "western"], true));
ok(computeBookYam(["bazi", "western"], false) === 2 * BOOK_SCIENCE_YAM, "2 ศาสตร์ ไม่หลอมรวมตรง SoT", "got " + computeBookYam(["bazi", "western"], false));
ok(computeBookYam(["bazi"], true) === BOOK_SCIENCE_YAM, "1 ศาสตร์ไม่คิด synthesis (≥2 guard)", "got " + computeBookYam(["bazi"], true));
ok(computeBookYam([], true) === 0, "ว่าง = 0", "got " + computeBookYam([], true));
ok(computeBookYam(["bazi", "notreal"], true) === BOOK_SCIENCE_YAM, "กรองศาสตร์ที่ไม่ available", "got " + computeBookYam(["bazi", "notreal"], true));

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} · ${pass} passed · ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
