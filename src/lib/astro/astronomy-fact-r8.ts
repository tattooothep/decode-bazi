import moment from "moment-timezone";
import {
  eclipticLat,
  eclipticLon,
  illuminationOf,
  lunarApogee,
  meanNode,
  type PlanetKey,
} from "../tianxing/ephemeris";

const PHYSICAL_BODIES = Object.freeze([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
] as const satisfies readonly PlanetKey[]);

export const ASTRONOMY_FACT_TZDB_VERSION = "2026c" as const;
export const ASTRONOMY_FACT_MODEL_VERSION =
  "astronomy-engine-2.1.19-tzdb-2026c-geocentric-apparent-v2" as const;
const MOTION_HALF_WINDOW_MS = 60 * 60 * 1_000;

type Civil = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}>;

export type CivilTwoHourBoundary = Readonly<{
  instant: Date;
  localBoundary: string;
  localDate: string;
  offsetMinutes: number;
  fold: "single" | "earlier";
  unitId: string;
}>;

export type AstronomyBodyFact = Readonly<{
  key: PlanetKey;
  kind: "physical_body";
  longitudeTropicalDeg: number;
  eclipticLatitudeDeg: number;
  retrograde: boolean;
  apparentMagnitude?: number;
  illuminatedFraction?: number;
  ringTiltDeg?: number;
}>;

export type AstronomyPointFact = Readonly<{
  key: "Rahu" | "Ketu" | "Yuebo";
  kind: "calculated_point";
  definition: "mean_ascending_lunar_node" | "mean_descending_lunar_node" | "mean_lunar_apogee";
  longitudeTropicalDeg: number;
}>;

export type AstronomyFactSnapshot = Readonly<{
  schema: 1;
  category: "astronomy_fact";
  mode: "civil_two_hour";
  instant: string;
  localBoundary: string;
  timezone: string;
  boundary: Readonly<{
    localDate: string;
    utcInstant: string;
    utcOffsetMinutes: number;
    fold: "single" | "earlier";
    unitId: string;
  }>;
  frame: "geocentric";
  modelVersion: typeof ASTRONOMY_FACT_MODEL_VERSION;
  physicalBodies: readonly AstronomyBodyFact[];
  points: readonly AstronomyPointFact[];
  prediction: false;
  judgment: null;
}>;

export type AstronomyFactInput = Readonly<{
  instant: Date;
  timezone: string;
  observation: Readonly<{
    frame: "geocentric" | "topocentric";
    location: Readonly<{ lat: number; lng: number }> | null;
  }>;
}>;

function normalizedLongitude(value: number): number {
  return ((value % 360) + 360) % 360;
}

function fixed(value: number, digits = 6): number {
  if (!Number.isFinite(value)) throw new TypeError("astronomy_fact_position_invalid");
  return Number(value.toFixed(digits));
}

function timezoneZone(timezone: string): moment.MomentZone {
  if (moment.tz.dataVersion !== ASTRONOMY_FACT_TZDB_VERSION) {
    throw new Error("astronomy_fact_tzdb_mismatch");
  }
  const zone = typeof timezone === "string" ? moment.tz.zone(timezone.trim()) : null;
  if (!zone) throw new TypeError("astronomy_fact_timezone_invalid");
  return zone;
}

function zoneOffsetMinutesAt(utcMilliseconds: number, timezone: string): number {
  return -timezoneZone(timezone).utcOffset(utcMilliseconds);
}

function civilAt(instant: Date, timezone: string): Civil {
  const shifted = new Date(instant.valueOf() + zoneOffsetMinutesAt(instant.valueOf(), timezone) * 60_000);
  return Object.freeze({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  });
}

function sameCivil(left: Civil, right: Civil): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
    && left.second === right.second;
}

function civilValue(civil: Civil): number {
  return Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, civil.second);
}

function wallCandidates(civil: Civil, timezone: string): readonly Date[] {
  const naive = civilValue(civil);
  const offsets = new Set<number>();
  for (const deltaHours of [-36, -24, -12, 0, 12, 24, 36]) {
    offsets.add(zoneOffsetMinutesAt(naive + deltaHours * 3_600_000, timezone));
  }
  const matches = [...offsets]
    .map((offset) => new Date(naive - offset * 60_000))
    .filter((candidate) => sameCivil(civilAt(candidate, timezone), civil));
  return Object.freeze([...new Map(matches.map((candidate) => [candidate.valueOf(), candidate])).values()]
    .sort((left, right) => left.valueOf() - right.valueOf()));
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function offsetLabel(offsetMinutes: number): string {
  const absolute = Math.abs(offsetMinutes);
  return `${offsetMinutes < 0 ? "-" : "+"}${twoDigits(Math.floor(absolute / 60))}:${twoDigits(absolute % 60)}`;
}

function boundaryAt(instant: Date, timezone: string): CivilTwoHourBoundary {
  if (!(instant instanceof Date) || !Number.isFinite(instant.valueOf())) {
    throw new TypeError("astronomy_fact_instant_invalid");
  }
  const offset = zoneOffsetMinutesAt(instant.valueOf(), timezone);
  const civil = civilAt(instant, timezone);
  if (instant.getUTCMilliseconds() !== 0 || civil.minute !== 0 || civil.second !== 0 || civil.hour % 2 !== 0) {
    throw new TypeError("astronomy_fact_not_boundary");
  }
  const candidates = wallCandidates(civil, timezone);
  if (candidates.length === 0 || candidates[0].valueOf() !== instant.valueOf()) {
    throw new TypeError("astronomy_fact_repeated_boundary");
  }
  const localDate = `${civil.year}-${twoDigits(civil.month)}-${twoDigits(civil.day)}`;
  const localClock = `${localDate}T${twoDigits(civil.hour)}:00:00`;
  const fold = candidates.length > 1 ? "earlier" : "single";
  const localBoundary = `${localClock}${offsetLabel(offset)}`;
  const unitId = `civil_two_hour|${localDate}|${instant.toISOString()}|offset=${offset}|fold=${fold}`;
  return Object.freeze({
    instant: new Date(instant.valueOf()),
    localBoundary,
    localDate,
    offsetMinutes: offset,
    fold,
    unitId,
  });
}

export function nextCivilTwoHourBoundary(timezone: string, after: Date): CivilTwoHourBoundary | null {
  if (!(after instanceof Date) || !Number.isFinite(after.valueOf())) {
    throw new TypeError("astronomy_fact_instant_invalid");
  }
  timezoneZone(timezone);
  const firstMinute = Math.floor(after.valueOf() / 60_000) * 60_000 + 60_000;
  const limit = firstMinute + 36 * 3_600_000;
  for (let value = firstMinute; value <= limit; value += 60_000) {
    const candidate = new Date(value);
    const civil = civilAt(candidate, timezone);
    if (civil.minute !== 0 || civil.second !== 0 || civil.hour % 2 !== 0) continue;
    try {
      return boundaryAt(candidate, timezone);
    } catch (error) {
      if (error instanceof TypeError && error.message === "astronomy_fact_repeated_boundary") continue;
      throw error;
    }
  }
  return null;
}

function signedAngularDifference(later: number, earlier: number): number {
  let difference = normalizedLongitude(later) - normalizedLongitude(earlier);
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return difference;
}

export function apparentLongitudeSpeedDegPerDay(key: PlanetKey, instant: Date): number {
  const before = eclipticLon(key, new Date(instant.valueOf() - MOTION_HALF_WINDOW_MS));
  const after = eclipticLon(key, new Date(instant.valueOf() + MOTION_HALF_WINDOW_MS));
  return signedAngularDifference(after, before) * (86_400_000 / (2 * MOTION_HALF_WINDOW_MS));
}

function physicalBody(key: PlanetKey, instant: Date): AstronomyBodyFact {
  const illumination = illuminationOf(key, instant);
  const longitudeNow = eclipticLon(key, instant);
  const instantaneousMotion = apparentLongitudeSpeedDegPerDay(key, instant);
  return Object.freeze({
    key,
    kind: "physical_body",
    longitudeTropicalDeg: fixed(longitudeNow),
    eclipticLatitudeDeg: fixed(eclipticLat(key, instant)),
    retrograde: key === "Sun" || key === "Moon" ? false : instantaneousMotion < 0,
    ...(illumination.mag === undefined ? {} : { apparentMagnitude: illumination.mag }),
    ...(illumination.phaseFrac === undefined ? {} : { illuminatedFraction: illumination.phaseFrac }),
    ...(illumination.ringTilt === undefined ? {} : { ringTiltDeg: illumination.ringTilt }),
  });
}

export function buildCivilSkySnapshot(input: AstronomyFactInput): AstronomyFactSnapshot {
  if (input?.observation?.frame !== "geocentric" || input.observation.location !== null) {
    throw new TypeError("astronomy_fact_frame_unavailable");
  }
  const boundary = boundaryAt(input.instant, input.timezone);
  const ascendingNode = meanNode(input.instant);
  const physicalBodies = Object.freeze(PHYSICAL_BODIES.map((key) => physicalBody(key, input.instant)));
  const points = Object.freeze([
    Object.freeze({
      key: "Rahu" as const,
      kind: "calculated_point" as const,
      definition: "mean_ascending_lunar_node" as const,
      longitudeTropicalDeg: fixed(ascendingNode),
    }),
    Object.freeze({
      key: "Ketu" as const,
      kind: "calculated_point" as const,
      definition: "mean_descending_lunar_node" as const,
      longitudeTropicalDeg: fixed(normalizedLongitude(ascendingNode + 180)),
    }),
    Object.freeze({
      key: "Yuebo" as const,
      kind: "calculated_point" as const,
      definition: "mean_lunar_apogee" as const,
      longitudeTropicalDeg: fixed(lunarApogee(input.instant)),
    }),
  ] satisfies readonly AstronomyPointFact[]);

  return Object.freeze({
    schema: 1,
    category: "astronomy_fact",
    mode: "civil_two_hour",
    instant: input.instant.toISOString(),
    localBoundary: boundary.localBoundary,
    timezone: input.timezone,
    boundary: Object.freeze({
      localDate: boundary.localDate,
      utcInstant: input.instant.toISOString(),
      utcOffsetMinutes: boundary.offsetMinutes,
      fold: boundary.fold,
      unitId: boundary.unitId,
    }),
    frame: "geocentric",
    modelVersion: ASTRONOMY_FACT_MODEL_VERSION,
    physicalBodies,
    points,
    prediction: false,
    judgment: null,
  });
}
