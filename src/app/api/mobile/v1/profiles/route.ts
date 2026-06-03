import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { upsertSelfProfile } from "@/lib/self-profile";

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

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanGender(value: unknown): "M" | "F" | null {
  return value === "M" || value === "F" ? value : null;
}

async function loadProfile(orgId: string, userId: string, profileId: string) {
  return q1<MobileProfileRow>(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime,
            birth_lat, birth_lng, birth_location_name, gender,
            relationship_type, network_group, network_group_label,
            day_master, day_master_strength, yongshen, bazi_pillars,
            birth_time_known, day_boundary,
            (created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '')) AS is_self
       FROM profiles
      WHERE id=$3
        AND org_id=$1
        AND COALESCE(is_archived, false)=false`,
    [orgId, userId, profileId]
  );
}

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

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  if (!session.orgId) {
    return NextResponse.json({ ok: false, error: "missing org" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const birthDate = cleanString(body.birthDate);
  const birthTimeKnown = body.birthTimeKnown !== false;
  const birthTime = birthTimeKnown ? cleanString(body.birthTime, "12:00") : "12:00";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return NextResponse.json({ ok: false, error: "กรอกวันเกิดเป็น YYYY-MM-DD" }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(birthTime)) {
    return NextResponse.json({ ok: false, error: "กรอกเวลาเกิดเป็น HH:MM" }, { status: 400 });
  }

  const name = cleanString(body.name, "เจ้าของบัญชี").slice(0, 120);
  const nickname = cleanString(body.nickname) ? cleanString(body.nickname).slice(0, 80) : null;
  const locationName = cleanString(body.locationName, "ประเทศไทย").slice(0, 120);
  const birthLat = cleanNumber(body.birthLat);
  const birthLng = cleanNumber(body.birthLng);
  const dayBoundary = body.dayBoundary === "00:00" ? "00:00" : "23:00";

  try {
    const result = await upsertSelfProfile(
      { orgId: session.orgId, userId: session.userId },
      {
        name,
        nickname,
        birthDate,
        birthTime,
        birthLat,
        birthLng,
        locationName,
        gender: cleanGender(body.gender),
        dayBoundary,
        birthTimeKnown,
      }
    );
    const profile = await loadProfile(session.orgId, session.userId, result.id);

    return NextResponse.json(
      {
        ok: true,
        created: result.created,
        has_profile: true,
        profile,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "create profile failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
