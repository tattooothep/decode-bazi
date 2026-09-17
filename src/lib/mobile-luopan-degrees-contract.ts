import { findMountain24 } from "@/lib/luopan/mountains";

export type MobileLuopanTiming = "era" | "year" | "month" | "day" | "hour";

export type MobileLuopanDegreesInput = {
  inputDegree: number;
  facingDeg: number;
  nearestEngineDegree: number;
  year: number;
  timing: MobileLuopanTiming;
  profileId: string | null;
};

type ParseResult =
  | { ok: true; input: MobileLuopanDegreesInput }
  | { ok: false; error: string };

type ProjectionResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

const ALLOWED_QUERY_KEYS = new Set(["degree", "facing_deg", "year", "timing", "profile_id"]);
const TIMINGS = new Set<MobileLuopanTiming>(["era", "year", "month", "day", "hour"]);
const DEGREE_EPSILON = 1e-7;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): number | null {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function strictDegree(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value < 360 ? value : null;
}

export function normalizeAbsoluteDegree(value: number): number {
  return ((value % 360) + 360) % 360;
}

function angularDistance(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Mobile semantics are deliberately not the legacy browser cursor semantics:
 * - input degree = absolute compass/ring degree, clockwise from north (0=N)
 * - canonical engine degree = nearest 1-degree cursor after removing facing
 * - canonical ring degree = engine degree + facing, normalized to [0, 360)
 */
export function parseMobileLuopanDegreesInput(url: URL, currentYear: number): ParseResult {
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) return { ok: false, error: `unsupported_parameter:${key}` };
    if (url.searchParams.getAll(key).length !== 1) return { ok: false, error: `duplicate_parameter:${key}` };
  }

  const inputDegree = strictDegree(url.searchParams.get("degree"));
  if (inputDegree == null) return { ok: false, error: "degree must be finite and satisfy 0 <= degree < 360" };

  const facingRaw = url.searchParams.get("facing_deg");
  const facingDeg = facingRaw == null ? 0 : strictDegree(facingRaw);
  if (facingDeg == null) return { ok: false, error: "facing_deg must be finite and satisfy 0 <= facing_deg < 360" };

  const yearRaw = url.searchParams.get("year");
  const year = yearRaw == null ? currentYear : Number(yearRaw);
  if (!Number.isInteger(year) || year < 1864 || year > 2100) {
    return { ok: false, error: "year must be an integer from 1864 through 2100" };
  }

  const timingRaw = url.searchParams.get("timing") || "era";
  if (!TIMINGS.has(timingRaw as MobileLuopanTiming)) {
    return { ok: false, error: "timing must be era, year, month, day, or hour" };
  }

  const rawProfileId = url.searchParams.get("profile_id");
  const profileId = rawProfileId == null || rawProfileId.trim() === "" ? null : rawProfileId.trim();
  const nearestEngineDegree = normalizeAbsoluteDegree(Math.round(normalizeAbsoluteDegree(inputDegree - facingDeg)));

  return {
    ok: true,
    input: {
      inputDegree,
      facingDeg,
      nearestEngineDegree,
      year,
      timing: timingRaw as MobileLuopanTiming,
      profileId,
    },
  };
}

function canonicalRingDegree(row: Record<string, unknown>): number | null {
  const ringDegree = finite(row.ring_degree);
  return ringDegree == null ? null : normalizeAbsoluteDegree(ringDegree);
}

function canonicalScoring(row: Record<string, unknown>): Record<string, unknown> | null {
  const scoring = record(row.scoring);
  const score = finite(scoring?.final_score);
  if (
    !scoring
    || score == null
    || score < 0
    || score > 100
    || !Array.isArray(scoring.evidence)
    || scoring.evidence.some((value) => typeof value !== "string" || value.length === 0)
  ) return null;
  return scoring;
}

function canonicalInputMatches(canonicalInput: Record<string, unknown>, input: MobileLuopanDegreesInput): boolean {
  const facingDeg = finite(canonicalInput.facing_deg);
  const year = finite(canonicalInput.year);
  const pinCount = finite(canonicalInput.pin_count);
  const profileId = canonicalInput.profile_id == null ? null : String(canonicalInput.profile_id);
  return facingDeg != null
    && angularDistance(facingDeg, input.facingDeg) <= DEGREE_EPSILON
    && year === input.year
    && String(canonicalInput.timing) === input.timing
    && profileId === input.profileId
    && pinCount === 0;
}

function canonicalMountainMatches(row: Record<string, unknown>, ringDegree: number): boolean {
  const mountain = record(row.mountain24);
  const expected = findMountain24(ringDegree);
  return mountain?.mountain_code === expected.code
    && mountain.code === expected.name
    && row.dir8 === expected.dir8;
}

function resolveSectorSafeFocus(
  rows: Map<number, Record<string, unknown>>,
  input: MobileLuopanDegreesInput,
): { engineDegree: number; ringDegree: number; row: Record<string, unknown>; angularError: number } | null {
  const requestedMountain = findMountain24(input.inputDegree);
  let best: { engineDegree: number; ringDegree: number; row: Record<string, unknown>; angularError: number } | null = null;
  for (const [engineDegree, row] of rows) {
    const mountain = record(row.mountain24);
    if (mountain?.mountain_code !== requestedMountain.code || mountain.code !== requestedMountain.name) continue;
    const ringDegree = canonicalRingDegree(row);
    if (ringDegree == null) continue;
    const error = angularDistance(ringDegree, input.inputDegree);
    const closerToNearestOnTie = best
      && Math.abs(error - best.angularError) <= DEGREE_EPSILON
      && angularDistance(engineDegree, input.nearestEngineDegree) < angularDistance(best.engineDegree, input.nearestEngineDegree);
    if (!best || error < best.angularError - DEGREE_EPSILON || closerToNearestOnTie) {
      best = { engineDegree, ringDegree, row, angularError: error };
    }
  }
  // A one-degree canonical lattice must always have a same-sector point within one degree.
  return best && best.angularError <= 1 + DEGREE_EPSILON ? best : null;
}

function projectRankedEntry(
  value: unknown,
  rows: Map<number, Record<string, unknown>>,
  facingDeg: number,
): Record<string, unknown> | null {
  const entry = record(value);
  const engineDegree = finite(entry?.degree);
  const score = finite(entry?.score);
  if (!entry || engineDegree == null || !Number.isInteger(engineDegree) || engineDegree < 0 || engineDegree >= 360 || score == null) return null;
  const row = rows.get(engineDegree);
  const scoring = row && canonicalScoring(row);
  if (!row || !scoring || finite(scoring.final_score) !== score) return null;
  const rowMountain = record(row.mountain24);
  if (!rowMountain || typeof entry.m24 !== "string" || entry.m24 !== rowMountain.code) return null;
  const ringDegree = canonicalRingDegree(row);
  if (ringDegree == null || angularDistance(ringDegree, normalizeAbsoluteDegree(engineDegree + facingDeg)) > DEGREE_EPSILON) return null;
  return {
    degree: ringDegree,
    engine_degree: engineDegree,
    ring_degree: ringDegree,
    m24: rowMountain.code,
    score,
    scoring,
  };
}

/** Project the canonical 360-row response into a focused, read-only mobile BFF response. */
export function projectMobileLuopanDegreesResponse(
  canonicalValue: unknown,
  input: MobileLuopanDegreesInput,
): ProjectionResult {
  const canonical = record(canonicalValue);
  const canonicalSummary = record(canonical?.summary);
  const canonicalInput = record(canonical?.input);
  const canonicalMeta = record(canonical?.meta);
  if (!canonical || canonical.ok !== true || !canonicalSummary || !canonicalInput || !Array.isArray(canonical.degrees)) {
    return { ok: false, error: "invalid_canonical_response" };
  }
  if (!canonicalInputMatches(canonicalInput, input)) return { ok: false, error: "canonical_input_mismatch" };
  if (canonical.degrees.length !== 360) return { ok: false, error: "canonical_degree_lattice_invalid" };

  const rows = new Map<number, Record<string, unknown>>();
  for (const value of canonical.degrees) {
    const row = record(value);
    const degree = finite(row?.degree);
    const ringDegree = row ? canonicalRingDegree(row) : null;
    if (
      !row
      || degree == null
      || !Number.isInteger(degree)
      || degree < 0
      || degree >= 360
      || ringDegree == null
      || angularDistance(ringDegree, normalizeAbsoluteDegree(degree + input.facingDeg)) > DEGREE_EPSILON
      || !canonicalMountainMatches(row, ringDegree)
    ) return { ok: false, error: "canonical_degree_lattice_invalid" };
    rows.set(degree, row);
  }
  if (rows.size !== 360) return { ok: false, error: "canonical_degree_lattice_invalid" };
  const resolvedFocus = resolveSectorSafeFocus(rows, input);
  const scoring = resolvedFocus && canonicalScoring(resolvedFocus.row);
  if (!resolvedFocus || !scoring) return { ok: false, error: "canonical_focus_missing" };

  const rawTopGood = Array.isArray(canonicalSummary.top_good_degrees)
    ? canonicalSummary.top_good_degrees.slice(0, 5)
    : [];
  // The browser intentionally uses the final five entries from the canonical bottom-12 list.
  const rawTopBad = Array.isArray(canonicalSummary.top_bad_degrees)
    ? canonicalSummary.top_bad_degrees.slice(-5)
    : [];
  const topGood = rawTopGood.map((value) => projectRankedEntry(value, rows, input.facingDeg));
  const topBad = rawTopBad.map((value) => projectRankedEntry(value, rows, input.facingDeg));
  if (topGood.length !== 5 || topBad.length !== 5 || topGood.some((value) => !value) || topBad.some((value) => !value)) {
    return { ok: false, error: "canonical_rankings_missing" };
  }
  const rankedEngineDegrees = [...topGood, ...topBad].map((value) => finite(value?.engine_degree));
  if (rankedEngineDegrees.some((value) => value == null) || new Set(rankedEngineDegrees).size !== rankedEngineDegrees.length) {
    return { ok: false, error: "canonical_rankings_invalid" };
  }

  const rawFocus = resolvedFocus.row;
  const rawEngineDegree = resolvedFocus.engineDegree;
  const ringDegree = resolvedFocus.ringDegree;
  const angularError = Number(resolvedFocus.angularError.toFixed(7));
  const requestedMountain = findMountain24(input.inputDegree);
  const focus = {
    ...rawFocus,
    input_degree: input.inputDegree,
    degree: ringDegree,
    engine_degree: rawEngineDegree,
    ring_degree: ringDegree,
    scoring,
  };

  return {
    ok: true,
    value: {
      ok: true,
      contract_version: "mobile-luopan-degrees.v1",
      source: "/api/luopan/degrees",
      read_only: true,
      input: {
        input_degree: input.inputDegree,
        facing_deg: input.facingDeg,
        nearest_engine_degree: input.nearestEngineDegree,
        engine_degree: rawEngineDegree,
        resolved_ring_degree: ringDegree,
        angular_error_deg: angularError,
        boundary_adjusted: rawEngineDegree !== input.nearestEngineDegree,
        requested_mountain: { name: requestedMountain.name, code: requestedMountain.code, dir8: requestedMountain.dir8 },
        year: input.year,
        timing: input.timing,
        profile_id: input.profileId,
      },
      focus,
      top_good: topGood,
      top_bad: topBad,
      summary: {
        schema_version: canonicalSummary.schema_version ?? null,
        note: canonicalSummary.note ?? null,
        profile_elements: canonicalSummary.profile_elements ?? null,
        classical: canonicalSummary.classical ?? null,
        top_good_degrees: topGood,
        top_bad_degrees: topBad,
      },
      provenance: {
        engine_schema_version: canonicalSummary.schema_version ?? null,
        engine_note: canonicalSummary.note ?? null,
        canonical_input: canonicalInput,
        canonical_meta: canonicalMeta,
        focus_scoring_evidence: scoring.evidence,
        degree_semantics: "absolute compass degrees clockwise from north (0=N)",
        degree_transform: "nearest=normalize(round(input_degree-facing_deg)); choose nearest canonical row that preserves the requested 24-Mountain sector; ring_degree=normalize(engine_degree+facing_deg)",
        resolution_degrees: 1,
        requested_sector_preserved: true,
      },
    },
  };
}
