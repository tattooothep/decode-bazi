import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, context: Context) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  const deleted = await q1<{ id:string }>(
    `DELETE FROM palm_readings WHERE id=$1::uuid AND user_id=$2 RETURNING id::text`,
    [id, session.userId]
  );
  if (!deleted) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: deleted.id });
}
