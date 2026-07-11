/* GET /api/palmistry/list?profile_id=X · รายการลายมือที่บันทึกของดวงนั้น (ให้หน้า palmistry จัดการเพิ่ม/ลบ)
 * ไม่ส่ง reading เต็ม (เบา) · แค่ metadata ให้ทำ list · เจ้าของบัญชีเท่านั้น
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { publicAiPayload } from "@/lib/public-ai-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const pid = (new URL(req.url).searchParams.get("profile_id") || "").trim();
  try {
    const rows = pid
      ? await q<{ id: string; lang: string; clarity: number | null; engine: string | null; created_at: string }>(
          `SELECT id, lang, clarity, engine, created_at FROM palm_readings
           WHERE user_id = $1 AND profile_id = $2::uuid ORDER BY created_at DESC LIMIT 50`,
          [sess.userId, pid]
        )
      : await q<{ id: string; lang: string; clarity: number | null; engine: string | null; created_at: string }>(
          `SELECT id, lang, clarity, engine, created_at FROM palm_readings
           WHERE user_id = $1 AND profile_id IS NULL ORDER BY created_at DESC LIMIT 50`,
          [sess.userId]
        );
    return NextResponse.json(publicAiPayload({ ok: true, readings: rows }));
  } catch (e) {
    console.error("[palmistry/list]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 500 });
  }
}
