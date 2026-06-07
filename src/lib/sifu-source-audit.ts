import { createHash } from "node:crypto";
import {
  summarizeSifuSourceManifest,
  type SifuSourceManifest,
  type SifuSourceManifestEntry,
} from "./sifu-source-manifest";

export const SIFU_SOURCE_AUDIT_VERSION = "sifu-source-audit-v1";

type JsonMap = Record<string, unknown>;

export type SifuIncludedSourceAudit = {
  sourceId: string;
  routeGroup: string;
  tier: string;
  authorityBook: string;
  relativePath: string;
  chars: number;
  bytes: number;
  sourceHashSha256: string;
  promptSegmentHashSha256: string;
  selected: boolean;
  included: boolean;
  selectionReason: string;
};

export type SifuPreselectedSourceAudit = {
  sourceId: string;
  selected: boolean;
  included: boolean;
  reason: string;
  sourcePriority: number;
  tier: string;
  authorityBook: string;
};

export type SifuAnswerSupportedByAudit = {
  method: "not_run" | "lexical" | "audit_model" | "manual";
  proofLevel: "none" | "weak" | "medium" | "strong";
  sources: Array<{
    sourceId: string;
    confidence: number;
    answerSpans?: string[];
    reason?: string;
  }>;
};

export type SifuModelClaimedUsedAudit = {
  present: boolean;
  proofLevel: "claim_only";
  sourceIds?: string[];
  raw?: string;
} | null;

export type SifuSourceAuditRecord = {
  auditVersion: string;
  auditRunId: string;
  researchAiMessageId?: string | null;
  feature: string;
  route?: string | null;
  mode?: string | null;
  topic?: string | null;
  lang: string;
  model?: string | null;
  cached: boolean;
  status: "ok" | "error" | "shadow" | "posthoc";
  error?: string | null;
  profileId?: string | null;
  promptHash?: string | null;
  contextHash?: string | null;
  packetHash?: string | null;
  answerHash?: string | null;
  candidatePlanHashSha256?: string | null;
  routerHashSha256?: string | null;
  sourceManifestHash: string;
  promptSourceMapHash: string;
  sourceManifest: ReturnType<typeof summarizeSifuSourceManifest>;
  includedSources: SifuIncludedSourceAudit[];
  preselectedSources: SifuPreselectedSourceAudit[];
  selectedChunkIds: string[];
  selectionReasons: string[];
  answerSupportedBy: SifuAnswerSupportedByAudit;
  modelClaimedUsed: SifuModelClaimedUsedAudit;
  createdAt: string;
};

export function sifuAuditSha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function includedSource(source: SifuSourceManifestEntry): SifuIncludedSourceAudit {
  return {
    sourceId: source.sourceId,
    routeGroup: source.routeGroup,
    tier: source.tier,
    authorityBook: source.authorityBook,
    relativePath: source.relativePath,
    chars: source.chars,
    bytes: source.bytes,
    sourceHashSha256: source.sourceHashSha256,
    promptSegmentHashSha256: source.promptSegmentHashSha256,
    selected: source.selected,
    included: source.included,
    selectionReason: source.selectionReason,
  };
}

function preselectedSource(source: SifuSourceManifestEntry): SifuPreselectedSourceAudit {
  return {
    sourceId: source.sourceId,
    selected: source.selected,
    included: source.included,
    reason: source.selectionReason,
    sourcePriority: source.sourcePriority,
    tier: source.tier,
    authorityBook: source.authorityBook,
  };
}

function stringArray(values: string[] | null | undefined): string[] {
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];
}

export function buildPromptSourceMapHash(sources: SifuSourceManifestEntry[]): string {
  const included = sources
    .filter((source) => source.included)
    .map((source) => ({
      sourceId: source.sourceId,
      promptSegmentHashSha256: source.promptSegmentHashSha256,
      sourceHashSha256: source.sourceHashSha256,
      selected: source.selected,
      included: source.included,
      selectionReason: source.selectionReason,
    }));
  return sifuAuditSha256(JSON.stringify({ version: SIFU_SOURCE_AUDIT_VERSION, included }));
}

export function buildSifuSourceAuditRecord(input: {
  manifest: SifuSourceManifest;
  feature: string;
  route?: string | null;
  mode?: string | null;
  topic?: string | null;
  lang?: string | null;
  model?: string | null;
  cached?: boolean;
  status?: "ok" | "error" | "shadow" | "posthoc";
  error?: string | null;
  profileId?: string | null;
  researchAiMessageId?: string | null;
  promptHash?: string | null;
  contextHash?: string | null;
  packetHash?: string | null;
  answer?: string | null;
  answerHash?: string | null;
  candidatePlanHashSha256?: string | null;
  routerHashSha256?: string | null;
  selectedChunkIds?: string[] | null;
  selectionReasons?: string[] | null;
  auditRunId?: string | null;
  createdAt?: string;
  answerSupportedBy?: SifuAnswerSupportedByAudit;
  modelClaimedUsed?: SifuModelClaimedUsedAudit;
}): SifuSourceAuditRecord {
  const createdAt = input.createdAt || new Date().toISOString();
  const answerHash = input.answerHash || (input.answer ? sifuAuditSha256(input.answer) : null);
  const promptSourceMapHash = buildPromptSourceMapHash(input.manifest.sources);
  const selectedChunkIds = stringArray(input.selectedChunkIds);
  const selectionReasons = stringArray(input.selectionReasons);
  const auditSeed = {
    version: SIFU_SOURCE_AUDIT_VERSION,
    feature: input.feature,
    route: input.route || null,
    mode: input.mode || null,
    topic: input.topic || null,
    lang: input.lang || "th",
    model: input.model || null,
    cached: !!input.cached,
    status: input.status || "ok",
    profileId: input.profileId || null,
    promptHash: input.promptHash || null,
    contextHash: input.contextHash || null,
    packetHash: input.packetHash || null,
    answerHash,
    candidatePlanHashSha256: input.candidatePlanHashSha256 || null,
    routerHashSha256: input.routerHashSha256 || null,
    selectedChunkIds,
    selectionReasons,
    sourceManifestHash: input.manifest.sourceManifestHash,
    promptSourceMapHash,
    createdAt,
  };
  return {
    auditVersion: SIFU_SOURCE_AUDIT_VERSION,
    auditRunId: input.auditRunId || sifuAuditSha256(JSON.stringify(auditSeed)).slice(0, 32),
    researchAiMessageId: input.researchAiMessageId || null,
    feature: input.feature,
    route: input.route || null,
    mode: input.mode || null,
    topic: input.topic || null,
    lang: input.lang || "th",
    model: input.model || null,
    cached: !!input.cached,
    status: input.status || "ok",
    error: input.error || null,
    profileId: input.profileId || null,
    promptHash: input.promptHash || null,
    contextHash: input.contextHash || null,
    packetHash: input.packetHash || null,
    answerHash,
    candidatePlanHashSha256: input.candidatePlanHashSha256 || null,
    routerHashSha256: input.routerHashSha256 || null,
    sourceManifestHash: input.manifest.sourceManifestHash,
    promptSourceMapHash,
    sourceManifest: summarizeSifuSourceManifest(input.manifest),
    includedSources: input.manifest.sources.filter((source) => source.included).map(includedSource),
    preselectedSources: input.manifest.sources.map(preselectedSource),
    selectedChunkIds,
    selectionReasons,
    answerSupportedBy: input.answerSupportedBy || { method: "not_run", proofLevel: "none", sources: [] },
    modelClaimedUsed: input.modelClaimedUsed === undefined ? null : input.modelClaimedUsed,
    createdAt,
  };
}

export function compactSifuSourceAuditRecord(record: SifuSourceAuditRecord): JsonMap {
  return {
    audit_version: record.auditVersion,
    audit_run_id: record.auditRunId,
    source_manifest_hash: record.sourceManifestHash,
    prompt_source_map_hash: record.promptSourceMapHash,
    prompt_hash: record.promptHash,
    context_hash: record.contextHash,
    packet_hash: record.packetHash,
    answer_hash: record.answerHash,
    candidate_plan_hash: record.candidatePlanHashSha256,
    router_hash: record.routerHashSha256,
    included_count: record.includedSources.length,
    preselected_count: record.preselectedSources.length,
    selected_chunk_ids: record.selectedChunkIds,
    selection_reasons: record.selectionReasons,
    answer_supported_by: record.answerSupportedBy,
    model_claimed_used: record.modelClaimedUsed,
  };
}
