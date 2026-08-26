import { parseTz, zoneOffsetMinutes } from "../../birth-timezone";
import { ziweiChart, type Gender, type ZiweiChart } from "./engine";
import { ZIWEI_HOURLY_LINEAGE, ZIWEI_HOURLY_LINEAGE_MANIFEST } from "./hourly-lineage";

export { ZIWEI_HOURLY_LINEAGE, ZIWEI_HOURLY_LINEAGE_MANIFEST };
export const ZIWEI_HOURLY_CALCULATION_VERSION = "ziwei-hourly-preview-v1" as const;
export const ZIWEI_HOURLY_NOTIFICATION_CALCULATION_VERSION = "ziwei-hourly-notification-v1" as const;

export type ZiweiHourlyPreviewInput = Readonly<{
  birthInstant: Date;
  birthTimezone: string;
  birthLocation: Readonly<{ lat: number; lng: number }> | null;
  gender: Gender;
  referenceInstant: Date;
  referenceTimezone: string;
}>;

type NonNullLayer<T> = Exclude<T, null | undefined>;

export type ZiweiHourlyPreview = Readonly<{
  discipline: "ziwei";
  capability: "preview_only";
  schema: 1;
  calculationVersion: typeof ZIWEI_HOURLY_CALCULATION_VERSION;
  lineage: typeof ZIWEI_HOURLY_LINEAGE;
  decisionSupported: false;
  productionEligible: false;
  limitations: readonly [
    "named_software_lineage_not_classical_consensus",
    "preview_only_no_notification",
    "requires_production_occurrence_and_delivery_review",
  ];
  reference: Readonly<{
    instant: string;
    timezone: string;
    localDate: string;
    calculationDate: string;
    timeIndex: NonNullLayer<ZiweiChart["liuShi"]>["timeIndex"];
    effectiveTimeIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
    boundaryPolicy: "forward_zi";
    validFrom: string;
    validUntil: string;
    windowKey: string;
  }>;
  layers: Readonly<{
    liuNian: NonNullLayer<ZiweiChart["liuNian"]>;
    liuYue: NonNullLayer<ZiweiChart["liuYue"]>;
    liuRi: NonNullLayer<ZiweiChart["liuRi"]>;
    liuShi: NonNullLayer<ZiweiChart["liuShi"]>;
  }>;
}>;

export type ZiweiHourlyNotificationFacts = Readonly<{
  discipline: "ziwei";
  capability: "notification_facts";
  schema: 1;
  calculationVersion: typeof ZIWEI_HOURLY_NOTIFICATION_CALCULATION_VERSION;
  lineage: typeof ZIWEI_HOURLY_LINEAGE;
  decisionSupported: false;
  productionEligible: true;
  limitations: readonly [
    "named_software_lineage_not_classical_consensus",
    "structural_chart_facts_no_auspicious_verdict",
    "self_profile_only",
  ];
  reference: ZiweiHourlyPreview["reference"];
  layers: ZiweiHourlyPreview["layers"];
}>;

function canonicalIanaTimezone(timezone: string, instant: Date, errorCode: string): string {
  const value = String(timezone || "").trim();
  if (!value) throw new TypeError(errorCode);
  try {
    const canonical = new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
    if (!canonical || (canonical !== "UTC" && !canonical.includes("/"))
      || zoneOffsetMinutes(instant.getTime(), canonical) === null) throw new TypeError(errorCode);
    return canonical;
  } catch { throw new TypeError(errorCode); }
}

function strictIanaOffsetHours(timezone: string, instant: Date, errorCode: string): number {
  const offset = zoneOffsetMinutes(instant.getTime(), timezone);
  if (offset === null) throw new TypeError(errorCode);
  return offset / 60;
}

function assertInstant(value: Date, errorCode: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new TypeError(errorCode);
}

function engineLocation(location: ZiweiHourlyPreviewInput["birthLocation"]): Readonly<{ lat: number; lng: number }> {
  if (location === null) return Object.freeze({ lat: 0, lng: 0 });
  if (!Number.isFinite(location?.lat) || location.lat < -90 || location.lat > 90
    || !Number.isFinite(location?.lng) || location.lng < -180 || location.lng > 180) {
    throw new TypeError("ziwei_hourly_invalid_birth_location");
  }
  return location;
}

type Civil = { y: number; m: number; d: number; h: number; mi: number; s: number };

function civilAt(instant: Date, timezone: string): Civil {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { y: value.year, m: value.month, d: value.day, h: value.hour, mi: value.minute, s: value.second };
}

function civilAtOffset(instant: Date, offsetMinutes: number): Civil {
  const value = new Date(instant.getTime() + offsetMinutes * 60_000);
  return {
    y: value.getUTCFullYear(), m: value.getUTCMonth() + 1, d: value.getUTCDate(),
    h: value.getUTCHours(), mi: value.getUTCMinutes(), s: value.getUTCSeconds(),
  };
}

function shiftCivilDate(civil: Civil, days: number): Civil {
  const value = new Date(Date.UTC(civil.y, civil.m - 1, civil.d + days, civil.h, civil.mi, civil.s));
  return { y: value.getUTCFullYear(), m: value.getUTCMonth() + 1, d: value.getUTCDate(), h: value.getUTCHours(), mi: value.getUTCMinutes(), s: value.getUTCSeconds() };
}

function sameCivil(a: Civil, b: Civil): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d && a.h === b.h && a.mi === b.mi && a.s === b.s;
}

function civilValue(civil: Civil): number {
  return Date.UTC(civil.y, civil.m - 1, civil.d, civil.h, civil.mi, civil.s);
}

function wallCandidates(civil: Civil, timezone: string): Date[] {
  const naive = civilValue(civil);
  const offsets = new Set<number>();
  for (const deltaHours of [-36, -24, -12, 0, 12, 24, 36]) {
    const offset = zoneOffsetMinutes(naive + deltaHours * 3_600_000, timezone);
    if (offset !== null) offsets.add(offset);
  }
  return [...offsets].map((offset) => new Date(naive - offset * 60_000));
}

/** Resolve one IANA wall clock. DST gaps and folds deliberately fail closed. */
function unambiguousWallInstant(civil: Civil, timezone: string): Date {
  const matches = wallCandidates(civil, timezone)
    .filter((instant) => sameCivil(civilAt(instant, timezone), civil));
  const unique = [...new Map(matches.map((instant) => [instant.getTime(), instant])).values()];
  if (unique.length !== 1) throw new TypeError("ziwei_hourly_ambiguous_reference_boundary");
  return unique[0];
}

/**
 * Map one civil shichen boundary to the timeline. A fold chooses the earliest
 * exact instant, so both repeated wall-clock runs stay in one interval. A gap
 * has no exact instant, so it advances to the transition instant where the
 * first realized civil time after the gap begins.
 */
function civilBoundaryInstant(civil: Civil, timezone: string): Date {
  const candidates = wallCandidates(civil, timezone);
  const exact = candidates
    .filter((instant) => sameCivil(civilAt(instant, timezone), civil))
    .sort((a, b) => a.getTime() - b.getTime());
  if (exact.length > 0) return exact[0];

  const target = civilValue(civil);
  const before = candidates
    .filter((instant) => civilValue(civilAt(instant, timezone)) < target)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const after = candidates
    .filter((instant) => civilValue(civilAt(instant, timezone)) > target)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (!before || !after || before >= after) throw new TypeError("ziwei_hourly_ambiguous_reference_boundary");

  let lower = before.getTime();
  let upper = after.getTime();
  while (upper - lower > 1) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (civilValue(civilAt(new Date(middle), timezone)) < target) lower = middle;
    else upper = middle;
  }
  return new Date(upper);
}

function parseBirthWallClock(wall: string): Civil {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/u.exec(String(wall || ""));
  if (!match) throw new TypeError("ziwei_hourly_invalid_birth_wall_clock");
  const civil: Civil = {
    y: Number(match[1]), m: Number(match[2]), d: Number(match[3]),
    h: Number(match[4]), mi: Number(match[5]), s: Number(match[6]),
  };
  if (civil.y < 1 || civil.y > 9999 || civil.m < 1 || civil.m > 12 || civil.d < 1 || civil.d > 31
    || civil.h < 0 || civil.h > 23 || civil.mi < 0 || civil.mi > 59 || civil.s < 0 || civil.s > 59) {
    throw new TypeError("ziwei_hourly_invalid_birth_wall_clock");
  }
  const roundTrip = new Date(Date.UTC(civil.y, civil.m - 1, civil.d, civil.h, civil.mi, civil.s));
  if (roundTrip.getUTCFullYear() !== civil.y || roundTrip.getUTCMonth() + 1 !== civil.m || roundTrip.getUTCDate() !== civil.d) {
    throw new TypeError("ziwei_hourly_invalid_birth_wall_clock");
  }
  return civil;
}

export function resolveUnambiguousIanaWallClock(wall: string, timezone: string): Date {
  const civil = parseBirthWallClock(wall);
  const value = String(timezone || "").trim();
  if (!value || (value !== "UTC" && !value.includes("/"))) throw new TypeError("ziwei_hourly_invalid_birth_timezone");
  try {
    return unambiguousWallInstant(civil, value);
  } catch {
    throw new TypeError("ziwei_hourly_ambiguous_birth_wall_clock");
  }
}

/** Resolve a stored birth wall clock from either an IANA zone or an explicit fixed offset. */
export function resolveUnambiguousBirthWallClock(wall: string, timezone: string): Date {
  const civil = parseBirthWallClock(wall);
  const parsed = parseTz(String(timezone || ""));
  if (!parsed) throw new TypeError("ziwei_hourly_invalid_birth_timezone");
  if (parsed.kind === "zone") return resolveUnambiguousIanaWallClock(wall, parsed.label);
  const naive = Date.UTC(civil.y, civil.m - 1, civil.d, civil.h, civil.mi, civil.s);
  return new Date(naive - (parsed.offsetMin || 0) * 60_000);
}

/** Natal domain supported by the locked hourly Ziwei lineage. */
export function resolveEligibleZiweiBirthWallClock(wall: string, timezone: string): Date {
  const civil = parseBirthWallClock(wall);
  const timezoneValue = String(timezone || "").trim();
  if (!/^[+-]\d{2}:\d{2}$/u.test(timezoneValue)
    && timezoneValue !== "UTC" && !timezoneValue.includes("/")) {
    throw new TypeError("ziwei_hourly_invalid_birth_timezone");
  }
  const date = `${civil.y}-${String(civil.m).padStart(2, "0")}-${String(civil.d).padStart(2, "0")}`;
  if (date < "1900-01-31" || date > "2100-12-31") {
    throw new RangeError("ziwei_hourly_calendar_range_unsupported");
  }
  if (civil.h === 23) throw new RangeError("ziwei_hourly_late_zi_birth_unsupported");
  return resolveUnambiguousBirthWallClock(wall, timezone);
}

function shichenWindow(referenceInstant: Date, timezone: string, timeIndex: number): { validFrom: Date; validUntil: Date } {
  const ref = civilAt(referenceInstant, timezone);
  let start: Civil;
  let end: Civil;
  if (timeIndex === 0) {
    start = shiftCivilDate({ ...ref, h: 23, mi: 0, s: 0 }, -1);
    end = { ...ref, h: 1, mi: 0, s: 0 };
  } else if (timeIndex === 12) {
    start = { ...ref, h: 23, mi: 0, s: 0 };
    end = shiftCivilDate({ ...ref, h: 1, mi: 0, s: 0 }, 1);
  } else {
    const startHour = timeIndex * 2 - 1;
    start = { ...ref, h: startHour, mi: 0, s: 0 };
    end = { ...ref, h: startHour + 2, mi: 0, s: 0 };
  }
  return {
    validFrom: civilBoundaryInstant(start, timezone),
    validUntil: civilBoundaryInstant(end, timezone),
  };
}

export function buildZiweiHourlyPreview(input: ZiweiHourlyPreviewInput): ZiweiHourlyPreview {
  assertInstant(input.birthInstant, "ziwei_hourly_invalid_birth_instant");
  assertInstant(input.referenceInstant, "ziwei_hourly_invalid_reference_instant");
  const location = engineLocation(input.birthLocation);
  if (input.gender !== "M" && input.gender !== "F") throw new TypeError("ziwei_hourly_invalid_gender");

  const parsedBirthTimezone = parseTz(String(input.birthTimezone || ""));
  if (!parsedBirthTimezone) throw new TypeError("ziwei_hourly_invalid_birth_timezone");
  const referenceTimezone = canonicalIanaTimezone(
    input.referenceTimezone,
    input.referenceInstant,
    "ziwei_hourly_invalid_reference_timezone",
  );
  const birthTimezone = parsedBirthTimezone.kind === "zone"
    ? canonicalIanaTimezone(parsedBirthTimezone.label, input.birthInstant, "ziwei_hourly_invalid_birth_timezone")
    : parsedBirthTimezone.label;
  const birthOffsetHours = parsedBirthTimezone.kind === "zone"
    ? strictIanaOffsetHours(birthTimezone, input.birthInstant, "ziwei_hourly_invalid_birth_timezone")
    : (parsedBirthTimezone.offsetMin || 0) / 60;
  const referenceOffsetHours = strictIanaOffsetHours(referenceTimezone, input.referenceInstant, "ziwei_hourly_invalid_reference_timezone");
  const birthCivil = parsedBirthTimezone.kind === "zone"
    ? civilAt(input.birthInstant, birthTimezone)
    : civilAtOffset(input.birthInstant, parsedBirthTimezone.offsetMin || 0);
  const referenceCivil = civilAt(input.referenceInstant, referenceTimezone);
  const birthDate = `${birthCivil.y}-${String(birthCivil.m).padStart(2, "0")}-${String(birthCivil.d).padStart(2, "0")}`;
  const referenceDate = `${referenceCivil.y}-${String(referenceCivil.m).padStart(2, "0")}-${String(referenceCivil.d).padStart(2, "0")}`;
  if (birthDate < "1900-01-31" || birthDate > "2100-12-31" || referenceDate < "1900-01-31" || referenceDate > "2100-12-31") {
    throw new RangeError("ziwei_hourly_calendar_range_unsupported");
  }
  if (birthCivil.h === 23) throw new RangeError("ziwei_hourly_late_zi_birth_unsupported");

  const chart = ziweiChart(
    input.birthInstant,
    location.lat,
    location.lng,
    input.gender,
    true,
    {
      gmtOffsetHours: birthOffsetHours,
      refDate: input.referenceInstant,
      refGmtOffsetHours: referenceOffsetHours,
      refBoundaryPolicy: "forward_zi",
    },
  );
  if (!chart.liuNian || !chart.liuYue || !chart.liuRi || !chart.liuShi) {
    throw new Error("ziwei_hourly_layers_unavailable");
  }
  if (chart.liuShi.calculationDateISO < "1900-01-31" || chart.liuShi.calculationDateISO > "2100-12-31") {
    throw new RangeError("ziwei_hourly_calendar_range_unsupported");
  }
  const window = shichenWindow(input.referenceInstant, referenceTimezone, chart.liuShi.timeIndex);
  if (!(window.validFrom <= input.referenceInstant && input.referenceInstant < window.validUntil)) {
    throw new RangeError("ziwei_hourly_reference_window_unrealized");
  }
  const effectiveTimeIndex = (chart.liuShi.timeIndex === 12 ? 0 : chart.liuShi.timeIndex) as ZiweiHourlyPreview["reference"]["effectiveTimeIndex"];
  const windowKey = `${ZIWEI_HOURLY_LINEAGE}:${referenceTimezone}:${chart.liuShi.calculationDateISO}:${chart.liuShi.ganzhi.slice(1, 2)}`;

  return Object.freeze({
    discipline: "ziwei",
    capability: "preview_only",
    schema: 1,
    calculationVersion: ZIWEI_HOURLY_CALCULATION_VERSION,
    lineage: ZIWEI_HOURLY_LINEAGE,
    decisionSupported: false,
    productionEligible: false,
    limitations: Object.freeze([
      "named_software_lineage_not_classical_consensus",
      "preview_only_no_notification",
      "requires_production_occurrence_and_delivery_review",
    ] as const),
    reference: Object.freeze({
      instant: input.referenceInstant.toISOString(),
      timezone: referenceTimezone,
      localDate: chart.liuShi.civilDateISO,
      calculationDate: chart.liuShi.calculationDateISO,
      timeIndex: chart.liuShi.timeIndex,
      effectiveTimeIndex,
      boundaryPolicy: "forward_zi",
      validFrom: window.validFrom.toISOString(),
      validUntil: window.validUntil.toISOString(),
      windowKey,
    }),
    layers: Object.freeze({
      liuNian: chart.liuNian,
      liuYue: chart.liuYue,
      liuRi: chart.liuRi,
      liuShi: chart.liuShi,
    }),
  });
}

/**
 * Production notification facts share the locked chart calculation with preview,
 * but have a separate versioned capability. Delivery accepts this shape only;
 * preview-only results are therefore impossible to promote accidentally.
 */
export function buildZiweiHourlyNotificationFacts(
  input: ZiweiHourlyPreviewInput,
): ZiweiHourlyNotificationFacts {
  const preview = buildZiweiHourlyPreview(input);
  return Object.freeze({
    discipline: "ziwei",
    capability: "notification_facts",
    schema: 1,
    calculationVersion: ZIWEI_HOURLY_NOTIFICATION_CALCULATION_VERSION,
    lineage: ZIWEI_HOURLY_LINEAGE,
    decisionSupported: false,
    productionEligible: true,
    limitations: Object.freeze([
      "named_software_lineage_not_classical_consensus",
      "structural_chart_facts_no_auspicious_verdict",
      "self_profile_only",
    ] as const),
    reference: preview.reference,
    layers: preview.layers,
  });
}
