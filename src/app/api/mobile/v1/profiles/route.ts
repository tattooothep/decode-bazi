import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { parseBirthCoordinatePatch, upsertSelfProfile, type UpsertSelfFields } from "@/lib/self-profile";
import { strictCanonicalZiweiTimezone } from "@/lib/astro/ziwei/context-resolver";

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
  birth_tz: string | null;
  birth_tz_source: string | null;
  is_self: boolean;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanGender(value: unknown): "M" | "F" | null {
  return value === "M" || value === "F" ? value : null;
}

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

async function loadProfile(orgId: string, userId: string, profileId: string) {
  return q1<MobileProfileRow>(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime,
            birth_lat::double precision AS birth_lat,
            birth_lng::double precision AS birth_lng,
            birth_location_name, gender,
            relationship_type, network_group, network_group_label,
            day_master, day_master_strength, yongshen, bazi_pillars,
            birth_time_known, day_boundary, birth_tz, birth_tz_source,
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
            birth_lat::double precision AS birth_lat,
            birth_lng::double precision AS birth_lng,
            birth_location_name, gender,
            relationship_type, network_group, network_group_label,
            day_master, day_master_strength, yongshen, bazi_pillars,
            birth_time_known, day_boundary, birth_tz, birth_tz_source,
            (created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '')) AS is_self
       FROM profiles
      WHERE created_by_user_id=$2 AND org_id=$1  /* ⛔ เฉพาะดวงที่ user สร้างเอง · เดิม org อย่างเดียว=leak (rule #6) */
        AND COALESCE(is_archived, false)=false
      ORDER BY
        CASE WHEN created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '') THEN 0 ELSE 1 END,
        created_at DESC`,
    [session.orgId, session.userId]
  );

  // is_self เท่านั้น · ⛔ ห้าม fallback rows[0] (หยิบดวงคนอื่นใน org · rule #6/#27)
  const activeProfile = rows.find((profile) => profile.is_self) || null;
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
  const birthTimeKnownProvided = hasOwn(body, "birthTimeKnown");
  if (birthTimeKnownProvided && typeof body.birthTimeKnown !== "boolean") {
    return NextResponse.json({ ok: false, error: "birthTimeKnown invalid" }, { status: 400 });
  }
  const birthTimeKnown = birthTimeKnownProvided ? body.birthTimeKnown : undefined;
  const birthTime = birthTimeKnown !== false ? cleanString(body.birthTime, "12:00") : "12:00";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return NextResponse.json({ ok: false, error: "กรอกวันเกิดเป็น YYYY-MM-DD" }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(birthTime)) {
    return NextResponse.json({ ok: false, error: "กรอกเวลาเกิดเป็น HH:MM" }, { status: 400 });
  }

  const name = cleanString(body.name, "เจ้าของบัญชี").slice(0, 120);
  const nicknameProvided = hasOwn(body, "nickname");
  if (nicknameProvided && body.nickname !== null && typeof body.nickname !== "string") {
    return NextResponse.json({ ok: false, error: "nickname invalid" }, { status: 400 });
  }
  const locationNameProvided = hasOwn(body, "locationName");
  if (locationNameProvided && body.locationName !== null && typeof body.locationName !== "string") {
    return NextResponse.json({ ok: false, error: "locationName invalid" }, { status: 400 });
  }
  const genderProvided = hasOwn(body, "gender");
  if (genderProvided && !["M", "F", null, ""].includes(body.gender)) {
    return NextResponse.json({ ok: false, error: "gender invalid" }, { status: 400 });
  }
  const dayBoundaryProvided = hasOwn(body, "dayBoundary");
  if (dayBoundaryProvided && body.dayBoundary !== "23:00" && body.dayBoundary !== "00:00") {
    return NextResponse.json({ ok: false, error: "dayBoundary invalid" }, { status: 400 });
  }

  let coordinatePatch;
  try {
    coordinatePatch = parseBirthCoordinatePatch(body);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "birth coordinates invalid" },
      { status: 400 },
    );
  }

  const birthTzProvided = hasOwn(body, "birthTz");
  const birthTzValue = typeof body.birthTz === "string" ? body.birthTz.trim() : "";
  const birthTzSpec = strictCanonicalZiweiTimezone(
    typeof body.birthTz === "string" ? body.birthTz.trim() : null,
  );
  if ((body.birthTz !== undefined && body.birthTz !== null && typeof body.birthTz !== "string")
    || (birthTzValue && !birthTzSpec)) {
    return NextResponse.json({ ok: false, error: "birth timezone invalid" }, { status: 400 });
  }

  try {
    const fields: UpsertSelfFields = { name, birthDate, birthTime };
    if (nicknameProvided) fields.nickname = cleanString(body.nickname).slice(0, 80) || null;
    if (coordinatePatch.provided) {
      fields.birthLat = coordinatePatch.birthLat;
      fields.birthLng = coordinatePatch.birthLng;
    }
    if (locationNameProvided) fields.locationName = cleanString(body.locationName).slice(0, 120) || null;
    if (genderProvided) fields.gender = cleanGender(body.gender);
    if (dayBoundaryProvided) fields.dayBoundary = body.dayBoundary;
    if (birthTimeKnownProvided) fields.birthTimeKnown = birthTimeKnown;
    if (birthTzProvided) fields.birthTz = birthTzSpec?.timezone ?? null;

    const result = await upsertSelfProfile(
      { orgId: session.orgId, userId: session.userId },
      fields,
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
    console.error("[mobile/v1/profiles]", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: "create profile failed" }, { status: 500 });
  }
}
