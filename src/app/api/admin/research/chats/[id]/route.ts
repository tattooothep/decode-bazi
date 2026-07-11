// GET /api/admin/research/chats/<id>?source=research|sifu|fusion — เปิดอ่านบทสนทนาเต็ม (admin เห็นดิบ ไม่ตัดคำ)
// id ตาม source:
//   research → conversation_key (หรือ message id ถ้าแถวไม่มี key) · เฉพาะ feature <> 'sifu_fusion'
//   sifu     → "<user_uuid>:<pillars_hash>"
//   fusion   → ถ้าเป็น uuid = fusion5_jobs.id (งานอ่านดวง 1 ถาม-ตอบ)
//              ถ้าไม่ใช่ uuid = conversation_key ของ research_ai_messages feature='sifu_fusion' (แชทต่อเนื่อง)
// ทุก query JOIN users จริง → แถวผีของ user ที่ถูกลบไม่โผล่ (คำสั่งเจ้านาย 10 ก.ค.)
// ตอบ: { ok, id, source, user_email, user_name, feature, messages:[{ role:"user"|"ai", content, created_at }] }
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { q } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const SCOPED_USERS_CTE = `scoped_users AS (
    SELECT u.id, u.email, u.name
      FROM users u
     WHERE ($1::uuid IS NULL
        OR u.current_org_id=$1::uuid
        OR EXISTS (SELECT 1 FROM org_members om WHERE om.user_id=u.id AND om.org_id=$1::uuid AND om.status='active'))
  )`;

type Msg = { role: "user" | "ai"; content: string; created_at: string };

async function loadResearchThread(
  scopeOrgId: string | null,
  key: string,
  featureCond: string
): Promise<{ messages: Msg[]; user_email: string | null; user_name: string | null; feature: string | null }> {
  const rows = await q<{
    question: string; answer: string | null; created_at: string;
    feature: string; email: string | null; name: string | null;
  }>(
    `WITH ${SCOPED_USERS_CTE}
     SELECT m.question, m.answer, m.created_at, m.feature, su.email, su.name
       FROM research_ai_messages m
       JOIN scoped_users su ON su.id = m.user_id
      WHERE COALESCE(m.conversation_key, m.id::text) = $2
        AND ${featureCond}
      ORDER BY m.created_at ASC
      LIMIT 500`,
    [scopeOrgId, key]
  );
  const messages: Msg[] = [];
  let user_email: string | null = null;
  let user_name: string | null = null;
  let feature: string | null = null;
  for (const r of rows) {
    user_email = user_email ?? r.email;
    user_name = user_name ?? r.name;
    feature = feature ?? r.feature;
    messages.push({ role: "user", content: r.question, created_at: r.created_at });
    if (r.answer != null) messages.push({ role: "ai", content: r.answer, created_at: r.created_at });
  }
  return { messages, user_email, user_name, feature };
}

export async function GET(req: Request, ctx: Ctx) {
  let admin;
  try {
    admin = await requirePermission("admin.research.read");
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const { id: rawId } = await ctx.params;
  let id = ""; try { id = decodeURIComponent(String(rawId || "")).trim().slice(0, 200); } catch { return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 }); } /* กัน %zz พัง (ลายเซน C·A3) */
  const url = new URL(req.url);
  const source = (url.searchParams.get("source") || "").trim().toLowerCase();
  if (!id || !["research", "sifu", "fusion"].includes(source)) {
    return NextResponse.json({ ok: false, error: "ต้องระบุ id + source=research|sifu|fusion" }, { status: 400 });
  }
  const scopeOrgId = admin.role === "env_admin" ? null : (admin.orgId || null);

  try {
    let messages: Msg[] = [];
    let user_email: string | null = null;
    let user_name: string | null = null;
    let feature: string | null = null;

    if (source === "research") {
      ({ messages, user_email, user_name, feature } =
        await loadResearchThread(scopeOrgId, id, `m.feature <> 'sifu_fusion'`));
    } else if (source === "sifu") {
      // id = "<uuid 36 ตัว>:<pillars_hash>"
      const userId = id.slice(0, 36);
      const pillarsHash = id.slice(37);
      if (!UUID_RE.test(userId) || id.charAt(36) !== ":" || !pillarsHash) {
        return NextResponse.json({ ok: false, error: "id ของ sifu ต้องเป็น <user_uuid>:<pillars_hash>" }, { status: 400 });
      }
      const rows = await q<{
        question: string; answer: string; created_at: string;
        email: string | null; name: string | null;
      }>(
        `WITH ${SCOPED_USERS_CTE}
         SELECT h.question, h.answer, h.created_at, su.email, su.name
           FROM chart_sifu_history h
           JOIN scoped_users su ON su.id = h.user_id
          WHERE h.user_id = $2::uuid AND h.pillars_hash = $3
          ORDER BY h.created_at ASC
          LIMIT 500`,
        [scopeOrgId, userId, pillarsHash]
      );
      feature = "chart_sifu";
      for (const r of rows) {
        user_email = user_email ?? r.email;
        user_name = user_name ?? r.name;
        messages.push({ role: "user", content: r.question, created_at: r.created_at });
        messages.push({ role: "ai", content: r.answer, created_at: r.created_at });
      }
    } else {
      // Try the job table first. Comparing as text keeps list/detail symmetric even
      // when old rows or drivers expose the identifier in a non-canonical UUID form.
      const rows = await q<{
        question: string | null; reply: string | null; error: string | null; status: string;
        created_at: string; last_at: string; email: string | null; name: string | null;
      }>(
        `WITH ${SCOPED_USERS_CTE}
         SELECT f.question, f.result->>'reply' AS reply, f.error, f.status,
                f.created_at, COALESCE(f.updated_at, f.created_at) AS last_at,
                su.email, su.name
           FROM fusion5_jobs f
           JOIN scoped_users su ON su.id::text = f.user_id
          WHERE f.id::text = $2
          LIMIT 1`,
        [scopeOrgId, id]
      );
      const r = rows[0];
      if (r) {
        user_email = r.email;
        user_name = r.name;
        feature = "fusion5_job";
        messages.push({ role: "user", content: r.question || "(ไม่มีคำถาม)", created_at: r.created_at });
        const aiContent = r.reply ?? (r.error ? `[error] ${r.error}` : `[status: ${r.status}]`);
        messages.push({ role: "ai", content: aiContent, created_at: r.last_at });
      } else {
        // A Fusion continuous-chat key is not present in fusion5_jobs.
        ({ messages, user_email, user_name, feature } =
          await loadResearchThread(scopeOrgId, id, `m.feature = 'sifu_fusion'`));
      }
    }

    if (!messages.length) {
      return NextResponse.json({ ok: false, error: "ไม่พบบทสนทนา" }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, id, source, user_email, user_name, feature, messages },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    console.error("[admin/research/chats/:id] GET failed:", e);
    return NextResponse.json({ ok: false, error: "chat detail query failed" }, { status: 500 });
  }
}
