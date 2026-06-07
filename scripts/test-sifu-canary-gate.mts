/**
 * Sifu Phase 8 canary/admin-test gate.
 *
 * Static guard only. It validates that source shadow audit cannot be enabled
 * globally by accident; env=1 still requires an explicit profile/user allowlist
 * or an explicit ALLOW_ALL override. It does not import runtime routes or call
 * models, DB, or HTTP.
 *
 * Run:
 *   node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-sifu-canary-gate.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ROUTE = readFileSync(join(ROOT, "src/app/api/sifu/route.ts"), "utf8");

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

console.log("[sifu-canary-gate]");

const hookMatch = ROUTE.match(/SIFU_SOURCE_SHADOW_AUDIT_START([\s\S]*?)SIFU_SOURCE_SHADOW_AUDIT_END/);
const hook = hookMatch?.[1] || "";
const scheduleIdx = hook.indexOf("function scheduleSifuSourceShadowAudit");
const timerIdx = hook.indexOf("setTimeout", scheduleIdx);
const scopeCallIdx = hook.indexOf("isSifuSourceShadowAuditCanaryAllowed(input)", scheduleIdx);
const beforeScope = scopeCallIdx >= 0 ? hook.slice(scheduleIdx, scopeCallIdx) : hook;
const beforeTimer = timerIdx >= 0 ? hook.slice(scheduleIdx, timerIdx) : hook;

ck("shadow hook marker is present exactly once", count(/SIFU_SOURCE_SHADOW_AUDIT_START/g, ROUTE) === 1 && count(/SIFU_SOURCE_SHADOW_AUDIT_END/g, ROUTE) === 1);
ck("canary env gate is inside shadow hook", /SIFU_SOURCE_SHADOW_AUDIT_PROFILE_IDS/.test(hook) && /SIFU_SOURCE_SHADOW_AUDIT_USER_IDS/.test(hook) && /SIFU_SOURCE_SHADOW_AUDIT_ALLOW_ALL/.test(hook));
ck("primary env remains strict opt-in", /process\.env\.SIFU_SOURCE_SHADOW_AUDIT\s*!==\s*"1"/.test(hook));
ck("allow-all is explicit, not default", /process\.env\.SIFU_SOURCE_SHADOW_AUDIT_ALLOW_ALL\s*===\s*"1"/.test(hook) && !/SIFU_SOURCE_SHADOW_AUDIT_ALLOW_ALL\s*!==\s*"0"/.test(hook));
ck("profile and user allowlists are parsed as env sets", /sifuShadowAuditEnvSet\("SIFU_SOURCE_SHADOW_AUDIT_PROFILE_IDS"\)/.test(hook) && /sifuShadowAuditEnvSet\("SIFU_SOURCE_SHADOW_AUDIT_USER_IDS"\)/.test(hook));
ck("allowlist parser accepts comma or whitespace separators", /\.split\(\s*\/\[\\s,\]\+\/\s*\)/.test(hook));
ck("scope check runs before timer scheduling", scopeCallIdx >= 0 && timerIdx >= 0 && scopeCallIdx < timerIdx);
ck("no shadow plan/logging before scope check", !/buildSifuShadowModePlan|logSifuSourceAuditSafe|buildSifuShadowAuditHashes/.test(beforeScope));
ck("no shadow plan/logging before timer", !/buildSifuShadowModePlan|logSifuSourceAuditSafe|buildSifuShadowAuditHashes/.test(beforeTimer));
ck("non-canary request returns before deferred work", /if \(!isSifuSourceShadowAuditCanaryAllowed\(input\)\) return;/.test(hook));
ck("intro still returns before canary work", hook.indexOf('input.mode === "intro"') >= 0 && hook.indexOf('input.mode === "intro"') < scopeCallIdx);
ck("scope uses profileId and session.userId only", /input\.profileId/.test(hook) && /input\.session\?\.userId/.test(hook) && !/input\.session\?\.email/.test(hook));

const appRuntimeImports = listSourceFiles(join(ROOT, "src/app"))
  .filter((path) => /SIFU_SOURCE_SHADOW_AUDIT_PROFILE_IDS|SIFU_SOURCE_SHADOW_AUDIT_USER_IDS|SIFU_SOURCE_SHADOW_AUDIT_ALLOW_ALL|isSifuSourceShadowAuditCanaryAllowed/.test(readFileSync(path, "utf8")))
  .map((path) => path.slice(ROOT.length + 1));
ck("canary env logic is limited to /api/sifu route", appRuntimeImports.length === 1 && appRuntimeImports[0] === "src/app/api/sifu/route.ts", appRuntimeImports.join(", "));
ck("canary audit remains hidden from user payloads", !/(NextResponse\.json\s*\([^)]*sourceAudit|send\s*\(\s*"[^"]+"\s*,\s*{[^}]*sourceAudit)/s.test(ROUTE));

console.log(`\n[sifu-canary-gate] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
