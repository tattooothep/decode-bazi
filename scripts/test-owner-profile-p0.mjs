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
const profileByIdApi = read("src/app/api/profile/[id]/route.ts");
const luopanProfilesApi = read("src/app/api/luopan/profiles/route.ts");
const auspiciousApi = read("src/app/api/auspicious/route.ts");
const auspiciousProfileApi = read("src/app/api/auspicious/profile/route.ts");

check("network never renders account-local demo/cache before API", /function loadPeople\(\)\{[\s\S]*return \[\];[\s\S]*\}/.test(network));
check("network does not auto-delete profiles", !/fetch\('\/api\/profile\/' \+ p\.id, \{ method:'DELETE'/.test(network));
check("network self identity has no first-row fallback", !/const isSelf = selfPid \? \(p\.id === selfPid\) : \(i === 0\)/.test(network));
check("owner profile DELETE is blocked server-side", profileByIdApi.includes("owner_profile_cannot_be_archived"));
check("profile API returns active owner setup state", profileApi.includes("profile_setup_required: !activeProfile"));
check("datepick enables active owner by default", datepick.includes("enabled: String(p.id) === activeId || !!p.is_self"));
check("datepick shows owner setup instead of blank list", datepick.includes("dp.people.owner_setup"));
check("luopan API identifies active owner", luopanProfilesApi.includes("active_profile_id"));
check("luopan rejects stale profile selection", luopan.includes("const selectedValid = profiles.some"));
check("master renders owner setup row when profile is absent", master.includes("j.owner && j.owner.name"));
check("datepick profile cache ownership includes user", auspiciousProfileApi.includes("created_by_user_id=$3"));
check("datepick people ownership includes user", auspiciousApi.includes("created_by_user_id=$3"));

console.log(`owner-profile P0: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
