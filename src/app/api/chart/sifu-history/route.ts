import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanUuid(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s : null;
}

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const url = new URL(req.url);
  const profileId = cleanUuid(url.searchParams.get("profile_id"));
  const limitRaw = Number(url.searchParams.get("limit") || 20);
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 20));

  const rows = await q(
    `SELECT id, profile_id, pillars_hash, lang, lp_idx, cy_year,
            question, answer, daymaster_profile_key, created_at
       FROM chart_sifu_history
      WHERE user_id=$1
        AND is_archived=false
        AND ($2::uuid IS NULL OR profile_id=$2::uuid)
      ORDER BY created_at DESC
      LIMIT $3`,
    [s.userId, profileId, limit]
  );

  return NextResponse.json(
    { history: rows },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function DELETE(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const url = new URL(req.url);
  const id = cleanUuid(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const row = await q1<{ id: string }>(
    `UPDATE chart_sifu_history
        SET is_archived=true, updated_at=now()
      WHERE id=$1 AND user_id=$2 AND is_archived=false
      RETURNING id`,
    [id, s.userId]
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: row.id });
}
