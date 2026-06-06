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

function assertBlockHas(block: string, text: string, label: string) {
  assert(block.includes(text), `missing ${label}: ${text}`);
}

function assertBlockNotHas(block: string, text: string, label: string) {
  assert(!block.includes(text), `unexpected ${label}: ${text}`);
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
const quickRead = functionBlock("buildQuickReadHtml");
const stemContext = functionBlock("qimenStemIsContextOnly");
const stemDetail = functionBlock("buildStemResponseHtml");
const p0Detail = functionBlock("buildP0SourceTraceHtml");
const detail = functionBlock("renderCurrentDetail");
const context = functionBlock("renderQimenContext");
const palaceExtra = functionBlock("buildPalaceExtraHtml");

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
assertHas("const BRANCH_TH", "Thai earthly-branch display dictionary");
assertHas("const STEM_TH", "Thai heavenly-stem display dictionary");
assertHas("const XIU_TH", "Thai 28 mansions display dictionary");
assertHas("function qmBranchLabel", "Thai-first branch label helper");
assertHas("function qmBranchList", "Thai-first branch list helper");
assertHas("function qmStemLabel", "Thai-first stem label helper");
assertHas("function qmPillarDisplay", "Thai-first four-pillar display helper");
assertHas("function qmXiuDisplay", "Thai-first 28 mansions display helper");
assertHas("เสือ", "Thai branch learner label");
assertHas("ไฟหยาง", "Thai stem learner label");
assertHas("XIU_TH[raw] ? `ดาว${XIU_TH[raw]}`", "Thai mansion learner label formatter");
assertBlockHas(context, "qmPillarDisplay(p)", "four-pillar strip uses Thai-first display helper");
assertBlockHas(context, "qmBranchList(chart?.voids?.day", "context void day uses Thai-first branch list");
assertBlockHas(context, "qmBranchLabel(chart?.sky_horse?.day?.branch", "context sky horse uses Thai-first branch label");
assertBlockHas(context, "qmBranchList(chart?.nobleman?.day?.branches", "context nobleman uses Thai-first branch list");
assertBlockHas(context, "qmBranchLabel(chart?.clash?.day?.branch", "context clash uses Thai-first branch label");
assertBlockHas(context, "qmXiuDisplay(xiu)", "context 28 mansions uses Thai-first mansion helper");
assertBlockHas(palaceExtra, "qmBranchList(chart.voids?.day", "detail void uses Thai-first branch list");
assertBlockHas(palaceExtra, "qmBranchLabel(chart.sky_horse?.day?.branch", "detail sky horse uses Thai-first branch label");
assertBlockHas(palaceExtra, "qmBranchList(chart.nobleman?.day?.branches", "detail nobleman uses Thai-first branch list");
assertBlockHas(palaceExtra, "qmBranchLabel(chart.clash?.day?.branch", "detail clash uses Thai-first branch label");
assertBlockNotHas(renderPalaces, "qmBranchLabel(", "palace grid must not use long Thai branch labels");
assertBlockNotHas(renderPalaces, "qmPillarDisplay(", "palace grid must not render four-pillar text");
assertHas("function qimenStemIsContextOnly", "stem context-only helper exists");
assertBlockHas(stemContext, "engine_readiness?.stem_response_policy === 'context_only'", "stem helper respects engine readiness policy");
assertHas("function qimenStemContextOnlyText", "stem context-only Thai fallback helper exists");
assertHas("function qimenNormalizeCheckNextItem", "frontend normalizes stale context-only check_next copy");
assertHas("function qimenCheckNextItems", "frontend wraps check_next rendering");
assertBlockHas(quickRead, "const stemResponse = p?.stem_response || null", "quick read keeps real stem_response object");
assertBlockNotHas(quickRead, "p?.stem_response?.is_source_governed", "quick read must not hide existing non-source-governed stem_response");
assertBlockHas(quickRead, "qimenStemIsContextOnly(stemResponse)", "quick read uses context-only stem branch");
assertBlockHas(quickRead, "stemResponse.title_th || stemResponse.status_th", "quick read renders stem title/status Thai-first");
assertBlockHas(quickRead, "stemResponse.beginner_th || stemResponse.status_th", "quick read renders beginner/status Thai-first");
assertBlockHas(quickRead, "stemResponse.caveat_th", "quick read renders stem caveat when stem_response exists");
assertBlockHas(guide, "qimenCheckNextItems(reading, p)", "reading guide uses normalized check_next copy");
assertBlockHas(stemDetail, "r.caveat_th ||", "stem detail keeps caveat Thai-first");
assertBlockHas(stemDetail, "const isContext = qimenStemIsContextOnly(r)", "stem detail detects context-only stem");
assertBlockHas(stemDetail, "const cls = isContext ? 'warn'", "context-only stem card is visually warned");
assertBlockHas(stemDetail, "อ่านประกอบเท่านั้น <span class=\"tc\">不作斷</span>", "context-only stem status is explicit");
assertBlockHas(stemDetail, "ไม่ใช่คำตัดสินดีร้าย", "context-only stem says not a verdict");
assertBlockHas(stemDetail, "Array.isArray(r.source_trace) ? r.source_trace : (Array.isArray(r.source_refs) ? r.source_refs : [])", "stem detail accepts source_trace and source_refs");
assertHas("function buildStemReadinessHtml", "stem readiness pro detail helper");
assertHas("สถานะสูตรของก้าน · 公式狀態", "stem readiness pro summary is Thai-first");
assertHas("ใช้ฟันธง: ไม่ได้", "stem readiness verdict disabled copy");
assertHas("qimenScoreLevelText(p)", "localized score level formatter");
assertHas("ตัวตรวจคลาสสิก", "Thai source key label");
assertHas("สัญญาณเสริมระบบ", "Thai p0 flag source label");
assertHas("const src = item.source_label_th || qmTraceSourceLabel(item) || qmSourceLabel(item)", "Thai source key label wins and raw source ids stay hidden");
assertHas("function qimenStemSourceLabel", "stem source label helper exists");
assertHas("return 'ตำราก้านฟ้า'", "stem source fallback is Thai learner copy");
assertHas("function qimenFormationLabel", "formation label helper exists");
assertHas("function qimenFormationScopeLabel", "formation scope helper exists");
assertNotHas("f.name_th || f.formation_code", "raw formation code as Thai name fallback");
assertNotHas("f.name_zh || f.formation_code", "raw formation code as Chinese name fallback");
assertNotHas("const scope = f.scope ?", "raw formation scope display");
assertHas("title=\"ม้าเดินทาง · 驛馬\"", "horse marker tooltip is Thai-first");
assertHas("title=\"ช่องว่าง · 空亡\"", "void marker tooltip is Thai-first");
assertNotHas("|| code || 'P0'", "grid badge short label must not fall back to raw code");
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
assertHas("function qimenTraceIsContextOnly", "context-only trace helper");
assertHas("item?.verdict_allowed === false", "frontend respects verdict_allowed=false");
assertHas("!includeContext && qimenTraceIsContextOnly(item)", "quick/grid skip context-only trace");
assertHas("p?.p0_flags_verdict_allowed !== false", "quick/grid do not fall back to disabled p0_flags");
assertHas("qimenP0SignalsForPalace(p, last, { includeContext: true })", "pro detail can still show context-only trace");
assertHas("function qimenFormationIsContextOnly", "context-only formation helper");
assertHas("!qimenFormationIsContextOnly(f)", "grid skips context-only formations");
assertHas("const isContext = qimenFormationIsContextOnly(f)", "formation list detects context-only rows");
assertHas("const color = isContext ? 'var(--fg-faint)'", "formation list neutralizes context-only color");
assertHas("rawNote || 'ใช้ดูเป็นข้อมูลประกอบเท่านั้น'", "formation list has context-only fallback note");
assertHas("อ่านประกอบเท่านั้น", "detail labels context-only formations as context");
assertBlockHas(p0Detail, "const isContext = qimenTraceIsContextOnly(item)", "P0 detail detects context-only trace");
assertBlockHas(p0Detail, "const toneTh = isContext ? 'อ่านประกอบเท่านั้น'", "P0 detail labels context-only trace clearly");
assertHas("ประตูนำ · 值使", "user-visible zhi-shi uses 值使");
assertNotHas("ประตูนำ(使=直使)", "old visible zhi-shi legend");
assertNotHas("Lead Door (直使)", "old English visible zhi-shi legend");
assertNotHas("使 = 直使", "old Chinese visible zhi-shi legend");
assertNotHas("直使", "old incorrect zhi-shi glyph");
assertNotHas("直符", "old incorrect zhi-fu glyph");
assertBlockHas(detail, "ประตูนำ <span class=\"tc\" style=\"color:inherit\">值使</span>", "detail zhi-shi marker is Thai-first");
assertBlockHas(detail, "ดาวนำ <span class=\"tc\" style=\"color:inherit\">值符</span>", "detail zhi-fu marker is Thai-first");
assertBlockHas(detail, "รายละเอียดวัง · 詳", "detail heading is Thai-first");
assertBlockHas(detail, "ฟ้า <span class=\"tc\">", "heaven stem row is Thai-first");
assertBlockHas(detail, "ดิน <span class=\"tc\">", "earth stem row is Thai-first");
assertNotHas("ยังไม่มีคำตัดสินจากตำราในระบบ", "old stem fallback hides context-only API copy");

for (const text of ["สถานะอ่านเร็ว", "ต้องเช็กต่อ", "คะแนนระบบ", "อ่านวังนี้แบบง่าย", "beginner_reading"]) {
  assert(!renderPalaces.includes(text), `renderPalaces should not include long detail text: ${text}`);
}

assert(!sourceLabel.includes("file_path"), "qmSourceLabel must not expose file_path");
for (const mutation of ["p.score =", "p.display_score =", "p.beginner_reading =", "last.palaces =", "last.chart ="]) {
  assert(!guide.includes(mutation), `detail guide must not mutate payload: ${mutation}`);
}

console.log(`PASS qimen detail drawer smoke · inline scripts parsed ${scripts.length}`);
