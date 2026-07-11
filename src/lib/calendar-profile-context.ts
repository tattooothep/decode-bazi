import { q1 } from "@/lib/db";

type Pillar = { stem?: string; branch?: string } | null;

export type CalendarProfileContext = {
  profileId: string;
  userId: string;
  isSelf: boolean;
  relationshipType: string | null;
  source: "profile-db";
  name: string;
  birthDate: string;
  birthTime: string;
  birthTimeKnown: boolean;
  birthLng: number;
  birthLat: number;
  gender: "M" | "F";
  dayBoundary: "23:00" | "00:00";
  pillars: {
    year: { stem: string; branch: string } | null;
    month: { stem: string; branch: string } | null;
    day: { stem: string; branch: string } | null;
    hour: { stem: string; branch: string } | null;
  };
};

type CalendarProfileRow = {
  id: string;
  name: string;
  birth_date: string | null;
  birth_time: string | null;
  birth_lng: string | number | null;
  birth_lat: string | number | null;
  gender: string | null;
  birth_time_known: boolean | null;
  day_boundary: string | null;
  relationship_type: string | null;
  bazi_pillars: unknown;
  is_self: boolean;
};

function normalizePillar(value: Pillar): { stem: string; branch: string } | null {
  const stem = String(value?.stem || "").trim();
  const branch = String(value?.branch || "").trim();
  return stem && branch ? { stem, branch } : null;
}

function unwrapPillars(raw: unknown): Record<string, Pillar> {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as { pillars?: Record<string, Pillar> };
  return value.pillars && typeof value.pillars === "object"
    ? value.pillars
    : raw as Record<string, Pillar>;
}

/**
 * Resolve the only profile Calendar may personalize against.
 * Explicit profile selection and the default self profile are both owned by
 * the authenticated user and current organization. There is no first-row or
 * browser-cache fallback.
 */
export async function loadCalendarProfileContext(input: {
  userId: string;
  orgId: string;
  profileId?: string | null;
}): Promise<CalendarProfileContext | null> {
  const cleanProfileId = String(input.profileId || "").replace(/^p_/, "").trim();
  const explicit = Boolean(cleanProfileId);
  const params = explicit
    ? [input.orgId, input.userId, cleanProfileId]
    : [input.orgId, input.userId];
  const selector = explicit
    ? "id=$3"
    : "(relationship_type IS NULL OR btrim(relationship_type)='')";

  const row = await q1<CalendarProfileRow>(
    `SELECT id::text AS id, name,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS birth_date,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'HH24:MI') AS birth_time,
            birth_lng, birth_lat, gender, birth_time_known, day_boundary,
            relationship_type, bazi_pillars,
            (relationship_type IS NULL OR btrim(relationship_type)='') AS is_self
       FROM profiles
      WHERE org_id=$1
        AND created_by_user_id=$2
        AND COALESCE(is_archived, false)=false
        AND ${selector}
      ORDER BY created_at DESC
      LIMIT 1`,
    params,
  );
  if (!row?.birth_date) return null;

  const rawPillars = unwrapPillars(row.bazi_pillars);
  // Only an explicit DB flag may enable natal-hour calculations. Legacy NULL
  // must not silently turn a date-only profile into a synthetic 12:00 birth.
  const birthTimeKnown = row.birth_time_known === true;
  const hour = birthTimeKnown ? normalizePillar(rawPillars.hour) : null;
  const gender = String(row.gender || "M").toLowerCase().startsWith("f") ? "F" : "M";

  return {
    profileId: row.id,
    userId: input.userId,
    isSelf: row.is_self,
    relationshipType: row.relationship_type,
    source: "profile-db",
    name: row.name,
    birthDate: row.birth_date,
    birthTime: birthTimeKnown ? (row.birth_time || "12:00") : "12:00",
    birthTimeKnown,
    birthLng: Number(row.birth_lng ?? 100.5018),
    birthLat: Number(row.birth_lat ?? 13.7563),
    gender,
    dayBoundary: row.day_boundary === "00:00" ? "00:00" : "23:00",
    pillars: {
      year: normalizePillar(rawPillars.year),
      month: normalizePillar(rawPillars.month),
      day: normalizePillar(rawPillars.day),
      hour,
    },
  };
}
