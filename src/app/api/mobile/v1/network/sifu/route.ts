import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { buildNetworkScorePayload } from "@/lib/scoring/network-score-payload";
import { publicAiPayload } from "@/lib/public-ai-response";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { isSifuAnswerLang } from "@/lib/sifu-answer-lang";
import { mobileBillingOperation } from "@/lib/mobile-billing-operation";
import { getProductAccess, PRODUCT_PAGE_ENTITLEMENTS } from "@/lib/product-entitlement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 6;
/** เพดานแข็งของระบบ — เพดานจริงต่อผู้ใช้มาจากแพ็กเกจ (team_people · แพ็กสูงสุด 12) */
const MAX_TEAM_MEMBERS = 12;

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
  birth_time_known: boolean | null;
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function cleanUuidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanUuid).filter(Boolean) as string[])).slice(0, MAX_TEAM_MEMBERS);
}

/** ธาตุที่ยอมรับได้ — ค่านอกรายการนี้ทิ้ง (กันข้อความแปลกปลอมไหลเข้าคำสั่งซินแส) */
const ELEMENT_WHITELIST = new Set(["wood", "fire", "earth", "metal", "water", "木", "火", "土", "金", "水"]);

/** ตัดอักขระควบคุม/ขึ้นบรรทัดใหม่ — บรรทัดใหม่คือเครื่องมือหลักของการแทรกคำสั่งเข้า prompt */
function cleanPromptText(value: unknown, max: number): string {
  return String(typeof value === "string" ? value : "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/gu, " ")
    .trim()
    .slice(0, max);
}

function cleanElementList(value: unknown, max: number) {
  if (!Array.isArray(value)) return undefined;
  const list = value
    .map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as { element?: unknown; label?: unknown };
      const element = cleanPromptText(row.element, 16).toLowerCase();
      if (!ELEMENT_WHITELIST.has(element)) return null;
      return { element, label: cleanPromptText(row.label, 40) || element };
    })
    .filter(Boolean) as Array<{ element: string; label: string }>;
  return list.length ? list.slice(0, max) : undefined;
}

/**
 * กรองก้อน "งานอะไร" ที่แอพส่งมาก่อนเข้าคำสั่งซินแส
 * เดิมส่งดิบ → ผู้ที่ยิง API ตรง (ไม่ผ่านแอพเรา) แทรกข้อความสั่งซินแสได้ทั้งก้อน
 * ที่นี่บังคับรูปทรง: ตัดอักขระควบคุม · จำกัดความยาว/จำนวนรายการ · ธาตุต้องอยู่ใน whitelist
 */
function cleanActivity(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = cleanPromptText(row.id, 40);
  const label = cleanPromptText(row.label, 80);
  if (!id && !label) return null;
  const priority = cleanPromptText(row.priority, 24);
  const roles = Array.isArray(row.roles)
    ? (row.roles
      .map((item) => {
        const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        const roleLabel = cleanPromptText(r.label, 60);
        if (!roleLabel) return null;
        const elements = Array.isArray(r.elements)
          ? r.elements.map((e) => cleanPromptText(e, 16).toLowerCase()).filter((e) => ELEMENT_WHITELIST.has(e)).slice(0, 5)
          : [];
        return { label: roleLabel, elements, text: cleanPromptText(r.text, 160) };
      })
      .filter(Boolean) as Array<{ label: string; elements: string[]; text: string }>).slice(0, 8)
    : undefined;
  const manual = Array.isArray(row.manual)
    ? row.manual.map((m) => cleanPromptText(m, 160)).filter(Boolean).slice(0, 8)
    : undefined;
  return {
    id: id || undefined,
    label: label || undefined,
    priority: priority || undefined,
    summary: cleanPromptText(row.summary, 240) || undefined,
    required: cleanElementList(row.required, 5),
    support: cleanElementList(row.support, 5),
    roles: roles && roles.length ? roles : undefined,
    manual: manual && manual.length ? manual : undefined,
  };
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
  const birthTimeKnown = profile.birth_time_known !== false;
  const payload = {
    id: profile.id,
    name: profile.nickname || profile.name,
    label: profileLabel(profile),
    day_master: profile.day_master,
    birthTimeKnown,
    birth_time_known: birthTimeKnown,
    chart_mode: birthTimeKnown ? "4p" : "3p",
    year: normalizePillar(pillars.year) || undefined,
    month: normalizePillar(pillars.month) || undefined,
    day: normalizePillar(pillars.day),
    hour: birthTimeKnown ? normalizePillar(pillars.hour) || undefined : undefined,
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
            day_master, yongshen, bazi_pillars, birth_time_known,
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

  /* เพดานสมาชิกทีมตามแพ็กเกจจริง (แพ็กสูงสุด = 12 ไม่ใช่ 8 ตายตัวแบบเดิม)
   * และถ้าส่งเกินเพดาน ต้อง "บอกจำนวน" ไม่ใช่ตัดรายชื่อทิ้งเงียบ — ผู้ใช้จะไม่รู้เลยว่าซินแสอ่านไม่ครบทีม */
  const teamAccess = await getProductAccess(session.userId);
  const teamCaps = teamAccess?.pages.network || PRODUCT_PAGE_ENTITLEMENTS.free.network;
  const teamLimit = Math.max(0, Math.min(MAX_TEAM_MEMBERS, Number(teamCaps.team_people) || 0));
  const teamIdsRaw = cleanUuidList((body as { teamProfileIds?: unknown }).teamProfileIds);
  if (mode === "team" && teamIdsRaw.length > teamLimit) {
    return NextResponse.json(
      {
        ok: false,
        error: "team_limit_exceeded",
        limit: teamLimit,
        requested: teamIdsRaw.length,
        message: `แพ็กเกจนี้ให้ซินแสอ่านทีมได้สูงสุด ${teamLimit} คน (เลือกมา ${teamIdsRaw.length} คน)`,
      },
      { status: 400 }
    );
  }
  const teamIds = teamIdsRaw;
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
      activity: cleanActivity((body as { activity?: unknown }).activity),
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
  const billingOperation = mobileBillingOperation((body as { billingOperationId?: unknown }).billingOperationId);
  const networkResp = await fetch(`${origin}/api/network/sifu`, {
    body: JSON.stringify({
      history: cleanHistory((body as { history?: unknown }).history),
      lang: isSifuAnswerLang((body as { lang?: unknown }).lang) ? (body as { lang?: string }).lang : "th",
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
      "X-Hourkey-Billing-Operation": billingOperation,
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
