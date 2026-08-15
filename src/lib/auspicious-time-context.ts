export type AuspiciousTimeContext = {
  enabled: boolean;
  timezone: string;
  instant: Date | null;
};

export type AuspiciousTimeContextResult = {
  context?: AuspiciousTimeContext;
  error?: "timezone_invalid" | "instant_invalid";
};

function validTimezone(value: unknown): string | null {
  const timezone = typeof value === "string" ? value.trim() : "";
  if (!timezone || timezone.length > 80) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    return null;
  }
}

export function parseAuspiciousTimeContext(body: Record<string, unknown>): AuspiciousTimeContextResult {
  const enabled = body.timezone !== undefined || body.instant !== undefined;
  if (!enabled) return { context: { enabled: false, timezone: "Asia/Bangkok", instant: null } };

  const timezone = body.timezone === undefined ? "Asia/Bangkok" : validTimezone(body.timezone);
  if (!timezone) return { error: "timezone_invalid" };
  let instant: Date | null = null;
  if (body.instant !== undefined) {
    if (typeof body.instant !== "string" || body.instant.length > 64) return { error: "instant_invalid" };
    instant = new Date(body.instant);
    if (!Number.isFinite(instant.valueOf())) return { error: "instant_invalid" };
  }
  return { context: { enabled: true, timezone, instant } };
}

function shiftCivilDate(value: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return value;
  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return instant.toISOString().slice(0, 10);
}

export function auspiciousQueryRange(
  dateFrom: string,
  dateTo: string,
  context: AuspiciousTimeContext,
): { dateFrom: string; dateTo: string } {
  if (!context.enabled) return { dateFrom, dateTo };
  return { dateFrom: shiftCivilDate(dateFrom, -1), dateTo: shiftCivilDate(dateTo, 1) };
}

function candidateInstant(value: unknown): Date | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const zoned = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/iu.test(text) ? text : `${text.replace(" ", "T")}+07:00`;
  const instant = new Date(zoned);
  return Number.isFinite(instant.valueOf()) ? instant : null;
}

function localParts(timezone: string, instant: Date): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function localDate(timezone: string, instant: Date): string {
  const parts = localParts(timezone, instant);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function offsetMinutes(timezone: string, instant: Date): number {
  const parts = localParts(timezone, instant);
  const localAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return Math.round((localAsUtc - Math.floor(instant.valueOf() / 1_000) * 1_000) / 60_000);
}

function zonedIso(timezone: string, instant: Date): { iso: string; utcOffsetMinutes: number } {
  const parts = localParts(timezone, instant);
  const offset = offsetMinutes(timezone, instant);
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  const zone = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${zone}`,
    utcOffsetMinutes: offset,
  };
}

export function applyAuspiciousTimeContext<T extends Record<string, any>>(
  candidates: T[],
  dateFrom: string,
  dateTo: string,
  context: AuspiciousTimeContext,
): T[] {
  if (!context.enabled) return candidates;
  return filterAuspiciousTimeContext(candidates, dateFrom, dateTo, context)
    .map((candidate) => projectAuspiciousTimeContext(candidate, context));
}

export function filterAuspiciousTimeContext<T extends Record<string, any>>(
  candidates: T[],
  dateFrom: string,
  dateTo: string,
  context: AuspiciousTimeContext,
): T[] {
  if (!context.enabled) return candidates;
  return candidates.filter((candidate) => {
    const start = candidateInstant(candidate?.datetime?.start);
    const end = candidateInstant(candidate?.datetime?.end);
    if (!start || !end || end.valueOf() < start.valueOf()) return false;
    if (context.instant && start.valueOf() < context.instant.valueOf()) return false;
    const date = localDate(context.timezone, start);
    return date >= dateFrom && date <= dateTo;
  });
}

export function projectAuspiciousTimeContext<T extends Record<string, any>>(
  candidate: T,
  context: AuspiciousTimeContext,
): T {
  if (!context.enabled) return candidate;
  const start = candidateInstant(candidate?.datetime?.start);
  const end = candidateInstant(candidate?.datetime?.end);
  if (!start || !end) return candidate;
  const projectedStart = zonedIso(context.timezone, start);
  const projectedEnd = zonedIso(context.timezone, end);
  return {
    ...candidate,
    datetime: {
      ...candidate.datetime,
      start: projectedStart.iso,
      end: projectedEnd.iso,
      timezone: context.timezone,
      utcOffsetMinutes: projectedStart.utcOffsetMinutes,
    },
    calendar: { ...candidate.calendar, gregorianDate: localDate(context.timezone, start) },
  };
}
