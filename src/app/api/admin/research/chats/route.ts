// GET /api/admin/research/chats — AI-chat monitor (admin เห็นบทสนทนา user↔AI ทุกแหล่ง)
// source=all|research|sifu|fusion · user=<email/name substring> · q=<content substring>
// days=7 · limit=50 · offset=0 → { ok, total, chats:[...] } เรียงคุยล่าสุดก่อน
//
// แหล่งข้อมูล (read-only · ไม่แตะตารางเดิม · ทุก block JOIN users จริงเสมอ = แถวผีของ user ที่ถูกลบไม่โผล่):
//   research = research_ai_messages ยกเว้น feature='sifu_fusion'
//              (แชทซินแส master/group/qimen · กลุ่มตาม conversation_key)
//   sifu     = chart_sifu_history (ถามซินแสหน้า /chart · กลุ่มตาม user+pillars_hash · รวม archived เพราะเป็นจอ monitor)
//   fusion   = fusion5_jobs (งานอ่านดวง fusion5 · 1 job = 1 ถาม-ตอบ · คำตอบ = result->>'reply')
//              + research_ai_messages feature='sifu_fusion' (โหมดแชทต่อเนื่อง fusion r385 · กลุ่มตาม conversation_key)
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";

const SOURCES = ["research", "sifu", "fusion"] as const;
type Source = (typeof SOURCES)[number];

// scoped_users = users ที่มีตัวตนจริงตอนนี้ (+ จำกัด org ถ้า admin ไม่ใช่ env_admin)
// ทุก block ใช้ INNER JOIN → กันทั้งข้าม org และแถวผี (user_id ที่ purge ไปแล้ว เช่นใน fusion5_jobs 62 แถว)
const SCOPED_USERS_CTE = `scoped_users AS (
    SELECT u.id, u.email, u.name
      FROM users u
     WHERE ($1::uuid IS NULL
        OR u.current_org_id=$1::uuid
        OR EXISTS (SELECT 1 FROM org_members om WHERE om.user_id=u.id AND om.org_id=$1::uuid AND om.status='active'))
  )`;

// ทุก block ใช้ params ชุดเดียวกัน: $1 org · $2 userLike · $3 contentLike · $4 days
function ramBlock(sourceLabel: "research" | "fusion", featureCond: string): string {
  return `SELECT
      COALESCE(m.conversation_key, m.id::text) AS id,
      '${sourceLabel}'::text AS source,
      max(su.email) AS user_email,
      max(su.name) AS user_name,
      max(m.feature) AS feature,
      min(m.created_at) AS started_at,
      max(m.created_at) AS last_at,
      (count(*) + count(m.answer))::int AS message_count,
      left((array_agg(m.question ORDER BY m.created_at ASC))[1], 120) AS preview
    FROM research_ai_messages m
    JOIN scoped_users su ON su.id = m.user_id
   WHERE ${featureCond}
   GROUP BY COALESCE(m.conversation_key, m.id::text)
  HAVING ($2::text IS NULL OR max(su.email) ILIKE $2 OR max(su.name) ILIKE $2)
     AND ($3::text IS NULL OR bool_or(m.question ILIKE $3 OR COALESCE(m.answer,'') ILIKE $3))
     AND max(m.created_at) >= now() - ($4::int || ' days')::interval`;
}

const RESEARCH_BLOCK = ramBlock("research", `m.feature <> 'sifu_fusion'`);
const FUSION_QA_BLOCK = ramBlock("fusion", `m.feature = 'sifu_fusion'`);

const SIFU_BLOCK = `SELECT
      h.user_id::text || ':' || h.pillars_hash AS id,
      'sifu'::text AS source,
      max(su.email) AS user_email,
      max(su.name) AS user_name,
      'chart_sifu'::text AS feature,
      min(h.created_at) AS started_at,
      max(h.created_at) AS last_at,
      (count(*) * 2)::int AS message_count,
      left((array_agg(h.question ORDER BY h.created_at ASC))[1], 120) AS preview
    FROM chart_sifu_history h
    JOIN scoped_users su ON su.id = h.user_id
   GROUP BY h.user_id, h.pillars_hash
  HAVING ($2::text IS NULL OR max(su.email) ILIKE $2 OR max(su.name) ILIKE $2)
     AND ($3::text IS NULL OR bool_or(h.question ILIKE $3 OR h.answer ILIKE $3))
     AND max(h.created_at) >= now() - ($4::int || ' days')::interval`;

const FUSION_JOB_BLOCK = `SELECT
      f.id::text AS id,
      'fusion'::text AS source,
      su.email AS user_email,
      su.name AS user_name,
      'fusion5_job'::text AS feature,
      f.created_at AS started_at,
      COALESCE(f.updated_at, f.created_at) AS last_at,
      (1 + CASE WHEN COALESCE(f.result->>'reply', f.error) IS NOT NULL THEN 1 ELSE 0 END)::int AS message_count,
      left(COALESCE(f.question, '(ไม่มีคำถาม)'), 120) AS preview
    FROM fusion5_jobs f
    JOIN scoped_users su ON su.id::text = f.user_id
   WHERE ($2::text IS NULL OR su.email ILIKE $2 OR su.name ILIKE $2)
     AND ($3::text IS NULL OR f.question ILIKE $3 OR f.result->>'reply' ILIKE $3)
     AND COALESCE(f.updated_at, f.created_at) >= now() - ($4::int || ' days')::interval`;

const BLOCKS: Record<Source, string[]> = {
  research: [RESEARCH_BLOCK],
  sifu: [SIFU_BLOCK],
  fusion: [FUSION_QA_BLOCK, FUSION_JOB_BLOCK],
};

function clampInt(v: string | null, def: number, min: number, max: number): number {
  const n = Number(v ?? def);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? Math.floor(n) : def));
}

export type ChatRow = {
  id: string;
  source: Source;
  user_email: string | null;
  user_name: string | null;
  feature: string | null;
  started_at: string;
  last_at: string;
  message_count: number;
  preview: string | null;
};

export async function GET(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sourceRaw = (url.searchParams.get("source") || "all").trim().toLowerCase();
  const sources: Source[] =
    sourceRaw === "all" || !sourceRaw
      ? [...SOURCES]
      : SOURCES.includes(sourceRaw as Source)
        ? [sourceRaw as Source]
        : [];
  if (!sources.length) {
    return NextResponse.json({ ok: false, error: "source ต้องเป็น all|research|sifu|fusion" }, { status: 400 });
  }

  const userSub = (url.searchParams.get("user") || "").trim().slice(0, 200);
  const qSub = (url.searchParams.get("q") || "").trim().slice(0, 200);
  const days = clampInt(url.searchParams.get("days"), 7, 1, 3650);
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 200);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100000);
  // env_admin เห็นทุก org · admin org เห็นเฉพาะ org ตัวเอง (pattern เดียวกับ /api/admin/* เดิม)
  const scopeOrgId = admin.role === "env_admin" ? null : (admin.orgId || null);
  const userLike = userSub ? `%${userSub}%` : null;
  const qLike = qSub ? `%${qSub}%` : null;

  const merged = sources.flatMap((s) => BLOCKS[s]).join("\n  UNION ALL\n  ");
  const baseParams = [scopeOrgId, userLike, qLike, days];

  try {
    const totalRow = await q1<{ total: number }>(
      `WITH ${SCOPED_USERS_CTE},
       merged AS (
  ${merged}
       )
       SELECT count(*)::int AS total FROM merged`,
      baseParams
    );
    const chats = await q<ChatRow>(
      `WITH ${SCOPED_USERS_CTE},
       merged AS (
  ${merged}
       )
       SELECT * FROM merged
        ORDER BY last_at DESC
        LIMIT $5::int OFFSET $6::int`,
      [...baseParams, limit, offset]
    );
    return NextResponse.json(
      { ok: true, total: totalRow?.total ?? 0, days, source: sourceRaw, chats },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    console.error("[admin/research/chats] GET failed:", e);
    return NextResponse.json({ ok: false, error: "chats query failed" }, { status: 500 });
  }
}
