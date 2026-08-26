import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string): string => readFileSync(path, "utf8");
const migration = read("migrations/20260826_mobile_hourly_sciences.sql");
const route = read("src/app/api/mobile/v1/profiles/route.ts");
const selfProfile = read("src/lib/self-profile.ts");
const preferences = read("src/lib/mobile-notification-preferences.ts");

assert.match(migration, /ALTER TABLE profiles[\s\S]*ADD COLUMN IF NOT EXISTS birth_tz varchar\(64\)[\s\S]*ADD COLUMN IF NOT EXISTS birth_tz_source varchar\(32\)/u,
  "fresh installations must have durable birth-timezone columns before the hourly scheduler is installed");
assert.match(route, /birth_tz:\s*string \| null/u);
assert.match(route, /birth_tz_source:\s*string \| null/u);
assert.match(route, /birth_tz, birth_tz_source/u,
  "mobile profile reads must return the server-owned birth timezone");
assert.match(route, /strictCanonicalZiweiTimezone\([\s\S]*typeof body\.birthTz === "string"/u,
  "mobile profile writes must validate the birth timezone with the canonical strict parser");
assert.match(route, /if \(birthTzProvided\) fields\.birthTz = birthTzSpec\?\.timezone \?\? null/u,
  "the normalized timezone must cross the API boundary while an older client omission preserves the durable value");
assert.match(selfProfile, /birthTz\?: string \| null/u);
assert.match(selfProfile, /SELECT id,birth_tz,birth_lat,birth_lng,gender,birth_time_known,day_boundary FROM profiles/u,
  "the domain layer must read the locked existing timezone before recalculating an older profile update");
assert.match(selfProfile, /requestedBirthTz !== undefined[\s\S]*\? requestedBirthTz[\s\S]*: strictCanonicalZiweiTimezone\(existing\?\.birth_tz/u,
  "omitted timezone must recalculate with the existing durable timezone, not Bangkok");
assert.match(selfProfile, /birth_tz=CASE WHEN \$\d+::boolean THEN \$\d+ ELSE birth_tz END/u,
  "self-profile updates must durably replace timezone and provenance");
assert.match(selfProfile, /birth_tz, birth_tz_source/u,
  "new self profiles must persist timezone and provenance");
assert.match(preferences, /NULLIF\(btrim\(birth_tz\),''\) IS NOT NULL/u,
  "Ziwei hourly consent must reject a profile whose birth timezone is not durably known");
assert.match(migration, /BEFORE INSERT OR UPDATE OF birth_datetime,birth_time_known,birth_tz,gender,relationship_type,is_archived,created_by_user_id OR DELETE/u,
  "every eligibility-changing profile mutation must atomically reconcile Ziwei consent/installations");
assert.match(migration, /ziwei_hourly_enabled=false/u);
assert.match(migration, /lease_token=NULL,lease_expires_at=NULL/u);
assert.match(migration, /owner_generation=owner_generation\+1/u);

console.log("PASS Ziwei hourly profile timezone sync — API, durable profile, consent gate, scheduler truth");
