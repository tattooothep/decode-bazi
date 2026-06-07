/**
 * Sifu source sidecar-audit guard.
 *
 * Read-only test. It validates the audit schema and pure audit record builder
 * without importing or changing /api/sifu runtime routes.
 *
 * Run:
 *   node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-sifu-source-audit.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSifuSourceAuditRecord, compactSifuSourceAuditRecord } from "../src/lib/sifu-source-audit.ts";
import { buildSifuSourceManifest } from "../src/lib/sifu-source-manifest.ts";

const ROOT = process.cwd();
const MIGRATION = readFileSync(join(ROOT, "migrations/20260606_sifu_source_audit.sql"), "utf8");
const AUDIT_LOG = readFileSync(join(ROOT, "src/lib/sifu-source-audit-log.ts"), "utf8");

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

console.log("[sifu-source-audit]");

const manifest = buildSifuSourceManifest("sifu-single-full-current", {
  generatedAt: "2026-06-06T00:00:00.000Z",
});
const selectedChunkIds = ["compact-baseline-7layers", "ajek-bazi-rules#method"];
const selectionReasons = ["compact-baseline-7layers: baseline always loaded", "ajek-bazi-rules#method: question asks method"];
const record = buildSifuSourceAuditRecord({
  manifest,
  feature: "sifu_master",
  route: "api/sifu",
  mode: "qa",
  topic: "debug",
  lang: "th",
  model: "claude-max-cli",
  cached: false,
  status: "ok",
  profileId: "00000000-0000-4000-8000-000000000001",
  promptHash: "p".repeat(64),
  contextHash: "c".repeat(16),
  packetHash: "a".repeat(64),
  candidatePlanHashSha256: "b".repeat(64),
  routerHashSha256: "d".repeat(64),
  selectedChunkIds,
  selectionReasons,
  answer: "ทดสอบคำตอบ",
  createdAt: "2026-06-06T00:00:00.000Z",
});
const compactRecord = compactSifuSourceAuditRecord(record);
const changedSelectionRecord = buildSifuSourceAuditRecord({
  manifest,
  feature: "sifu_master",
  route: "api/sifu",
  mode: "qa",
  topic: "debug",
  lang: "th",
  model: "claude-max-cli",
  cached: false,
  status: "ok",
  profileId: "00000000-0000-4000-8000-000000000001",
  promptHash: "p".repeat(64),
  contextHash: "c".repeat(16),
  packetHash: "a".repeat(64),
  candidatePlanHashSha256: "b".repeat(64),
  routerHashSha256: "e".repeat(64),
  selectedChunkIds: ["compact-baseline-7layers", "qtbj-tiaohou-clean#壬辰"],
  selectionReasons: ["compact-baseline-7layers: baseline always loaded", "qtbj-tiaohou-clean#壬辰: DM/month pair"],
  answer: "ทดสอบคำตอบ",
  createdAt: "2026-06-06T00:00:00.000Z",
});

ck("migration creates research_ai_source_audits table", /CREATE TABLE IF NOT EXISTS research_ai_source_audits/.test(MIGRATION));
for (const col of [
  "source_manifest_hash",
  "prompt_source_map_hash",
  "candidate_plan_hash",
  "router_hash",
  "included_sources",
  "preselected_sources",
  "selected_chunk_ids",
  "selection_reasons",
  "answer_supported_by",
  "model_claimed_used",
]) {
  ck(`migration has ${col}`, new RegExp(`\\b${col}\\b`).test(MIGRATION));
}
for (const col of ["router_hash", "selected_chunk_ids", "selection_reasons"]) {
  ck(`migration can upgrade existing table with ${col}`, new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`).test(MIGRATION));
}
ck("migration documents model_claimed_used as claim not proof", /claim, not proof/.test(MIGRATION));
ck("migration keeps candidate plan hash separate from prompt hash", /candidate_plan_hash/.test(MIGRATION) && /Separate from prompt_hash/.test(MIGRATION));
ck("migration documents router fields as sidecar proof", /router-side source selection output/.test(MIGRATION) && /Sidecar proof only/.test(MIGRATION));

ck("record uses source manifest hash", record.sourceManifestHash === manifest.sourceManifestHash, record.sourceManifestHash);
ck("record has sha256 prompt source map hash", /^[0-9a-f]{64}$/.test(record.promptSourceMapHash), record.promptSourceMapHash);
ck("record includes 23 currently included sources", record.includedSources.length === 23, `included=${record.includedSources.length}`);
ck("record preselects all 26 known sources with selected/included flags", record.preselectedSources.length === 26, `preselected=${record.preselectedSources.length}`);
ck("record defaults answer_supported_by to not_run", record.answerSupportedBy.method === "not_run" && record.answerSupportedBy.proofLevel === "none");
ck("record defaults model_claimed_used to null", record.modelClaimedUsed === null);
ck("record answer hash is sha256", !!record.answerHash && /^[0-9a-f]{64}$/.test(record.answerHash), record.answerHash || "");
ck("record keeps prompt hash and candidate plan hash separate", record.promptHash === "p".repeat(64) && record.candidatePlanHashSha256 === "b".repeat(64));
ck("record persists router hash", record.routerHashSha256 === "d".repeat(64));
ck("record persists selected chunk ids in order", JSON.stringify(record.selectedChunkIds) === JSON.stringify(selectedChunkIds), record.selectedChunkIds.join(","));
ck("record persists selection reasons in order", JSON.stringify(record.selectionReasons) === JSON.stringify(selectionReasons), record.selectionReasons.join(" | "));
ck("record auditRunId changes when router selection changes", record.auditRunId !== changedSelectionRecord.auditRunId, `${record.auditRunId} vs ${changedSelectionRecord.auditRunId}`);
ck("compact summary includes candidate plan hash", compactRecord.candidate_plan_hash === "b".repeat(64));
ck("compact summary includes router hash", compactRecord.router_hash === "d".repeat(64));
ck("compact summary includes selected chunk ids", JSON.stringify(compactRecord.selected_chunk_ids) === JSON.stringify(selectedChunkIds));
ck("compact summary includes selection reasons", JSON.stringify(compactRecord.selection_reasons) === JSON.stringify(selectionReasons));

const summaryText = JSON.stringify(record.sourceManifest);
ck("source manifest summary is audit-safe", summaryText.length < 35_000, `chars=${summaryText.length}`);
ck("included source rows do not contain full classic text", JSON.stringify(record.includedSources).length < 20_000, `chars=${JSON.stringify(record.includedSources).length}`);

const appRuntimeImports = listSourceFiles(join(ROOT, "src/app"))
  .filter((path) => /sifu-source-audit|research_ai_source_audits/.test(readFileSync(path, "utf8")))
  .map((path) => path.slice(ROOT.length + 1));
ck("source audit runtime imports are limited to env-gated /api/sifu route", appRuntimeImports.every((path) => path === "src/app/api/sifu/route.ts"), appRuntimeImports.join(", "));
ck("safe logger persists router audit fields in column order", /prompt_source_map_hash, router_hash, source_manifest,\s*included_sources, preselected_sources, selected_chunk_ids, selection_reasons,\s*answer_supported_by/.test(AUDIT_LOG));
ck("safe logger values align with router audit fields", /\$20,\$21,\$22,\$23::jsonb,\s*\$24::jsonb,\$25::jsonb,\$26::jsonb,\$27::jsonb,\s*\$28::jsonb/.test(AUDIT_LOG) && /clipText\(record\.promptSourceMapHash, 128\),\s*clipText\(record\.routerHashSha256, 128\),\s*safeJson\(record\.sourceManifest\),\s*safeJson\(record\.includedSources\),\s*safeJson\(record\.preselectedSources\),\s*safeJson\(record\.selectedChunkIds\),\s*safeJson\(record\.selectionReasons\),\s*safeJson\(record\.answerSupportedBy\)/s.test(AUDIT_LOG));

console.log(`\n[sifu-source-audit] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
