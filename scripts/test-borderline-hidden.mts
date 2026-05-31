/**
 * Test · render 藏干เสาเดือน 2 ฝั่ง เมื่อ月柱ก้ำกึ่ง (AI sifu ภายนอกชี้ · กัน "金=0" ฟันธงข้างเดียว)
 * รัน: node --experimental-strip-types scripts/test-borderline-hidden.mts
 * อ่าน source ตรงๆ (ไม่ import chart-packet ที่ลาก wrapper/db) · พิสูจน์ logic block + ตาราง藏干ถูก
 */
import { readFileSync } from "node:fs";
const SRC = readFileSync(new URL("../src/lib/chart-packet.ts", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ck = (l: string, c: boolean, g?: string) => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (g ? " · " + g : ""))); };

console.log("[#borderline · 藏干 2 ฝั่ง render block]");
ck("มี render block 藏干เสาเดือน 2 ฝั่ง", /藏干เสาเดือน 2 ฝั่ง/.test(SRC));
ck("block ผูกเงื่อนไข _ma.before && _ma.after", /if \(_ma && _ma\.before && _ma\.after\)/.test(SRC));
ck("ใช้ HIDDEN_STEMS_MAP (ไม่ recompute tally engine)", /HIDDEN_STEMS_MAP\[br\]/.test(SRC));
ck("คำนวณธาตุที่เพิ่ม/หาย (added/lost)", /added\b/.test(SRC) && /lost\b/.test(SRC));
ck("บอกว่าทุก field ขึ้นกับฝั่งนี้ (ห้ามฟันธงข้างเดียว)", /ห้ามฟันธงจำนวนธาตุ\/ราก\/用神 ข้างเดียว/.test(SRC));
ck("ประเมิน 2 ทางจนยืนยันเวลาเกิด", /ประเมิน 2 ทาง จนกว่าจะยืนยันเวลาเกิด/.test(SRC));

console.log("[#borderline · ตาราง藏干 ถูกตำรา (เคส na 辰 vs 巳)]");
// ยืนยัน HIDDEN_STEMS_MAP: 辰=戊乙癸 · 巳=丙戊庚 (巳 มี庚金 → 金 ไม่เป็น 0 ภายใต้癸巳)
ck("辰 藏 戊乙癸 (ดิน/ไม้/น้ำ · ไม่มีทอง)", /辰: \["戊", "乙", "癸"\]/.test(SRC));
ck("巳 藏 丙戊庚 (มี庚ทอง → กันเคส金=0)", /巳: \["丙", "戊", "庚"\]/.test(SRC));

console.log("[#borderline · MONTH_DERIVED_FIELDS ขยายครอบ tally/ราก/透干/用神/病藥]");
const md = SRC.split("\n").find((l) => l.includes("const MONTH_DERIVED_FIELDS")) || "";
for (const f of ["ธาตุรวม(tally)", "ราก5ธาตุ", "透干", "用神/喜忌+ธาตุช่วย", "病藥(BY)"]) {
  ck(`MONTH_DERIVED มี "${f}"`, md.includes(f));
}

console.log(`\n[borderline-hidden] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
