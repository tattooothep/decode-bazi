import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  FREE_SIGNUP_YAM,
  PRODUCT_PAGE_ENTITLEMENTS,
  TRIAL_DAYS,
} from "../src/lib/product-page-entitlements.ts";

const pricing = readFileSync(new URL("../public/pricing.html", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../public/js/pricing-i18n9.js", import.meta.url), "utf8");
const start = pricing.indexOf("const CMP = [");
const end = pricing.indexOf("\n];\n\n/* ── i18n helpers", start);
assert.ok(start >= 0 && end > start, "comparison data block is readable");

const context = {};
const source = pricing.slice(start, end + 3).replace("const CMP =", "globalThis.CMP =");
vm.runInNewContext(source, context);
const rows = context.CMP;
const row = (thaiName) => rows.find((item) => item.name?.th === thaiName);
const plans = PRODUCT_PAGE_ENTITLEMENTS;

assert.equal(rows.length, 22, "comparison remains concise");
assert.doesNotMatch(pricing, /class=["']chip["']/, "comparison has no pill chips");
assert.doesNotMatch(pricing, /table\.cmp \.chip/, "comparison has no pill-chip CSS");
assert.match(pricing, /pricing-i18n9\.js\?v=3/, "locale cache version matches table schema");

assert.match(row("ทดลอง 14 วัน").free.th, new RegExp(String(TRIAL_DAYS)));
assert.match(row("1,000 ยามแรกเข้า (ใช้ AI ได้จนกว่าจะหมด)").name.th, new RegExp(FREE_SIGNUP_YAM.toLocaleString("en-US")));
assert.match(row("Fusion หลายศาสตร์").free.th, new RegExp(String(plans.free.fusion.max_sciences)));
assert.match(row("Fusion หลายศาสตร์").premium.th, new RegExp(String(plans.premium.fusion.max_sciences)));
assert.match(row("Fusion หลายศาสตร์").master.th, new RegExp(String(plans.master.fusion.max_sciences)));
assert.equal(plans.free.today.detailed_hours, 12);
assert.equal(plans.free.today.directions, 8);
assert.match(row("ปฏิทิน / วันนี้").premium.th, new RegExp(`${plans.premium.today.day_window} วัน`));
assert.match(row("ปฏิทิน / วันนี้").master.th, new RegExp(`${plans.master.today.day_window} วัน`));
assert.equal(row("พยากรณ์ / ลายมือ").free, true);
assert.equal(row("พยากรณ์ / ลายมือ").premium, true);
assert.equal(row("พยากรณ์ / ลายมือ").master, true);
assert.match(row("วางฤกษ์ 董公").free.th, new RegExp(String(plans.free.datepick.modules)));
assert.match(row("วางฤกษ์ 董公").premium.th, new RegExp(String(plans.premium.datepick.people)));
assert.match(row("วางฤกษ์ 董公").master.th, new RegExp(String(plans.master.datepick.people)));
assert.match(row("ฮวงจุ้ย + หล่อแก").premium.th, new RegExp(String(plans.premium.fengshui.houses)));
assert.match(row("อ่านแปลนบ้าน").premium.th, new RegExp(String(plans.premium.luopan.vision_limit)));
assert.match(row("อ่านแปลนบ้าน").master.th, new RegExp(String(plans.master.luopan.vision_limit)));
assert.match(row("ฉีเหมิน 奇門").premium.th, new RegExp(String(plans.premium.qimen.search_days)));
assert.match(row("ฉีเหมิน 奇門").master.th, new RegExp(String(plans.master.qimen.search_days)));
assert.match(row("命書 · รายงานเชิงลึก").premium.th, new RegExp(String(plans.premium.book.max_sciences)));
assert.match(row("命書 · รายงานเชิงลึก").master.th, new RegExp(String(plans.master.book.max_sciences)));
assert.match(row("เครือข่าย / ความสัมพันธ์").premium.th, new RegExp(String(plans.premium.network.saved_profiles)));
assert.match(row("เครือข่าย / ความสัมพันธ์").master.th, new RegExp(String(plans.master.network.saved_profiles)));

for (const locale of ["cn", "vi", "ja", "ko", "ru", "es"]) {
  assert.match(i18n, new RegExp(`\\b${locale}:`), `pricing locale ${locale} exists`);
}

console.log("pricing contract PASS · 22 concise rows · 0 chips · contract values aligned");
