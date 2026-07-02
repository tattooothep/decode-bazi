// ทดสอบเฟส 6: multi-year + pair timing (ทุกศาสตร์)
// run: npx tsx scripts/test-multiyear-pair.mjs
import { resolveFusionYearRange, renderMultiYearBlock, renderPairTimingBlock } from "../src/lib/fusion5/multi-year.ts";
import { buildSciencePrompt } from "../src/lib/fusion5/build-prompt.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { cond ? pass++ : (fail++, console.log(`❌ ${name} ${detail}`)); cond && console.log(`✅ ${name}`); };

const A = { name: "เอ", dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "M" };
const B = { name: "บี", dtUTC: new Date("1986-04-08T17:04:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F" };

// 1) จับช่วงปี
ok("จับ 2016-2026", JSON.stringify(resolveFusionYearRange("ดูช่วง 2016-2026 หน่อย")) .includes('"startYear":2016'));
ok("จับ 'ถึง'", resolveFusionYearRange("ตั้งแต่ 2020 ถึง 2024 เป็นไง")?.endYear === 2024);
ok("จับ พ.ศ. 2559-2569 → 2016-2026", resolveFusionYearRange("ช่วง 2559-2569")?.startYear === 2016);
ok("จับ 5 ปีข้างหน้า", (() => { const r = resolveFusionYearRange("อีก 5 ปีข้างหน้าเป็นไง", new Date("2026-07-01T00:00:00Z")); return r?.startYear === 2026 && r?.endYear === 2031; })());
ok("ปีเดี่ยวไม่จับ", resolveFusionYearRange("ปี 2026 เป็นไง") === null);
ok("ช่วงกว้างเกิน 12 ปีไม่จับ", resolveFusionYearRange("1990-2026") === null);

// 2) multi-year ทุกศาสตร์: มีครบทุกปี + deterministic
for (const sci of ["western", "vedic", "ziwei", "qizheng"]) {
  const t0 = Date.now();
  const blk = renderMultiYearBlock(sci, A, 2022, 2026);
  const years = ["2022", "2023", "2024", "2025", "2026"].filter((y) => blk.includes(`  ${y}`));
  ok(`${sci}: multi-year ครบ 5 ปี (${Date.now() - t0}ms)`, years.length === 5, `got ${years.length} · ${blk.slice(0, 200)}`);
  ok(`${sci}: deterministic`, renderMultiYearBlock(sci, A, 2022, 2026) === blk);
}

// 3) pair timing ทุกศาสตร์: มี block + มีชื่อทั้งคู่หรือข้อความ fallback ชัดเจน
for (const sci of ["western", "vedic", "ziwei", "qizheng"]) {
  const blk = renderPairTimingBlock(sci, [A, B], 2026);
  ok(`${sci}: pair block มีหัว + เนื้อหา`, blk.includes("PAIR_TIMING_PACKET ปี 2026") && blk.split("\n").length >= 3, blk.slice(0, 150));
}
ok("ดวงเดียวไม่มี pair block", renderPairTimingBlock("western", [A], 2026) === "");

// 4) เต็มสาย: คำถามช่วงปี → prompt มี MULTI_YEAR · คู่ → มี PAIR_TIMING · ไม่เกิน cap
const pRange = buildSciencePrompt("western", [A], "การเงินช่วง 2016-2026 ปีไหนดีสุด", "th");
ok("prompt เดี่ยว+ช่วงปี มี MULTI_YEAR", pRange.includes("MULTI_YEAR_TIMELINE 2016-2026"));
ok("prompt เดี่ยวไม่เกิน 78K", pRange.length <= 78000, `${pRange.length}`);
const pPair = buildSciencePrompt("vedic", [A, B], "ปี 2026 คู่นี้ควรแต่งงานเดือนไหน", "th");
ok("prompt คู่ มี PAIR_TIMING", pPair.includes("PAIR_TIMING_PACKET ปี 2026"));
ok("prompt คู่ไม่เกิน 78K", pPair.length <= 78000, `${pPair.length}`);
const pBoth = buildSciencePrompt("qizheng", [A, B], "2022-2026 คู่นี้เป็นไง", "th");
ok("prompt คู่+ช่วงปี มีทั้งสอง block", pBoth.includes("MULTI_YEAR_TIMELINE") && pBoth.includes("PAIR_TIMING_PACKET"));
ok("prompt คู่+ช่วงปีไม่เกิน 78K", pBoth.length <= 78000, `${pBoth.length}`);

// 5) no-time ไม่พัง
const NT = { ...A, hasTime: false };
ok("no-time multi-year ไม่ throw", typeof renderMultiYearBlock("qizheng", NT, 2024, 2026) === "string");

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
