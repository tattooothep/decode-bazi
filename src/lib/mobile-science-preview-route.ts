export const MAX_PREVIEW_BODY_BYTES = 8_192;

export const PRIVATE_NO_STORE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Authorization",
});

export type SciencePreviewSession = Readonly<{ userId: string; orgId?: string | null }>;
export type SciencePreviewGuardConfig = Readonly<{
  rateKeyPrefix: string;
  rateMax: number;
  rateWindowMs: number;
  enabledKey: string;
  allowlistKey: string;
}>;
export type SciencePreviewGuardDependencies = Readonly<{
  getSession: (req: Request) => Promise<SciencePreviewSession | null>;
  rateLimit: (key: string, max: number, windowMs: number) => Promise<{ ok: boolean; retryAfterMs?: number }>;
  clientIp: (req: Request) => string;
  enabledForUser: (enabledKey: string, allowlistKey: string, userId: string) => boolean;
}>;
export type SciencePreviewGuardResult =
  | Readonly<{ ok: true; session: SciencePreviewSession }>
  | Readonly<{ ok: false; status: 401 | 429 | 503; error: "not_logged_in" | "rate_limited" | "preview_unavailable"; retryAfterSeconds?: number }>;

export function sciencePreviewEnabledForUser(enabledKey: string, allowlistKey: string, userId: string): boolean {
  const enabled = process.env[enabledKey];
  const allowlist = new Set(String(process.env[allowlistKey] || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (enabled !== "1") return false;
  return allowlist.has(userId);
}

/** Authentication, throttling and the default-off kill switch run before body,
 * profile or science work. Dependencies are explicit so this order is tested. */
export async function guardSciencePreviewRequest(
  req: Request,
  config: SciencePreviewGuardConfig,
  dependencies: SciencePreviewGuardDependencies,
): Promise<SciencePreviewGuardResult> {
  const session = await dependencies.getSession(req);
  if (!session) return { ok: false, status: 401, error: "not_logged_in" };
  const limited = await dependencies.rateLimit(
    `${config.rateKeyPrefix}:${dependencies.clientIp(req)}:${session.userId}`,
    config.rateMax,
    config.rateWindowMs,
  );
  if (!limited.ok) {
    return {
      ok: false,
      status: 429,
      error: "rate_limited",
      retryAfterSeconds: Math.max(1, Math.ceil((limited.retryAfterMs || 0) / 1_000)),
    };
  }
  if (!dependencies.enabledForUser(config.enabledKey, config.allowlistKey, session.userId) || !session.orgId) {
    return { ok: false, status: 503, error: "preview_unavailable" };
  }
  return { ok: true, session };
}

export async function readBoundedJson(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PREVIEW_BODY_BYTES) throw new TypeError("preview_body_too_large");
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_PREVIEW_BODY_BYTES) throw new TypeError("preview_body_too_large");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new TypeError("preview_invalid_json"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("preview_invalid_json");
  return parsed as Record<string, unknown>;
}

export function strictUuid(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim().replace(/^hk_/u, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id) ? id : null;
}

export function exactObjectKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function strictRfc3339Instant(value: unknown): Date | null {
  const text = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/u.exec(text);
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  const h = Number(match[4]), mi = Number(match[5]), s = Number(match[6] || 0);
  const offH = Number(match[7] || 0), offM = Number(match[8] || 0);
  if (h > 23 || mi > 59 || s > 59 || offH > 14 || offM > 59 || (offH === 14 && offM !== 0)) return null;
  const civil = new Date(Date.UTC(y, m - 1, d, h, mi, s));
  if (civil.getUTCFullYear() !== y || civil.getUTCMonth() + 1 !== m || civil.getUTCDate() !== d
    || civil.getUTCHours() !== h || civil.getUTCMinutes() !== mi || civil.getUTCSeconds() !== s) return null;
  const instant = new Date(text);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

export function strictIanaTimezone(value: unknown, instant: Date): string | null {
  const timezone = typeof value === "string" ? value.trim() : "";
  if (!timezone || (timezone !== "UTC" && !timezone.includes("/"))) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en", { timeZone: timezone });
    formatter.format(instant);
    return formatter.resolvedOptions().timeZone;
  } catch { return null; }
}
