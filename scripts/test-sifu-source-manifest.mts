/**
 * Sifu source manifest guard.
 *
 * This test is intentionally read-only. It proves the source catalog tracks the
 * current full-prompt source inventory without changing /api/sifu prompt text.
 *
 * Run:
 *   node --experimental-strip-types scripts/test-sifu-source-manifest.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SIFU_SOURCE_DESCRIPTORS,
  SIFU_SOURCE_MANIFEST_VERSION,
  buildSifuSourceManifest,
  summarizeSifuSourceManifest,
} from "../src/lib/sifu-source-manifest.ts";

const ROOT = process.cwd();
const ROUTE_SINGLE = readFileSync(join(ROOT, "src/app/api/sifu/route.ts"), "utf8");
const ROUTE_GROUP = readFileSync(join(ROOT, "src/app/api/sifu/group/route.ts"), "utf8");

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

function fileName(path: string): string {
  return path.split("/").pop() || path;
}

function hasRouteRegistration(routeSource: string, file: string): boolean {
  return routeSource.includes(fileName(file));
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(path));
    } else if (/\.(ts|tsx|js|jsx|mts|mjs)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

console.log("[sifu-source-manifest]");

const single = buildSifuSourceManifest("sifu-single-full-current", {
  generatedAt: "2026-06-06T00:00:00.000Z",
});
const group = buildSifuSourceManifest("sifu-group-full-current", {
  generatedAt: "2026-06-06T00:00:00.000Z",
});
const codex = buildSifuSourceManifest("codex-compact-current", {
  generatedAt: "2026-06-06T00:00:00.000Z",
});
const summary = summarizeSifuSourceManifest(single);

ck("manifest version is pinned", single.manifestVersion === SIFU_SOURCE_MANIFEST_VERSION, single.manifestVersion);
ck("single full manifest has exactly 23 included sources", single.sourceCount === 23, `count=${single.sourceCount}`);
ck("group full manifest has exactly 22 included sources", group.sourceCount === 22, `count=${group.sourceCount}`);
ck("single manifest retains exactly 26 known sources", single.knownSourceCount === 26, `known=${single.knownSourceCount} included=${single.sourceCount}`);
ck("group manifest retains exactly 26 known sources", group.knownSourceCount === 26, `known=${group.knownSourceCount} included=${group.sourceCount}`);
ck("codex manifest retains exactly 26 known sources", codex.knownSourceCount === 26, `known=${codex.knownSourceCount} included=${codex.sourceCount}`);
ck("codex compact manifest includes exactly 4 compact retrieval sources", codex.sourceCount === 4, `count=${codex.sourceCount}`);
ck("single source manifest hash is sha256", /^[0-9a-f]{64}$/.test(single.sourceManifestHash), single.sourceManifestHash);
ck("single full manifest still represents a large full-classics corpus", single.totalBytes > 1_700_000, `bytes=${single.totalBytes} chars=${single.totalChars}`);

const singleRouteMissing = single.sources
  .filter((source) => source.included)
  .filter((source) => !hasRouteRegistration(ROUTE_SINGLE, source.file))
  .map((source) => source.sourceId);
ck("all single manifest files are registered in /api/sifu route", singleRouteMissing.length === 0, singleRouteMissing.join(", "));

const groupRouteMissing = group.sources
  .filter((source) => source.included)
  .filter((source) => !hasRouteRegistration(ROUTE_GROUP, source.file))
  .map((source) => source.sourceId);
ck("all group manifest files are registered in /api/sifu/group route", groupRouteMissing.length === 0, groupRouteMissing.join(", "));

const groupExcluded = group.sources.filter((source) => !source.included).map((source) => source.sourceId);
ck("group manifest preserves known single-only source as not included", groupExcluded.includes("yhzp-juan3-koujue"), groupExcluded.join(", "));

const codexIds = codex.sources.filter((source) => source.included).map((source) => source.sourceId);
ck(
  "codex compact source inventory includes base canon + qtbj clean/lookup/router",
  ["sifu-codex-base-canon-source", "sifu-qtbj-compact-router-source", "qtbj-tiaohou-clean", "qtbj-tiaohou-lookup"].every((id) => codexIds.includes(id)),
  codexIds.join(", ")
);

const invalidHashes = single.sources.filter((source) =>
  !/^[0-9a-f]{64}$/.test(source.sourceHashSha256)
  || !/^[0-9a-f]{64}$/.test(source.promptSegmentHashSha256)
);
ck("every source has source hash + prompt segment hash", invalidHashes.length === 0, invalidHashes.map((s) => s.sourceId).join(", "));

const duplicateIds = SIFU_SOURCE_DESCRIPTORS
  .map((source) => source.sourceId)
  .filter((id, idx, ids) => ids.indexOf(id) !== idx);
ck("source ids are unique", duplicateIds.length === 0, duplicateIds.join(", "));

const authorityBooks = new Set(single.sources.map((source) => source.authorityBook));
const expectedAuthorityBooks = [
  "bazi-authority-procedure",
  "bazi-authority-interactions",
  "bazi-authority-geju-xiangshen",
  "bazi-authority-tiaohou-yongshen",
  "bazi-authority-conghua-special-ge",
  "bazi-authority-shishen-roles",
  "bazi-authority-yingqi-timing",
  "bazi-authority-hehun-liuqin",
  "bazi-authority-shensha-secondary",
  "bazi-authority-nayin-texture",
];
const missingAuthorityBooks = expectedAuthorityBooks.filter((book) => !authorityBooks.has(book as never));
ck("manifest maps current sources to the planned authority-book families", missingAuthorityBooks.length === 0, missingAuthorityBooks.join(", "));

const summaryText = JSON.stringify(summary);
ck("summary is audit-safe and does not embed full classic content", summaryText.length < 30_000, `summaryChars=${summaryText.length}`);
ck("summary lists known compact source rows including non-included sources", summary.sources.length === single.knownSourceCount, `rows=${summary.sources.length}`);
ck("summary preserves selected/included flags for sidecar audit", summary.sources.every((source) => "selected" in source && "included" in source), "");

const runtimeImports = listSourceFiles(join(ROOT, "src/app"))
  .filter((path) => /sifu-source-manifest/.test(readFileSync(path, "utf8")))
  .map((path) => path.slice(ROOT.length + 1));
ck("source manifest is not imported by runtime app routes", runtimeImports.length === 0, runtimeImports.join(", "));

console.log(`\n[sifu-source-manifest] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
