import { zoneOffsetMinutes } from "../birth-timezone";
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
  modelVersion: "astronomy-engine-2.1.19-geocentric-apparent-v1";
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

function formatter(timezone: string): Intl.DateTimeFormat {
  try {
    const value = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    value.format(new Date(0));
    return value;
  } catch {
    throw new TypeError("astronomy_fact_timezone_invalid");
  }
}

function civilAt(instant: Date, timezone: string): Civil {
  const parts = Object.fromEntries(
    formatter(timezone).formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return Object.freeze({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
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
    const offset = zoneOffsetMinutes(naive + deltaHours * 3_600_000, timezone);
    if (offset !== null) offsets.add(offset);
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
  const offset = zoneOffsetMinutes(instant.valueOf(), timezone);
  if (offset === null) throw new TypeError("astronomy_fact_timezone_invalid");
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
  formatter(timezone);
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

function physicalBody(key: PlanetKey, instant: Date): AstronomyBodyFact {
  const illumination = illuminationOf(key, instant);
  const longitudeNow = eclipticLon(key, instant);
  const longitudeYesterday = eclipticLon(key, new Date(instant.valueOf() - 86_400_000));
  let dailyMotion = longitudeNow - longitudeYesterday;
  if (dailyMotion > 180) dailyMotion -= 360;
  if (dailyMotion < -180) dailyMotion += 360;
  return Object.freeze({
    key,
    kind: "physical_body",
    longitudeTropicalDeg: fixed(longitudeNow),
    eclipticLatitudeDeg: fixed(eclipticLat(key, instant)),
    retrograde: key === "Sun" || key === "Moon" ? false : dailyMotion < 0,
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
    modelVersion: "astronomy-engine-2.1.19-geocentric-apparent-v1",
    physicalBodies,
    points,
    prediction: false,
    judgment: null,
  });
}
