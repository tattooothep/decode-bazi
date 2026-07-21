/**
 * GET /api/push/vapid-key · Web Push Phase C (r380)
 * คืน VAPID public key ให้ browser ใช้ subscribe (public key เปิดเผยได้ · ไม่ใช่ secret)
 * ต้อง login (กัน scrape เปล่าประโยชน์) + rate limit เบา
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { getVapidPublicKey } from "@/lib/push-sender";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const r = await rateLimit("push-vapid:" + clientIp(req), 30, 60_000);
  if (!r.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const key = getVapidPublicKey();
  if (!key) return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  return NextResponse.json({ key }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
