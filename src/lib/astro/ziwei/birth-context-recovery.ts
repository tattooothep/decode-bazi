import crypto from "node:crypto";
import https from "node:https";

export const ZIWEI_BIRTH_RECOVERY_CONTRACT = "ziwei-birth-context-recovery.v1" as const;

export type ZiweiBirthTimezoneCandidate = Readonly<{
  displayName: string;
  placeId: string;
  latitude: number;
  longitude: number;
  timezone: string;
  provider: "google_geocoding_timezone_v1";
  confidence: "candidate_requires_user_confirmation";
}>;

export type RecoveryConfirmationBody = Readonly<{
  profileId: string;
  confirmationToken: string;
  confirm: true;
  acceptChartChange: boolean;
}>;

type CandidateLookupInput = Readonly<{
  locationName: string;
  birthWallClock: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}>;

type CoordinateTimezoneLookupInput = Readonly<{
  latitude: number;
  longitude: number;
  birthWallClock: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}>;

type GoogleGeocodeResponse = {
  status?: unknown;
  results?: Array<{
    place_id?: unknown;
    formatted_address?: unknown;
    partial_match?: unknown;
    geometry?: { location?: { lat?: unknown; lng?: unknown } };
  }>;
};

type GoogleTimezoneResponse = {
  status?: unknown;
  timeZoneId?: unknown;
};

type GoogleFindPlaceResponse = {
  status?: unknown;
  candidates?: Array<{
    place_id?: unknown;
    formatted_address?: unknown;
    name?: unknown;
    geometry?: { location?: { lat?: unknown; lng?: unknown } };
  }>;
};

/** Google validates the allowlisted public IPv4. Node fetch may prefer IPv6,
 * which Google correctly rejects because it is outside that restriction. */
const googleIpv4Fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = new URL(String(input));
  if (url.protocol !== "https:" || url.hostname !== "maps.googleapis.com") {
    throw new TypeError("recovery_provider_origin_invalid");
  }
  return await new Promise<Response>((resolve, reject) => {
    const request = https.request(url, {
      family: 4,
      method: "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      timeout: 8_000,
    }, (upstream) => {
      const chunks: Buffer[] = [];
      let size = 0;
      upstream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1_000_000) {
          request.destroy(new Error("recovery_provider_response_too_large"));
          return;
        }
        chunks.push(chunk);
      });
      upstream.on("end", () => resolve(new Response(Buffer.concat(chunks), {
        status: upstream.statusCode || 502,
        headers: upstream.headers as Record<string, string>,
      })));
    });
    const abort = () => request.destroy(new DOMException("Aborted", "AbortError"));
    init?.signal?.addEventListener("abort", abort, { once: true });
    request.on("close", () => init?.signal?.removeEventListener("abort", abort));
    request.on("error", reject);
    request.end();
  });
}) as typeof fetch;

function strictBirthWallTimestamp(wall: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/u.exec(wall);
  if (!match) throw new TypeError("recovery_birth_wall_invalid");
  const parts = match.slice(1).map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const milliseconds = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(milliseconds);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day || check.getUTCHours() !== hour
    || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) {
    throw new TypeError("recovery_birth_wall_invalid");
  }
  return Math.floor(milliseconds / 1000);
}

function strictIanaZone(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate || candidate.length > 64 || (candidate !== "UTC" && !candidate.includes("/"))) {
    throw new TypeError("recovery_timezone_invalid");
  }
  try {
    const canonical = new Intl.DateTimeFormat("en-US", { timeZone: candidate })
      .resolvedOptions().timeZone;
    if (!canonical || (canonical !== "UTC" && !canonical.includes("/"))) {
      throw new TypeError("recovery_timezone_invalid");
    }
    return canonical;
  } catch {
    throw new TypeError("recovery_timezone_invalid");
  }
}

async function readGoogleJson<T>(
  url: URL,
  fetchImpl: typeof fetch,
  unavailableCode: string,
): Promise<T> {
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(unavailableCode);
  return await response.json() as T;
}

export async function lookupZiweiBirthTimezoneAtCoordinates(
  input: CoordinateTimezoneLookupInput,
): Promise<string> {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const apiKey = String(input.apiKey || "").trim();
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new TypeError("recovery_candidate_invalid");
  }
  if (!apiKey) throw new Error("recovery_provider_unavailable");
  const timestamp = strictBirthWallTimestamp(input.birthWallClock);
  const timezoneUrl = new URL("https://maps.googleapis.com/maps/api/timezone/json");
  timezoneUrl.searchParams.set("location", `${latitude},${longitude}`);
  timezoneUrl.searchParams.set("timestamp", String(timestamp));
  timezoneUrl.searchParams.set("key", apiKey);
  const timezoneResult = await readGoogleJson<GoogleTimezoneResponse>(
    timezoneUrl,
    input.fetchImpl || googleIpv4Fetch,
    "recovery_timezone_provider_unavailable",
  );
  if (timezoneResult.status !== "OK") {
    throw new Error(`recovery_timezone_provider_unavailable:${String(timezoneResult.status || "unknown").replace(/[^A-Z_]/gu, "")}`);
  }
  return strictIanaZone(timezoneResult.timeZoneId);
}

/**
 * Produces a candidate only. It never turns provider output into a birth fact;
 * the authenticated owner must confirm it through the recovery endpoint.
 */
export async function lookupZiweiBirthTimezoneCandidate(
  input: CandidateLookupInput,
): Promise<ZiweiBirthTimezoneCandidate> {
  const locationName = String(input.locationName || "").trim();
  const apiKey = String(input.apiKey || "").trim();
  if (!locationName) throw new TypeError("recovery_location_missing");
  if (locationName.length > 160) throw new TypeError("recovery_location_invalid");
  if (!apiKey) throw new Error("recovery_provider_unavailable");
  const timestamp = strictBirthWallTimestamp(input.birthWallClock);
  const fetchImpl = input.fetchImpl || googleIpv4Fetch;

  const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  geocodeUrl.searchParams.set("address", locationName);
  geocodeUrl.searchParams.set("key", apiKey);
  const geocode = await readGoogleJson<GoogleGeocodeResponse>(
    geocodeUrl,
    fetchImpl,
    "recovery_geocode_provider_unavailable",
  );
  let exact = Array.isArray(geocode.results)
    ? geocode.results.filter((item) => item && item.partial_match !== true)
    : [];
  if (geocode.status !== "OK") {
    if (geocode.status === "ZERO_RESULTS") throw new Error("recovery_location_not_found");
    // Some deployments intentionally authorize Places but not Geocoding on
    // the server key. Find Place is equivalent evidence and remains a
    // candidate requiring owner confirmation.
    const placesUrl = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
    placesUrl.searchParams.set("input", locationName);
    placesUrl.searchParams.set("inputtype", "textquery");
    placesUrl.searchParams.set("fields", "place_id,formatted_address,name,geometry");
    placesUrl.searchParams.set("key", apiKey);
    const places = await readGoogleJson<GoogleFindPlaceResponse>(
      placesUrl,
      fetchImpl,
      "recovery_places_provider_unavailable",
    );
    if (places.status !== "OK" || !Array.isArray(places.candidates)) {
      throw new Error(places.status === "ZERO_RESULTS"
        ? "recovery_location_not_found"
        : `recovery_places_provider_unavailable:${String(places.status || "unknown").replace(/[^A-Z_]/gu, "")}`);
    }
    exact = places.candidates.map((item) => ({
      ...item,
      formatted_address: item.formatted_address || item.name,
      partial_match: false,
    }));
  }
  if (exact.length !== 1) throw new TypeError("recovery_location_ambiguous");
  const selected = exact[0];
  const latitude = Number(selected.geometry?.location?.lat);
  const longitude = Number(selected.geometry?.location?.lng);
  const displayName = typeof selected.formatted_address === "string"
    ? selected.formatted_address.trim()
    : "";
  const placeId = typeof selected.place_id === "string" ? selected.place_id.trim() : "";
  if (!displayName || !placeId || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new TypeError("recovery_candidate_invalid");
  }

  const timezone = await lookupZiweiBirthTimezoneAtCoordinates({
    latitude,
    longitude,
    birthWallClock: input.birthWallClock,
    apiKey,
    fetchImpl,
  });

  return Object.freeze({
    displayName,
    placeId,
    latitude,
    longitude,
    timezone,
    provider: "google_geocoding_timezone_v1",
    confidence: "candidate_requires_user_confirmation",
  });
}

export function recoveryCandidateDigest(candidate: ZiweiBirthTimezoneCandidate): string {
  const canonical = JSON.stringify({
    confidence: candidate.confidence,
    displayName: candidate.displayName,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    placeId: candidate.placeId,
    provider: candidate.provider,
    timezone: candidate.timezone,
  });
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function recoveryTokenDigest(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function newRecoveryToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function exactRecoveryConfirmationBody(value: unknown): RecoveryConfirmationBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const allowed = new Set(["profileId", "confirmationToken", "confirm", "acceptChartChange"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return null;
  const profileId = typeof body.profileId === "string" ? body.profileId.trim() : "";
  const confirmationToken = typeof body.confirmationToken === "string"
    ? body.confirmationToken.trim()
    : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(profileId)
    || confirmationToken.length < 3 || confirmationToken.length > 512 || body.confirm !== true
    || (body.acceptChartChange !== undefined && typeof body.acceptChartChange !== "boolean")) {
    return null;
  }
  return Object.freeze({
    profileId,
    confirmationToken,
    confirm: true,
    acceptChartChange: body.acceptChartChange === true,
  });
}
