import type { Pool, PoolClient } from "pg";
import { apparentSolarParts, nextShichenBoundary } from "./zibai-science";
import locationPolicy from "./zibai-location-policy.cjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_LOCATION_AGE_MS = locationPolicy.ZIBAI_LOCATION_LEASE_MS;
const MAX_LOCATION_RETENTION_MS = locationPolicy.ZIBAI_LOCATION_LEASE_MS;

type Permission = "unknown" | "foreground" | "background" | "denied";
type ZibaiRow = {
  daily_enabled: boolean;
  shichen_enabled: boolean;
  daily_minute: number;
  quiet_start: number;
  quiet_end: number;
  location_permission: Permission;
  latitude: number | null;
  longitude: number | null;
  location_timezone: string | null;
  location_captured_at: Date | string | null;
  location_expires_at: Date | string | null;
  next_daily_at: Date | string | null;
  next_shichen_at: Date | string | null;
  last_skip_reason: string | null;
};

export type ZibaiMutation =
  | { action: "settings"; installationId: string; dailyEnabled?: boolean; shichenEnabled?: boolean; dailyMinute?: number; quietStart?: number; quietEnd?: number }
  | { action: "location"; installationId: string; permission: "foreground" | "background"; latitude: number; longitude: number; timezone: string; capturedAt: string }
  | { action: "location"; installationId: string; permission: "denied" }
  | { action: "background_location"; installationId: string; latitude: number; longitude: number; timezone: string; capturedAt: string }
  | { action: "disable_shichen"; installationId: string };

export class ZibaiStateError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 80 || value !== value.trim()) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0)); return true; } catch { return false; }
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

export function parseZibaiMutation(value: unknown): ZibaiMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("zibai_input_invalid");
  const body = value as Record<string, unknown>;
  const installationId = typeof body.installationId === "string" ? body.installationId : "";
  if (!UUID_RE.test(installationId)) throw new TypeError("zibai_input_invalid");
  if (body.action === "settings") {
    if (!exactKeys(body, ["action", "installationId", "dailyEnabled", "shichenEnabled", "dailyMinute", "quietStart", "quietEnd"])) throw new TypeError("zibai_input_invalid");
    const hasUpdate = [body.dailyEnabled, body.shichenEnabled, body.dailyMinute, body.quietStart, body.quietEnd].some((item) => item !== undefined);
    if (!hasUpdate || (body.dailyEnabled !== undefined && typeof body.dailyEnabled !== "boolean")
      || (body.shichenEnabled !== undefined && typeof body.shichenEnabled !== "boolean")
      || (body.dailyMinute !== undefined && (!Number.isInteger(body.dailyMinute) || Number(body.dailyMinute) < 0 || Number(body.dailyMinute) > 1439))
      || (body.quietStart !== undefined && (!Number.isInteger(body.quietStart) || Number(body.quietStart) < 0 || Number(body.quietStart) > 23))
      || (body.quietEnd !== undefined && (!Number.isInteger(body.quietEnd) || Number(body.quietEnd) < 0 || Number(body.quietEnd) > 23))) {
      throw new TypeError("zibai_input_invalid");
    }
    return { action: "settings", installationId, ...(body.dailyEnabled === undefined ? {} : { dailyEnabled: body.dailyEnabled }), ...(body.shichenEnabled === undefined ? {} : { shichenEnabled: body.shichenEnabled }), ...(body.dailyMinute === undefined ? {} : { dailyMinute: Number(body.dailyMinute) }), ...(body.quietStart === undefined ? {} : { quietStart: Number(body.quietStart) }), ...(body.quietEnd === undefined ? {} : { quietEnd: Number(body.quietEnd) }) };
  }
  if (body.action === "disable_shichen") {
    if (!exactKeys(body, ["action", "installationId"])) throw new TypeError("zibai_input_invalid");
    return { action: "disable_shichen", installationId };
  }
  if (body.action === "location" || body.action === "background_location") {
    if (body.action === "background_location") {
      if (!exactKeys(body, ["action", "installationId", "latitude", "longitude", "timezone", "capturedAt"])
        || !Number.isFinite(body.latitude) || Number(body.latitude) < -90 || Number(body.latitude) > 90
        || !Number.isFinite(body.longitude) || Number(body.longitude) < -180 || Number(body.longitude) > 180
        || !validTimezone(body.timezone) || typeof body.capturedAt !== "string"
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(body.capturedAt)
        || new Date(body.capturedAt).toISOString() !== body.capturedAt) throw new TypeError("zibai_input_invalid");
      return { action: "background_location", installationId, latitude: Number(body.latitude), longitude: Number(body.longitude), timezone: body.timezone, capturedAt: body.capturedAt };
    }
    if (body.permission === "denied") {
      if (!exactKeys(body, ["action", "installationId", "permission"])) throw new TypeError("zibai_input_invalid");
      return { action: "location", installationId, permission: "denied" };
    }
    if (!exactKeys(body, ["action", "installationId", "permission", "latitude", "longitude", "timezone", "capturedAt"])
      || (body.permission !== "foreground" && body.permission !== "background")
      || !Number.isFinite(body.latitude) || Number(body.latitude) < -90 || Number(body.latitude) > 90
      || !Number.isFinite(body.longitude) || Number(body.longitude) < -180 || Number(body.longitude) > 180
      || !validTimezone(body.timezone) || typeof body.capturedAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(body.capturedAt)
      || new Date(body.capturedAt).toISOString() !== body.capturedAt) throw new TypeError("zibai_input_invalid");
    return { action: "location", installationId, permission: body.permission, latitude: Number(body.latitude), longitude: Number(body.longitude), timezone: body.timezone, capturedAt: body.capturedAt };
  }
  throw new TypeError("zibai_input_invalid");
}

function civilClock(formatter: Intl.DateTimeFormat, at: Date): { hour: number; minute: number } {
  const parts = formatter.formatToParts(at);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { hour: value("hour") % 24, minute: value("minute") };
}

/** Next exact local wall-clock minute, including DST gap/fold behavior. */
export function nextCivilMinute(at: Date, timezone: string, minuteOfDay: number): Date {
  if (!validTimezone(timezone) || !Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > 1439 || !Number.isFinite(at.getTime())) throw new TypeError("zibai_civil_time_invalid");
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const targetHour = Math.floor(minuteOfDay / 60);
  const targetMinute = minuteOfDay % 60;
  const start = Math.floor(at.getTime() / 60_000) * 60_000 + 60_000;
  for (let candidate = start; candidate <= start + 49 * 3_600_000; candidate += 60_000) {
    const local = civilClock(formatter, new Date(candidate));
    if (local.hour === targetHour && local.minute === targetMinute) return new Date(candidate);
  }
  throw new RangeError("zibai_civil_time_unavailable");
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function sanitizeZibaiStatus(row: ZibaiRow | null, at = new Date()) {
  if (!row) return Object.freeze({
    dailyEnabled: false, shichenEnabled: false, dailyMinute: 420, quietStart: 22, quietEnd: 7, permission: "unknown" as Permission,
    locationFresh: false, locationAgeSeconds: null, lastLocationAt: null, locationExpiresAt: null,
    nextDailyAt: null, nextShichenAt: null, apparentSolarTime: null, nextShichenSolarTime: null,
    locationTimezone: null, lastSkipReason: null,
  });
  const captured = iso(row.location_captured_at);
  const expires = iso(row.location_expires_at);
  const capturedMs = captured ? Date.parse(captured) : NaN;
  const ageMs = Number.isFinite(capturedMs) ? Math.max(0, at.getTime() - capturedMs) : null;
  const capturedNotFuture = Number.isFinite(capturedMs) && capturedMs <= at.getTime() + 5 * 60_000;
  const longitude = row.longitude === null ? NaN : Number(row.longitude);
  const expiresMs = expires ? Date.parse(expires) : NaN;
  const withinRetention = ageMs !== null && ageMs <= MAX_LOCATION_RETENTION_MS
    && Number.isFinite(expiresMs) && expiresMs > at.getTime();
  const currentSolar = Number.isFinite(longitude) && withinRetention ? apparentSolarParts(at, longitude) : null;
  const nextShichenIso = iso(row.next_shichen_at);
  const nextSolar = currentSolar && nextShichenIso ? apparentSolarParts(new Date(nextShichenIso), longitude) : null;
  const hhmm = (parts: { hour: number; minute: number } | null) => parts
    ? `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}` : null;
  return Object.freeze({
    dailyEnabled: row.daily_enabled, shichenEnabled: row.shichen_enabled, dailyMinute: Number(row.daily_minute), quietStart: Number(row.quiet_start), quietEnd: Number(row.quiet_end),
    permission: row.location_permission,
    locationFresh: capturedNotFuture && ageMs !== null && ageMs <= MAX_LOCATION_AGE_MS && withinRetention,
    locationAgeSeconds: !withinRetention || ageMs === null ? null : Math.floor(ageMs / 1000), lastLocationAt: captured,
    locationExpiresAt: expires, nextDailyAt: iso(row.next_daily_at), nextShichenAt: nextShichenIso,
    apparentSolarTime: hhmm(currentSolar), nextShichenSolarTime: hhmm(nextSolar),
    locationTimezone: row.location_timezone,
    lastSkipReason: row.last_skip_reason || null,
  });
}

async function rollback(client: PoolClient) { await client.query("ROLLBACK").catch(() => null); }

export async function mutateZibaiInstallation(pool: Pool, userId: string, mutation: ZibaiMutation, at = new Date()) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||$1::text,0))`, [userId]);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('mobile-zibai-installation:'||$1::text,0))`, [mutation.installationId]);
    const token = await client.query(`SELECT id FROM mobile_push_tokens WHERE user_id=$1 AND installation_id=$2 AND enabled=true FOR UPDATE`, [userId, mutation.installationId]);
    if (!token.rows[0]) throw new ZibaiStateError("zibai_installation_not_found", 404);
    await client.query(`DELETE FROM mobile_zibai_installations WHERE installation_id=$2 AND user_id<>$1`, [userId, mutation.installationId]);
    await client.query(`INSERT INTO mobile_zibai_installations(user_id,installation_id) VALUES($1,$2) ON CONFLICT(user_id,installation_id) DO NOTHING`, [userId, mutation.installationId]);
    const selected = await client.query<ZibaiRow>(`SELECT * FROM mobile_zibai_installations WHERE user_id=$1 AND installation_id=$2 FOR UPDATE`, [userId, mutation.installationId]);
    const current = selected.rows[0];
    if (mutation.action === "location" || mutation.action === "background_location") {
      if (mutation.action === "background_location"
        && (!current.shichen_enabled || current.location_permission !== "background")) {
        throw new ZibaiStateError("zibai_shichen_disabled", 409);
      }
      if (mutation.action === "location" && mutation.permission === "denied") {
        await client.query(`UPDATE mobile_zibai_installations SET location_permission='denied',latitude=NULL,longitude=NULL,location_timezone=NULL,location_captured_at=NULL,location_expires_at=NULL,shichen_enabled=false,next_daily_at=NULL,next_shichen_at=NULL,last_skip_reason='location_permission_denied',updated_at=$3 WHERE user_id=$1 AND installation_id=$2`, [userId, mutation.installationId, at.toISOString()]);
      } else {
        const capturedAt = new Date(mutation.capturedAt);
        const permission = mutation.action === "background_location" ? "background" : mutation.permission;
        if (capturedAt.getTime() > at.getTime() + 5 * 60_000 || at.getTime() - capturedAt.getTime() > MAX_LOCATION_RETENTION_MS) throw new ZibaiStateError("zibai_location_time_invalid", 400);
        const expiresAt = new Date(capturedAt.getTime() + MAX_LOCATION_RETENTION_MS);
        const computedShichenAt = nextShichenBoundary(at, mutation.longitude);
        const computedDailyAt = current.daily_enabled ? nextCivilMinute(at, mutation.timezone, current.daily_minute) : null;
        const currentDailyAt = iso(current.next_daily_at);
        const currentShichenAt = iso(current.next_shichen_at);
        const nextDailyAt = current.daily_enabled && currentDailyAt && Date.parse(currentDailyAt) <= at.getTime()
          ? new Date(currentDailyAt) : computedDailyAt;
        const nextShichenAt = current.shichen_enabled && currentShichenAt && Date.parse(currentShichenAt) <= at.getTime()
          ? new Date(currentShichenAt) : computedShichenAt;
        await client.query(`UPDATE mobile_zibai_installations SET location_permission=$3,latitude=$4,longitude=$5,location_timezone=$6,location_captured_at=$7,location_expires_at=$8,next_daily_at=$9,shichen_enabled=CASE WHEN $3='background' THEN shichen_enabled ELSE false END,next_shichen_at=CASE WHEN shichen_enabled AND $3='background' THEN $10::timestamptz ELSE NULL END,last_skip_reason=CASE WHEN $3='background' THEN NULL WHEN shichen_enabled THEN 'background_permission_missing' ELSE NULL END,updated_at=$11 WHERE user_id=$1 AND installation_id=$2`, [userId, mutation.installationId, permission, mutation.latitude, mutation.longitude, mutation.timezone, capturedAt.toISOString(), expiresAt.toISOString(), nextDailyAt?.toISOString() || null, nextShichenAt.toISOString(), at.toISOString()]);
      }
    } else if (mutation.action === "disable_shichen") {
      await client.query(`UPDATE mobile_zibai_installations SET shichen_enabled=false,next_shichen_at=NULL,last_skip_reason='disabled_by_action',updated_at=$3 WHERE user_id=$1 AND installation_id=$2`, [userId, mutation.installationId, at.toISOString()]);
    } else {
      const dailyEnabled = mutation.dailyEnabled ?? current.daily_enabled;
      const shichenEnabled = mutation.shichenEnabled ?? current.shichen_enabled;
      const dailyMinute = mutation.dailyMinute ?? current.daily_minute;
      const quietStart = mutation.quietStart ?? current.quiet_start;
      const quietEnd = mutation.quietEnd ?? current.quiet_end;
      const capturedMs = current.location_captured_at ? new Date(current.location_captured_at).getTime() : NaN;
      const expiresMs = current.location_expires_at ? new Date(current.location_expires_at).getTime() : NaN;
      const fresh = Number.isFinite(capturedMs) && at.getTime() - capturedMs <= MAX_LOCATION_AGE_MS && capturedMs <= at.getTime() + 5 * 60_000 && expiresMs > at.getTime();
      const enablingDaily = mutation.dailyEnabled === true && !current.daily_enabled;
      const enablingShichen = mutation.shichenEnabled === true && !current.shichen_enabled;
      if (enablingDaily && !fresh) throw new ZibaiStateError("zibai_location_required", 409);
      if (enablingShichen && (!fresh || current.location_permission !== "background")) throw new ZibaiStateError("zibai_background_location_required", 409);
      const nextDailyAt = dailyEnabled && fresh ? nextCivilMinute(at, String(current.location_timezone), dailyMinute) : null;
      const nextShichenAt = shichenEnabled && fresh && current.location_permission === "background"
        ? nextShichenBoundary(at, Number(current.longitude)) : null;
      const disabledWithStalePeer = !fresh && (dailyEnabled || shichenEnabled);
      await client.query(`UPDATE mobile_zibai_installations SET daily_enabled=$3,shichen_enabled=$4,daily_minute=$5,quiet_start=$6,quiet_end=$7,next_daily_at=$8,next_shichen_at=$9,last_skip_reason=$10,updated_at=$11 WHERE user_id=$1 AND installation_id=$2`, [userId, mutation.installationId, dailyEnabled, shichenEnabled, dailyMinute, quietStart, quietEnd, nextDailyAt?.toISOString() || null, nextShichenAt?.toISOString() || null, disabledWithStalePeer ? "location_stale" : null, at.toISOString()]);
    }
    const saved = await client.query<ZibaiRow>(`SELECT * FROM mobile_zibai_installations WHERE user_id=$1 AND installation_id=$2`, [userId, mutation.installationId]);
    await client.query("COMMIT");
    return sanitizeZibaiStatus(saved.rows[0], at);
  } catch (error) {
    await rollback(client);
    throw error;
  } finally { client.release(); }
}

export async function readZibaiInstallation(pool: Pool, userId: string, installationId: string, at = new Date()) {
  if (!UUID_RE.test(installationId)) throw new ZibaiStateError("zibai_input_invalid", 400);
  const result = await pool.query<ZibaiRow>(`SELECT z.* FROM mobile_zibai_installations z JOIN mobile_push_tokens t ON t.user_id=z.user_id AND t.installation_id=z.installation_id AND t.enabled=true WHERE z.user_id=$1 AND z.installation_id=$2`, [userId, installationId]);
  return sanitizeZibaiStatus(result.rows[0] || null, at);
}
