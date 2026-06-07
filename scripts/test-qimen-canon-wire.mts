/**
 * Test · Qimen Sifu source packet wire
 * Current design is source-governed snippets with line trace, not full-book prompt stuffing.
 * Run: node --experimental-strip-types scripts/test-qimen-canon-wire.mts
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROUTE = readFileSync(new URL("../src/app/api/qimen/sifu/route.ts", import.meta.url), "utf8");
let pass = 0;
let fail = 0;

function ck(label: string, condition: boolean, guide?: string) {
  if (condition) {
    pass++;
    console.log("  ✅ " + label);
  } else {
    fail++;
    console.log("  ❌ " + label + (guide ? " · " + guide : ""));
  }
}

function has(text: string) {
  return ROUTE.includes(text);
}

console.log("[#1 wiring · source-governed snippets]");
ck("มี QMDJ_DIR", has("const QMDJ_DIR"));
ck("มี QMDJ_SNIPPETS", has("const QMDJ_SNIPPETS"));
ck("มี structured source trace item", has("type QimenSourceTraceItem"));
ck("อ่านเฉพาะบรรทัดที่กำหนด", has("function readDocLines") && has("slice(spec.start - 1, spec.end)"));
ck("มี packet cap", has("MAX_SOURCE_PACKET_CHARS"));
ck("snippet ใส่แหล่งอ้างอิง:file:start-end", has("แหล่งอ้างอิง: ${s.file}:${s.start}-${s.end}"));
ck("snippet ใส่เหตุผลเลือกแหล่งอ้างอิงเป็นไทย", has("เหตุผลเลือกแหล่งอ้างอิง: ${traceItem.reason_th}"));
ck("trace ใส่ id=file:start-end", has("trace.push(`${s.id}=${s.file}:${s.start}-${s.end}`)"));
ck("traceItems เก็บ structured source metadata", has("traceItems.push(traceItem)") && has("sourceTraceItems: QimenSourceTraceItem[]"));
ck("buildPrompt เรียก loadQimenKnowledge พร้อม message/topic/payload", has("loadQimenKnowledge({ message, topic, payload })"));
ck("response/log ส่ง qimen_source_version", has("qimen_source_version: built.knowledgeVersion"));
ck("response/log ส่ง qimen_source_trace", has("qimen_source_trace: built.sourceTrace"));
ck("response/log ส่ง qimen_source_trace_items", has("qimen_source_trace_items: built.sourceTraceItems"));
ck("ยังโหลด persona จาก qimen-sifu.md", has("loadPromptMd(\"prompts/qimen-sifu.md\""));

console.log("[#1b retrieval reasons · system-aware]");
ck("มี qimenSourceReasonTh", has("function qimenSourceReasonTh"));
ck("มี qimenSourceTraceItem", has("function qimenSourceTraceItem"));
ck("reason 年/月/日/時 เป็นไทยนำจีนรอง", has("ต้องอธิบายขอบเขต 年/月/日/時 ให้ไม่ปนกัน"));
ck("reason activity ห้ามใช้คะแนนฉีเหมินกลาง", has("ต้องใช้กฎกิจกรรม ไม่ใช้คะแนนฉีเหมินกลาง"));
ck("reason classic ยึดผังจริงจากระบบคำนวณ", has("คำตัดสินต้องยึดผังจริงจากระบบคำนวณ"));
ck("เลือก ymd snippets เมื่อ payload ไม่ใช่ hour", has("if (systemType !== \"hour\" || wantAny(text, [\"ปี\", \"เดือน\", \"วัน\""));
ck("structured trace มี title_th/source_label_th/reason_th แบบไทยนำ", has("title_th: titleTh") && has("qimenSourceTitleTh(s)") && has("source_label_th: \"ชุดความรู้ฉีเหมินสำหรับผู้ช่วยซินแส\"") && has("reason_th: qimenSourceReasonTh"));
ck("ไม่มี title user-facing ที่ขึ้นต้นอังกฤษ/จีนล้วนจากรายการเดิม", !has("title: \"คำแนะนำ UX") && !has("title: \"ฉีเหมินปี/เดือน/วัน: default lineage") && !has("title: \"BaZi overlay") && !has("title: \"統宗"));
ck("reason user-facing ไม่มีศัพท์ dev หลุด", !has("payload อยู่ในโหมด") && !has("จาก engine packet") && !has("source of truth") && !has("คะแนน/source"));

console.log("[#2 engine-first prompt contract]");
ck("ผังจริงมาก่อน source packet", has("ผังเวลา (QiMen Chart):\\n${qimenText}\\n${canonBlock}"));
ck("บอกว่าผังจากระบบเป็นหลัก", has("ข้อมูลผังจากระบบคำนวณคือหลักตัดสิน"));
ck("บอกว่าชุดแหล่งอ้างอิงไม่สร้างค่าผังใหม่", has("ชุดแหล่งอ้างอิงมีไว้แปลความหมาย ไม่ใช่สร้างค่าผังใหม่"));
ck("รายการแหล่งอ้างอิงใน prompt อธิบายเหตุผลเลือก snippet", has("${s.id} · ${s.reason_th} · ${s.file}:${s.line_range}"));
ck("มี selected palace block", has("วังที่ผู้ใช้เลือก 選宮"));
ck("กติกาวังนี้ต้องเริ่มจากวังที่เลือก", has("ให้เริ่มจากวังที่ผู้ใช้เลือกนี้ก่อน"));
ck("อธิบายทิศจากประตูดาวเทพก้านและป้ายสัญญาณ", has("ประตู + ดาว + เทพ + ก้าน + ป้ายสัญญาณจากระบบ"));

console.log("[#3 no stale full-book wiring]");
/* 7 มิ.ย. · data/library/qmdj อ้างได้เฉพาะเป็นฐานไฟล์ความรู้ไทยนำ auth-th/ (สรุป+原文)
 * ห้ามโหลดหนังสือ clean เต็มเล่ม (yanbo/tongzong/dunjia) เข้า prompt */
ck("ถ้าอ้าง data/library/qmdj ต้องเป็นฐาน auth-th ไทยนำเท่านั้น", !has("data/library/qmdj") || has("auth-th"));
ck("ไม่คาดหวัง yanbo full book", !has("yanbo-diaosou-ge.md"));
ck("ไม่คาดหวัง tongzong clean full book", !has("qimen-tongzong-clean.md"));
ck("ไม่คาดหวัง dunjia yanyi full book", !has("dunjia-yanyi-juan2.md"));

console.log("[#3b ไฟล์ความรู้ไทยนำ (repo · auth-th)]");
ck("route รองรับ flag repo", has("repo?: boolean") && has("QMDJ_REPO_DIR"));
ck("ขึ้น snippet 主客法+生剋 (host-guest-shengke)", has('id: "host-guest-shengke"') && has("auth-th/zhuke-shengke-th.md"));
const authDir = join(new URL("../data/library/qmdj/auth-th/", import.meta.url).pathname);
const zhuke = join(authDir, "zhuke-shengke-th.md");
const zhukeOk = existsSync(zhuke) && statSync(zhuke).size > 800;
ck("ไฟล์ zhuke-shengke-th.md มีจริง", zhukeOk, zhuke);
if (zhukeOk) {
  const t = readFileSync(zhuke, "utf8");
  ck("ไทยนำ: อธิบายเจ้าบ้าน–แขก", t.includes("เจ้าบ้าน") && t.includes("แขก") && (t.includes("รุก") || t.includes("รับ")));
  ck("原文 主客 ตรงคัมภีร์ (兵事分主客 verbatim ตัวย่อ)", t.includes("兵事分主客：宫为主，星门为客。客生星门利客，星门生宫利主。宫克星门利主，星门克宫利客。"));
  ck("原文 主客雌雄 ตรงคัมภีร์ (ตัวย่อ)", t.includes("主客雌雄：世为客，应为主。"));
}

console.log("[#4 source files exist]");
const qmdjDir = process.env.QIMEN_DOCS_DIR || "/var/www/hourkey/docs/Qimendunjia คัมภีร์";
const requiredFiles = [
  "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
  "คู่มืออ้างอิง — ฤกษ์ยามในวิชา Qi Men Dun Jia (奇門遁甲) ตามประเภทกิจกรรม สำหรับ datepick .md",
  "奇門遁甲統宗 (ฉีเหมินตุนเจี่ย ถ่งจง)RV1.txt",
];

for (const file of requiredFiles) {
  const path = join(qmdjDir, file);
  const ok = existsSync(path) && statSync(path).size > 1000;
  ck(`${file} exists`, ok, path);
}

console.log(`\n[qimen-canon-wire] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
