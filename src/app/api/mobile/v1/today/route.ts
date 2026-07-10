import { NextResponse } from "next/server";
import { POST as todayPost } from "@/app/api/today/route";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

type Pillar = { stem?: string; branch?: string } | null;

type MobileTodayProfile = {
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

async function loadProfile(session: { orgId?: string | null; userId: string }, profileId?: string | null) {
  if (!session.orgId) return null;

  const where = profileId
    ? "id=$3"
    : "created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '')";
  const params = profileId ? [session.orgId, session.userId, profileId] : [session.orgId, session.userId];

  return q1<MobileTodayProfile>(
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

async function resolveInput(req: Request): Promise<{ date: string; profileId: string | null }> {
  const url = new URL(req.url);
  if (req.method === "GET") {
    return {
      date: url.searchParams.get("date") || new Date().toISOString().slice(0, 10),
      profileId: url.searchParams.get("profileId"),
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    date: String(body.date || url.searchParams.get("date") || new Date().toISOString().slice(0, 10)),
    profileId: body.profileId ? String(body.profileId) : url.searchParams.get("profileId"),
  };
}

async function handle(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const { date, profileId } = await resolveInput(req);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "date YYYY-MM-DD required" }, { status: 400 });
  }

  const profile = await loadProfile(session, profileId);
  if (!profile) {
    return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }

  const pillars = unwrapPillars(profile.bazi_pillars);
  const userChart = {
    year: normalizePillar(pillars.year),
    month: normalizePillar(pillars.month),
    day: normalizePillar(pillars.day),
    hour: normalizePillar(pillars.hour),
  };
  if (!userChart.day) {
    return NextResponse.json({ ok: false, error: "profile has no day pillar" }, { status: 422 });
  }

  const { birthDate, birthTime } = birthParts(profile.birth_datetime);
  const yongshen = yongshenElements(profile.yongshen);
  const payload = {
    date,
    userChart,
    ...(yongshen.length ? { yongshen } : {}),
    birthDate,
    birthTime,
    birthLng: profile.birth_lng ?? "100.5018",
    birthTimeKnown: profile.birth_time_known !== false,
    gender: profile.gender || "M",
    dayBoundary: profile.day_boundary || "23:00",
  };

  const internalReq = new Request(req.url, {
    body: JSON.stringify(payload),
    headers: {
      Authorization: req.headers.get("authorization") || "",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const todayResp = await todayPost(internalReq);
  const data = await todayResp.json();

  return NextResponse.json(
    {
      ok: todayResp.ok,
      profile: {
        id: profile.id,
        name: profile.name,
        nickname: profile.nickname,
        is_self: profile.is_self,
      },
      source: "api/today",
      ...data,
    },
    { status: todayResp.status, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
