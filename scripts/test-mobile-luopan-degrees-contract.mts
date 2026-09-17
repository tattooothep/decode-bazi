import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeAbsoluteDegree,
  parseMobileLuopanDegreesInput,
  projectMobileLuopanDegreesResponse,
} from "../src/lib/mobile-luopan-degrees-contract";
import { findMountain24, MOUNTAINS_24 } from "../src/lib/luopan/mountains";

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

function parse(query: string) {
  return parseMobileLuopanDegreesInput(new URL(`https://hourkey.test/api/mobile/v1/luopan/degrees${query}`), 2026);
}

for (const query of ["", "?degree=", "?degree=NaN", "?degree=Infinity", "?degree=-0.01", "?degree=360"]) {
  check(parse(query).ok === false, `reject invalid degree: ${query || "missing"}`);
}
check(parse("?degree=0").ok, "accept north as absolute degree zero");
check(parse("?degree=359.999").ok, "accept the upper open interval");
check(parse("?degree=1&degree=2").ok === false, "reject duplicate degree ambiguity");
check(parse("?degree=1&save=true").ok === false, "reject unsupported or mutation-shaped parameters");
check(parse("?degree=1&facing_deg=-1").ok === false, "reject negative facing");
check(parse("?degree=1&facing_deg=360").ok === false, "reject facing outside the absolute ring");
check(parse("?degree=1&year=1863").ok === false, "reject year below the web-supported range");
check(parse("?degree=1&year=2101").ok === false, "reject year above the web-supported range");
check(parse("?degree=1&timing=week").ok === false, "reject a non-canonical timing layer");

const defaults = parse("?degree=45");
assert.equal(defaults.ok, true);
if (defaults.ok) {
  assert.deepEqual(defaults.input, {
    inputDegree: 45,
    facingDeg: 0,
    nearestEngineDegree: 45,
    year: 2026,
    timing: "era",
    profileId: null,
  });
  checks += 1;
}
const rotated = parse("?degree=0&facing_deg=180&year=2027&timing=day&profile_id=11111111-1111-4111-8111-111111111111");
assert.equal(rotated.ok, true);
if (!rotated.ok) throw new Error(rotated.error);
assert.equal(rotated.input.nearestEngineDegree, 180, "absolute north maps to cursor 180 when the house ring faces south");
checks += 1;
const fractional = parse("?degree=0&facing_deg=22.5");
assert.equal(fractional.ok, true);
if (!fractional.ok) throw new Error(fractional.error);
assert.equal(fractional.input.nearestEngineDegree, 338, "half-degree tie rounds to the nearest canonical one-degree cursor");
const wrappedRounding = parse("?degree=359.8");
assert.equal(wrappedRounding.ok, true);
if (!wrappedRounding.ok) throw new Error(wrappedRounding.error);
assert.equal(wrappedRounding.input.nearestEngineDegree, 0, "nearest canonical cursor wraps 359.8 degrees to north");
checks += 2;

function canonicalFixture(input: typeof rotated.input) {
  const rows = Array.from({ length: 360 }, (_, degree) => {
    const ringDegree = normalizeAbsoluteDegree(degree + input.facingDeg);
    const mountain = findMountain24(ringDegree);
  const score = degree < 12 ? 100 - degree : degree >= 348 ? degree - 348 : 50;
    return {
      degree,
      ring_degree: ringDegree,
      dir8: mountain.dir8,
      mountain24: { code: mountain.name, mountain_code: mountain.code, name: mountain.name },
      scoring: {
        base: 50,
        profile_weight: 0,
        time_weight: score - 50,
        pin_weight: 0,
        final_score: score,
        evidence: [`CANONICAL-${degree}`],
      },
    };
  });
  const sorted = [...rows].sort((a, b) => b.scoring.final_score - a.scoring.final_score);
  const ranked = (row: typeof rows[number]) => ({ degree: row.degree, score: row.scoring.final_score, m24: row.mountain24.code });
  return {
    ok: true,
    input: { facing_deg: input.facingDeg, year: input.year, timing: input.timing, profile_id: input.profileId, pin_count: 0 },
    summary: {
      schema_version: "luopan.degrees.v2-classical",
      note: "canonical formula note",
      profile_elements: { yong: ["wood"], xi: [], ji: [] },
      classical: { tigua_school: "shen_13" },
      top_good_degrees: sorted.slice(0, 12).map(ranked),
      top_bad_degrees: sorted.slice(-12).map(ranked),
    },
    degrees: rows,
    meta: { generated_at: "2026-07-19T00:00:00.000Z", duration_ms: 7 },
  };
}

const canonical = canonicalFixture(rotated.input);
const projected = projectMobileLuopanDegreesResponse(canonical, rotated.input);
assert.equal(projected.ok, true);
if (!projected.ok) throw new Error(projected.error);
const value = projected.value as Record<string, any>;
assert.equal(value.focus.input_degree, 0);
assert.equal(value.focus.engine_degree, 180);
assert.equal(value.focus.ring_degree, 0);
assert.equal(value.focus.scoring.final_score, 50);
assert.deepEqual(value.focus.scoring.evidence, ["CANONICAL-180"]);
checks += 5;
assert.equal(value.top_good.length, 5);
assert.equal(value.top_bad.length, 5);
assert.deepEqual(value.top_good.map((entry: any) => entry.degree), [180, 181, 182, 183, 184]);
assert.deepEqual(value.top_bad.map((entry: any) => entry.engine_degree), canonical.summary.top_bad_degrees.slice(-5).map((entry) => entry.degree));
assert.deepEqual(value.top_bad.map((entry: any) => entry.degree), canonical.summary.top_bad_degrees.slice(-5).map((entry) => normalizeAbsoluteDegree(entry.degree + 180)));
assert.deepEqual(value.top_good[0].scoring.evidence, ["CANONICAL-0"]);
checks += 6;
assert.equal(value.summary.schema_version, canonical.summary.schema_version);
assert.deepEqual(value.provenance.canonical_input, canonical.input);
assert.deepEqual(value.provenance.focus_scoring_evidence, ["CANONICAL-180"]);
assert.match(value.provenance.degree_transform, /input_degree-facing_deg/);
assert.equal("degrees" in value, false, "BFF must not leak the canonical 360-row response");
checks += 5;

const fractionalCanonical = canonicalFixture(fractional.input as typeof rotated.input);
const fractionalProjected = projectMobileLuopanDegreesResponse(fractionalCanonical, fractional.input);
assert.equal(fractionalProjected.ok, true);
if (!fractionalProjected.ok) throw new Error(fractionalProjected.error);
assert.equal((fractionalProjected.value.input as Record<string, unknown>).resolved_ring_degree, 0.5);
assert.equal((fractionalProjected.value.input as Record<string, unknown>).angular_error_deg, 0.5);
checks += 2;

const boundaryInput = parse("?degree=7.5&facing_deg=0.25");
assert.equal(boundaryInput.ok, true);
if (!boundaryInput.ok) throw new Error(boundaryInput.error);
const boundaryProjected = projectMobileLuopanDegreesResponse(
  canonicalFixture(boundaryInput.input as typeof rotated.input),
  boundaryInput.input,
);
assert.equal(boundaryProjected.ok, true);
if (!boundaryProjected.ok) throw new Error(boundaryProjected.error);
const boundaryValue = boundaryProjected.value as Record<string, any>;
assert.equal(boundaryValue.input.nearest_engine_degree, 7);
assert.equal(boundaryValue.input.engine_degree, 8);
assert.equal(boundaryValue.input.boundary_adjusted, true);
assert.equal(boundaryValue.input.requested_mountain.code, "N3");
assert.equal(boundaryValue.focus.mountain24.mountain_code, "N3");
checks += 5;

for (const mountain of MOUNTAINS_24) {
  const boundary = parse(`?degree=${mountain.startDeg}&facing_deg=0.25`);
  assert.equal(boundary.ok, true);
  if (!boundary.ok) throw new Error(boundary.error);
  const result = projectMobileLuopanDegreesResponse(canonicalFixture(boundary.input as typeof rotated.input), boundary.input);
  assert.equal(result.ok, true, `project boundary ${mountain.startDeg}°`);
  if (!result.ok) throw new Error(result.error);
  const projectedBoundary = result.value as Record<string, any>;
  const expectedMountain = findMountain24(mountain.startDeg);
  assert.equal(projectedBoundary.input.requested_mountain.code, expectedMountain.code);
  assert.equal(projectedBoundary.focus.mountain24.mountain_code, expectedMountain.code);
  assert.equal(projectedBoundary.input.boundary_adjusted, true);
  assert.ok(projectedBoundary.input.angular_error_deg <= 1);
  checks += 5;
}

const missingEvidence = structuredClone(canonical);
missingEvidence.degrees[180].scoring.evidence = undefined as unknown as string[];
check(projectMobileLuopanDegreesResponse(missingEvidence, rotated.input).ok === false, "fail closed when canonical score evidence is missing");
const nullScore = structuredClone(canonical);
nullScore.degrees[180].scoring.final_score = null as unknown as number;
check(projectMobileLuopanDegreesResponse(nullScore, rotated.input).ok === false, "fail closed when canonical focused score is null");
const forgedRanking = structuredClone(canonical);
forgedRanking.summary.top_good_degrees[0].score = -999;
check(projectMobileLuopanDegreesResponse(forgedRanking, rotated.input).ok === false, "fail closed when ranking score differs from canonical row evidence");
const forgedRankedMountain = structuredClone(canonical);
forgedRankedMountain.summary.top_good_degrees[0].m24 = "WRONG";
check(projectMobileLuopanDegreesResponse(forgedRankedMountain, rotated.input).ok === false, "fail closed when ranked mountain differs from its validated canonical row");
const duplicatedRanking = structuredClone(canonical);
duplicatedRanking.summary.top_bad_degrees[duplicatedRanking.summary.top_bad_degrees.length - 1] = structuredClone(duplicatedRanking.summary.top_good_degrees[0]);
check(projectMobileLuopanDegreesResponse(duplicatedRanking, rotated.input).ok === false, "fail closed when focused ranking entries are duplicated");
for (const [field, value] of [
  ["facing_deg", 181],
  ["year", 2026],
  ["timing", "hour"],
  ["profile_id", "22222222-2222-4222-8222-222222222222"],
  ["pin_count", 1],
] as const) {
  const mismatched = structuredClone(canonical);
  (mismatched.input as Record<string, unknown>)[field] = value;
  check(projectMobileLuopanDegreesResponse(mismatched, rotated.input).ok === false, `fail closed on canonical input mismatch: ${field}`);
}
const badRingTransform = structuredClone(canonical);
badRingTransform.degrees[23].ring_degree += 0.25;
check(projectMobileLuopanDegreesResponse(badRingTransform, rotated.input).ok === false, "fail closed on a canonical ring-degree transform mismatch");
const badMountain = structuredClone(canonical);
badMountain.degrees[23].mountain24.mountain_code = "WRONG";
check(projectMobileLuopanDegreesResponse(badMountain, rotated.input).ok === false, "fail closed on a canonical 24-Mountain mismatch");

const route = readFileSync(new URL("../src/app/api/mobile/v1/luopan/degrees/route.ts", import.meta.url), "utf8");
const canonicalRoute = readFileSync(new URL("../src/app/api/luopan/degrees/route.ts", import.meta.url), "utf8");
check(/export async function GET\(req: Request\)/.test(route), "mobile preview exposes GET only");
check(!/export async function (POST|PUT|PATCH|DELETE)/.test(route), "mobile preview exposes no mutation method");
check(/getMobileSession\(req\)/.test(route) && /await rateLimit\(/.test(route), "mobile preview requires a session and rate limit");
check(/created_by_user_id=\$3/.test(route) && /\[input\.profileId, session\.orgId, session\.userId\]/.test(route), "profile personalization is account-owner scoped");
check(/internalAppOrigin\(req\)/.test(route) && /\/api\/luopan\/degrees/.test(route), "BFF calls the trusted canonical engine boundary");
check(/CANONICAL_TIMEOUT_MS\s*=\s*10_000/.test(route) && /canonical_engine_timeout/.test(route), "canonical self-call has a bounded server timeout");
check(/upstreamValue\s*=\s*await upstream\.json\(\)[\s\S]*?finally\s*\{[\s\S]*?clearTimeout\(timeout\)/.test(route), "canonical timeout remains active through response-body consumption");
check(/pins:\s*\[\]/.test(route), "direction preview cannot inject or save house pins");
check(!/\b(INSERT|UPDATE|DELETE)\b/i.test(route), "route contains no business-data mutation statement");
check(!/hour_balance|credit_yam|deduct|saveMeasurement/i.test(route), "route contains no credit or save path");
check(/final_score:\s*finalScore/.test(canonicalRoute), "the canonical route remains the sole scoring formula source");
check(!/pseudoTimeStar|elementScore|starScore|pinProximityScore/.test(route), "mobile BFF does not duplicate scoring formulas");

console.log(`mobile Luo Pan degrees BFF contract PASS · ${checks} checks`);
