import { createHash } from "node:crypto";
import { zoneOffsetMinutes } from "../../birth-timezone";
import {
  resolveEligibleZiweiBirthWallClock,
  resolveUnambiguousBirthWallClock,
} from "./hourly-preview";
import { ZIWEI_HOURLY_LINEAGE, ZIWEI_HOURLY_LINEAGE_MANIFEST } from "./hourly-lineage";

export const ZIWEI_CANONICAL_CONTEXT_VERSION = "ziwei-canonical-context-v1" as const;

export type CanonicalZiweiContextMode = "strict" | "legacy_chart";
export type CanonicalZiweiTimezoneSource = "profile" | "request" | "legacy_bangkok";
export type CanonicalZiweiBlockedReason =
  | "birth_wall_clock_invalid"
  | "birth_timezone_missing"
  | "birth_timezone_invalid"
  | "birth_wall_clock_ambiguous"
  | "birth_calendar_range_unsupported"
  | "birth_late_zi_unsupported"
  | "reference_instant_invalid"
  | "reference_timezone_invalid";

export type CanonicalZiweiContextInput = Readonly<{
  mode: CanonicalZiweiContextMode;
  birthWallClock: string;
  birthTimezone?: string | null;
  birthTimezoneSource?: Exclude<CanonicalZiweiTimezoneSource, "legacy_bangkok">;
  referenceInstant: Date;
  referenceTimezone: string;
  /** Preserve the established chart's use of the birth offset for all reference layers. */
  legacyReferenceUsesBirthOffset?: true;
}>;

export type CanonicalZiweiTimezone = Readonly<{
  timezone: string;
  kind: "fixed_offset" | "iana";
  offsetMinutes?: number;
}>;

type CanonicalZiweiLineage = Readonly<{
  id: typeof ZIWEI_HOURLY_LINEAGE;
  adapterVersion: typeof ZIWEI_HOURLY_LINEAGE_MANIFEST.adapterVersion;
  referenceRuntime: typeof ZIWEI_HOURLY_LINEAGE_MANIFEST.referenceRuntime;
  referenceRuntimeVersion: typeof ZIWEI_HOURLY_LINEAGE_MANIFEST.artifact.version;
}>;

type CanonicalZiweiBirth = Readonly<{
  wallClock: string;
  timezone: string;
  timezoneKind: CanonicalZiweiTimezone["kind"];
  timezoneSource: CanonicalZiweiTimezoneSource;
  instant: string;
  utcOffsetMinutes: number;
}>;

type CanonicalZiweiReference = Readonly<{
  instant: string;
  timezone: string;
  timezoneKind: CanonicalZiweiTimezone["kind"];
  utcOffsetMinutes: number;
}>;

type CanonicalZiweiContextBase = Readonly<{
  contractVersion: typeof ZIWEI_CANONICAL_CONTEXT_VERSION;
  lineage: CanonicalZiweiLineage;
}>;

export type CanonicalZiweiResolvedContext = CanonicalZiweiContextBase & Readonly<{
  status: "resolved";
  birth: CanonicalZiweiBirth;
  reference: CanonicalZiweiReference;
  birthFingerprint: string;
  fingerprint: string;
}>;

export type CanonicalZiweiCompatibilityContext = CanonicalZiweiContextBase & Readonly<{
  status: "compatibility_only";
  reason: "birth_timezone_missing_legacy_bangkok" | "reference_timezone_legacy_birth_offset";
  birth: CanonicalZiweiBirth;
  reference: CanonicalZiweiReference;
  birthFingerprint: string;
  fingerprint: string;
}>;

export type CanonicalZiweiBlockedContext = CanonicalZiweiContextBase & Readonly<{
  status: "blocked";
  reason: CanonicalZiweiBlockedReason;
}>;

export type CanonicalZiweiContextResult =
  | CanonicalZiweiResolvedContext
  | CanonicalZiweiCompatibilityContext
  | CanonicalZiweiBlockedContext;

const LINEAGE: CanonicalZiweiLineage = Object.freeze({
  id: ZIWEI_HOURLY_LINEAGE,
  adapterVersion: ZIWEI_HOURLY_LINEAGE_MANIFEST.adapterVersion,
  referenceRuntime: ZIWEI_HOURLY_LINEAGE_MANIFEST.referenceRuntime,
  referenceRuntimeVersion: ZIWEI_HOURLY_LINEAGE_MANIFEST.artifact.version,
});

const FIXED_OFFSET = /^([+-])(\d{2}):(\d{2})$/u;
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/u;

function blocked(reason: CanonicalZiweiBlockedReason): CanonicalZiweiBlockedContext {
  return Object.freeze({
    status: "blocked",
    reason,
    contractVersion: ZIWEI_CANONICAL_CONTEXT_VERSION,
    lineage: LINEAGE,
  });
}

function validWallClock(value: string): boolean {
  const match = WALL_CLOCK.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31
    || hour > 23 || minute > 59 || second > 59) return false;
  const roundTrip = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return roundTrip.getUTCFullYear() === year && roundTrip.getUTCMonth() + 1 === month
    && roundTrip.getUTCDate() === day && roundTrip.getUTCHours() === hour
    && roundTrip.getUTCMinutes() === minute && roundTrip.getUTCSeconds() === second;
}

export function strictCanonicalZiweiTimezone(value: unknown): CanonicalZiweiTimezone | null {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.length > 64) return null;
  const offset = FIXED_OFFSET.exec(value);
  if (offset) {
    const hours = Number(offset[2]);
    const minutes = Number(offset[3]);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
    const total = (offset[1] === "-" ? -1 : 1) * (hours * 60 + minutes);
    const absolute = Math.abs(total);
    return Object.freeze({
      timezone: `${total < 0 ? "-" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`,
      kind: "fixed_offset",
      offsetMinutes: total,
    });
  }
  if (value !== "UTC" && !value.includes("/")) return null;
  try {
    const timezone = new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
    if (!timezone || (timezone !== "UTC" && !timezone.includes("/"))) return null;
    return Object.freeze({ timezone, kind: "iana" });
  } catch { return null; }
}

function offsetAt(timezone: CanonicalZiweiTimezone, instant: Date): number | null {
  if (timezone.kind === "fixed_offset") return timezone.offsetMinutes ?? null;
  return zoneOffsetMinutes(instant.valueOf(), timezone.timezone);
}

function fixedOffsetTimezone(offsetMinutes: number): CanonicalZiweiTimezone {
  const absolute = Math.abs(offsetMinutes);
  return Object.freeze({
    timezone: `${offsetMinutes < 0 ? "-" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`,
    kind: "fixed_offset",
    offsetMinutes,
  });
}

function fingerprint(
  status: "resolved" | "compatibility_only",
  birth: CanonicalZiweiBirth,
  reference: CanonicalZiweiReference,
): string {
  const facts = JSON.stringify({
    contractVersion: ZIWEI_CANONICAL_CONTEXT_VERSION,
    status,
    birth,
    reference,
    lineage: LINEAGE,
    config: ZIWEI_HOURLY_LINEAGE_MANIFEST.config,
  });
  return createHash("sha256").update(facts).digest("hex");
}

function birthFingerprint(birth: CanonicalZiweiBirth): string {
  const facts = JSON.stringify({
    contractVersion: ZIWEI_CANONICAL_CONTEXT_VERSION,
    birth,
    lineage: LINEAGE,
    natalPolicy: ZIWEI_HOURLY_LINEAGE_MANIFEST.natalInputPolicy,
  });
  return createHash("sha256").update(facts).digest("hex");
}

export function resolveCanonicalZiweiContext(
  input: CanonicalZiweiContextInput,
): CanonicalZiweiContextResult {
  const wallClock = typeof input.birthWallClock === "string" ? input.birthWallClock : "";
  if (!validWallClock(wallClock)) return blocked("birth_wall_clock_invalid");
  if (!(input.referenceInstant instanceof Date) || !Number.isFinite(input.referenceInstant.valueOf())) {
    return blocked("reference_instant_invalid");
  }

  const birthTimezoneMissing = input.birthTimezone === null || input.birthTimezone === undefined || input.birthTimezone === "";
  if (birthTimezoneMissing && input.mode !== "legacy_chart") return blocked("birth_timezone_missing");
  const birthTimezone = birthTimezoneMissing
    ? strictCanonicalZiweiTimezone("+07:00")
    : strictCanonicalZiweiTimezone(input.birthTimezone);
  if (!birthTimezone) return blocked("birth_timezone_invalid");
  const explicitReferenceTimezone = strictCanonicalZiweiTimezone(input.referenceTimezone);
  if (!explicitReferenceTimezone) return blocked("reference_timezone_invalid");

  let birthInstant: Date;
  try {
    birthInstant = resolveUnambiguousBirthWallClock(wallClock, birthTimezone.timezone);
  } catch {
    return blocked("birth_wall_clock_ambiguous");
  }
  const birthOffset = offsetAt(birthTimezone, birthInstant);
  const referenceTimezone = input.mode === "legacy_chart" && input.legacyReferenceUsesBirthOffset
    ? fixedOffsetTimezone(birthOffset ?? 0)
    : explicitReferenceTimezone;
  const referenceOffset = offsetAt(referenceTimezone, input.referenceInstant);
  if (birthOffset === null) return blocked("birth_wall_clock_ambiguous");
  if (referenceOffset === null) return blocked("reference_timezone_invalid");

  const birth = Object.freeze({
    wallClock,
    timezone: birthTimezone.timezone,
    timezoneKind: birthTimezone.kind,
    timezoneSource: birthTimezoneMissing
      ? "legacy_bangkok" as const
      : input.birthTimezoneSource ?? "request",
    instant: birthInstant.toISOString(),
    utcOffsetMinutes: birthOffset,
  });
  const reference = Object.freeze({
    instant: input.referenceInstant.toISOString(),
    timezone: referenceTimezone.timezone,
    timezoneKind: referenceTimezone.kind,
    utcOffsetMinutes: referenceOffset,
  });
  if (birthTimezoneMissing) {
    return Object.freeze({
      status: "compatibility_only",
      reason: "birth_timezone_missing_legacy_bangkok",
      contractVersion: ZIWEI_CANONICAL_CONTEXT_VERSION,
      lineage: LINEAGE,
      birth,
      reference,
      birthFingerprint: birthFingerprint(birth),
      fingerprint: fingerprint("compatibility_only", birth, reference),
    });
  }
  if (input.mode === "legacy_chart" && input.legacyReferenceUsesBirthOffset) {
    return Object.freeze({
      status: "compatibility_only",
      reason: "reference_timezone_legacy_birth_offset",
      contractVersion: ZIWEI_CANONICAL_CONTEXT_VERSION,
      lineage: LINEAGE,
      birth,
      reference,
      birthFingerprint: birthFingerprint(birth),
      fingerprint: fingerprint("compatibility_only", birth, reference),
    });
  }
  return Object.freeze({
    status: "resolved",
    contractVersion: ZIWEI_CANONICAL_CONTEXT_VERSION,
    lineage: LINEAGE,
    birth,
    reference,
    birthFingerprint: birthFingerprint(birth),
    fingerprint: fingerprint("resolved", birth, reference),
  });
}

/**
 * Strict notification/preview context for the supported hourly lineage.
 * The ordinary chart keeps its explicit legacy compatibility domain; every
 * hourly consumer must pass this narrower gate before consent or scheduling.
 */
export function resolveCanonicalZiweiHourlyContext(
  input: CanonicalZiweiContextInput,
): CanonicalZiweiContextResult {
  const wallMatch = typeof input.birthWallClock === "string"
    ? WALL_CLOCK.exec(input.birthWallClock)
    : null;
  if (wallMatch && validWallClock(input.birthWallClock)) {
    const date = `${wallMatch[1]}-${wallMatch[2]}-${wallMatch[3]}`;
    if (date < "1900-01-31" || date > "2100-12-31") {
      return blocked("birth_calendar_range_unsupported");
    }
    if (Number(wallMatch[4]) === 23) return blocked("birth_late_zi_unsupported");
  }
  const context = resolveCanonicalZiweiContext(input);
  if (context.status !== "resolved") return context;
  try {
    const eligibleInstant = resolveEligibleZiweiBirthWallClock(
      context.birth.wallClock,
      context.birth.timezone,
    );
    if (eligibleInstant.toISOString() !== context.birth.instant) {
      return blocked("birth_wall_clock_ambiguous");
    }
    return context;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "ziwei_hourly_calendar_range_unsupported") {
      return blocked("birth_calendar_range_unsupported");
    }
    if (reason === "ziwei_hourly_late_zi_birth_unsupported") {
      return blocked("birth_late_zi_unsupported");
    }
    if (reason === "ziwei_hourly_invalid_birth_timezone") {
      return blocked("birth_timezone_invalid");
    }
    return blocked("birth_wall_clock_ambiguous");
  }
}
