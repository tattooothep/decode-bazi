/* DELETE /api/palmistry/[id] · ลบลายมือที่บันทึก · เจ้าของบัญชีเท่านั้น (user_id ต้องตรง)
 * GET /api/palmistry/[id] · ดึง reading เต็ม 1 รายการ (กดดูซ้ำ) · เจ้าของบัญชีเท่านั้น
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const row = await q1<{ id: string }>(
      `DELETE FROM palm_readings WHERE id = $1::uuid AND user_id = $2 RETURNING id`,
      [id, sess.userId]
    );
    if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    console.error("[palmistry/delete]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const row = await q1<{ id: string; lang: string; reading: unknown; clarity: number | null; created_at: string }>(
      `SELECT id, lang, reading, clarity, created_at FROM palm_readings
       WHERE id = $1::uuid AND user_id = $2`,
      [id, sess.userId]
    );
    if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, reading: row });
  } catch (e) {
    console.error("[palmistry/get]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
