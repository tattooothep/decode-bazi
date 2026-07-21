import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q } from "@/lib/db";

export async function GET() {
  try {
    const s = await getSession();
    if (!s?.orgId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const rows = await q<{ id: string; name: string; nickname: string | null; is_self: boolean }>(
      `SELECT id, name, nickname,
              (relationship_type IS NULL OR btrim(relationship_type) = '') AS is_self
         FROM profiles
        WHERE created_by_user_id=$2 AND org_id=$1
          AND is_archived=false
        ORDER BY
          CASE WHEN relationship_type IS NULL OR btrim(relationship_type) = '' THEN 0 ELSE 1 END,
          COALESCE(updated_at, created_at) DESC
        LIMIT 100`,
      [s.orgId, s.userId]
    );
    return NextResponse.json({
      ok: true,
      active_profile_id: rows.find((r) => r.is_self)?.id || null,
      profile_setup_required: !rows.some((r) => r.is_self),
      profiles: rows.map((r) => ({
        id: r.id,
        is_self: r.is_self,
        name: (() => {
          const base = String(r.name || "").trim();
          const nick = String(r.nickname || "").trim();
          if (!nick) return base;
          if (nick.toLowerCase() === base.toLowerCase()) return base;
          return `${base} (${nick})`;
        })(),
      })),
    });
  } catch (e: unknown) {
    console.error("[luopan/profiles]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
