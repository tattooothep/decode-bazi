/**
 * GET /api/houses · list houses
 * POST /api/houses · create (enforce product entitlement house_limit)
 *
 * Source: อาเจ๊กฮ้ง compass_pages · port → Next.js 17 พ.ค. 2026
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { getProductAccess, entitlementDenied } from "@/lib/product-entitlement";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const rows = await q(
    `SELECT id, name, is_primary, note, lat, lng, address,
            face_angle, sit_angle, facing_mountain, facing_direction,
            method, floor_plan_url, family_members,
            created_at, updated_at, last_used_at
     FROM ka_houses WHERE user_id = $1
     ORDER BY is_primary DESC, last_used_at DESC`,
    [s.userId]
  );
  const access = await getProductAccess(s.userId);
  const count = rows.length;
  return NextResponse.json({
    houses: rows,
    tier: access?.tier || "free",
    plan: access?.plan || "free",
    count,
    limit: access?.house_limit ?? 1,
  });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const access = await getProductAccess(s.userId);
  const limit = access?.house_limit ?? 0;
  const countRow = await q1<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM ka_houses WHERE user_id=$1`,
    [s.userId]
  );
  const count = countRow?.n ?? 0;
  if (count >= limit) {
    return NextResponse.json({
      ...entitlementDenied("house_limit", {
        message:
          limit <= 0
            ? "โหมดฟรีหลังทดลอง · บันทึกบ้านเพิ่มไม่ได้ · อัปเกรดที่ /pricing"
            : `บันทึกบ้านได้สูงสุด ${limit} หลังในแพ็กเกจปัจจุบัน · อัปเกรดที่ /pricing`,
        current: count,
        limit,
        plan: access?.plan,
      }),
    }, { status: 403 });
  }

  const b = await req.json().catch(() => ({} as any));
  const { name, note, lat, lng, address, face_angle, sit_angle,
          facing_mountain, facing_direction, method,
          start_lat, start_lng, end_lat, end_lng,
          floor_plan_url, family_members, is_primary } = b;

  const family = Array.isArray(family_members) ? family_members : [];
  const familyLimit = access?.pages.fengshui.multi_profile ? 30 : 1;
  if (family.length > familyLimit) {
    return NextResponse.json(
      entitlementDenied("fengshui_multi_profile_locked", {
        plan: access?.plan || "free",
        requested: family.length,
        max: familyLimit,
      }),
      { status: 403 }
    );
  }

  if (!name || lat === undefined || lng === undefined || face_angle === undefined) {
    return NextResponse.json({ error: 'Missing required: name, lat, lng, face_angle' }, { status: 400 });
  }

  if (is_primary) {
    await q(`UPDATE ka_houses SET is_primary = false WHERE user_id = $1`, [s.userId]);
  }

  const sit = sit_angle ?? ((face_angle + 180) % 360);
  try {
    const row = await q1(
      `INSERT INTO ka_houses
       (user_id, name, note, is_primary, lat, lng, address,
        face_angle, sit_angle, facing_mountain, facing_direction,
        method, start_lat, start_lng, end_lat, end_lng,
        floor_plan_url, family_members)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)
       RETURNING *`,
      [s.userId, name, note ?? null, !!is_primary,
       lat, lng, address ?? null,
       face_angle, sit, facing_mountain ?? null, facing_direction ?? null,
       method ?? 'two_pin', start_lat ?? null, start_lng ?? null, end_lat ?? null, end_lng ?? null,
       floor_plan_url ?? null, JSON.stringify(family)]
    );
    return NextResponse.json({ house: row }, { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') return NextResponse.json({ error: 'House name already exists' }, { status: 409 });
    console.error("[houses] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
