import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_NOTE_CHARS = 4_000;

function cleanUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s : null;
}

function cleanText(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function cleanEnum(v: unknown, allowed: string[]): string | null {
  const s = String(v || "").trim().toLowerCase();
  return allowed.includes(s) ? s : null;
}

function cleanDate(v: unknown): string | null {
  const s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function boolParam(v: string | null): boolean | null {
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return null;
}

function historyStatusSql(): string {
  return `COALESCE(
    response_meta->>'fusion_status',
    CASE
      WHEN status='error' THEN 'fail'
      WHEN response_meta->>'degraded'='true' THEN 'degraded'
      ELSE 'done'
    END
  )`;
}

function normalizeUserState(meta: unknown) {
  const m = meta && typeof meta === "object" ? meta as Record<string, unknown> : {};
  const raw = m.user_state && typeof m.user_state === "object" ? m.user_state as Record<string, unknown> : {};
  return {
    favorite: raw.favorite === true,
    pinned: raw.pinned === true,
    note: typeof raw.note === "string" ? raw.note : "",
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
}

function rowToHistory(row: Record<string, unknown>) {
  return {
    ...row,
    fusion_status: String(row.fusion_status || "done"),
    user_state: normalizeUserState(row.response_meta),
  };
}

async function ensureActiveProfile(profileId: string, orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false;
  const profile = await q1<{ id: string }>(
    `SELECT id
       FROM profiles
      WHERE id=$1::uuid AND org_id=$2::uuid AND is_archived=false
      LIMIT 1`,
    [profileId, orgId]
  );
  return !!profile;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  if (!session.orgId) return NextResponse.json({ error: "org_required" }, { status: 403 });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50));
  const profileId = cleanUuid(url.searchParams.get("profileId") || url.searchParams.get("profile_id"));
  if (!profileId) return NextResponse.json({ error: "profile_required" }, { status: 400 });
  if (!(await ensureActiveProfile(profileId, session.orgId))) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const search = cleanText(url.searchParams.get("q") || url.searchParams.get("search"), 160);
  const topic = cleanText(url.searchParams.get("topic"), 80);
  const mode = cleanText(url.searchParams.get("mode"), 80);
  const status = cleanEnum(url.searchParams.get("status"), ["done", "degraded", "fail"]);
  const dateFrom = cleanDate(url.searchParams.get("dateFrom") || url.searchParams.get("from"));
  const dateTo = cleanDate(url.searchParams.get("dateTo") || url.searchParams.get("to"));
  const favorite = boolParam(url.searchParams.get("favorite"));
  const pinned = boolParam(url.searchParams.get("pinned"));

  const where = [
    "user_id=$1",
    "feature='sifu_fusion'",
    "profile_id=$2::uuid",
  ];
  const params: unknown[] = [session.userId, profileId];
  const push = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (search) {
    const p = push(`%${search}%`);
    where.push(`(question ILIKE ${p} OR answer ILIKE ${p})`);
  }
  if (topic) where.push(`topic=${push(topic)}`);
  if (mode) where.push(`mode=${push(mode)}`);
  if (status) where.push(`${historyStatusSql()}=${push(status)}`);
  if (dateFrom) where.push(`created_at >= ${push(`${dateFrom}T00:00:00+07:00`)}::timestamptz`);
  if (dateTo) where.push(`created_at < (${push(`${dateTo}T00:00:00+07:00`)}::timestamptz + interval '1 day')`);
  if (favorite !== null) where.push(`COALESCE(response_meta #>> '{user_state,favorite}', 'false')=${push(String(favorite))}`);
  if (pinned !== null) where.push(`COALESCE(response_meta #>> '{user_state,pinned}', 'false')=${push(String(pinned))}`);

  const rows = await q<Record<string, unknown>>(
    `SELECT id, feature, profile_id, mode, topic, lang, question, answer,
            request_payload, response_meta, model, status, error, spent,
            balance_after, duration_ms, cached, created_at::text AS created_at,
            profile_snapshot, pillars_snapshot, packet_hash, packet_snapshot_safe,
            context_hash, prompt_hash, prompt_version,
            ${historyStatusSql()} AS fusion_status
       FROM research_ai_messages
      WHERE ${where.join(" AND ")}
      ORDER BY CASE WHEN COALESCE(response_meta #>> '{user_state,pinned}', 'false')='true' THEN 0 ELSE 1 END,
               created_at DESC
      LIMIT ${push(limit)}::int`,
    params
  );

  return NextResponse.json(
    { ok: true, history: rows.map(rowToHistory) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  if (!session.orgId) return NextResponse.json({ error: "org_required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = cleanUuid(body.id);
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  const profileId = cleanUuid(body.profileId || body.profile_id);
  if (!profileId) return NextResponse.json({ error: "profile_required" }, { status: 400 });
  if (!(await ensureActiveProfile(profileId, session.orgId))) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const row = await q1<{ response_meta: unknown }>(
    `SELECT m.response_meta
       FROM research_ai_messages m
       JOIN profiles p ON p.id=m.profile_id
      WHERE m.id=$1::uuid
        AND m.user_id=$2
        AND m.feature='sifu_fusion'
        AND m.profile_id=$3::uuid
        AND p.org_id=$4::uuid
        AND p.is_archived=false
      LIMIT 1`,
    [id, session.userId, profileId, session.orgId]
  );
  if (!row) return NextResponse.json({ error: "history_not_found" }, { status: 404 });

  const meta = row.response_meta && typeof row.response_meta === "object"
    ? row.response_meta as Record<string, unknown>
    : {};
  const current = normalizeUserState(meta);
  const nextState = {
    favorite: typeof body.favorite === "boolean" ? body.favorite : current.favorite,
    pinned: typeof body.pinned === "boolean" ? body.pinned : current.pinned,
    note: body.note == null ? current.note : cleanText(body.note, MAX_NOTE_CHARS) || "",
    updated_at: new Date().toISOString(),
  };
  const nextMeta = { ...meta, user_state: nextState };
  const updated = await q1<Record<string, unknown>>(
    `UPDATE research_ai_messages
        SET response_meta=$3::jsonb
      WHERE id=$1::uuid
        AND user_id=$2
        AND feature='sifu_fusion'
        AND profile_id=$4::uuid
      RETURNING id, response_meta, ${historyStatusSql()} AS fusion_status`,
    [id, session.userId, JSON.stringify(nextMeta), profileId]
  );

  return NextResponse.json({ ok: true, item: updated ? rowToHistory(updated) : null });
}
