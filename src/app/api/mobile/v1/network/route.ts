import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { buildNetworkScorePayload } from "@/lib/scoring/network-score-payload";

export const dynamic = "force-dynamic";

type Pillar = { stem?: string; branch?: string } | null;

type MobileNetworkProfile = {
  id: string;
  name: string;
  nickname: string | null;
  birth_datetime: string | null;
  birth_location_name: string | null;
  gender: string | null;
  relationship_type: string | null;
  network_group: string | null;
  network_group_label: string | null;
  day_master: string | null;
  day_master_strength: string | null;
  yongshen: unknown;
  bazi_pillars: unknown;
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

function profileToPerson(profile: MobileNetworkProfile) {
  const pillars = unwrapPillars(profile.bazi_pillars);
  const day = normalizePillar(pillars.day);
  if (!day) return null;

  return {
    id: profile.id,
    day,
    year: normalizePillar(pillars.year) || undefined,
    month: normalizePillar(pillars.month) || undefined,
    hour: normalizePillar(pillars.hour) || undefined,
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
}

function usefulElements(raw: unknown): { yongshen: string[]; jishen: string[] } {
  if (!raw || typeof raw !== "object") return { yongshen: [], jishen: [] };
  const value = raw as {
    top3?: unknown[];
    yongshenFinal?: unknown[];
    primary_yongshen?: unknown[];
    jishen?: unknown[];
  };
  const pickElement = (item: unknown) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") return String((item as { element?: unknown }).element || "");
    return "";
  };
  const top = Array.isArray(value.top3) ? value.top3 : [];
  const final = Array.isArray(value.yongshenFinal) ? value.yongshenFinal : [];
  const primary = Array.isArray(value.primary_yongshen) ? value.primary_yongshen : [];
  const yongshen = Array.from(
    new Set([...top, ...final, ...primary].map(pickElement).map((item) => item.trim()).filter(Boolean))
  );
  return { yongshen, jishen: stringArray(value.jishen) };
}

function profileLabel(profile: MobileNetworkProfile) {
  if (profile.is_self) return "เจ้าของบัญชี";
  return profile.network_group_label || profile.relationship_type || "ดวงที่บันทึกไว้";
}

async function loadProfiles(orgId: string, userId: string) {
  return q<MobileNetworkProfile>(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime,
            birth_location_name, gender, relationship_type, network_group, network_group_label,
            day_master, day_master_strength, yongshen, bazi_pillars,
            (created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '')) AS is_self
       FROM profiles
      WHERE org_id=$1
        AND COALESCE(is_archived, false)=false
      ORDER BY
        CASE WHEN created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '') THEN 0 ELSE 1 END,
        created_at DESC`,
    [orgId, userId]
  );
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session?.orgId) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const centerId = url.searchParams.get("centerProfileId");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "date YYYY-MM-DD required" }, { status: 400 });
  }

  const profiles = await loadProfiles(session.orgId, session.userId);
  const activeProfile = profiles.find((profile) => (centerId ? profile.id === centerId : profile.is_self)) || profiles[0] || null;
  if (!activeProfile) {
    return NextResponse.json({ ok: true, date, count: 0, active_profile: null, people: [] });
  }

  const self = profileToPerson(activeProfile);
  if (!self) {
    return NextResponse.json({ ok: false, error: "center profile has no day pillar" }, { status: 422 });
  }

  const others = profiles
    .filter((profile) => profile.id !== activeProfile.id)
    .map((profile) => ({ profile, person: profileToPerson(profile) }))
    .filter((item): item is { profile: MobileNetworkProfile; person: NonNullable<ReturnType<typeof profileToPerson>> } => !!item.person);

  const useful = usefulElements(activeProfile.yongshen);
  const scorePayload = await buildNetworkScorePayload(
    {
      date,
      scoringVersion: "v2",
      self,
      selfYongshen: useful.yongshen,
      selfJishen: useful.jishen,
      others: others.map(({ person }) => person),
    },
    `${req.url}${req.url.includes("?") ? "&" : "?"}v=2`
  );

  if ((scorePayload as any)?.error) {
    return NextResponse.json({ ok: false, error: (scorePayload as any).error }, { status: 400 });
  }

  const scores = (scorePayload as any).scores || {};
  const tags = (scorePayload as any).tags || {};
  const labels = (scorePayload as any).labels || {};
  const guidance = (scorePayload as any).guidance || {};
  const directional = (scorePayload as any).directional || {};

  const people = others.map(({ profile }) => ({
    id: profile.id,
    name: profile.name,
    nickname: profile.nickname,
    label: profileLabel(profile),
    relationship_type: profile.relationship_type,
    network_group: profile.network_group,
    network_group_label: profile.network_group_label,
    day_master: profile.day_master,
    day_master_strength: profile.day_master_strength,
    birth_datetime: profile.birth_datetime,
    scores: scores[profile.id] || null,
    tags: tags[profile.id] || [],
    reading: labels[profile.id] || null,
    guidance: guidance[profile.id] || null,
    directional: directional[profile.id] || null,
  }));

  return NextResponse.json(
    {
      ok: true,
      date,
      source: "api/network/score",
      version: (scorePayload as any).version,
      count: people.length,
      active_profile: {
        id: activeProfile.id,
        name: activeProfile.name,
        nickname: activeProfile.nickname,
        label: profileLabel(activeProfile),
        day_master: activeProfile.day_master,
      },
      people,
      meta: {
        total_profiles: profiles.length,
        scored_profiles: people.length,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
