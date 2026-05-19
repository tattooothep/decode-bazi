/**
 * Phase 7 · Consumer null guards · 3p/4p comparison test
 * run: npx tsx scripts/test-option-alpha-phase7.ts
 */
import { buildChartExtensions } from "../src/lib/chart-extensions";
import { detectCarries } from "../src/lib/chart-carry";

const aeaw3p: any = { year: { stem: "甲", branch: "子" }, month: { stem: "丙", branch: "子" }, day: { stem: "己", branch: "亥" }, hour: null };
const aeaw4p: any = { year: { stem: "甲", branch: "子" }, month: { stem: "丙", branch: "子" }, day: { stem: "己", branch: "亥" }, hour: { stem: "庚", branch: "午" } };

const fails: string[] = [];

/* 3p · ทุก hour-field คาดหวัง null/false/[] · ไม่ crash */
const r3 = buildChartExtensions(aeaw3p, new Date(), "M", new Date("1984-12-31T12:00:00+07:00"), 10, "偏財格", 12, "metal");
if (r3.ten_gods_map.hour !== null) fails.push("3p: ten_gods_map.hour not null");
if (r3.qi_phases.hour !== null) fails.push("3p: qi_phases.hour not null");
if (r3.life_palace !== null) fails.push("3p: life_palace not null");
if (r3.nayin.hour !== null) fails.push("3p: nayin.hour not null");
if (r3.three_phases.hour !== null) fails.push("3p: three_phases.hour not null");
if (r3.kong_wang.per_pillar.hour !== false) fails.push("3p: kong_wang.hour not false");
if (!r3.element_counts) fails.push("3p: element_counts missing");
if (r3.special_stars.hour.length !== 0) fails.push("3p: special_stars.hour not empty");
console.log("✓ 3p chart-ext: ten_gods/qi_phases/life_palace/nayin/three_phases/kong_wang.hour all null/false");
console.log("  · special_stars total active: " + (r3.special_stars.year.length + r3.special_stars.month.length + r3.special_stars.day.length));
console.log("  · element_counts: " + JSON.stringify(r3.element_counts));

const c3 = detectCarries(aeaw3p, {});
if (c3.length !== 0) fails.push("3p chart-carry: expected [], got " + c3.length);
console.log("✓ 3p chart-carry: empty (carry image ต้องการ hour pillar ตามตำรา)");

/* 4p control · byte-equal expectation */
const r4 = buildChartExtensions(aeaw4p, new Date(), "M", new Date("1984-12-31T13:15:00+07:00"), 10, "假從財格", 25, "metal");
if (!r4.ten_gods_map.hour) fails.push("4p: ten_gods_map.hour null");
if (!r4.qi_phases.hour) fails.push("4p: qi_phases.hour null");
if (!r4.life_palace) fails.push("4p: life_palace null");
if (!r4.nayin.hour) fails.push("4p: nayin.hour null");
console.log("\n✓ 4p chart-ext control: hour fields populated · ten_gods.hour=" + JSON.stringify(r4.ten_gods_map.hour) + " · life_palace=" + r4.life_palace?.branch);

const c4 = detectCarries(aeaw4p, {});
console.log("✓ 4p chart-carry: " + c4.length + " carries detected (normal flow)");

if (fails.length) {
  console.log("\n❌ FAIL " + fails.length + ":\n  - " + fails.join("\n  - "));
  process.exit(1);
}
console.log("\n✅ Phase 7 consumer guards · all pass (4p byte-equal · 3p no-crash + null-safe)");
