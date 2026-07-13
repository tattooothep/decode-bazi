#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
let sourcesReadable = true;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}`);
}

function readSource(label, relativePath) {
  try {
    return readFileSync(path.join(ROOT, relativePath), "utf8");
  } catch {
    sourcesReadable = false;
    console.error(`FAIL ${label} source readable`);
    failed += 1;
    return "";
  }
}

function findMatchingParen(source, openIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function everyJsonResponseHasOk(source) {
  const marker = "NextResponse.json(";
  let cursor = 0;
  let count = 0;

  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start === -1) break;
    const open = start + marker.length - 1;
    const end = findMatchingParen(source, open);
    if (end === -1) return false;
    if (!/\bok\s*:/.test(source.slice(start, end + 1))) return false;
    count += 1;
    cursor = end + 1;
  }
  return count > 0;
}

const datepickRoute = readSource("datepick search", "src/app/api/mobile/v1/datepick/route.ts");
const datepickInput = readSource("datepick input", "src/app/api/mobile/v1/datepick/input.ts");
const savedCreate = readSource("saved date create", "src/app/api/mobile/v1/datepick/save/route.ts");
const savedList = readSource("saved date list", "src/app/api/mobile/v1/datepick/saved/route.ts");
const savedDelete = readSource("saved date delete", "src/app/api/mobile/v1/datepick/saved/[id]/route.ts");
const sifuRoute = readSource("Sifu chat", "src/app/api/mobile/v1/sifu/chat/route.ts");
const imagePolicy = readSource("Sifu image policy", "src/app/api/mobile/v1/sifu/image-policy.ts");
const goalsRoute = readSource("Today Goals", "src/app/api/mobile/v1/today/goals/route.ts");
const goalsProject = readSource("Today Goals projection", "src/app/api/mobile/v1/today/goals/project.ts");
const migration = readSource("saved date migration", "migrations/20260713_mobile_saved_dates_r515.sql");

if (sourcesReadable) check("R515 source set readable", true);

const apiRoutes = [datepickRoute, savedCreate, savedList, savedDelete, sifuRoute, goalsRoute];
check(
  "R515 routes require a mobile session",
  apiRoutes.every((source) => /getMobileSession\(req\)/.test(source)),
);
check(
  "R515 routes enforce rate limits",
  apiRoutes.every((source) => /await rateLimit\(/.test(source) && /if \(!limited\.ok\)/.test(source)),
);
check(
  "R515 JSON responses preserve the ok envelope",
  apiRoutes.every(everyJsonResponseHasOk),
);

check(
  "datepick combines legacy and multi-person input before deduplication",
  /const rawPeople = body\.peopleIds/.test(datepickInput)
    && /ids\.push\(legacyId\)/.test(datepickInput)
    && /const uniqueIds = Array\.from\(new Set\(ids\)\)/.test(datepickInput),
);
check(
  "datepick ownership query covers every requested profile",
  /id\s*=\s*ANY\(\$1::uuid\[\]\)[\s\S]*org_id\s*=\s*\$2[\s\S]*created_by_user_id\s*=\s*\$3/.test(datepickRoute)
    && /\[people\.ids, session\.orgId, session\.userId\]/.test(datepickRoute)
    && /people\.ids\.some\(\(id\) => !ownedIds\.has\(id\)\)/.test(datepickRoute),
);
check(
  "datepick forwards only the normalized owned people set",
  /peopleIds:\s*people\.ids\.map\(\(id\) => `hk_\$\{id\}`\)/.test(datepickRoute),
);
check(
  "Sifu profile context is owner and organization scoped",
  /FROM profiles[\s\S]*WHERE id\s*=\s*\$1 AND org_id\s*=\s*\$2 AND created_by_user_id\s*=\s*\$3[\s\S]*COALESCE\(is_archived, false\)\s*=\s*false/.test(sifuRoute)
    && /\[profileId, orgId, userId\]/.test(sifuRoute),
);
check(
  "Today Goals profile selection is owner and organization scoped",
  /FROM profiles[\s\S]*WHERE id\s*=\s*\$1[\s\S]*org_id\s*=\s*\$2[\s\S]*created_by_user_id\s*=\s*\$3[\s\S]*COALESCE\(is_archived, false\)\s*=\s*false/.test(goalsRoute)
    && /\[profileId, session\.orgId, session\.userId\]/.test(goalsRoute),
);

check(
  "saved date insert binds organization and user scope",
  /INSERT INTO mobile_saved_dates\s*\(org_id, user_id, payload\)[\s\S]*VALUES\s*\(\$1, \$2, \$3::jsonb\)/.test(savedCreate)
    && /\[session\.orgId, session\.userId, JSON\.stringify\(parsed\.payload\)\]/.test(savedCreate),
);
check(
  "saved date list binds organization and user scope",
  /FROM mobile_saved_dates[\s\S]*WHERE org_id\s*=\s*\$1 AND user_id\s*=\s*\$2/.test(savedList)
    && /\[session\.orgId, session\.userId, limit\]/.test(savedList),
);
check(
  "saved date delete binds id organization and user scope",
  /DELETE FROM mobile_saved_dates[\s\S]*WHERE id\s*=\s*\$1 AND org_id\s*=\s*\$2 AND user_id\s*=\s*\$3/.test(savedDelete)
    && /\[id, session\.orgId, session\.userId\]/.test(savedDelete),
);

const imageInspection = sifuRoute.indexOf("const image = inspectMobileSifuImage(body)");
const invalidImage = sifuRoute.indexOf("if (image.invalid)", imageInspection);
const largeImage = sifuRoute.indexOf("if (image.tooLarge)", imageInspection);
const unsupportedImage = sifuRoute.indexOf("if (image.present)", imageInspection);
const upstreamFetch = sifuRoute.indexOf("const sifuResp = await fetch", imageInspection);
check(
  "Sifu validates rejects and size-checks images before upstream",
  imageInspection >= 0
    && invalidImage > imageInspection
    && largeImage > invalidImage
    && unsupportedImage > largeImage
    && upstreamFetch > unsupportedImage,
);
check(
  "Sifu enforces the five MiB inline image limit",
  /MAX_INLINE_IMAGE_BYTES\s*=\s*5 \* 1024 \* 1024/.test(imagePolicy)
    && /estimatedBytes\s*>\s*MAX_INLINE_IMAGE_BYTES/.test(imagePolicy),
);
check(
  "Sifu never fetches a client image URL",
  (sifuRoute.match(/\bfetch\s*\(/g) || []).length === 1
    && /fetch\(`\$\{origin\}\/api\/sifu`/.test(sifuRoute)
    && !/\bfetch\s*\(/.test(imagePolicy),
);
check(
  "Sifu stream request carries stream and noCache upstream",
  /mobileSifuStreamPolicy\(wantsStream\)/.test(sifuRoute)
    && /wantsStream \? \{ stream: true, noCache: true \} : \{ stream: false \}/.test(imagePolicy),
);
check(
  "Sifu relays the upstream SSE body directly",
  /return new Response\(sifuResp\.body, \{ headers, status: sifuResp\.status \}\)/.test(sifuRoute)
    && sifuRoute.indexOf("return new Response(sifuResp.body") < sifuRoute.indexOf("const text = await sifuResp.text()"),
);
check(
  "Sifu SSE response disables caches and proxy buffering",
  /"Cache-Control":\s*"no-cache, no-store, max-age=0, must-revalidate"/.test(sifuRoute)
    && /"X-Accel-Buffering":\s*"no"/.test(sifuRoute)
    && /"Content-Type":\s*sifuResp\.headers\.get\("content-type"\) \|\| "text\/event-stream; charset=utf-8"/.test(sifuRoute),
);

check(
  "Today Goals defaults to the Bangkok civil date",
  /currentBangkokDate\(\)/.test(goalsRoute)
    && /now\.getTime\(\) \+ 7 \* 60 \* 60 \* 1_000/.test(goalsProject),
);
check(
  "Today Goals enforces the product date window",
  /currentDateWindow\("today", req\)/.test(goalsRoute)
    && /withinDayWindow\(date, dateAccess\.max\)/.test(goalsRoute)
    && /entitlementDenied\("today_date_window"/.test(goalsRoute),
);
check(
  "Today Goals delegates directly to the mobile Calendar handler",
  /import \{ GET as mobileCalendarGet \} from "@\/app\/api\/mobile\/v1\/calendar\/route"/.test(goalsRoute)
    && /await mobileCalendarGet\(new Request\(calendarUrl\.toString\(\)/.test(goalsRoute)
    && !/\bfetch\s*\(/.test(goalsRoute),
);
check(
  "Today Goals projects Calendar goals and intent status",
  /const rawGoals = day\.goals/.test(goalsRoute)
    && /projectCalendarGoals\(rawGoals\)/.test(goalsRoute)
    && /intent_status:\s*day\.intentStatus/.test(goalsRoute)
    && /\["wealth", "career", "love", "health", "family", "travel"\] as const/.test(goalsProject),
);
check(
  "Today Goals introduces no scoring formula",
  !/(computeIntentStatus|personalGoals|universalGoals|scoreIntents|computeTongshuLive|SolarTime|tyme4ts|tongshu-universal|luck-engine)/.test(`${goalsRoute}\n${goalsProject}`),
);

check(
  "migration creates the owner-scoped saved date table",
  /CREATE TABLE IF NOT EXISTS mobile_saved_dates\s*\([\s\S]*org_id\s+uuid\s+NOT NULL REFERENCES organizations\(id\)[\s\S]*user_id\s+uuid\s+NOT NULL REFERENCES users\(id\)[\s\S]*payload\s+jsonb\s+NOT NULL[\s\S]*created_at\s+timestamptz\s+NOT NULL/.test(migration),
);
check(
  "migration creates the scoped chronological index",
  /CREATE INDEX IF NOT EXISTS idx_mobile_saved_dates_user_created\s+ON mobile_saved_dates\s*\(org_id, user_id, created_at DESC, id DESC\)/.test(migration),
);
check(
  "migration grants only required saved date operations",
  /REVOKE UPDATE ON mobile_saved_dates FROM hourkey_app/.test(migration)
    && /GRANT SELECT, INSERT, DELETE ON mobile_saved_dates TO hourkey_app/.test(migration),
);

console.log(`mobile R515 contract: ${passed}/${passed + failed} passed`);
if (failed) process.exitCode = 1;
