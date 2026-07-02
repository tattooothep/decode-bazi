/**
 * GET /api/houses · list houses
 * POST /api/houses · create (enforce tier limit · free=1 / pro=999)
 *
 * Source: อาเจ๊กฮ้ง compass_pages · port → Next.js 17 พ.ค. 2026
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

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
  // tier info
  const tierRow = await q1<{ tier: string; count: number }>(
    `SELECT COALESCE(s.tier, 'free') AS tier,
            (SELECT COUNT(*) FROM ka_houses WHERE user_id = $1)::int AS count
     FROM (SELECT $1::text AS user_id) u
     LEFT JOIN ka_user_sub s ON s.user_id = u.user_id`,
    [s.userId]
  );
  return NextResponse.json({
    houses: rows,
    tier: tierRow?.tier || 'free',
    count: tierRow?.count || 0,
    limit: (tierRow?.tier === 'free') ? 1 : 999,
  });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  // tier limit
  const tierRow = await q1<{ tier: string; count: number }>(
    `SELECT COALESCE(s.tier, 'free') AS tier,
            (SELECT COUNT(*) FROM ka_houses WHERE user_id = $1)::int AS count
     FROM (SELECT $1::text AS user_id) u
     LEFT JOIN ka_user_sub s ON s.user_id = u.user_id`,
    [s.userId]
  );
  const tier = tierRow?.tier || 'free';
  const count = tierRow?.count || 0;
  const limit = tier === 'free' ? 1 : 999;
  if (count >= limit) {
    return NextResponse.json({
      error: 'House limit reached',
      message: `Free tier เก็บได้ 1 บ้าน · upgrade เป็น Pro เพื่อบันทึกได้ไม่จำกัด`,
      current: count, limit,
    }, { status: 403 });
  }

  const b = await req.json().catch(() => ({} as any));
  const { name, note, lat, lng, address, face_angle, sit_angle,
          facing_mountain, facing_direction, method,
          start_lat, start_lng, end_lat, end_lng,
          floor_plan_url, family_members, is_primary } = b;

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
       floor_plan_url ?? null, JSON.stringify(family_members ?? [])]
    );
    return NextResponse.json({ house: row }, { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') return NextResponse.json({ error: 'House name already exists' }, { status: 409 });
    console.error("[houses] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
