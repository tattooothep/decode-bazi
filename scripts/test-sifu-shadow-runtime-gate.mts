/**
 * Sifu Phase 6B runtime shadow-audit gate.
 *
 * Static guard only. It validates that the optional runtime hook is strict
 * opt-in, sidecar-only, fire-and-forget, and limited to /api/sifu.
 *
 * Run:
 *   node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-sifu-shadow-runtime-gate.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ROUTE = readFileSync(join(ROOT, "src/app/api/sifu/route.ts"), "utf8");
const AUDIT = readFileSync(join(ROOT, "src/lib/sifu-source-audit.ts"), "utf8");
const AUDIT_LOG = readFileSync(join(ROOT, "src/lib/sifu-source-audit-log.ts"), "utf8");
const SHADOW = readFileSync(join(ROOT, "src/lib/sifu-shadow-mode.ts"), "utf8");
const MIGRATION = readFileSync(join(ROOT, "migrations/20260606_sifu_source_audit.sql"), "utf8");

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

function count(pattern: RegExp, text: string): number {
  return (text.match(pattern) || []).length;
}

function hasScheduleBetween(start: number, end: number): boolean {
  if (start < 0 || end < 0 || end <= start) return true;
  return /scheduleSifuSourceShadowAudit\s*\(\s*{/.test(ROUTE.slice(start, end));
}

console.log("[sifu-shadow-runtime-gate]");

ck("hook markers are mandatory and unique", count(/SIFU_SOURCE_SHADOW_AUDIT_START/g, ROUTE) === 1 && count(/SIFU_SOURCE_SHADOW_AUDIT_END/g, ROUTE) === 1);

const hookMatch = ROUTE.match(/SIFU_SOURCE_SHADOW_AUDIT_START([\s\S]*?)SIFU_SOURCE_SHADOW_AUDIT_END/);
const hook = hookMatch?.[1] || "";
ck("hook block can be extracted", hook.length > 500, `chars=${hook.length}`);
ck("hook is strict env opt-in", /process\.env\.SIFU_SOURCE_SHADOW_AUDIT\s*!==\s*"1"/.test(hook) && !/SIFU_SOURCE_SHADOW_AUDIT\s*!==\s*"0"/.test(hook));
ck("hook skips intro mode", /input\.mode\s*===\s*"intro"/.test(hook));
ck("hook has explicit canary scope envs", /SIFU_SOURCE_SHADOW_AUDIT_PROFILE_IDS/.test(hook) && /SIFU_SOURCE_SHADOW_AUDIT_USER_IDS/.test(hook) && /SIFU_SOURCE_SHADOW_AUDIT_ALLOW_ALL/.test(hook));
ck("hook requires canary scope before deferring work", hook.indexOf("isSifuSourceShadowAuditCanaryAllowed") >= 0 && hook.indexOf("isSifuSourceShadowAuditCanaryAllowed") < hook.indexOf("setTimeout"));
ck("hook does not make env=1 global by default", /SIFU_SOURCE_SHADOW_AUDIT_ALLOW_ALL\s*===\s*"1"/.test(hook) && /SIFU_SOURCE_SHADOW_AUDIT_PROFILE_IDS/.test(hook) && /SIFU_SOURCE_SHADOW_AUDIT_USER_IDS/.test(hook));
ck("hook defers work", /setTimeout\s*\(\s*\(\)\s*=>/.test(hook) && /\.unref\?\.\(\)/.test(hook));
ck("hook catches plan-builder failures", /try\s*{[\s\S]*buildSifuShadowModePlan[\s\S]*}\s*catch/.test(hook) && /console\.warn/.test(hook));
ck("hook computes prompt/context/packet hashes inside deferred gate", /const hashes = buildSifuShadowAuditHashes\(input\.ctx, input\.prompt\)/.test(hook));
ck("hook uses safe logger fire-and-forget", /logSifuSourceAuditSafe\s*\(\s*{[\s\S]*record:\s*plan\.candidate\.sourceAudit/.test(hook) && !/await\s+logSifuSourceAuditSafe/.test(hook) && !/return\s+logSifuSourceAuditSafe/.test(hook));
ck("hook does not mutate prompt or context inputs", !/\b(prompt|ctx|message|history|key|payload)\s*(?:=|\+=)/.test(hook));
ck("hook does not call models or network", !/(fetch\s*\(|spawn\s*\(|runSifuCli|spawnSifuStreaming|streamOpenRouter|OPENROUTER|claude|codex)/i.test(hook));
ck("hook does not directly read corpus files", !/(readFileSync|loadAjekRules|loadInteractionMaster|loadEngineKnowledge|loadSifuExtraKnowledge|loadQtbjTiaohouCompactKnowledge)/.test(hook));

const hookCalls = count(/scheduleSifuSourceShadowAudit\s*\(\s*{/g, ROUTE);
ck("route has expected shadow hook call sites", hookCalls >= 4, `calls=${hookCalls}`);
ck("route does not compute shadow audit evidence before env gate", !/auditFor\("shadow"\)/.test(ROUTE) && !/identityCheckResult:\s*"shadow"/.test(ROUTE));
const postMissPrompt = ROUTE.indexOf("const prompt = buildPrompt({ ctx, message, history");
const postStreamBranch = ROUTE.indexOf("const wantsStream", postMissPrompt);
ck("POST miss path does not schedule before stream/json success", !hasScheduleBetween(postMissPrompt, postStreamBranch));
const postStreamSuccess = ROUTE.indexOf("if (code === 0 && full.trim())", postStreamBranch);
ck("POST stream miss does not schedule before success close", !hasScheduleBetween(postStreamBranch, postStreamSuccess));
const postJsonIdentity = ROUTE.indexOf("/* identity-lock: เทียบ 日干 ที่ AI echo", postStreamSuccess);
const postJsonSuccess = ROUTE.indexOf("const cleanReply = sanitizePacketEvidenceClaims", postJsonIdentity);
ck("POST JSON miss does not schedule before identity success", !hasScheduleBetween(postJsonIdentity, postJsonSuccess));
const getMissPrompt = ROUTE.indexOf("const promptBase = buildPrompt({ ctx, message, history: []");
const getMissSuccess = ROUTE.indexOf("if (code === 0 && full.trim())", getMissPrompt);
ck("GET miss path does not schedule before stream success", !hasScheduleBetween(getMissPrompt, getMissSuccess));
ck("route does not expose shadow audit in user payload names", !/(NextResponse\.json\s*\([^)]*sourceAudit|send\s*\(\s*"[^"]+"\s*,\s*{[^}]*sourceAudit)/s.test(ROUTE));

const appRuntimeImports = listSourceFiles(join(ROOT, "src/app"))
  .filter((path) => /sifu-shadow-mode|sifu-source-audit-log|SIFU_SOURCE_SHADOW_AUDIT|buildSifuShadowModePlan|logSifuSourceAuditSafe/.test(readFileSync(path, "utf8")))
  .map((path) => path.slice(ROOT.length + 1));
ck("runtime shadow imports are allowlisted to /api/sifu only", appRuntimeImports.length > 0 && appRuntimeImports.every((path) => path === "src/app/api/sifu/route.ts"), appRuntimeImports.join(", "));

ck("candidate plan hash has explicit schema column", /\bcandidate_plan_hash\b/.test(MIGRATION) && /Separate from prompt_hash/.test(MIGRATION));
ck("router audit fields have explicit schema columns", /\brouter_hash\b/.test(MIGRATION) && /\bselected_chunk_ids\b/.test(MIGRATION) && /\bselection_reasons\b/.test(MIGRATION));
ck("router audit fields have idempotent migration upgrade", /ADD COLUMN IF NOT EXISTS router_hash\b/.test(MIGRATION) && /ADD COLUMN IF NOT EXISTS selected_chunk_ids\b/.test(MIGRATION) && /ADD COLUMN IF NOT EXISTS selection_reasons\b/.test(MIGRATION));
ck("audit record has candidate plan hash field", /candidatePlanHashSha256\?: string \| null/.test(AUDIT));
ck("audit record has router-selected chunk fields", /routerHashSha256\?: string \| null/.test(AUDIT) && /selectedChunkIds: string\[\]/.test(AUDIT) && /selectionReasons: string\[\]/.test(AUDIT));
ck("safe logger persists candidate plan hash", /candidate_plan_hash/.test(AUDIT_LOG) && /record\.candidatePlanHashSha256/.test(AUDIT_LOG));
ck("safe logger persists router audit fields", /selected_chunk_ids/.test(AUDIT_LOG) && /selection_reasons/.test(AUDIT_LOG) && /router_hash/.test(AUDIT_LOG) && /record\.selectedChunkIds/.test(AUDIT_LOG) && /record\.selectionReasons/.test(AUDIT_LOG) && /record\.routerHashSha256/.test(AUDIT_LOG));
ck("safe logger aligns router audit SQL positions", /prompt_source_map_hash, router_hash, source_manifest,\s*included_sources, preselected_sources, selected_chunk_ids, selection_reasons,\s*answer_supported_by/.test(AUDIT_LOG) && /\$20,\$21,\$22,\$23::jsonb,\s*\$24::jsonb,\$25::jsonb,\$26::jsonb,\$27::jsonb,\s*\$28::jsonb/.test(AUDIT_LOG));
ck("shadow audit prompt hash is runtime prompt or null", /promptHash:\s*input\.promptHash \|\| null/.test(SHADOW));
ck("shadow audit persists candidate plan hash separately", /candidatePlanHashSha256,\s*\n/.test(SHADOW));
ck("shadow audit persists router fields from router output", /routerHashSha256:\s*router\.routerHashSha256/.test(SHADOW) && /selectedChunkIds:\s*router\.selectedChunkIds/.test(SHADOW) && /selectionReasons:\s*router\.selectionReasons/.test(SHADOW));
ck("safe logger catches DB failures", /logSifuSourceAudit\(input\)\.catch/.test(AUDIT_LOG));

console.log(`\n[sifu-shadow-runtime-gate] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
