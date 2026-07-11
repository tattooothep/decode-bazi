import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { buildNetworkScorePayload } from "@/lib/scoring/network-score-payload";
import { publicAiPayload } from "@/lib/public-ai-response";
import { internalAppOrigin } from "@/lib/internal-app-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 6;
const MAX_TEAM_MEMBERS = 8;

type Pillar = { stem?: string; branch?: string } | null;

type NetworkSifuProfile = {
  id: string;
  name: string;
  nickname: string | null;
  relationship_type: string | null;
  network_group: string | null;
  network_group_label: string | null;
  day_master: string | null;
  yongshen: unknown;
  bazi_pillars: unknown;
  is_self: boolean;
};

function cookieHeaderForNetworkSifu(req: Request): string {
  const bearer = mobileBearerToken(req);
  if (bearer) return `decode_auth=${bearer}`;
  return req.headers.get("cookie") || "";
}

function cleanString(value: unknown, max = 120): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : undefined;
}

function cleanUuid(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function cleanUuidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanUuid).filter(Boolean) as string[])).slice(0, MAX_TEAM_MEMBERS);
}

function cleanHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as { role?: unknown; content?: unknown };
      return {
        role: row.role === "assistant" || row.role === "sifu" ? "assistant" : "user",
        content: String(row.content || "").slice(0, MAX_MESSAGE_LENGTH),
      };
    })
    .filter((item) => item.content.trim())
    .slice(-MAX_HISTORY_ITEMS);
}

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
  const jishen = Array.isArray(value.jishen)
    ? Array.from(new Set(value.jishen.map(pickElement).map((item) => item.trim()).filter(Boolean)))
    : [];
  return { yongshen, jishen };
}

function profileLabel(profile: NetworkSifuProfile) {
  if (profile.is_self) return "เจ้าของบัญชี";
  return profile.network_group_label || profile.relationship_type || "ดวงที่บันทึกไว้";
}

function personPayload(profile: NetworkSifuProfile) {
  const pillars = unwrapPillars(profile.bazi_pillars);
  const payload = {
    id: profile.id,
    name: profile.nickname || profile.name,
    label: profileLabel(profile),
    day_master: profile.day_master,
    year: normalizePillar(pillars.year) || undefined,
    month: normalizePillar(pillars.month) || undefined,
    day: normalizePillar(pillars.day),
    hour: normalizePillar(pillars.hour) || undefined,
  };
  return {
    ...payload,
    pillars: {
      year: payload.year || null,
      month: payload.month || null,
      day: payload.day,
      hour: payload.hour || null,
    },
  };
}

async function loadProfiles(orgId: string, userId: string) {
  return q<NetworkSifuProfile>(
    `SELECT id, name, nickname, relationship_type, network_group, network_group_label,
            day_master, yongshen, bazi_pillars,
            (created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '')) AS is_self
       FROM profiles
      WHERE created_by_user_id=$2 AND org_id=$1
        AND COALESCE(is_archived, false)=false
      ORDER BY
        CASE WHEN created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '') THEN 0 ELSE 1 END,
        created_at DESC`,
    [orgId, userId]
  );
}

function profileById(profiles: NetworkSifuProfile[], id: string | null) {
  return id ? profiles.find((profile) => profile.id === id) || null : null;
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session?.orgId) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = cleanString((body as { message?: unknown }).message, MAX_MESSAGE_LENGTH) || "";
  if (!message) {
    return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });
  }

  const profiles = await loadProfiles(session.orgId, session.userId);
  const centerProfile =
    profileById(profiles, cleanUuid((body as { centerProfileId?: unknown }).centerProfileId))
    || profiles.find((profile) => profile.is_self)
    || null
    || null;
  if (!centerProfile) {
    return NextResponse.json({ ok: false, error: "ยังไม่มีดวงศูนย์กลาง" }, { status: 422 });
  }

  const mode = (body as { mode?: unknown }).mode === "team" ? "team" : "pair";
  const centerPerson = personPayload(centerProfile);
  if (!centerPerson.day) {
    return NextResponse.json({ ok: false, error: "ดวงศูนย์กลางยังไม่มีเสาวัน" }, { status: 422 });
  }

  const teamIds = cleanUuidList((body as { teamProfileIds?: unknown }).teamProfileIds);
  const otherId = cleanUuid((body as { otherProfileId?: unknown }).otherProfileId);
  const selectedProfiles = mode === "team"
    ? teamIds
      .map((id) => profileById(profiles, id))
      .filter((profile): profile is NetworkSifuProfile => !!profile && profile.id !== centerProfile.id)
    : [profileById(profiles, otherId)].filter((profile): profile is NetworkSifuProfile => !!profile);

  if (!selectedProfiles.length) {
    return NextResponse.json({ ok: false, error: "เลือกดวงที่จะเทียบก่อน" }, { status: 400 });
  }

  const others = selectedProfiles
    .map(personPayload)
    .filter((person) => person.day);
  if (!others.length) {
    return NextResponse.json({ ok: false, error: "ดวงที่เลือกยังไม่มีเสาวัน" }, { status: 422 });
  }

  const useful = usefulElements(centerProfile.yongshen);
  const scorePayload = await buildNetworkScorePayload(
    {
      date: cleanString((body as { date?: unknown }).date, 20) || new Date().toISOString().slice(0, 10),
      others,
      scoringVersion: "v2",
      self: centerPerson,
      selfJishen: useful.jishen,
      selfYongshen: useful.yongshen,
    },
    `${req.url}${req.url.includes("?") ? "&" : "?"}v=2`
  );
  if ((scorePayload as { error?: unknown }).error) {
    return NextResponse.json({ ok: false, error: String((scorePayload as { error?: unknown }).error) }, { status: 400 });
  }

  const firstOther = others[0];
  const sifuPayload = mode === "team"
    ? {
      activity: (body as { activity?: unknown }).activity || null,
      members: others,
      selected_team: [centerPerson, ...others],
      self: centerPerson,
      team_center: centerPerson.id,
      yongshen_v2_map: {
        [centerPerson.id]: (scorePayload as any).yongshen_v2?.self,
        ...Object.fromEntries(
          others.map((person) => [person.id, (scorePayload as any).yongshen_v2?.others?.[person.id]])
        ),
      },
    }
    : {
      other: firstOther,
      scores: (scorePayload as any).scores?.[firstOther.id] || {},
      self: centerPerson,
      tags: (scorePayload as any).tags?.[firstOther.id] || [],
      yongshen_v2: {
        other: (scorePayload as any).yongshen_v2?.others?.[firstOther.id],
        self: (scorePayload as any).yongshen_v2?.self,
      },
    };

  const cookie = cookieHeaderForNetworkSifu(req);
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "mobile session token missing" }, { status: 401 });
  }

  const origin = internalAppOrigin(req);
  const networkResp = await fetch(`${origin}/api/network/sifu`, {
    body: JSON.stringify({
      history: cleanHistory((body as { history?: unknown }).history),
      lang: ["th", "en", "zh"].includes(String((body as { lang?: unknown }).lang))
        ? (body as { lang?: string }).lang
        : "th",
      message,
      mode,
      payload: sifuPayload,
      stream: false,
      topic: cleanString((body as { topic?: unknown }).topic, 40) || "overview",
    }),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    method: "POST",
  });

  const text = await networkResp.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 400) || "invalid network sifu response" };
  }

  return NextResponse.json(
    publicAiPayload({
      ok: networkResp.ok,
      ...data,
      source: "/api/network/sifu",
    }),
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: networkResp.status,
    }
  );
}
