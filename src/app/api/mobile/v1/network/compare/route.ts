// POST /api/mobile/v1/network/compare — ⑨ รายงานคู่ฉบับเต็มลงมือถือ (21 ก.ค. 2569)
// สะพานบางครอบ /api/sifu/compare (SSE streaming + entitlement/billing ของเดิมทำงานครบผ่าน cookie=bearer)
// รับ profileId ของอีกฝ่าย → โหลด pillars จริงจาก DB (ดวงตัวเอง + เป้าหมาย) → forward เป็น p1/p2
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Pillar = { stem?: string; branch?: string } | null;
type Row = {
  id: string;
  name: string;
  nickname: string | null;
  network_group_label: string | null;
  relationship_type: string | null;
  day_master: string | null;
  bazi_pillars: unknown;
  birth_time_known: boolean | null;
  is_self: boolean;
};

function unwrapPillars(raw: unknown): Record<string, Pillar> {
  const value = raw as { pillars?: Record<string, Pillar> };
  return value && value.pillars && typeof value.pillars === "object" ? value.pillars : ((raw || {}) as Record<string, Pillar>);
}
function normalizePillar(p: Pillar): { stem: string; branch: string } | null {
  if (!p || typeof p !== "object") return null;
  const stem = String(p.stem || "").trim();
  const branch = String(p.branch || "").trim();
  return stem && branch ? { stem, branch } : null;
}
function personPayload(row: Row) {
  const pillars = unwrapPillars(row.bazi_pillars);
  const birthTimeKnown = row.birth_time_known !== false;
  const base = {
    id: row.id,
    name: row.nickname || row.name,
    day_master: row.day_master,
    birthTimeKnown,
    birth_time_known: birthTimeKnown,
    chart_mode: birthTimeKnown ? "4p" : "3p",
  };
  return {
    ...base,
    pillars: {
      year: normalizePillar(pillars.year),
      month: normalizePillar(pillars.month),
      day: normalizePillar(pillars.day),
      hour: birthTimeKnown ? normalizePillar(pillars.hour) : null,
    },
  };
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session || !session.orgId) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  let body: { profileId?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const targetId = String(body.profileId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) return NextResponse.json({ ok: false, error: "bad profileId" }, { status: 400 });

  const rows = await q<Row>(
    `SELECT id, name, nickname, network_group_label, relationship_type, day_master, bazi_pillars, birth_time_known,
            (relationship_type IS NULL OR btrim(relationship_type) = '') AS is_self
       FROM profiles
      WHERE created_by_user_id=$2 AND org_id=$1 AND COALESCE(is_archived,false)=false
        AND (id=$3::uuid OR (relationship_type IS NULL OR btrim(relationship_type) = ''))`,
    [session.orgId, session.userId, targetId]
  );
  const self = rows.find((r) => r.is_self);
  const target = rows.find((r) => r.id === targetId && !r.is_self);
  if (!self || !target) return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });

  const p1 = personPayload(self);
  const p2 = personPayload(target);
  if (!p1.pillars.day || !p2.pillars.day) return NextResponse.json({ ok: false, error: "pillars missing" }, { status: 422 });

  const bearer = mobileBearerToken(req);
  const upstream = await fetch(`${internalAppOrigin(req)}/api/sifu/compare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      cookie: bearer ? `decode_auth=${bearer}` : req.headers.get("cookie") || "",
    },
    body: JSON.stringify({ p1, p2, lang: body.lang === "en" || body.lang === "zh" ? body.lang : "th" }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(text || JSON.stringify({ ok: false, error: "compare failed" }), {
      status: upstream.status || 502,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
