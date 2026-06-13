import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  buildSifuSourceManifest,
  type SifuSourceManifest,
  type SifuSourceManifestEntry,
} from "./sifu-source-manifest";

export const SIFU_COMPACT_BASELINE_VERSION = "sifu-compact-baseline-v1";

const BASELINE_PATH = "data/library/sifu-authority/compact-baseline-7layers.md";

export type SifuCompactBaselineLayerId =
  | "fact-lock"
  | "ajek-procedure"
  | "interaction-authority"
  | "geju-xiangshen"
  | "dts-conghua"
  | "qtbj-dm-month"
  | "shishen-roles";

export type SifuCompactBaselineLayer = {
  layerId: SifuCompactBaselineLayerId;
  rank: number;
  title: string;
  requiredEveryQuestion: true;
  packetAnchors: string[];
  sourceIds: string[];
  scope: string;
  decisionOrder: string[];
  conflictDefault: string;
  doNotUseAs: string[];
};

export type SifuCompactBaselineSourceRow = {
  sourceId: string;
  layerId: SifuCompactBaselineLayerId;
  authorityBook: string;
  tier: string;
  relativePath: string;
  chars: number;
  bytes: number;
  sourceHashSha256: string;
  promptSegmentHashSha256: string;
  selected: boolean;
  included: boolean;
  selectionReason: string;
};

export type SifuCompactBaseline = {
  baselineVersion: string;
  generatedAt: string;
  relativePath: string;
  chars: number;
  bytes: number;
  baselineHashSha256: string;
  sourceMapHashSha256: string;
  sourceManifestHash: string;
  layerCount: number;
  layers: SifuCompactBaselineLayer[];
  sourceRows: SifuCompactBaselineSourceRow[];
  missingSourceIds: string[];
  text: string;
};

export const SIFU_COMPACT_BASELINE_LAYERS: SifuCompactBaselineLayer[] = [
  {
    layerId: "fact-lock",
    rank: 1,
    title: "FACT LOCK / PILLAR LOCK / Chart Packet",
    requiredEveryQuestion: true,
    packetAnchors: ["FACT LOCK", "PILLAR LOCK", "chartPacket", "identity lock", "profile binding"],
    sourceIds: [],
    scope: "Chart facts, identity, pillars, missing data, packet interactions, and closed-list synastry.",
    decisionOrder: ["identity", "FACT LOCK", "PILLAR LOCK", "packet interactions", "conditional warnings"],
    conflictDefault: "FACT/PILLAR facts are immutable; packet interactions are deterministic evidence, but exact retrieved classics can override raw packet/engine interpretation inside their scoped doctrine.",
    doNotUseAs: ["a classic source", "permission to correct packet facts from memory", "proof that any book was used"],
  },
  {
    layerId: "ajek-procedure",
    rank: 2,
    title: "Ajek Reading Procedure",
    requiredEveryQuestion: true,
    packetAnchors: ["question type", "profile mode", "topic", "history"],
    sourceIds: ["ajek-bazi-rules"],
    scope: "Stable reading sequence from question to locked facts to illness/medicine to practical answer.",
    decisionOrder: ["question", "chart target", "locked facts", "illness", "medicine", "life translation", "conditions"],
    conflictDefault: "Procedure organizes evidence; it cannot override packet facts or exact retrieved sources.",
    doNotUseAs: ["poetic cover for missing evidence", "single-element verdict", "raw count-based strength"],
  },
  {
    layerId: "interaction-authority",
    rank: 3,
    title: "Interaction Authority - 合冲刑害破 / 墓庫",
    requiredEveryQuestion: true,
    packetAnchors: ["packet interactions", "luck interactions", "year interactions", "synastry closed-list"],
    sourceIds: ["bazi-interaction-master", "bazi-hechong-resolution", "pillar-interactions"],
    scope: "Allowed interaction evidence, strength ranking, transformation boundary, vault/opening logic.",
    decisionOrder: ["exact pair", "location", "affected layer", "strength", "result"],
    conflictDefault: "If packet does not list a non-visible interaction, downgrade it from primary evidence.",
    doNotUseAs: ["invented cross-chart reactions", "合 means good", "冲 means bad", "same-year branch verdict"],
  },
  {
    layerId: "geju-xiangshen",
    rank: 4,
    title: "格局 / 相神 / 成格 / 破格 / 救應",
    requiredEveryQuestion: true,
    packetAnchors: ["month command", "格局", "用神", "忌神", "strength"],
    sourceIds: ["bazi-geju-master", "bazi-xiangshen-judgment", "zpzq-zhenquan-clean", "yhzp-juan3-koujue"],
    scope: "Structure, helper, success/failure, damage, rescue, purity/muddiness.",
    decisionOrder: ["month frame", "透/root/clear", "damage", "rescue", "life translation"],
    conflictDefault: "Zi Ping structure authority wins for structure; QTBJ remains climate-only.",
    doNotUseAs: ["single ten-god label", "forced one-格 answer", "成格 claim without helper/rescue evidence"],
  },
  {
    layerId: "dts-conghua",
    rank: 5,
    title: "滴天髓 / 從化 / 旺衰 / 氣勢 / 通關",
    requiredEveryQuestion: true,
    packetAnchors: ["strength", "rootedness", "month command", "flow", "luck/year activation"],
    sourceIds: ["dts-zhentian-clean", "bazi-conghua-master", "sftk-clean", "yongshen-selection-engine-reference"],
    scope: "Living qi, strength, flow, illness/medicine, conghua boundary, and mediator logic.",
    decisionOrder: ["season", "roots", "透/source-flow", "packet reactions", "illness/medicine", "timing"],
    conflictDefault: "DTS wins for qi/strength/conghua language but cannot change locked pillars or QTBJ pair text.",
    doNotUseAs: ["element counts as strength", "automatic true 從/化", "rhetorical collapse without timing evidence"],
  },
  {
    layerId: "qtbj-dm-month",
    rank: 6,
    title: "窮通寶鑑 DM x Month Climate",
    requiredEveryQuestion: true,
    packetAnchors: ["日干", "月令", "month boundary", "QTBJ retrieved blocks"],
    sourceIds: ["qtbj-tiaohou-clean", "qtbj-tiaohou-lookup", "qtbj-tiaohou-thai-notes", "sifu-qtbj-compact-router-source"],
    scope: "Climate correction only: heat/cold/dry/wet and primary/secondary 調候 method.",
    decisionOrder: ["DM/month", "canonical block", "primary/secondary climate", "compare packet", "life translation"],
    conflictDefault: "QTBJ wins inside climate scope; it cannot override FACT/PILLAR facts, but it can override raw packet/engine climate medicine when the canonical DM-month block is explicit.",
    doNotUseAs: ["full QTBJ load every request", "training-memory month answer", "structural 格局 replacement"],
  },
  {
    layerId: "shishen-roles",
    rank: 7,
    title: "十神 Role Glossary and Life Translation",
    requiredEveryQuestion: true,
    packetAnchors: ["ten gods", "domains", "palaces", "luck/year activation"],
    sourceIds: ["bazi-shishen-classical", "yhzp-clean", "classical-bazi-five-life-domains", "bazi-zixi-mangpai"],
    scope: "Role language for behavior, relationship, money, career, health, and practical answer translation.",
    decisionOrder: ["relative role", "useful/harmful condition", "domain mapping", "timing", "practical wording"],
    conflictDefault: "Ten-god language cannot override structure, climate, packet facts, or timing activation.",
    doNotUseAs: ["fixed good/bad labels", "one-symbol spouse/child verdict", "literal fatalistic old gendered text"],
  },
];

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sourceRow(layerId: SifuCompactBaselineLayerId, source: SifuSourceManifestEntry): SifuCompactBaselineSourceRow {
  return {
    sourceId: source.sourceId,
    layerId,
    authorityBook: source.authorityBook,
    tier: source.tier,
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

export function buildSifuCompactBaseline(opts: {
  root?: string;
  generatedAt?: string;
  manifest?: SifuSourceManifest;
} = {}): SifuCompactBaseline {
  const root = opts.root || process.cwd();
  const generatedAt = opts.generatedAt || new Date().toISOString();
  const manifest = opts.manifest || buildSifuSourceManifest("sifu-single-full-current", { root, generatedAt });
  const byId = new Map(manifest.sources.map((source) => [source.sourceId, source]));
  const baselinePath = join(root, BASELINE_PATH);
  const text = readFileSync(baselinePath, "utf8").trim();
  const sourceRows: SifuCompactBaselineSourceRow[] = [];
  const missingSourceIds: string[] = [];
  for (const layer of SIFU_COMPACT_BASELINE_LAYERS) {
    for (const sourceId of layer.sourceIds) {
      const source = byId.get(sourceId);
      if (source) sourceRows.push(sourceRow(layer.layerId, source));
      else missingSourceIds.push(`${layer.layerId}:${sourceId}`);
    }
  }
  const sourceMap = sourceRows.map((row) => ({
    layerId: row.layerId,
    sourceId: row.sourceId,
    sourceHashSha256: row.sourceHashSha256,
    promptSegmentHashSha256: row.promptSegmentHashSha256,
    selected: row.selected,
    included: row.included,
  }));
  const sourceMapHashSha256 = sha256(JSON.stringify({
    version: SIFU_COMPACT_BASELINE_VERSION,
    sourceManifestHash: manifest.sourceManifestHash,
    sourceMap,
  }));
  const baselineHashSha256 = sha256(JSON.stringify({
    version: SIFU_COMPACT_BASELINE_VERSION,
    textHash: sha256(text),
    layers: SIFU_COMPACT_BASELINE_LAYERS,
    sourceMapHashSha256,
  }));
  return {
    baselineVersion: SIFU_COMPACT_BASELINE_VERSION,
    generatedAt,
    relativePath: relative(root, baselinePath),
    chars: text.length,
    bytes: Buffer.byteLength(text, "utf8"),
    baselineHashSha256,
    sourceMapHashSha256,
    sourceManifestHash: manifest.sourceManifestHash,
    layerCount: SIFU_COMPACT_BASELINE_LAYERS.length,
    layers: SIFU_COMPACT_BASELINE_LAYERS,
    sourceRows,
    missingSourceIds,
    text,
  };
}

export function summarizeSifuCompactBaseline(baseline: SifuCompactBaseline) {
  return {
    baselineVersion: baseline.baselineVersion,
    relativePath: baseline.relativePath,
    chars: baseline.chars,
    bytes: baseline.bytes,
    baselineHashSha256: baseline.baselineHashSha256,
    sourceMapHashSha256: baseline.sourceMapHashSha256,
    sourceManifestHash: baseline.sourceManifestHash,
    layerCount: baseline.layerCount,
    sourceCount: baseline.sourceRows.length,
    missingSourceIds: baseline.missingSourceIds,
    layers: baseline.layers.map((layer) => ({
      layerId: layer.layerId,
      rank: layer.rank,
      title: layer.title,
      sourceIds: layer.sourceIds,
      packetAnchors: layer.packetAnchors,
      scope: layer.scope,
      conflictDefault: layer.conflictDefault,
      doNotUseAs: layer.doNotUseAs,
    })),
    sources: baseline.sourceRows.map((row) => ({
      sourceId: row.sourceId,
      layerId: row.layerId,
      authorityBook: row.authorityBook,
      tier: row.tier,
      relativePath: row.relativePath,
      chars: row.chars,
      bytes: row.bytes,
      sourceHashSha256: row.sourceHashSha256,
      promptSegmentHashSha256: row.promptSegmentHashSha256,
      selected: row.selected,
      included: row.included,
      selectionReason: row.selectionReason,
    })),
  };
}
