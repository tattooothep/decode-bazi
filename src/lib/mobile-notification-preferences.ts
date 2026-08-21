import type { Pool, PoolClient } from "pg";

export type MobileNotificationPreferenceRow = {
  security_enabled: boolean;
  saved_date_enabled: boolean;
  yam_enabled: boolean;
  auspicious_enabled: boolean;
  daily_enabled: boolean;
  qimen_enabled: boolean;
  shrine_enabled: boolean;
  goal_enabled: boolean;
  service_enabled: boolean;
  yam_min_quality: "best" | "good";
  yam_lead_minutes: number;
  daily_slot: "morning" | "evening" | "both";
  quiet_start: number;
  quiet_end: number;
  max_per_day: number;
  paused_until: string | Date | null;
  privacy_preview: boolean;
  locale: string;
  timezone: string;
};

export type MobileNotificationPreferenceInput = Record<string, unknown>;

const LOCALES = new Set(["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]);

const DEFAULT_PREFERENCES: MobileNotificationPreferenceRow = Object.freeze({
  security_enabled: true,
  saved_date_enabled: false,
  yam_enabled: false,
  auspicious_enabled: false,
  daily_enabled: false,
  qimen_enabled: false,
  shrine_enabled: false,
  goal_enabled: false,
  service_enabled: true,
  yam_min_quality: "best",
  yam_lead_minutes: 60,
  daily_slot: "morning",
  quiet_start: 22,
  quiet_end: 7,
  max_per_day: 2,
  paused_until: null,
  privacy_preview: false,
  locale: "th",
  timezone: "Asia/Bangkok",
});

function intInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

function validTimezone(timezone: string | null): string {
  const candidate = String(timezone || "").trim() || "Asia/Bangkok";
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return "Asia/Bangkok";
  }
}

function requestedTimezone(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 80) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.trim() }).format(new Date(0));
    return value.trim();
  } catch {
    return null;
  }
}

export function findNextCivilDateBoundary(start: number, dateKeyAt: (at: number) => string): Date {
  if (!Number.isFinite(start)) throw new TypeError("notification_time_invalid");
  const currentDate = dateKeyAt(start);
  const limit = start + 72 * 3_600_000;
  let lower = start;
  // A civil date boundary is bracketed coarsely, then located to the first
  // millisecond. This bounds synchronous formatter work to <100 calls instead
  // of probing every minute while the account preference transaction is held.
  for (let probe = start + 3_600_000; probe <= limit; probe += 3_600_000) {
    if (dateKeyAt(probe) === currentDate) {
      lower = probe;
      continue;
    }
    let upper = probe;
    while (upper - lower > 1) {
      const middle = lower + Math.floor((upper - lower) / 2);
      if (dateKeyAt(middle) === currentDate) lower = middle;
      else upper = middle;
    }
    return new Date(upper);
  }
  throw new RangeError("notification_timezone_boundary_unresolved");
}

/** Return the true next civil midnight, including a DST offset change that day. */
export function nextLocalMidnight(timezone: string | null, at: Date): Date {
  const tz = validTimezone(timezone);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  return findNextCivilDateBoundary(at.valueOf(), (instant) => formatter.format(new Date(instant)));
}

async function rollback(client: PoolClient) {
  await client.query("ROLLBACK").catch(() => null);
}

/**
 * Linearizes every partial preference write with push registration/unregister.
 * The merge snapshot is read only after the shared per-account transaction lock
 * is acquired, so concurrent bodies cannot replace fields they did not send.
 */
export async function updateNotificationPreferences(
  pool: Pool,
  userId: string,
  body: MobileNotificationPreferenceInput,
  at = new Date(),
): Promise<MobileNotificationPreferenceRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||$1::text,0))`,
      [userId],
    );
    const selected = await client.query<MobileNotificationPreferenceRow & {
      effective_timezone: string | null;
      effective_locale: string | null;
    }>(
      `SELECT np.security_enabled,np.saved_date_enabled,np.yam_enabled,np.auspicious_enabled,np.daily_enabled,
              np.qimen_enabled,np.shrine_enabled,np.goal_enabled,np.service_enabled,
              np.yam_min_quality,np.yam_lead_minutes,np.daily_slot,np.quiet_start,np.quiet_end,np.max_per_day,
              np.paused_until,np.privacy_preview,np.locale,np.timezone,
              COALESCE(np.timezone,u.timezone,'Asia/Bangkok') AS effective_timezone,
              COALESCE(NULLIF(btrim(to_jsonb(u)->>'locale'),''),NULLIF(btrim(np.locale),''),'th') AS effective_locale
         FROM users u LEFT JOIN mobile_notification_prefs np ON np.user_id=u.id
        WHERE u.id=$1 FOR UPDATE OF u`,
      [userId],
    );
    if (!selected.rows[0]) throw new Error("notification_account_not_found");
    const selectedRow = selected.rows[0];
    const effectiveLocale = LOCALES.has(String(selectedRow.effective_locale || "").toLowerCase())
      ? String(selectedRow.effective_locale).toLowerCase()
      : "th";
    const current: MobileNotificationPreferenceRow = selectedRow.security_enabled === null
      || selectedRow.security_enabled === undefined
      ? { ...DEFAULT_PREFERENCES, locale: effectiveLocale, timezone: validTimezone(selectedRow.effective_timezone) }
      : { ...selectedRow, locale: effectiveLocale, timezone: validTimezone(selectedRow.effective_timezone) };

    const localeInput = body.locale === undefined ? current.locale : String(body.locale || "").toLowerCase();
    if (!LOCALES.has(localeInput)) throw new TypeError("notification_locale_invalid");
    const timezoneInput = body.timezone === undefined
      ? current.timezone
      : requestedTimezone(body.timezone);
    if (timezoneInput === null) throw new TypeError("notification_timezone_invalid");
    await client.query(
      `UPDATE users SET locale=$2,timezone=$3 WHERE id=$1`,
      [userId, localeInput, timezoneInput],
    );

    const hasLatitude = body.qimenLatitude !== undefined;
    const hasLongitude = body.qimenLongitude !== undefined;
    if (hasLatitude !== hasLongitude) throw new TypeError("qimen_location_incomplete");
    const qimenLatitude = hasLatitude ? Number(body.qimenLatitude) : null;
    const qimenLongitude = hasLongitude ? Number(body.qimenLongitude) : null;
    if (hasLatitude && (!Number.isFinite(qimenLatitude) || qimenLatitude! < -90 || qimenLatitude! > 90
      || !Number.isFinite(qimenLongitude) || qimenLongitude! < -180 || qimenLongitude! > 180)) {
      throw new TypeError("qimen_location_invalid");
    }

    const shrine = typeof body.shrine === "boolean"
      ? body.shrine
      : typeof body.auspicious === "boolean" ? body.auspicious : current.shrine_enabled;
    let pausedUntil = current.paused_until === null || current.paused_until === undefined
      ? null
      : new Date(String(current.paused_until));
    if (body.resume === true) pausedUntil = null;
    else if (body.muteToday === true) pausedUntil = nextLocalMidnight(timezoneInput, at);
    else {
      const pauseDays = intInRange(body.pauseDays, 1, 90);
      if (pauseDays !== null) pausedUntil = new Date(at.valueOf() + pauseDays * 86_400_000);
    }

    const saved = await client.query<MobileNotificationPreferenceRow>(
      `INSERT INTO mobile_notification_prefs
         (user_id,security_enabled,saved_date_enabled,yam_enabled,auspicious_enabled,daily_enabled,
          qimen_enabled,shrine_enabled,goal_enabled,service_enabled,yam_min_quality,yam_lead_minutes,daily_slot,
          quiet_start,quiet_end,max_per_day,paused_until,qimen_latitude,qimen_longitude,qimen_location_updated_at,
          updated_at,privacy_preview,locale,timezone)
       VALUES($1,true,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12,$13,$14,$15,$16,$17,
              CASE WHEN $16::float8 IS NULL THEN NULL ELSE $21::timestamptz END,$21::timestamptz,$18,$19,$20)
       ON CONFLICT(user_id) DO UPDATE SET
         security_enabled=true,saved_date_enabled=EXCLUDED.saved_date_enabled,yam_enabled=EXCLUDED.yam_enabled,
         auspicious_enabled=EXCLUDED.auspicious_enabled,daily_enabled=EXCLUDED.daily_enabled,
         qimen_enabled=EXCLUDED.qimen_enabled,shrine_enabled=EXCLUDED.shrine_enabled,goal_enabled=EXCLUDED.goal_enabled,
         service_enabled=true,yam_min_quality=EXCLUDED.yam_min_quality,yam_lead_minutes=EXCLUDED.yam_lead_minutes,
         daily_slot=EXCLUDED.daily_slot,quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,
         max_per_day=EXCLUDED.max_per_day,paused_until=EXCLUDED.paused_until,
         qimen_latitude=COALESCE(EXCLUDED.qimen_latitude,mobile_notification_prefs.qimen_latitude),
         qimen_longitude=COALESCE(EXCLUDED.qimen_longitude,mobile_notification_prefs.qimen_longitude),
         qimen_location_updated_at=CASE WHEN EXCLUDED.qimen_latitude IS NULL
           THEN mobile_notification_prefs.qimen_location_updated_at ELSE EXCLUDED.qimen_location_updated_at END,
         privacy_preview=EXCLUDED.privacy_preview,locale=EXCLUDED.locale,timezone=EXCLUDED.timezone,updated_at=EXCLUDED.updated_at
       RETURNING security_enabled,saved_date_enabled,yam_enabled,auspicious_enabled,daily_enabled,
                 qimen_enabled,shrine_enabled,goal_enabled,service_enabled,yam_min_quality,yam_lead_minutes,daily_slot,
                 quiet_start,quiet_end,max_per_day,paused_until,privacy_preview,locale,timezone`,
      [
        userId,
        typeof body.savedDate === "boolean" ? body.savedDate : current.saved_date_enabled,
        typeof body.yam === "boolean" ? body.yam : current.yam_enabled,
        shrine,
        typeof body.daily === "boolean" ? body.daily : current.daily_enabled,
        typeof body.qimen === "boolean" ? body.qimen : current.qimen_enabled,
        shrine,
        typeof body.goal === "boolean" ? body.goal : current.goal_enabled,
        body.yamMinQuality === "good" || body.yamMinQuality === "best" ? body.yamMinQuality : current.yam_min_quality,
        [15, 30, 60].includes(Number(body.yamLeadMinutes)) ? Number(body.yamLeadMinutes) : current.yam_lead_minutes,
        body.dailySlot === "morning" || body.dailySlot === "evening" || body.dailySlot === "both" ? body.dailySlot : current.daily_slot,
        intInRange(body.quietStart, 0, 23) ?? current.quiet_start,
        intInRange(body.quietEnd, 0, 23) ?? current.quiet_end,
        intInRange(body.maxPerDay, 0, 10) ?? current.max_per_day,
        pausedUntil,
        qimenLatitude,
        qimenLongitude,
        typeof body.privacyPreview === "boolean" ? body.privacyPreview : current.privacy_preview,
        localeInput,
        timezoneInput,
        at.toISOString(),
      ],
    );
    const qimenSchema = await client.query<{ available: boolean }>(
      `SELECT to_regclass('mobile_qimen_installations') IS NOT NULL AS available`,
    );
    if (qimenSchema.rows[0]?.available === true) {
      await client.query(
        `INSERT INTO mobile_qimen_installations
           (user_id,installation_id,enabled,purpose,quiet_start,quiet_end,location_permission,
            latitude,longitude,location_timezone,location_captured_at,location_expires_at,next_due_at,updated_at)
         SELECT t.user_id,t.installation_id,
                (t.qimen_payload_schema=3 AND np.qimen_enabled
                  AND np.qimen_latitude IS NOT NULL AND np.qimen_longitude IS NOT NULL
                  AND np.qimen_location_updated_at>$2::timestamptz-interval '7 days'),
                'travel',np.quiet_start,np.quiet_end,
                CASE WHEN np.qimen_location_updated_at IS NULL THEN 'unknown' ELSE 'foreground' END,
                CASE WHEN np.qimen_location_updated_at IS NULL THEN NULL ELSE np.qimen_latitude END,
                CASE WHEN np.qimen_location_updated_at IS NULL THEN NULL ELSE np.qimen_longitude END,
                CASE WHEN np.qimen_location_updated_at IS NULL THEN NULL ELSE np.timezone END,
                np.qimen_location_updated_at,
                CASE WHEN np.qimen_location_updated_at IS NULL THEN NULL
                  ELSE np.qimen_location_updated_at+interval '7 days' END,
                CASE WHEN t.qimen_payload_schema=3 AND np.qimen_enabled
                  AND np.qimen_latitude IS NOT NULL AND np.qimen_longitude IS NOT NULL
                  AND np.qimen_location_updated_at>$2::timestamptz-interval '7 days' THEN $2::timestamptz ELSE NULL END,
                $2::timestamptz
           FROM mobile_push_tokens t JOIN mobile_notification_prefs np ON np.user_id=t.user_id
          WHERE t.user_id=$1 AND t.enabled=true
         ON CONFLICT(user_id,installation_id) DO UPDATE SET
           enabled=EXCLUDED.enabled,quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,
           location_permission=EXCLUDED.location_permission,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
           location_timezone=EXCLUDED.location_timezone,location_captured_at=EXCLUDED.location_captured_at,
           location_expires_at=EXCLUDED.location_expires_at,next_due_at=EXCLUDED.next_due_at,
           lease_token=NULL,lease_expires_at=NULL,last_skip_reason=NULL,
           owner_generation=mobile_qimen_installations.owner_generation+1,updated_at=EXCLUDED.updated_at`,
        [userId, at.toISOString()],
      );
    }
    await client.query("COMMIT");
    return saved.rows[0];
  } catch (error) {
    await rollback(client);
    throw error;
  } finally {
    client.release();
  }
}

export { DEFAULT_PREFERENCES };
