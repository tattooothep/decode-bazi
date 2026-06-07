/**
 * Sifu source-router golden cases.
 *
 * Read-only test. It validates Phase 7 golden cases without importing/changing
 * /api/sifu runtime routes, prompt text, cache behavior, SSE, or model calls.
 *
 * Run:
 *   node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-sifu-golden-cases.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSynastry, type PersonSyn } from "../src/lib/bazi-synastry.ts";
import { buildSifuAuthorityBooksCatalog } from "../src/lib/sifu-authority-books.ts";
import { buildSifuCompactBaseline } from "../src/lib/sifu-compact-baseline.ts";
import { buildPromptSourceMapHash } from "../src/lib/sifu-source-audit.ts";
import { buildSifuSourceManifest } from "../src/lib/sifu-source-manifest.ts";
import { routeSifuSources, type SifuRouterMode, type SifuRouterPacketFeatures } from "../src/lib/sifu-source-router.ts";
import { buildSifuShadowModePlan, summarizeSifuShadowModePlan } from "../src/lib/sifu-shadow-mode.ts";

const ROOT = process.cwd();
const GENERATED_AT = "2026-06-06T00:00:00.000Z";
const FIXTURE_PATH = join(ROOT, "test-cases/sifu/source-router-golden-cases.json");
const EXPECTED_IDS = [
  "mother_child_wrong_premise_closed_list",
  "borderline_lixia_na",
  "feedback_2023_2566",
  "codex_compact_budget",
];
const FALSE_PREMISE_TERMS = ["辰戌冲", "寅戌半合", "子子自刑"];

type GoldenCase = {
  id: string;
  description: string;
  model: string;
  mode: SifuRouterMode;
  topic?: string;
  budgetChars: number;
  question: string;
  history?: string[];
  packetText?: string;
  packetFeatures?: SifuRouterPacketFeatures;
  interactions?: string[];
  synastryInteractions?: string[];
  timingWindow?: string[];
  expectedSelectedSourceIds?: string[];
  expectedSelectedChunkIds?: string[];
  expectedQtbjPairs?: string[];
  forbiddenSelectedSourceIds?: string[];
  forbiddenPacketTerms?: string[];
};

type GoldenFixture = {
  version: string;
  generatedAt: string;
  cases: GoldenCase[];
};

let pass = 0;
let fail = 0;

function ck(label: string, ok: boolean, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${label}${detail ? " · " + detail : ""}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${label}${detail ? " · " + detail : ""}`);
  }
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...listSourceFiles(path));
    else if (/\.(ts|tsx|js|jsx|mts|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

function hasSource(out: ReturnType<typeof routeSifuSources>, sourceId: string): boolean {
  return out.selectedSources.some((row) => row.sourceId === sourceId);
}

function hasChunk(out: ReturnType<typeof routeSifuSources>, chunkId: string): boolean {
  return out.selectedSources.some((row) => row.chunkId === chunkId || row.sourceId === chunkId);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function packetSideText(c: GoldenCase): string {
  return JSON.stringify({
    interactions: c.interactions || [],
    synastryInteractions: c.synastryInteractions || [],
  });
}

function P(name: string, day: string, month: string, year: string): PersonSyn {
  const split = (pillar: string) => ({ stem: [...pillar][0], branch: [...pillar][1] });
  return {
    name,
    role: "x",
    isSelf: false,
    text: "",
    mode: "3p",
    dmEl: "water",
    yongEls: [],
    pillars: { day: split(day), month: split(month), year: split(year) },
  };
}

console.log("[sifu-golden-cases]");

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as GoldenFixture;
ck("fixture version is locked", fixture.version === "sifu-source-router-golden-v1", fixture.version);
ck("fixture generatedAt is deterministic", fixture.generatedAt === GENERATED_AT, fixture.generatedAt);
ck("fixture has exactly 4 cases", Array.isArray(fixture.cases) && fixture.cases.length === 4, `cases=${fixture.cases?.length}`);
const ids = fixture.cases.map((c) => c.id);
ck("fixture case ids are unique", new Set(ids).size === ids.length, ids.join(","));
ck("fixture case ids match expected order", JSON.stringify(ids) === JSON.stringify(EXPECTED_IDS), ids.join(","));
for (const c of fixture.cases) {
  ck(`${c.id} schema has required fields`, !!c.model && !!c.mode && !!c.question && Number.isFinite(c.budgetChars) && c.budgetChars > 0);
}

const manifest = buildSifuSourceManifest("sifu-single-full-current", { generatedAt: GENERATED_AT });
const baseline = buildSifuCompactBaseline({ manifest, generatedAt: GENERATED_AT });
const authorityCatalog = buildSifuAuthorityBooksCatalog({ manifest, generatedAt: GENERATED_AT });
const promptSourceMapHash = buildPromptSourceMapHash(manifest.sources);
ck("manifest current source counts are stable", manifest.knownSourceCount === 26 && manifest.sourceCount === 23, `known=${manifest.knownSourceCount} included=${manifest.sourceCount}`);
ck("authority catalog has 9 books", authorityCatalog.bookCount === 9, `books=${authorityCatalog.bookCount}`);

const baselineText = readFileSync(join(ROOT, "data/library/sifu-authority/compact-baseline-7layers.md"), "utf8");
for (const term of FALSE_PREMISE_TERMS) {
  ck(`compact baseline names no-invention term ${term}`, baselineText.includes(term));
}
ck("compact baseline blocks prompt-only cross-chart invention", baselineText.includes("cross-chart reactions") && baselineText.includes("question contains them"));
ck("compact baseline requires conditional borderline language", baselineText.includes('label every conclusion "เฉพาะถ้า..."'));

for (const c of fixture.cases) {
  const out = routeSifuSources({
    model: c.model,
    mode: c.mode,
    topic: c.topic || null,
    question: c.question,
    history: c.history || [],
    packetText: c.packetText || null,
    packetFeatures: c.packetFeatures,
    interactions: c.interactions || [],
    synastryInteractions: c.synastryInteractions || [],
    timingWindow: c.timingWindow || [],
    budgetChars: c.budgetChars,
    manifest,
    baseline,
    generatedAt: GENERATED_AT,
  });
  const plan = buildSifuShadowModePlan({
    model: c.model,
    route: "api/sifu",
    mode: c.mode,
    topic: c.topic || null,
    lang: "th",
    question: c.question,
    history: c.history || [],
    packetText: c.packetText || null,
    packetFeatures: c.packetFeatures,
    interactions: c.interactions || [],
    synastryInteractions: c.synastryInteractions || [],
    timingWindow: c.timingWindow || [],
    profileId: `00000000-0000-4000-8000-${String(EXPECTED_IDS.indexOf(c.id) + 1).padStart(12, "0")}`,
    promptHash: "1".repeat(64),
    contextHash: "2".repeat(64),
    packetHash: "3".repeat(64),
    cached: false,
    budgetChars: c.budgetChars,
    generatedAt: GENERATED_AT,
    manifest,
    baseline,
    authorityCatalog,
  });
  const summary = summarizeSifuShadowModePlan(plan);
  const planJson = JSON.stringify(plan);
  const summaryJson = JSON.stringify(summary);

  ck(`${c.id} router stays inside budget`, out.estimatedChars <= c.budgetChars, `estimated=${out.estimatedChars} budget=${c.budgetChars}`);
  ck(`${c.id} router includes compact baseline`, hasChunk(out, "compact-baseline-7layers"));
  ck(`${c.id} selected chunks are non-empty`, out.selectedChunkIds.length > 0 && out.selectionReasons.length === out.selectedChunkIds.length);
  ck(`${c.id} router hash is sha256`, /^[0-9a-f]{64}$/.test(out.routerHashSha256), out.routerHashSha256);
  ck(`${c.id} router uses manifest and baseline hashes`, out.sourceManifestHash === manifest.sourceManifestHash && out.compactBaselineHashSha256 === baseline.baselineHashSha256);
  ck(`${c.id} selected rows carry source hashes`, out.selectedSources.every((row) => /^[0-9a-f]{64}$/.test(row.sourceHashSha256 || "") && /^[0-9a-f]{64}$/.test(row.promptSegmentHashSha256 || "")));

  for (const sourceId of c.expectedSelectedSourceIds || []) {
    ck(`${c.id} selects source ${sourceId}`, hasSource(out, sourceId), out.warnings.join(" | "));
  }
  for (const chunkId of c.expectedSelectedChunkIds || []) {
    ck(`${c.id} selects chunk ${chunkId}`, hasChunk(out, chunkId), out.selectedChunkIds.join(","));
  }
  for (const sourceId of c.forbiddenSelectedSourceIds || []) {
    ck(`${c.id} does not select source ${sourceId}`, !hasSource(out, sourceId), out.selectedChunkIds.join(","));
  }
  if (c.expectedQtbjPairs) {
    ck(`${c.id} QTBJ pairs exact`, JSON.stringify(out.qtbjPairs) === JSON.stringify(c.expectedQtbjPairs), out.qtbjPairs.join(","));
  }
  for (const term of c.forbiddenPacketTerms || []) {
    ck(`${c.id} false term ${term} is question-only, not packet-approved`, !packetSideText(c).includes(term), packetSideText(c));
  }

  ck(`${c.id} shadow plan is non-mutating`, plan.mode === "planned_only" && plan.runtimeEffect === "none" && plan.candidate.modelCall === "not_started" && plan.candidate.promptMutation === "none");
  ck(`${c.id} shadow answer remains control`, plan.control.answerPath === "current-runtime" && plan.candidate.answerVisibleToUser === false && plan.safety.userAnswerSource === "control");
  ck(`${c.id} shadow audit status is shadow`, plan.candidate.sourceAudit.auditVersion === "sifu-source-audit-v1" && plan.candidate.sourceAudit.status === "shadow");
  ck(`${c.id} shadow audit keeps candidate hash separate from prompt hash`, /^[0-9a-f]{64}$/.test(plan.candidate.candidatePlanHashSha256) && plan.candidate.candidatePlanHashSha256 !== plan.control.promptHash);
  ck(`${c.id} candidate hash copied into audit and summary`, plan.candidate.sourceAudit.candidatePlanHashSha256 === plan.candidate.candidatePlanHashSha256 && plan.candidate.sourceAuditSummary.candidate_plan_hash === plan.candidate.candidatePlanHashSha256);
  ck(`${c.id} router hash copied into audit and summary`, plan.candidate.sourceAudit.routerHashSha256 === out.routerHashSha256 && plan.candidate.sourceAuditSummary.router_hash === out.routerHashSha256);
  ck(`${c.id} selected chunks copied into audit and summary`, sameJson(plan.candidate.sourceAudit.selectedChunkIds, out.selectedChunkIds) && sameJson(plan.candidate.sourceAuditSummary.selected_chunk_ids, out.selectedChunkIds));
  ck(`${c.id} selection reasons copied into audit and summary`, sameJson(plan.candidate.sourceAudit.selectionReasons, out.selectionReasons) && sameJson(plan.candidate.sourceAuditSummary.selection_reasons, out.selectionReasons));
  ck(`${c.id} audit prompt source map hash matches manifest`, plan.candidate.sourceAudit.promptSourceMapHash === promptSourceMapHash);
  ck(`${c.id} audit carries all included/preselected rows`, plan.candidate.sourceAudit.includedSources.length === 23 && plan.candidate.sourceAudit.preselectedSources.length === 26);
  ck(`${c.id} audit rows carry hashes`, plan.candidate.sourceAudit.includedSources.every((row) => /^[0-9a-f]{64}$/.test(row.sourceHashSha256) && /^[0-9a-f]{64}$/.test(row.promptSegmentHashSha256)));
  ck(`${c.id} audit has no answer proof or model self-report`, plan.candidate.sourceAudit.answerHash === null && plan.candidate.sourceAudit.modelClaimedUsed === null && plan.candidate.sourceAudit.answerSupportedBy.method === "not_run" && plan.candidate.sourceAudit.answerSupportedBy.proofLevel === "none");
  ck(`${c.id} shadow plan avoids full corpus text`, planJson.length < 90_000 && !planJson.includes("## Decision Order"), `planChars=${planJson.length}`);
  ck(`${c.id} shadow summary is compact`, summaryJson.length < 25_000, `summaryChars=${summaryJson.length}`);
}

const synastryOut = buildSynastry([
  P("A", "壬子", "甲寅", "丙子"),
  P("B", "癸丑", "乙丑", "丁丑"),
], "th");
ck("synastry golden emits closed-list header", /ลิสต์ปิด.*เช็คครบแล้ว/s.test(synastryOut));
ck("synastry golden does not invent false premise terms", FALSE_PREMISE_TERMS.every((term) => !synastryOut.includes(term)), synastryOut);

const appRuntimeImports = listSourceFiles(join(ROOT, "src/app"))
  .filter((path) => /source-router-golden-cases|test-sifu-golden-cases|test-cases\/sifu/.test(readFileSync(path, "utf8")))
  .map((path) => path.slice(ROOT.length + 1));
ck("golden cases are not imported by runtime app routes", appRuntimeImports.length === 0, appRuntimeImports.join(", "));

console.log(`\n[sifu-golden-cases] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
