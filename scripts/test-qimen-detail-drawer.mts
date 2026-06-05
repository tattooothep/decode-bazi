import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const html = readFileSync(join(root, "public/qimen.html"), "utf8");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertHas(text: string, label: string) {
  assert(html.includes(text), `missing ${label}: ${text}`);
}

function assertNotHas(text: string, label: string) {
  assert(!html.includes(text), `unexpected ${label}: ${text}`);
}

function functionBlock(name: string): string {
  const start = html.indexOf(`function ${name}`);
  assert(start >= 0, `missing function ${name}`);
  const next = html.indexOf("\n  function ", start + 1);
  return html.slice(start, next >= 0 ? next : html.length);
}

const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1] || "");
for (const [i, code] of scripts.entries()) {
  try {
    new Function(code);
  } catch (error: any) {
    throw new Error(`public/qimen.html inline script #${i + 1} failed: ${error?.message || error}`);
  }
}

const guide = functionBlock("buildPalaceReadingGuideHtml");
const guideHtml = guide.slice(guide.indexOf("อ่านวังนี้แบบง่าย"));
const renderPalaces = functionBlock("renderPalaces");
const sourceLabel = functionBlock("qmSourceLabel");

const order = [
  "สถานะอ่านเร็ว",
  "เพราะอะไร",
  "${nextRows}",
  "คะแนนระบบ",
  "ลำดับอ่าน",
  "ตรงคำถามไหม",
  "หมายเหตุ",
].map((text) => guideHtml.indexOf(text));
assert(order.every((n) => n >= 0), "detail guide order labels missing");
assert(order.every((n, i) => i === 0 || n > order[i - 1]), "detail guide labels are not in the expected order");

assertHas("อ่านวังนี้แบบง่าย · 入門", "beginner detail card heading");
assertHas("ระบบยังไม่มีป้ายอ่านเร็วที่ยืนยันได้", "human fallback copy");
assertHas("รอข้อมูลระบบก่อนใช้เป็นคำแนะนำ", "human check-next fallback");
assertHas("ยังไม่มีคะแนนรวมจากระบบ", "system-score fallback");
assertHas("ไม่แก้คะแนนจริง", "no score mutation copy");
assertHas("ระบบยังไม่รองรับ · รอ v2", "human disabled-school title");
assertHas("ตัวตรวจที่ระบบส่งมา", "human source-trace note");
assertHas("คะแนนระบบ · 分", "Thai-first score label");
assertHas("System score · 分", "English score label");
assertHas("系統評分", "Chinese score label");
assertHas("ยังไม่พบสัญญาณหนัก", "Thai signal fallback");
assertHas("สัญญาณเสริมต่อ", "Thai signal follow-up copy");
assertHas("ระบบหาวังที่เลือกหมายเลข", "Thai palace missing copy");
assertHas("ก้านฟ้า ${p?.heaven_stem_zh", "Thai-first stem fallback");
assertHas("qimenScoreLevelText(p)", "localized score level formatter");
assertHas("ตัวตรวจคลาสสิก", "Thai source key label");
assertHas("สัญญาณเสริมระบบ", "Thai p0 flag source label");
assertHas("const src = item.source_label_th || qmTraceSourceLabel(item) || qmSourceLabel(item)", "Thai source key label wins and raw source ids stay hidden");
assertHas("function qimenStemSourceLabel", "stem source label helper exists");
assertHas("return 'ตำราก้านฟ้า'", "stem source fallback is Thai learner copy");
assertHas("function qimenThaiWarning", "raw warning flags are converted to Thai learner copy");
assertHas("bad|avoid|inauspicious", "negative score levels checked first");
assertHas("q.includes('bad') || q.includes('inauspicious')", "negative formation quality checked first");
assertHas("s.includes('bad') || s.includes('inauspicious')", "negative quality normalization checked first");
assertHas("s.includes('hard') || s.includes('inauspicious')", "negative trace tone checked before auspicious");
assertHas("overflow-wrap:anywhere", "mobile wrapping guard");
assertHas("slice(0, 3)", "bounded reasons/source rows");
assertHas("slice(0, 2)", "bounded check-next rows");

assertNotHas("คะแนนจาก engine", "old Thai engine score copy");
assertNotHas("ยังไม่มีคะแนนรวมจาก engine", "old no-score copy");
assertNotHas("API ยังไม่ส่ง", "old API fallback copy");
assertNotHas("รอข้อมูล beginner_reading จาก engine", "old technical fallback copy");
assertNotHas("ยังไม่มีเหตุผลจาก engine", "old engine reason fallback");
assertNotHas("engine ยังไม่รองรับ", "old disabled-school title");
assertNotHas("API ส่งมา", "old source-trace note");
assertNotHas("ยังไม่พบ flag หนัก", "raw flag fallback copy");
assertNotHas("flags ต่อ", "raw flags follow-up copy");
assertNotHas("flags อื่น", "raw flags caveat copy");
assertNotHas("ระบบหา palace_id", "raw palace id missing copy");
assertNotHas("qmEsc(p.display_level)", "raw display level output");
assertNotHas("title = [label.th, label.zh, item._source_key]", "raw source key tooltip");
assertNotHas("source_refs || item?._source_key", "raw source key fallback");
assertNotHas("|| 'source'", "raw source fallback");
assertNotHas("s.source_id || s.title_zh", "raw stem source id fallback");
assertNotHas("item?.source || item?.source_ref || item?.source_id", "raw source id fallback");
assertNotHas("item.note || item.reason", "raw P0 note/reason fallback");
assertNotHas("r.label_th || r.kind", "raw yongshen kind fallback");

for (const text of ["สถานะอ่านเร็ว", "ต้องเช็กต่อ", "คะแนนระบบ", "อ่านวังนี้แบบง่าย", "beginner_reading"]) {
  assert(!renderPalaces.includes(text), `renderPalaces should not include long detail text: ${text}`);
}

assert(!sourceLabel.includes("file_path"), "qmSourceLabel must not expose file_path");
for (const mutation of ["p.score =", "p.display_score =", "p.beginner_reading =", "last.palaces =", "last.chart ="]) {
  assert(!guide.includes(mutation), `detail guide must not mutate payload: ${mutation}`);
}

console.log(`PASS qimen detail drawer smoke · inline scripts parsed ${scripts.length}`);
