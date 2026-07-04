/**
 * test-chart-svg-grid.mjs · ทดสอบ template "ภาพพื้นดวงสะอาด" 3 ศาสตร์
 * รัน: npx tsx scripts/test-chart-svg-grid.mjs
 *
 * ตรวจ: SVG valid (<svg ... </svg>) · มี 4 เสา / 12 宮 / 12 เรือน ·
 *       deterministic (เรียกซ้ำได้ SVG เดิม) · golden ปาจื้อ Aeaw
 */
import { baziChartSvg, ziweiChartSvg, vedicChartSvg } from "../src/lib/book/chart-svg-grid.ts";

/* dtUTC = เวลาเกิดท้องถิ่น - offset (ไทย +7) */
function localToUTC(y, mo, d, h, mi, offset = 7) {
  return new Date(Date.UTC(y, mo - 1, d, h - offset, mi, 0));
}

// ดวงเอี๊ยว (Aeaw) 1984-12-31 13:15 กทม. · ชาย
const aeaw = {
  dtUTC: localToUTC(1984, 12, 31, 13, 15),
  lat: 13.75, lng: 100.5018, hasTime: true, gender: "M",
};
// เคสไม่มีเวลา (3 เสา / degrade)
const noTime = { ...aeaw, hasTime: false };

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
};

const isValidSvg = (s) =>
  typeof s === "string" && /^<svg[\s\S]*<\/svg>\s*$/.test(s.trim()) && !/<script/i.test(s);

console.log("\n=== 1) ปาจื้อ 八字 (Aeaw) ===");
const bazi = baziChartSvg(aeaw);
check("SVG valid + ไม่มี <script>", isValidSvg(bazi));
// golden: Year 甲子 · Month 丙子 · Day 己亥 · Hour 庚午
const goldStems = ["甲", "丙", "己", "庚"];
const goldBranches = ["子", "子", "亥", "午"];
check("มีก้านครบ 4 เสา (甲丙己庚)", goldStems.every((c) => bazi.includes(c)));
check("มีกิ่งครบ (子亥午)", ["子", "亥", "午"].every((c) => bazi.includes(c)));
check("ป้ายคอลัมน์ไทย ปี/เดือน/วัน/ยาม", ["ปี", "เดือน", "วัน", "ยาม"].every((c) => bazi.includes(c)));
check("แถว 天干/地支/藏干", ["天干", "地支", "藏干"].every((c) => bazi.includes(c)));
check("มีสีธาตุ (ก้านฟ้า己 ดิน earth #d4a85a/#8a6d2a)", bazi.includes("#8a6d2a"));
check("deterministic (เรียกซ้ำ = เดิม)", baziChartSvg(aeaw) === bazi);
console.log(`  [golden] 日主=己 · ตรวจก้าน/กิ่งจาก render`);

console.log("\n=== 1b) ปาจื้อ ไม่มีเวลา (3 เสา · ยาม=?) ===");
const bazi3 = baziChartSvg(noTime);
check("SVG valid", isValidSvg(bazi3));
check("ยามเป็น ?", bazi3.includes(">?<"));

console.log("\n=== 2) จื่อเวย 紫微 (Aeaw) ===");
const ziwei = ziweiChartSvg(aeaw);
check("SVG valid + ไม่มี <script>", isValidSvg(ziwei));
const palaces = ["命宮", "兄弟", "夫妻", "子女", "財帛", "疾厄", "遷移", "僕役", "官祿", "田宅", "福德", "父母"];
const palaceCount = palaces.filter((p) => ziwei.includes(p)).length;
check(`มีครบ 12 宮 (พบ ${palaceCount}/12)`, palaceCount === 12);
check("ไฮไลต์ 命宮 (สีทอง #d4a85a)", ziwei.includes("#d4a85a"));
check("มี 五行局", ziwei.includes("五行局"));
check("deterministic", ziweiChartSvg(aeaw) === ziwei);

console.log("\n=== 3) แขก Vedic South Indian (Aeaw) ===");
const vedic = vedicChartSvg(aeaw);
check("SVG valid + ไม่มี <script>", isValidSvg(vedic));
const rashis = ["เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์", "ตุล", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน"];
const rashiCount = rashis.filter((r) => vedic.includes(r)).length;
check(`มีครบ 12 เรือน/ราศี (พบ ${rashiCount}/12)`, rashiCount === 12);
check("มีลัคน์ (ป้าย 'ลัคน์')", vedic.includes("ลัคน์"));
check("มีกราหะ (อา/จ/ศ ฯลฯ)", ["อา", "จ", "ศ"].every((g) => vedic.includes(g)));
check("deterministic", vedicChartSvg(aeaw) === vedic);

console.log("\n=== 3b) Vedic ไม่มีเวลา (degrade · ยังวางกราหะตามราศี) ===");
const vedic3 = vedicChartSvg(noTime);
check("SVG valid", isValidSvg(vedic3));
check("แจ้งไม่ทราบเวลา", vedic3.includes("ไม่ทราบเวลาเกิด"));

// เขียนไฟล์ตัวอย่างไว้ดู (scratchpad)
import { writeFileSync, mkdirSync } from "node:fs";
try {
  const dir = "/tmp/claude-0/-root/14fcd76f-de20-4971-b9e7-a973b82e973e/scratchpad";
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/bazi.svg`, bazi);
  writeFileSync(`${dir}/ziwei.svg`, ziwei);
  writeFileSync(`${dir}/vedic.svg`, vedic);
  console.log(`\n[svg samples เขียนไว้ที่ ${dir}/{bazi,ziwei,vedic}.svg]`);
} catch (e) { /* ไม่จำเป็น */ }

console.log(`\n===== ผล: ${pass} ผ่าน · ${fail} ตก =====`);
console.log(`ตัวอย่าง output ย่อ (ปาจื้อ 200 ตัวแรก):\n${bazi.slice(0, 200)}...`);
process.exit(fail === 0 ? 0 : 1);
