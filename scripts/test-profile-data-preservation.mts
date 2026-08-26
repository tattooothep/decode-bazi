import assert from "node:assert/strict";
import fs from "node:fs";

import { pool } from "../src/lib/db";
import { parseBirthCoordinatePatch, upsertSelfProfile } from "../src/lib/self-profile";

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

assert.deepEqual(
  parseBirthCoordinatePatch({}),
  { provided: false },
  "omitted coordinates must remain an omitted patch",
);
assert.deepEqual(
  parseBirthCoordinatePatch({ birthLat: "13.7563", birthLng: "100.5018" }),
  { provided: true, birthLat: 13.7563, birthLng: 100.5018 },
  "a complete coordinate pair is normalized to JSON/DB numbers",
);
assert.deepEqual(
  parseBirthCoordinatePatch({ birthLat: null, birthLng: "" }),
  { provided: true, birthLat: null, birthLng: null },
  "a complete empty coordinate pair explicitly clears coordinates",
);
assert.throws(
  () => parseBirthCoordinatePatch({ birthLat: 13.7563 }),
  /birthLat and birthLng must be provided together/u,
  "one-sided coordinate updates are rejected",
);
assert.throws(
  () => parseBirthCoordinatePatch({ birthLat: null, birthLng: 100.5018 }),
  /birthLat and birthLng must both be coordinates or both be empty/u,
  "one-sided coordinate clears are rejected",
);
assert.throws(
  () => parseBirthCoordinatePatch({ birthLat: "north", birthLng: 100.5018 }),
  /birth coordinates invalid/u,
  "invalid coordinate text is rejected instead of silently clearing data",
);
assert.throws(
  () => parseBirthCoordinatePatch({ birthLat: 91, birthLng: 100.5018 }),
  /birth coordinates out of range/u,
  "out-of-range coordinates are rejected",
);

const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
let existingProfile: Record<string, unknown> | null = {
  id: "00000000-0000-4000-8000-000000000001",
  birth_tz: "Asia/Bangkok",
  birth_lat: "13.7563",
  birth_lng: "100.5018",
  gender: "F",
  birth_time_known: false,
  day_boundary: "00:00",
};
const fakeClient = {
  async query(text: string, values: unknown[] = []) {
    sqlCalls.push({ text, values });
    if (/FROM profiles/u.test(text)) {
      return { rows: existingProfile ? [existingProfile] : [] };
    }
    return { rows: [] };
  },
  release() {},
};
const originalConnect = pool.connect;
(pool as unknown as { connect: () => Promise<typeof fakeClient> }).connect = async () => fakeClient;
try {
  await upsertSelfProfile(
    { orgId: "00000000-0000-4000-8000-000000000002", userId: "00000000-0000-4000-8000-000000000003" },
    { name: "Preserve", birthDate: "1990-01-15", birthTime: "08:30" },
  );
  existingProfile = null;
  await upsertSelfProfile(
    { orgId: "00000000-0000-4000-8000-000000000002", userId: "00000000-0000-4000-8000-000000000003" },
    {
      name: "Create",
      birthDate: "1990-01-15",
      birthTime: "08:30",
      birthLat: 13.7563,
      birthLng: 100.5018,
      birthPlaceId: "place-1",
      birthLocationConfirmed: true,
      birthTz: "Asia/Bangkok",
    },
  );
} finally {
  (pool as unknown as { connect: typeof originalConnect }).connect = originalConnect;
}
const updateCall = sqlCalls.find((call) => /^UPDATE profiles SET/u.test(call.text.trim()));
assert.ok(updateCall, "the mocked update must execute");
const updatePlaceholders = [...updateCall.text.matchAll(/\$(\d+)/gu)].map((match) => Number(match[1]));
assert.equal(Math.max(...updatePlaceholders), updateCall.values.length,
  "UPDATE SQL placeholders and bound values must stay aligned");
const insertCall = sqlCalls.find((call) => /^INSERT INTO profiles/u.test(call.text.trim()));
assert.ok(insertCall, "the mocked insert must execute");
const insertPlaceholders = [...insertCall.text.matchAll(/\$(\d+)/gu)].map((match) => Number(match[1]));
assert.equal(Math.max(...insertPlaceholders), insertCall.values.length,
  "INSERT SQL placeholders and bound values must stay aligned");
assert.deepEqual(
  [
    updateCall.values[1],
    updateCall.values[4],
    updateCall.values[7],
    updateCall.values[9],
    updateCall.values[15],
    updateCall.values[17],
    updateCall.values[19],
  ],
  [false, false, false, false, false, false, false],
  "an UPDATE with omitted optional facts sends preserve flags for nickname, coordinates, location, gender, time-known, day-boundary, and timezone",
);

const selfProfile = read("src/lib/self-profile.ts");
const webProfile = read("src/app/api/profile/route.ts");
const mobileProfile = read("src/app/api/mobile/v1/profiles/route.ts");
const goal = read("public/goal.html");
const input = read("public/input.html");

assert.match(
  selfProfile,
  /nickname=CASE WHEN \$\d+::boolean THEN \$\d+ ELSE nickname END/u,
  "self-profile UPDATE preserves an omitted nickname",
);
for (const column of ["birth_lat", "birth_lng", "birth_location_name", "gender", "birth_time_known", "day_boundary"]) {
  assert.match(
    selfProfile,
    new RegExp(`${column}=CASE WHEN \\$\\d+::boolean THEN \\$\\d+ ELSE ${column} END`, "u"),
    `self-profile UPDATE preserves omitted ${column}`,
  );
}
assert.match(
  selfProfile,
  /birth_tz=CASE WHEN \$\d+::boolean THEN \$\d+ ELSE birth_tz END/u,
  "self-profile UPDATE keeps the established birth timezone when omitted",
);

assert.doesNotMatch(webProfile, /birthLat:\s*birthLat != null \? Number\(birthLat\) : null/u);
assert.doesNotMatch(webProfile, /locationName:\s*locationName \?\? null/u);
assert.doesNotMatch(webProfile, /dayBoundary:\s*dayBoundary === "00:00" \? "00:00" : "23:00"/u);
assert.match(webProfile, /parseBirthCoordinatePatch\(body\)/u);
assert.match(webProfile, /birthTzProvided/u, "web API distinguishes omitted birthTz from an explicit clear");

assert.doesNotMatch(mobileProfile, /cleanString\(body\.locationName, "ประเทศไทย"\)/u);
assert.match(mobileProfile, /parseBirthCoordinatePatch\(body\)/u);
assert.match(mobileProfile, /birth_lat::double precision AS birth_lat/u);
assert.match(mobileProfile, /birth_lng::double precision AS birth_lng/u);
assert.match(mobileProfile, /birthTzProvided/u, "mobile API preserves omitted birthTz");

assert.match(goal, /birthLat:\s*birth\.latitude/u);
assert.match(goal, /birthLng:\s*birth\.longitude/u);
assert.match(goal, /dayBoundary:\s*birth\.dayBoundary/u);
assert.match(goal, /birthTz:\s*birth\.birthTz/u);
assert.match(input, /id="hk-place-id"/u);
assert.match(input, /placeId:\s*placeId/u,
  "onboarding must retain the exact Google Place selection instead of only its display name");
assert.match(input, /if \(!placeId \|\| !place \|\| !Number\.isFinite\(lat\) \|\| !Number\.isFinite\(lng\)\)/u,
  "onboarding must fail closed instead of silently storing Bangkok when no Google Place was selected");
assert.doesNotMatch(input, /hk-place-lat" value="13\.7563/u,
  "onboarding must not seed a hidden Bangkok coordinate as if the user confirmed it");
assert.match(goal, /birthPlaceId:\s*birth\.placeId/u);
assert.match(webProfile, /lookupZiweiBirthTimezoneAtCoordinates/u,
  "a confirmed onboarding place must resolve its birth timezone server-side");
assert.match(selfProfile, /user_confirmed_exact_offset/u);
assert.match(selfProfile, /birth_tz_confirmed_at=CASE/u);

console.log("profile data-preservation contract: PASS");
