// POST /api/mobile/v1/sifu/reviews — ⑭ รีวิวซินแส: ต้องเป็นเจ้าของ booking ที่จบจริง (status=done) เท่านั้น
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-sifu-review:${clientIp(req)}:${session.userId}`, 5, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }
  let body: { bookingId?: string; rating?: number; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const bookingId = String(body.bookingId || "");
  const rating = Math.round(Number(body.rating));
  if (!bookingId || !(rating >= 1 && rating <= 5)) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
  }
  const booking = await q1<{ id: string; partner_id: string }>(
    `SELECT id, partner_id FROM sifu_bookings WHERE id = $1::uuid AND user_id = $2 AND status = 'done'`,
    [bookingId, session.userId]
  );
  if (!booking) return NextResponse.json({ ok: false, error: "booking not found or not done" }, { status: 404 });
  try {
    await q1(
      `INSERT INTO sifu_reviews (booking_id, user_id, partner_id, rating, comment)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5) RETURNING id`,
      [booking.id, session.userId, booking.partner_id, rating, String(body.comment || "").trim().slice(0, 1000)]
    );
  } catch {
    // UNIQUE(booking_id) — รีวิวซ้ำ
    return NextResponse.json({ ok: false, error: "already reviewed" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
