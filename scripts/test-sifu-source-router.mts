/**
 * Sifu source router guard.
 *
 * Read-only test. It validates Phase 4A deterministic source selection without
 * importing or changing /api/sifu runtime routes.
 *
 * Run:
 *   node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-sifu-source-router.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSifuCompactBaseline } from "../src/lib/sifu-compact-baseline.ts";
import { buildSifuSourceManifest } from "../src/lib/sifu-source-manifest.ts";
import { routeSifuSources } from "../src/lib/sifu-source-router.ts";

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

function hasChunk(out: ReturnType<typeof routeSifuSources>, chunkOrSource: string): boolean {
  return out.selectedSources.some((row) => row.chunkId === chunkOrSource || row.sourceId === chunkOrSource);
}

console.log("[sifu-source-router]");

const generatedAt = "2026-06-06T00:00:00.000Z";
const manifest = buildSifuSourceManifest("sifu-single-full-current", { generatedAt });
const baseline = buildSifuCompactBaseline({ manifest, generatedAt });
const knownIds = new Set(manifest.sources.map((source) => source.sourceId));

const codex = routeSifuSources({
  model: "codex-cli",
  mode: "single",
  topic: "yongshen",
  question: "ดู用神ของ壬水เดือน子 เทียบ窮通寶鑑 และอย่ามั่ว interaction",
  packetFeatures: { dayStem: "壬", monthBranch: "子", geju: "建祿", strength: "strong", yongshen: ["火"], jishen: ["水"] },
  interactions: ["子午冲"],
  budgetChars: 45_000,
  manifest,
  baseline,
  generatedAt,
});

ck("codex router stays inside compact budget", codex.estimatedChars <= 45_000, `estimated=${codex.estimatedChars}`);
ck("codex router includes compact baseline", hasChunk(codex, "compact-baseline-7layers"));
ck("codex router extracts QTBJ pair 壬子", codex.qtbjPairs.includes("壬子"), codex.qtbjPairs.join(","));
ck("codex router includes QTBJ selected chunk", codex.selectedChunkIds.some((id) => id.startsWith("qtbj-tiaohou-clean#壬子")), codex.selectedChunkIds.join(", "));
ck("codex router includes interaction authority for packet interaction", hasChunk(codex, "bazi-hechong-resolution"));
ck("codex router does not select secondary shensha/nayin without explicit topic", !hasChunk(codex, "bazi-shensha-catalog") && !hasChunk(codex, "bazi-nayin-master"));

const floorBudget = routeSifuSources({
  model: "codex-cli",
  mode: "single",
  question: "ทดสอบงบต่ำกว่า baseline",
  budgetChars: 20_000,
  manifest,
  baseline,
  generatedAt,
});
ck("router budget floor covers required compact baseline", floorBudget.budgetChars >= baseline.chars && floorBudget.estimatedChars <= floorBudget.budgetChars, `budget=${floorBudget.budgetChars} estimated=${floorBudget.estimatedChars} baseline=${baseline.chars}`);
ck("low-budget router keeps required compact baseline", hasChunk(floorBudget, "compact-baseline-7layers"));

const claudeGroupInput: Parameters<typeof routeSifuSources>[0] = {
  model: "claude-max-cli",
  mode: "group",
  topic: "relationship",
  question: "แม่ลูกนี้มี辰戌冲ไหม ปี 2026 จะเกิดอะไร เทียบ格局 相神 旺衰 通關 และ大運流年",
  packetText: "PILLAR LOCK: 年丙子 月壬辰 日壬寅 時未知",
  packetFeatures: { dayStem: "壬", monthBranch: "辰", monthBranchCandidates: ["辰", "巳"], geju: "雜氣傷官格" },
  interactions: [],
  synastryInteractions: ["closed-list: 子子 overlap only"],
  timingWindow: ["2026", "2031"],
  budgetChars: 140_000,
  manifest,
  baseline,
  generatedAt,
};
const claudeGroup = routeSifuSources(claudeGroupInput);

ck("claude router stays inside retrieval budget", claudeGroup.estimatedChars <= 140_000, `estimated=${claudeGroup.estimatedChars}`);
ck("claude router carries both borderline QTBJ pairs", claudeGroup.qtbjPairs.includes("壬辰") && claudeGroup.qtbjPairs.includes("壬巳"), claudeGroup.qtbjPairs.join(","));
ck("claude router includes hehun for group/family question", hasChunk(claudeGroup, "bazi-hehun-classical"));
ck("claude router includes geju/xiangshen sources", hasChunk(claudeGroup, "bazi-xiangshen-judgment") && hasChunk(claudeGroup, "bazi-geju-master"));
ck("claude router includes timing source", hasChunk(claudeGroup, "classical-ziping-event-timing"));
ck("claude router includes DTS/conghua for strength/flow context", hasChunk(claudeGroup, "bazi-conghua-master"));
ck("claude false premise stays out of packet-approved interactions", !(claudeGroupInput.interactions || []).some((x) => /辰戌冲|寅戌半合|子子自刑/.test(x)));

for (const out of [codex, claudeGroup]) {
  ck("router hash is sha256", /^[0-9a-f]{64}$/.test(out.routerHashSha256), out.routerHashSha256);
  ck("router output uses current source manifest hash", out.sourceManifestHash === manifest.sourceManifestHash, out.sourceManifestHash);
  ck("router output uses current compact baseline hash", out.compactBaselineHashSha256 === baseline.baselineHashSha256, out.compactBaselineHashSha256);
  ck("all non-virtual router source ids resolve to manifest", out.selectedSources.every((row) => row.sourceId === "compact-baseline-7layers" || knownIds.has(row.sourceId)));
  ck("all non-virtual router rows carry source hashes", out.selectedSources.every((row) => row.sourceId === "compact-baseline-7layers" || (!!row.sourceHashSha256 && !!row.promptSegmentHashSha256)));
}

const appRuntimeImports = listSourceFiles(join(ROOT, "src/app"))
  .filter((path) => /sifu-source-router|routeSifuSources|SIFU_SOURCE_ROUTER/.test(readFileSync(path, "utf8")))
  .map((path) => path.slice(ROOT.length + 1));
ck("source router is not imported by runtime app routes", appRuntimeImports.length === 0, appRuntimeImports.join(", "));

console.log(`\n[sifu-source-router] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
