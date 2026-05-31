/**
 * Test · synastry "ลิสต์ปิด" (closed-world) · เฟส 0+5
 * รัน: node --experimental-strip-types scripts/test-synastry-closed.mts
 * เฟส 0: import buildSynastry "ตัวจริง" จาก src/lib/bazi-synastry.ts (self-contained · ไม่ติด next/server แล้ว)
 *   → test output จริง ไม่ใช่ mirror (แก้ตาม Codex ติง)
 * โจทย์: AI ต้องรู้ว่า "เช็คครบทุกคู่" + ห้ามแต่งคู่นอกลิสต์
 */
import { buildSynastry, type PersonSyn } from "../src/lib/bazi-synastry.ts";

let pass = 0, fail = 0;
const ck = (l: string, c: boolean, g?: string) => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (g ? " · " + g : ""))); };

const P = (name: string, dmEl: string, yong: string[], dayB: string, yearB: string, mode: "3p" | "4p" = "4p"): PersonSyn => ({
  name, role: "x", isSelf: false, text: "", mode, dmEl, yongEls: yong,
  pillars: { year: { stem: "甲", branch: yearB }, day: { stem: "壬", branch: dayB } },
});

console.log("[synastry closed-list · 3 คน · มีคู่เด่น (na↔ป้า มี 子午冲)]");
// fixture: na(day寅/year子) ป้า(day午/year午) ไนท์(day巳/year卯) — มีหลายคู่เด่น (子午冲/寅巳害/午卯破) · assert closed-list+คู่ na↔ป้า
const out = buildSynastry([P("na", "water", ["wood"], "寅", "子"), P("ป้า", "earth", ["fire"], "午", "午"), P("ไนท์", "earth", ["fire"], "巳", "卯")], "th");
ck("ระบุ 'เทียบครบทุกคู่ 3 คู่' (C(3,2)=3)", /เทียบครบทุกคู่ 3 คู่/.test(out), out.slice(0, 60));
ck("ระบุจำนวนคน 3 + รายชื่อ na/ป้า/ไนท์", /จาก 3 คน \[na, ป้า, ไนท์\]/.test(out), "");
ck("คู่ไม่ขึ้น = เช็คแล้วไม่มี (ไม่ใช่ยังไม่เช็ค)", /เป็นข้อสรุป ไม่ใช่ "ยังไม่เช็ค"/.test(out), "");
ck("ห้ามแต่งคู่นอกลิสต์", /ห้ามสร้าง\/สันนิษฐาน 合\/冲\/破\/害/.test(out), "");
ck("แยกในดวง vs ข้ามคน", /ปฏิกิริยาภายในดวงเดี่ยว.*ข้ามคน → เฉพาะลิสต์นี้/.test(out), "");
ck("คู่ na↔ป้า ขึ้นจริง (มี 六沖)", /na ↔ ป้า/.test(out) && /ปะทะ\(冲\)/.test(out), "");

console.log("[en/zh closed-list · import จริง]");
const oe = buildSynastry([P("na", "water", [], "子", "子"), P("B", "fire", [], "午", "午")], "en");
const oz = buildSynastry([P("na", "water", [], "子", "子"), P("B", "fire", [], "午", "午")], "zh");
ck("EN: CLOSED LIST + ALL 1 pair + DO NOT create", /CLOSED LIST.*ALL 1 pair.*DO NOT create or infer/s.test(oe), "");
ck("ZH: 封閉清單 + 全部 1 組 + 禁止", /封閉清單.*全部 1 組.*禁止為清單外/s.test(oz), "");

console.log("[เคสไม่มีคู่เด่น · ยังโชว์ header (ไม่ใช่ \"\")]");
// 2 คน กิ่งไม่สัมพันธ์ (寅×寅 = ไม่ 合冲害破) + yongEls ว่าง → ไม่มี hit
const o0 = buildSynastry([P("A", "wood", [], "寅", "寅"), P("B", "metal", [], "寅", "寅")], "th");
ck("ไม่มีคู่เด่น → ยังมี header closed-list", /ลิสต์ปิด.*เทียบครบทุกคู่ 1 คู่/s.test(o0), "");
ck("ไม่มีคู่เด่น → ข้อความ 'เช็คทุกคู่แล้ว ไม่มีเด่น'", /เช็คทุกคู่แล้ว · ไม่มีคู่ใดมีปฏิกิริยาข้ามคนเด่น/.test(o0), "");

console.log("[< 2 คน → \"\"]");
ck("1 คน → คืน \"\"", buildSynastry([P("solo", "water", [], "子", "子")], "th") === "", "");

console.log("[math C(M,2)]");
const mk = (n: number) => Array.from({ length: n }, (_, i) => P("p" + i, "water", [], "寅", "辰"));
ck("4 คน → 6 คู่", /เทียบครบทุกคู่ 6 คู่ จาก 4 คน/.test(buildSynastry(mk(4), "th")), "");
ck("5 คน → 10 組 (zh)", /5 人.*全部 10 組/s.test(buildSynastry(mk(5), "zh")), "");

// ─── เฟส 1: 天干五合 ข้ามคน (raw 緣 · ไม่ฟัน化) + ตัด刑 + 害/破อ่อน ───
const sp = (n: string) => (n && [...n].length === 2 ? { stem: [...n][0], branch: [...n][1] } : undefined);
const PM = (name: string, dayStem: string, dayB: string, monStem: string, monB: string, yrStem: string, yrB: string, border = false, yrBorder = false, monAlt = "", yrAlt = "", hour = ""): PersonSyn => ({
  name, role: "x", isSelf: false, text: "", mode: "4p", dmEl: "water", yongEls: [],
  pillars: { year: { stem: yrStem, branch: yrB }, month: { stem: monStem, branch: monB }, day: { stem: dayStem, branch: dayB }, hour: sp(hour) },
  monthBorderline: border, yearBorderline: yrBorder,
  monthAlt: sp(monAlt), yearAlt: sp(yrAlt),
});
console.log("\n[เฟส 1 · 丁壬 ข้ามคน (Mu月干丁 × na日干壬) → 緣 ไม่ใช่化木]");
// Mu: เดือน丁亥 · na: วัน壬寅 — 丁(เดือนMu)×壬(วันna) = 天干五合
const t1 = buildSynastry([
  PM("na", "壬", "寅", "丙", "辰", "丙", "子"),
  PM("Mu", "己", "亥", "丁", "亥", "甲", "卯"),
], "th");
ck("丁壬 → มี 天干五合(丁壬合)", /天干五合/.test(t1) && /丁壬合/.test(t1), t1.slice(t1.indexOf("Mu") >= 0 ? 0 : 0, 0) || "");
ck("丁壬 → มีป้าย 緣 (ดึงดูด/ผูกพัน)", /緣|ผูกพัน/.test(t1), "");
ck("丁壬 → ห้ามมี 化木/化氣格/得令 ใน hit (raw สะอาด)", !/化木|化氣格|得令/.test(t1.split("\n").filter(l => l.startsWith("  - ")).join("")), "");
ck("คงธาตุก้านเดิม → ไม่มี 木 โผล่ในบรรทัด hit 丁壬", !/丁壬合.*木|木.*丁壬合/.test(t1.split("\n").filter(l => l.startsWith("  - ")).join("")), "");

console.log("[เฟส 1 · ตัด刑ออก · 子卯ข้ามคน ต้องไม่ออก刑]");
const t2 = buildSynastry([PM("A", "壬", "子", "丙", "辰", "丙", "辰"), PM("B", "己", "卯", "丁", "巳", "甲", "未")], "th");
ck("子卯 ข้ามคน → ไม่มีคำว่า 刑 (ตัดออกเฟส 1)", !/刑/.test(t2), "");

console.log("[เฟส 1 · header hierarchy 任鐵樵 + 害/破อ่อน + closed-list ครอบ天干五合]");
ck("header มีลำดับน้ำหนัก 三合/三會 > ... > 害·破 อ่อน", /三合\/三會 แรง.*害·破 อ่อน/.test(t1), "");
ck("header อ้าง 任鐵樵 (削之可也/不經)", /任鐵樵/.test(t1) && /削之可也|不經/.test(t1), "");
ck("closed-list ครอบ 天干五合 (ห้ามแต่งนอกลิสต์)", /ห้ามสร้าง\/สันนิษฐาน 合\/冲\/破\/害\/三合\/三會\/半合\/天干五合/.test(t1), "");
ck("guard ห้ามประกาศ化木/化X ใน header", /ห้ามประกาศ化木\/化X/.test(t1), "");

console.log("[เฟส 1 · borderline · เสาเดือนคน 3 เสาก้ำกึ่ง → ติดธง]");
// na เป็น 3 เสา เสาเดือนก้ำกึ่ง · 丁(เดือนMu)×壬(วันna) ไม่พึ่งเดือนna · ลองให้ Mu เดือนก้ำกึ่ง (丁อยู่เดือนMu)
const t3 = buildSynastry([
  PM("na", "壬", "寅", "丙", "辰", "丙", "子"),
  PM("Mu", "己", "亥", "丁", "亥", "甲", "卯", true), // Mu เดือนก้ำกึ่ง
], "th");
ck("hit ที่พึ่งเสาเดือนคนก้ำกึ่ง → มีธง 'ขึ้นกับเวลาเกิด'", /ขึ้นกับเวลาเกิด·เสาก้ำกึ่ง/.test(t3), t3.split("\n").filter(l=>/丁壬/.test(l))[0]||"");
// 31 พ.ค. what-if: มีคนก้ำกึ่ง → header NOTE บอก "คำนวณให้ทั้ง 2 ฝั่งแล้ว" (ไม่ใช่แค่เตือน absence)
ck("มีคนก้ำกึ่ง → header มี NOTE 'คำนวณให้ทั้ง 2 ฝั่งแล้ว · อ่านแบบมีเงื่อนไข'", /คำนวณให้ทั้ง 2 ฝั่งแล้ว/.test(t3) && /อ่านแบบมีเงื่อนไข/.test(t3), "");
ck("ไม่มีคนก้ำกึ่ง → ไม่มี NOTE นั้น (closed-world เต็ม)", !/คำนวณให้ทั้ง 2 ฝั่งแล้ว/.test(t1), "");
// Codex รอบ 56: 立春 → เสาปีก็ก้ำกึ่ง (乙亥↔丙子) · hit ที่พึ่งเสาปีของคนนั้นต้องติดธง + blNote ต้อง trigger
// na เสาปี子 × B เสาปี丑 = 子丑六合 (พึ่งเสาปี) · na yearBorderline(เกิด立春)
const t4 = buildSynastry([
  PM("na", "壬", "寅", "丙", "辰", "丙", "子", false, true), // 立春: เสาปีก้ำกึ่ง
  PM("B", "己", "亥", "丁", "巳", "甲", "丑"),
], "th");
ck("立春 · hit ที่พึ่งเสาปีคนก้ำกึ่ง → ติดธง 'ขึ้นกับเวลาเกิด'", /เสาปี.*子.*ผสาน.*ขึ้นกับเวลาเกิด/.test(t4) || /ขึ้นกับเวลาเกิด/.test(t4.split("\n").filter(l=>/เสาปี/.test(l)).join("")), t4.split("\n").filter(l=>l.startsWith("  - "))[0]||"");
ck("立春 · yearBorderline → blNote trigger (note พูดถึงเสาปี/立春)", /คำนวณให้ทั้ง 2 ฝั่งแล้ว/.test(t4) && /立春|เสาปี/.test(t4), "");
ck("blNote → เสาวัน(日)ยังฟันธงได้ (ไม่บอก year firm)", /เสาวัน\(日\) ยังฟันธงได้/.test(t4) && !/เสาปี ยังฟันธง/.test(t4), "");
// Codex รอบ 56: tag generic · year hit ห้ามขึ้นคำ "เสาเดือน/月柱/month" (เพราะพึ่งเสาปี)
ck("立春 · tag เป็น generic 'เสาก้ำกึ่ง' (ไม่ใช่ 'เสาเดือน')", /ขึ้นกับเวลาเกิด·เสาก้ำกึ่ง/.test(t4) && !/เสาเดือนก้ำกึ่ง/.test(t4), "");

console.log("\n[what-if · เสาก้ำกึ่ง คำนวณ hit ฝั่ง alt ติดธง [ถ้าเกิดอีกฝั่ง]]");
// X เสาเดือน engine=壬辰(ก้ำกึ่ง) · alt=癸巳 · Y วัน戊亥 (癸/巳 ไม่มีในเสาหลักของใคร = hit ใดมี癸/巳 ต้องมาจาก alt เท่านั้น)
//  - alt ก้าน 癸×戊(วันY) = 戊癸合(緣) · alt กิ่ง 巳×亥(วันY) = 六沖 → ติดธง [癸巳]
const tw = buildSynastry([
  PM("X", "甲", "寅", "壬", "辰", "丙", "午", true, false, "癸巳"),
  PM("Y", "戊", "亥", "庚", "子", "甲", "申"),
], "th");
const twHits = tw.split("\n").filter(l => l.startsWith("  - ")).join("");
ck("alt → ขึ้น 天干五合(戊癸合) จากก้านเดือน alt 癸", /戊癸合/.test(twHits), twHits);
ck("戊癸合 ติดธง [ถ้าเกิดอีกฝั่ง→เสาเป็น 癸巳] ตรงตำแหน่ง", /戊癸合\) ⚠️\[ถ้าเกิดอีกฝั่ง→เสาเป็น 癸巳\]/.test(twHits), twHits);
ck("alt → กิ่ง 巳(มะเส็ง) ขึ้น hit + ติดธง alt (巳 มาจาก alt เท่านั้น)", /มะเส็ง[\s\S]*?ถ้าเกิดอีกฝั่ง→เสาเป็น 癸巳/.test(twHits), twHits);
ck("ไม่มี alt (t1 ปกติ) → ไม่มีธง [ถ้าเกิดอีกฝั่ง]", !/ถ้าเกิดอีกฝั่ง/.test(t1), "");
// dedup: alt กิ่ง辰 = หลัก辰 → 辰戌冲 ต้องขึ้นครั้งเดียว (ไม่ซ้ำจาก primary+alt)
const twDup = buildSynastry([
  PM("X", "甲", "寅", "壬", "辰", "丙", "午", true, false, "癸辰"), // alt กิ่ง辰 ซ้ำหลัก (ก้าน癸ต่าง)
  PM("Y", "戊", "戌", "乙", "丑", "辛", "酉"),
], "th");
const twDup辰戌 = (twDup.match(/เสาเดือนมะโรง×เสาวันจอ/g) || []).length; // 辰×戌(วันY) · primary+alt กิ่งเดียวกัน → ต้อง dedup เหลือ 1
ck("dedup · alt กิ่งซ้ำหลัก → 辰戌冲 ขึ้นครั้งเดียว", twDup辰戌 === 1, "count=" + twDup辰戌);
ck("dedup case · ก้าน alt 癸 ต่างหลัก 壬 → 戊癸合 ยังขึ้น (ไม่ถูก dedup ทิ้งผิด)", /戊癸合/.test(twDup), "");

// ─── เฟส 2: +เสายาม(時) + 三合/三會/半合 ข้ามคน ───
console.log("\n[เฟส 2 · เสายาม(時) ข้ามคน · 4p เท่านั้น]");
// A hour午 × B hour子 = 子午冲 · A,B กิ่งอื่น寅/卯 → A午×B卯=六破(เสายาม) · พิสูจน์ hour เข้า loop
const th = buildSynastry([
  PM("A", "甲", "寅", "甲", "寅", "甲", "寅", false, false, "", "", "丙午"),
  PM("B", "乙", "卯", "乙", "卯", "乙", "卯", false, false, "", "", "庚子"),
], "th");
ck("เสายาม เข้า loop → มีป้าย 'เสายาม'", /เสายาม/.test(th), th.split("\n").filter(l=>l.startsWith("  - "))[0]||"");
ck("เสายาม午×เสายาม子 → 六冲", /เสายาม.{0,8}×เสายาม.{0,8}ปะทะ\(冲\)/.test(th), "");
// 3p (ไม่มี hour) → ไม่มีป้ายเสายาม
const th3p = buildSynastry([
  P("X", "water", [], "午", "子", "3p"),
  P("Y", "fire", [], "子", "午", "3p"),
], "th");
ck("3p ไม่มีเสายาม → ไม่มีป้าย 'เสายาม' ใน hit", !/เสายาม/.test(th3p.split("\n").filter(l=>l.startsWith("  - ")).join("")), "");

console.log("[เฟส 2 · 三合 ข้ามคน (ครบจาก 2 คน)]");
// A: 申(วัน)+子(เดือน) · B: 辰(วัน) → 申子辰 三合 water ข้ามคน
const t3h = buildSynastry([
  PM("A", "甲", "申", "甲", "子", "甲", "寅"),
  PM("B", "乙", "辰", "乙", "未", "乙", "酉"),
], "th");
ck("申子辰 ครบจาก 2 คน → ขึ้น 三合 ข้ามคน", /สามฮะ\(三合\) วอกชวดมะโรง\(น้ำ\)/.test(t3h) && /ข้ามคน·วงครบ/.test(t3h), t3h.split("\n").filter(l=>/สามฮะ|三合/.test(l))[0]||"");
// 三合 ครบในคนเดียว (A มี 申子辰 หมด) → ห้ามขึ้นเป็นข้ามคน
const t3solo = buildSynastry([
  PM("A", "甲", "申", "甲", "子", "甲", "辰"),
  PM("B", "乙", "寅", "乙", "寅", "乙", "寅"),
], "th");
ck("申子辰 ครบในคน A คนเดียว → ไม่ขึ้น 三合 ข้ามคน", !/วงครบ/.test(t3solo), t3solo.split("\n").filter(l=>l.startsWith("  - ")).join(" | ")||"");

console.log("[เฟส 2 · 三會 ข้ามคน]");
// A: 寅(วัน)+卯(เดือน) · B: 辰(วัน) → 寅卯辰 三會 wood ข้ามคน
const t3hui = buildSynastry([
  PM("A", "甲", "寅", "甲", "卯", "丙", "午"),
  PM("B", "乙", "辰", "辛", "酉", "乙", "亥"),
], "th");
ck("寅卯辰 ครบจาก 2 คน → ขึ้น 三會 ข้ามคน", /สามฮุ่ยทิศ\(三會\) ขาลเถาะมะโรง\(ไม้\)/.test(t3hui) && /ข้ามคน·วงครบ/.test(t3hui), t3hui.split("\n").filter(l=>/三會|สามฮุ่ย/.test(l))[0]||"");

console.log("[เฟส 2 · 半合 ข้ามคน + กดเมื่อ 三合 ครบ]");
// 半合: A 申(วัน) × B 子(วัน) = 半合 water (มีตัวกลาง子) · ไม่มี辰 → วงไม่ครบ → 半合 ขึ้น
const tbh = buildSynastry([
  PM("A", "甲", "申", "甲", "寅", "甲", "巳"),
  PM("B", "乙", "子", "乙", "戌", "乙", "酉"),
], "th");
ck("申子 (มีตัวกลาง) → 半合 water ขึ้น (วงไม่ครบ)", /ครึ่งวงธาตุ\(半合\)·น้ำ/.test(tbh), tbh.split("\n").filter(l=>/半合|ครึ่งวง/.test(l))[0]||"");
// suppression: A 申子 × B 辰 → 三合 ครบ → 半合 申子/子辰 ต้องถูกกด
const tsup = buildSynastry([
  PM("A", "甲", "申", "甲", "子", "甲", "寅"),
  PM("B", "乙", "辰", "乙", "戌", "乙", "戌"),
], "th");
ck("三合 ครบ → 半合 น้ำ ถูกกด (ไม่ขึ้นซ้ำในวง)", /สามฮะ/.test(tsup) && !/ครึ่งวงธาตุ\(半合\)·น้ำ/.test(tsup), tsup.split("\n").filter(l=>l.startsWith("  - ")).join(" | "));

console.log("[เฟส 2 · header บอก AI ครบ (時+三合/三會/半合)]");
ck("header ระบุ 日月年時 + 三合/三會/半合", /日月年時/.test(t3h) && /三合\/三會\/半合/.test(t3h), "");
ck("closed-list ครอบ 三合/三會/半合 ด้วย", /ห้ามสร้าง\/สันนิษฐาน 合\/冲\/破\/害\/三合\/三會\/半合\/天干五合/.test(t3h), "");

console.log(`\n[synastry · import จริง · เฟส 0+1+what-if+เฟส2] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
