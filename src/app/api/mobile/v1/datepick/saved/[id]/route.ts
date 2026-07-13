import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function cleanUuid(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export async function DELETE(req: Request, ctx: Ctx) {
  const session = await getMobileSession(req);
  if (!session?.orgId) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const limited = await rateLimit(`mobile-datepick-delete:${clientIp(req)}:${session.userId}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "ลบฤกษ์ที่บันทึกถี่เกินไป" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const { id: rawId } = await ctx.params;
  const id = cleanUuid(rawId);
  if (!id) return NextResponse.json({ ok: false, error: "saved_date_id_invalid" }, { status: 400 });

  const deleted = await q1<{ id: string }>(
    `DELETE FROM mobile_saved_dates
      WHERE id=$1 AND org_id=$2 AND user_id=$3
      RETURNING id`,
    [id, session.orgId, session.userId]
  );
  if (!deleted) return NextResponse.json({ ok: false, error: "saved_date_not_found" }, { status: 404 });

  return NextResponse.json(
    { ok: true, deleted: true, id: deleted.id },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
