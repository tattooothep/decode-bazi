/**
 * เทส engine ตั้งชื่อหลายชาติ (รันด้วย tsx)
 *   npx tsx scripts/test-naming-multinational.mts
 * ยึดเคสจากไฟล์ตำราจริงใน data/library/naming-canon (แต่ละเคสมีเฉลยในตำรา/คำนวณตรงสูตร)
 */
import { analyzeThaiTaksa } from "../src/lib/naming/engines/thai-taksa";
import { analyzeThaiLekSart } from "../src/lib/naming/engines/thai-leksart";
import { analyzeChaldean } from "../src/lib/naming/engines/chaldean";
import { analyzePythagorean } from "../src/lib/naming/engines/pythagorean";
import { analyzeJapaneseGokaku } from "../src/lib/naming/engines/japanese-gokaku";
import { analyzeNakshatra } from "../src/lib/naming/engines/indian-nakshatra";
import { analyzeName } from "../src/lib/naming/engine";
import { computeWuge } from "../src/lib/naming/engine";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}  ${extra}`);
  }
}
function bd(r: { breakdown: { label: string; value: string | number }[] }, labelIncl: string) {
  return r.breakdown.find((b) => b.label.includes(labelIncl));
}

console.log("── 🇹🇭 ทักษา (taksa) ──");
{
  const r = analyzeThaiTaksa({ name: "สมชาย", birthDay: "อาทิตย์" });
  // verdict มีกาลกิณีขึ้นต้น "⚠️", สะอาดขึ้นต้น "✅" — เช็คด้วยหัวข้อความ (กัน substring "ไม่มี" หลอก)
  ok("สมชาย/อาทิตย์ = มีกาลกิณี ส", r.ok && r.verdict.startsWith("⚠️") && r.verdict.includes("ส"), r.verdict);

  const clean = analyzeThaiTaksa({ name: "กมล", birthDay: "อาทิตย์" });
  ok("กมล/อาทิตย์ = ไม่มีกาลกิณี", clean.ok && clean.verdict.startsWith("✅"), clean.verdict);

  // กาลกิณีเลื่อนตามวันเกิด: ด เป็นกาลกิณีวันพฤหัส แต่ไม่ใช่วันเสาร์
  const thu = analyzeThaiTaksa({ name: "ดารา", birthDay: "พฤหัสบดี" });
  const sat = analyzeThaiTaksa({ name: "ดารา", birthDay: "เสาร์" });
  ok("ดารา/พฤหัส = มีกาลกิณี ด", thu.ok && thu.verdict.startsWith("⚠️") && thu.verdict.includes("ด"), thu.verdict);
  ok("ดารา/เสาร์ = สะอาด (กาลกิณีต่างวัน)", sat.ok && sat.verdict.startsWith("✅"), sat.verdict);

  const noDay = analyzeThaiTaksa({ name: "กมล" });
  ok("ไม่มีวันเกิด = notAvailable", !noDay.ok && noDay.notAvailable.some((n) => n.field === "birthDay"));
}

console.log("── 🇹🇭 เลขศาสตร์ไทย (leksart) ──");
{
  // พ=8 (ราหู) + ร=4 (พุธ) = 12 → §2.2 มีความหมาย "ความเปลี่ยนแปลง"
  const r = analyzeThaiLekSart({ name: "พร" });
  const sum = bd(r, "ผลรวม");
  ok("พร = ผลรวม 12", r.ok && sum?.value === 12, JSON.stringify(sum));
  ok("มีความหมายผลรวม 12 จากตำรา", r.verdict.includes("12") && !!bd(r, "ความหมายผลรวม 12"), r.verdict);
  ok("disclaimer กำกับ 'ไม่มีคัมภีร์ต้นฉบับเล่มเดียว'", !!r.disclaimer && r.disclaimer.includes("ไม่มีคัมภีร์ต้นฉบับเล่มเดียว"));

  // ผลรวมที่ตำราไม่มีคำบรรยาย → notAvailable (มา = ม5+า1 = 6)
  const na = analyzeThaiLekSart({ name: "มา" });
  ok("ผลรวมไม่มีในตำรา = notAvailable", na.ok && na.notAvailable.some((n) => n.field.includes("ความหมายผลรวม")), JSON.stringify(na.notAvailable));
}

console.log("── Chaldean vs Pythagorean (ต้องต่างกันจริง) ──");
{
  const c = analyzeChaldean({ name: "DAVID" });
  const p = analyzePythagorean({ name: "DAVID" });
  const cComp = bd(c, "เลขผสม (Compound)")?.value;
  const pExpr = bd(p, "Expression/Destiny")?.value;
  ok("Chaldean DAVID = 16 (คาลเดียน 1–8)", c.ok && cComp === 16, String(cComp));
  ok("Pythagorean DAVID = 22 (พีทาโกรัส 1–9, Master)", p.ok && pExpr === 22, String(pExpr));
  ok("เลขต่างกันจริงบนชื่อเดียวกัน (16 ≠ 22)", cComp !== pExpr, `${cComp} vs ${pExpr}`);
  ok("Chaldean มีความหมายเลขผสม 16 จากตำรา", c.verdict.includes("16"));
  ok("Pythagorean verdict อ้างเลข 22", p.verdict.includes("22"));
}

console.log("── 🇯🇵 五格 (japanese gokaku) ──");
{
  const g = analyzeJapaneseGokaku({ surname: "田中", given: "太郎" });
  const [tiange, renge, dige, waige, zongge] = computeWuge([5, 4], [4, 13]); // ค่าขีดจาก strokes.json (康煕)
  ok("五格 ตรงสูตร computeWuge (reuse จีน)",
    g.ok && bd(g, "人格")?.value === renge && bd(g, "総格")?.value === zongge && bd(g, "天格")?.value === tiange && bd(g, "地格")?.value === dige && bd(g, "外格")?.value === waige,
    `人${bd(g, "人格")?.value}=${renge} 総${bd(g, "総格")?.value}=${zongge}`);
  ok("人格=8 จำแนกเป็น 吉 (ดี) ตามตาราง 81 ญี่ปุ่น", (bd(g, "人格")?.luck || "").includes("ดี"), String(bd(g, "人格")?.luck));

  // 寡婦運: renge=21, zongge=33 (林林/郎中) เป็นเลขร้ายเฉพาะหญิง
  const gF = analyzeJapaneseGokaku({ surname: "林林", given: "郎中", gender: "F" });
  const gM = analyzeJapaneseGokaku({ surname: "林林", given: "郎中", gender: "M" });
  ok("หญิง: เตือน 寡婦運 (21/33)", gF.ok && gF.verdict.includes("寡婦運") && !!bd(gF, "寡婦運"), gF.verdict);
  ok("ชาย: ไม่เตือน 寡婦運", gM.ok && !gM.verdict.includes("寡婦運"), gM.verdict);

  // คานะ/อักษรไม่มีในตาราง康煕 = notAvailable (ไม่เดา)
  const kana = analyzeJapaneseGokaku({ surname: "あ", given: "い" });
  ok("คานะไม่มีค่าขีด = notAvailable", !kana.ok && kana.notAvailable.length > 0);
}

console.log("── 🇮🇳 นักษัตร (nakshatra) ──");
{
  // ตัวอย่างในตำรา: จันทร์ 5° เมษ → Ashwini ปาทะ 2 → "Che"
  const r = analyzeNakshatra({ moonLongitude: 5 });
  ok("จันทร์ 5° → Ashwini ป.2 → Che", r.ok && r.verdict.includes("Che"), r.verdict);

  const byName = analyzeNakshatra({ nakshatra: "Rohini", pada: 1 });
  ok("Rohini ป.1 → O", byName.ok && byName.verdict.includes('"O"'), byName.verdict);

  const noMoon = analyzeNakshatra({ name: "foo" });
  ok("ไม่มีตำแหน่งจันทร์ = notAvailable", !noMoon.ok && noMoon.notAvailable.length > 0);
}

console.log("── 🀄 regression: 五格 จีนเดิม ──");
{
  const r = analyzeName("王", "明"); // 王=4 明=8 อยู่ใน strokes.json
  ok("五格 จีนยังคืนผลเดิม (ok + 5 ge + score)", r.ok === true && (r as any).ge?.length === 5 && typeof (r as any).score === "number");
}

console.log(`\nรวม: ${pass} ผ่าน / ${fail} ตก`);
if (fail > 0) process.exitCode = 1;
