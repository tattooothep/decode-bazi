import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  exactRecoveryConfirmationBody,
  lookupZiweiBirthTimezoneCandidate,
  recoveryCandidateDigest,
} from "../src/lib/astro/ziwei/birth-context-recovery.ts";

const migration = readFileSync("migrations/20260827_ziwei_birth_context_recovery.sql", "utf8");
const statusRoute = readFileSync(
  "src/app/api/mobile/v1/profiles/self/birth-context-recovery/route.ts",
  "utf8",
);
const confirmRoute = readFileSync(
  "src/app/api/mobile/v1/profiles/self/birth-context-recovery/confirm/route.ts",
  "utf8",
);
const mobileRecoveryRoute = readFileSync(
  "src/app/api/mobile/v1/notifications/ziwei-recovery/route.ts",
  "utf8",
);

assert.match(migration, /ADD COLUMN IF NOT EXISTS birth_tz_confirmed_at timestamptz/u);
assert.match(migration, /CREATE TABLE IF NOT EXISTS profile_birth_context_recoveries/u);
assert.match(migration, /CREATE TABLE IF NOT EXISTS profile_birth_context_events/u);
assert.match(migration, /confirmation_token_digest text NOT NULL/u);
assert.match(migration, /profile_updated_at_seen timestamptz NOT NULL/u);
assert.match(migration, /FOREIGN KEY \(user_id,profile_id\)/u);
assert.match(migration, /CHECK \(status IN \('confirmation_required','confirmed','expired','manual_review'\)\)/u);
assert.doesNotMatch(migration, /mobile_qimen|mobile_zibai/u,
  "birth recovery must not mutate or couple to Qimen/Zi Bai state");

assert.match(statusRoute, /requires_birth_reentry:\s*false/u);
assert.match(statusRoute, /resolveCanonicalZiweiHourlyContext/u,
  "recovery must reject natal inputs outside the locked hourly science domain before enrollment");
assert.match(statusRoute, /Cache-Control[^\n]*no-store/u);
assert.match(confirmRoute, /exactRecoveryConfirmationBody/u);
assert.match(confirmRoute, /pg_advisory_xact_lock/u);
assert.match(confirmRoute, /birth_tz_source='user_confirmed_iana'/u);
assert.match(confirmRoute, /profile_birth_context_events/u);
assert.match(confirmRoute, /owner_generation=owner_generation\+1/u);
assert.doesNotMatch(confirmRoute, /birth_datetime\s*=|birth_lat\s*=|birth_lng\s*=|gender\s*=/u,
  "confirmation may only add the confirmed timezone; existing birth facts stay untouched");
assert.doesNotMatch(confirmRoute, /mobile_qimen|mobile_zibai/u,
  "confirmation must not touch other science notification state");
assert.match(mobileRecoveryRoute, /contractVersion:\s*1/u);
assert.match(mobileRecoveryRoute, /pushSubscribed/u);
assert.match(mobileRecoveryRoute, /ziweiEnrolled/u);
assert.match(mobileRecoveryRoute, /chartChangeRequired/u);
assert.match(mobileRecoveryRoute, /acceptChartChange/u);
for (const reason of ["birth_calendar_range_unsupported", "birth_late_zi_unsupported", "birth_wall_clock_ambiguous"]) {
  assert.match(mobileRecoveryRoute, new RegExp(reason, "u"),
    `the compatibility route must preserve the real science blocker ${reason}`);
}
assert.match(mobileRecoveryRoute, /confirm_location/u);
assert.match(mobileRecoveryRoute, /expoIosPushReady\(process\.env\)/u,
  "the recovery UX must not claim iOS delivery before the reviewed provider credential gate is ready");
assert.doesNotMatch(mobileRecoveryRoute, /OR t\.platform='ios'/u,
  "an iOS token alone is not proof that server delivery is configured");
assert.doesNotMatch(mobileRecoveryRoute, /mobile_qimen|mobile_zibai/u,
  "mobile compatibility route must remain isolated from other science state");

assert.deepEqual(
  exactRecoveryConfirmationBody({ confirmationToken: "abc", confirm: true }),
  { confirmationToken: "abc", confirm: true, acceptChartChange: false },
);
assert.deepEqual(
  exactRecoveryConfirmationBody({ confirmationToken: "abc", confirm: true, acceptChartChange: true }),
  { confirmationToken: "abc", confirm: true, acceptChartChange: true },
);
for (const body of [
  { confirmationToken: "abc", confirm: true, birthDate: "1984-01-01" },
  { confirmationToken: "abc", confirm: true, birthTime: "12:00" },
  { confirmationToken: "abc", confirm: true, gender: "M" },
  { confirmationToken: "abc", confirm: true, latitude: 13.7 },
  { confirmationToken: "abc", confirm: true, timezone: "Asia/Bangkok" },
]) {
  assert.equal(exactRecoveryConfirmationBody(body), null,
    "the client must never resubmit existing birth facts during confirmation");
}

const calls: string[] = [];
const fakeFetch: typeof fetch = async (input) => {
  const url = String(input);
  calls.push(url);
  if (url.includes("/geocode/")) {
    return new Response(JSON.stringify({
      status: "OK",
      results: [{
        place_id: "place-1",
        formatted_address: "Bangkok, Thailand",
        partial_match: false,
        geometry: { location: { lat: 13.7563, lng: 100.5018 }, location_type: "APPROXIMATE" },
      }],
    }), { status: 200 });
  }
  return new Response(JSON.stringify({
    status: "OK",
    timeZoneId: "Asia/Bangkok",
    timeZoneName: "Indochina Time",
  }), { status: 200 });
};

const candidate = await lookupZiweiBirthTimezoneCandidate({
  locationName: "Bangkok",
  birthWallClock: "1984-01-02T03:04:00",
  apiKey: "test-only",
  fetchImpl: fakeFetch,
});
assert.deepEqual(candidate, {
  displayName: "Bangkok, Thailand",
  placeId: "place-1",
  latitude: 13.7563,
  longitude: 100.5018,
  timezone: "Asia/Bangkok",
  provider: "google_geocoding_timezone_v1",
  confidence: "candidate_requires_user_confirmation",
});
assert.equal(calls.length, 2);
assert.match(calls[0], /address=Bangkok/u);
assert.match(calls[1], /location=13\.7563%2C100\.5018/u);
assert.match(calls[1], /timestamp=441860640/u,
  "timezone lookup must use the stored birth date, never the current device time");

const digestA = recoveryCandidateDigest(candidate);
const digestB = recoveryCandidateDigest({ ...candidate });
assert.equal(digestA, digestB);
assert.match(digestA, /^[0-9a-f]{64}$/u);
assert.notEqual(digestA, recoveryCandidateDigest({ ...candidate, timezone: "Asia/Tokyo" }));

await assert.rejects(
  lookupZiweiBirthTimezoneCandidate({
    locationName: "",
    birthWallClock: "1984-01-02T03:04:00",
    apiKey: "test-only",
    fetchImpl: fakeFetch,
  }),
  /recovery_location_missing/u,
);
await assert.rejects(
  lookupZiweiBirthTimezoneCandidate({
    locationName: "Bangkok",
    birthWallClock: "bad",
    apiKey: "test-only",
    fetchImpl: fakeFetch,
  }),
  /recovery_birth_wall_invalid/u,
);

console.log("PASS Ziwei birth-context recovery — one-tap, audited, no birth re-entry");
