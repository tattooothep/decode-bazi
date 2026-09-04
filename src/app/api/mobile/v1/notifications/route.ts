/**
 * ศูนย์แจ้งเตือนในแอพ — ประวัติจริง 9 หมวดและการตั้งค่าบัญชี
 * GET  ?kind=all|<category>&limit= → รายการที่ผู้ให้บริการรับแล้ว + จำนวนที่ยังไม่อ่าน + ตั้งค่า
 * POST {action:"read", ids?:[]} → ทำเครื่องหมายอ่านแล้ว (ไม่ส่ง ids = อ่านทั้งหมด)
 *      {action:"engagement", notificationId, installationId,
 *       event:"app_received"|"opened"|"action", actionId?} → หลักฐานจาก callback ในแอพ
 *        (`app_received` ไม่ใช่หลักฐานว่า OS แสดงผลสำเร็จ)
 *      {action:"prefs", savedDate?|yam?|daily?|qimen?|shrine?|goal?:bool,
 *                        yamMinQuality?, yamLeadMinutes?, dailySlot?,
 *                        quietStart?:0-23, quietEnd?:0-23, maxPerDay?:0-10,
 *                        pauseDays?:number, muteToday?:true, resume?:true,
 *                        locale?:AppLocale, timezone?:IANA zone} → บันทึกตั้งค่าและบริบทบัญชี
 *        (quietStart=quietEnd คือไม่ตั้งช่วงห้ามรบกวน · pauseDays=พักกี่วัน · resume=เลิกพัก)
 * ห้ามปั้นข้อมูล: รายการมาจาก mobile_push_log ที่ตัวยิงจริงเขียนไว้เท่านั้น
 */
import { NextResponse } from "next/server";
import { pool, q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  qimenLocationLeaseStatus,
  updateNotificationPreferences,
  type MobileNotificationPreferenceRow as PrefRow,
} from "@/lib/mobile-notification-preferences";
import {
  recordNotificationEngagement,
  type NotificationEngagementEvent,
} from "@/lib/mobile-notification-engagement";
import { notificationHistoryPayload } from "@/lib/mobile-notification-history";
import zibaiPayloadProjection from "@/lib/zibai-payload-projection.cjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = new Set([
  "security", "saved_date", "daily", "yam", "qimen", "shrine", "goal", "service", "zibai", "ziwei",
  // legacy rows remain readable after the category split
  "auspicious", "network",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENGAGEMENT_EVENTS = new Set<NotificationEngagementEvent>(["app_received", "opened", "action"]);
const ACTION_ID_RE = /^[a-z][a-z0-9_]{0,63}$/u;
type LogRow = {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  payload: unknown;
  delivery_status: "accepted" | "delivered";
  sent_at: string;
  read_at: string | null;
};

async function authorize(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return { ok: false as const, error: "not_authorized", status: 401 };
  const rl = await rateLimit(`mobile-notif:${session.userId}:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return { ok: false as const, error: "rate_limited", status: 429 };
  return { ok: true as const, session };
}

async function readPrefs(userId: string): Promise<PrefRow> {
  const row = await q1<PrefRow>(
    `SELECT np.security_enabled,np.saved_date_enabled,np.yam_enabled,np.auspicious_enabled,np.daily_enabled,
            np.qimen_enabled,np.ziwei_hourly_enabled,np.ziwei_profile_id,np.qizheng_electional_enabled,
            np.shrine_enabled,np.goal_enabled,np.service_enabled,
            np.yam_min_quality,np.yam_lead_minutes,np.daily_slot,
            np.quiet_start,np.quiet_end,np.max_per_day,np.paused_until,
            np.qimen_latitude,np.qimen_longitude,np.qimen_location_updated_at,np.privacy_preview,
            CASE WHEN lower(COALESCE(NULLIF(btrim(to_jsonb(u)->>'locale'),''),NULLIF(btrim(np.locale),''),'th'))
                       IN ('th','en','zh','cn','vi','ja','ru','ko','es')
                 THEN lower(COALESCE(NULLIF(btrim(to_jsonb(u)->>'locale'),''),NULLIF(btrim(np.locale),''),'th'))
                 ELSE 'th' END AS locale,
            COALESCE(np.timezone,u.timezone,'Asia/Bangkok') AS timezone
       FROM users u LEFT JOIN mobile_notification_prefs np ON np.user_id=u.id WHERE u.id=$1`,
    [userId],
  );
  // 🔴 ยังไม่เคยตั้งค่า = ยังไม่ยินยอม (ค่าเริ่มต้นเป็นปิด ตรงกับตัวคุมกลาง push-guard)
  // ของเดิมคืน true ทั้งสามหมวด ทำให้หน้าแอพโชว์สวิตช์เปิดทั้งที่เซิร์ฟเวอร์ไม่ส่งจริง
  return row?.security_enabled !== null && row?.security_enabled !== undefined ? row : {
    security_enabled: true,
    saved_date_enabled: false,
    yam_enabled: false,
    auspicious_enabled: false,
    daily_enabled: false,
    qimen_enabled: false,
    ziwei_hourly_enabled: false,
    ziwei_profile_id: null,
    qizheng_electional_enabled: false,
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
    qimen_latitude: null,
    qimen_longitude: null,
    qimen_location_updated_at: null,
    privacy_preview: false,
    locale: row?.locale || "th",
    timezone: row?.timezone || "Asia/Bangkok",
  };
}

/** รูปแบบเดียวที่ส่งให้แอพ — ใช้ทั้งตอนอ่านและตอนบันทึก จะได้ไม่มีวันไม่ตรงกัน */
function prefsPayload(row: PrefRow) {
  const until = row.paused_until;
  const untilIso = until === null || until === undefined
    ? null
    : (until instanceof Date ? until : new Date(String(until))).toISOString();
  const qimenLocation = qimenLocationLeaseStatus(row);
  return {
    security: true,
    savedDate: row.saved_date_enabled,
    yam: row.yam_enabled,
    daily: row.daily_enabled,
    qimen: row.qimen_enabled,
    qimenLocationFresh: qimenLocation.fresh,
    qimenLocationExpiresAt: qimenLocation.expiresAt,
    ziweiHourly: row.ziwei_hourly_enabled,
    ziweiProfileId: row.ziwei_profile_id,
    qizhengElectional: false,
    qizhengElectionalAvailable: false,
    shrine: row.shrine_enabled,
    goal: row.goal_enabled,
    service: true,
    // Kept for V190/V191 clients; this is now the shrine-calendar switch.
    auspicious: row.shrine_enabled,
    yamMinQuality: row.yam_min_quality,
    yamLeadMinutes: row.yam_lead_minutes,
    dailySlot: row.daily_slot,
    quietStart: row.quiet_start,
    quietEnd: row.quiet_end,
    maxPerDay: row.max_per_day,
    pausedUntil: untilIso,
    privacyPreview: row.privacy_preview,
    locale: row.locale,
  };
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { session } = auth;
  let requestedZibaiSchema: 1 | 2;
  try {
    requestedZibaiSchema = zibaiPayloadProjection.parseRequestedZibaiSchema(
      req.headers.get("X-Hourkey-Zibai-Schema"),
    );
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_zibai_schema" }, { status: 400 });
  }
  const url = new URL(req.url);
  const kindParam = (url.searchParams.get("kind") || "all").trim();
  const kind = kindParam === "all" ? null : KINDS.has(kindParam) ? kindParam : null;
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 50;

  const rows = await q<LogRow>(
    `SELECT id, kind, title, body, payload, delivery_status, sent_at, read_at
       FROM mobile_push_log
      WHERE user_id=$1
        AND delivery_status IN ('accepted','delivered')
        AND ($2::text IS NULL OR kind=$2)
      ORDER BY sent_at DESC
      LIMIT $3`,
    [session.userId, kind, limit],
  );
  const unread = await q1<{ n: number }>(
    `SELECT count(*)::int AS n FROM mobile_push_log
      WHERE user_id=$1 AND delivery_status IN ('accepted','delivered') AND read_at IS NULL`,
    [session.userId],
  );
  const prefs = await readPrefs(session.userId);
  return NextResponse.json(
    {
      ok: true,
      items: rows.map((r) => {
        const projectedPayload = r.kind === "zibai"
          ? zibaiPayloadProjection.projectZibaiPayload(r.payload, requestedZibaiSchema)
          : r.payload;
        return {
          id: r.id,
          kind: r.kind,
          title: r.title || "",
          body: r.body || "",
          payload: notificationHistoryPayload(r.id, projectedPayload),
          delivery_status: r.delivery_status,
          sent_at: r.sent_at,
          read: r.read_at !== null,
        };
      }),
      unread: unread?.n || 0,
      prefs: prefsPayload(prefs),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { session } = auth;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "read") {
    const raw = Array.isArray(body?.ids) ? (body.ids as unknown[]) : null;
    if (raw) {
      const ids = raw.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)).slice(0, 200);
      if (!ids.length) return NextResponse.json({ ok: false, error: "invalid_ids" }, { status: 400 });
      await q(`UPDATE mobile_push_log SET read_at=now()
                WHERE user_id=$1 AND delivery_status IN ('accepted','delivered')
                  AND id = ANY($2::uuid[]) AND read_at IS NULL`, [
        session.userId,
        ids,
      ]);
    } else {
      await q(`UPDATE mobile_push_log SET read_at=now()
                WHERE user_id=$1 AND delivery_status IN ('accepted','delivered') AND read_at IS NULL`, [session.userId]);
    }
    const unread = await q1<{ n: number }>(
      `SELECT count(*)::int AS n FROM mobile_push_log
        WHERE user_id=$1 AND delivery_status IN ('accepted','delivered') AND read_at IS NULL`,
      [session.userId],
    );
    return NextResponse.json({ ok: true, unread: unread?.n || 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "engagement") {
    const notificationId = typeof body?.notificationId === "string" ? body.notificationId : "";
    const installationId = typeof body?.installationId === "string" ? body.installationId : "";
    const event = typeof body?.event === "string" && ENGAGEMENT_EVENTS.has(body.event as NotificationEngagementEvent)
      ? body.event as NotificationEngagementEvent
      : null;
    const actionId = typeof body?.actionId === "string" ? body.actionId : "";
    const validAction = event === "action"
      ? ACTION_ID_RE.test(actionId)
      : body?.actionId === undefined && actionId === "";
    if (!UUID_RE.test(notificationId) || !UUID_RE.test(installationId) || event === null || !validAction) {
      return NextResponse.json({ ok: false, error: "invalid_engagement" }, { status: 400 });
    }
    try {
      const result = await recordNotificationEngagement(pool, session.userId, {
        notificationId, installationId, event, actionId,
      });
      if (result === "not_found") {
        return NextResponse.json({ ok: false, error: "notification_not_found" }, { status: 404 });
      }
      return NextResponse.json(
        { ok: true, recorded: result === "recorded" },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json({ ok: false, error: "notification_engagement_failed" }, { status: 500 });
    }
  }

  if (action === "prefs") {
    const hasQimenLatitude = body?.qimenLatitude !== undefined;
    const hasQimenLongitude = body?.qimenLongitude !== undefined;
    if (hasQimenLatitude !== hasQimenLongitude) {
      return NextResponse.json({ ok: false, error: "qimen_location_incomplete" }, { status: 400 });
    }
    const qimenLatitude = hasQimenLatitude ? Number(body?.qimenLatitude) : null;
    const qimenLongitude = hasQimenLongitude ? Number(body?.qimenLongitude) : null;
    if (
      hasQimenLatitude
      && (!Number.isFinite(qimenLatitude) || qimenLatitude! < -90 || qimenLatitude! > 90
        || !Number.isFinite(qimenLongitude) || qimenLongitude! < -180 || qimenLongitude! > 180)
    ) {
      return NextResponse.json({ ok: false, error: "qimen_location_invalid" }, { status: 400 });
    }
    try {
      const saved = await updateNotificationPreferences(pool, session.userId, session.orgId, body || {});
      return NextResponse.json(
        { ok: true, prefs: prefsPayload(saved) },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof TypeError) {
        return NextResponse.json({ ok: false, error: "notification_preferences_invalid" }, { status: 400 });
      }
      return NextResponse.json({ ok: false, error: "notification_preferences_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
