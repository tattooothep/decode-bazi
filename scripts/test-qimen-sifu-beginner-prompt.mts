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
assertHas("source flags", "bounded source flags line");
assertHas("ห้ามแนะนำให้ใช้ทิศนั้นเป็นตัวหลัก", "non-actionable answer guard");
assertHas("ห้ามแก้คะแนน", "no score mutation answer guard");
assertHas("ประตู + ดาว + เทพ + ก้าน + flags/source flags", "real palace evidence guard");
assertHas("sourceRefText", "source ref sanitizer");
assertHas("replace(/\\\\/g, \"/\")", "source path backslash sanitizer");
assertHas("compact.split(\"/\").pop()", "source path basename sanitizer");
assertHas("slice(0, 3)", "bounded source/reason output");

assertNotHas("file_path", "internal path leak in formatter");

console.log("PASS qimen-sifu beginner prompt wire");
