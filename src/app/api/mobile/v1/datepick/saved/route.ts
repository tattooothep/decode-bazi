import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publicSavedDate, type SavedDateRow } from "../saved-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session?.orgId) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const limited = await rateLimit(`mobile-datepick-saved:${clientIp(req)}:${session.userId}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "โหลดฤกษ์ที่บันทึกถี่เกินไป" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const requestedLimit = Number(new URL(req.url).searchParams.get("limit") || 50);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 50;
  const rows = await q<SavedDateRow>(
    `SELECT id, payload, created_at::text
       FROM mobile_saved_dates
      WHERE org_id=$1 AND user_id=$2
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [session.orgId, session.userId, limit]
  );
  return NextResponse.json(
    { ok: true, count: rows.length, saved_dates: rows.map(publicSavedDate) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
