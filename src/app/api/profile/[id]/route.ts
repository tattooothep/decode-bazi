/**
 * GET  /api/profile/[id]   → single profile detail
 * PUT  /api/profile/[id]   → update name/birthDate/birthTime/location + recompute BaZi
 *
 * Body: { name?, birthDate?, birthTime?, birthLat?, birthLng?, locationName?, gender?, birthTimeKnown? }
 * 19 พ.ค. Option α · birthTimeKnown=false → 3p mode · hour pillar = null
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { calcBazi } from "@/lib/bazi-calc";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await q1(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime,
            birth_lat, birth_lng, birth_location_name,
            gender, day_master, day_master_strength, yongshen, bazi_pillars,
            birth_time_known, day_boundary, is_archived, created_at
     FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
    [id, s.orgId]
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ profile: row });
}

export async function PUT(req: Request, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const { name, birthDate, birthTime, birthLat, birthLng, locationName, gender, nickname, dayBoundary: dayBoundaryRaw,
    /* 19 พ.ค. Option α · birthTimeKnown (optional) · ถ้าไม่ส่ง = keep existing */
    birthTimeKnown: birthTimeKnownRaw,
  } = body;

  const existing = await q1<{ birth_datetime: string; birth_time_known: boolean; birth_lng: string | null; day_boundary: string | null }>(
    `SELECT id, birth_lng, birth_time_known, day_boundary,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime
     FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
    [id, s.orgId]
  );
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  /* resolve birth_time_known · explicit body wins · ไม่งั้น keep existing */
  const newBirthTimeKnown = (typeof birthTimeKnownRaw === 'boolean')
    ? birthTimeKnownRaw
    : existing.birth_time_known;

  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  const fields: Record<string, unknown> = {
    name,
    nickname,
    birth_lat: birthLat,
    birth_lng: birthLng,
    birth_location_name: locationName,
    gender,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) {
      sets.push(`"${k}"=$${i++}`);
      params.push(v);
    }
  }

  /* If birthDate/birthTime/birthLng/birthTimeKnown change → recompute BaZi via Layer 1 (calcBazi)
   * 19 พ.ค. Option α · birthLng กระทบ TST · ต้อง recompute · refactor inline tyme4ts → calcBazi
   * Codex รอบ 8 fix #2: เพิ่ม birthLng trigger · ป้องกัน save location ใหม่แต่ pillar เก่า */
  const knownChanged = typeof birthTimeKnownRaw === 'boolean' && birthTimeKnownRaw !== existing.birth_time_known;
  const lngChanged = birthLng != null && String(birthLng) !== String(existing.birth_lng ?? '');
  const existingBoundary = existing.day_boundary === "00:00" ? "00:00" : "23:00";
  const requestedBoundary = dayBoundaryRaw === "00:00" ? "00:00" : dayBoundaryRaw === "23:00" ? "23:00" : null;
  const dayBoundary = requestedBoundary || existingBoundary;
  const boundaryRequested = requestedBoundary !== null;
  const boundaryChanged = boundaryRequested && requestedBoundary !== existingBoundary;
  const recompute = !!(birthDate || birthTime || lngChanged || knownChanged || (boundaryChanged && newBirthTimeKnown));
  let newIsoDt: string | null = null;
  if (recompute) {
    const oldDate = existing.birth_datetime.slice(0, 10);
    const oldTime = existing.birth_datetime.slice(11, 16);
    const useDate = birthDate || oldDate;
    /* 3p: ใช้ 12:00 anchor ใน DB (ไม่ใช่ pillar) · 4p: ใช้เวลาที่ user ระบุ */
    const useTime = newBirthTimeKnown ? (birthTime || oldTime) : "12:00";
    newIsoDt = `${useDate}T${useTime}:00+07:00`;
    sets.push(`"birth_datetime"=$${i++}`);
    params.push(newIsoDt);

    const lng = (birthLng != null ? Number(birthLng) : Number(existing.birth_lng)) || 100.5018;
    const calc = newBirthTimeKnown
      ? await calcBazi({
          date: useDate, time: useTime, longitude: lng, gmtOffsetHours: 7,
          dayBoundary,
          birthTimeKnown: true,
        })
      : await calcBazi({
          date: useDate, longitude: lng, gmtOffsetHours: 7,
          birthTimeKnown: false,
        });

    sets.push(`"day_master"=$${i++}`);
    params.push(calc.dayMaster);
    sets.push(`"day_master_strength"=$${i++}`);
    params.push(calc.strength.level);
    sets.push(`"yongshen"=$${i++}`);
    params.push(JSON.stringify({ top3: calc.yongshen, climate: calc.climate }));
    sets.push(`"bazi_pillars"=$${i++}`);
    params.push(JSON.stringify({ pillars: calc.pillars, ge_ju: calc.geJu.structure, day_boundary: dayBoundary }));
  }

  /* Persist day_boundary even when no pillar recompute is required (เช่น 3p/no-hour) */
  if (boundaryRequested) {
    sets.push(`"day_boundary"=$${i++}`);
    params.push(dayBoundary);
  }

  /* บันทึก birth_time_known ถ้าส่งมา (explicit) */
  if (typeof birthTimeKnownRaw === 'boolean') {
    sets.push(`"birth_time_known"=$${i++}`);
    params.push(birthTimeKnownRaw);
  }

  if (sets.length === 0) return NextResponse.json({ ok: true, unchanged: true });
  /* Codex direction: audit trail · always set updated_at on any change */
  sets.push(`"updated_at"=now()`);
  params.push(id, s.orgId);
  await q(
    `UPDATE profiles SET ${sets.join(", ")} WHERE id=$${i++} AND org_id=$${i}`,
    params
  );

  // Return updated row
  const updated = await q1(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime,
            birth_lat, birth_lng, birth_location_name,
            gender, day_master, day_master_strength, yongshen, bazi_pillars, birth_time_known, day_boundary
     FROM profiles WHERE id=$1 AND org_id=$2`,
    [id, s.orgId]
  );
  return NextResponse.json({ ok: true, profile: updated, recomputed: recompute });
}

/**
 * DELETE /api/profile/[id]
 * Soft delete · set is_archived=true · ป้องกัน hard delete ที่อาจกระทบ chart history
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await q1(
    `UPDATE profiles SET is_archived=true, updated_at=now()
     WHERE id=$1 AND org_id=$2
     RETURNING id, name, is_archived`,
    [id, s.orgId]
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, archived: row });
}
