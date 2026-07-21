#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.execArgv.some((arg) => arg.includes("strip-types"))) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

const { SolarTime } = await import("tyme4ts");
const { summarizeStars } = await import(path.join(ROOT, "src/lib/star-dict-th.ts"));
const { computeIntentStatus, INTENTS } = await import(path.join(ROOT, "src/lib/tongshu-intents.ts"));
const { personalGoals, scoreIntents, universalGoals } = await import(path.join(ROOT, "src/lib/tongshu-universal.ts"));
const { computeTongshuLive } = await import(path.join(ROOT, "src/lib/luck-engine/tongshu-live.ts"));

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const route = read("src/app/api/calendar/route.ts");
const profile = read("src/lib/calendar-profile-context.ts");
const html = read("public/calendar.html");
const hours = read("src/app/api/today/hours/route.ts");
const directions = read("src/app/api/today/directions/route.ts");
const mobileCalendar = read("src/app/api/mobile/v1/calendar/route.ts");
const personalVerdict = read("src/lib/daily-personal-verdict.ts");

let pass = 0;
let fail = 0;
function check(name, condition, detail = "") {
  if (condition) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

check("profile query binds current org", /WHERE org_id=\$1/.test(profile));
check("profile query binds authenticated owner", /created_by_user_id=\$2/.test(profile));
check("profile query has no first-row fallback", !/rows?\s*\[\s*0\s*\]/.test(profile));
check("no-time profile removes hour pillar", /birthTimeKnown \? normalizePillar\(rawPillars\.hour\) : null/.test(profile));
check("calendar ignores browser birth parameters", !/searchParams\.get\("(?:dm|birthDate|birthTime|birthLng|gender|dayBoundary)"\)/.test(route));
check("calendar browser sends profile id only", /\/api\/calendar\?year=\$\{year\}&month=\$\{month\}\$\{profileUrl\}/.test(html));
check("calendar browser never reads hk_birth", !/localStorage\.getItem\(['"]hk_birth['"]\)/.test(html));
check("profile cache key includes user and profile", /input\.userId[\s\S]*input\.profileId/.test(route));
check("universal intent never receives natal clash", /computeIntentStatus\(fixed\.yi, fixed\.ji, cls\.bad, false\)/.test(route));
check("universal goals consume universal status", /universalGoals\(universalVerdict\.score, universalIntentStatus/.test(route));
check("all gods scored before entitlement shaping", /ld\.getGods\(\)\.map/.test(route) && !/getGods\(\)\.slice/.test(route));
check("unknown stars have their own response bucket", /unknown: starSummary\.unknown/.test(route));
check("medical intent is exposed by API and UI", /"medical"/.test(route) && /id:'medical'/.test(html));
check("mixed useful/adverse day has explicit role", /role: "mixed"/.test(route) && /吉忌並見/.test(route));
check("personal packet modifiers affect score", /appliedAdjustment[\s\S]*const score = softClamp/.test(personalVerdict));
check("hour details load full DB pillars only", /const userChart = profileContext\?\.pillars \|\| null/.test(hours));
check("hour details reject browser natal inputs", !/body\.(?:userChart|birthDate|birthTime|birthLng|yongshen|jishen|dominantJishen)/.test(hours));
check("direction details load full DB pillars only", /const userChart = profileContext\?\.pillars \|\| null/.test(directions));
check("direction details reject browser natal inputs", !/body\.(?:userChart|yongshen)/.test(directions));
check("non-today directions use explicit noon reference", /date === bkk\.date \? bkk\.time : "12:00"/.test(directions));
check("ranked cards use mode-specific intent score", /_calIntentScoreForMode\(b, state\.intent\)/.test(html));
check("time-space direction layer requires explicit inputs", /CAL_DIRECTION_PREF\.time && CAL_DIRECTION_PREF\.locationExplicit/.test(html));
check("calendar has no pseudo-date fallback", !/MAY_2026|deterministic mock|arbitrary anchor/.test(html));
check("calendar has no synthetic hour fallback", !/const dmEl = STEM_ELEM\[SELF_DM\][\s\S]*BRANCH_HOUR\.map/.test(html));
check("no-profile UI omits the personal result card", /profileContext&&MONTH_DATA\.personal_available\?renderCard\(pV/.test(html));
check("stats follow the selected universal or personal layer", /state\.overlay==='tongshu' \? d\.universal_verdict : d\.verdict/.test(html));
check("canonical API Chinese is Traditional", /calendarHanCanonical\(ld\.toString\(\)\)/.test(route));
check("calendar cache version changed with semantics", /CALENDAR_CACHE_VERSION = "calendar-v2"/.test(route));
check("mobile calendar falls back to universal without a profile", !/profile has no day pillar|status: 422/.test(mobileCalendar) && /profile \? mobileProfileSummary\(profile\) : null/.test(mobileCalendar));
check("direct PDF keeps all nine locales", /docTitle:\{th:/.test(html) && /,cn:/.test(html.slice(html.indexOf("var PDF_TX"), html.indexOf("var P = function"))) && /,es:/.test(html.slice(html.indexOf("var PDF_TX"), html.indexOf("var P = function"))));
check("direct PDF uses the same visible star buckets", /sel\.stars_detail \|\| sel\.gods/.test(html) && /unknownStars/.test(html));

const localeFields = ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"];
check("all intent cards have nine locale labels", INTENTS.every((intent) => localeFields.every((locale) => Boolean(intent[`label_${locale}`]))));

const yi = ["嫁娶", "開市", "出行"];
const universalStatus = computeIntentStatus(yi, [], [], false);
const clashingPersonalStatus = computeIntentStatus(yi, [], [], true);
const universalA = universalGoals(70, universalStatus, false);
const universalB = universalGoals(70, universalStatus, false);
check("universal goal output is user invariant", JSON.stringify(universalA) === JSON.stringify(universalB));
check("personal clash remains separate", universalStatus.marriage === "good" && clashingPersonalStatus.marriage === "neutral");

const forbidden = computeIntentStatus([], ["嫁娶"], [], false);
const broadGoals = personalGoals(90, { love: 12 }, forbidden, false);
const intentScores = scoreIntents(90, universalStatus, 90, forbidden);
check("forbidden broad goal cannot remain high", broadGoals.love <= 49, String(broadGoals.love));
check("forbidden activity score is capped", (intentScores.personal?.marriage.score || 100) <= 34, String(intentScores.personal?.marriage.score));

let days = 0;
let unknownCount = 0;
let unknownClassified = 0;
let maxGods = 0;
const officers = new Set();
const spirits = new Set();
const mansions = new Set();
const nineStars = new Set();
for (let year = 2026; year <= 2027; year++) {
  for (let month = 1; month <= 12; month++) {
    const total = new Date(year, month, 0).getDate();
    for (let day = 1; day <= total; day++) {
      days++;
      const gods = SolarTime.fromYmdHms(year, month, day, 12, 0, 0)
        .getLunarHour().getLunarDay().getGods().map((god) => god.getName());
      maxGods = Math.max(maxGods, gods.length);
      const summary = summarizeStars(gods);
      const live = computeTongshuLive(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
      officers.add(live.officer);
      spirits.add(live.spirit);
      mansions.add(live.xiu);
      nineStars.add(live.nineStar);
      unknownCount += summary.unknown.length;
      const classified = new Set([...summary.good.map((item) => item.key), ...summary.bad.map((item) => item.key)]);
      unknownClassified += summary.unknown.filter((name) => classified.has(name)).length;
    }
  }
}
check("two-year sweep covers every civil day", days === 730, String(days));
check("unknown gods are neutral, never good or bad", unknownClassified === 0, String(unknownClassified));
check("sweep proves more than sixteen gods can occur", maxGods > 16, String(maxGods));
check("two-year sweep covers all 12 officers", officers.size === 12, String(officers.size));
check("two-year sweep covers all 12 road spirits", spirits.size === 12, String(spirits.size));
check("two-year sweep covers all 28 lunar mansions", mansions.size === 28, String(mansions.size));
check("two-year sweep covers all 9 daily flying stars", nineStars.size === 9, String(nineStars.size));
console.log(`INFO two-year unknown occurrences=${unknownCount}, max gods/day=${maxGods}`);

console.log(`calendar-integrity: ${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
