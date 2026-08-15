import type { Pool } from "pg";
import delivery from "./mobile-notification-delivery.cjs";
import payloadRuntime from "./notification-payload.cjs";
import guard from "./push-guard.cjs";

const FUSION_REFERENCE_RE = /^fusion\|(job|book)\|([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;

type FusionToken = {
  id: string;
  device_push_token: string | null;
  device_token_type: string | null;
  expo_push_token: string | null;
  platform: string;
  locale: string | null;
};

type FusionAccount = {
  id: string;
  has_prefs: boolean;
  service_enabled: boolean | null;
  quiet_start: number | null;
  quiet_end: number | null;
  max_per_day: number | null;
  paused_until: Date | string | null;
  user_timezone: string | null;
  sent_today: number;
};

function fusionCopy(referenceId: string, locale: unknown) {
  const family = payloadRuntime.normalizedLocale(locale);
  const isBook = referenceId.startsWith("fusion|book|");
  if (family === "zh") return isBook
    ? { title: "命理書已完成", body: "您建立的命理書已處理完成 — 開啟 HourKey 查看章節、綜合分析與重要提示" }
    : { title: "師傅分析已完成", body: "您要求的綜合命理分析已完成 — 開啟 HourKey 閱讀結果、重點與建議" };
  if (family === "en") return isBook
    ? { title: "Your astrology book is ready", body: "The book you requested is complete — open HourKey to review its chapters, synthesis and key guidance" }
    : { title: "Your Sifu analysis is ready", body: "The combined reading you requested is complete — open HourKey to review the result, key points and guidance" };
  return isBook
    ? { title: "หนังสือดวงของคุณพร้อมแล้ว", body: "หนังสือดวงที่คุณสั่งประมวลผลเสร็จแล้ว — เปิด HourKey เพื่ออ่านแต่ละบท บทสรุป และคำแนะนำสำคัญ" }
    : { title: "ผลวิเคราะห์ซินแสพร้อมแล้ว", body: "คำวิเคราะห์หลายศาสตร์ที่คุณสั่งเสร็จแล้ว — เปิด HourKey เพื่ออ่านผล ประเด็นสำคัญ และคำแนะนำ" };
}

export function buildFusionMobileNotice(userId: string, referenceId: string, tokens: FusionToken[]) {
  if (!FUSION_REFERENCE_RE.test(referenceId)) throw new TypeError("invalid fusion notification reference");
  const payload = payloadRuntime.buildNotificationPayload("service", userId, {
    event: "fusion_ready", referenceId, url: "/fusion",
  });
  const historyCopies = delivery.localizedHistoryCopies((locale: string) => fusionCopy(referenceId, locale));
  return {
    userId, key: referenceId, kind: "service", transactional: true,
    ...historyCopies.th, historyCopies, payload,
    sourceFacts: {
      resultType: referenceId.startsWith("fusion|book|") ? "book" : "fusion",
      resultId: referenceId.split("|")[2], destination: "/fusion",
    },
    messages: tokens.map((token) => {
      const locale = payloadRuntime.normalizedLocale(token.locale);
      return {
        tokenId: token.id, deviceToken: token.device_push_token,
        deviceTokenType: token.device_token_type, expoToken: token.expo_push_token,
        platform: token.platform, locale, category: "service",
        ...fusionCopy(referenceId, locale), url: "/fusion", data: payload,
      };
    }),
  };
}

export async function deliverFusionMobileNotification(
  db: Pool,
  userId: string,
  referenceId: string,
  at = new Date(),
) {
  if (!FUSION_REFERENCE_RE.test(referenceId)) return { status: "invalid", sent: 0, failed: 0 };
  const account = await db.query<FusionAccount>(
    `SELECT u.id,np.user_id IS NOT NULL AS has_prefs,np.service_enabled,np.quiet_start,np.quiet_end,
            np.max_per_day,np.paused_until,COALESCE(np.timezone,u.timezone,'Asia/Bangkok') AS user_timezone,
            (SELECT count(*)::int FROM mobile_push_log l
              WHERE l.user_id=u.id AND l.delivery_status IN ('pending','accepted','delivered')
                AND (COALESCE(l.sent_at,l.accepted_at,l.updated_at) AT TIME ZONE COALESCE(np.timezone,u.timezone,'Asia/Bangkok'))::date
                    = ($2::timestamptz AT TIME ZONE COALESCE(np.timezone,u.timezone,'Asia/Bangkok'))::date) AS sent_today
       FROM users u LEFT JOIN mobile_notification_prefs np ON np.user_id=u.id
      WHERE u.id=$1 AND u.deleted_at IS NULL`,
    [userId, at.toISOString()],
  );
  const user = account.rows[0];
  if (!user) return { status: "not_found", sent: 0, failed: 0 };
  const verdict = guard.mayNotify({
    category: "service", prefs: user.has_prefs ? user : null,
    transactional: true, webPrefs: null, timezone: user.user_timezone,
    sentToday: Number(user.sent_today || 0), at,
  });
  if (!verdict.allow) return { status: "skipped", sent: 0, failed: 0 };
  const tokens = await db.query<FusionToken>(
    `SELECT id,device_push_token,device_token_type,expo_push_token,platform,locale
       FROM mobile_push_tokens WHERE user_id=$1 AND enabled=true ORDER BY id`,
    [userId],
  );
  return delivery.deliver(db, buildFusionMobileNotice(userId, referenceId, tokens.rows), { defer: true });
}
