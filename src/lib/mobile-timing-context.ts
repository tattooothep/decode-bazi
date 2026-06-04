import type { Session } from "@/lib/auth";
import { q1 } from "@/lib/db";

type Pillar = { stem?: string; branch?: string } | null;

export type MobileTimingProfile = {
  id: string;
  name: string;
  nickname: string | null;
  birth_datetime: string | null;
  birth_lng: number | string | null;
  gender: string | null;
  yongshen: unknown;
  bazi_pillars: unknown;
  birth_time_known: boolean | null;
  day_boundary: string | null;
  is_self: boolean;
};

export type MobileTimingPayload = {
  date: string;
  userChart: {
    year: { stem: string; branch: string } | null;
    month: { stem: string; branch: string } | null;
    day: { stem: string; branch: string } | null;
    hour: { stem: string; branch: string } | null;
  };
  yongshen: string[];
  birthDate: string | null;
  birthTime: string;
  birthLng: number | string;
  birthTimeKnown: boolean;
  gender: string;
  dayBoundary: string;
};

function unwrapPillars(raw: unknown): Record<string, Pillar> {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as { pillars?: Record<string, Pillar> };
  return value.pillars && typeof value.pillars === "object"
    ? value.pillars
    : (raw as Record<string, Pillar>);
}

function normalizePillar(pillar: Pillar): { stem: string; branch: string } | null {
  const stem = String(pillar?.stem || "").trim();
  const branch = String(pillar?.branch || "").trim();
  return stem && branch ? { stem, branch } : null;
}

function yongshenElements(raw: unknown): string[] {
  const value = raw as { top3?: unknown[] } | null;
  const top3 = Array.isArray(value?.top3) ? value.top3 : [];
  return Array.from(
    new Set(
      top3
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") return String((item as { element?: unknown }).element || "");
          return "";
        })
        .filter(Boolean)
    )
  );
}

function birthParts(birthDateTime: string | null): { birthDate: string | null; birthTime: string } {
  if (!birthDateTime) return { birthDate: null, birthTime: "12:00" };
  return {
    birthDate: birthDateTime.slice(0, 10),
    birthTime: birthDateTime.slice(11, 16) || "12:00",
  };
}

export async function loadMobileTimingProfile(
  session: Pick<Session, "orgId" | "userId">,
  profileId?: string | null
) {
  if (!session.orgId) return null;

  const where = profileId
    ? "id=$3"
    : "created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '')";
  const params = profileId ? [session.orgId, session.userId, profileId] : [session.orgId, session.userId];

  return q1<MobileTimingProfile>(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime,
            birth_lng, gender, yongshen, bazi_pillars, birth_time_known, day_boundary,
            (created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '')) AS is_self
       FROM profiles
      WHERE org_id=$1
        AND COALESCE(is_archived, false)=false
        AND ${where}
      ORDER BY
        CASE WHEN created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '') THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1`,
    params
  );
}

export function buildMobileTimingPayload(profile: MobileTimingProfile, date: string): MobileTimingPayload {
  const pillars = unwrapPillars(profile.bazi_pillars);
  const { birthDate, birthTime } = birthParts(profile.birth_datetime);

  return {
    date,
    userChart: {
      year: normalizePillar(pillars.year),
      month: normalizePillar(pillars.month),
      day: normalizePillar(pillars.day),
      hour: normalizePillar(pillars.hour),
    },
    yongshen: yongshenElements(profile.yongshen),
    birthDate,
    birthTime,
    birthLng: profile.birth_lng ?? "100.5018",
    birthTimeKnown: profile.birth_time_known !== false,
    gender: profile.gender || "M",
    dayBoundary: profile.day_boundary || "23:00",
  };
}

export function mobileProfileSummary(profile: MobileTimingProfile) {
  return {
    id: profile.id,
    name: profile.name,
    nickname: profile.nickname,
    is_self: profile.is_self,
  };
}
