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
const termGuide = functionBlock("buildPalaceTermGuideHtml");
const chartContextDetail = functionBlock("buildChartContextDetailHtml");
const chartContextDetailBody = chartContextDetail.split("/* ─")[0];
const branchTokens = functionBlock("qmBranchTokens");
const branchDisplay = functionBlock("qmBranchDisplay");
const branchValues = functionBlock("qmBranchValues");
const palaceHasBranch = functionBlock("palaceHasAnyBranch");
const verdictStart = detail.indexOf('<div class="verdict-card');
assert(verdictStart >= 0, "missing verdict card block");
const verdictEnd = detail.indexOf('<div class="detail-row">', verdictStart);
const verdictCard = detail.slice(verdictStart, verdictEnd >= 0 ? verdictEnd : detail.length);

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
assertHas("function qmBranchDisplay", "Thai-first branch fallback display helper");
assertHas("function qmStemLabel", "Thai-first stem label helper");
assertHas("function qmPillarDisplay", "Thai-first four-pillar display helper");
assertHas("function qmXiuDisplay", "Thai-first 28 mansions display helper");
assertHas("function qmBriefThaiText", "Thai brief text helper exists");
assertHas("function buildPalaceTermGuideHtml", "main layer term guide helper exists");
assertHas("อ่านสามชั้นหลัก · 門星神", "main layer guide title is Thai-first");
assertHas("คำอธิบายเต็มของสามชั้น · 全文", "main layer full text is tucked into details");
assertHas("บทบาทประตู <span class=\"tc\">門用</span>", "main layer full text keeps door role");
assertHas("วิธีใช้ประตู <span class=\"tc\">門法</span>", "main layer full text keeps door action advice");
assertHas("คำแนะนำเทพ <span class=\"tc\">神用</span>", "main layer full text keeps deity advice");
assertHas("ประตูบอกทางของเรื่อง ดาวบอกแรงของงาน เทพบอกคน/กลยุทธ์", "main layer caveat explains roles plainly");
assertHas("function buildChartContextDetailHtml", "chart context detail helper exists");
assertHas("บริบทเวลาของผังนี้ · 全盤時間", "chart context detail title is Thai-first");
assertHas("วัน/ยามปะทะ 日時沖", "context clash label uses traditional Chinese");
assertHas("ปะทะ <span class=\"tc\">沖</span>", "detail clash label uses traditional Chinese");
assertHas("title=\"ปะทะ 沖\"", "grid clash tooltip uses traditional Chinese");
assertHas("เสือ", "Thai branch learner label");
assertHas("ไฟหยาง", "Thai stem learner label");
assertHas("XIU_TH[raw] ? `ดาว${XIU_TH[raw]}`", "Thai mansion learner label formatter");
assertBlockHas(branchTokens, "v.branch_zh, v.branch, v.branches_zh", "branch tokens read explicit object branch keys only");
assertBlockHas(branchTokens, "v.branches_zh, v.branches, v.branch_codes, v.void_zh", "branch tokens read explicit object branch arrays only");
assertBlockNotHas(branchTokens, "v.zh, v.code", "branch tokens must not parse generic object zh/code fields");
assertBlockHas(branchDisplay, "const label = qmBranchList(value)", "branch display normalizes each candidate");
assertBlockHas(branchDisplay, "if (label) return label", "branch display falls through when direct value has no branch token");
assertBlockHas(branchDisplay, "return ''", "branch display returns blank instead of raw unknown value");
assertBlockHas(branchValues, "return qmBranchTokens(source)", "branch matching shares explicit object parsing with display");
assertBlockHas(palaceHasBranch, "const want = new Set(qmBranchValues(branches))", "branch matching normalizes nested fallback candidates");
assertBlockHas(context, "qmPillarDisplay(p)", "four-pillar strip uses Thai-first display helper");
assertBlockHas(context, "qmBranchDisplay(chart?.voids?.day, chart?.void_day_zh, chart?.voidDayZh)", "context void day uses fallback branch display");
assertBlockHas(context, "qmBranchDisplay(chart?.sky_horse?.day?.branch, chart?.skyHorse?.day?.branch, chart?.traveling_horse_day_zh, chart?.traveling_horse_zh)", "context sky horse uses fallback branch display");
assertBlockHas(context, "qmBranchDisplay(chart?.nobleman?.day?.branches, chart?.nobleman_day_zh)", "context nobleman uses fallback branch display");
assertBlockHas(context, "qmBranchDisplay(chart?.clash?.day?.branch, chart?.day_clash_zh)", "context clash uses fallback branch display");
assertBlockHas(context, "qmXiuDisplay(xiu)", "context 28 mansions uses Thai-first mansion helper");
assertBlockHas(palaceExtra, "qmBranchDisplay(chart.voids?.day, chart.void_day_zh, chart.voidDayZh)", "detail void uses fallback branch display");
assertBlockHas(palaceExtra, "qmBranchDisplay(chart.sky_horse?.day?.branch, chart.skyHorse?.day?.branch, chart.traveling_horse_day_zh)", "detail sky horse uses fallback branch display");
assertBlockHas(palaceExtra, "qmBranchDisplay(chart.nobleman?.day?.branches, chart.nobleman_day_zh)", "detail nobleman uses fallback branch display");
assertBlockHas(palaceExtra, "palaceHasAnyBranch(p, [chart.nobleman?.day?.branches, chart.nobleman_day_zh])", "detail nobleman match does not let empty direct arrays suppress fallback");
assertBlockHas(palaceExtra, "qmBranchDisplay(chart.clash?.day?.branch, chart.day_clash_zh)", "detail clash uses fallback branch display");
assertBlockHas(termGuide, "p?.door_situation_role_th", "term guide reads door situation role Thai");
assertBlockHas(termGuide, "p?.door_action_advice_th", "term guide reads door action advice Thai");
assertBlockHas(termGuide, "p?.door_description_th", "term guide reads door description Thai as fallback/full text");
assertBlockHas(termGuide, "p?.star_description_th", "term guide reads star description Thai");
assertBlockHas(termGuide, "p?.deity_advice_th", "term guide reads deity advice Thai");
assertBlockHas(termGuide, "p?.deity_description_th", "term guide keeps deity full text in details");
assertBlockHas(termGuide, "nameTh ? qmEsc(nameTh) : ''", "term guide escapes Thai term names");
assertBlockHas(termGuide, "qmBriefThaiText(x, 118)", "term guide bounds long prose");
assertBlockHas(termGuide, "qmEsc(", "term guide escapes payload text");
assertBlockNotHas(termGuide, "door_code", "term guide must not use door code as prose fallback");
assertBlockNotHas(termGuide, "star_code", "term guide must not use star code as prose fallback");
assertBlockNotHas(termGuide, "deity_code", "term guide must not use deity code as prose fallback");
assertBlockHas(chartContextDetail, "const chart = last?.chart || {}", "chart context detail reads chart from last packet");
assertBlockHas(chartContextDetail, "qmPillarDisplay(p)", "chart context detail renders four pillars with Thai-first helper");
assertBlockHas(chartContextDetail, "qmBranchDisplay(chart.voids?.day, chart.void_day_zh, chart.voidDayZh)", "chart context detail void day uses fallback branch display");
assertBlockHas(chartContextDetail, "qmBranchDisplay(chart.sky_horse?.day?.branch, chart.skyHorse?.day?.branch, chart.traveling_horse_day_zh, chart.traveling_horse_zh)", "chart context detail sky horse uses fallback branch display");
assertBlockHas(chartContextDetail, "qmBranchDisplay(chart.nobleman?.day?.branches, chart.nobleman_day_zh)", "chart context detail nobleman uses fallback branch display");
assertBlockHas(chartContextDetail, "qmBranchDisplay(chart.clash?.day?.branch, chart.day_clash_zh)", "chart context detail clash uses fallback branch display");
assertBlockHas(chartContextDetail, "chart.twenty_eight || chart.twentyEight || chart.xiu", "chart context detail supports 28 mansion aliases");
assertBlockHas(chartContextDetail, "qmXiuDisplay(xiu)", "chart context detail renders 28 mansions with Thai-first helper");
assertBlockHas(chartContextDetail, "ไม่ใช่คำตัดสินเฉพาะวังนี้", "chart context detail caveat keeps chart context separate from palace verdict");
assertBlockHas(detail, "quickHtml + buildPalaceTermGuideHtml(p) + buildPalaceReadingGuideHtml", "detail shows main layer guide immediately after quick read");
assertBlockHas(detail, "buildChartContextDetailHtml(last) + buildPalaceExtraHtml(p, last)", "detail shows chart context before palace-specific markers");
assertBlockNotHas(detail, "const engineWhy =", "detail no longer builds long engineWhy for verdict card");
assertBlockHas(detail, "const doorRole  = p.door_situation_role_th || ''", "detail use row only reads intended Thai door role");
assertBlockNotHas(detail, "pick('door_zh',   'door_situation_role')", "detail use row must not fall back to door zh for prose");
assertBlockNotHas(verdictCard, "engineWhy", "verdict card must not render multiline door/star/deity explanations");
assertBlockNotHas(verdictCard, "doorDesc", "verdict card must not render door description");
assertBlockNotHas(verdictCard, "starDesc", "verdict card must not render star description");
assertBlockNotHas(verdictCard, "deityAdv", "verdict card must not render deity advice");
assertBlockNotHas(verdictCard, "white-space:pre-line", "verdict card must not render multiline engine prose");
assertHas("qmBranchDisplay(chart.voids?.hour, chart.void_hour_zh, chart.voidHourZh, chart.voids?.day, chart.void_day_zh, chart.voidDayZh)", "top void pill uses direct packet fields before fallback branch display");
assertBlockNotHas(renderPalaces, "qmBranchLabel(", "palace grid must not use long Thai branch labels");
assertBlockNotHas(renderPalaces, "qmBranchDisplay(", "palace grid must not use long fallback branch labels");
assertBlockNotHas(renderPalaces, "qmPillarDisplay(", "palace grid must not render four-pillar text");
assertBlockNotHas(renderPalaces, "buildChartContextDetailHtml(", "palace grid must not render chart context detail");
assertBlockNotHas(renderPalaces, "buildPalaceExtraHtml(", "palace grid must not render palace extra detail");
assertBlockNotHas(renderPalaces, "buildPalaceTermGuideHtml(", "palace grid must not render main layer term guide");
assertBlockNotHas(renderPalaces, "buildQuickReadHtml(", "palace grid must not render quick read detail");
assertBlockNotHas(renderPalaces, "buildPalaceReadingGuideHtml(", "palace grid must not render reading guide detail");
assertBlockNotHas(renderPalaces, "buildP0SourceTraceHtml(", "palace grid must not render source trace detail");
assertBlockNotHas(renderPalaces, "buildStemResponseHtml(", "palace grid must not render stem response detail");
assertBlockNotHas(renderPalaces, "door_description", "palace grid must not render long door descriptions");
assertBlockNotHas(renderPalaces, "star_description", "palace grid must not render long star descriptions");
assertBlockNotHas(renderPalaces, "deity_advice", "palace grid must not render long deity advice");
assertBlockNotHas(renderPalaces, "door_action_advice", "palace grid must not render long door action advice");
assertBlockNotHas(renderPalaces, "door_situation_role", "palace grid must not render long door role");
assertBlockNotHas(renderPalaces, "stem_combo_description", "palace grid must not render long stem combo description");
assertBlockNotHas(renderPalaces, "door_description_th", "palace grid must not render Thai door descriptions");
assertBlockNotHas(renderPalaces, "star_description_th", "palace grid must not render Thai star descriptions");
assertBlockNotHas(renderPalaces, "deity_advice_th", "palace grid must not render Thai deity advice");
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
assertNotHas("วัน/ยามปะทะ 日時冲", "old simplified clash label");
assertNotHas("title=\"ปะทะ 冲\"", "old simplified clash tooltip");
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
  assert(!termGuide.includes(mutation), `term guide must not mutate payload: ${mutation}`);
  assert(!chartContextDetailBody.includes(mutation), `chart context detail must not mutate payload: ${mutation}`);
  assert(!palaceExtra.includes(mutation), `palace extra detail must not mutate payload: ${mutation}`);
}
for (const forbidden of ["fetch(", "/api/qimen", "/api/chart", "XMLHttpRequest", "sendBeacon", "window._qimenLast ="]) {
  assert(!termGuide.includes(forbidden), `term guide must stay display-only: ${forbidden}`);
  assert(!chartContextDetailBody.includes(forbidden), `chart context detail must stay display-only: ${forbidden}`);
  assert(!palaceExtra.includes(forbidden), `palace extra detail must stay display-only: ${forbidden}`);
}

console.log(`PASS qimen detail drawer smoke · inline scripts parsed ${scripts.length}`);
