/**
 * GET  /api/profile      → list my profiles
 * POST /api/profile      → create new profile + auto-compute BaZi via wrappers
 *
 * Body: { name, nickname?, birthDate, birthTime, birthLat?, birthLng?, locationName?, gender? }
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { upsertSelfProfile } from "@/lib/self-profile";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const rows = await q(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime,
            birth_lat, birth_lng, birth_location_name, gender,
            relationship_type,
            day_master, day_master_strength, yongshen, bazi_pillars,
            birth_time_known, day_boundary, is_archived, created_at,
            (relationship_type IS NULL OR btrim(relationship_type) = '') AS is_self
     FROM profiles
     WHERE org_id=$1 AND is_archived=false
     ORDER BY
       CASE WHEN relationship_type IS NULL OR btrim(relationship_type) = '' THEN 0 ELSE 1 END,
       created_at DESC`,
    [s.orgId]
  );
  const activeProfile = rows.find((p: any) => p.is_self) || rows[0] || null;
  return NextResponse.json({ profiles: rows, active_profile: activeProfile });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    name, nickname, birthDate, birthTime = "12:00",
    birthLat, birthLng, locationName, gender,
    dayBoundary,
    birthTimeKnown: birthTimeKnownRaw,
  } = body;
  if (!name || !birthDate)
    return NextResponse.json({ error: "name + birthDate required" }, { status: 400 });

  // Codex direction: self-profile upsert · one per user · derived columns recomputed via shared calcBazi
  // 19 พ.ค. Option α · birthTimeKnown=false → 3p mode
  const result = await upsertSelfProfile(s, {
    name,
    nickname: nickname ?? null,
    birthDate,
    birthTime,
    birthLat: birthLat != null ? Number(birthLat) : null,
    birthLng: birthLng != null ? Number(birthLng) : null,
    locationName: locationName ?? null,
    gender: gender ?? null,
    dayBoundary: dayBoundary === "00:00" ? "00:00" : "23:00",
    birthTimeKnown: typeof birthTimeKnownRaw === 'boolean' ? birthTimeKnownRaw : undefined,
  });

  const row = await q1(
    `SELECT id, name, day_master, day_master_strength, yongshen, bazi_pillars, birth_time_known, day_boundary
     FROM profiles WHERE id=$1`,
    [result.id]
  );
  return NextResponse.json({ ok: true, created: result.created, profile: row });
}
