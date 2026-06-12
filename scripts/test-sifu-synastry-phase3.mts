/* เทส synastry เฟส 3: 暗合 (寅丑/午亥/卯申) + 拱虛 (申辰拱子 ฯลฯ) · รัน: npx tsx scripts/test-sifu-synastry-phase3.mts */
import { buildSynastry, type PersonSyn } from "../src/lib/bazi-synastry";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
}
function person(name: string, pillars: PersonSyn["pillars"]): PersonSyn {
  return { name, role: "เพื่อน", isSelf: false, text: "", mode: "4p", dmEl: "wood", yongEls: ["fire"], pillars };
}

/* 1) 暗合: วันA=寅 × วันB=丑 → ฮะลับ */
const s1 = buildSynastry([
  person("A", { year: { stem: "甲", branch: "辰" }, month: { stem: "丙", branch: "午" }, day: { stem: "甲", branch: "寅" } }),
  person("B", { year: { stem: "戊", branch: "申" }, month: { stem: "庚", branch: "戌" }, day: { stem: "己", branch: "丑" } }),
], "th");
ok("寅×丑 ต้องเจอ ฮะลับ(暗合)", s1.includes("暗合"), s1.slice(0, 200));

/* 2) 拱虛: A มี申 B มี辰 และไม่มีใครมี子 → 拱子 */
const s2 = buildSynastry([
  person("A", { year: { stem: "甲", branch: "申" }, month: { stem: "丙", branch: "午" }, day: { stem: "甲", branch: "戌" } }),
  person("B", { year: { stem: "戊", branch: "辰" }, month: { stem: "庚", branch: "未" }, day: { stem: "己", branch: "巳" } }),
], "th");
ok("申×辰 ไม่มี子ทั้งคู่ → เจอ 拱 (虛拱)", s2.includes("拱") && s2.includes("ชวด"), s2.slice(0, 300));
ok("拱 ติดป้ายตำราถกเถียง", s2.includes("ตำราถกเถียง"));

/* 3) ถ้ามีตัวกลาง子อยู่จริง → ห้ามขึ้น 拱 (ไม่ใช่虛拱) */
const s3 = buildSynastry([
  person("A", { year: { stem: "甲", branch: "申" }, month: { stem: "丙", branch: "子" }, day: { stem: "甲", branch: "戌" } }),
  person("B", { year: { stem: "戊", branch: "辰" }, month: { stem: "庚", branch: "未" }, day: { stem: "己", branch: "巳" } }),
], "th");
ok("มี子ในผัง → ไม่ขึ้น 拱 (แต่三合/半合ทำงานแทนได้)", !s3.includes("โอบกิ่งว่าง"), s3.slice(0, 300));

/* 4) หัวข้อลิสต์ปิดต้องประกาศชนิดใหม่ (กัน AI คิดว่าไม่ได้เช็ค) */
ok("หัวข้อมี 暗合/拱虛", s1.includes("暗合/拱虛"));

/* 5) น้ำหนัก: 暗合/拱 ต้องมาหลัง 六合/六沖 ในบรรทัด hit (เรียง weight) */
const s5 = buildSynastry([
  person("A", { year: { stem: "甲", branch: "子" }, month: { stem: "丙", branch: "午" }, day: { stem: "甲", branch: "寅" } }),
  person("B", { year: { stem: "戊", branch: "午" }, month: { stem: "庚", branch: "戌" }, day: { stem: "己", branch: "丑" } }),
], "th");
const hitLine = s5.split("\n").find((l) => l.startsWith("  - ")) || "";
ok("子午冲 มาก่อน 暗合 ในการเรียง", hitLine.indexOf("ปะทะ") !== -1 && hitLine.indexOf("ฮะลับ") !== -1 && hitLine.indexOf("ปะทะ") < hitLine.indexOf("ฮะลับ"), hitLine.slice(0, 250));

console.log(`\nผล: ${pass} ผ่าน · ${fail} ตก`);
process.exit(fail ? 1 : 0);
