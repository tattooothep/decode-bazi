/**
 * POST /api/profile/create
 *
 * สร้าง profile ใหม่สำหรับ "คนอื่น" (ไม่ใช่ self upsert) · สำหรับเพิ่มดวงญาติ/เพื่อน/ทีม
 * รับ: { name, nickname?, birthDate, birthTime, birthLat?, birthLng?, locationName?, gender?, relationshipType? }
 * 15 พ.ค. 2026 · separate จาก POST /api/profile (LOCKED upsertSelfProfile)
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { calcBazi } from "@/lib/bazi-calc";
import { normalizeNetworkGroup, normalizeNonSelfRelationship } from "@/lib/profile-groups";
import { findMatchingSelfProfile } from "@/lib/profile-clone-guard";
import { getProductAccess, entitlementDenied } from "@/lib/product-entitlement";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  if (!s.orgId) return NextResponse.json({ error: "no org" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const {
    name,
    nickname,
    birthDate,
    birthTime: birthTimeRaw,
    birthLat,
    birthLng,
    locationName,
    gender,
    relationshipType,
    networkGroup,
    networkGroupLabel,
    /* 16 พ.ค. 2026: รับ dayBoundary "23:00" (early 子) หรือ "00:00" (late 子/Voytek) */
    dayBoundary,
    /* 19 พ.ค. Option α · birthTimeKnown=false → 3p mode (no hour pillar) */
    birthTimeKnown: birthTimeKnownRaw,
  } = body;

  if (!name || !birthDate) {
    return NextResponse.json({ error: "name + birthDate required" }, { status: 400 });
  }

  const birthTimeKnown = birthTimeKnownRaw !== false;        /* default true · backward compat */
  const birthTime = birthTimeKnown ? (birthTimeRaw || "12:00") : "12:00"; /* 3p ใช้ 12:00 เป็น DB anchor เท่านั้น · ไม่ใช่ pillar */
  const dayBoundaryNorm = dayBoundary === "00:00" ? "00:00" : "23:00";

  const groupRaw = normalizeNetworkGroup(networkGroup, "general");
  const group = groupRaw === "self" ? "general" : groupRaw;
  const relation = normalizeNonSelfRelationship(relationshipType, group);
  const groupLabel = typeof networkGroupLabel === "string" && networkGroupLabel.trim()
    ? networkGroupLabel.trim().slice(0, 80)
    : null;

  const selfMatch = await findMatchingSelfProfile({
    orgId: s.orgId,
    userId: s.userId,
    name,
    nickname,
    birthDate,
    birthTime,
    birthTimeKnown,
    dayBoundary: dayBoundaryNorm,
  });
  if (selfMatch) {
    return NextResponse.json(
      {
        error: "ดวงนี้ตรงกับดวงเจ้าของบัญชีอยู่แล้ว · ไม่สร้างสำเนาเป็นคนอื่น",
        code: "self_profile_clone",
        selfProfileId: selfMatch.id,
      },
      { status: 409 }
    );
  }

  const access = await getProductAccess(s.userId);
  const networkCaps = access?.pages.network;
  if (group !== "general") {
    if (!networkCaps || networkCaps.groups < 1) {
      return NextResponse.json(
        entitlementDenied("network_group_locked", { plan: access?.plan || "free", max: networkCaps?.groups || 0 }),
        { status: 403 }
      );
    }
    const groupUsage = await q1<{ group_exists: boolean; group_count: number; people_count: number }>(
      `SELECT
         EXISTS(SELECT 1 FROM profiles WHERE org_id=$1 AND is_archived=false AND network_group=$2) AS group_exists,
         (SELECT COUNT(DISTINCT network_group)::int FROM profiles
           WHERE org_id=$1 AND is_archived=false AND network_group NOT IN ('self','general')) AS group_count,
         (SELECT COUNT(*)::int FROM profiles
           WHERE org_id=$1 AND is_archived=false AND network_group=$2) AS people_count`,
      [s.orgId, group]
    );
    if (!groupUsage?.group_exists && (Number(groupUsage?.group_count) || 0) >= networkCaps.groups) {
      return NextResponse.json(
        entitlementDenied("network_group_limit", { plan: access?.plan, max: networkCaps.groups }),
        { status: 403 }
      );
    }
    if ((Number(groupUsage?.people_count) || 0) >= networkCaps.group_people) {
      return NextResponse.json(
        entitlementDenied("network_group_people_limit", { plan: access?.plan, max: networkCaps.group_people }),
        { status: 403 }
      );
    }
  }

  // duplicate guard: same org + same person payload (name/relationship/datetime) and not archived
  // ป้องกันกดซ้ำ/ยิงซ้ำจาก UI แล้วเกิด profile โคลน
  const existed = await q1<{ id: string }>(
    `SELECT id
       FROM profiles
      WHERE org_id=$1
        AND is_archived=false
        AND lower(btrim(name)) = lower(btrim($2))
        AND lower(btrim(coalesce(relationship_type, ''))) = lower(btrim($3))
        AND birth_time_known = $4
        AND to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') = $5
        AND to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'HH24:MI') = $6
        AND COALESCE(day_boundary, '23:00') = $7
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT 1`,
    [s.orgId, String(name), relation, birthTimeKnown, birthDate, birthTime, dayBoundaryNorm]
  );
  if (existed?.id) {
    await q(
      `UPDATE profiles
          SET network_group=$1, network_group_label=$2, updated_at=now()
        WHERE id=$3 AND org_id=$4`,
      [group, groupLabel, existed.id, s.orgId]
    );
    const fullExisting = await q1(
      `SELECT id, name, nickname, day_master, day_master_strength, yongshen, bazi_pillars,
              relationship_type, network_group, network_group_label,
              gender, birth_lng, birth_lat, birth_time_known, day_boundary,
              to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime
       FROM profiles WHERE id=$1`,
      [existed.id]
    );
    return NextResponse.json({ ok: true, created: false, duplicate: true, profile: fullExisting });
  }

  const profileLimit = access?.pages.network.saved_profiles ?? 1;
  const profileCount = await q1<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM profiles
      WHERE org_id=$1 AND is_archived=false
        AND NOT (created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type)=''))`,
    [s.orgId, s.userId]
  );
  if ((Number(profileCount?.n) || 0) >= profileLimit) {
    return NextResponse.json(
      entitlementDenied("network_profile_limit", {
        plan: access?.plan || "free",
        used: Number(profileCount?.n) || 0,
        max: profileLimit,
      }),
      { status: 403 }
    );
  }

  /* compute BaZi via Layer 0/1 helper · ห้าม inline tyme4ts
   * 19 พ.ค. Option α · branch by birthTimeKnown · 3p ส่ง birthTimeKnown:false · 4p เดิม */
  let calc;
  try {
    if (birthTimeKnown) {
      calc = await calcBazi({
        date: birthDate,
        time: birthTime,
        longitude: birthLng != null ? Number(birthLng) : 100.5018,
        gmtOffsetHours: 7,
        gender: (gender as "M" | "F" | undefined) || undefined,
        /* 16 พ.ค. 2026: ส่ง dayBoundary ผ่าน Layer 0 (tyme-tst) · กระทบ 23:00-23:59 birth */
        dayBoundary: dayBoundaryNorm as "23:00" | "00:00",
        birthTimeKnown: true,
      });
    } else {
      calc = await calcBazi({
        date: birthDate,
        longitude: birthLng != null ? Number(birthLng) : 100.5018,
        gmtOffsetHours: 7,
        gender: (gender as "M" | "F" | undefined) || undefined,
        birthTimeKnown: false,
      });
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.error("[profile/create] bazi calc failed:", err);
    return NextResponse.json({ error: "bazi_calc_failed" }, { status: 500 });
  }

  const dayMaster = calc.dayMaster;
  const strength = String(calc.strength?.percent ?? "");
  /* 16 พ.ค. fix permanent: standardize format {top3:[], climate} เหมือน upsertSelfProfile · frontend อ่านง่าย */
  const yongshen = JSON.stringify({
    top3: calc.yongshen || [],
    climate: calc.climate || null,
  });
  /* Codex รอบ 8 fix #3 · บันทึก shape เดียวกับ self/update · { pillars, ge_ju } · frontend อ่าน row.bazi_pillars.pillars ตรงกันทุก endpoint */
  const baziPillars = JSON.stringify({
    pillars: calc.pillars || {},
    ge_ju: calc.geJu?.structure || null,
    day_boundary: dayBoundaryNorm,
  });

  /* INSERT profile · created_by_user_id = session.userId · id = gen_random_uuid() (column ไม่มี DEFAULT)
   * 19 พ.ค. Option α · birth_time_known = false → DB เก็บ anchor 12:00 + flag false · pillars.hour=null */
  const row = await q1<{ id: string }>(
    `INSERT INTO profiles (
       id,
       org_id, created_by_user_id, name, nickname,
       birth_datetime, birth_lat, birth_lng, birth_location_name, gender,
       relationship_type, network_group, network_group_label,
       day_master, day_master_strength, yongshen, bazi_pillars,
       birth_source, birth_time_known, day_boundary, is_archived, created_at, updated_at
     )
     VALUES (
       gen_random_uuid(),
       $1, $2, $3, $4,
       ($5::text || ' ' || $6::text || ':00 Asia/Bangkok')::timestamptz,
       $7, $8, $9, $10,
       $11, $12, $13,
       $14, $15, $16::jsonb, $17::jsonb,
       'self_reported', $18, $19, false, now(), now()
     )
     RETURNING id`,
    [
      s.orgId, s.userId, name, nickname ?? null,
      birthDate, birthTime,
      birthLat != null ? String(birthLat) : null,
      birthLng != null ? String(birthLng) : null,
      locationName ?? null,
      gender ?? null,
      relation, group, groupLabel,
      dayMaster, strength, yongshen, baziPillars,
      birthTimeKnown,
      dayBoundaryNorm,
    ]
  );
  if (!row) return NextResponse.json({ error: "insert failed" }, { status: 500 });

  const full = await q1(
    `SELECT id, name, nickname, day_master, day_master_strength, yongshen, bazi_pillars,
            relationship_type, network_group, network_group_label,
            gender, birth_lng, birth_lat, birth_time_known, day_boundary,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime
     FROM profiles WHERE id=$1`,
    [row.id]
  );

  return NextResponse.json({ ok: true, profile: full });
}
