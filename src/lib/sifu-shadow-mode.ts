import { createHash } from "node:crypto";
import {
  buildSifuAuthorityBooksCatalog,
  summarizeSifuAuthorityBooksCatalog,
  type SifuAuthorityBooksCatalog,
} from "./sifu-authority-books";
import {
  buildSifuCompactBaseline,
  type SifuCompactBaseline,
} from "./sifu-compact-baseline";
import {
  buildSifuSourceAuditRecord,
  compactSifuSourceAuditRecord,
  type SifuSourceAuditRecord,
} from "./sifu-source-audit";
import {
  buildSifuSourceManifest,
  type SifuSourceManifest,
} from "./sifu-source-manifest";
import {
  routeSifuSources,
  type SifuRouterMode,
  type SifuRouterPacketFeatures,
  type SifuSourceRouterOutput,
} from "./sifu-source-router";

export const SIFU_SHADOW_MODE_VERSION = "sifu-shadow-mode-v1";

export type SifuShadowControlPath = {
  answerPath: "current-runtime";
  route?: string | null;
  model: string;
  promptHash?: string | null;
  contextHash?: string | null;
  packetHash?: string | null;
  cached: boolean;
};

export type SifuShadowCandidatePlan = {
  modelCall: "not_started";
  promptMutation: "none";
  answerVisibleToUser: false;
  router: SifuSourceRouterOutput;
  sourceAudit: SifuSourceAuditRecord;
  sourceAuditSummary: ReturnType<typeof compactSifuSourceAuditRecord>;
  authorityCatalog: ReturnType<typeof summarizeSifuAuthorityBooksCatalog>;
  candidatePlanHashSha256: string;
};

export type SifuShadowModePlan = {
  shadowVersion: string;
  generatedAt: string;
  mode: "planned_only";
  runtimeEffect: "none";
  control: SifuShadowControlPath;
  candidate: SifuShadowCandidatePlan;
  safety: {
    userAnswerSource: "control";
    modelSelfReportUsedAsProof: false;
    fullClassicTextEmbedded: false;
    runtimeHookRequired: false;
  };
};

export type SifuShadowModeInput = {
  model: string;
  route?: string | null;
  mode?: SifuRouterMode;
  topic?: string | null;
  lang?: string | null;
  question: string;
  history?: string[];
  packetText?: string | null;
  packetFeatures?: SifuRouterPacketFeatures;
  interactions?: string[];
  synastryInteractions?: string[];
  timingWindow?: string[];
  profileId?: string | null;
  promptHash?: string | null;
  contextHash?: string | null;
  packetHash?: string | null;
  cached?: boolean;
  budgetChars?: number;
  generatedAt?: string;
  manifest?: SifuSourceManifest;
  baseline?: SifuCompactBaseline;
  authorityCatalog?: SifuAuthorityBooksCatalog;
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function buildSifuShadowModePlan(input: SifuShadowModeInput): SifuShadowModePlan {
  const generatedAt = input.generatedAt || new Date().toISOString();
  const manifest = input.manifest || buildSifuSourceManifest("sifu-single-full-current", { generatedAt });
  const baseline = input.baseline || buildSifuCompactBaseline({ generatedAt, manifest });
  const authorityCatalog = input.authorityCatalog || buildSifuAuthorityBooksCatalog({ generatedAt, manifest });
  const router = routeSifuSources({
    model: input.model,
    mode: input.mode || "single",
    topic: input.topic || null,
    question: input.question,
    history: input.history || [],
    packetText: input.packetText || null,
    packetFeatures: input.packetFeatures,
    interactions: input.interactions || [],
    synastryInteractions: input.synastryInteractions || [],
    timingWindow: input.timingWindow || [],
    budgetChars: input.budgetChars,
    generatedAt,
    manifest,
    baseline,
  });
  const selectedChunkPayload = router.selectedSources.map((row) => ({
    sourceId: row.sourceId,
    chunkId: row.chunkId,
    authorityBook: row.authorityBook,
    layerId: row.layerId || null,
    reason: row.reason,
    score: row.score,
    estimatedChars: row.estimatedChars,
    sourceHashSha256: row.sourceHashSha256 || null,
    promptSegmentHashSha256: row.promptSegmentHashSha256 || null,
  }));
  const candidatePlanHashSha256 = sha256(JSON.stringify({
    version: SIFU_SHADOW_MODE_VERSION,
    sourceManifestHash: manifest.sourceManifestHash,
    compactBaselineHashSha256: baseline.baselineHashSha256,
    authorityCatalogHashSha256: authorityCatalog.catalogHashSha256,
    routerHashSha256: router.routerHashSha256,
    selectedChunkPayload,
  }));
  const auditRecord: SifuSourceAuditRecord = buildSifuSourceAuditRecord({
    manifest,
    feature: "sifu_shadow_candidate",
    route: input.route || null,
    mode: input.mode || "single",
    topic: input.topic || null,
    lang: input.lang || "th",
    model: input.model,
    cached: !!input.cached,
    status: "shadow",
    profileId: input.profileId || null,
    promptHash: input.promptHash || null,
    contextHash: input.contextHash || null,
    packetHash: input.packetHash || null,
    answerHash: null,
    candidatePlanHashSha256,
    routerHashSha256: router.routerHashSha256,
    selectedChunkIds: router.selectedChunkIds,
    selectionReasons: router.selectionReasons,
    auditRunId: sha256(JSON.stringify({
      version: SIFU_SHADOW_MODE_VERSION,
      profileId: input.profileId || null,
      packetHash: input.packetHash || null,
      promptHash: input.promptHash || null,
      candidatePlanHashSha256,
    })).slice(0, 32),
    createdAt: generatedAt,
    answerSupportedBy: { method: "not_run", proofLevel: "none", sources: [] },
    modelClaimedUsed: null,
  });
  return {
    shadowVersion: SIFU_SHADOW_MODE_VERSION,
    generatedAt,
    mode: "planned_only",
    runtimeEffect: "none",
    control: {
      answerPath: "current-runtime",
      route: input.route || null,
      model: input.model,
      promptHash: input.promptHash || null,
      contextHash: input.contextHash || null,
      packetHash: input.packetHash || null,
      cached: !!input.cached,
    },
    candidate: {
      modelCall: "not_started",
      promptMutation: "none",
      answerVisibleToUser: false,
      router,
      sourceAudit: auditRecord,
      sourceAuditSummary: compactSifuSourceAuditRecord(auditRecord),
      authorityCatalog: summarizeSifuAuthorityBooksCatalog(authorityCatalog),
      candidatePlanHashSha256,
    },
    safety: {
      userAnswerSource: "control",
      modelSelfReportUsedAsProof: false,
      fullClassicTextEmbedded: false,
      runtimeHookRequired: false,
    },
  };
}

export function summarizeSifuShadowModePlan(plan: SifuShadowModePlan) {
  return {
    shadowVersion: plan.shadowVersion,
    mode: plan.mode,
    runtimeEffect: plan.runtimeEffect,
    control: plan.control,
    candidate: {
      modelCall: plan.candidate.modelCall,
      promptMutation: plan.candidate.promptMutation,
      answerVisibleToUser: plan.candidate.answerVisibleToUser,
      candidatePlanHashSha256: plan.candidate.candidatePlanHashSha256,
      routerHashSha256: plan.candidate.router.routerHashSha256,
      sourceManifestHash: plan.candidate.router.sourceManifestHash,
      compactBaselineHashSha256: plan.candidate.router.compactBaselineHashSha256,
      authorityCatalogHashSha256: plan.candidate.authorityCatalog.catalogHashSha256,
      selectedChunkIds: plan.candidate.router.selectedChunkIds,
      qtbjPairs: plan.candidate.router.qtbjPairs,
      estimatedChars: plan.candidate.router.estimatedChars,
      budgetChars: plan.candidate.router.budgetChars,
      sourceAudit: plan.candidate.sourceAuditSummary,
    },
    safety: plan.safety,
  };
}
