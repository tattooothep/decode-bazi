/**
 * POST /api/push/test · Web Push Phase C (r380)
 * ยิงแจ้งเตือนทดสอบหาตัวเอง "ทดสอบการแจ้งเตือน 🔔"
 * ข้ามเช็ค pref/quiet hours (user กดเองต้องเห็นทันที) · rate limit กันสแปม
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { sendToUser } from "@/lib/push-sender";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const r = await rateLimit("push-test:" + session.userId, 5, 60_000);
  if (!r.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const r2 = await rateLimit("push-test-ip:" + clientIp(req), 10, 60_000);
  if (!r2.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const report = await sendToUser(
    session.userId,
    {
      title: "hourkey",
      body: "ทดสอบการแจ้งเตือน 🔔 ถ้าเห็นข้อความนี้ = ระบบพร้อมใช้งาน",
      url: "/account.html",
      tag: "test",
    },
    { skipPrefCheck: true }
  );
  if (report.skipped === "no_subscription") {
    return NextResponse.json({ error: "no_subscription", ...report }, { status: 404 });
  }
  if (report.skipped === "no_vapid") {
    return NextResponse.json({ error: "push_not_configured", ...report }, { status: 503 });
  }
  return NextResponse.json({ ok: report.sent > 0, ...report });
}
