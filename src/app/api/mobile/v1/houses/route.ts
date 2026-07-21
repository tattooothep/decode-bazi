import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { entitlementDenied, getProductAccess } from "@/lib/product-entitlement";
import { degreeToDir8, findMountain24, normalizeDeg } from "@/lib/luopan/mountains";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const access = await getProductAccess(session.userId);
  const houses = await q(
    `SELECT id,name,is_primary,note,lat,lng,address,face_angle,sit_angle,
            facing_mountain,facing_direction,method,start_lat,start_lng,end_lat,end_lng,floor_plan_url,family_members,
            created_at,updated_at,last_used_at
       FROM ka_houses WHERE user_id=$1 ORDER BY is_primary DESC,last_used_at DESC`,
    [session.userId]
  );
  return NextResponse.json({ ok: true, houses, count: houses.length, limit: access?.house_limit ?? 0, plan: access?.plan || "free" },
    { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const access = await getProductAccess(session.userId);
  if (!access) return NextResponse.json({ ok: false, error: "account unavailable" }, { status: 403 });
  const count = Number((await q1<{ n: number }>(`SELECT count(*)::int n FROM ka_houses WHERE user_id=$1`, [session.userId]))?.n || 0);
  if (count >= access.house_limit) {
    return NextResponse.json(entitlementDenied("house_limit", { current: count, limit: access.house_limit, plan: access.plan }), { status: 403 });
  }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const name = String(body.name || "").trim().slice(0, 120);
  const lat = Number(body.latitude ?? body.lat);
  const lng = Number(body.longitude ?? body.lng);
  const faceAngle = Number(body.facing_deg ?? body.face_angle);
  if (!name || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180 || !Number.isFinite(faceAngle)) {
    return NextResponse.json({ ok: false, error: "name, explicit location, and facing_deg required" }, { status: 400 });
  }
  const facing = normalizeDeg(faceAngle);
  const sitting = normalizeDeg(facing + 180);
  const mountain = findMountain24(facing);
  if (body.is_primary === true) await q(`UPDATE ka_houses SET is_primary=false WHERE user_id=$1`, [session.userId]);
  const house = await q1(
    `INSERT INTO ka_houses
      (user_id,name,is_primary,note,lat,lng,address,face_angle,sit_angle,
       facing_mountain,facing_direction,method,family_members)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'[]'::jsonb)
     RETURNING *`,
    [session.userId,name,body.is_primary === true,String(body.note || "").slice(0,1000) || null,
     lat,lng,String(body.address || "").slice(0,500) || null,facing,sitting,mountain.name,
     degreeToDir8(facing),["sensor","manual","map"].includes(String(body.method)) ? body.method : "sensor"]
  );
  return NextResponse.json({ ok: true, house }, { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } });
}
