/**
 * POST /api/push/subscribe · Web Push Phase C (r380)
 * บันทึก PushSubscription ของ browser (upsert ด้วย endpoint unique)
 * endpoint ย้ายเจ้าของได้ (เครื่องเดียว login สลับบัญชี → ผูกกับบัญชีล่าสุด)
 */
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const r = rateLimit("push-sub:" + clientIp(req), 20, 60_000);
  if (!r.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sub = (body.subscription || body) as Record<string, unknown>;
  const endpoint = String(sub.endpoint || "").slice(0, 1500);
  const keys = (sub.keys || {}) as Record<string, unknown>;
  const p256dh = String(keys.p256dh || "").slice(0, 300);
  const auth = String(keys.auth || "").slice(0, 100);

  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) {
    return NextResponse.json({ error: "bad_subscription" }, { status: 400 });
  }
  const ua = (req.headers.get("user-agent") || "").slice(0, 400);

  await q(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, ua)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id=EXCLUDED.user_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth,
           ua=EXCLUDED.ua, fail_count=0`,
    [session.userId, endpoint, p256dh, auth, ua]
  );
  return NextResponse.json({ ok: true });
}
