import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { getProductAccess } from "@/lib/product-entitlement";
import { MOUNTAINS_24 } from "@/lib/luopan/mountains";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session?.orgId) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const access = await getProductAccess(session.userId);
  if (!access) return NextResponse.json({ ok: false, error: "account unavailable" }, { status: 403 });

  const [profiles, houses] = await Promise.all([
    q(
      `SELECT id,name,nickname,gender,birth_datetime,birth_time_known,
              (relationship_type IS NULL OR btrim(relationship_type)='') AS is_self
         FROM profiles
        WHERE org_id=$1 AND created_by_user_id=$2 AND COALESCE(is_archived,false)=false
        ORDER BY CASE WHEN relationship_type IS NULL OR btrim(relationship_type)='' THEN 0 ELSE 1 END,created_at DESC`,
      [session.orgId, session.userId]
    ),
    q(
      `SELECT id,name,is_primary,lat,lng,address,face_angle,sit_angle,facing_mountain,
              facing_direction,method,start_lat,start_lng,end_lat,end_lng,floor_plan_url,family_members,created_at,updated_at
         FROM ka_houses WHERE user_id=$1 ORDER BY is_primary DESC,last_used_at DESC NULLS LAST`,
      [session.userId]
    ),
  ]);

  return NextResponse.json({
    ok: true,
    contract_version: access.pages ? "mobile-luopan-v1" : "unavailable",
    formula_version: "luopan-core-v1-xuankong-chart-v1",
    north_reference_default: "magnetic",
    ring_reference: {
      mountains_24: MOUNTAINS_24.map(({ name,code,elementZh,trigram,yuan,yinYang,centerDeg,dir8 }) => ({ name,code,elementZh,trigram,yuan,yinYang,centerDeg,dir8 })),
    },
    profiles,
    houses,
    entitlement: {
      plan: access.plan,
      house_limit: access.house_limit,
      mode: access.luopan_mode,
      pins: access.luopan_pins,
      vision: access.pages.luopan.vision,
      vision_limit: access.luopan_vision_max,
      sifu: access.pages.luopan.sifu,
      multi_profile: access.pages.fengshui.multi_profile,
    },
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
