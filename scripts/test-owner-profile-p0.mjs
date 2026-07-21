import fs from "node:fs";

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const network = read("public/yongsennetwork.html");
const datepick = read("public/datepick.html");
const luopan = read("public/luopan.html");
const master = read("public/master.html");
const profileApi = read("src/app/api/profile/route.ts");
const chart = read("public/chart.html");
const profileSync = read("public/js/hk-profile-sync.js");
const today = read("public/today.html");
const calendar = read("public/calendar.html");
const fusion = read("public/master-fusion.html");
const uranian = read("public/uranian.html");
const input = read("public/input.html");
const goal = read("public/goal.html");
const researchLog = read("src/lib/research-log.ts");
const profileByIdApi = read("src/app/api/profile/[id]/route.ts");
const luopanProfilesApi = read("src/app/api/luopan/profiles/route.ts");
const auspiciousApi = read("src/app/api/auspicious/route.ts");
const auspiciousProfileApi = read("src/app/api/auspicious/profile/route.ts");

check("network never renders account-local demo/cache before API", /function loadPeople\(\)\{[\s\S]*return \[\];[\s\S]*\}/.test(network));
check("network does not auto-delete profiles", !/fetch\('\/api\/profile\/' \+ p\.id, \{ method:'DELETE'/.test(network));
check("network self identity has no first-row fallback", !/const isSelf = selfPid \? \(p\.id === selfPid\) : \(i === 0\)/.test(network));
check("owner profile DELETE is blocked server-side", profileByIdApi.includes("owner_profile_cannot_be_archived"));
check("profile API returns active owner setup state", profileApi.includes("profile_setup_required: !activeProfile"));
check("logged-in chart without self profile clears identity cache", chart.includes("if (res.auth) {") && chart.includes("clearChartIdentityCache();") && chart.includes("showNoProfileEmpty();"));
check("profile sync never falls back to another profile", profileSync.includes("return self || null;") && !profileSync.includes("return self || list[0]"));
check("profile sync clears stale birth identity after authenticated empty profile", profileSync.includes("if (!profile || !dt.date) clearIdentityCache();"));
check("chart view-as is DB-only", chart.includes("View-as banner is rendered only after the server confirms ownership") && !chart.includes("return norm(va, 'view-as')") && !chart.includes("return norm(xfer, 'view-as-xfer')"));
check("today has no demo birth and hides personal panels when birth is absent", !today.includes("return {date:'1990-01-15'") && today.includes("if (!b) {") && today.includes("['.hero','#t-de-board','#hk-basic-bazi','.row2','#t-scoring-explain']"));
check("today view-as is verified by snapshot API", today.includes("Render view-as only after the server confirms this profile belongs to the user"));
check("calendar has no demo day master or first-profile fallback", calendar.includes("let SELF_DM = null;") && calendar.includes("return null;") && !calendar.includes("return '己'; /* fallback demo */") && !calendar.includes("|| live[0]"));
check("calendar disables personal overlay without self profile", calendar.includes("state.overlay = 'tongshu';") && calendar.includes("btn.dataset.mode === 'personal') btn.disabled = true"));
check("master never builds identity from local birth cache", !master.includes("function parseBirthLocal") && master.includes("activeProfile = p || null"));
check("network requires a server-confirmed account owner profile", /if \(!selfPid\) \{\s*return null;\s*\}/.test(network));
check("fusion defaults only to the server-confirmed self profile", fusion.includes("var active = selfProfile.id;") && !fusion.includes("|| saved ||"));
check("uranian has no first-profile default", uranian.includes("const active=selfProfile.id;") && !uranian.includes("||PROFILES[0].id"));
check("onboarding birth handoff is session-scoped", input.includes("hk_pending_birth") && goal.includes("sessionStorage.getItem('hk_pending_birth')") && !goal.includes("const birthRaw = localStorage.getItem('hk_birth')"));
check("research analytics drops stale cross-account profile ids", researchLog.includes("async function ownedProfileId") && researchLog.includes("created_by_user_id=$2"));
check("datepick enables active owner by default", datepick.includes("enabled: String(p.id) === activeId || !!p.is_self"));
check("datepick shows owner setup instead of blank list", datepick.includes("dp.people.owner_setup"));
check("luopan API identifies active owner", luopanProfilesApi.includes("active_profile_id"));
check("luopan rejects stale profile selection", luopan.includes("const selectedValid = profiles.some"));
check("master renders owner setup row when profile is absent", master.includes("j.owner && j.owner.name"));
check("datepick profile cache ownership includes user", auspiciousProfileApi.includes("created_by_user_id=$3"));
check("datepick people ownership includes user", auspiciousApi.includes("created_by_user_id=$3"));

console.log(`owner-profile P0: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
