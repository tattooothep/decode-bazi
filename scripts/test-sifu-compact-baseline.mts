/**
 * Sifu compact baseline 7-layer guard.
 *
 * Read-only test. It validates the Phase 3A compact baseline artifact and
 * builder without importing or changing /api/sifu runtime routes.
 *
 * Run:
 *   node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-sifu-compact-baseline.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SIFU_COMPACT_BASELINE_LAYERS,
  buildSifuCompactBaseline,
  summarizeSifuCompactBaseline,
} from "../src/lib/sifu-compact-baseline.ts";
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

console.log("[sifu-compact-baseline]");

const manifest = buildSifuSourceManifest("sifu-single-full-current", {
  generatedAt: "2026-06-06T00:00:00.000Z",
});
const baseline = buildSifuCompactBaseline({
  manifest,
  generatedAt: "2026-06-06T00:00:00.000Z",
});
const summary = summarizeSifuCompactBaseline(baseline);

const expectedLayerIds = [
  "fact-lock",
  "ajek-procedure",
  "interaction-authority",
  "geju-xiangshen",
  "dts-conghua",
  "qtbj-dm-month",
  "shishen-roles",
];

ck("baseline has exactly 7 layers", baseline.layerCount === 7, `layers=${baseline.layerCount}`);
ck("layer ids and order match required baseline", JSON.stringify(SIFU_COMPACT_BASELINE_LAYERS.map((l) => l.layerId)) === JSON.stringify(expectedLayerIds));
ck("every layer is required every question", baseline.layers.every((layer) => layer.requiredEveryQuestion === true));
ck("fact-lock layer is packet anchored and source-free", baseline.layers[0].layerId === "fact-lock" && baseline.layers[0].sourceIds.length === 0);
ck("baseline markdown includes global source priority", /## Global Source Priority/.test(baseline.text));
ck("baseline markdown includes sidecar audit discipline", /included_sources: sources actually sent to prompt/.test(baseline.text));
ck("baseline markdown includes QTBJ DM x month router requirement", /Select only the block for 日干 x 月令/.test(baseline.text));
ck("baseline markdown includes full false-premise no-invention rule", /Do not invent 子子自刑, 辰戌冲, 寅戌半合/.test(baseline.text) && /cross-chart reactions because the user's question contains them/.test(baseline.text));
ck("baseline markdown requires conditional borderline language", /label every conclusion "เฉพาะถ้า\.\.\."/.test(baseline.text));
ck("baseline size is compact budget compatible", baseline.chars >= 18_000 && baseline.chars <= 45_000, `chars=${baseline.chars}`);
ck("baseline hash is sha256", /^[0-9a-f]{64}$/.test(baseline.baselineHashSha256), baseline.baselineHashSha256);
ck("source map hash is sha256", /^[0-9a-f]{64}$/.test(baseline.sourceMapHashSha256), baseline.sourceMapHashSha256);
ck("baseline uses current source manifest hash", baseline.sourceManifestHash === manifest.sourceManifestHash, baseline.sourceManifestHash);
ck("all layer source ids resolve to manifest sources", baseline.missingSourceIds.length === 0, baseline.missingSourceIds.join(", "));
ck("baseline source map references 20 source rows", baseline.sourceRows.length === 20, `sources=${baseline.sourceRows.length}`);
ck("all source rows include source and prompt segment hashes", baseline.sourceRows.every((row) => /^[0-9a-f]{64}$/.test(row.sourceHashSha256) && /^[0-9a-f]{64}$/.test(row.promptSegmentHashSha256)));
ck("summary is audit-safe and excludes full baseline text", !JSON.stringify(summary).includes("Minimum Baseline Output Discipline"), `summaryChars=${JSON.stringify(summary).length}`);
ck("summary stays compact", JSON.stringify(summary).length < 25_000, `summaryChars=${JSON.stringify(summary).length}`);
ck("manifest source counts remain current", manifest.knownSourceCount === 26 && manifest.sourceCount === 23, `known=${manifest.knownSourceCount} included=${manifest.sourceCount}`);

const appRuntimeImports = listSourceFiles(join(ROOT, "src/app"))
  .filter((path) => /sifu-compact-baseline|SIFU_COMPACT_BASELINE|compact-baseline-7layers/.test(readFileSync(path, "utf8")))
  .map((path) => path.slice(ROOT.length + 1));
ck("compact baseline is not imported by runtime app routes", appRuntimeImports.length === 0, appRuntimeImports.join(", "));

console.log(`\n[sifu-compact-baseline] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
