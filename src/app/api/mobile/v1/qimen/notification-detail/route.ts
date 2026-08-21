import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import detailRuntime from "@/lib/mobile-qimen-notification-detail.cjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const limited = await rateLimit(`mobile-qimen-notification:${session.userId}:${clientIp(req)}`, 30, 60_000);
  if (!limited.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const notificationId = new URL(req.url).searchParams.get("notification_id") || "";
  try {
    const detail = await detailRuntime.readQimenNotificationDetail(pool, session.userId, notificationId);
    return NextResponse.json(
      { ok: true, ...detail },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    if (error instanceof detailRuntime.QimenNotificationDetailError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "qimen_notification_detail_failed" }, { status: 500 });
  }
}
