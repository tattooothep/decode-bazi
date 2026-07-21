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
import { normalizeNetworkGroup, normalizeNonSelfRelationship } from "@/lib/profile-groups";
import { findMatchingSelfProfile } from "@/lib/profile-clone-guard";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { entitlementDenied, getProductAccess } from "@/lib/product-entitlement";

type Ctx = { params: Promise<{ id: string }> };

/* 1 มิ.ย. · snapshot ดวงเดิมก่อนเขียนทับ (PUT recompute ทับ 4เสา/用神 ถาวร · เดิมกู้ไม่ได้ · กฎ BaZi #6)
 * เก็บไฟล์นอก DB · เก็บ 20 ครั้งล่าสุด/ดวง · ไม่แตะ calcBazi/schema · best-effort (พังไม่ขวาง update) */
const SNAP_DIR = process.env.PROFILE_SNAPSHOT_DIR || "/root/decode-shared/profile-snapshots";
function snapshotProfile(id: string, orgId: string | null, old: Record<string, unknown>): void {
  try {
    mkdirSync(SNAP_DIR, { recursive: true });
    const f = join(SNAP_DIR, `${id}.jsonl`);
    let lines: string[] = [];
    try { lines = readFileSync(f, "utf8").split("\n").filter(Boolean); } catch {}
    lines.push(JSON.stringify({ saved_at: new Date().toISOString(), id, org_id: orgId, ...old }));
    if (lines.length > 20) lines = lines.slice(-20);
    writeFileSync(f, lines.join("\n") + "\n");
  } catch { /* snapshot ล้มเหลว = ไม่ขวางการบันทึก (ข้อมูลผู้ใช้สำคัญกว่า log) */ }
}

export async function GET(_req: Request, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await q1(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime,
            birth_lat, birth_lng, birth_location_name,
            gender, relationship_type, network_group, network_group_label,
            day_master, day_master_strength, yongshen, bazi_pillars,
            birth_time_known, day_boundary, yongshen_school, is_archived, created_at
     FROM profiles WHERE id=$1 AND created_by_user_id=$2 AND is_archived=false`,
    [id, s.userId]
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ profile: row });
}

export async function PUT(req: Request, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const { name, birthDate, birthTime, birthLat, birthLng, locationName, gender, nickname,
    relationshipType, networkGroup, networkGroupLabel, dayBoundary: dayBoundaryRaw,
    /* 19 พ.ค. Option α · birthTimeKnown (optional) · ถ้าไม่ส่ง = keep existing */
    birthTimeKnown: birthTimeKnownRaw,
  } = body;

  const existing = await q1<{ birth_datetime: string; birth_time_known: boolean; birth_lng: string | null; day_boundary: string | null;
    name: string | null; nickname: string | null; gender: string | null; birth_lat: string | null; birth_location_name: string | null;
    relationship_type: string | null; network_group: string | null; network_group_label: string | null; is_self: boolean;
    day_master: string | null; day_master_strength: string | null; yongshen: unknown; bazi_pillars: unknown }>(
    `SELECT id, birth_lng, birth_time_known, day_boundary, name, nickname, gender, birth_lat, birth_location_name,
            relationship_type, network_group, network_group_label,
            (relationship_type IS NULL OR btrim(relationship_type) = '') AS is_self,
            day_master, day_master_strength, yongshen, bazi_pillars,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime
     FROM profiles WHERE id=$1 AND created_by_user_id=$2 AND is_archived=false`,
    [id, s.userId]
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

  const requestedGroupRaw = networkGroup !== undefined ? normalizeNetworkGroup(networkGroup, "general") : null;
  const requestedGroup = requestedGroupRaw === "self" && !existing.is_self ? "general" : requestedGroupRaw;
  if (!existing.is_self && requestedGroup && requestedGroup !== "general" && requestedGroup !== existing.network_group) {
    const access = await getProductAccess(s.userId);
    const caps = access?.pages.network;
    if (!caps || caps.groups < 1) {
      return NextResponse.json(
        entitlementDenied("network_group_locked", { plan: access?.plan || "free", max: caps?.groups || 0 }),
        { status: 403 }
      );
    }
    const usage = await q1<{ group_exists: boolean; group_count: number; people_count: number }>(
      `SELECT
         EXISTS(SELECT 1 FROM profiles WHERE created_by_user_id=$1 AND is_archived=false AND network_group=$2 AND id<>$3) AS group_exists,
         (SELECT COUNT(DISTINCT network_group)::int FROM profiles
           WHERE created_by_user_id=$1 AND is_archived=false AND network_group NOT IN ('self','general') AND id<>$3) AS group_count,
         (SELECT COUNT(*)::int FROM profiles
           WHERE created_by_user_id=$1 AND is_archived=false AND network_group=$2 AND id<>$3) AS people_count`,
      [s.userId, requestedGroup, id]
    );
    if (!usage?.group_exists && (Number(usage?.group_count) || 0) >= caps.groups) {
      return NextResponse.json(entitlementDenied("network_group_limit", { plan: access?.plan, max: caps.groups }), { status: 403 });
    }
    if ((Number(usage?.people_count) || 0) >= caps.group_people) {
      return NextResponse.json(entitlementDenied("network_group_people_limit", { plan: access?.plan, max: caps.group_people }), { status: 403 });
    }
  }
  if (requestedGroup !== null) {
    sets.push(`"network_group"=$${i++}`);
    params.push(existing.is_self ? "self" : requestedGroup);
  }
  if (networkGroupLabel !== undefined) {
    const label = typeof networkGroupLabel === "string" && networkGroupLabel.trim()
      ? networkGroupLabel.trim().slice(0, 80)
      : null;
    sets.push(`"network_group_label"=$${i++}`);
    params.push(label);
  }
  if (!existing.is_self && relationshipType !== undefined) {
    const groupForRelation = requestedGroup || existing.network_group || "general";
    sets.push(`"relationship_type"=$${i++}`);
    params.push(normalizeNonSelfRelationship(relationshipType, groupForRelation));
  }

  /* HK_SCHOOL_CONFIRM_V1 (10 มิ.ย.) · ดวง從/假從 ก้ำกึ่ง 2 สำนัก — user ยืนยันสำนักจากชีวิตจริง
   * shun_shi=順勢ตามกระแส(滴天髓) · fu_yi=扶抑พยุงตัว(子平真詮) · null=ล้าง(กลับไปถาม) */
  const yongshenSchoolRaw = (body as Record<string, unknown>).yongshenSchool;
  if (yongshenSchoolRaw !== undefined) {
    const school = yongshenSchoolRaw === "shun_shi" || yongshenSchoolRaw === "fu_yi" ? yongshenSchoolRaw : null;
    sets.push(`"yongshen_school"=$${i++}`);
    params.push(school);
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

  if (!existing.is_self && sets.length > 0) {
    const targetDate = birthDate || existing.birth_datetime.slice(0, 10);
    const targetTime = newBirthTimeKnown ? (birthTime || existing.birth_datetime.slice(11, 16)) : "12:00";
    const selfMatch = await findMatchingSelfProfile({
      orgId: s.orgId!,
      userId: s.userId,
      name: name ?? existing.name,
      nickname: nickname !== undefined ? nickname : existing.nickname,
      birthDate: targetDate,
      birthTime: targetTime,
      birthTimeKnown: newBirthTimeKnown,
      dayBoundary,
      excludeProfileId: id,
    });
    if (selfMatch) {
      return NextResponse.json(
        {
          error: "ดวงนี้ตรงกับดวงเจ้าของบัญชีอยู่แล้ว · ไม่บันทึกเป็นคนอื่น",
          code: "self_profile_clone",
          selfProfileId: selfMatch.id,
        },
        { status: 409 }
      );
    }
  }

  if (sets.length === 0) return NextResponse.json({ ok: true, unchanged: true });
  /* snapshot ค่าเดิมก่อนเขียนทับ (กู้คืนได้ · โดยเฉพาะ 4เสา/用神 ที่ recompute ทับถาวร) */
  snapshotProfile(id, s.orgId ?? null, {
    name: existing.name, gender: existing.gender,
    relationship_type: existing.relationship_type,
    network_group: existing.network_group,
    network_group_label: existing.network_group_label,
    birth_datetime: existing.birth_datetime, birth_lat: existing.birth_lat,
    birth_lng: existing.birth_lng, birth_location_name: existing.birth_location_name,
    birth_time_known: existing.birth_time_known, day_boundary: existing.day_boundary,
    day_master: existing.day_master, day_master_strength: existing.day_master_strength,
    yongshen: existing.yongshen, bazi_pillars: existing.bazi_pillars,
    recompute,
  });
  /* Codex direction: audit trail · always set updated_at on any change */
  sets.push(`"updated_at"=now()`);
  params.push(id, s.userId);
  await q(
    `UPDATE profiles SET ${sets.join(", ")} WHERE id=$${i++} AND created_by_user_id=$${i}`,
    params
  );

  // Return updated row
  const updated = await q1(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime,
            birth_lat, birth_lng, birth_location_name,
            gender, relationship_type, network_group, network_group_label,
            day_master, day_master_strength, yongshen, bazi_pillars, birth_time_known, day_boundary
     FROM profiles WHERE id=$1 AND created_by_user_id=$2`,
    [id, s.userId]
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
  const target = await q1<{ is_self: boolean }>(
    `SELECT (relationship_type IS NULL OR btrim(relationship_type) = '') AS is_self
       FROM profiles WHERE id=$1 AND created_by_user_id=$2`,
    [id, s.userId]
  );
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (target.is_self) {
    return NextResponse.json({ error: "owner_profile_cannot_be_archived" }, { status: 409 });
  }
  const row = await q1(
    `UPDATE profiles SET is_archived=true, updated_at=now()
     WHERE id=$1 AND created_by_user_id=$2
     RETURNING id, name, is_archived`,
    [id, s.userId]
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, archived: row });
}
