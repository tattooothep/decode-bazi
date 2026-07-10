/**
 * POST /api/push/unsubscribe · Web Push Phase C (r380)
 * ลบ subscription ตาม endpoint (ลบได้เฉพาะของตัวเอง)
 * ไม่ส่ง endpoint = ลบทุกเครื่องของ user (ปิดสวิตช์หลัก)
 */
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const r = await rateLimit("push-unsub:" + clientIp(req), 20, 60_000);
  if (!r.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const endpoint = String(body.endpoint || "").slice(0, 1500);

  if (endpoint) {
    await q(`DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`, [session.userId, endpoint]);
  } else {
    await q(`DELETE FROM push_subscriptions WHERE user_id=$1`, [session.userId]);
  }
  return NextResponse.json({ ok: true });
}
