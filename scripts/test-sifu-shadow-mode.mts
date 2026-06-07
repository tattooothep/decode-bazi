/**
 * Sifu shadow-mode guard.
 *
 * Read-only test. It validates Phase 6A shadow candidate planning without
 * importing/changing /api/sifu runtime routes or calling any model.
 *
 * Run:
 *   node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-sifu-shadow-mode.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSifuAuthorityBooksCatalog } from "../src/lib/sifu-authority-books.ts";
import { buildSifuCompactBaseline } from "../src/lib/sifu-compact-baseline.ts";
import { buildSifuShadowModePlan, summarizeSifuShadowModePlan } from "../src/lib/sifu-shadow-mode.ts";
import { buildSifuSourceManifest } from "../src/lib/sifu-source-manifest.ts";

const ROOT = process.cwd();
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

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log("[sifu-shadow-mode]");

const generatedAt = "2026-06-06T00:00:00.000Z";
const manifest = buildSifuSourceManifest("sifu-single-full-current", { generatedAt });
const baseline = buildSifuCompactBaseline({ manifest, generatedAt });
const authorityCatalog = buildSifuAuthorityBooksCatalog({ manifest, generatedAt });
const packetApprovedInteractions: string[] = [];
const plan = buildSifuShadowModePlan({
  model: "claude-max-cli",
  route: "api/sifu",
  mode: "group",
  topic: "relationship",
  lang: "th",
  question: "แม่ลูกนี้มี辰戌冲ไหม ปี 2026 เทียบ格局 相神 旺衰 通關 และ窮通寶鑑",
  history: ["user asked about Claude/Codex source use"],
  packetText: "PILLAR LOCK: 年丙子 月壬辰 日壬寅 時未知",
  packetFeatures: { dayStem: "壬", monthBranch: "辰", monthBranchCandidates: ["辰", "巳"], geju: "雜氣傷官格", strength: "slightly_strong", yongshen: ["火"], jishen: ["水"] },
  interactions: packetApprovedInteractions,
  synastryInteractions: ["closed-list: 子 overlap only"],
  timingWindow: ["2026", "2031"],
  profileId: "00000000-0000-4000-8000-000000000001",
  promptHash: "p".repeat(64),
  contextHash: "c".repeat(64),
  packetHash: "a".repeat(64),
  cached: false,
  budgetChars: 140_000,
  generatedAt,
  manifest,
  baseline,
  authorityCatalog,
});
const summary = summarizeSifuShadowModePlan(plan);
const summaryJson = JSON.stringify(summary);
const planJson = JSON.stringify(plan);

ck("shadow plan is planned-only", plan.mode === "planned_only" && plan.runtimeEffect === "none");
ck("control answer path remains current runtime", plan.control.answerPath === "current-runtime");
ck("candidate does not call model", plan.candidate.modelCall === "not_started");
ck("candidate does not mutate prompt", plan.candidate.promptMutation === "none");
ck("candidate answer is not visible to user", plan.candidate.answerVisibleToUser === false && plan.safety.userAnswerSource === "control");
ck("shadow plan hash is sha256", /^[0-9a-f]{64}$/.test(plan.candidate.candidatePlanHashSha256), plan.candidate.candidatePlanHashSha256);
ck("shadow router extracts borderline QTBJ pairs", plan.candidate.router.qtbjPairs.includes("壬辰") && plan.candidate.router.qtbjPairs.includes("壬巳"), plan.candidate.router.qtbjPairs.join(","));
ck("shadow false premise stays in question only, not packet interactions", !packetApprovedInteractions.some((x) => /辰戌冲|寅戌半合|子子自刑/.test(x)));
ck("shadow router selects compact baseline and chunks", plan.candidate.router.selectedChunkIds.includes("compact-baseline-7layers") && plan.candidate.router.selectedChunkIds.length > 5, `chunks=${plan.candidate.router.selectedChunkIds.length}`);
ck("shadow router remains inside requested budget", plan.candidate.router.estimatedChars <= plan.candidate.router.budgetChars, `estimated=${plan.candidate.router.estimatedChars} budget=${plan.candidate.router.budgetChars}`);
ck("shadow source audit is full status shadow record", plan.candidate.sourceAudit.auditVersion === "sifu-source-audit-v1" && plan.candidate.sourceAudit.status === "shadow");
ck("shadow source audit prompt hash is actual runtime prompt hash", plan.candidate.sourceAudit.promptHash === "p".repeat(64));
ck("shadow source audit persists candidate plan hash separately", plan.candidate.sourceAudit.candidatePlanHashSha256 === plan.candidate.candidatePlanHashSha256 && plan.candidate.sourceAuditSummary.candidate_plan_hash === plan.candidate.candidatePlanHashSha256);
ck("shadow source audit mirrors router hash", plan.candidate.sourceAudit.routerHashSha256 === plan.candidate.router.routerHashSha256 && plan.candidate.sourceAuditSummary.router_hash === plan.candidate.router.routerHashSha256);
ck("shadow source audit mirrors router selected chunks in order", sameJson(plan.candidate.sourceAudit.selectedChunkIds, plan.candidate.router.selectedChunkIds) && sameJson(plan.candidate.sourceAuditSummary.selected_chunk_ids, plan.candidate.router.selectedChunkIds));
ck("shadow source audit mirrors router selection reasons in order", sameJson(plan.candidate.sourceAudit.selectionReasons, plan.candidate.router.selectionReasons) && sameJson(plan.candidate.sourceAuditSummary.selection_reasons, plan.candidate.router.selectionReasons));
ck("shadow source audit carries source rows for later logging", plan.candidate.sourceAudit.includedSources.length === 23 && plan.candidate.sourceAudit.preselectedSources.length === 26, `included=${plan.candidate.sourceAudit.includedSources.length} preselected=${plan.candidate.sourceAudit.preselectedSources.length}`);
ck("shadow source audit has no answer hash", plan.candidate.sourceAudit.answerHash === null && plan.candidate.sourceAuditSummary.answer_hash === null);
ck("shadow source audit does not use model self-report", plan.candidate.sourceAudit.modelClaimedUsed === null && plan.candidate.sourceAuditSummary.model_claimed_used === null && plan.safety.modelSelfReportUsedAsProof === false);
ck("authority catalog is attached as compact metadata", plan.candidate.authorityCatalog.bookCount === 9 && plan.candidate.authorityCatalog.catalogHashSha256 === authorityCatalog.catalogHashSha256);
ck("source manifest remains current", manifest.knownSourceCount === 26 && manifest.sourceCount === 23, `known=${manifest.knownSourceCount} included=${manifest.sourceCount}`);
ck("shadow plan does not embed full corpus text", planJson.length < 90_000 && !planJson.includes("## Decision Order"), `planChars=${planJson.length}`);
ck("shadow summary is compact", summaryJson.length < 25_000, `summaryChars=${summaryJson.length}`);

const appRuntimeImports = listSourceFiles(join(ROOT, "src/app"))
  .filter((path) => /sifu-shadow-mode|SIFU_SOURCE_SHADOW_AUDIT|buildSifuShadowModePlan/.test(readFileSync(path, "utf8")))
  .map((path) => path.slice(ROOT.length + 1));
ck("shadow mode runtime imports are limited to env-gated /api/sifu route", appRuntimeImports.every((path) => path === "src/app/api/sifu/route.ts"), appRuntimeImports.join(", "));

console.log(`\n[sifu-shadow-mode] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
