import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routePath = path.join(root, "src/app/api/auspicious/route.ts");
const profilesPath = path.join(root, "src/lib/luck-engine/activity-profiles.ts");
const route = fs.readFileSync(routePath, "utf8");
const profiles = fs.readFileSync(profilesPath, "utf8");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const purposes = new Set(
  [...profiles.matchAll(/qimenPurpose:\s*"([^"]+)"/g)].map((m) => m[1]),
);
const expectedPurposes = new Set([
  "wealth",
  "work",
  "business",
  "negotiation",
  "travel",
  "love",
  "marriage",
  "health",
  "exam",
  "construction",
]);
assert(purposes.size >= 9, `expected qimenPurpose set from profiles, got ${purposes.size}`);
for (const purpose of purposes) {
  assert(expectedPurposes.has(purpose), `unexpected qimenPurpose in profiles: ${purpose}`);
}

const prefBlock = route.match(
  /const QIMEN_ACTIVITY_PREFERENCES: Record<QimenPurpose, QimenActivityPreference> = \{([\s\S]*?)\n\};\n\nconst QIMEN_DIRECTION_ALIASES/,
)?.[1] || "";
assert(prefBlock, "missing QIMEN_ACTIVITY_PREFERENCES block");

for (const purpose of expectedPurposes) {
  assert(
    new RegExp(`\\n\\s*${purpose}:\\s*\\{`).test(prefBlock),
    `missing qimen activity preference for ${purpose}`,
  );
}

assert(
  route.includes(".map(c => applyActivityProfileRules(c, activityProfile, activeModuleKeys, targetDirection))"),
  "targetDirection is not passed into activity profile rules",
);
assert(
  route.includes("const bounded = Math.max(pref.maxNegativeDelta, Math.min(pref.maxPositiveDelta, delta));"),
  "qimen purpose delta is not bounded",
);
assert(
  route.includes("if (!pref || !input.qm || input.qm.status === \"missing\" || input.qm.status === \"error\") return;"),
  "qimen preference must fail closed on missing/error module",
);
assert(
  route.includes("if (input.qm.pass === false || raw.bad_door === true) return;"),
  "qimen preference must not bonus failed/bad-door qimen modules",
);
assert(
  route.includes("input.shiftScore(bounded);"),
  "qimen purpose preference does not adjust final score",
);
assert(route.includes("const QIMEN_TARGET_MISMATCH = Symbol"), "missing target-direction mismatch sentinel");
assert(
  route.includes("if (palace === QIMEN_TARGET_MISMATCH) return;"),
  "targetDirection mismatch must no-op instead of falling back to another palace",
);
assert(route.includes("QIMEN_TERM_CODE_BY_ZH[\"直符\"] = \"ZHI_FU\";"), "missing 直符 alias for 值符");

const shiftIndex = route.indexOf("input.shiftScore(bounded);");
const avoidCapIndex = route.indexOf("PROFILE_QIMEN_AVOID_DOOR_CAP");
assert(shiftIndex > 0 && avoidCapIndex > shiftIndex, "avoid-door cap must run after bounded score shift");

const helperIndex = route.indexOf("applyQimenActivityPreference({ profile, qm, targetDirection, addUp, addDown, cap, shiftScore });");
const broadCapIndex = route.indexOf("PROFILE_QIMEN_CAP");
assert(helperIndex > 0 && broadCapIndex > helperIndex, "broad qimen cap must remain after preference helper");

assert(route.includes("goodFlags: [\"is_traveling_horse\", \"traveling_horse\", \"horse\", \"驛馬\"]"), "travel purpose must read horse flag");
assert(route.includes("ประตูฉีเหมินหนุนกิจกรรมนี้ ·"), "missing Thai-first good door reason");
assert(route.includes("ประตูฉีเหมินไม่เหมาะกับกิจกรรมนี้ ·"), "missing Thai-first avoid door reason");
assert(route.includes("KAI_MEN: \"開門\"") && route.includes("SHENG_MEN: \"生門\""), "missing Chinese secondary Qimen labels");

assert(!/input\.qm\.score\s*=|qm\.score\s*=|modules\?\.qi_men\.score\s*=/.test(route), "must not mutate raw qi_men module score");

console.log(`activity profile qimen scoring guard ok · purposes=${[...purposes].sort().join(",")}`);
