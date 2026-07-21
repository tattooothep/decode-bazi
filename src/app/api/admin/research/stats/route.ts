// GET /api/admin/research/stats — ตัวเลขภาพรวมจอ monitor แชท AI
// ตอบ: { ok, chats_today, chats_7d, messages_7d, active_chatters_7d,
//        by_source:{ research:{chats_7d,messages_7d}, sifu:{...}, fusion:{...} } }
// "วันนี้" = เขตเวลา Asia/Bangkok · chat นับกลุ่มเดียวกับ /api/admin/research/chats
//   research = research_ai_messages (ยกเว้น sifu_fusion) กลุ่มตาม conversation_key
//   sifu     = chart_sifu_history กลุ่มตาม user+pillars_hash
//   fusion   = fusion5_jobs (1 job = 1 chat) + research_ai_messages feature='sifu_fusion' (แชทต่อเนื่อง)
// ทุกแหล่ง JOIN users จริง → แถวผีของ user ที่ถูกลบไม่นับ
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { q1 } from "@/lib/db";

const SCOPED_USERS_CTE = `scoped_users AS (
    SELECT u.id, u.email, u.name
      FROM users u
     WHERE ($1::uuid IS NULL
        OR u.current_org_id=$1::uuid
        OR EXISTS (SELECT 1 FROM org_members om WHERE om.user_id=u.id AND om.org_id=$1::uuid AND om.status='active'))
  )`;

export async function GET() {
  let admin;
  try {
    admin = await requirePermission("admin.research.read");
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const scopeOrgId = admin.role === "env_admin" ? null : (admin.orgId || null);

  try {
    const row = await q1<{
      r_chats_today: number; r_chats_7d: number; r_msgs_7d: number;
      s_chats_today: number; s_chats_7d: number; s_msgs_7d: number;
      f_chats_today: number; f_chats_7d: number; f_msgs_7d: number;
      active_chatters_7d: number;
    }>(
      `WITH ${SCOPED_USERS_CTE},
       bounds AS (
         SELECT now() - interval '7 days' AS c7,
                (date_trunc('day', timezone('Asia/Bangkok', now())) AT TIME ZONE 'Asia/Bangkok') AS today0
       ),
       ram AS ( -- research_ai_messages ทุก feature (แยกฝั่งด้วย is_fusion)
         SELECT COALESCE(m.conversation_key, m.id::text) AS key,
                m.user_id::text AS uid, m.created_at, m.answer,
                (m.feature = 'sifu_fusion') AS is_fusion
           FROM research_ai_messages m
           JOIN scoped_users su ON su.id = m.user_id
       ),
       s AS (
         SELECT h.user_id::text || ':' || h.pillars_hash AS key,
                h.user_id::text AS uid, h.created_at
           FROM chart_sifu_history h
           JOIN scoped_users su ON su.id = h.user_id
       ),
       fj AS (
         SELECT f.id::text AS key, f.user_id AS uid,
                COALESCE(f.updated_at, f.created_at) AS created_at,
                (f.result->>'reply' IS NOT NULL OR f.error IS NOT NULL) AS has_reply
           FROM fusion5_jobs f
           JOIN scoped_users su ON su.id::text = f.user_id
       )
       SELECT
         (SELECT count(DISTINCT key)::int FROM ram, bounds WHERE NOT is_fusion AND ram.created_at >= bounds.today0) AS r_chats_today,
         (SELECT count(DISTINCT key)::int FROM ram, bounds WHERE NOT is_fusion AND ram.created_at >= bounds.c7)     AS r_chats_7d,
         (SELECT (count(*) + count(answer))::int FROM ram, bounds WHERE NOT is_fusion AND ram.created_at >= bounds.c7) AS r_msgs_7d,
         (SELECT count(DISTINCT key)::int FROM s, bounds WHERE s.created_at >= bounds.today0) AS s_chats_today,
         (SELECT count(DISTINCT key)::int FROM s, bounds WHERE s.created_at >= bounds.c7)     AS s_chats_7d,
         (SELECT (count(*) * 2)::int FROM s, bounds WHERE s.created_at >= bounds.c7)          AS s_msgs_7d,
         (SELECT (SELECT count(*)::int FROM fj, bounds WHERE fj.created_at >= bounds.today0)
               + (SELECT count(DISTINCT key)::int FROM ram, bounds WHERE is_fusion AND ram.created_at >= bounds.today0)) AS f_chats_today,
         (SELECT (SELECT count(*)::int FROM fj, bounds WHERE fj.created_at >= bounds.c7)
               + (SELECT count(DISTINCT key)::int FROM ram, bounds WHERE is_fusion AND ram.created_at >= bounds.c7))     AS f_chats_7d,
         (SELECT (SELECT COALESCE(sum(1 + CASE WHEN has_reply THEN 1 ELSE 0 END), 0)::int
                    FROM fj, bounds WHERE fj.created_at >= bounds.c7)
               + (SELECT (count(*) + count(answer))::int FROM ram, bounds WHERE is_fusion AND ram.created_at >= bounds.c7)) AS f_msgs_7d,
         (SELECT count(DISTINCT uid)::int FROM (
            SELECT uid, created_at FROM ram
            UNION ALL SELECT uid, created_at FROM s
            UNION ALL SELECT uid, created_at FROM fj
          ) x, bounds WHERE x.created_at >= bounds.c7)                                        AS active_chatters_7d`,
      [scopeOrgId]
    );

    const z = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
    return NextResponse.json(
      {
        ok: true,
        chats_today: z(row?.r_chats_today) + z(row?.s_chats_today) + z(row?.f_chats_today),
        chats_7d: z(row?.r_chats_7d) + z(row?.s_chats_7d) + z(row?.f_chats_7d),
        messages_7d: z(row?.r_msgs_7d) + z(row?.s_msgs_7d) + z(row?.f_msgs_7d),
        active_chatters_7d: z(row?.active_chatters_7d),
        by_source: {
          research: { chats_7d: z(row?.r_chats_7d), messages_7d: z(row?.r_msgs_7d) },
          sifu: { chats_7d: z(row?.s_chats_7d), messages_7d: z(row?.s_msgs_7d) },
          fusion: { chats_7d: z(row?.f_chats_7d), messages_7d: z(row?.f_msgs_7d) },
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    console.error("[admin/research/stats] GET failed:", e);
    return NextResponse.json({ ok: false, error: "stats query failed" }, { status: 500 });
  }
}
