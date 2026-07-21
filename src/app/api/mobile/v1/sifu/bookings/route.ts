// GET/POST /api/mobile/v1/sifu/bookings — ⑭ ตลาดซินแสตัวจริง เฟส 1 (21 ก.ค. 2569)
// เฟสแรก = ส่งคำขอจองคิว (ไม่มีจ่ายในแอพ — ทีมงานยืนยัน+เก็บเงินก่อนนัดจริง กันปุ่มจ่ายหลอก)
// profile_id ต้องเป็นดวงของ user เอง (กัน id ดวงคนอื่นรั่วข้ามบัญชี)
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q, q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS_LABEL_KEYS = ["requested", "confirmed", "paid", "done", "cancelled"] as const;

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const rows = await q<{
    id: string;
    partner_name: string;
    status: string;
    question: string;
    preferred_times: string;
    price_thb: number | null;
    video_link: string | null;
    created_at: string;
    has_review: boolean;
  }>(
    `SELECT b.id, p.name AS partner_name, b.status, b.question, b.preferred_times,
            b.price_thb, b.video_link, b.created_at::text,
            (r.id IS NOT NULL) AS has_review
       FROM sifu_bookings b
       JOIN sifu_partners p ON p.id = b.partner_id
       LEFT JOIN sifu_reviews r ON r.booking_id = b.id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
      LIMIT 50`,
    [session.userId]
  );
  return NextResponse.json(
    {
      ok: true,
      bookings: rows.map((b) => ({
        id: b.id,
        partnerName: b.partner_name,
        status: STATUS_LABEL_KEYS.includes(b.status as (typeof STATUS_LABEL_KEYS)[number]) ? b.status : "requested",
        question: b.question,
        preferredTimes: b.preferred_times,
        priceThb: b.price_thb,
        videoLink: b.video_link || "",
        createdAt: b.created_at,
        hasReview: b.has_review,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-sifu-booking:${clientIp(req)}:${session.userId}`, 5, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }
  let body: {
    partnerId?: string;
    profileId?: string;
    shareChart?: boolean;
    question?: string;
    preferredTimes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const partnerId = String(body.partnerId || "");
  const question = String(body.question || "").trim().slice(0, 2000);
  const preferredTimes = String(body.preferredTimes || "").trim().slice(0, 500);
  if (!partnerId || !question || !preferredTimes) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
  }
  const partner = await q1<{ id: string }>(
    `SELECT id FROM sifu_partners WHERE id = $1::uuid AND approved AND active`,
    [partnerId]
  );
  if (!partner) return NextResponse.json({ ok: false, error: "partner not found" }, { status: 404 });
  let profileId: string | null = null;
  if (body.profileId) {
    const owned = await q1<{ id: string }>(
      `SELECT id FROM profiles WHERE id = $1::uuid AND org_id = $2 AND created_by_user_id = $3`,
      [String(body.profileId), session.orgId, session.userId]
    );
    if (!owned) return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
    profileId = owned.id;
  }
  const created = await q1<{ id: string }>(
    `INSERT INTO sifu_bookings (user_id, partner_id, profile_id, share_chart, question, preferred_times)
     VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6)
     RETURNING id`,
    [session.userId, partnerId, profileId, body.shareChart !== false && !!profileId, question, preferredTimes]
  );
  return NextResponse.json({ ok: true, bookingId: created?.id, status: "requested" });
}
