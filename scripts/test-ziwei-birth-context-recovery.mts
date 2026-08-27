import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  exactRecoveryConfirmationBody,
  lookupZiweiBirthTimezoneCandidate,
  recoveryCandidateDigest,
  recoveryConfirmationToken,
  recoveryTokenDigest,
  recoveryTokenMatchesDigest,
} from "../src/lib/astro/ziwei/birth-context-recovery.ts";
import * as recoveryPolicy from "../src/lib/astro/ziwei/birth-context-recovery.ts";

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
assert.match(migration, /UPDATE profiles SET updated_at=now\(\) WHERE updated_at IS NULL/u,
  "legacy profiles need a concrete recovery version without asking the user to re-enter data");
assert.match(migration, /ALTER TABLE profiles ALTER COLUMN updated_at SET NOT NULL/u,
  "future recovery snapshots must always have a representable profile version");
assert.match(migration, /CREATE TABLE IF NOT EXISTS profile_birth_context_recoveries/u);
assert.match(migration, /CREATE TABLE IF NOT EXISTS profile_birth_context_events/u);
assert.match(migration, /confirmation_token_digest text NOT NULL/u);
assert.match(migration, /profile_updated_at_seen timestamptz NOT NULL/u);
assert.match(migration, /FOREIGN KEY \(user_id,profile_id\)/u);
assert.match(migration, /CHECK \(status IN \('confirmation_required','confirmed','expired','manual_review'\)\)/u);
assert.match(migration, /CREATE TRIGGER profile_birth_context_recovery_evidence_immutable/u,
  "candidate evidence must remain write-once after insertion");
assert.match(migration, /CREATE TRIGGER hourkey_touch_profile_birth_context_version/u,
  "every canonical birth or location-evidence mutation must advance profile freshness");
assert.match(migration, /OLD\.updated_at,'-infinity'::timestamptz\) \+ interval '1 microsecond'/u,
  "a direct writer cannot preserve the old freshness version during a source-fact change");
assert.match(migration, /GRANT UPDATE \(status,confirmed_at,applied_at,failure_code,updated_at\)/u,
  "the runtime role may update lifecycle fields only");
assert.doesNotMatch(migration, /GRANT SELECT,INSERT,UPDATE ON TABLE profile_birth_context_recoveries/u,
  "the runtime role must never receive full-row UPDATE");
assert.doesNotMatch(migration, /mobile_qimen|mobile_zibai/u,
  "birth recovery must not mutate or couple to Qimen/Zi Bai state");

assert.match(statusRoute, /requires_birth_reentry:\s*false/u);
assert.match(statusRoute, /resolveCanonicalZiweiHourlyContext/u,
  "recovery must reject natal inputs outside the locked hourly science domain before enrollment");
assert.match(statusRoute, /recoveryConfirmationToken/u,
  "overlapping status reads must derive one reusable opaque token from the immutable recovery row");
assert.equal(typeof (recoveryPolicy as any).birthContextRecoveryDisposition, "function",
  "recovery must expose an auditable policy separating automatic no-change recovery from consent");
assert.equal((recoveryPolicy as any).birthContextRecoveryDisposition({
  chartChangeRequired: false,
  evidenceKind: "confirmed_coordinates_timezone_lookup",
}), "auto_apply");
assert.equal((recoveryPolicy as any).birthContextRecoveryDisposition({
  chartChangeRequired: true,
  evidenceKind: "confirmed_coordinates_timezone_lookup",
}), "confirmation_required");
assert.equal((recoveryPolicy as any).birthContextRecoveryDisposition({
  chartChangeRequired: false,
  evidenceKind: "geocoded_location_name_candidate",
}), "confirmation_required");
assert.match(statusRoute, /birthContextRecoveryDisposition\([\s\S]+case "auto_apply"/u,
  "confirmed coordinates with an unchanged natal basis must recover automatically");
assert.match(statusRoute, /birth_tz_source='verified_import'/u,
  "automatic no-change recovery must record verified-import provenance, never fake user confirmation");
assert.match(statusRoute, /APPROVED_LOCATION_SOURCES\.has\(String\(profile\.birth_location_source \|\| ""\)\)/u,
  "automatic recovery must require explicit stored-location provenance, not merely non-null coordinates");
assert.match(statusRoute, /recoveryTokenMatchesDigest\(reusableToken, active\.confirmation_token_digest\)/u,
  "a regenerated token must match the digest committed with the active row");
assert.match(statusRoute, /pg_advisory_xact_lock[\s\S]+FROM profile_birth_context_recoveries[\s\S]+FOR UPDATE/u,
  "the route must re-read pending recovery under the owner lock before inserting");
assert.match(statusRoute, /SELECT updated_at::text AS updated_at_exact[\s\S]+created_by_user_id=\$2 AND org_id=\$3[\s\S]+FOR UPDATE/u,
  "the locked profile re-read must retain owner, organization and self-profile eligibility");
assert.match(statusRoute, /\(updated_at=\$4::timestamptz\) AS profile_unchanged/u,
  "profile freshness must preserve PostgreSQL microseconds instead of round-tripping through JS Date");
assert.match(statusRoute,
  /profile_unchanged !== true[\s\S]+completePayloadFromCurrentProfile[\s\S]+COMMIT[\s\S]+profile_changed/u,
  "an overlapping GET must converge on a concurrently completed canonical recovery instead of returning 409");
assert.match(statusRoute, /\(r\.profile_updated_at_seen=p\.updated_at\) AS profile_fresh/u,
  "pending recovery freshness must be compared exactly inside PostgreSQL");
assert.doesNotMatch(statusRoute, /new Date\([^)]*updated_at/u,
  "JavaScript Date truncates PostgreSQL microseconds and must not decide freshness");
assert.doesNotMatch(statusRoute, /newRecoveryToken/u,
  "random per-GET tokens make overlapping responses invalidate one another");
assert.match(statusRoute, /Cache-Control[^\n]*no-store/u);
assert.match(confirmRoute, /exactRecoveryConfirmationBody/u);
assert.match(confirmRoute, /r\.profile_id=\$3/u,
  "the confirmation token must be bound to the explicit owner profile");
assert.match(confirmRoute, /recoveryConfirmationToken\([\s\S]+recoveryTokenMatchesDigest\(authenticatedToken, row\.confirmation_token_digest\)/u,
  "confirmation must authenticate the opaque HMAC token, not trust an arbitrary inserted digest");
assert.match(confirmRoute, /confirmation_token_authentication_mismatch/u,
  "an unauthenticated recovery row must fail closed and remain auditable");
assert.ok(
  confirmRoute.indexOf("const authenticatedToken = recoveryConfirmationToken")
    < confirmRoute.indexOf('if (row.status === "confirmed")'),
  "confirmed-token replay must authenticate before its idempotent response",
);
assert.match(confirmRoute, /row\.birth_time_known === true[\s\S]+APPROVED_SOURCES\.has[\s\S]+confirmedContext\.birthFingerprint !== row\.candidate_natal_fingerprint/u,
  "confirmed replay must prove the current canonical profile still matches the consented natal context");
assert.match(confirmRoute, /completePayload\(row\.profile_id, confirmedContext\.birth\.timezone, confirmedContext\.fingerprint\)/u,
  "confirmed replay returns the current real canonical fingerprint, never a synthetic ready response");
assert.match(confirmRoute, /recoveryCandidateDigest/u,
  "confirmation must recompute candidate integrity from stored facts");
assert.match(confirmRoute, /candidate_digest_mismatch/u,
  "changed candidate evidence must fail closed into manual review");
assert.match(confirmRoute, /context\.birthFingerprint !== row\.candidate_natal_fingerprint/u,
  "confirmation must reproduce the exact candidate natal fingerprint captured before consent");
assert.match(confirmRoute, /candidate_natal_fingerprint_mismatch/u,
  "natal source drift must fail closed and remain auditable");
assert.match(confirmRoute, /\(r\.profile_updated_at_seen=p\.updated_at\) AS profile_fresh/u,
  "confirmation freshness must be evaluated by PostgreSQL at full timestamp precision");
assert.doesNotMatch(confirmRoute, /\$1::timestamptz=\$2::timestamptz/u,
  "confirmation must not compare timestamps after a lossy driver round trip");
assert.match(confirmRoute, /pg_advisory_xact_lock/u);
assert.match(confirmRoute, /birth_tz_source='user_confirmed_iana'/u);
assert.match(confirmRoute, /profile_birth_context_events/u);
assert.match(confirmRoute, /owner_generation=owner_generation\+1/u);
assert.doesNotMatch(confirmRoute, /birth_datetime\s*=(?!=)|gender\s*=(?!=)/u,
  "confirmation must never rewrite the owner's birth instant or gender");
assert.match(confirmRoute,
  /birth_location_name=\$3,birth_place_id=\$4,\s*birth_lat=\$5,birth_lng=\$6,[\s\S]+birth_location_source='user_confirmed_geocoded_place',[\s\S]+birth_location_confirmed_at=now\(\)/u,
  "confirmation must atomically persist the exact immutable candidate location facts and provenance");
assert.match(confirmRoute, /WHERE id=\$7 AND created_by_user_id=\$8 AND org_id=\$9/u,
  "candidate application must remain bound to the authenticated owner and organization");
assert.match(confirmRoute, /updatedProfile\.rowCount !== 1/u,
  "candidate application must fail closed if the owned profile changed or disappeared");
assert.match(confirmRoute, /const afterContext = \{[\s\S]+birthLatitude: candidateLatitude,[\s\S]+birthLongitude: candidateLongitude/u,
  "the audit event must carry the exact candidate coordinates applied to the profile");
assert.doesNotMatch(confirmRoute, /mobile_qimen|mobile_zibai/u,
  "confirmation must not touch other science notification state");
assert.match(mobileRecoveryRoute, /contractVersion:\s*1/u);
assert.match(mobileRecoveryRoute, /pushSubscribed/u);
assert.match(mobileRecoveryRoute, /ziweiEnrolled/u);
assert.match(mobileRecoveryRoute, /const installationId = installationIdFromRequest\(req\)/u,
  "recovery readiness must be scoped to the physical installation making the request");
assert.match(mobileRecoveryRoute, /installation_id=\$2::uuid/u,
  "another phone on the same account must not make this phone appear subscribed or enrolled");
assert.match(mobileRecoveryRoute, /invalid_installation_id/u,
  "missing or malformed installation identity must fail before recovery/provider work");
assert.match(mobileRecoveryRoute, /deviceStatus\(session\.userId, installationId\)/u);
assert.match(mobileRecoveryRoute,
  /JSON\.stringify\(keys\) !== JSON\.stringify\(\["acceptChartChange", "action", "confirmationToken", "installation_id", "profileId"\]\)/u,
  "confirmation must accept only the exact mobile body including its installation binding");
assert.match(mobileRecoveryRoute, /typeof body\.installation_id !== "string"[\s\S]+UUID_RE\.test\(body\.installation_id\)/u,
  "POST installation identity must be a canonical UUID before upstream confirmation work");
assert.match(mobileRecoveryRoute, /chartChangeRequired/u);
assert.match(mobileRecoveryRoute, /acceptChartChange/u);
assert.match(mobileRecoveryRoute, /profileId:\s*body\.profileId/u,
  "the compatibility route must forward the owner profile binding");
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

const confirmationProfileId = "00000000-0000-4000-8000-000000000002";
assert.deepEqual(
  exactRecoveryConfirmationBody({
    profileId: confirmationProfileId,
    confirmationToken: "abc",
    confirm: true,
  }),
  { profileId: confirmationProfileId, confirmationToken: "abc", confirm: true, acceptChartChange: false },
);
assert.deepEqual(
  exactRecoveryConfirmationBody({
    profileId: confirmationProfileId,
    confirmationToken: "abc",
    confirm: true,
    acceptChartChange: true,
  }),
  { profileId: confirmationProfileId, confirmationToken: "abc", confirm: true, acceptChartChange: true },
);
for (const body of [
  { confirmationToken: "abc", confirm: true },
  { profileId: "not-a-uuid", confirmationToken: "abc", confirm: true },
  { profileId: confirmationProfileId, confirmationToken: "abc", confirm: true, birthDate: "1984-01-01" },
  { profileId: confirmationProfileId, confirmationToken: "abc", confirm: true, birthTime: "12:00" },
  { profileId: confirmationProfileId, confirmationToken: "abc", confirm: true, gender: "M" },
  { profileId: confirmationProfileId, confirmationToken: "abc", confirm: true, latitude: 13.7 },
  { profileId: confirmationProfileId, confirmationToken: "abc", confirm: true, timezone: "Asia/Bangkok" },
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

const tokenContext = {
  recoveryId: "00000000-0000-4000-8000-000000000010",
  userId: "00000000-0000-4000-8000-000000000001",
  profileId: confirmationProfileId,
  candidateDigest: digestA,
};
const tokenSecret = "test-only-recovery-secret-with-32-bytes-minimum";
const reusableTokenA = recoveryConfirmationToken(tokenContext, tokenSecret);
const reusableTokenB = recoveryConfirmationToken({ ...tokenContext }, tokenSecret);
assert.equal(reusableTokenA, reusableTokenB,
  "two overlapping GET responses for one immutable recovery must carry the same token");
assert.match(reusableTokenA, /^[A-Za-z0-9_-]{43}$/u);
assert.equal(recoveryTokenMatchesDigest(reusableTokenA, recoveryTokenDigest(reusableTokenA)), true);
assert.equal(recoveryTokenMatchesDigest(reusableTokenA, "0".repeat(64)), false);
assert.notEqual(
  reusableTokenA,
  recoveryConfirmationToken({
    ...tokenContext,
    recoveryId: "00000000-0000-4000-8000-000000000011",
  }, tokenSecret),
  "tokens remain isolated between recovery rows",
);
assert.throws(
  () => recoveryConfirmationToken(tokenContext, "short"),
  /recovery_token_context_invalid/u,
  "a weak or missing server secret must fail closed",
);

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
