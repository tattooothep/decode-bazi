import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const route = readFileSync(join(root, "src/app/api/qimen/sifu/route.ts"), "utf8");

function assertHas(needle: string, label: string) {
  if (!route.includes(needle)) {
    throw new Error(`missing ${label}: ${needle}`);
  }
}

function assertNotHas(needle: string, label: string) {
  if (route.includes(needle)) {
    throw new Error(`unexpected ${label}: ${needle}`);
  }
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

assertHas("function formatBeginnerReading", "beginner formatter");
assertHas("beginner_reading", "engine beginner_reading payload");
assertHas("สถานะอ่านเร็ว 入門", "Thai-first beginner status");
assertHas("เพราะอะไร", "Thai reasons line");
assertHas("ต้องเช็กต่อ", "check-next line");
assertHas("นโยบายอ่านเร็ว 入門", "Thai beginner coverage line");
assertHas("ใช้เป็นตัวหลักไม่ได้", "non-actionable Thai policy");
assertHas("is_actionable=false", "actionability guard");
assertHas("has_engine_score=false", "engine-score guard");
assertHas("no_score_mutation", "score mutation policy");
assertHas("guard fields: is_actionable=${actionField}; has_engine_score=${scoreField}; no_score_mutation=${mutationField}", "palace formatter field guards");
assertHas("guard fields: is_actionable=false; has_engine_score=false; no_score_mutation=yes", "fallback field guards");
assertHas("qimen_trace", "source trace payload");
assertHas("classical_flags", "classical flags payload");
assertHas("สัญญาณแหล่งอ้างอิง", "bounded Thai source flags line");
assertHas("ห้ามแนะนำให้ใช้ทิศนั้นเป็นตัวหลัก", "non-actionable answer guard");
assertHas("ห้ามแก้คะแนน", "no score mutation answer guard");
assertHas("ประตู + ดาว + เทพ + ก้าน + flags/source flags", "real palace evidence guard");
assertHas("Engine packet คือ source of truth", "engine packet source-of-truth header");
assertHas("อ่านจาก \"ผังเวลา (QiMen Chart)\" ก่อนเสมอ", "answer guard says chart first");
assertHas("source packet มีไว้แปลความหมาย ไม่ใช่สร้างค่าผังใหม่", "source packet caveat");
assertHas("function selectedPalaceIdFromPayload", "selected palace payload helper");
assertHas("วังที่ผู้ใช้เลือก · Selected Palace", "selected palace block");
assertHas("ให้เริ่มจากวังที่ผู้ใช้เลือกนี้ก่อน", "selected palace answer contract");
assertHas("formatPalaceLine(selectedPalace", "selected palace uses real palace formatter");
assertHas("labelThZh(p.door_name_th", "door evidence included");
assertHas("labelThZh(p.star_name_th", "star evidence included");
assertHas("labelThZh(p.deity_name_th", "deity evidence included");
assertHas("ก้านฟ้า ${p.heaven_stem_zh", "heaven stem evidence included");
assertHas("ก้านดิน ${p.earth_stem_zh", "earth stem evidence included");
assertHas("formatStemResponse(p.stem_response)", "stem response evidence included");
assertHas("formatPalaceSourceFlags(p)", "source flags evidence included");
assertHas("qimenToneThai", "Thai tone mapper");
assertHas("qimenConfidenceThai", "Thai confidence mapper");
assertHas("const toneRaw = r.tone || r.kind", "beginner reason reads raw tone only as input");
assertHas("ระดับ: ${qimenToneThai(toneRaw)}", "beginner reason tone passes through Thai mapper");
assertHas("const level = qimenToneThai(p.display_level", "display level passes through Thai mapper");
assertHas("ระดับระบบ ${level}", "raw display level not rendered directly");
assertHas("sourceRefText", "source ref sanitizer");
assertHas("replace(/\\\\/g, \"/\")", "source path backslash sanitizer");
assertHas("compact.split(\"/\").pop()", "source path basename sanitizer");
assertHas("slice(0, 3)", "bounded source/reason output");
assertHas("ผังเวลา (QiMen Chart):", "chart block label");
assertHas("แหล่งความรู้ฉีเหมิน", "source packet label");
assertHas("ผังเวลา (QiMen Chart):\\n${qimenText}\\n${canonBlock}", "prompt body places chart before source packet");

assertNotHas("file_path", "internal path leak in formatter");
assertNotHas("source=${", "raw source equals formatter");
assertNotHas("confidence=${", "raw confidence equals formatter");
assertNotHas("chart_source=", "raw chart source key");
assertNotHas("system_type=${systemType}", "raw system_type key");
assertNotHas("flags: ${flags}", "raw flags label");
assertNotHas("full81=${", "raw boolean full81 marker");
assertNotHas("[r.kind, r.tone].filter(Boolean).join(\"/\")", "raw kind/tone join");

console.log("PASS qimen-sifu beginner prompt wire");
