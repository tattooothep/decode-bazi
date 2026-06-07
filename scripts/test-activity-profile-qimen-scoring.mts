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

function functionBlock(name: string) {
  const start = route.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing function block: ${name}`);
  const brace = route.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < route.length; i++) {
    if (route[i] === "{") depth++;
    if (route[i] === "}") depth--;
    if (depth === 0) return route.slice(start, i + 1);
  }
  throw new Error(`unterminated function block: ${name}`);
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
  route.includes("const baseScoreModules = qimenBaseScoreModulesForActivity(activeModuleKeys);"),
  "datepick canonical scoring must define a Qimen-free base scoring module set",
);
assert(
  route.includes("const requestedHardModulesRaw = Array.isArray(options.hardModules)")
    && route.includes("const requestedHardModules = qimenHardFilterModulesForDatepick(requestedHardModulesRaw);"),
  "datepick hard SQL filters must pass through Qimen hard-filter exclusion helper",
);
assert(
  route.includes("const hardModules = qimenHardFilterModulesForDatepick(mergedHardModules).filter((m: ModuleKey) => UNIVERSAL_MODULES.includes(m));"),
  "datepick final SQL hard modules must re-filter qi_men after activity profile merge",
);
assert(
  route.includes("const applyPersonHard = hardModules.includes(\"ba_zi\");"),
  "person hard-filter switch must read final SQL hard modules, not pre-filter merged modules",
);
assert(route.includes("qimenScoringPolicy: buildQimenDatepickPolicy(activityProfile, activeModuleKeys, targetDirection)"), "response meta must expose Qimen scoring policy for UI/Sifu");
assert(route.includes("function buildQimenDatepickPolicy("), "missing Qimen datepick scoring policy helper");
assert(route.includes("version: \"datepick-qimen-policy-20260606\""), "Qimen datepick scoring policy must carry a version");
assert(route.includes("baseScoreExcludesQiMen: true"), "Qimen datepick policy must state base score excludes Qi Men");
assert(route.includes("noGenericAveraging: true"), "Qimen datepick policy must state no generic averaging");
assert(route.includes("ฉีเหมินใช้เลือกวัง/ประตู/ดาว/เทพ/ก้านและสัญญาณที่ตรงกิจกรรม ไม่ใช่คะแนนกลาง"), "Qimen policy must explain activity-specific scoring in Thai");
assert(route.includes("ฉีเหมินใช้เป็นตัวจำกัดเมื่อผังไม่รับ ไม่ใช่คะแนนบวกกลาง"), "Qimen guard-only policy must explain cap behavior in Thai");
assert(route.includes("ใช้เฉพาะผังยาม 時家 ที่ระบบอนุญาตให้ตัดสินได้; ผังวัน/เดือน/ปีใช้เป็นบริบท"), "Qimen policy must block 日/月/年 scoring misuse");
assert(route.includes("ป้ายแสดงผลหรือข้อมูลอ่านประกอบไม่เอามาคิดคะแนน"), "Qimen policy must block display/context-only evidence in Thai");
assert(route.includes("goodFormations: (pref.goodFormations || []).map(qimenLabel)"), "Qimen policy must expose activity-specific good formations Thai-first");
assert(route.includes("avoidDoorCap: profile?.safety === \"medical_safe\" ? Math.min(pref.avoidDoorCap, 39) : pref.avoidDoorCap"), "Qimen policy must expose medical-safe cap");
assert(
  route.includes("qimenBaseScoreModulesForActivity(activeModuleKeys)"),
  "canonical activity scoring must route base scoring through Qimen exclusion helper",
);
assert(
  route.includes(".map(c => enrichCandidate(c, baseScoreModules, resolvedActivityType))"),
  "base combine must use baseScoreModules instead of full active modules",
);
assert(
  route.includes(".map(c => applyActivityProfileRules(c, activityProfile, activeModuleKeys, targetDirection))"),
  "targetDirection is not passed into activity profile rules",
);
assert(
  route.includes(".map(c => applyQimenGenericGuard(c, activityProfile, activeModuleKeys))"),
  "generic Qimen guard must run after profile-specific Qimen rules",
);
assert(
  route.includes(".map(refreshCandidateDisplay)"),
  "candidate display must refresh after profile/generic Qimen score mutations",
);
assert(
  route.includes("function qimenBaseScoreModulesForActivity(activeModules: ModuleKey[]): ModuleKey[]"),
  "missing qimen base scoring helper",
);
assert(
  route.includes("function qimenHardFilterModulesForDatepick(modules: ModuleKey[]): ModuleKey[]"),
  "missing Qimen hard-filter exclusion helper",
);
assert(
  route.includes("return activeModules.filter((m) => m !== \"qi_men\");"),
  "canonical activity scoring must not average generic qi_men module score into base score",
);
assert(
  route.includes("return modules.filter((m) => m !== \"qi_men\");"),
  "datepick query hard filters must not SQL-filter qi_men before profile/generic guard can cap it",
);
assert(
  route.includes("hardModules,") && route.includes("mergedHardModules,"),
  "response meta must expose final hardModules and mergedHardModules for audit",
);
const enrichMatch = route.match(/function enrichCandidate\([\s\S]*?\n\}/);
assert(enrichMatch, "missing enrichCandidate helper");
const enrichBlock = enrichMatch[0];
assert(
  !enrichBlock.includes("\"qi_men\""),
  "base enrichCandidate must stay Qimen-free; Qimen caps/deltas belong in profile or generic guard",
);
assert(
  !enrichBlock.includes("QM_BAD_DOOR_CAP"),
  "legacy Qimen bad-door cap must not live inside base scoring",
);
assert(
  !route.includes("activityProfile?.profileMode === \"modern\""),
  "Qimen base exclusion must not be limited to modern profiles",
);
assert(
  route.includes("const bounded = Math.max(pref.maxNegativeDelta, Math.min(pref.maxPositiveDelta, delta));"),
  "qimen purpose delta is not bounded",
);
assert(route.includes("goodFormations?: string[];"), "qimen activity preference must support bounded source-governed formations");
assert(route.includes("const QIMEN_ACTIVITY_AVOID_FLAGS = ["), "missing shared Qimen avoid flags for activity scoring");
for (const term of [
  "MEN_PO: \"門迫\"",
  "RU_MU: \"入墓\"",
  "JI_XING: \"擊刑\"",
  "FU_YIN: \"伏吟\"",
  "FAN_YIN: \"反吟\"",
  "WU_BU_YU_TIME: \"五不遇時\"",
  "QING_LONG_FAN_SHOU: \"青龍返首\"",
  "FEI_NIAO_DIE_XUE: \"飛鳥跌穴\"",
  "SAN_ZHA_XIU: \"休詐\"",
  "TIAN_DUN: \"天遁\"",
  "DI_DUN: \"地遁\"",
  "REN_DUN: \"人遁\"",
]) {
  assert(route.includes(term), `missing Thai/Chinese Qimen scoring term: ${term}`);
}
assert(
  route.includes("if (!pref || !input.qm || input.qm.status === \"missing\" || input.qm.status === \"error\") return;"),
  "qimen preference must fail closed on missing/error module",
);
assert(route.includes("if (!qimenModuleScoreAllowed(input.qm)) return;"), "qimen preference must fail closed when module is context-only or non-hour chart");
assert(
  route.includes("if (input.qm.pass === false || raw.bad_door === true) return;"),
  "qimen preference must not bonus failed/bad-door qimen modules",
);
assert(
  route.includes("input.shiftScore(bounded);"),
  "qimen purpose preference does not adjust final score",
);
assert(route.includes("function qimenScoreEvidenceAllowed(item: any): boolean"), "missing Qimen score evidence allowlist helper");
assert(route.includes("item.verdict_allowed !== false"), "Qimen scoring evidence must reject verdict_allowed=false");
assert(route.includes("readiness.verdict_allowed !== false"), "Qimen scoring evidence must reject engine_readiness verdict_allowed=false");
assert(route.includes("item.context_only !== true"), "Qimen scoring evidence must reject top-level context_only=true");
assert(route.includes("item.is_context_only !== true"), "Qimen scoring evidence must reject top-level is_context_only=true");
assert(route.includes("evidence.no_score !== true"), "Qimen scoring evidence must reject no_score diagnostic evidence");
assert(route.includes("evidence.diagnostic !== true"), "Qimen scoring evidence must reject diagnostic-only evidence");
assert(route.includes("quality !== \"context_only\""), "Qimen scoring evidence must reject context-only formations");
assert(route.includes("function qimenModuleScoreAllowed(qm: any): boolean"), "missing Qimen module-level scoring allowlist helper");
assert(route.includes("raw.verdict_allowed !== false"), "Qimen module allowlist must reject raw verdict_allowed=false");
assert(route.includes("chart.verdict_allowed !== false"), "Qimen module allowlist must reject chart verdict_allowed=false");
assert(route.includes("calculation.verdict_allowed !== false"), "Qimen module allowlist must reject calculation verdict_allowed=false");
assert(route.includes("raw.context_only !== true"), "Qimen module allowlist must reject raw context_only=true");
assert(route.includes("chart.context_only !== true"), "Qimen module allowlist must reject chart context_only=true");
assert(route.includes("raw.is_context_only !== true"), "Qimen module allowlist must reject raw is_context_only=true");
assert(route.includes("chart.is_context_only !== true"), "Qimen module allowlist must reject chart is_context_only=true");
assert(route.includes("quality !== \"context_only\""), "Qimen module allowlist must reject top-level context_only quality");
assert(route.includes("chart.system_type || chart.chart_type || raw.system_type || raw.chart_type || calculation.system_type"), "Qimen module allowlist must read chart/system type");
assert(route.includes("systemType === \"day\" || systemType === \"month\" || systemType === \"year\""), "Qimen module allowlist must reject 日/月/年 charts for datepick scoring");
assert(route.includes("const readiness = chart.engine_readiness || raw.engine_readiness || {};"), "Qimen module allowlist must read engine readiness");
assert(route.includes("const temporal = chart.temporal_context_policy || raw.temporal_context_policy || {};"), "Qimen module allowlist must read temporal context policy");
assert(route.includes("temporal.verdict_allowed !== false"), "Qimen module allowlist must reject temporal context-only charts");
assert(route.includes("function qimenEvidenceItems(raw: any, palace: any): any[]"), "missing Qimen evidence item collector");
for (const packet of [
  "raw?.stored_formations",
  "raw?.source_formations",
  "raw?.compound_formations",
  "palace?.classical_flags",
  "palace?.qimen_trace",
  "palace?.p0_badges",
]) {
  assert(route.includes(packet), `Qimen activity scoring must read source-governed packet: ${packet}`);
}
assert(route.includes("function qimenNormalizeEvidenceCode(value: unknown): string | null"), "missing Qimen evidence code normalizer");
assert(route.includes("compact.includes(\"QING_LONG\")"), "Qimen evidence normalizer must detect Qing Long formation families");
assert(route.includes("compact.includes(\"SAN_ZHA_XIU\")"), "Qimen evidence normalizer must detect San Zha formation families");
assert(route.includes("function qimenFirstEvidenceCode(raw: any, palace: any, names: string[] = []): string | null"), "missing first evidence code helper");
assert(route.includes("const avoidFlag = qimenFirstEvidenceCode(raw, palace, QIMEN_ACTIVITY_AVOID_FLAGS);"), "Qimen activity scoring must apply avoid flags from source-governed evidence");
assert(route.includes("\"PROFILE_QIMEN_AVOID_FLAG\""), "Qimen activity scoring must record avoid flag reason");
assert(route.includes("สัญญาณฉีเหมินต้องระวัง · ${qimenLabel(avoidFlag)}"), "avoid flag reason must be Thai-first with Chinese secondary");
assert(route.includes("const goodFormation = qimenFirstEvidenceCode(raw, palace, pref.goodFormations || []);"), "Qimen activity scoring must apply activity-specific good formations");
assert(route.includes("\"PROFILE_QIMEN_GOOD_FORMATION\""), "Qimen activity scoring must record good formation reason");
assert(route.includes("รูปแบบฉีเหมินเข้ากับกิจกรรม · ${qimenLabel(goodFormation)}"), "good formation reason must be Thai-first with Chinese secondary");
assert(route.includes("goodFormations: [\"SAN_ZHA_ZHEN\", \"SAN_ZHA_XIU\", \"SAN_ZHA_CHONG\", \"QING_LONG_FAN_SHOU\", \"FEI_NIAO_DIE_XUE\", \"REN_DUN\"]"), "negotiation purpose must prefer strategy formations");
assert(route.includes("goodFormations: [\"QING_LONG_FAN_SHOU\", \"FEI_NIAO_DIE_XUE\", \"SAN_ZHA_ZHEN\", \"SAN_ZHA_XIU\", \"SAN_ZHA_CHONG\", \"TIAN_DUN\", \"DI_DUN\", \"REN_DUN\"]"), "business purpose must prefer launch/strategy/dun formations");
assert(route.includes("const QIMEN_TARGET_MISMATCH = Symbol"), "missing target-direction mismatch sentinel");
assert(
  route.includes("if (palace === QIMEN_TARGET_MISMATCH) return;"),
  "targetDirection mismatch must no-op instead of falling back to another palace",
);
assert(route.includes("QIMEN_TERM_CODE_BY_ZH[\"直符\"] = \"ZHI_FU\";"), "missing 直符 alias for 值符");
assert(route.includes("QIMEN_TERM_CODE_BY_ZH[\"六儀擊刑\"] = \"JI_XING\";"), "missing traditional 六儀擊刑 alias for JI_XING");
assert(route.includes("QIMEN_TERM_CODE_BY_ZH[\"六仪击刑\"] = \"JI_XING\";"), "missing simplified 六仪击刑 alias for JI_XING");
assert(route.includes("compact.includes(\"六儀擊刑\")"), "evidence normalizer must catch full traditional 六儀擊刑 label");
assert(route.includes("compact.includes(\"六仪击刑\")"), "evidence normalizer must catch full simplified 六仪击刑 label");
assert(!route.includes("ui_flags"), "datepick must not read qimen ui_flags; they are display-only metadata");
assert(!route.includes("context_flags"), "datepick must not read qimen context_flags; they are display-only metadata");
assert(!route.includes("api_capabilities"), "datepick must not read qimen api_capabilities for scoring");

const shiftIndex = route.indexOf("input.shiftScore(bounded);");
const avoidCapIndex = route.indexOf("PROFILE_QIMEN_AVOID_DOOR_CAP");
assert(shiftIndex > 0 && avoidCapIndex > shiftIndex, "avoid-door cap must run after bounded score shift");

const helperIndex = route.indexOf("applyQimenActivityPreference({ profile, qm, targetDirection, addUp, addDown, cap, shiftScore });");
const broadCapIndex = route.indexOf("PROFILE_QIMEN_CAP");
assert(helperIndex > 0 && broadCapIndex > helperIndex, "broad qimen cap must remain after preference helper");
assert(
  route.includes("if (active.has(\"qi_men\") && qimenModuleScoreAllowed(qm) && (qm?.pass === false || qm?.raw?.bad_door === true)) {"),
  "profile Qimen failure cap must also require module-level score allowance",
);
assert(
  route.includes("(profile.key === \"exam_study\" || profile.key === \"interview\")")
    && route.includes("&& active.has(\"qi_men\")")
    && route.includes("&& qimenModuleScoreAllowed(qm)"),
  "exam/interview Qimen context bonus must require active scoring-allowed Qimen module",
);
assert(
  route.includes("&& qm?.pass !== false")
    && route.includes("&& qm?.raw?.bad_door !== true"),
  "exam/interview Qimen context bonus must not add after failed or bad-door Qimen module",
);
const profileQimenCapBlock = route.match(
  /if \(active\.has\("qi_men"\) && qimenModuleScoreAllowed\(qm\) && \(qm\?\.pass === false \|\| qm\?\.raw\?\.bad_door === true\)\) \{([\s\S]*?)\n  \}/,
)?.[1] || "";
assert(profileQimenCapBlock, "missing profile Qimen failure block");
assert(
  profileQimenCapBlock.includes('addDown("PROFILE_QIMEN_CAP", reason, scoring.finalScore > limit ? limit - scoring.finalScore : 0, "qi_men");'),
  "profile Qimen failure must always add an explanatory down reason, even when the score is already under the cap",
);
assert(
  profileQimenCapBlock.includes('cap(limit, "PROFILE_QIMEN_CAP", reason, "qi_men");'),
  "profile Qimen failure must still cap scores when the base score is above the safety limit",
);
assert(
  profileQimenCapBlock.indexOf('addDown("PROFILE_QIMEN_CAP"') < profileQimenCapBlock.indexOf('cap(limit, "PROFILE_QIMEN_CAP"'),
  "profile Qimen reason must be recorded before optional score cap",
);
assert(
  profileQimenCapBlock.includes("ใช้เป็นตัวจำกัด ไม่ใช่คะแนนบวกกลาง"),
  "profile Qimen cap reason must state Qimen is a cap, not a generic score bonus",
);
assert(
  route.includes("if (!profile || !c.scoring) return c;"),
  "activity profile rules must apply to alias and modern profiles",
);
assert(
  !route.includes("profile.profileMode !== \"modern\""),
  "alias profiles with qimenPurpose must not skip activity-specific Qimen rules",
);
assert(
  route.includes("function applyQimenGenericGuard("),
  "missing generic Qimen fail guard for no-profile/core requests",
);
assert(
  route.includes("function refreshCandidateDisplay(c: CandidateSlot): CandidateSlot"),
  "missing display refresh helper after score mutations",
);
assert(
  route.includes("const summary = `${tierMeta?.emoji || \"\"} ${tierMeta?.thai || scoring.tier} · คะแนน ${scoring.finalScore}`.trim();")
    && route.includes("summary,"),
  "display summary must be rebuilt from current finalScore",
);
assert(
  !functionBlock("refreshCandidateDisplay").includes("(scoring as any).summary ||"),
  "display summary must not reuse stale pre-mutation scoring.summary",
);
assert(
  route.includes("if (profile || !c.scoring || !activeModules.includes(\"qi_men\")) return c;"),
  "generic guard must only cover no-profile requests with Qimen active",
);
assert(route.includes("if (!qimenModuleScoreAllowed(qm)) return c;"), "generic Qimen guard must ignore context-only or non-hour charts");
assert(
  route.includes("ใช้เป็นตัวจำกัด ไม่ใช่คะแนนบวกกลาง"),
  "generic guard reason must state Qimen is a cap, not a generic score bonus",
);
const genericGuardIndex = route.indexOf("function applyQimenGenericGuard(");
const guardBody = route.slice(genericGuardIndex, route.indexOf("// ─── Personal Modules", genericGuardIndex));
const reasonIndex = guardBody.indexOf("scoring.reasonsDown.unshift({");
const capIfIndex = guardBody.indexOf("if (scoring.finalScore > limit)");
assert(reasonIndex > 0 && capIfIndex > reasonIndex, "generic Qimen guard must add explanatory reason before optional cap");

assert(route.includes("goodFlags: [\"is_traveling_horse\", \"traveling_horse\", \"horse\", \"驛馬\"]"), "travel purpose must read horse flag");
assert(route.includes("ประตูฉีเหมินหนุนกิจกรรมนี้ ·"), "missing Thai-first good door reason");
assert(route.includes("ประตูฉีเหมินไม่เหมาะกับกิจกรรมนี้ ·"), "missing Thai-first avoid door reason");
assert(route.includes("KAI_MEN: \"開門\"") && route.includes("SHENG_MEN: \"生門\""), "missing Chinese secondary Qimen labels");

assert(!/input\.qm\.score\s*=|qm\.score\s*=|modules\?\.qi_men\.score\s*=/.test(route), "must not mutate raw qi_men module score");

console.log(`activity profile qimen scoring guard ok · purposes=${[...purposes].sort().join(",")}`);
