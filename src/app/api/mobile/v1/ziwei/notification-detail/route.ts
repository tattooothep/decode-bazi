import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import detailRuntime from "@/lib/mobile-ziwei-notification-detail.cjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const respond = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store, max-age=0" },
});

export async function GET(req: Request) {
  try {
    const session = await getMobileSession(req);
    if (!session) return respond({ ok: false, error: "not_authorized" }, 401);
    const limited = await rateLimit(`mobile-ziwei-notification:${session.userId}:${clientIp(req)}`, 30, 60_000);
    if (!limited.ok) return respond({ ok: false, error: "rate_limited" }, 429);
    const notificationId = new URL(req.url).searchParams.get("notification_id") || "";
    const detail = await detailRuntime.readZiweiNotificationDetail(pool, session.userId, notificationId);
    return respond({ ok: true, ...detail });
  } catch (error) {
    if (error instanceof detailRuntime.ZiweiNotificationDetailError) {
      return respond({ ok: false, error: error.code }, error.status);
    }
    return respond({ ok: false, error: "ziwei_notification_detail_failed" }, 500);
  }
}
