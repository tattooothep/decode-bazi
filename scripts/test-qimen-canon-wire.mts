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
ck("อ่านเฉพาะบรรทัดที่กำหนด", has("function readDocLines") && has("slice(spec.start - 1, spec.end)"));
ck("มี packet cap", has("MAX_SOURCE_PACKET_CHARS"));
ck("snippet ใส่ Source:file:start-end", has("Source: ${s.file}:${s.start}-${s.end}"));
ck("trace ใส่ id=file:start-end", has("trace.push(`${s.id}=${s.file}:${s.start}-${s.end}`)"));
ck("buildPrompt เรียก loadQimenKnowledge พร้อม message/topic/payload", has("loadQimenKnowledge({ message, topic, payload })"));
ck("response/log ส่ง qimen_source_version", has("qimen_source_version: built.knowledgeVersion"));
ck("response/log ส่ง qimen_source_trace", has("qimen_source_trace: built.sourceTrace"));
ck("ยังโหลด persona จาก qimen-sifu.md", has("loadPromptMd(\"prompts/qimen-sifu.md\""));

console.log("[#2 engine-first prompt contract]");
ck("ผังจริงมาก่อน source packet", has("ผังเวลา (QiMen Chart):\\n${qimenText}\\n${canonBlock}"));
ck("บอกว่า engine packet เป็น source of truth", has("Engine packet คือ source of truth"));
ck("บอกว่า source packet ไม่สร้างค่าผังใหม่", has("source packet มีไว้แปลความหมาย ไม่ใช่สร้างค่าผังใหม่"));
ck("มี selected palace block", has("วังที่ผู้ใช้เลือก · Selected Palace"));
ck("กติกาวังนี้ต้องเริ่มจากวังที่เลือก", has("ให้เริ่มจากวังที่ผู้ใช้เลือกนี้ก่อน"));
ck("อธิบายทิศจากประตูดาวเทพก้าน flags", has("ประตู + ดาว + เทพ + ก้าน + flags/source flags"));

console.log("[#3 no stale full-book wiring]");
ck("ไม่ใช้ data/library/qmdj ใน route", !has("data/library/qmdj"));
ck("ไม่คาดหวัง yanbo full book", !has("yanbo-diaosou-ge.md"));
ck("ไม่คาดหวัง tongzong clean full book", !has("qimen-tongzong-clean.md"));
ck("ไม่คาดหวัง dunjia yanyi full book", !has("dunjia-yanyi-juan2.md"));

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
