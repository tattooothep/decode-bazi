import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

type MobileProfileRow = {
  id: string;
  name: string;
  nickname: string | null;
  birth_datetime: string | null;
  birth_lat: number | null;
  birth_lng: number | null;
  birth_location_name: string | null;
  gender: string | null;
  relationship_type: string | null;
  network_group: string | null;
  network_group_label: string | null;
  day_master: string | null;
  day_master_strength: string | null;
  yongshen: unknown;
  bazi_pillars: unknown;
  birth_time_known: boolean | null;
  day_boundary: string | null;
  is_self: boolean;
};

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const rows = await q<MobileProfileRow>(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime,
            birth_lat, birth_lng, birth_location_name, gender,
            relationship_type, network_group, network_group_label,
            day_master, day_master_strength, yongshen, bazi_pillars,
            birth_time_known, day_boundary,
            (created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '')) AS is_self
       FROM profiles
      WHERE org_id=$1
        AND COALESCE(is_archived, false)=false
      ORDER BY
        CASE WHEN created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '') THEN 0 ELSE 1 END,
        created_at DESC`,
    [session.orgId, session.userId]
  );

  const activeProfile = rows.find((profile) => profile.is_self) || rows[0] || null;
  return NextResponse.json(
    {
      ok: true,
      count: rows.length,
      active_profile: activeProfile,
      profiles: rows,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
