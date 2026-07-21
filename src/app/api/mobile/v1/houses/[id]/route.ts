import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { degreeToDir8, findMountain24, normalizeDeg } from "@/lib/luopan/mountains";

export const dynamic = "force-dynamic";

function validId(id: string) { return /^\d{1,20}$/.test(id); }

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  const house = await q1(`SELECT * FROM ka_houses WHERE id=$1::bigint AND user_id=$2`, [id, session.userId]);
  if (!house) return NextResponse.json({ ok: false, error: "house not found" }, { status: 404 });
  await q(`UPDATE ka_houses SET last_used_at=now() WHERE id=$1::bigint AND user_id=$2`, [id, session.userId]);
  return NextResponse.json({ ok: true, house }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => { values.push(value); sets.push(`${sql}=$${values.length}`); };
  if (body.name !== undefined) add("name", String(body.name || "").trim().slice(0, 120));
  if (body.note !== undefined) add("note", String(body.note || "").slice(0, 1000) || null);
  if (body.address !== undefined) add("address", String(body.address || "").slice(0, 500) || null);
  if (body.is_primary !== undefined) add("is_primary", body.is_primary === true);
  if (body.latitude !== undefined || body.lat !== undefined) {
    const lat = Number(body.latitude ?? body.lat); if (!Number.isFinite(lat) || lat < -90 || lat > 90) return NextResponse.json({ ok: false, error: "invalid latitude" }, { status: 400 }); add("lat", lat);
  }
  if (body.longitude !== undefined || body.lng !== undefined) {
    const lng = Number(body.longitude ?? body.lng); if (!Number.isFinite(lng) || lng < -180 || lng > 180) return NextResponse.json({ ok: false, error: "invalid longitude" }, { status: 400 }); add("lng", lng);
  }
  if (body.facing_deg !== undefined || body.face_angle !== undefined) {
    const raw = Number(body.facing_deg ?? body.face_angle); if (!Number.isFinite(raw)) return NextResponse.json({ ok: false, error: "invalid facing_deg" }, { status: 400 });
    const facing = normalizeDeg(raw); add("face_angle", facing); add("sit_angle", normalizeDeg(facing + 180)); add("facing_mountain", findMountain24(facing).name); add("facing_direction", degreeToDir8(facing));
  }
  const wallKeys = ["start_lat","start_lng","end_lat","end_lng"] as const;
  if (wallKeys.some((key) => body[key] !== undefined)) {
    if (!wallKeys.every((key) => body[key] !== undefined)) return NextResponse.json({ ok:false,error:"complete front wall required" },{status:400});
    const wall = wallKeys.map((key) => Number(body[key]));
    if (!wall.every(Number.isFinite) || wall[0] < -90 || wall[0] > 90 || wall[2] < -90 || wall[2] > 90 || wall[1] < -180 || wall[1] > 180 || wall[3] < -180 || wall[3] > 180 || (wall[0] === wall[2] && wall[1] === wall[3])) {
      return NextResponse.json({ok:false,error:"invalid front wall"},{status:400});
    }
    wallKeys.forEach((key,index) => add(key,wall[index]));
  }
  if (!sets.length) return NextResponse.json({ ok: false, error: "no fields" }, { status: 400 });
  if (body.is_primary === true) await q(`UPDATE ka_houses SET is_primary=false WHERE user_id=$1`, [session.userId]);
  values.push(id, session.userId);
  const house = await q1(`UPDATE ka_houses SET ${sets.join(",")},updated_at=now() WHERE id=$${values.length-1}::bigint AND user_id=$${values.length} RETURNING *`, values);
  if (!house) return NextResponse.json({ ok: false, error: "house not found" }, { status: 404 });
  return NextResponse.json({ ok: true, house }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  const deleted = await q1<{ id: string }>(`DELETE FROM ka_houses WHERE id=$1::bigint AND user_id=$2 RETURNING id::text`, [id, session.userId]);
  if (!deleted) return NextResponse.json({ ok: false, error: "house not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: deleted.id });
}
