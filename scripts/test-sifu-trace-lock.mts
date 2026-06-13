/* เทส trace-lock (เคส Swit 潤下格) · รัน: npx tsx scripts/test-sifu-trace-lock.mts */
import { extractTraceFacts, parseTraceLine, stripTraceLine, validateTrace } from "../src/lib/sifu-trace-lock";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
}

/* ctx จำลองแบบ Swit: ดวงเดี่ยว โครง雜氣劫財格 ธาตุช่วยไฟ + บรรทัดบุคลิกล่อ潤下格 */
const CTX_SWIT = [
  "FACT LOCK: Day Master = 壬",
  "โครงดวง: 雜氣劫財格 · ความมั่นใจโครง moderate",
  "ธาตุช่วยจากระบบ (engine-derived): ธาตุช่วยหลัก=ไฟ · ธาตุช่วยรอง=ไม้ · ธาตุระวัง=ดิน",
  "🏗 โครง 5 ธาตุ: นักกลยุทธ์ · ลื่นไหลและลึกซึ้ง (潤下格) — ⚠️ ภาพบุคลิกเชิงเปรียบเทียบเท่านั้น",
].join("\n");

const facts = extractTraceFacts(CTX_SWIT);
ok("ดวงเดี่ยว → ได้ facts", !!facts, JSON.stringify(facts));
ok("ชื่อโครงที่ยอมรับ = 雜氣劫財格 (ไม่ดูด潤下จากบรรทัดบุคลิก)", !!facts && facts.gejuTokens.includes("雜氣劫財格") && !facts.gejuTokens.includes("潤下格"), JSON.stringify(facts?.gejuTokens));
ok("從 expected = ไม่มี (โครงปกติ)", facts?.congExpected === false);

/* 1) TRACE ถูกต้อง → ผ่าน */
const GOOD = "⟦ID⟧日干=壬⟧\n⟦TRACE⟧從=ไม่มี·格局=雜氣劫財格·用神=ไฟ⟧\nสวัสดีครับ...";
ok("TRACE ถูก → ผ่าน", validateTrace(GOOD, facts).ok);

/* 2) เคสแผลจริง: เคลม潤下格 → ตัด */
const RUNXIA = "⟦ID⟧日干=壬⟧\n⟦TRACE⟧從=มี·格局=潤下格·用神=น้ำ⟧\nดวงคุณคือน้ำบริสุทธิ์...";
const r2 = validateTrace(RUNXIA, facts);
ok("เคลม潤下格 → ถูกตัด (จับแผล Swit ได้)", !r2.ok && (r2.reason === "cong_mismatch" || r2.reason === "geju_mismatch"), r2.reason);

/* 3) โครงถูกแต่用神ผิด (บอกทอง) → ตัด */
const WRONGYONG = "⟦ID⟧日干=壬⟧\n⟦TRACE⟧從=ไม่มี·格局=雜氣劫財格·用神=ทอง⟧\n...";
ok("用神ผิดธาตุ → ถูกตัด", validateTrace(WRONGYONG, facts).reason === "yong_mismatch");

/* 4) ไม่มีบรรทัด TRACE → ตัด */
ok("ไม่มี TRACE → ถูกตัด", validateTrace("⟦ID⟧日干=壬⟧\nตอบเลย...", facts).reason === "no_trace_line");

/* 5) 用神ตอบเป็นจีน 火 → ผ่าน (รับ 2 ภาษา) */
const ZH_YONG = "⟦ID⟧日干=壬⟧\n⟦TRACE⟧從=ไม่มี·格局=雜氣劫財格·用神=火⟧\n...";
ok("用神=火 (จีน) → ผ่าน", validateTrace(ZH_YONG, facts).ok);

/* 6) strip: ลบ TRACE ออกก่อนถึงลูกค้า */
const stripped = stripTraceLine(GOOD);
ok("strip แล้วไม่เหลือ ⟦TRACE⟧", !stripped.includes("⟦TRACE⟧") && stripped.includes("สวัสดีครับ"));

/* 7) กลุ่ม (มีหลายบรรทัดโครงดวง) → ข้าม (fail-open) */
const CTX_GROUP = CTX_SWIT + "\nโครงดวง: 正官格 · คนที่สอง";
ok("กลุ่ม → ข้ามการตรวจ", extractTraceFacts(CTX_GROUP) === null && validateTrace("ไม่มี trace", extractTraceFacts(CTX_GROUP)).ok);

/* 8) ดวงพิเศษจริง (ประกาศ從) → ตอบ 從=ไม่มี ต้องโดนตัด */
const CTX_FOLLOW = [
  "โครงดวง: 從財格 · ดวงพิเศษ 從財格 · ความมั่นใจโครง high",
  "ธาตุช่วยจากระบบ: ธาตุช่วยหลัก=ไฟ",
].join("\n");
const f8 = extractTraceFacts(CTX_FOLLOW);
ok("ดวง從แท้ → 從 expected = มี", f8?.congExpected === true);
ok("ดวง從แท้แต่ตอบ從=ไม่มี → ถูกตัด", validateTrace("⟦TRACE⟧從=ไม่มี·格局=從財格·用神=ไฟ⟧", f8).reason === "cong_mismatch");

/* 9) เคสก้ำกึ่ง (candidate) → ข้ามเทียบ從 แต่ยังเทียบ格局 */
const CTX_AMBI = [
  "โครงดวง: candidate หลัก=正官格 (strict月令 · มั่นใจ=สูง) · raw engine候選=從財格 (candidate รอง)",
  "ธาตุช่วยจากระบบ: ธาตุช่วยหลัก=ไฟ",
].join("\n");
const f9 = extractTraceFacts(CTX_AMBI);
ok("ก้ำกึ่ง → 從 expected = null (ข้าม)", f9?.congExpected === null);
ok("ก้ำกึ่ง ตอบโครงทางไหนก็ผ่าน (正官格)", validateTrace("⟦TRACE⟧從=ก้ำกึ่ง·格局=正官格·用神=ไฟ⟧", f9).ok);
ok("ก้ำกึ่ง ตอบ 從財格 ก็ผ่าน", validateTrace("⟦TRACE⟧從=มี·格局=從財格·用神=ไฟ⟧", f9).ok);
ok("ก้ำกึ่ง แต่ตอบ潤下格 → ยังถูกตัด", validateTrace("⟦TRACE⟧從=มี·格局=潤下格·用神=ไฟ⟧", f9).reason === "geju_mismatch");

/* 10) parse เก็บค่าถูก */
const p = parseTraceLine(GOOD);
ok("parse ค่าครบ 3 ช่อง", p?.cong === "ไม่มี" && p?.geju === "雜氣劫財格" && p?.yong === "ไฟ");

console.log(`\nผล: ${pass} ผ่าน · ${fail} ตก`);
process.exit(fail ? 1 : 0);
