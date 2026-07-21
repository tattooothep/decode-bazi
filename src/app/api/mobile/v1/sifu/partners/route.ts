// GET /api/mobile/v1/sifu/partners — ⑭ ตลาดซินแสตัวจริง เฟส 1 (21 ก.ค. 2569)
// รายชื่อซินแสที่อนุมัติ+เปิดรับ พร้อมคะแนนรีวิวเฉลี่ย — ยังไม่มีซินแส = คืน [] (แอพซ่อนการ์ดเอง กันปุ่มหลอก)
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PartnerRow = {
  id: string;
  name: string;
  name_i18n: Record<string, string> | null;
  bio: string;
  bio_i18n: Record<string, string> | null;
  sciences: string[];
  price_min_thb: number;
  price_max_thb: number;
  session_minutes: number;
  avail_note: string | null;
  rating: string | null;
  reviews: string;
};

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const rows = await q<PartnerRow>(
    `SELECT p.id, p.name, p.name_i18n, p.bio, p.bio_i18n, p.sciences,
            p.price_min_thb, p.price_max_thb, p.session_minutes, p.avail_note,
            ROUND(AVG(r.rating)::numeric, 1)::text AS rating, COUNT(r.id)::text AS reviews
       FROM sifu_partners p
       LEFT JOIN sifu_reviews r ON r.partner_id = p.id
      WHERE p.approved AND p.active
      GROUP BY p.id
      ORDER BY COUNT(r.id) DESC, p.created_at ASC`,
    []
  );
  return NextResponse.json(
    {
      ok: true,
      partners: rows.map((p) => ({
        id: p.id,
        name: p.name,
        nameI18n: p.name_i18n || undefined,
        bio: p.bio,
        bioI18n: p.bio_i18n || undefined,
        sciences: p.sciences,
        priceMinThb: p.price_min_thb,
        priceMaxThb: p.price_max_thb,
        sessionMinutes: p.session_minutes,
        availNote: p.avail_note || "",
        rating: p.rating ? Number(p.rating) : null,
        reviews: Number(p.reviews),
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
