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

function functionBlockExact(signature: string): string {
  const start = html.indexOf(`function ${signature}`);
  assert(start >= 0, `missing function ${signature}`);
  const next = html.indexOf("\n  function ", start + 1);
  return html.slice(start, next >= 0 ? next : html.length);
}

function sourceSlice(startText: string, endText: string): string {
  const start = html.indexOf(startText);
  assert(start >= 0, `missing source slice start: ${startText}`);
  const end = html.indexOf(endText, start);
  assert(end > start, `missing source slice end: ${endText}`);
  return html.slice(start, end);
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
const guideHtml = guide.slice(guide.indexOf("แนวอ่านวังที่เลือก"));
const renderPalaces = functionBlock("renderPalaces");
const renderFormations = functionBlock("renderFormations");
const sourceLabel = functionBlock("qmSourceLabel");
const formationLabel = functionBlock("qimenFormationLabel");
const quickRead = functionBlock("buildQuickReadHtml");
const stemContext = functionBlock("qimenStemIsContextOnly");
const stemDetail = functionBlock("buildStemResponseHtml");
const p0Detail = functionBlock("buildP0SourceTraceHtml");
const leadPalaceRole = functionBlock("buildLeadPalaceRoleHtml");
const leadPolicy = functionBlock("qimenLeadPolicy");
const displayFushi = functionBlock("qimenDisplayFushi");
const qimenSystemInfoBlock = sourceSlice("const QIMEN_SYSTEM_INFO", "function qimenAlgorithmLabel");
const detail = functionBlock("renderCurrentDetail");
const beginnerReading = functionBlock("qimenBeginnerReading");
const usageAdvice = functionBlock("buildPalaceUsageAdviceHtml");
const chartContextGuard = functionBlock("qimenChartContextGuard");
const applyChartContextGuard = functionBlock("qimenApplyChartContextGuard");
const beginnerVerdict = functionBlock("qimenBeginnerVerdictClass");
const beginnerContextOnly = functionBlock("qimenBeginnerIsContextOnly");
const beginnerLabel = functionBlock("qimenBeginnerVerdictLabel");
const normalizeSystemType = functionBlock("normalizeQimenSystemType");
const beginnerFlags = functionBlock("qimenBeginnerFlags");
const context = functionBlock("renderQimenContext");
const palaceExtra = functionBlock("buildPalaceExtraHtml");
const yongshenHtml = functionBlock("buildYongshenHtml");
const formationScope = functionBlock("qimenFormationScopeLabel");
const reasonLabel = functionBlock("qimenReasonLabel");
const termGuide = functionBlock("buildPalaceTermGuideHtml");
const contextPairRow = functionBlock("qimenContextPairRow");
const evidenceLayerLabel = functionBlock("qimenEvidenceLayerLabel");
const flagBranchEvidenceParts = functionBlock("qimenUiFlagBranchEvidenceParts");
const evidenceSourceLabel = functionBlock("qimenEvidenceSourceLabel");
const flagFormulaEvidenceParts = functionBlock("qimenUiFlagFormulaEvidenceParts");
const selectedSignalEvidence = functionBlock("qimenSelectedPalaceSignalEvidence");
const chartContextDetail = functionBlock("buildChartContextDetailHtml");
const chartReadinessNotice = functionBlock("buildChartReadinessNoticeHtml");
const lineageDetail = functionBlock("buildQimenLineageHtml");
const classicalCoverageDetail = functionBlock("buildQimenClassicalCoverageHtml");
const formulaEvidenceDetail = functionBlock("buildPalaceFormulaEvidenceHtml");
const advancedLayersDetail = functionBlock("buildAdvancedQimenLayersHtml");
const advancedReadinessDetail = functionBlock("buildAdvancedQimenReadinessHtml");
const advancedLayersForPalace = functionBlock("qimenAdvancedLayersForPalace");
const advancedLayerLabel = functionBlock("qimenAdvancedLayerLabel");
const detailMode = functionBlock("qimenDetailMode");
const detailModeToggle = functionBlock("qimenDetailModeToggleHtml");
const renderHeader = functionBlock("renderHeader");
const showLoadError = functionBlock("showQimenLoadError");
const traceArray = functionBlock("qmTraceArray");
const knownTraceLabel = functionBlock("qimenKnownTraceLabel");
const traceLabel = functionBlock("qmTraceLabel");
const traceTone = functionBlock("qmTraceTone");
const textLooksInternalPath = functionBlock("qmTextLooksInternalPath");
const publicEvidenceText = functionBlock("qmPublicEvidenceText");
const publicRawTokenLooksInternal = functionBlock("qimenPublicRawTokenLooksInternal");
const publicThaiCopy = functionBlock("qimenPublicThaiCopy");
const publicZhCopy = functionBlock("qimenPublicZhCopy");
const publicLineRange = functionBlock("qmPublicLineRange");
const negatedByLabel = functionBlock("qmNegatedByLabel");
const scoreEffectText = functionBlock("qimenScoreEffectText");
const displayP0Signals = functionBlock("qimenDisplayP0SignalsForPalace");
const uiTraceSignals = functionBlock("qimenUiTraceSignalsForPalace");
const stemReadiness = functionBlock("buildStemReadinessHtml");
const hasEngineScore = functionBlock("qimenHasEngineScore");
const scoreLevelLabel = functionBlock("qimenScoreLevelLabel");
const scoreLevelText = functionBlock("qimenScoreLevelText");
const readingScoreCopy = functionBlock("qimenReadingScoreCopy");
const qmEscRuntime = functionBlock("qmEsc");
const termLabel = functionBlock("qimenTermLabel");
const branchTokens = functionBlock("qmBranchTokens");
const branchLabel = functionBlock("qmBranchLabel");
const branchList = functionBlock("qmBranchList");
const stemLabel = functionBlock("qmStemLabel");
const xunDisplay = functionBlock("qmXunDisplay");
const pillarDisplay = functionBlock("qmPillarDisplay");
const uiFlags = functionBlock("qimenUiFlags");
const gridStateDefs = functionBlock("qimenGridStateDefs");
const gridStateMarks = functionBlock("renderQimenGridStateMarks");
const uiFlagConstants = sourceSlice("const QIMEN_UI_FLAG_ALIASES", "function qimenUiFlags");
const hexagramStart = html.indexOf("function qimenHexagramDisplay");
assert(hexagramStart >= 0, "missing function qimenHexagramDisplay");
const hexagramEnd = html.indexOf("\n\n  /* ─", hexagramStart);
assert(hexagramEnd > hexagramStart, "missing qimenHexagramDisplay end marker");
const hexagramDisplay = html.slice(hexagramStart, hexagramEnd);
const chartContextDetailBody = chartContextDetail.split("/* ─")[0];
const branchDisplay = functionBlock("qmBranchDisplay");
const branchValues = functionBlock("qmBranchValues");
const palaceHasBranch = functionBlock("palaceHasAnyBranch");
const uiFlag = functionBlockExact("qimenUiFlag(p, code, legacyFn)");
const uiActiveFlags = functionBlock("qimenUiActiveFlags");
const centerPillar = functionBlock("renderCenterPillarTable");
const applyOverlay = functionBlock("applyOverlay");
const yongshenOverlayForPalace = functionBlock("qimenYongshenOverlayForPalace");
const yongshenOverlayCopy = functionBlock("qimenYongshenOverlayCopy");
const searchTermLabel = functionBlock("qmSearchTermLabel");
const runSearch = functionBlock("runQimenSearch");
const bindSifu = functionBlock("bindSifuPanel");
const verdictStart = detail.indexOf('<div class="verdict-card');
assert(verdictStart >= 0, "missing verdict card block");
const verdictEnd = detail.indexOf('<div class="detail-row">', verdictStart);
const verdictCard = detail.slice(verdictStart, verdictEnd >= 0 ? verdictEnd : detail.length);

const hexagramRuntime = new Function(`
${qmEscRuntime}
${hexagramDisplay}
return { qmEsc, qimenHexagramDisplay };
`)() as {
  qmEsc: (input: unknown) => string;
  qimenHexagramDisplay: (input: Record<string, unknown>) => { html: string; caveat: string; hasValue: boolean };
};
const maliciousHexagram = hexagramRuntime.qimenHexagramDisplay({
  hexagram_code: '7"><img src=x onerror=alert(1)>',
  hexagram_name_th: '<script>alert("th")</script>',
  hexagram_zh: '<svg onload=alert(1)>',
});
const maliciousHexagramSink = `<span class="v">${maliciousHexagram.html} · <small>${hexagramRuntime.qmEsc(maliciousHexagram.caveat)}</small></span>`;
assert(maliciousHexagram.hasValue === true, "hexagram runtime payload should be treated as present engine data");
assert(maliciousHexagram.html.includes("&lt;script&gt;"), "hexagram runtime escapes script tag payload");
assert(maliciousHexagram.html.includes("&lt;svg"), "hexagram runtime escapes svg payload");
assert(maliciousHexagram.html.includes("&quot;&gt;&lt;img"), "hexagram runtime escapes quote/tag injection in code");
assert(!/<(script|img|svg|iframe)\b/i.test(maliciousHexagramSink), "hexagram sink must not contain executable raw tags");
assert(!/<[^>]+\son\w+\s*=/i.test(maliciousHexagramSink), "hexagram sink must not contain executable event attributes");

const beginnerRuntime = new Function(`
${knownTraceLabel}
${textLooksInternalPath}
${publicEvidenceText}
${publicRawTokenLooksInternal}
${publicThaiCopy}
${publicZhCopy}
${hasEngineScore}
${beginnerReading}
${qimenSystemInfoBlock}
${normalizeSystemType}
${chartContextGuard}
${applyChartContextGuard}
${beginnerContextOnly}
${beginnerVerdict}
${scoreLevelLabel}
${scoreLevelText}
${readingScoreCopy}
return { qimenBeginnerReading, qimenChartContextGuard, qimenApplyChartContextGuard, qimenBeginnerVerdictClass, qimenReadingScoreCopy };
`)() as {
  qimenBeginnerReading: (input: Record<string, unknown>) => Record<string, unknown>;
  qimenChartContextGuard: (chart: Record<string, unknown>) => boolean;
  qimenApplyChartContextGuard: (reading: Record<string, unknown>, chart: Record<string, unknown>) => Record<string, unknown>;
  qimenBeginnerVerdictClass: (reading: Record<string, unknown>, fallbackClass?: string) => string;
  qimenReadingScoreCopy: (palace: Record<string, unknown>, reading: Record<string, unknown>, chart: Record<string, unknown>) => Record<string, unknown>;
};
const legacyScoreReading = beginnerRuntime.qimenBeginnerReading({
  display_score: 70,
  beginner_reading: { summary_th: "legacy packet has summary but no code/tone/has_engine_score" },
});
assert(legacyScoreReading.code === "score_only", "legacy beginner_reading with score must not default code to context");
assert(legacyScoreReading.has_engine_score === true, "legacy beginner_reading with score keeps has_engine_score true");
assert(beginnerRuntime.qimenBeginnerVerdictClass(legacyScoreReading, "good") === "good", "legacy beginner_reading with score must keep score fallback verdict");
assert(beginnerRuntime.qimenChartContextGuard({ system_type: "hour" }) === false, "hour chart must not be forced into DMY context guard");
assert(beginnerRuntime.qimenChartContextGuard({ system_type: "hour", dmy_fushi_context: { verdict_allowed: false } }) === false, "hour chart must not be forced into DMY context guard even if stale DMY metadata exists");
assert(beginnerRuntime.qimenChartContextGuard({ system_type: "day", dmy_fushi_context: { verdict_allowed: false } }) === true, "day chart with disabled DMY verdict is context guarded");
assert(beginnerRuntime.qimenChartContextGuard({ chart_type: "day", dmy_fushi_context: { verdict_allowed: false } }) === true, "chart_type day must be context guarded when system_type is missing");
assert(beginnerRuntime.qimenChartContextGuard({ chart_type: "hour", dmy_fushi_context: { verdict_allowed: false } }) === false, "chart_type hour must not be forced into DMY guard by stale DMY metadata");
const guardedDmyReading = beginnerRuntime.qimenApplyChartContextGuard(legacyScoreReading, {
  system_type: "day",
  engine_readiness: { caveat_th: "ผังวันอ่านประกอบเท่านั้น" },
  dmy_fushi_context: { verdict_allowed: false },
});
assert(guardedDmyReading.code === "context_only", "DMY drawer guard forces context_only code");
assert(guardedDmyReading.verdict_allowed === false, "DMY drawer guard disables verdict");
assert(guardedDmyReading.is_actionable === false, "DMY drawer guard disables actionable reading");
assert(guardedDmyReading.has_engine_score === false, "DMY drawer guard prevents score fallback verdict");
assert(guardedDmyReading.summary_th === "ผังวันอ่านประกอบเท่านั้น", "DMY drawer guard must not append stale original summary");
assert(beginnerRuntime.qimenBeginnerVerdictClass(guardedDmyReading, "good") === "context", "DMY drawer guard wins over score fallback");
const guardedChartTypeReading = beginnerRuntime.qimenApplyChartContextGuard(legacyScoreReading, {
  chart_type: "day",
  engine_readiness: { caveat_th: "ผังวันอ่านประกอบเท่านั้น" },
  dmy_fushi_context: { verdict_allowed: false },
});
assert(guardedChartTypeReading.code === "context_only", "chart_type-only DMY payload forces context_only code");
assert(guardedChartTypeReading.verdict_allowed === false, "chart_type-only DMY payload disables verdict");
const dmyScoreCopy = beginnerRuntime.qimenReadingScoreCopy({ display_score: 70, display_level: "good" }, guardedChartTypeReading, { chart_type: "day", dmy_fushi_context: { verdict_allowed: false } });
assert(String(dmyScoreCopy.inline).includes("คะแนนช่วยจัดลำดับ 70") && String(dmyScoreCopy.inline).includes("อ่านประกอบเท่านั้น") && String(dmyScoreCopy.inline).includes("ไม่ใช้ฟันธง"), "DMY context-only score copy must be non-actionable");
assert(String(dmyScoreCopy.inline).includes("ผังยาม 時家"), "DMY context-only score copy tells user to verify hour chart");
const hourScoreCopy = beginnerRuntime.qimenReadingScoreCopy({ display_score: 70, display_level: "good" }, legacyScoreReading, { chart_type: "hour", dmy_fushi_context: { verdict_allowed: false } });
assert(String(hourScoreCopy.inline).includes("คะแนนช่วยจัดลำดับ 70"), "hour score copy keeps ranking score");
assert(!String(hourScoreCopy.inline).includes("ผังยาม 時家"), "hour score copy must not show DMY hour-check caveat");

const uiSignalRuntime = new Function(`
${uiFlagConstants}
${functionBlock("qimenUiFlags")}
${functionBlock("qimenHasUiFlags")}
${functionBlock("qimenUiFlagCodeMatches")}
${functionBlock("qimenTraceIsContextOnly")}
${traceTone}
${functionBlock("qimenKnownTraceLabel")}
${traceLabel}
${uiTraceSignals}
${displayP0Signals}
${functionBlock("qimenFlagMeaning")}
return { qimenDisplayP0SignalsForPalace, qimenFlagMeaning };
`)() as {
  qimenDisplayP0SignalsForPalace: (palace: Record<string, unknown>, last?: unknown, opts?: Record<string, unknown>) => Array<Record<string, unknown>>;
  qimenFlagMeaning: (item: Record<string, unknown>) => { th: string; zh: string; tone: string; why: string } | null;
};
const uiPacketPalace = {
  palace_id: 2,
  ui_flags: [
    { code: "SAN_ZHA_XIU", active: true, label_th: "ซานจ่าพัก", label_zh: "休詐", short_zh: "詐", tone: "good" },
    { code: "FU_YIN", active: false, label_th: "พลังนิ่งซ้ำ", label_zh: "伏吟", short_zh: "伏", tone: "warn" },
  ],
  qimen_trace: [
    { code: "FAN_YIN", label_th: "พลังพลิกกลับ", label_zh: "反吟", badge: "反" },
  ],
};
const uiPacketSignals = uiSignalRuntime.qimenDisplayP0SignalsForPalace(uiPacketPalace, {}, { includeContext: true });
assert(uiPacketSignals.length === 1, "runtime display signals must use active ui_flags only when ui_flags exist");
assert(uiPacketSignals[0].code === "SAN_ZHA_XIU", "runtime display signals must expose active SAN_ZHA_XIU from ui_flags");
assert(!uiPacketSignals.some((item) => item.code === "FAN_YIN"), "runtime display signals must not leak qimen_trace when ui_flags exist");
const sanZhaMeaning = uiSignalRuntime.qimenFlagMeaning(uiPacketSignals[0]);
assert(sanZhaMeaning?.th === "สามลวง" && sanZhaMeaning.zh === "三詐", "runtime source flag meaning must be Thai-first with Chinese secondary");
const clashMeaning = uiSignalRuntime.qimenFlagMeaning({ code: "RI_SHI_CHONG", label_zh: "日時沖", active: true });
assert(clashMeaning?.th === "วัน/ยามปะทะ" && clashMeaning.zh === "日時沖", "runtime clash flag meaning must be Thai-first with Chinese secondary");

const branchEvidenceRuntime = new Function(`
const BRANCH_TH = { 子:"หนู", 丑:"วัว", 寅:"เสือ", 卯:"กระต่าย", 辰:"มังกร", 巳:"งู", 午:"ม้า", 未:"แพะ", 申:"ลิง", 酉:"ไก่", 戌:"หมา", 亥:"หมู" };
${branchTokens}
${branchList}
${branchDisplay}
${uiFlagConstants}
${functionBlock("qimenUiFlags")}
${functionBlock("qimenHasUiFlags")}
${functionBlock("qimenUiFlagCodeMatches")}
${functionBlock("qimenUiFlagItem")}
${functionBlockExact("qimenUiFlag(p, code, legacyFn)")}
${evidenceLayerLabel}
${flagBranchEvidenceParts}
${selectedSignalEvidence}
return { qimenUiFlagBranchEvidenceParts, qimenSelectedPalaceSignalEvidence };
`)() as {
  qimenUiFlagBranchEvidenceParts: (flag: Record<string, unknown>, overrides?: Record<string, string>) => string[];
  qimenSelectedPalaceSignalEvidence: (palace: Record<string, unknown>, last?: unknown) => string;
};
const evidencePalace = {
  ui_flags: [
    { code: "YI_MA", active: true, label_th: "ม้าเดินทาง", label_zh: "驛馬", branch_evidence: [{ layer: "hour", branches_zh: ["午"], matched_branch_zh: "午", matched_branches_zh: ["午"], palace_branch_source: "palace.branches_zh" }] },
    { code: "GUI_REN", active: true, label_th: "คนช่วย", label_zh: "貴人", branch_evidence: [{ layer: "day", branches_zh: ["丑", "未"], matched_branch_zh: "未", matched_branches_zh: ["未"], palace_branch_source: "palace.branches_zh" }] },
    { code: "RI_SHI_CHONG", active: true, label_th: "ปะทะ", label_zh: "沖", branch_evidence: [{ layer: "hour", branches_zh: ["申"], matched_branch_zh: "申", matched_branches_zh: ["申"], palace_branch_source: "palace.branches_zh" }] },
  ],
};
const branchEvidenceText = branchEvidenceRuntime.qimenSelectedPalaceSignalEvidence(evidencePalace);
assert(branchEvidenceText.includes("ม้าเดินทาง 驛馬") && branchEvidenceText.includes("ม้ายาม ม้า 午"), "runtime selected-palace evidence shows hour horse in Thai-first form");
assert(branchEvidenceText.includes("คนช่วย 貴人") && branchEvidenceText.includes("คนช่วยวัน แพะ 未"), "runtime selected-palace evidence shows day nobleman in Thai-first form");
assert(branchEvidenceText.includes("วัน/ยามปะทะ 日時沖") && branchEvidenceText.includes("ยามปะทะ ลิง 申"), "runtime selected-palace evidence shows hour clash in Thai-first form");
assert(!branchEvidenceText.includes("YI_MA") && !branchEvidenceText.includes("RI_SHI_CHONG"), "runtime selected-palace evidence must not expose raw enum codes");
const inactiveEvidenceText = branchEvidenceRuntime.qimenSelectedPalaceSignalEvidence({
  ui_flags: [{ code: "YI_MA", active: false, branch_evidence: [{ layer: "hour", branches_zh: ["午"], matched_branch_zh: "午", matched_branches_zh: ["午"] }] }],
});
assert(inactiveEvidenceText === "", "runtime selected-palace evidence must not show inactive ui_flags");
const fallbackEvidenceText = branchEvidenceRuntime.qimenSelectedPalaceSignalEvidence({
  ui_flags: [{ code: "GUI_REN", active: true, label_th: "คนช่วย", label_zh: "貴人", branch_evidence: [] }],
});
assert(fallbackEvidenceText.includes("มีป้ายนี้ในวัง แต่ยังไม่เห็นรายละเอียดวัน/ยาม"), "runtime selected-palace evidence has safe beginner fallback when backend evidence is absent");

const publicSanitizerRuntime = new Function(`
${knownTraceLabel}
${textLooksInternalPath}
${publicEvidenceText}
${publicRawTokenLooksInternal}
${publicThaiCopy}
${publicZhCopy}
${publicLineRange}
${negatedByLabel}
${scoreEffectText}
${reasonLabel}
${formationLabel}
return { qmPublicEvidenceText, qmPublicLineRange, qmNegatedByLabel, qimenScoreEffectText, qimenPublicThaiCopy, qimenPublicZhCopy, qimenReasonLabel, qimenFormationLabel };
`)() as {
  qmPublicEvidenceText: (input: unknown) => string;
  qmPublicLineRange: (input: unknown) => string;
  qmNegatedByLabel: (input: unknown) => string;
  qimenScoreEffectText: (input: unknown) => string;
  qimenPublicThaiCopy: (input: unknown, fallback?: string) => string;
  qimenPublicZhCopy: (input: unknown, fallback?: string) => string;
  qimenReasonLabel: (input: Record<string, unknown>) => { th: string; zh: string };
  qimenFormationLabel: (input: Record<string, unknown>) => { th: string; zh: string };
};
assert(publicSanitizerRuntime.qmPublicEvidenceText("/root/qimen-api/docs/source.md:1") === "", "runtime public text sanitizer hides absolute paths");
assert(publicSanitizerRuntime.qmPublicEvidenceText("data/library/sifu-authority/foo.md:313-444") === "", "runtime public text sanitizer hides relative source paths");
assert(publicSanitizerRuntime.qmPublicEvidenceText("src/lib/foo.ts:12") === "", "runtime public text sanitizer hides relative code paths");
assert(publicSanitizerRuntime.qmPublicEvidenceText("source.md:12") === "", "runtime public text sanitizer hides bare file references");
assert(publicSanitizerRuntime.qmPublicLineRange("/root/qimen-api/docs/source.md:313-444") === "313-444", "runtime line range sanitizer keeps only line numbers from path-like input");
assert(publicSanitizerRuntime.qmPublicLineRange("data/library/sifu-authority/foo.md:313-444") === "313-444", "runtime line range sanitizer keeps line numbers from relative path-like input");
assert(publicSanitizerRuntime.qmNegatedByLabel({ code: "SAN_ZHA_XIU" }).includes("สามลวง"), "runtime negated_by code is mapped to Thai label");
assert(!publicSanitizerRuntime.qmNegatedByLabel({ code: "SAN_ZHA_XIU" }).includes("SAN_ZHA_XIU"), "runtime negated_by must not expose raw code");
assert(publicSanitizerRuntime.qimenScoreEffectText("soft_adjust") === "มีผลประกอบแบบเบา ต้องอ่านร่วมกับกฎหลัก", "runtime score_effect soft_adjust maps to Thai");
assert(publicSanitizerRuntime.qimenScoreEffectText("unexpected_raw_enum") === "ต้องตรวจนโยบายคะแนนจากระบบก่อนใช้", "runtime unknown score_effect never renders raw enum");
assert(publicSanitizerRuntime.qimenPublicThaiCopy("data/library/foo.md:313-444", "fallback") === "fallback", "runtime Thai copy sanitizer hides relative path text");
assert(publicSanitizerRuntime.qimenPublicThaiCopy("QING_LONG_FAN_SHOU", "fallback") === "มังกรเขียวหันกลับ", "runtime Thai copy sanitizer maps known raw enum to Thai");
assert(publicSanitizerRuntime.qimenPublicThaiCopy("score_effect", "fallback") === "fallback", "runtime Thai copy sanitizer hides raw score_effect key");
assert(publicSanitizerRuntime.qimenReasonLabel({ label_th: "src/lib/foo.ts:12", code: "MEN_PO" }).th === "ประตูข่มวัง", "runtime reason label falls back from path-like Thai label to known Thai code");
assert(!publicSanitizerRuntime.qimenReasonLabel({ label_th: "src/lib/foo.ts:12", code: "MEN_PO" }).th.includes("src/lib"), "runtime reason label never exposes relative paths");
const safeFormationLabel = publicSanitizerRuntime.qimenFormationLabel({ name_th: "data/library/foo.md:313-444", name_zh: "QING_LONG_FAN_SHOU", formation_code: "QING_LONG_FAN_SHOU" });
assert(safeFormationLabel.th === "มังกรเขียวหันกลับ" && safeFormationLabel.zh === "青龍返首", "runtime formation label maps raw/path data to Thai-first known formula label");

const leadPalaceRuntime = new Function(`
${qmEscRuntime}
${qimenSystemInfoBlock}
const STEM_TH = { 甲:"ไม้หยาง", 乙:"ไม้หยิน", 丙:"ไฟหยาง", 丁:"ไฟหยิน", 戊:"ดินหยาง", 己:"ดินหยิน", 庚:"ทองหยาง", 辛:"ทองหยิน", 壬:"น้ำหยาง", 癸:"น้ำหยิน" };
const BRANCH_TH = { 子:"หนู", 丑:"วัว", 寅:"เสือ", 卯:"กระต่าย", 辰:"มังกร", 巳:"งู", 午:"ม้า", 未:"แพะ", 申:"ลิง", 酉:"ไก่", 戌:"หมา", 亥:"หมู" };
const QIMEN_STAR_TH_BY_ZH = { 天英: "ดาวเทียนอิง", 天蓬: "ดาวเทียนเผิง" };
const QIMEN_DOOR_TH_BY_ZH = { 景門: "ประตูภาพลักษณ์", 開門: "ประตูเปิด" };
const QIMEN_DEITY_TH_BY_ZH = { 值符: "เทพจื๋อฝู" };
${termLabel}
${stemLabel}
${xunDisplay}
${uiFlagConstants}
${functionBlock("qimenUiFlags")}
${functionBlock("qimenHasUiFlags")}
${functionBlock("qimenUiFlagCodeMatches")}
${functionBlock("qimenUiFlagItem")}
${functionBlockExact("qimenUiFlag(p, code, legacyFn)")}
${leadPolicy}
${displayFushi}
function qimenStarTh(p){ return p.star_name_th || ''; }
function qimenStarZh(p){ return p.star_zh || ''; }
function qimenDoorTh(p){ return p.door_name_th || ''; }
function qimenDoorZh(p){ return p.door_zh || ''; }
${leadPalaceRole}
return { buildLeadPalaceRoleHtml };
`)() as {
  buildLeadPalaceRoleHtml: (palace: Record<string, unknown>, last: Record<string, unknown>) => string;
};
const leadPalaceHtml = leadPalaceRuntime.buildLeadPalaceRoleHtml({
  palace_id: 3,
  star_name_th: "ดาวเทียนอิง",
  star_zh: "天英",
  door_name_th: "ประตูทิวทัศน์",
  door_zh: "景門",
  ui_flags: [
    { code: "ZHI_FU", active: true },
    { code: "ZHI_SHI", active: true },
  ],
}, {
  chart: {
    system_type: "hour",
    zhi_fu_palace_id: 3,
    zhi_shi_palace_id: 3,
    ctext_fushi: {
      xun_leader_zh: "甲午",
      xun_yi_zh: "辛",
      current_stem_zh: "丁",
      value_star_zh: "天英",
      value_star_palace_id: 3,
      value_door_zh: "景門",
      value_door_palace_id: 3,
    },
  },
});
assert(leadPalaceHtml.includes("บทบาทวังนำ · 值符/值使"), "runtime lead-palace section renders Thai-first title");
assert(leadPalaceHtml.includes("หัวก้าน <span class=\"tc\">旬首</span>"), "runtime lead-palace section shows lead stem");
assert(leadPalaceHtml.includes("หัวก้าน ไม้หยาง 甲 · ม้า 午"), "runtime lead-palace xun value keeps Thai label before Chinese value");
assert(leadPalaceHtml.includes("ก้านหลบ 遁干 ทองหยิน 辛"), "runtime lead-palace dun stem keeps Thai label before Chinese term");
assert(leadPalaceHtml.includes("ก้านที่ใช้กับชั่วยามนี้ ไฟหยิน 丁"), "runtime hour chart current stem uses hour scope copy with Thai stem");
const rawLeadPalaceHtml = leadPalaceRuntime.buildLeadPalaceRoleHtml({
  palace_id: 3,
  star_name_th: "ดาวเทียนอิง",
  star_zh: "天英",
  door_name_th: "ประตูทิวทัศน์",
  door_zh: "景門",
  ui_flags: [{ code: "ZHI_FU", active: true }],
}, {
  chart: {
    system_type: "hour",
    zhi_fu_palace_id: 3,
    ctext_fushi: {
      xun_leader_zh: "RAW_XUN",
      xun_yi_zh: "RAW_STEM",
      current_stem_zh: "RAW_CURRENT",
      value_star_zh: "天英",
      value_star_palace_id: 3,
    },
  },
});
assert(!rawLeadPalaceHtml.includes("RAW_XUN") && !rawLeadPalaceHtml.includes("RAW_STEM") && !rawLeadPalaceHtml.includes("RAW_CURRENT"), "runtime lead-palace detail hides raw xun/stem API tokens");
assert(!leadPalaceHtml.includes("ยามนี้เดินก้าน"), "runtime lead-palace current stem must not use stale hardcoded hour phrase");
assert(!leadPalaceHtml.includes("旬首 甲午 · 遁干 辛"), "runtime lead-palace detail must not start value chunks Chinese-first");
assert(leadPalaceHtml.includes("วังดาวนำ <span class=\"tc\">值符</span>"), "runtime lead-palace section shows lead star role");
assert(leadPalaceHtml.includes("วังประตูนำ <span class=\"tc\">值使</span>"), "runtime lead-palace section shows envoy role");
assert(leadPalaceHtml.includes("<details class=\"qm-pro-details\"><summary>สูตรวังนำ"), "runtime lead-palace formula is inside Pro details");
assert(leadPalaceHtml.includes("สูตรวังนำ · 值符/值使來源"), "runtime lead-palace formula detail title is Thai-first");
assert(leadPalaceHtml.includes("ไม่ได้แปลว่าดีอัตโนมัติ"), "runtime lead-palace section warns lead palace is not automatically good");
const leadPalaceDayHtml = leadPalaceRuntime.buildLeadPalaceRoleHtml({
  palace_id: 3,
  star_name_th: "ดาวเทียนอิง",
  star_zh: "天英",
  door_name_th: "ประตูทิวทัศน์",
  door_zh: "景門",
  ui_flags: [
    { code: "ZHI_FU", active: true },
    { code: "ZHI_SHI", active: true },
  ],
}, {
  chart: {
    system_type: "day",
    zhi_fu_palace_id: 3,
    zhi_shi_palace_id: 3,
    dmy_fushi_context: {
      verdict_allowed: false,
      value_star_enabled: false,
      value_door_enabled: false,
      caveat_th: "ผังวันนี้ยังเป็นข้อมูลอ่านประกอบ",
      normalized_input: { pillar_code_1based: 42, pillar_zh: "乙巳", dun_type: "yin" },
      ctext_fushi_candidate: {
        xun_leader_zh: "甲辰",
        xun_yi_zh: "壬",
        current_stem_zh: "丁",
        value_star_zh: "天英",
        value_star_palace_id: 3,
        value_door_zh: "景門",
        value_door_palace_id: 3,
      },
    },
  },
});
assert(leadPalaceDayHtml.includes("แกนใหญ่ของวันนี้"), "runtime day chart lead star uses day scope copy");
assert(leadPalaceDayHtml.includes("แนวทางของวันนี้"), "runtime day chart lead door uses day scope copy");
assert(leadPalaceDayHtml.includes("ก้านที่ใช้กับผังวันนี้ ไฟหยิน 丁"), "runtime day chart current stem uses day scope copy with Thai stem");
assert(leadPalaceDayHtml.includes("อ่านประกอบเท่านั้น") && leadPalaceDayHtml.includes("待校"), "runtime day chart fushi candidate is context-only");
assert(!leadPalaceDayHtml.includes("ที่ระบบคำนวณส่งมา หน้าเว็บไม่ย้ายตำแหน่งเอง"), "runtime day chart must not claim full hour-style fushi formula");
assert(!leadPalaceDayHtml.includes("ของชั่วยามนี้"), "runtime day chart lead palace must not say hour scope");
assert(!leadPalaceDayHtml.includes("ยามนี้เดินก้าน"), "runtime day chart lead palace must not use stale hour stem phrase");
const inactiveLeadPalaceHtml = leadPalaceRuntime.buildLeadPalaceRoleHtml({
  palace_id: 3,
  ui_flags: [
    { code: "ZHI_FU", active: false },
    { code: "ZHI_SHI", active: false },
  ],
}, {
  chart: { zhi_fu_palace_id: 3, zhi_shi_palace_id: 3 },
});
assert(inactiveLeadPalaceHtml === "", "lead-palace section must not fallback to chart IDs when ui_flags explicitly deactivate markers");

const order = [
  "สถานะอ่านเร็ว",
  "หลักฐานหลัก",
  "อ่านแบบบ้าน ๆ",
  "ป้ายสัญญาณ",
  "${nextRows}",
  "คะแนนช่วยจัดลำดับ",
  "ลำดับอ่าน",
  "ตรงคำถามไหม",
  "กันอ่านผิด",
  "หมายเหตุ",
].map((text) => guideHtml.indexOf(text));
assert(order.every((n) => n >= 0), "detail guide order labels missing");
assert(order.every((n, i) => i === 0 || n > order[i - 1]), "detail guide labels are not in the expected order");

assertHas("สรุปวังนี้แบบอ่านเร็ว · 速讀", "quick read detail card heading");
assertHas("คำตอบใช้งาน · 用法", "usage advice detail card heading");
assertHas("แนวอ่านวังที่เลือก · 選宮讀法", "selected palace reading guide heading");
assertHas("✦ ธาตุถูกดวง:", "yongshen overlay summary avoids saying direction is recommended");
assertHas("⛔ ธาตุต้านดวง:", "yongshen overlay summary labels personal element caution");
assertNotHas("✦ ทิศแนะนำ:", "yongshen overlay must not present personal element match as direct direction recommendation");
assertBlockHas(yongshenOverlayForPalace, "label_th:'ธาตุทิศนี้ถูกกับธาตุเสริมของดวงคุณ'", "yongshen overlay helper explains xishen as personal element layer");
assertBlockHas(yongshenOverlayCopy, "ถูกดวง แต่ยังไม่ควรใช้เป็นวังหลัก", "yongshen overlay conflict copy prevents good-badge/avoid-detail contradiction");
assertBlockHas(quickRead, "const overlayCopy = qimenYongshenOverlayCopy(p, verdictClass)", "quick read includes yongshen overlay conflict copy");
assertBlockHas(usageAdvice, "const overlayCopy = qimenYongshenOverlayCopy(p, readingCls)", "usage advice includes yongshen overlay conflict copy");
assertBlockHas(detail, "const overlayCopy = qimenYongshenOverlayCopy(p, verdictClass)", "main detail verdict card includes yongshen overlay conflict copy");
assertBlockHas(applyOverlay, "badge = 'ธาตุ喜'", "grid xishen badge is labeled as element layer, not generic good");
assertBlockHas(applyOverlay, "ไม่ใช่คำตัดสินวังฉีเหมิน", "grid yongshen badge tooltip says it is not the Qimen verdict");
assertBlockHas(usageAdvice, "qimenBeginnerIsContextOnly(reading) || qimenChartContextGuard(chart)", "usage advice respects context-only DMY guard");
assertBlockHas(usageAdvice, "qimenYongshenSelector(last)", "usage advice checks yongshen selector");
assertBlockHas(usageAdvice, "qimenBeginnerFlags(p, last)", "usage advice uses display-safe palace flags");
assertBlockHas(usageAdvice, "qimenSelectedPalaceSignalEvidence(p, last)", "usage advice reuses backend branch evidence wording");
assertBlockHas(usageAdvice, "qimenCheckNextItems(reading, p)", "usage advice reuses normalized check-next copy");
assertBlockHas(usageAdvice, "ใช้วังนี้เมื่อ:</b>", "usage advice has use-now row");
assertBlockHas(usageAdvice, "อ่านประกอบเมื่อ:</b>", "usage advice has context row");
assertBlockHas(usageAdvice, "ก่อนใช้จริงต้องเช็ก:</b>", "usage advice has safety check row");
assertHas("หลักฐานหลัก:</b>", "selected palace guide core evidence label");
assertHas("ป้ายสัญญาณ:</b>", "selected palace guide signal flags label");
assertHas("กันอ่านผิด:</b> ห้ามตอบจากคะแนนอย่างเดียว", "selected palace guide blocks score-only answers");
assertBlockHas(guide, "qimenBeginnerFlags(p, last)", "selected palace guide uses display-safe flags");
assertBlockHas(guide, "ประตู ${door || '—'}", "selected palace guide includes door evidence");
assertBlockHas(guide, "ดาว ${star || '—'}", "selected palace guide includes star evidence");
assertBlockHas(guide, "เทพ ${deity || '—'}", "selected palace guide includes deity evidence");
assertBlockHas(guide, "ก้าน ${stemPair}", "selected palace guide includes stem evidence");
assertBlockHas(guide, "const signalBrief = signalFlags.length", "selected palace guide builds compact signal evidence for why line");
assertBlockHas(guide, "const whyLine = [", "selected palace guide builds data-grounded why line");
assertBlockHas(guide, "const selectorIntentTh = qimenPublicThaiCopy(selector?.intent?.label_th", "selected palace guide sanitizes yongshen intent Thai label");
assertBlockHas(guide, "const selectorIntentZh = qimenPublicZhCopy(selector?.intent?.label_zh", "selected palace guide sanitizes yongshen intent Chinese label");
assertBlockNotHas(guide, "selector?.intent?.label_th || 'ภาพรวม'", "selected palace guide must not render raw yongshen intent Thai label");
assertBlockHas(guide, "'ประตู = ทางของเรื่อง'", "selected palace why line explains door role in beginner wording");
assertBlockHas(guide, "'ดาว = แรงของงาน'", "selected palace why line explains star role in beginner wording");
assertBlockHas(guide, "'เทพ = คน/กลยุทธ์'", "selected palace why line explains deity role in beginner wording");
assertBlockHas(guide, "'ก้าน = ปฏิกิริยา'", "selected palace why line explains stem role in beginner wording");
assertBlockHas(guide, "`สัญญาณเสริม = ${signalBrief}`", "selected palace why line explains active flags from real palace data");
assertBlockHas(guide, "<li><b>อ่านแบบบ้าน ๆ:</b> ${qmEsc(whyLine)} · ไม่ใช่คะแนนเดี่ยว</li>", "selected palace why line renders beginner copy instead of generic copy");
assertHas("ยังไม่มีป้ายอ่านเร็วที่ยืนยันได้", "human fallback copy");
assertHas("รอข้อมูลผังให้ครบก่อนใช้เป็นคำแนะนำ", "human check-next fallback");
assertHas("ยังไม่มีคะแนนรวมจากระบบ", "system-score fallback");
assertHas("คะแนนนี้เป็นตัวช่วยจัดลำดับ ไม่เปลี่ยนคำอ่านหลัก", "learner-facing no score mutation copy");
assertNotHas("ไม่แก้คะแนนจริง", "internal score mutation copy must not be visible");
assertHas("ระบบยังไม่รองรับ · รอ v2", "human disabled-school title");
assertHas("ตัวตรวจที่ระบบส่งมา", "human source-trace note");
assertHas("ป้ายบนกริดยึดป้ายช่วยอ่านที่ระบบส่งมาเมื่อมี", "grid badge source-of-truth note");
assertHas("วิธีอ่าน:</b> ประตูคือทางของเรื่อง · ดาวคือแรงของงาน · เทพคือคน/กลยุทธ์ · ก้านคือปฏิกิริยา", "beginner four-layer reading method");
assertHas("ชั้นหลัก:</b>", "beginner main layer label");
assertHas("ระบบคำนวณฉีเหมิน · รอข้อมูล", "initial context source is Thai-first");
assertHas("ผัง 9 วัง <span class=\"tc\">九宮奇門盤</span>", "palace heading is Thai-first");
assertHas("ผังตั้งต้น · 元局", "yuanju heading is Thai-first");
assertHas("กำลังตั้งผัง <span class=\"tc\">起盤中</span>", "loading chart copy is Thai-first");
assertHas("รายละเอียด <span class=\"tc\">詳</span>", "detail loading copy is Thai-first");
assertNotHas("qimen-api · รอข้อมูล", "initial context source must not expose raw qimen-api");
assertNotHas("YUAN-JU", "yuanju heading must not be English-first");
assertNotHas("LOADING CHART", "loading chart copy must not be English-first");
assertNotHas("engine ยืนยันป้ายนี้", "detail copy must not expose engine jargon");
assertNotHas("fallback จาก field เก่า", "detail copy must not expose fallback/field jargon");
assertNotHas("score_effect=", "detail copy must not expose raw score_effect key");
assertNotHas("ป้าย UI จาก engine", "detail copy must not expose raw UI/engine label");
assertNotHas("สายเทพจาก engine", "detail copy must not expose engine deity lineage fallback");
assertHas("คะแนนช่วยจัดลำดับ · 分", "Thai-first score label");
assertHas("Ranking score · 分", "English score label");
assertHas("輔助評分", "Chinese score label");
assertHas("ดาวนำ · 值符", "lead star header label is Thai-first Chinese-second");
assertHas("ประตูนำ · 值使", "envoy header label is Thai-first Chinese-second");
assertHas("หัวก้าน · 旬首", "lead stem xun-shou header label is Thai-first Chinese-second");
assertHas("Lead Stem · 旬首", "lead stem English locale label is precise");
assertHas("ปะทะ · 日時沖", "day/hour clash header label is Thai-first");
assertHas("id=\"qm-pill-clash\"", "day/hour clash header pill exists");
assertHas("ทิศและกว้า · 方位/八卦", "palace gua row label is Thai-first");
assertHas("ยังไม่พบสัญญาณหนัก", "Thai signal fallback");
assertHas("สัญญาณเสริมต่อ", "Thai signal follow-up copy");
assertHas("ระบบหาวังที่เลือกหมายเลข", "Thai palace missing copy");
assertHas("ก้านฟ้าบน ${p?.heaven_stem_zh", "Thai-first stem fallback");
assertHas("ยังไม่มีคำอ่านก้านจากระบบ", "Thai stem fallback avoids raw stem formula");
assertHas("const BRANCH_TH", "Thai earthly-branch display dictionary");
assertHas("const STEM_TH", "Thai heavenly-stem display dictionary");
assertHas("const XIU_TH", "Thai 28 mansions display dictionary");
assertHas("function qmBranchLabel", "Thai-first branch label helper");
assertHas("function qmBranchList", "Thai-first branch list helper");
assertHas("function qmBranchDisplay", "Thai-first branch fallback display helper");
assertHas("function qimenUiFlag", "engine ui_flags source-of-truth helper exists");
assertHas("function qimenUiActiveFlags", "active ui_flags helper exists");
assertHas("function qimenDisplayP0SignalsForPalace", "display-safe source flag helper exists");
assertHas("function qimenUiTraceSignalsForPalace", "ui_flags trace signal adapter exists");
assertHas("QIMEN_SOURCE_UI_FLAG_CODES", "source ui flag allowlist exists");
assertHas("QIMEN_UI_FLAG_ALIASES", "ui flag alias map exists");
assertHas("function qmStemLabel", "Thai-first stem label helper");
assertHas("function qmPillarDisplay", "Thai-first four-pillar display helper");
assertHas("function qmXiuDisplay", "Thai-first 28 mansions display helper");
assertHas("function qimenStarZh", "star code to Chinese helper exists");
assertHas("function qimenDoorZh", "door code to Chinese helper exists");
assertHas("function qimenDeityZh", "deity code to Chinese helper exists");
assertHas("function qimenNormalizeDeityZh", "deity glyph normalizer exists");
assertHas("function qimenNormalizeDeityTh", "deity Thai normalizer exists");
assertHas("function qimenDoorTh", "door code to Thai fallback helper exists");
assertHas("function qimenStarTh", "star code to Thai fallback helper exists");
assertHas("function qimenDeityTh", "deity code to Thai fallback helper exists");
assertHas("GOU_CHEN:'勾陳'", "day/month/year deity Gou Chen fallback exists");
assertHas("ZHU_QUE:'朱雀'", "day/month/year deity Zhu Que fallback exists");
assertHas("s === '\\u76f4符' ? '值符' : s", "runtime zhi-fu glyph alias normalizes to standard 值符");
assertHas("function qimenKnownTraceLabel", "raw trace code to Thai learner label helper exists");
assertHas("function qimenReadinessConfidenceLabel", "stem readiness confidence localizer exists");
assertHas("function qimenReadinessLayerLabel", "stem readiness layer localizer exists");
assertHas("function qimenReadinessPolicyLabel", "stem readiness policy localizer exists");
assertHas("function qimenAlgorithmLabel", "algorithm method localizer exists");
assertHas("function qimenChartVariantLabel", "chart variant localizer exists");
assertHas("function qimenDeityVariantLabel", "deity lineage variant localizer exists");
assertHas("function qimenSafeLineageSourceLabel", "lineage source label sanitizer exists");
assertHas("function qimenChartScopeThai", "chart scope helper exists for 時/日/月/年 copy");
assertHas("hour:  { scope:'ชั่วยามนี้', axis:'แกนใหญ่ของชั่วยามนี้', action:'จังหวะลงมือของชั่วยามนี้', stem:'ก้านที่ใช้กับชั่วยามนี้' }", "hour chart scope copy is explicit");
assertHas("day:   { scope:'วันนี้', axis:'แกนใหญ่ของวันนี้', action:'แนวทางของวันนี้', stem:'ก้านที่ใช้กับผังวันนี้' }", "day chart scope copy is explicit");
assertHas("month: { scope:'เดือนนี้', axis:'แนวโน้มหลักของเดือนนี้', action:'แนวทางเคลื่อนเรื่องของเดือนนี้', stem:'ก้านที่ใช้กับผังเดือนนี้' }", "month chart scope copy is explicit");
assertHas("year:  { scope:'ปีนี้', axis:'ภาพใหญ่ของปีนี้', action:'ทิศทางเคลื่อนเรื่องของปีนี้', stem:'ก้านที่ใช้กับผังปีนี้' }", "year chart scope copy is explicit");
assertHas("function qimenDirectionFullLabel", "full Thai direction helper exists");
assertHas("function qimenInternalExternalSummary", "internal/external palace learner summary exists");
assertHas("function qmBriefThaiText", "Thai brief text helper exists");
assertHas("function buildPalaceTermGuideHtml", "main layer term guide helper exists");
assertHas("อ่านสี่ชั้นหลัก · 干門星神", "main layer guide title is Thai-first");
assertNotHas("อ่านสามชั้นหลัก · 門星神", "old three-layer guide title");
assertHas("คำอธิบายเต็มของสี่ชั้น · 全文", "main layer full text is tucked into details");
assertHas("makeRow('ก้านฟ้าบน/ก้านดินล่าง', '天盤干/地盤干'", "main layer includes precise Thai-first stem layer");
assertHas("ก้านแบบสั้น <span class=\"tc\">干應</span>", "main layer full text keeps stem beginner text");
assertHas("ก้านเต็ม <span class=\"tc\">十干克應</span>", "main layer full text keeps stem detail text");
assertHas("ข้อควรระวังก้าน <span class=\"tc\">干戒</span>", "main layer full text keeps stem caveat");
assertHas("บทบาทประตู <span class=\"tc\">門用</span>", "main layer full text keeps door role");
assertHas("วิธีใช้ประตู <span class=\"tc\">門法</span>", "main layer full text keeps door action advice");
assertHas("คำแนะนำเทพ <span class=\"tc\">神用</span>", "main layer full text keeps deity advice");
assertHas("ก้านบอกปฏิกิริยาของเรื่อง ประตูบอกทางของเรื่อง ดาวบอกแรงของงาน เทพบอกคน/กลยุทธ์", "main layer caveat explains roles plainly");
assertHas("function buildChartContextDetailHtml", "chart context detail helper exists");
assertHas("function buildQimenLineageHtml", "lineage/source detail helper exists");
assertHas("สายสูตรและแหล่งผัง · 流派/來源", "lineage/source detail title is Thai-first");
assertHas("function buildLeadPalaceRoleHtml", "lead palace role helper exists");
assertHas("บทบาทวังนำ · 值符/值使", "lead palace role title is Thai-first");
assertBlockHas(leadPalaceRole, "qimenUiFlag(p, 'ZHI_FU'", "lead palace role prefers engine ui_flags for zhi-fu");
assertBlockHas(leadPalaceRole, "qimenUiFlag(p, 'ZHI_SHI'", "lead palace role prefers engine ui_flags for zhi-shi");
assertBlockHas(leadPalaceRole, "const scope = qimenChartScopeThai(chart)", "lead palace role reads scope from engine chart");
assertBlockHas(leadPalaceRole, "หัวก้าน <span class=\"tc\">旬首</span>", "lead palace role includes lead stem");
assertBlockHas(leadPalaceRole, "const leadXun = qmXunDisplay(fushi.xun_leader_zh, true)", "lead palace xun value is sanitized before display");
assertBlockHas(leadPalaceRole, "const leadYi = qmStemLabel(fushi.xun_yi_zh)", "lead palace dun stem value is sanitized before display");
assertBlockNotHas(leadPalaceRole, "`旬首 ${fushi.xun_leader_zh}`", "lead palace xun value must not be Chinese-first");
assertBlockNotHas(leadPalaceRole, "`遁干 ${fushi.xun_yi_zh}`", "lead palace dun stem value must not be Chinese-first");
assertBlockHas(leadPalaceRole, "const currentStem = qmStemLabel(fushi.current_stem_zh)", "lead palace current stem is sanitized before display");
assertBlockHas(leadPalaceRole, "${scope.stem || 'ก้านที่ใช้กับผังนี้'} ${currentStem}", "lead palace current stem uses chart-scoped copy");
assertBlockNotHas(leadPalaceRole, "ยามนี้เดินก้าน", "lead palace current stem must not hardcode hour scope");
assertBlockHas(leadPalaceRole, "หรือ${qmEsc(scope.axis)}", "lead star role uses chart-scoped axis copy");
assertBlockHas(leadPalaceRole, "หรือ${qmEsc(scope.action)}", "lead door role uses chart-scoped action copy");
assertBlockNotHas(leadPalaceRole, "แกนใหญ่ของชั่วยามนี้", "lead palace role must not hardcode hour scope");
assertBlockNotHas(leadPalaceRole, "จังหวะลงมือของชั่วยามนี้", "lead palace role must not hardcode hour action scope");
assertBlockHas(leadPalaceRole, "值符隨干 / 值使隨支", "lead palace role states source formula layer");
assertBlockHas(leadPalaceRole, "<details class=\"qm-pro-details\"><summary>สูตรวังนำ", "lead palace source formula is Pro-only");
assertBlockHas(leadPalaceRole, "ไม่ได้แปลว่าดีอัตโนมัติ", "lead palace role warns lead palace is not automatically auspicious");
assertBlockHas(detail, "buildLeadPalaceRoleHtml(p, last)", "detail drawer includes lead palace role section");
assertHas("function qimenContextPairRow", "chart context pair row helper exists");
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
assertBlockHas(uiFlag, "const flag = qimenUiFlagItem(p, code)", "ui flag helper checks packet flag first");
assertBlockHas(uiFlag, "if (qimenHasUiFlags(p)) return false", "ui flag helper does not fallback when packet has ui_flags");
assertBlockHas(uiFlag, "return typeof legacyFn === 'function' ? !!legacyFn() : false", "ui flag helper falls back only for legacy packets without ui_flags");
assertBlockHas(uiFlags, "...(Array.isArray(p?.ui_flags) ? p.ui_flags : [])", "ui flags merge explicit ui_flags");
assertBlockHas(uiFlags, "...(Array.isArray(p?.context_flags) ? p.context_flags : [])", "ui flags merge context_flags");
assertBlockHas(uiFlags, "seen.has(key)", "ui/context flags deduplicate merged packet flags");
assertBlockHas(uiActiveFlags, "flag.active === true", "active ui flag helper requires explicit active=true");
assertBlockHas(beginnerFlags, "qimenHasUiFlags(p)", "beginner flags prefer engine ui_flags");
assertBlockHas(beginnerFlags, "qimenUiActiveFlags(p, ['KONG_WANG','YI_MA','GUI_REN','RI_SHI_CHONG','MEN_PO','RU_MU','JI_XING'])", "beginner flags read display-safe temporal and state engine flags");
assertBlockHas(beginnerFlags, "raw.push(...qimenUiTraceSignalsForPalace(p, { includeContext: true }))", "beginner flags use ui_flags source formations when packet has ui_flags");
assertHas("function qimenUiFlagBranchEvidenceParts", "selected palace branch evidence helper exists");
assertHas("function qimenUiFlagFormulaEvidenceParts", "selected palace formula evidence helper exists");
assertHas("function qimenSelectedPalaceSignalEvidence", "selected palace signal evidence helper exists");
assertBlockHas(flagBranchEvidenceParts, "Array.isArray(flag?.branch_evidence)", "branch evidence helper reads backend branch_evidence first");
assertBlockHas(flagBranchEvidenceParts, "qmBranchDisplay(item?.matched_branch_zh, item?.matched_branches_zh, item?.branch_zh, item?.branches_zh)", "branch evidence helper normalizes matched branch through Thai display");
assertHas("function qimenEvidenceSourceLabel", "formula evidence source label helper exists");
assertBlockHas(evidenceSourceLabel, "if (key === 'qimen_source_trace') return 'ชุดหลักฐานตำราของระบบ'", "formula evidence source key maps qimen source trace to Thai learner copy");
assertBlockHas(evidenceSourceLabel, "if (key === 'chart_packet') return 'ข้อมูลหัวผังจากระบบคำนวณ'", "formula evidence source key maps chart packet to Thai learner copy");
assertBlockHas(evidenceSourceLabel, "if (key === 'advanced_qimen_layers') return 'ชั้นสูตรลึกจากระบบคำนวณ'", "formula evidence source key maps advanced layers to Thai learner copy");
assertBlockHas(evidenceSourceLabel, "return /[ก-๙\\u3400-\\u9fff]/u.test(safe) ? safe : ''", "formula evidence source label hides raw opaque tokens");
assertBlockHas(flagFormulaEvidenceParts, "flag?.formula_evidence", "formula evidence helper reads backend formula_evidence");
assertBlockHas(flagFormulaEvidenceParts, "flag?.formula_evidence_th || flag?.source_summary_th", "formula evidence helper falls back to source summary text");
assertBlockHas(flagFormulaEvidenceParts, "qmPublicEvidenceText(summary)", "formula evidence helper sanitizes summary text");
assertBlockHas(flagFormulaEvidenceParts, "qimenPublicThaiCopy(item.label_th", "formula evidence label is Thai-first when available");
assertBlockHas(flagFormulaEvidenceParts, "qimenPublicZhCopy(item.label_zh", "formula evidence label keeps Chinese secondary when available");
assertBlockHas(flagFormulaEvidenceParts, "qimenEvidenceSourceLabel(item.source_key)", "formula evidence source key is converted before display");
assertBlockHas(selectedSignalEvidence, "ม้าเดินทาง", "selected signal evidence labels horse in Thai");
assertBlockHas(selectedSignalEvidence, "คนช่วย", "selected signal evidence labels nobleman in Thai");
assertBlockHas(selectedSignalEvidence, "วัน/ยามปะทะ", "selected signal evidence labels clash in Thai");
assertBlockHas(selectedSignalEvidence, "มีป้ายนี้ในวัง แต่ยังไม่เห็นรายละเอียดวัน/ยาม", "selected signal evidence has beginner fallback for old packets");
assertBlockHas(guide, "const signalEvidenceLine = qimenSelectedPalaceSignalEvidence(p, last)", "reading guide builds selected-palace signal evidence");
assertBlockHas(guide, "<li><b>หลักฐานสัญญาณ:</b> ${qmEsc(signalEvidenceLine)}</li>", "reading guide renders selected-palace signal evidence in beginner detail");
assertBlockNotHas(renderPalaces, "qimenSelectedPalaceSignalEvidence(", "palace grid must not render long selected-palace evidence");
assertBlockHas(palaceExtra, "qimenUiFlagFormulaEvidenceParts(flag, { limit: 1 })", "beginner palace extra reads one formula evidence line");
assertBlockHas(palaceExtra, "หลักฐานสูตร:", "beginner palace extra labels engine formula evidence plainly");
assertBlockHas(palaceExtra, "ระบบยืนยันป้ายนี้", "beginner palace extra keeps legacy fallback when formula evidence is absent");
assertHas("function qimenAdvancedLayersForPalace", "advanced qimen palace layer helper exists");
assertHas("function buildAdvancedQimenLayersHtml", "advanced qimen layer detail helper exists");
assertHas("function buildAdvancedQimenReadinessHtml", "advanced qimen readiness helper exists");
assertHas("ป้ายสูตรสำคัญในวังนี้ · 深層標記", "advanced qimen layer card is Thai-first and beginner-readable");
assertBlockNotHas(advancedLayersDetail, "advanced_qimen_layers</span>", "beginner advanced layer card must not expose raw backend field names");
assertHas("สถานะความพร้อมชั้นสูตรใหม่ · 深層公式狀態", "advanced qimen readiness card is Thai-first");
assertBlockHas(advancedLayersForPalace, "p?.advanced_qimen_layers", "advanced layer helper reads backend advanced_qimen_layers");
assertBlockHas(advancedLayersForPalace, "item.active === true", "advanced layer helper shows only active engine layers");
assertBlockHas(advancedLayerLabel, "qimenPublicThaiCopy(layer?.label_th", "advanced layer labels are Thai-first");
assertBlockHas(advancedLayerLabel, "qimenPublicZhCopy(layer?.label_zh", "advanced layer labels keep Chinese secondary");
assertBlockHas(advancedLayersDetail, "qimenAdvancedLayersForPalace(p)", "advanced detail uses backend layer helper");
assertBlockNotHas(advancedLayersDetail, "qimenUiFlagFormulaEvidenceParts(layer, { includeDetail: true", "beginner advanced detail must not render heavy formula evidence");
assertBlockNotHas(advancedLayersDetail, "layer.formation_items", "beginner advanced detail must not render full per-palace formation lists");
assertBlockHas(advancedLayersDetail, "หน้าเว็บไม่สร้างสูตรเองและไม่เปลี่ยนคะแนน", "advanced detail states frontend is display-only");
assertBlockHas(advancedReadinessDetail, "chart.advanced_qimen_layer_readiness", "advanced readiness reads chart readiness packet");
assertBlockHas(advancedReadinessDetail, "สถานะความพร้อมบอกว่าสูตรพร้อมตรวจหรือยัง", "advanced readiness blocks readiness-as-active-formula misuse in Thai learner copy");
assertBlockHas(detail, "+ buildAdvancedQimenLayersHtml(p, last)", "detail drawer includes advanced layer card in beginner flow");
assertBlockHas(detail, "+ buildAdvancedQimenReadinessHtml(last)", "detail drawer includes advanced readiness in pro flow");
assertBlockNotHas(renderPalaces, "buildAdvancedQimenLayersHtml", "palace grid must not render long advanced layer detail");
assertBlockNotHas(renderPalaces, "advanced_qimen_layer_readiness", "palace grid must not render chart readiness detail");
assertHas("function buildPalaceFormulaEvidenceHtml", "Pro formula evidence detail helper exists");
assertHas("หลักฐานสูตรจากระบบคำนวณ · 公式證據", "Pro formula evidence card title is Thai-first and avoids raw engine wording");
assertBlockHas(formulaEvidenceDetail, "qimenUiFlagFormulaEvidenceParts(flag, { includeDetail: true", "Pro formula evidence renders engine formula evidence");
assertBlockHas(formulaEvidenceDetail, "qimenUiFlags(p)", "Pro formula evidence detail reads engine ui_flags only");
assertBlockHas(formulaEvidenceDetail, "qimenUiFlagFormulaEvidenceParts(flag, { includeDetail: true", "Pro formula evidence detail includes full formula evidence");
assertBlockHas(formulaEvidenceDetail, "หน้าเว็บไม่คำนวณสูตรหรือเพิ่มคะแนนเอง", "Pro formula evidence detail states frontend is display-only");
assertBlockHas(detail, "+ buildPalaceFormulaEvidenceHtml(p, last)", "detail drawer includes Pro formula evidence section");
assertBlockNotHas(renderPalaces, "buildPalaceFormulaEvidenceHtml", "palace grid must not render formula evidence details");
assertBlockHas(displayP0Signals, "if (qimenHasUiFlags(p)) return qimenUiTraceSignalsForPalace(p, opts)", "grid source flags prefer ui_flags");
assertBlockHas(uiTraceSignals, "_source_key: 'palace.ui_flags'", "ui trace signals mark engine ui_flags as source");
assertBlockHas(traceTone, "s.includes('warn')", "trace tone colors warn flags as warning");
assertBlockHas(renderPalaces, "qimenUiFlag(p, 'YI_MA'", "grid horse marker prefers engine ui_flags");
assertBlockHas(renderPalaces, "qimenUiFlag(p, 'KONG_WANG'", "grid void marker prefers engine ui_flags");
assertBlockHas(renderPalaces, "qimenUiFlag(p, 'GUI_REN'", "grid nobleman marker prefers engine ui_flags");
assertBlockHas(renderPalaces, "qimenUiFlag(p, 'RI_SHI_CHONG'", "grid clash marker prefers engine ui_flags");
assertBlockHas(renderPalaces, "qimenUiFlag(p, 'ZHI_FU'", "grid zhi-fu marker prefers engine ui_flags");
assertBlockHas(renderPalaces, "qimenUiFlag(p, 'ZHI_SHI'", "grid zhi-shi marker prefers engine ui_flags");
assertBlockHas(renderPalaces, "const leadPolicy = qimenLeadPolicy(ch)", "grid gates lead markers through lead policy");
assertBlockHas(renderPalaces, "leadPolicy.activeStar ? qimenUiFlag", "grid does not show zhi-fu marker unless policy enables it");
assertBlockHas(renderPalaces, "leadPolicy.activeDoor ? qimenUiFlag", "grid does not show zhi-shi marker unless policy enables it");
assertBlockHas(renderPalaces, "const stateMk  = renderQimenGridStateMarks(p)", "grid renders state markers from engine flags");
assertBlockHas(renderPalaces, "${voidMk}${nobleMk}${clashMk}${stateMk}", "grid state markers appear with other short badges");
assertBlockHas(renderPalaces, "const fms = palaceFormations(p.palace_id).slice(0,2)", "grid bounds visible formation markers");
assertBlockHas(renderPalaces, "const fmTitle = fms.map(f =>", "grid keeps formation names in tooltip only");
assertBlockHas(renderPalaces, "title=\"${qmEsc(fmTitle)}\">格</span>", "grid formation marker renders short 格 badge only");
assertBlockNotHas(renderPalaces, "formation_code", "grid must not render raw formation codes");
assertBlockNotHas(renderPalaces, "${qmEsc(nameTh)}", "grid must not render full formation names in cell body");
assertBlockNotHas(renderPalaces, "${qmEsc(nameZh)}", "grid must not render full Chinese formation names in cell body");
for (const marker of [
  ["MEN_PO", "迫", "ประตูข่มวัง · 門迫"],
  ["RU_MU", "墓", "เข้าคลัง/ติดค้าง · 入墓"],
  ["JI_XING", "刑", "ก้านถูกลงโทษ · 擊刑"],
  ["FU_YIN", "伏", "พลังนิ่งซ้ำ · 伏吟"],
  ["FAN_YIN", "反", "พลังพลิกกลับ · 反吟"],
] as const) {
  assertBlockHas(gridStateDefs, `code:'${marker[0]}'`, `grid state defs include ${marker[0]}`);
  assertBlockHas(gridStateDefs, `short:'${marker[1]}'`, `grid state defs include short badge ${marker[1]}`);
  assertBlockHas(gridStateDefs, `title:'${marker[2]}'`, `grid state defs include Thai-first title ${marker[0]}`);
}
assertBlockHas(gridStateMarks, "qimenUiFlag(p, def.code, def.legacy)", "grid state markers are packet-governed");
assertBlockHas(gridStateMarks, "p0-mk p0-${def.tone}", "grid state markers use bounded badge style");
assertBlockHas(renderPalaces, "qimenDisplayP0SignalsForPalace(p, window._qimenLast)", "grid P0 badges use display-safe ui_flags adapter");
assertBlockHas(context, "qmPillarDisplay(p, chart, key)", "four-pillar strip uses Thai-first display helper with chart-level fallback");
assertHas(".qm-context-chip.key", "lead chart context chip has distinct styling");
assertBlockHas(context, "const leadPolicy = qimenLeadPolicy(chart)", "context reads lead policy before chart-head chip");
assertBlockHas(context, "const fushi = qimenDisplayFushi(chart)", "context reads policy-governed fushi packet");
assertBlockHas(context, "หัวผัง 符使", "context shows chart-head chip Thai-first");
assertBlockHas(context, "หัวก้าน ${qmEsc(qmXunDisplay(leadStem, true) || 'ระบบยังไม่ส่งหัวก้าน')}", "context chart-head chip shows sanitized Thai-first lead stem");
assertBlockHas(context, "ดาวนำ ${qmEsc(leadStar || '—')}", "context chart-head chip shows lead star");
assertBlockHas(context, "ประตูนำ ${qmEsc(leadDoor || '—')}", "context chart-head chip shows lead door");
assertBlockHas(context, "เป็นแกนตั้งผัง ไม่ใช่คะแนนดีร้ายเดี่ยว", "context chart-head chip avoids auto-good verdict");
assertBlockHas(context, "อ่านประกอบเท่านั้น 待校 · ไม่ใช้ฟันธง", "context chart-head chip labels DMY candidate as context-only");
assertBlockHas(context, "รอบ<span class=\"tc\">旬</span>", "four-pillar strip xun label is Thai-first");
assertBlockHas(context, "ช่องว่าง <span class=\"tc\">空亡</span>", "four-pillar strip void label is Thai-first");
assertBlockNotHas(context, "旬 ${qmEsc(pillar.xun)} · 空", "four-pillar strip must not use Chinese-only xun/void labels");
assertBlockHas(context, "qmBranchDisplay(chart?.voids?.day, chart?.void_day_zh, chart?.voidDayZh)", "context void day uses fallback branch display");
assertBlockHas(context, "qmBranchDisplay(chart?.sky_horse?.day?.branch, chart?.skyHorse?.day?.branch, chart?.traveling_horse_day_zh, chart?.traveling_horse_zh)", "context sky horse uses fallback branch display");
assertBlockHas(context, "qmBranchDisplay(chart?.nobleman?.day?.branches, chart?.nobleman_day_zh)", "context nobleman uses fallback branch display");
assertBlockHas(context, "qmBranchDisplay(chart?.clash?.day?.branch, chart?.day_clash_zh)", "context clash uses fallback branch display");
assertBlockHas(context, "qimenAlgorithmLabel(chart?.algorithm_method)", "context source localizes algorithm method");
assertBlockHas(context, "qimenChartVariantLabel(chart?.chart_variant || chart?.chart_type)", "context source localizes chart variant");
assertBlockHas(context, "qimenInternalExternalSummary()", "context internal/external summary uses learner copy");
assertBlockNotHas(context, "chart?.algorithm_method || 'qimen-api'} · ${chart?.chart_variant", "context source must not expose raw internal method/variant directly");
assertBlockNotHas(context, "內 N·NE·E·SE / 外 S·SW·W·NW", "context internal/external must not use direction abbreviations");
assertBlockHas(context, "const dirTh = qimenPublicThaiCopy(x.direction_label_th, qimenDirectionFullLabel(x.direction));", "context yongshen Thai direction label is sanitized with full-label fallback");
assertBlockHas(context, "const dirZh = qimenPublicZhCopy(x.direction_label_zh, '');", "context yongshen Chinese direction label is sanitized");
assertBlockNotHas(context, "x.direction_label_th || qimenDirectionFullLabel(x.direction)", "context must not render raw yongshen direction Thai label");
assertBlockNotHas(context, "x.direction_label_zh || ''", "context must not render raw yongshen direction Chinese label");
assertBlockHas(context, "const selectorIntentTh = qimenPublicThaiCopy(selector?.intent?.label_th", "context yongshen intent Thai label is sanitized");
assertBlockHas(context, "const selectorIntentZh = qimenPublicZhCopy(selector?.intent?.label_zh", "context yongshen intent Chinese label is sanitized");
assertBlockNotHas(context, "selector?.intent?.label_th || 'ภาพรวม'", "context must not render raw yongshen intent Thai label");
assertBlockHas(showLoadError, "ระบบคำนวณฉีเหมิน · ข้อมูลไม่อัปเดต", "load-error source is Thai-first");
const termLabelRuntime = new Function(`
const QIMEN_STAR_TH_BY_ZH = { 天蓬: "ดาวเทียนเผิง", 天輔: "ดาวเทียนฝู่" };
const QIMEN_DOOR_TH_BY_ZH = { 開門: "ประตูเปิด" };
const QIMEN_DEITY_TH_BY_ZH = { 值符: "เทพจื๋อฝู" };
${termLabel}
return { qimenTermLabel };
`)() as { qimenTermLabel: (th: string, zh: string, palaceId?: number) => string };
assert(termLabelRuntime.qimenTermLabel("", "天蓬", 6) === "ดาวเทียนเผิง 天蓬 · วัง 6", "runtime term label maps Chinese star to Thai-first fallback");
assert(termLabelRuntime.qimenTermLabel("", "開門", 2) === "ประตูเปิด 開門 · วัง 2", "runtime term label maps Chinese door to Thai-first fallback");
assert(termLabelRuntime.qimenTermLabel("ดาวเทียนฝู่", "天輔", 4) === "ดาวเทียนฝู่ 天輔 · วัง 4", "runtime term label preserves explicit Thai before Chinese");
assert(termLabelRuntime.qimenTermLabel("", "RAW_STAR_CODE", 4) === "— · วัง 4", "runtime term label hides unknown raw API term");
const xunRuntime = new Function(`
const STEM_TH = { 甲:"ไม้หยาง", 乙:"ไม้หยิน", 丙:"ไฟหยาง", 丁:"ไฟหยิน", 戊:"ดินหยาง", 己:"ดินหยิน", 庚:"ทองหยาง", 辛:"ทองหยิน", 壬:"น้ำหยาง", 癸:"น้ำหยิน" };
const BRANCH_TH = { 子:"หนู", 丑:"วัว", 寅:"เสือ", 卯:"กระต่าย", 辰:"มังกร", 巳:"งู", 午:"ม้า", 未:"แพะ", 申:"ลิง", 酉:"ไก่", 戌:"หมา", 亥:"หมู" };
${branchTokens}
${branchList}
${branchLabel}
${stemLabel}
${xunDisplay}
${pillarDisplay}
return { qmXunDisplay, qmStemLabel, qmBranchLabel, qmPillarDisplay };
`)() as {
  qmXunDisplay: (value: unknown, compact?: boolean) => string;
  qmStemLabel: (value: unknown) => string;
  qmBranchLabel: (value: unknown) => string;
  qmPillarDisplay: (p: Record<string, unknown>, chart?: Record<string, any>, key?: string) => { parts: string; xun: string; voids: string; zh: string };
};
assert(xunRuntime.qmXunDisplay("甲辰", true) === "ไม้หยาง 甲 · มังกร 辰", "runtime xun compact is Thai-first and keeps Chinese secondary");
assert(xunRuntime.qmXunDisplay("甲辰").includes("รอบ 甲辰旬"), "runtime xun full keeps validated xun cycle");
assert(xunRuntime.qmXunDisplay("RAW_XUN") === "", "runtime xun hides unknown raw xun text");
assert(xunRuntime.qmStemLabel("JIA") === "", "runtime stem label hides unknown romanized/raw stem code");
assert(xunRuntime.qmBranchLabel("ZI") === "", "runtime branch label hides unknown romanized/raw branch code");
const rawPillar = xunRuntime.qmPillarDisplay({ zh: "JIA_ZI", stem: "JIA", branch: "ZI" });
assert(rawPillar.parts === "ก้าน/กิ่งไม่ครบ", "runtime pillar display does not render raw romanized stem/branch tokens");
assert(rawPillar.zh === "—", "runtime pillar display hides invalid raw pillar zh");
assert(!rawPillar.parts.includes("JIA") && !rawPillar.parts.includes("ZI"), "runtime pillar display hides raw API stem/branch tokens");
const fallbackPillar = xunRuntime.qmPillarDisplay({ zh: "壬子" }, { xun_day_zh: "甲辰", void_day_zh: ["寅", "卯"] }, "day");
assert(fallbackPillar.xun.includes("甲辰旬") && fallbackPillar.voids.includes("เสือ 寅"), "runtime pillar display falls back to chart-level xun/void fields");
assertBlockHas(renderHeader, "const leadPolicy = qimenLeadPolicy(chart)", "header reads lead policy");
assertBlockHas(renderHeader, "const fushi = qimenDisplayFushi(chart)", "header reads policy-governed fushi packet");
assertBlockHas(renderHeader, "const fuPalaceId = Number(fuPalaceIdRaw)", "header normalizes zhi_fu palace id before lookup");
assertBlockHas(renderHeader, "const shiPalaceId = Number(shiPalaceIdRaw)", "header normalizes zhi_shi palace id before lookup");
assertBlockHas(renderHeader, "Number(p.palace_id) === fuPalaceId", "header zhi_fu lookup tolerates string/number palace ids");
assertBlockHas(renderHeader, "Number(p.palace_id) === shiPalaceId", "header zhi_shi lookup tolerates string/number palace ids");
assertBlockHas(renderHeader, "const leadStarTh = qimenStarTh(fuPalace) || QIMEN_STAR_TH_BY_ZH[leadStarZh] || QIMEN_STAR_TH[chart.chief_star_code] || ''", "header lead star Thai fallback uses palace, Chinese, then code dictionary");
assertBlockHas(renderHeader, "const leadDoorTh = qimenDoorTh(shiPalace) || QIMEN_DOOR_TH_BY_ZH[leadDoorZh] || QIMEN_DOOR_TH[chart.zhi_shi_door_code] || ''", "header lead door Thai fallback uses palace, Chinese, then code dictionary");
assertBlockHas(termLabel, "QIMEN_STAR_TH_BY_ZH[zhClean] || QIMEN_DOOR_TH_BY_ZH[zhClean] || QIMEN_DEITY_TH_BY_ZH[zhClean]", "term label maps Chinese terms to Thai-first fallback");
assertBlockHas(termLabel, "const safeZh = fallbackTh ? zhClean : ''", "term label hides unknown raw Chinese/API term");
assertBlockHas(pillarDisplay, "chart[`xun_${key}_zh`] || chart[`xun${cap}Zh`]", "pillar display falls back to chart-level xun fields");
assertBlockHas(pillarDisplay, "chart?.voids?.[key] || chart[`void_${key}_zh`] || chart[`void${cap}Zh`]", "pillar display falls back to chart-level void fields");
assertBlockHas(renderHeader, "qimenStarZh(fuPalace)", "header lead star avoids raw star code fallback");
assertBlockHas(renderHeader, "qimenDoorZh(shiPalace)", "header lead door avoids raw door code fallback");
assertBlockNotHas(renderHeader, "chart.chief_star_code || '—'", "header must not expose raw chief star code");
assertBlockNotHas(renderHeader, "chart.zhi_shi_door_code || '—'", "header must not expose raw door code");
assertBlockHas(renderHeader, "const xunLeader = fushi.xun_leader_zh || ''", "header separates xun leader from xun-cycle fallback");
assertBlockHas(renderHeader, "(leadPolicy.contextOnly ? 'อ่านประกอบ · ' : '')", "header marks DMY fushi candidate as context-only");
assertBlockHas(renderHeader, "const xunLabel = xunLeader || chart.xun_hour_zh", "header uses xun leader as lead stem before fallback");
assertBlockHas(renderHeader, "_set('qm-pill-xun',  (leadPolicy.contextOnly ? 'อ่านประกอบ · ' : '') + (qmXunDisplay(xunLabel, true) || 'หัวก้านไม่ครบ'))", "header xun pill uses sanitized Thai-first xun display with DMY context prefix");
assertBlockHas(renderHeader, "_set('qm-stat-dun',   qmStemLabel(chart.dun_gan_zh) || '—')", "header stat dun stem uses Thai-first stem label");
assertBlockHas(renderHeader, "_set('qm-pill-dun',  qmStemLabel(chart.dun_gan_zh) || '—')", "header pill dun stem uses Thai-first stem label");
assertBlockNotHas(renderHeader, "xunLeader + '旬'", "header must never append xun suffix to lead-stem value");
assertBlockHas(renderHeader, "_set('qm-pill-clash'", "header sets day/hour clash pill");
assertBlockHas(renderHeader, "qmBranchDisplay(chart.clash?.day?.branch, chart.day_clash_zh)", "header day clash uses Thai branch display");
assertBlockHas(renderHeader, "qmBranchDisplay(chart.clash?.hour?.branch, chart.hour_clash_zh)", "header hour clash uses Thai branch display");
assertBlockHas(renderHeader, "`วัง ${chart.kong_wang_palaces.join('·')} · 宮`", "void palace fallback is Thai-first");
assertBlockHas(context, "qmXiuDisplay(xiu)", "context 28 mansions uses Thai-first mansion helper");
assertBlockHas(palaceExtra, "qmBranchDisplay(chart.voids?.day, chart.void_day_zh, chart.voidDayZh)", "detail void uses fallback branch display");
assertBlockHas(palaceExtra, "qmBranchDisplay(chart.sky_horse?.day?.branch, chart.skyHorse?.day?.branch, chart.traveling_horse_day_zh)", "detail sky horse uses fallback branch display");
assertBlockHas(palaceExtra, "qimenUiFlag(p, 'KONG_WANG'", "detail void uses engine ui_flags as source-of-truth");
assertBlockHas(palaceExtra, "qimenUiFlag(p, 'YI_MA'", "detail horse uses engine ui_flags as source-of-truth");
assertBlockHas(palaceExtra, "qimenUiFlag(p, 'GUI_REN'", "detail nobleman uses engine ui_flags as source-of-truth");
assertBlockHas(palaceExtra, "qimenUiFlag(p, 'RI_SHI_CHONG'", "detail clash uses engine ui_flags as source-of-truth");
assertBlockHas(palaceExtra, "const voidEvidence = qimenUiFlagBranchEvidenceParts(voidFlag", "detail void reads backend branch evidence before fallback");
assertBlockHas(palaceExtra, "const horseEvidence = qimenUiFlagBranchEvidenceParts(horseFlag", "detail horse reads backend branch evidence before fallback");
assertBlockHas(palaceExtra, "const nobleEvidence = qimenUiFlagBranchEvidenceParts(nobleFlag", "detail nobleman reads backend branch evidence before fallback");
assertBlockHas(palaceExtra, "const clashEvidence = qimenUiFlagBranchEvidenceParts(clashFlag", "detail clash reads backend branch evidence before fallback");
assertBlockHas(palaceExtra, "if (hasVoid && voidEvidence.length) voidParts.push(...voidEvidence)", "detail void uses engine evidence when present");
assertBlockHas(palaceExtra, "if (hasHorse && horseEvidence.length) horseHits.push(...horseEvidence)", "detail horse uses engine evidence when present");
assertBlockHas(palaceExtra, "if (hasNoble && nobleEvidence.length) nobleHits.push(...nobleEvidence)", "detail nobleman uses engine evidence when present");
assertBlockHas(palaceExtra, "if (hasClash && clashEvidence.length) clashHits.push(...clashEvidence)", "detail clash uses engine evidence when present");
assertBlockHas(palaceExtra, "qimenGridStateDefs(p).forEach", "detail explains grid state markers");
assertBlockHas(palaceExtra, "ระบบยืนยันป้ายนี้", "detail marks system-confirmed state flags");
assertBlockHas(palaceExtra, "อ่านจากข้อมูลเดิมที่ระบบส่งมา", "detail labels legacy fallback state flags in Thai");
assertBlockHas(palaceExtra, "ประตูถูกวังบีบ", "detail explains MEN_PO in plain Thai");
assertBlockHas(palaceExtra, "พลังถูกเก็บ", "detail explains RU_MU in plain Thai");
assertBlockHas(palaceExtra, "ก้านถูกแรงลงโทษ", "detail explains JI_XING in plain Thai");
assertBlockHas(palaceExtra, "พลังนิ่งซ้ำ", "detail explains FU_YIN in plain Thai");
assertBlockHas(palaceExtra, "พลังย้อนกลับ", "detail explains FAN_YIN in plain Thai");
assertBlockHas(palaceExtra, "qmBranchDisplay(chart.nobleman?.day?.branches, chart.nobleman_day_zh)", "detail nobleman uses fallback branch display");
assertBlockHas(palaceExtra, "palaceHasAnyBranch(p, [chart.nobleman?.day?.branches, chart.nobleman_day_zh])", "detail nobleman match does not let empty direct arrays suppress fallback");
assertBlockHas(palaceExtra, "qmBranchDisplay(chart.clash?.day?.branch, chart.day_clash_zh)", "detail clash uses fallback branch display");
assertBlockNotHas(palaceExtra, "const note = f.note_th || ''", "formation detail must not render raw Thai note directly");
assertBlockHas(palaceExtra, "const note = qimenPublicThaiCopy(f.note_th || f.description_th || f.note", "formation detail sanitizes note before beginner-visible display");
assertBlockHas(formationScope, "qimenDirectionFullLabel(ref)", "formation direction scope uses full Thai direction label");
assertBlockHas(termGuide, "const stemResponse = p?.stem_response || null", "term guide reads real stem response object");
assertBlockHas(termGuide, "const doorZh = qimenDoorZh(p)", "term guide door Chinese fallback uses helper");
assertBlockHas(termGuide, "const starZh = qimenStarZh(p)", "term guide star Chinese fallback uses helper");
assertBlockHas(termGuide, "const deityZh = qimenDeityZh(p)", "term guide deity Chinese fallback uses helper");
assertBlockHas(termGuide, "qimenDoorTh(p)", "term guide door Thai fallback uses helper");
assertBlockHas(termGuide, "qimenStarTh(p)", "term guide star Thai fallback uses helper");
assertBlockHas(termGuide, "qimenDeityTh(p)", "term guide deity Thai fallback uses helper");
assertBlockHas(termGuide, "p?.heaven_stem_zh && p?.earth_stem_zh", "term guide builds stem pair from palace stems");
assertBlockHas(termGuide, "stemResponse.is_source_governed === false", "term guide treats unverified stem as context only");
assertBlockHas(termGuide, "qimenStemIsContextOnly(stemResponse)", "term guide respects stem context-only helper");
assertBlockHas(termGuide, "อ่านประกอบเท่านั้น ไม่ใช่คำตัดสินดีร้าย", "term guide warns on unverified/context-only stem");
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
assertBlockHas(chartContextDetail, "qmPillarDisplay(p, chart, key)", "chart context detail renders four pillars with Thai-first helper and chart-level fallback");
assertBlockHas(chartContextDetail, "เสา <span class=\"tc\">${qmEsc(pillar.zh)}</span>", "chart context detail puts Thai pillar explanation before Chinese pillar");
assertBlockHas(chartContextDetail, "qimenContextPairRow('ช่องว่าง', '空亡'", "chart context detail uses neutral missing-state rows for void");
assertBlockHas(chartContextDetail, "qimenContextPairRow('ม้าเดินทาง', '驛馬'", "chart context detail uses neutral missing-state rows for sky horse");
assertBlockHas(chartContextDetail, "qimenContextPairRow('คนช่วย', '貴人'", "chart context detail uses neutral missing-state rows for nobleman");
assertBlockHas(contextPairRow, "ยังไม่มีข้อมูลจากระบบ", "context pair row has neutral missing-state copy");
assertBlockHas(contextPairRow, "อย่าใช้ข้อนี้ตัดสิน", "context pair row missing-state avoids false verdict");
assertBlockHas(chartContextDetail, "qmBranchDisplay(chart.voids?.day, chart.void_day_zh, chart.voidDayZh)", "chart context detail void day uses fallback branch display");
assertBlockHas(chartContextDetail, "qmBranchDisplay(chart.sky_horse?.day?.branch, chart.skyHorse?.day?.branch, chart.traveling_horse_day_zh, chart.traveling_horse_zh)", "chart context detail sky horse uses fallback branch display");
assertBlockHas(chartContextDetail, "qmBranchDisplay(chart.nobleman?.day?.branches, chart.nobleman_day_zh)", "chart context detail nobleman uses fallback branch display");
assertBlockHas(chartContextDetail, "qmBranchDisplay(chart.clash?.day?.branch, chart.day_clash_zh)", "chart context detail clash uses fallback branch display");
assertBlockHas(chartContextDetail, "chart.twenty_eight || chart.twentyEight || chart.xiu", "chart context detail supports 28 mansion aliases");
assertBlockHas(chartContextDetail, "qmXiuDisplay(xiu)", "chart context detail renders 28 mansions with Thai-first helper");
assertBlockHas(chartContextDetail, "ไม่ใช่คำตัดสินเฉพาะวังนี้", "chart context detail caveat keeps chart context separate from palace verdict");
assertBlockHas(chartContextDetail, "รอบ<span class=\"tc\">旬</span>", "chart context xun label is Thai-first");
assertBlockHas(chartContextDetail, "ช่องว่าง <span class=\"tc\">空亡</span>", "chart context void label is Thai-first");
assertBlockNotHas(chartContextDetail, "· 旬 <span", "chart context must not use Chinese-only xun label");
assertBlockHas(lineageDetail, "const chart = last?.chart || {}", "lineage detail reads chart from last packet");
assertBlockHas(lineageDetail, "chart.system_type", "lineage detail reads engine system_type");
assertBlockHas(lineageDetail, "chart.system_type\n      ? qimenSystemMeta(chart.system_type)", "lineage detail does not invent system type when engine omits it");
assertBlockHas(lineageDetail, "chart.plate_method || chart.chart_variant || chart.chart_type", "lineage detail reads engine plate/chart variant");
assertBlockHas(lineageDetail, "qimenAlgorithmLabel(chart.algorithm_method)", "lineage detail reads engine algorithm method only");
assertBlockHas(lineageDetail, "chart.deity_variant", "lineage detail reads engine deity variant");
assertBlockHas(lineageDetail, "chart.api_capabilities?.qimen_context_flags", "lineage detail reads context flag policy");
assertBlockHas(lineageDetail, "chart.temporal_context_policy", "lineage detail reads temporal context policy");
assertBlockHas(lineageDetail, "chart.qimen_source_trace", "lineage detail reads source trace packet");
assertBlockHas(lineageDetail, "qimenDisplayFushi(chart)", "lineage detail reads policy-governed fushi packet");
assertBlockHas(lineageDetail, "const fushiLeadXun = qmXunDisplay(fushi.xun_leader_zh, true)", "lineage detail sanitizes fushi lead xun before display");
assertBlockHas(lineageDetail, "const fushiDunStem = qmStemLabel(fushi.xun_yi_zh)", "lineage detail sanitizes fushi dun stem before display");
assertBlockHas(lineageDetail, "ระบบผัง <span class=\"tc\">局類</span>", "lineage detail labels chart system Thai-first");
assertBlockHas(lineageDetail, "วิธีวางผัง <span class=\"tc\">排盤法</span>", "lineage detail labels plate method Thai-first");
assertBlockHas(lineageDetail, "รูปแบบผัง <span class=\"tc\">盤式</span>", "lineage detail labels chart variant Thai-first");
assertBlockHas(lineageDetail, "สายเทพ <span class=\"tc\">八神派</span>", "lineage detail labels deity lineage Thai-first");
assertBlockHas(lineageDetail, "นโยบายป้ายเวลา/บริบท <span class=\"tc\">標記政策</span>", "lineage detail explains context policy Thai-first");
assertBlockHas(lineageDetail, "ค่าหัวผังจาก CText <span class=\"tc\">符使</span>", "lineage detail labels fushi source Thai-first");
assertBlockNotHas(lineageDetail, "qmEsc(fushi.xun_leader_zh", "lineage detail must not render raw xun leader");
assertBlockNotHas(lineageDetail, "qmEsc(fushi.xun_yi_zh", "lineage detail must not render raw dun stem");
assertBlockHas(lineageDetail, "แหล่งอ้างอิง <span class=\"tc\">來源包</span>", "lineage detail labels source package Thai-first");
assertBlockHas(lineageDetail, "ข้อควรระวังจากระบบ <span class=\"tc\">注意</span>", "lineage detail caveat label is Thai-first Chinese-second");
assertBlockHas(lineageDetail, "scoreEffectText", "lineage detail maps score effect to Thai copy");
assertBlockHas(lineageDetail, "qimenScoreEffectText(scoreEffect)", "lineage detail localizes all score_effect enums");
assertHas("function qimenScoreEffectText", "score effect enum localizer exists");
assertBlockHas(scoreEffectText, "return 'ไม่มีผลกับคะแนน'", "score effect localizer maps no-score policy to Thai");
assertBlockHas(scoreEffectText, "return 'มีผลประกอบแบบเบา ต้องอ่านร่วมกับกฎหลัก'", "score effect localizer maps additive/minor policy to Thai");
assertBlockHas(scoreEffectText, "return 'ต้องตรวจนโยบายคะแนนจากระบบก่อนใช้'", "score effect localizer hides unknown raw enum values");
assertBlockHas(lineageDetail, "ไม่เปลี่ยนคะแนนเดิมของระบบ", "lineage detail says context labels do not mutate score in learner Thai");
assertBlockNotHas(lineageDetail, "`ผลกับคะแนน: ${scoreEffect}`", "lineage detail must not render raw score_effect enum");
assertBlockHas(lineageDetail, "อ่านประกอบ ไม่ใช้เป็นคะแนนดีร้ายเดี่ยว", "lineage detail warns lineage is not a standalone verdict");
assertBlockHas(lineageDetail, "หน้าเว็บไม่ย้ายวัง ไม่ตั้งผัง และไม่คำนวณสูตรเพิ่มเอง", "lineage detail states frontend display-only boundary");
assertBlockNotHas(lineageDetail, "file_path", "lineage detail must not expose file paths");
assertBlockNotHas(lineageDetail, "source_path", "lineage detail must not expose raw source paths");
assertBlockNotHas(lineageDetail, "getCurrentSystemType()", "lineage detail must not read UI system state");
assertBlockNotHas(lineageDetail, "getCurrentSchool()", "lineage detail must not read UI school state");
assertBlockNotHas(lineageDetail, "<span class=\"tc\"> caveat</span>", "lineage detail must not use English technical label as Chinese secondary text");
assertHas("function buildQimenClassicalCoverageHtml", "classical detector coverage detail helper exists");
assertHas("ตัวตรวจสูตรลึก · 格局/四害", "classical detector coverage summary is Thai-first");
assertBlockHas(classicalCoverageDetail, "chart?.classical_p0?.coverage", "classical coverage detail reads engine classical_p0 coverage packet");
assertBlockHas(classicalCoverageDetail, "coverage.detectors", "classical coverage detail reads detector list");
assertBlockHas(classicalCoverageDetail, "item.category === 'guard_flag'", "classical coverage detail separates guard detector family");
assertBlockHas(classicalCoverageDetail, "item.category === 'advanced_formation'", "classical coverage detail separates advanced formation family");
assertBlockHas(classicalCoverageDetail, "qimenKnownTraceLabel(item.code", "classical coverage detail falls back through Thai learner dictionary before raw codes");
assertBlockHas(classicalCoverageDetail, "known?.th || 'สูตรที่ระบบตรวจได้'", "classical coverage detail avoids raw detector code as Thai fallback");
assertBlockHas(classicalCoverageDetail, "known?.zh || ''", "classical coverage detail uses dictionary Chinese fallback");
assertBlockHas(classicalCoverageDetail, "ความพร้อมตัวตรวจสูตรลึก <span class=\"tc\">格局/四害</span>", "classical coverage detail labels readiness in Thai");
assertBlockHas(classicalCoverageDetail, "สูตรเตือนที่ระบบตรวจได้ <span class=\"tc\">四害/警示</span>", "classical coverage detail labels guard formulas in Thai");
assertBlockHas(classicalCoverageDetail, "รูปแบบขั้นสูงที่ระบบตรวจได้ <span class=\"tc\">吉格/三遁</span>", "classical coverage detail labels advanced formulas in Thai");
assertBlockHas(classicalCoverageDetail, "ชุดแหล่งอ้างอิง <span class=\"tc\">來源</span>", "classical coverage detail shows bounded source count");
assertBlockHas(classicalCoverageDetail, "ไม่แสดง path ไฟล์ในหน้าเว็บ", "classical coverage detail hides raw source paths");
assertBlockHas(classicalCoverageDetail, "coverage.caveat_th", "classical coverage detail renders engine Thai caveat");
assertBlockHas(classicalCoverageDetail, "ไม่มีผลกับคะแนน", "classical coverage detail states no score effect in Thai");
assertBlockHas(classicalCoverageDetail, "ห้ามอ้างว่าสูตรใดเกิดจริง", "classical coverage detail blocks coverage-as-active-formula misuse");
assertBlockHas(classicalCoverageDetail, "qmEsc(th)", "classical coverage detail escapes Thai detector labels");
assertBlockHas(classicalCoverageDetail, "qmEsc(zh)", "classical coverage detail escapes Chinese detector labels");
assertBlockNotHas(classicalCoverageDetail, "item.code || 'สูตรที่ระบบตรวจได้'", "classical coverage detail must not show raw detector code as Thai fallback");
assertBlockNotHas(classicalCoverageDetail, "local_path", "classical coverage detail must not expose local source paths");
assertBlockNotHas(classicalCoverageDetail, "file_path", "classical coverage detail must not expose file paths");
assertBlockNotHas(classicalCoverageDetail, "source_path", "classical coverage detail must not expose raw source paths");
const coverageRuntime = new Function(`
${qmEscRuntime}
${knownTraceLabel}
${classicalCoverageDetail}
return { buildQimenClassicalCoverageHtml };
`)() as {
  buildQimenClassicalCoverageHtml: (last: Record<string, unknown>) => string;
};
const coverageFallbackHtml = coverageRuntime.buildQimenClassicalCoverageHtml({
  chart: {
    classical_p0: {
      coverage: {
        status_th: "ทดสอบ fallback",
        families: { guard_flags: 1, advanced_formations: 1, total: 2 },
        detectors: [
          { code: "MEN_PO", category: "guard_flag" },
          { code: "QING_LONG_FAN_SHOU", category: "advanced_formation" },
        ],
      },
    },
  },
});
assert(coverageFallbackHtml.includes("ประตูข่มวัง") && coverageFallbackHtml.includes("門迫"), "runtime classical coverage fallback maps MEN_PO to Thai-first Chinese-secondary label");
assert(coverageFallbackHtml.includes("มังกรเขียวหันกลับ") && coverageFallbackHtml.includes("青龍返首"), "runtime classical coverage fallback maps QING_LONG_FAN_SHOU to Thai-first Chinese-secondary label");
assert(!coverageFallbackHtml.includes("MEN_PO"), "runtime classical coverage fallback must not expose raw MEN_PO code");
assert(!coverageFallbackHtml.includes("QING_LONG_FAN_SHOU"), "runtime classical coverage fallback must not expose raw QING_LONG_FAN_SHOU code");
assertBlockHas(detail, "const beginnerExtras = quickHtml", "detail starts beginner extras with quick read");
assertBlockHas(detail, "+ buildChartReadinessNoticeHtml(last)", "detail keeps chart readiness in beginner extras");
assertBlockHas(detail, "+ buildLeadPalaceRoleHtml(p, last)", "detail keeps lead-palace DMY guard in beginner extras");
assertBlockHas(detail, "const proExtras = buildPalaceTermGuideHtml(p)", "detail moves term guide into pro extras");
assertBlockHas(detail, "+ buildChartContextDetailHtml(last)", "detail moves full chart context into pro extras");
assertBlockHas(detail, "+ buildQimenLineageHtml(last)", "detail moves lineage into pro extras");
assertBlockHas(detail, "const lang = 'th'", "detail drawer locks Thai-first locale");
assertBlockNotHas(detail, "lang==='zh' ? starCn", "detail drawer must not render Chinese-only star names by locale");
assertBlockNotHas(detail, "p['star_name_'+lang]", "detail drawer must not select English/Chinese localized star name");
assertBlockHas(detail, "const starName  = qimenStarTh(p)", "detail star uses Thai fallback helper");
assertBlockHas(detail, "const doorName  = qimenDoorTh(p)", "detail door uses Thai fallback helper");
assertBlockHas(detail, "const deityName = qimenDeityTh(p)", "detail deity uses Thai fallback helper");
assertBlockHas(detail, "ก้านบน/ก้านล่าง · 天盤干/地盤干", "detail stem row label is beginner Thai-first");
assertBlockHas(detail, "const starCn   = qimenStarZh(p)", "detail star label avoids raw star code fallback");
assertBlockHas(detail, "const doorCn   = qimenDoorZh(p)", "detail door label avoids raw door code fallback");
assertBlockHas(detail, "const deityCn  = qimenDeityZh(p)", "detail deity label avoids raw deity code fallback");
assertBlockNotHas(detail, "dirCode ? `<span", "detail title must not show raw compass code");
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
assertBlockNotHas(renderPalaces, "buildQimenClassicalCoverageHtml(", "palace grid must not render classical coverage detail");
assertBlockNotHas(renderPalaces, "buildP0SourceTraceHtml(", "palace grid must not render source trace detail");
assertBlockNotHas(renderPalaces, "buildStemResponseHtml(", "palace grid must not render stem response detail");
assertBlockHas(renderPalaces, "const star = qimenStarZh(p) || '—'", "palace grid star avoids raw code fallback");
assertBlockHas(renderPalaces, "const door = qimenDoorZh(p) || '—'", "palace grid door avoids raw code fallback");
assertBlockHas(renderPalaces, "const dty  = qimenDeityZh(p) || '—'", "palace grid deity avoids raw code fallback");
assertBlockHas(renderPalaces, "const palaceTitle =", "palace grid exposes full Thai direction in title/aria only");
assertBlockHas(renderPalaces, "aria-label=\"${qmEsc(palaceTitle)}\"", "palace grid has accessible full Thai label");
assertBlockHas(renderPalaces, "const sHHtml = qmEsc(sH)", "palace grid escapes heaven stem before innerHTML");
assertBlockHas(renderPalaces, "const sEHtml = qmEsc(sE)", "palace grid escapes earth stem before innerHTML");
assertBlockHas(renderPalaces, "const starHtml = qmEsc(star)", "palace grid escapes Chinese star before innerHTML");
assertBlockHas(renderPalaces, "const doorHtml = qmEsc(door)", "palace grid escapes Chinese door before innerHTML");
assertBlockHas(renderPalaces, "const dtyHtml = qmEsc(dty)", "palace grid escapes Chinese deity before innerHTML");
assertBlockHas(renderPalaces, "const starNameHtml = qmEsc(starName)", "palace grid escapes Thai star before innerHTML");
assertBlockHas(renderPalaces, "const doorNameHtml = qmEsc(doorName)", "palace grid escapes Thai door before innerHTML");
assertBlockHas(renderPalaces, "const deityNameHtml = qmEsc(deityName)", "palace grid escapes Thai deity before innerHTML");
assertBlockHas(renderPalaces, "const dirHtml = qmEsc(dir)", "palace grid escapes direction before innerHTML");
assertBlockHas(renderPalaces, "const trigZhHtml = qmEsc(trigZh)", "palace grid escapes trigram before innerHTML");
assertBlockHas(renderPalaces, "<div class=\"th\">${starNameHtml}</div>", "palace grid renders escaped Thai star");
assertBlockHas(renderPalaces, "<div class=\"cn\">${starHtml}</div>", "palace grid renders escaped Chinese star");
assertBlockHas(renderPalaces, "<div class=\"p-trig\">${trigZhHtml} ${dirHtml}</div>", "palace grid renders escaped trigram and direction");
assertBlockNotHas(renderPalaces, "p.star_zh || p.star_code", "palace grid must not expose raw star code");
assertBlockNotHas(renderPalaces, "p.door_zh || p.door_code", "palace grid must not expose raw door code");
assertBlockNotHas(renderPalaces, "p.deity_zh || p.deity_code", "palace grid must not expose raw deity code");
assertBlockNotHas(renderPalaces, "<div class=\"th\">${starName}</div>", "palace grid must not render raw Thai star");
assertBlockNotHas(renderPalaces, "<div class=\"cn\">${star}</div>", "palace grid must not render raw Chinese star");
assertBlockNotHas(renderPalaces, "<div class=\"th\">${doorName}</div>", "palace grid must not render raw Thai door");
assertBlockNotHas(renderPalaces, "<div class=\"cn\">${door}</div>", "palace grid must not render raw Chinese door");
assertBlockNotHas(renderPalaces, "<div class=\"th\">${deityName}</div>", "palace grid must not render raw Thai deity");
assertBlockNotHas(renderPalaces, "<div class=\"cn\">${dty}</div>", "palace grid must not render raw Chinese deity");
assertBlockNotHas(renderPalaces, "<div class=\"p-trig\">${trigZh} ${dir}</div>", "palace grid must not render raw trigram/direction");
assertBlockNotHas(renderPalaces, "door_description", "palace grid must not render long door descriptions");
assertBlockNotHas(renderPalaces, "star_description", "palace grid must not render long star descriptions");
assertBlockNotHas(renderPalaces, "deity_advice", "palace grid must not render long deity advice");
assertBlockNotHas(renderPalaces, "door_action_advice", "palace grid must not render long door action advice");
assertBlockNotHas(renderPalaces, "door_situation_role", "palace grid must not render long door role");
assertBlockNotHas(renderPalaces, "stem_combo_description", "palace grid must not render long stem combo description");
assertBlockNotHas(renderPalaces, "door_description_th", "palace grid must not render Thai door descriptions");
assertBlockNotHas(renderPalaces, "star_description_th", "palace grid must not render Thai star descriptions");
assertBlockNotHas(renderPalaces, "deity_advice_th", "palace grid must not render Thai deity advice");
assertBlockNotHas(renderPalaces, "buildChartReadinessNoticeHtml(", "palace grid must not render DMY readiness detail");
assertBlockNotHas(renderFormations, "const rawNote = f.note_th || ''", "formation list must not render raw Thai note directly");
assertBlockNotHas(renderFormations, "f.note || f.reason", "formation list must not render raw note/reason");
assertBlockHas(renderFormations, "const rawNote = qimenPublicThaiCopy(f.note_th || f.description_th || f.note", "formation list sanitizes note before display");
assertBlockHas(renderFormations, "ใช้ดูเป็นข้อมูลประกอบเท่านั้น", "formation list has Thai fallback note");
assertBlockHas(renderFormations, "<span>${qmEsc(nameTh)}</span>", "formation list escapes Thai name");
assertBlockHas(renderFormations, "${qmEsc(nameZh)}</span>", "formation list escapes Chinese name");
assertBlockHas(renderFormations, "${qmEsc(note)}</div>", "formation list escapes note");
assertBlockNotHas(renderFormations, "<span>${nameTh}</span>", "formation list must not interpolate raw Thai name");
assertBlockNotHas(renderFormations, "${nameZh}</span>", "formation list must not interpolate raw Chinese name");
assertBlockNotHas(renderFormations, "${note}</div>", "formation list must not interpolate raw note");
assertHas("function qimenStemIsContextOnly", "stem context-only helper exists");
assertBlockHas(stemContext, "engine_readiness?.stem_response_policy === 'context_only'", "stem helper respects engine readiness policy");
assertHas("function qimenStemContextOnlyText", "stem context-only Thai fallback helper exists");
assertHas("function qimenNormalizeCheckNextItem", "frontend normalizes stale context-only check_next copy");
assertHas("function qimenCheckNextItems", "frontend wraps check_next rendering");
assertBlockHas(quickRead, "const stemResponse = p?.stem_response || null", "quick read keeps real stem_response object");
assertBlockHas(quickRead, "qimenDoorZh(p)", "quick read door Chinese fallback uses helper");
assertBlockHas(quickRead, "qimenStarZh(p)", "quick read star Chinese fallback uses helper");
assertBlockHas(quickRead, "qimenDeityZh(p)", "quick read deity Chinese fallback uses helper");
assertBlockHas(quickRead, "qimenDoorTh(p)", "quick read door Thai fallback uses helper");
assertBlockHas(quickRead, "qimenStarTh(p)", "quick read star Thai fallback uses helper");
assertBlockHas(quickRead, "qimenDeityTh(p)", "quick read deity Thai fallback uses helper");
assertBlockHas(quickRead, "สถานะวัง:", "quick read status label avoids overconfident answer copy");
assertBlockHas(quickRead, "ก้านบน/ก้านล่าง:", "quick read stem label is beginner Thai-first");
assertBlockNotHas(quickRead, "คำตอบเร็ว:", "quick read must not sound like an absolute verdict");
assertBlockNotHas(quickRead, "p?.stem_response?.is_source_governed", "quick read must not hide existing non-source-governed stem_response");
assertBlockHas(quickRead, "qimenStemIsContextOnly(stemResponse)", "quick read uses context-only stem branch");
assertBlockHas(quickRead, "stemResponse.title_th || stemResponse.status_th", "quick read renders stem title/status Thai-first");
assertBlockHas(quickRead, "stemResponse.beginner_th || stemResponse.status_th", "quick read renders beginner/status Thai-first");
assertBlockHas(quickRead, "stemResponse.caveat_th", "quick read renders stem caveat when stem_response exists");
assertBlockHas(guide, "qimenCheckNextItems(reading, p)", "reading guide uses normalized check_next copy");
assertBlockHas(guide, "qimenReasonLabel(r)", "reading guide normalizes reason labels through Thai fallback");
assertBlockHas(reasonLabel, "qimenKnownTraceLabel", "reason fallback uses known-code Thai label mapping");
assertBlockHas(reasonLabel, "qimenPublicThaiCopy", "reason label sanitizes Thai labels before beginner display");
assertBlockHas(reasonLabel, "qimenPublicZhCopy", "reason label sanitizes Chinese labels before beginner display");
assertBlockHas(reasonLabel, "|| 'ข้อมูลประกอบ'", "reason fallback never renders Chinese-only label");
assertBlockHas(beginnerReading, "summary_th: qimenPublicThaiCopy(r.summary_th", "beginner summary is sanitized before display");
assertBlockHas(beginnerReading, "check_next: Array.isArray(r.check_next) ? r.check_next.map(x => qimenPublicThaiCopy(x", "beginner check_next is sanitized before display");
assertBlockHas(beginnerReading, "caveat_th: qimenPublicThaiCopy(r.caveat_th", "beginner caveat is sanitized before display");
assertBlockHas(beginnerVerdict, "qimenBeginnerIsContextOnly(reading)", "context-only beginner reading does not fall back to score verdict");
assertBlockHas(beginnerLabel, "ต้องดูบริบท", "context-only beginner label is Thai-first");
assertBlockHas(stemDetail, "r.caveat_th ||", "stem detail keeps caveat Thai-first");
assertBlockHas(stemDetail, "const isContext = qimenStemIsContextOnly(r)", "stem detail detects context-only stem");
assertBlockHas(stemDetail, "const cls = isContext ? 'warn'", "context-only stem card is visually warned");
assertBlockHas(stemDetail, "อ่านประกอบเท่านั้น <span class=\"tc\">不作斷</span>", "context-only stem status is explicit");
assertBlockHas(stemDetail, "ไม่ใช่คำตัดสินดีร้าย", "context-only stem says not a verdict");
assertBlockHas(stemDetail, "Array.isArray(r.source_trace) ? r.source_trace : (Array.isArray(r.source_refs) ? r.source_refs : [])", "stem detail accepts source_trace and source_refs");
assertBlockHas(stemDetail, "qmPublicLineRange(s.line_range)", "stem detail sanitizes line_range before rendering");
assertBlockHas(stemDetail, "const detail = r.detail_th", "stem detail keeps full stem prose in Pro details");
assertBlockHas(stemDetail, "คำอธิบายเต็มของก้าน · 十干克應全文", "stem full detail is Pro-only");
assertBlockNotHas(stemDetail, "const detailRow = r.detail_th", "stem full detail must not render in normal beginner card");
assertHas("function buildStemReadinessHtml", "stem readiness pro detail helper");
assertHas("สถานะสูตรของก้าน · 公式狀態", "stem readiness pro summary is Thai-first");
assertHas("ใช้ฟันธง: ไม่ได้", "stem readiness verdict disabled copy");
assertBlockHas(stemReadiness, "qimenReadinessConfidenceLabel(rd.formula_confidence)", "stem readiness confidence goes through Thai localizer");
assertBlockHas(stemReadiness, "qimenReadinessLayerLabel(rd.stem_layer)", "stem readiness layer goes through Thai localizer");
assertBlockHas(stemReadiness, "qimenReadinessPolicyLabel(rd.stem_response_policy)", "stem readiness policy goes through Thai localizer");
assertBlockNotHas(stemReadiness, "qmEsc(rd.formula_confidence)", "stem readiness must not expose raw formula confidence");
assertBlockNotHas(stemReadiness, "qmEsc(rd.stem_layer)", "stem readiness must not expose raw stem layer");
assertBlockNotHas(stemReadiness, "qmEsc(rd.stem_response_policy)", "stem readiness must not expose raw policy enum");
assertHas("function buildChartReadinessNoticeHtml", "chart readiness notice helper exists");
assertHas("ผังวัน/เดือน/ปีแบบอ่านประกอบ ยังไม่ใช่สูตรก้านเต็ม", "DMY preliminary formula confidence is localized");
assertHas("ก้านชั้นตั้งผังเบื้องต้น ห้ามอ่านเป็นปฏิกิริยาก้านเต็ม 十干克應", "DMY preliminary stem layer is localized");
assertNotHas("ห้ามใช้คู่ก้านหรือ格局", "DMY readiness caveat must be Thai-first before Chinese term");
assertHas("ห้ามใช้คู่ก้านหรือรูปแบบพิเศษ 格局", "DMY readiness caveat explains 格局 in Thai first");
assertBlockHas(chartReadinessNotice, "normalizeQimenSystemType(chart.system_type || chart.chart_type || getCurrentSystemType())", "chart readiness notice checks system type");
assertBlockHas(chartReadinessNotice, "systemType === 'day' || systemType === 'month' || systemType === 'year'", "chart readiness notice targets DMY charts");
assertBlockHas(chartReadinessNotice, "qimenReadinessConfidenceLabel(readiness.formula_confidence || chart.formula_confidence)", "chart readiness confidence goes through Thai localizer");
assertBlockHas(chartReadinessNotice, "qimenReadinessLayerLabel(readiness.stem_layer || chart.stem_layer_status)", "chart readiness stem layer goes through Thai localizer");
assertBlockHas(chartReadinessNotice, "qimenReadinessPolicyLabel(readiness.stem_response_policy || chart.stem_response_policy)", "chart readiness policy goes through Thai localizer");
assertBlockHas(chartReadinessNotice, "qimenPublicThaiCopy(readiness.label_th || scope.calculation_scope_th", "chart readiness Thai label is sanitized");
assertBlockHas(chartReadinessNotice, "qimenPublicZhCopy(readiness.label_zh", "chart readiness Chinese label is sanitized");
assertBlockHas(chartReadinessNotice, "ใช้ฟันธง:</b> ${verdictAllowed ? 'ใช้ประกอบได้เมื่ออ่านร่วมทั้งผัง' : 'ไม่ได้ · อ่านประกอบเท่านั้น'}", "chart readiness notice makes verdict policy visible");
assertBlockNotHas(chartReadinessNotice, "qmEsc(readiness.formula_confidence", "chart readiness must not expose raw formula confidence");
assertBlockNotHas(chartReadinessNotice, "qmEsc(readiness.stem_layer", "chart readiness must not expose raw stem layer");
assertBlockNotHas(chartReadinessNotice, "qmEsc(readiness.stem_response_policy", "chart readiness must not expose raw policy enum");
assertHas("qimenScoreLevelText(p)", "localized score level formatter");
assertHas("ตัวตรวจคลาสสิก", "Thai source key label");
assertHas("สัญญาณเสริมระบบ", "Thai p0 flag source label");
assertHas("function qmPublicEvidenceText", "public source text sanitizer exists");
assertHas("function qimenPublicThaiCopy", "public Thai copy sanitizer exists");
assertHas("function qimenPublicZhCopy", "public Chinese copy sanitizer exists");
assertHas("function qmPublicLineRange", "public line range sanitizer exists");
assertHas("function qmNegatedByLabel", "negated-by label sanitizer exists");
assertBlockHas(textLooksInternalPath, "data|docs|doc|scripts|test|tests|qimen-api|decode-app|releases|node_modules|\\.next", "path sanitizer blocks relative internal roots");
assertBlockHas(textLooksInternalPath, "source_path|local_path", "path sanitizer blocks explicit source path fields");
assertHas("const src = qmPublicEvidenceText(item.source_label_th) || qmTraceSourceLabel(item) || qmSourceLabel(item)", "Thai source key label is sanitized before display");
assertHas("function qimenStemSourceLabel", "stem source label helper exists");
assertHas("return 'ตำราก้านฟ้า'", "stem source fallback is Thai learner copy");
assertHas("function qimenFormationLabel", "formation label helper exists");
assertBlockHas(formationLabel, "qimenPublicThaiCopy", "formation label sanitizes Thai label fields");
assertBlockHas(formationLabel, "qimenPublicZhCopy", "formation label sanitizes Chinese label fields");
assertHas("function qimenFormationScopeLabel", "formation scope helper exists");
assertHas("รูปแบบพิเศษ", "formation fallback uses plain Thai learner copy");
assertNotHas("รูปเกมพิเศษ", "formation fallback must not use colloquial unclear copy");
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
assertHas(".verdict-card.context", "context verdict card has distinct non-green styling");
assertHas(".qm-quick-read.context", "context quick read has distinct non-green styling");
assertHas(".qm-detail-extra.context", "context detail card has distinct non-green styling");
assertBlockHas(beginnerReading, "is_actionable: r.is_actionable !== false", "beginner reading preserves API non-actionable verdict guard");
assertBlockHas(beginnerReading, "verdict_allowed: r.verdict_allowed !== false", "beginner reading preserves API verdict_allowed guard");
assertBlockHas(beginnerReading, "const hasScore = qimenHasEngineScore(p)", "beginner reading fallback preserves legacy packet score evidence");
assertBlockHas(beginnerReading, "has_engine_score: r.has_engine_score === false ? false : hasScore", "beginner reading only disables score when API explicitly says false");
assertBlockHas(beginnerReading, "code: r.code || (hasScore ? 'score_only' : 'context')", "API beginner reading without code uses score fallback when score exists");
assertBlockHas(beginnerReading, "tone: r.tone || (hasScore ? '' : 'context')", "API beginner reading without tone does not force context when score exists");
assertBlockHas(beginnerReading, "code: hasScore ? 'score_only' : 'context'", "fallback score packet is not forced into context-only");
assertBlockHas(beginnerReading, "is_actionable: hasScore", "fallback score packet can stay actionable when score exists");
assertBlockHas(beginnerReading, "verdict_allowed: hasScore", "fallback score packet can keep verdict when score exists");
assertBlockHas(chartContextGuard, "['day','month','year'].includes(systemType)", "chart context guard applies to DMY scopes");
assertBlockHas(chartContextGuard, "normalizeQimenSystemType(chart?.system_type || chart?.chart_type || '')", "chart context guard accepts chart_type fallback through normalizer");
assertBlockNotHas(chartContextGuard, "|| !!chart?.dmy_fushi_context", "chart context guard must not force hour charts just because stale DMY metadata exists");
assertBlockHas(chartContextGuard, "return !verdictAllowed", "chart context guard only releases DMY after explicit verdict allowance");
assertBlockHas(applyChartContextGuard, "code: 'context_only'", "chart context guard forces context-only reading");
assertBlockHas(applyChartContextGuard, "label_th: 'อ่านประกอบเท่านั้น'", "chart context guard labels DMY reading as context-only");
assertBlockHas(applyChartContextGuard, "summary_th: caveat", "chart context guard replaces stale actionable summary with caveat only");
assertBlockNotHas(applyChartContextGuard, "summary ? `${summary} · ${caveat}` : caveat", "chart context guard must not append stale original summary");
assertBlockHas(applyChartContextGuard, "has_engine_score: false", "chart context guard prevents score fallback verdict");
assertHas("function qimenReadingScoreCopy", "context-aware score copy helper exists");
assertBlockHas(readingScoreCopy, "const contextOnly = qimenBeginnerIsContextOnly(reading)", "score copy helper reads guarded beginner state");
assertBlockHas(readingScoreCopy, "const dmyContext = qimenChartContextGuard(chart)", "score copy helper detects DMY context guard");
assertBlockHas(readingScoreCopy, "อ่านประกอบเท่านั้น ไม่ใช้ฟันธง ต้องเช็กผังยาม 時家 ก่อนลงมือ", "score copy helper makes DMY score non-actionable");
assertBlockHas(readingScoreCopy, "ไม่เปลี่ยนคะแนนเดิม", "score copy helper states display-only score policy");
assertBlockHas(detailMode, "window._qimenDetailMode === 'pro' ? 'pro' : 'beginner'", "detail drawer defaults to beginner mode");
assertBlockHas(detailModeToggle, "data-qm-detail-mode=\"beginner\"", "detail mode toggle exposes beginner mode");
assertBlockHas(detailModeToggle, "data-qm-detail-mode=\"pro\"", "detail mode toggle exposes pro mode");
assertBlockHas(detailModeToggle, "โหมดอ่านง่ายซ่อนสูตรเต็มไว้ก่อน", "beginner mode explains that pro formula details are hidden");
assertBlockHas(detail, "const detailMode = qimenDetailMode()", "detail render reads detail mode");
assertBlockHas(detail, "const detailModeClass = detailMode === 'pro' ? 'pro-mode' : 'beginner-mode'", "detail render maps mode to shell class");
assertBlockHas(detail, "const beginnerReading = qimenApplyChartContextGuard(qimenBeginnerReading(p), last.chart)", "detail drawer applies DMY chart context guard before verdict class");
assertBlockHas(detail, "const usageHtml = buildPalaceUsageAdviceHtml(p, last, beginnerReading, verdictClass)", "detail drawer builds Thai-first usage advice from selected palace");
assertBlockHas(guide, "const reading = guardedReading || qimenApplyChartContextGuard(qimenBeginnerReading(p), chart)", "reading guide reuses guarded DMY reading");
assertBlockHas(quickRead, "const scoreCopy = qimenReadingScoreCopy(p, reading, last?.chart)", "quick read uses context-aware score copy");
assertBlockHas(guide, "const scoreCopy = qimenReadingScoreCopy(p, reading, chart)", "reading guide uses context-aware score copy");
assertBlockHas(detail, "const scoreCopy = qimenReadingScoreCopy(p, beginnerReading, last.chart)", "main detail score row uses context-aware score copy");
assertBlockHas(detail, "qmEsc(scoreCopy.detail)", "main detail score output is escaped and context-aware");
assertBlockHas(detail, "const beginnerExtras = quickHtml", "detail drawer builds beginner extras separately");
assertBlockHas(detail, "+ usageHtml", "detail drawer places usage advice in beginner extras");
assertBlockHas(detail, "+ buildChartReadinessNoticeHtml(last)", "beginner extras keep readiness/caveat visible");
assertBlockHas(detail, "+ buildPalaceReadingGuideHtml(p, last, verdictClass, beginnerReading)", "beginner extras pass guarded reading into Thai learner guide");
assertBlockHas(detail, "const proExtras = buildPalaceTermGuideHtml(p)", "detail drawer builds pro extras separately");
assertBlockHas(detail, "+ buildStemResponseHtml(p)", "pro extras contain full stem response");
assertBlockHas(detail, "+ buildChartContextDetailHtml(last)", "pro extras contain full chart-time context");
assertBlockHas(detail, "+ buildQimenLineageHtml(last)", "pro extras contain lineage/source block");
assertBlockHas(detail, "+ buildP0SourceTraceHtml(p, last)", "pro extras contain source trace");
assertBlockHas(detail, "const extraHtml = detailMode === 'pro' ? beginnerExtras + proExtras : beginnerExtras", "beginner mode does not render pro-heavy extras");
assertBlockHas(detail, "<div class=\"qm-detail-shell ${detailModeClass}\">", "detail render wraps drawer with mode shell");
assertBlockHas(detail, "${qimenDetailModeToggleHtml(detailMode)}", "detail render includes mode toggle");
assertHas(".qm-detail-shell.beginner-mode .qm-pro-details{display:none;}", "beginner mode hides Pro-only formula details");
assertHas("button[data-qm-detail-mode]", "detail mode click delegation exists");
assertBlockNotHas(renderPalaces, "getCurrentLang()", "palace grid must not switch away from Thai-first labels by locale");
assertBlockHas(renderPalaces, "const starName  = qimenStarTh(p)", "grid star label is Thai-first");
assertBlockHas(renderPalaces, "const doorName  = qimenDoorTh(p)", "grid door label is Thai-first");
assertBlockHas(renderPalaces, "const deityName = qimenDeityTh(p)", "grid deity label is Thai-first");
assertBlockHas(renderPalaces, "<div class=\"th\">${starNameHtml}</div>\n          <div class=\"cn\">${starHtml}</div>", "grid star renders escaped Thai label before Chinese glyph");
assertBlockHas(renderPalaces, "<div class=\"th\">${doorNameHtml}</div><div class=\"cn\">${doorHtml}</div>", "grid door renders escaped Thai label before Chinese glyph");
assertBlockHas(renderPalaces, "<div class=\"th\">${deityNameHtml}</div><div class=\"cn\">${dtyHtml}</div>", "grid deity renders escaped Thai label before Chinese glyph");
assertBlockHas(renderPalaces, "qimenDeityTh(p)", "grid title/render uses normalized deity Thai label");
assertHas(".palace.q10x .p-star .th{font-family:var(--thai);font-size:12px;font-weight:700;color:var(--fg)", "grid star Thai label is visually primary on desktop");
assertHas(".palace.q10x .p-star .cn{font-family:var(--tc);font-size:12px;font-weight:600;color:var(--gold);opacity:.82", "grid star Chinese label is visually secondary on desktop");
assertHas(".palace.q10x .p-door .th{font-family:var(--thai);font-size:12px;font-weight:700", "grid door Thai label is visually primary on desktop");
assertHas(".palace.q10x .p-door .cn{font-family:var(--tc);font-size:12px;font-weight:600;opacity:.78", "grid door Chinese label is visually secondary on desktop");
assertHas(".palace.q10x .p-star .cn{font-size:7px;}", "tablet grid Chinese star label is smaller than Thai");
assertHas(".palace.q10x .p-star .th{font-size:9px;line-height:1.08;}", "tablet grid Thai star label remains visually primary");
assertHas(".palace.q10x .p-door .cn{font-size:7px;}", "tablet grid Chinese door label is smaller than Thai");
assertHas(".palace.q10x .p-door .th{font-size:9px;line-height:1.08;}", "tablet grid Thai door label remains visually primary");
assertHas(".palace.q10x .p-door .th{display:block;font-size:8px", "mobile grid Thai label remains larger than Chinese");
assertHas(".palace.q10x .p-door .cn{font-size:6px;}", "mobile grid Chinese label is smaller than Thai");
assertHas("ประตูนำ (使=值使) · เงา(影)=ตรงข้าม", "Thai legend avoids English Envoy copy");
assertNotHas("ประตูนำ Envoy (使=值使)", "Thai legend must not include English Envoy copy");

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
assertBlockHas(yongshenHtml, "qimenPublicThaiCopy(r.label_th || r.name_th || r.title_th", "yongshen reason label is sanitized before display");
assertBlockHas(yongshenHtml, "qimenPublicZhCopy(r.label_zh || r.name_zh || r.title_zh", "yongshen Chinese reason label is sanitized before display");
assertBlockHas(yongshenHtml, "const intentTh = qimenPublicThaiCopy(selector.intent?.label_th", "yongshen intent Thai label is sanitized before display");
assertBlockHas(yongshenHtml, "const statusTh = qimenPublicThaiCopy(target?.status_th", "yongshen status label is sanitized before display");
assertBlockNotHas(yongshenHtml, "r.label_th || r.name_th || r.title_th || 'ตัวแทนเรื่อง'", "yongshen must not render raw reason label directly");
assertBlockNotHas(yongshenHtml, "selector.intent?.label_th || 'ภาพรวม'", "yongshen must not render raw intent directly");
assertBlockNotHas(yongshenHtml, "target?.status_th || 'อ่านประกอบ'", "yongshen must not render raw status directly");
assertBlockHas(traceArray, "/[ก-๙]/.test(s) ? [{ code: inheritedCode || s, label_th: s }] : [{ code: inheritedCode || s }]", "raw trace string becomes Thai label only when it is Thai text");
assertBlockHas(traceArray, "value === true) return /[ก-๙]/.test(key) ? [{ code: key, label_th: key }] : [{ code: key }]", "raw trace object key becomes Thai label only when it is Thai text");
assertBlockNotHas(traceArray, "return [{ code: inheritedCode || s, label_th: s }]", "raw trace string must not always become Thai label");
assertBlockNotHas(traceArray, "return [{ code: key, label_th: key }]", "raw trace key must not always become Thai label");
assertBlockHas(traceLabel, "qimenKnownTraceLabel", "trace label uses known-code Thai mapping");
assertBlockHas(traceLabel, "safeRawShort", "trace label does not use unsafe raw short text");
assertBlockHas(centerPillar, "ยาม <span class=\"tc\">時</span>", "center mini table hour label is Thai-first");
assertBlockHas(centerPillar, "ว่าง <span class=\"tc\">空亡</span>", "center mini table void label is Thai-first");
assertBlockNotHas(centerPillar, "\">時</div>", "center mini table must not show Chinese-only hour label");
assertBlockNotHas(centerPillar, ">空 ${voidAll}", "center mini table must not show Chinese-only void label");
assertBlockHas(applyOverlay, "qimenDirectionFullLabel(p.direction)", "yongshen overlay directions use full Thai labels");
assertBlockNotHas(applyOverlay, "${p.direction}·", "yongshen overlay must not expose raw direction code");
assertBlockHas(searchTermLabel, "DOOR_BY_CODE", "search label maps door codes");
assertBlockHas(searchTermLabel, "return 'องค์ประกอบที่ตรง'", "search label hides unknown raw code");
assertBlockHas(runSearch, "qimenDirectionFullLabel(t.direction)", "search result direction uses full Thai label");
assertBlockHas(runSearch, "ก้านฟ้า ${t.heaven_stem || '—'} / ก้านดิน ${t.earth_stem || '—'}", "search result stems are Thai-first");
assertBlockNotHas(runSearch, "天${qmEsc(t.heaven_stem", "search result must not use Chinese-only heaven stem shorthand");
assertBlockNotHas(runSearch, "qmEsc(t.direction||'')", "search result must not expose raw direction");
assertBlockHas(bindSifu, "รูปแบบพิเศษ 格局", "Sifu formation prompt is Thai-first");
assertBlockNotHas(bindSifu, "格局ที่เห็น", "Sifu formation prompt must not start with Chinese");
assertHas("function qimenTraceIsContextOnly", "context-only trace helper");
assertHas("item?.verdict_allowed === false", "frontend respects verdict_allowed=false");
assertHas("!includeContext && qimenTraceIsContextOnly(item)", "quick/grid skip context-only trace");
assertHas("p?.p0_flags_verdict_allowed !== false", "quick/grid do not fall back to disabled p0_flags");
assertHas("qimenDisplayP0SignalsForPalace(p, last, { includeContext: true })", "pro detail can still show context/source trace through display-safe wrapper");
assertHas("function qimenFormationIsContextOnly", "context-only formation helper");
assertHas("!qimenFormationIsContextOnly(f)", "grid skips context-only formations");
assertHas("const isContext = qimenFormationIsContextOnly(f)", "formation list detects context-only rows");
assertHas("const color = isContext ? 'var(--fg-faint)'", "formation list neutralizes context-only color");
assertHas("rawNote || 'ใช้ดูเป็นข้อมูลประกอบเท่านั้น'", "formation list has context-only fallback note");
assertHas("อ่านประกอบเท่านั้น", "detail labels context-only formations as context");
assertBlockHas(p0Detail, "const isContext = qimenTraceIsContextOnly(item)", "P0 detail detects context-only trace");
assertBlockHas(p0Detail, "const toneTh = isContext ? 'อ่านประกอบเท่านั้น'", "P0 detail labels context-only trace clearly");
assertBlockHas(p0Detail, "const noteSeen = new Set()", "P0 detail dedupes multiple note fields");
assertBlockHas(p0Detail, "item.formula_evidence_th,", "P0 detail includes formula evidence summary");
assertBlockHas(p0Detail, "...qimenUiFlagFormulaEvidenceParts(item, { includeDetail: true, limit: 2 })", "P0 detail includes normalized formula evidence rows");
assertBlockHas(p0Detail, "item.source_summary_th,", "P0 detail includes engine source summary");
assertBlockHas(p0Detail, "item.source_detail_th,", "P0 detail includes engine source detail");
assertBlockHas(p0Detail, "item.caveat_th,", "P0 detail includes engine source caveat");
assertBlockHas(p0Detail, "].map(qmPublicEvidenceText).filter(Boolean)", "P0 detail sanitizes public source notes before display");
assertBlockHas(p0Detail, ".slice(0, 4).join(' · ')", "P0 detail renders multiple bounded note fields");
assertBlockHas(p0Detail, "item.negated_by", "P0 detail shows negated-by evidence");
assertBlockHas(p0Detail, "item.negated_by.map(qmNegatedByLabel)", "P0 detail maps negated_by through Thai/code sanitizer");
assertBlockHas(p0Detail, "ถูกหักแรงโดย", "P0 detail labels reduced formations in Thai");
assertHas("ประตูนำ · 值使", "Thai locale zhi-shi uses Thai-first 值使 label");
assertHas("Envoy / Lead Door · 值使", "English locale zhi-shi keeps Envoy alias");
assertNotHas("ประตูนำ(使=直使)", "old visible zhi-shi legend");
assertNotHas("Lead Door (直使)", "old English visible zhi-shi legend");
assertNotHas("使 = 直使", "old Chinese visible zhi-shi legend");
assertNotHas("直使", "old incorrect zhi-shi glyph");
assertNotHas("直符", "old incorrect zhi-fu glyph");
assertNotHas("วัน/ยามปะทะ 日時冲", "old simplified clash label");
assertNotHas("title=\"ปะทะ 冲\"", "old simplified clash tooltip");
assertHas("function qimenHexagramDisplay", "hexagram display helper exists");
assertHas("กว้า 64 ที่ผูกกับวังนี้ · 六十四卦", "hexagram row label is Thai-first Chinese-second");
assertHas("อ่านจากข้อมูลที่ระบบคำนวณส่งมาเท่านั้น", "hexagram value caveat avoids raw engine wording in Thai");
assertHas("ยังไม่มีข้อมูลกว้า 64 ในวังนี้", "hexagram row has explicit no-engine-data fallback");
assertHas("หน้านี้ไม่คำนวณกว้า 64 เอง", "hexagram row refuses frontend computation");
assertHas("hexagram_name_th || p?.hexagram_th || p?.gua64_name_th", "hexagram helper reads only explicit engine fields");
assertBlockHas(hexagramDisplay, "parts.push(`เลข ${qmEsc(code)}`)", "hexagram code is escaped before innerHTML");
assertBlockHas(hexagramDisplay, "parts.push(qmEsc(th))", "hexagram Thai name is escaped before innerHTML");
assertBlockHas(hexagramDisplay, "parts.push(`<span class=\"tc\">${qmEsc(zh)}</span>`)", "hexagram Chinese name is escaped before innerHTML");
assertBlockNotHas(hexagramDisplay, "parts.push(`เลข ${code}`)", "hexagram code must not be raw HTML");
assertBlockNotHas(hexagramDisplay, "parts.push(th)", "hexagram Thai name must not be raw HTML");
assertBlockNotHas(hexagramDisplay, "parts.push(`<span class=\"tc\">${zh}</span>`)", "hexagram Chinese name must not be raw HTML");
assertNotHas("trigram_zh || p?.hexagram", "must not label trigram payload as hexagram");
assertBlockHas(detail, "ประตูนำ <span class=\"tc\" style=\"color:inherit\">值使</span>", "detail zhi-shi marker is Thai-first");
assertBlockHas(detail, "ดาวนำ <span class=\"tc\" style=\"color:inherit\">值符</span>", "detail zhi-fu marker is Thai-first");
assertBlockHas(detail, "qimenUiFlag(p, 'ZHI_FU'", "detail zhi-fu marker prefers engine ui_flags");
assertBlockHas(detail, "qimenUiFlag(p, 'ZHI_SHI'", "detail zhi-shi marker prefers engine ui_flags");
assertBlockHas(detail, "qimenUiFlag(p, 'YI_MA'", "detail horse marker prefers engine ui_flags");
assertBlockHas(detail, "qimenUiFlag(p, 'KONG_WANG'", "detail void marker prefers engine ui_flags");
assertBlockHas(detail, "ว่าง <span class=\"tc\" style=\"color:inherit\">空</span>", "detail void marker is not Chinese-only");
assertBlockHas(detail, "ม้า <span class=\"tc\" style=\"color:inherit\">馬</span>", "detail horse marker is not icon-only");
assertBlockHas(detail, "รายละเอียดวัง · 詳", "detail heading is Thai-first");
assertBlockHas(detail, "ฟ้า <span class=\"tc\">", "heaven stem row is Thai-first");
assertBlockHas(detail, "ดิน <span class=\"tc\">", "earth stem row is Thai-first");
assertBlockHas(detail, "stemResponse.title_th || (stemResponse.title_zh ? 'ปฏิกิริยาก้าน' : '')", "stem title fallback must never render Chinese-only");
assertNotHas("ยังไม่มีคำตัดสินจากตำราในระบบ", "old stem fallback hides context-only API copy");

for (const text of ["สถานะอ่านเร็ว", "ต้องเช็กต่อ", "คะแนนช่วยจัดลำดับ", "อ่านแบบง่าย", "beginner_reading"]) {
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
