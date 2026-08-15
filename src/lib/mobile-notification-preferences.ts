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
});

function intInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

function endOfLocalDay(timezone: string | null, at: Date): Date {
  const tz = String(timezone || "").trim() || "Asia/Bangkok";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(at);
    const match = /^(\d{2}):(\d{2})$/u.exec(parts.trim());
    if (!match) return new Date(at.valueOf() + 6 * 3_600_000);
    const minutesLeft = 24 * 60 - (Number(match[1]) * 60 + Number(match[2]));
    return new Date(at.valueOf() + minutesLeft * 60_000);
  } catch {
    return new Date(at.valueOf() + 6 * 3_600_000);
  }
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
    const selected = await client.query<MobileNotificationPreferenceRow & { effective_timezone: string | null }>(
      `SELECT np.security_enabled,np.saved_date_enabled,np.yam_enabled,np.auspicious_enabled,np.daily_enabled,
              np.qimen_enabled,np.shrine_enabled,np.goal_enabled,np.service_enabled,
              np.yam_min_quality,np.yam_lead_minutes,np.daily_slot,np.quiet_start,np.quiet_end,np.max_per_day,
              np.paused_until,np.privacy_preview,np.locale,COALESCE(np.timezone,u.timezone) AS effective_timezone
         FROM users u LEFT JOIN mobile_notification_prefs np ON np.user_id=u.id
        WHERE u.id=$1 FOR UPDATE OF u`,
      [userId],
    );
    if (!selected.rows[0]) throw new Error("notification_account_not_found");
    const selectedRow = selected.rows[0];
    const current: MobileNotificationPreferenceRow = selectedRow.security_enabled === null
      || selectedRow.security_enabled === undefined
      ? { ...DEFAULT_PREFERENCES }
      : selectedRow;

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
    else if (body.muteToday === true) pausedUntil = endOfLocalDay(selectedRow.effective_timezone, at);
    else {
      const pauseDays = intInRange(body.pauseDays, 1, 90);
      if (pauseDays !== null) pausedUntil = new Date(at.valueOf() + pauseDays * 86_400_000);
    }

    const saved = await client.query<MobileNotificationPreferenceRow>(
      `INSERT INTO mobile_notification_prefs
         (user_id,security_enabled,saved_date_enabled,yam_enabled,auspicious_enabled,daily_enabled,
          qimen_enabled,shrine_enabled,goal_enabled,service_enabled,yam_min_quality,yam_lead_minutes,daily_slot,
          quiet_start,quiet_end,max_per_day,paused_until,qimen_latitude,qimen_longitude,qimen_location_updated_at,
          updated_at,privacy_preview,locale)
       VALUES($1,true,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12,$13,$14,$15,$16,$17,
              CASE WHEN $16::float8 IS NULL THEN NULL ELSE $20::timestamptz END,$20::timestamptz,$18,$19)
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
         privacy_preview=EXCLUDED.privacy_preview,locale=EXCLUDED.locale,updated_at=EXCLUDED.updated_at
       RETURNING security_enabled,saved_date_enabled,yam_enabled,auspicious_enabled,daily_enabled,
                 qimen_enabled,shrine_enabled,goal_enabled,service_enabled,yam_min_quality,yam_lead_minutes,daily_slot,
                 quiet_start,quiet_end,max_per_day,paused_until,privacy_preview,locale`,
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
        LOCALES.has(String(body.locale || "")) ? String(body.locale) : current.locale,
        at.toISOString(),
      ],
    );
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
