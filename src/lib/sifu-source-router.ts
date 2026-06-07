import { createHash } from "node:crypto";
import {
  buildSifuSourceManifest,
  type SifuSourceManifest,
  type SifuSourceManifestEntry,
} from "./sifu-source-manifest";
import {
  buildSifuCompactBaseline,
  type SifuCompactBaseline,
} from "./sifu-compact-baseline";

export const SIFU_SOURCE_ROUTER_VERSION = "sifu-source-router-v1";

const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";

export type SifuRouterModel = "claude-max-cli" | "codex-cli" | string;
export type SifuRouterMode = "single" | "pair" | "group" | "intro" | "audit";

export type SifuRouterPacketFeatures = {
  dayStem?: string | null;
  monthStem?: string | null;
  monthBranch?: string | null;
  monthBranchCandidates?: string[];
  geju?: string | null;
  yongshen?: string[] | null;
  jishen?: string[] | null;
  strength?: string | null;
};

export type SifuSourceRouterInput = {
  model: SifuRouterModel;
  mode?: SifuRouterMode;
  topic?: string | null;
  question: string;
  history?: string[];
  packetText?: string | null;
  packetFeatures?: SifuRouterPacketFeatures;
  interactions?: string[];
  synastryInteractions?: string[];
  timingWindow?: string[];
  budgetChars?: number;
  generatedAt?: string;
  manifest?: SifuSourceManifest;
  baseline?: SifuCompactBaseline;
};

export type SifuSourceRouterSelection = {
  sourceId: string;
  chunkId: string;
  authorityBook: string;
  layerId?: string;
  reason: string;
  score: number;
  estimatedChars: number;
  sourceHashSha256?: string;
  promptSegmentHashSha256?: string;
  selected: true;
};

export type SifuSourceRouterOutput = {
  routerVersion: string;
  generatedAt: string;
  model: SifuRouterModel;
  mode: SifuRouterMode;
  budgetChars: number;
  estimatedChars: number;
  sourceManifestHash: string;
  compactBaselineHashSha256: string;
  routerHashSha256: string;
  selectedChunkIds: string[];
  qtbjPairs: string[];
  selectionReasons: string[];
  selectedSources: SifuSourceRouterSelection[];
  warnings: string[];
};

type TopicFlags = {
  interaction: boolean;
  geju: boolean;
  dts: boolean;
  qtbj: boolean;
  shishen: boolean;
  timing: boolean;
  hehun: boolean;
  health: boolean;
  wealthCareer: boolean;
  audit: boolean;
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isCodex(model: SifuRouterModel): boolean {
  return String(model || "").toLowerCase().includes("codex");
}

function defaultBudget(model: SifuRouterModel): number {
  return isCodex(model) ? 45_000 : 120_000;
}

function normalizeText(input: SifuSourceRouterInput): string {
  return [
    input.topic || "",
    input.question || "",
    ...(input.history || []),
    input.packetText || "",
    ...(input.interactions || []),
    ...(input.synastryInteractions || []),
    ...(input.timingWindow || []),
    input.packetFeatures?.geju || "",
    input.packetFeatures?.strength || "",
    ...(input.packetFeatures?.yongshen || []),
    ...(input.packetFeatures?.jishen || []),
  ].join("\n");
}

function classify(input: SifuSourceRouterInput): TopicFlags {
  const text = normalizeText(input);
  const mode = input.mode || "single";
  return {
    interaction: /合|冲|沖|刑|害|破|墓|庫|库|暗合|三合|三會|六合|clash|interaction|ปฏิกิริยา|ชน|ฮะ|ชง/.test(text)
      || (input.interactions || []).length > 0,
    geju: /格局|相神|成格|破格|救應|救应|用神|喜忌|忌神|官殺|官杀|財格|财格|印格|食傷|伤官|โครง|เก๊ก|ย่งซิ้ง/.test(text),
    dts: /滴天髓|旺衰|氣勢|气势|從格|从格|化格|通關|通关|病藥|病药|強弱|强弱|得令|得地|得勢|ราก|กำลัง|ธาตุ/.test(text),
    qtbj: /窮通|穷通|調候|调候|月令|寒|暖|燥|濕|湿|ร้อน|เย็น|แห้ง|ชื้น|เดือน/.test(text)
      || !!input.packetFeatures?.dayStem
      || !!input.packetFeatures?.monthBranch,
    shishen: /十神|比肩|劫財|劫财|食神|傷官|伤官|正財|偏財|正官|七殺|七杀|正印|偏印|ดาว|財|财|官|印/.test(text),
    timing: /大運|大运|流年|ปีจร|วัยจร|เดือนจร|timing|เมื่อไหร่|202[0-9]|203[0-9]|256[0-9]|257[0-9]/.test(text)
      || (input.timingWindow || []).length > 0,
    hehun: /合婚|คู่|ความรัก|แฟน|แต่งงาน|แม่|ลูก|พ่อ|ครอบครัว|synastry|group|กลุ่ม|ทีม/.test(text)
      || mode === "pair"
      || mode === "group"
      || (input.synastryInteractions || []).length > 0,
    health: /สุขภาพ|โรค|ป่วย|เจ็บ|health|illness|disease|病/.test(text),
    wealthCareer: /เงิน|งาน|อาชีพ|ธุรกิจ|wealth|career|finance|ทรัพย์|財|官/.test(text),
    audit: /audit|ผิด|มั่ว|ตรวจ|เทียบ|packet|prompt|source|คัมภีร์|พิสูจน์/.test(text) || mode === "audit",
  };
}

function pairKey(stem: string, branch: string): string {
  return `${stem}${branch}`;
}

function addPair(pairs: string[], stem?: string | null, branch?: string | null) {
  if (!stem || !branch) return;
  if (!new RegExp(`^[${STEMS}]$`).test(stem)) return;
  if (!new RegExp(`^[${BRANCHES}]$`).test(branch)) return;
  const key = pairKey(stem, branch);
  if (!pairs.includes(key)) pairs.push(key);
}

function extractQtbjPairs(input: SifuSourceRouterInput): string[] {
  const pairs: string[] = [];
  const f = input.packetFeatures || {};
  if (f.monthBranchCandidates?.length) {
    for (const branch of f.monthBranchCandidates) addPair(pairs, f.dayStem, branch);
  } else {
    addPair(pairs, f.dayStem, f.monthBranch);
  }
  const text = `${input.question}\n${input.packetText || ""}`;
  const pillarRe = new RegExp(`PILLAR LOCK[^\\n]*月([${STEMS}])([${BRANCHES}])[^\\n]*日([${STEMS}])([${BRANCHES}])`, "g");
  for (const m of text.matchAll(pillarRe)) addPair(pairs, m[3], m[2]);
  const dmMonthRe = new RegExp(`(?:日干|Day Master|DM)[=:\\s]*([${STEMS}])[\\s\\S]{0,80}(?:月令|monthBranch|เดือน|月)[=:\\s]*([${BRANCHES}])`, "g");
  for (const m of text.matchAll(dmMonthRe)) addPair(pairs, m[1], m[2]);
  return pairs.slice(0, 4);
}

function findSource(manifest: SifuSourceManifest, sourceId: string): SifuSourceManifestEntry | null {
  return manifest.sources.find((source) => source.sourceId === sourceId) || null;
}

function rowFromSource(source: SifuSourceManifestEntry, input: {
  chunkId?: string;
  reason: string;
  score: number;
  estimatedChars: number;
  layerId?: string;
}): SifuSourceRouterSelection {
  return {
    sourceId: source.sourceId,
    chunkId: input.chunkId || source.sourceId,
    authorityBook: source.authorityBook,
    layerId: input.layerId,
    reason: input.reason,
    score: input.score,
    estimatedChars: input.estimatedChars,
    sourceHashSha256: source.sourceHashSha256,
    promptSegmentHashSha256: source.promptSegmentHashSha256,
    selected: true,
  };
}

function makeSelector(manifest: SifuSourceManifest, selections: SifuSourceRouterSelection[], warnings: string[]) {
  const seen = new Set<string>();
  return (sourceId: string, input: {
    chunkId?: string;
    reason: string;
    score: number;
    estimatedChars?: number;
    layerId?: string;
  }) => {
    const chunkId = input.chunkId || sourceId;
    if (seen.has(chunkId)) return;
    const source = findSource(manifest, sourceId);
    if (!source) {
      warnings.push(`missing sourceId: ${sourceId}`);
      return;
    }
    seen.add(chunkId);
    selections.push(rowFromSource(source, {
      chunkId,
      reason: input.reason,
      score: input.score,
      estimatedChars: input.estimatedChars ?? Math.min(source.chars, 12_000),
      layerId: input.layerId,
    }));
  };
}

function addQtbjSelections(select: ReturnType<typeof makeSelector>, qtbjPairs: string[], codex: boolean) {
  select("sifu-qtbj-compact-router-source", {
    reason: "router support for deterministic DM x month extraction",
    score: 96,
    estimatedChars: codex ? 1_500 : 2_500,
    layerId: "qtbj-dm-month",
  });
  select("qtbj-tiaohou-lookup", {
    reason: "Thai lookup blocks for selected DM x month pairs",
    score: 95,
    estimatedChars: codex ? 7_000 : 14_000,
    layerId: "qtbj-dm-month",
  });
  select("qtbj-tiaohou-clean", {
    chunkId: qtbjPairs.length ? `qtbj-tiaohou-clean#${qtbjPairs.join(",")}` : "qtbj-tiaohou-clean#fallback",
    reason: qtbjPairs.length ? `canonical QTBJ pair blocks: ${qtbjPairs.join(", ")}` : "canonical QTBJ fallback because pair was not extracted",
    score: 94,
    estimatedChars: codex ? 5_500 : 18_000,
    layerId: "qtbj-dm-month",
  });
}

export function routeSifuSources(input: SifuSourceRouterInput): SifuSourceRouterOutput {
  const generatedAt = input.generatedAt || new Date().toISOString();
  const model = input.model || "claude-max-cli";
  const mode = input.mode || "single";
  const manifest = input.manifest || buildSifuSourceManifest("sifu-single-full-current", { generatedAt });
  const baseline = input.baseline || buildSifuCompactBaseline({ generatedAt, manifest });
  const budgetChars = Math.max(baseline.chars, input.budgetChars || defaultBudget(model));
  const flags = classify(input);
  const codex = isCodex(model);
  const qtbjPairs = extractQtbjPairs(input);
  const selectedSources: SifuSourceRouterSelection[] = [
    {
      sourceId: "compact-baseline-7layers",
      chunkId: "compact-baseline-7layers",
      authorityBook: "sifu-codex-compact-canon",
      layerId: "all-baseline-layers",
      reason: "required compact baseline for every routed Sifu question",
      score: 100,
      estimatedChars: baseline.chars,
      sourceHashSha256: baseline.baselineHashSha256,
      promptSegmentHashSha256: baseline.baselineHashSha256,
      selected: true,
    },
  ];
  const warnings: string[] = [];
  const select = makeSelector(manifest, selectedSources, warnings);

  if (flags.qtbj || qtbjPairs.length) addQtbjSelections(select, qtbjPairs, codex);

  if (flags.interaction) {
    select("bazi-hechong-resolution", { reason: "interaction resolution requested or packet interactions present", score: 88, estimatedChars: codex ? 5_000 : 14_000, layerId: "interaction-authority" });
    if (!codex) select("bazi-interaction-master", { reason: "full interaction authority for Claude retrieval budget", score: 82, estimatedChars: 16_000, layerId: "interaction-authority" });
    if (!codex) select("pillar-interactions", { reason: "deep pillar-by-pillar interaction examples", score: 76, estimatedChars: 10_000, layerId: "interaction-authority" });
  }

  if (flags.geju) {
    select("bazi-xiangshen-judgment", { reason: "格局/相神/成敗/rescue reasoning requested or implied", score: 86, estimatedChars: codex ? 4_500 : 12_000, layerId: "geju-xiangshen" });
    select("bazi-geju-master", { reason: "structure frame support", score: 85, estimatedChars: codex ? 3_500 : 10_000, layerId: "geju-xiangshen" });
    if (!codex) select("zpzq-zhenquan-clean", { reason: "primary Zi Ping structure classic for Claude retrieval", score: 78, estimatedChars: 20_000, layerId: "geju-xiangshen" });
  }

  if (flags.dts || flags.health) {
    select("bazi-conghua-master", { reason: "從化/false-following boundary and special chart support", score: 83, estimatedChars: codex ? 4_000 : 10_000, layerId: "dts-conghua" });
    if (!codex) select("dts-zhentian-clean", { reason: "DTS qi/strength/tongguan retrieval for Claude budget", score: 81, estimatedChars: 20_000, layerId: "dts-conghua" });
    if (flags.health) select("sftk-clean", { reason: "病藥/health and medicine-style reasoning", score: 77, estimatedChars: codex ? 3_000 : 10_000, layerId: "dts-conghua" });
  }

  if (flags.timing) {
    select("classical-ziping-event-timing", { reason: "大運/流年/event timing requested or timing window present", score: 84, estimatedChars: codex ? 4_000 : 12_000, layerId: "timing" });
    if (!codex) select("classical-bazi-five-life-domains", { reason: "domain-specific timing application", score: 70, estimatedChars: 9_000, layerId: "shishen-roles" });
  }

  if (flags.hehun) {
    select("bazi-hehun-classical", { reason: "pair/group/family/relationship question", score: 85, estimatedChars: codex ? 4_000 : 12_000, layerId: "hehun-liuqin" });
    if (!codex) select("bazi-zixi-mangpai", { reason: "spouse/children/family support", score: 72, estimatedChars: 8_000, layerId: "hehun-liuqin" });
  }

  if (flags.shishen || flags.wealthCareer) {
    select("bazi-shishen-classical", { reason: "十神 role translation requested or needed for life-domain answer", score: 79, estimatedChars: codex ? 4_000 : 10_000, layerId: "shishen-roles" });
    if (!codex) select("yhzp-clean", { reason: "early Zi Ping ten-god support for Claude retrieval", score: 68, estimatedChars: 10_000, layerId: "shishen-roles" });
  }

  if (!codex && /神煞|ดาวพิเศษ|นักษัตร|nayin|納音|纳音/.test(normalizeText(input))) {
    select("bazi-shensha-catalog", { reason: "secondary star question explicitly requested", score: 52, estimatedChars: 8_000, layerId: "shensha-secondary" });
    select("bazi-nayin-master", { reason: "nayin texture explicitly requested", score: 45, estimatedChars: 6_000, layerId: "nayin-texture" });
  }

  selectedSources.sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
  const trimmed: SifuSourceRouterSelection[] = [];
  let estimatedChars = 0;
  for (const row of selectedSources) {
    if (trimmed.length === 0 || estimatedChars + row.estimatedChars <= budgetChars) {
      trimmed.push(row);
      estimatedChars += row.estimatedChars;
    } else {
      warnings.push(`budget skipped ${row.chunkId}`);
    }
  }
  const selectedChunkIds = trimmed.map((row) => row.chunkId);
  const selectionReasons = trimmed.map((row) => `${row.chunkId}: ${row.reason}`);
  const routerHashSha256 = sha256(JSON.stringify({
    version: SIFU_SOURCE_ROUTER_VERSION,
    model,
    mode,
    budgetChars,
    sourceManifestHash: manifest.sourceManifestHash,
    compactBaselineHashSha256: baseline.baselineHashSha256,
    selected: trimmed.map((row) => ({
      sourceId: row.sourceId,
      chunkId: row.chunkId,
      score: row.score,
      estimatedChars: row.estimatedChars,
      sourceHashSha256: row.sourceHashSha256,
      promptSegmentHashSha256: row.promptSegmentHashSha256,
    })),
    qtbjPairs,
  }));
  return {
    routerVersion: SIFU_SOURCE_ROUTER_VERSION,
    generatedAt,
    model,
    mode,
    budgetChars,
    estimatedChars,
    sourceManifestHash: manifest.sourceManifestHash,
    compactBaselineHashSha256: baseline.baselineHashSha256,
    routerHashSha256,
    selectedChunkIds,
    qtbjPairs,
    selectionReasons,
    selectedSources: trimmed,
    warnings,
  };
}
