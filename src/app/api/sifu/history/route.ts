import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { buildResearchConversationKey } from "@/lib/research-log";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT = 24_000;
const MAX_IMPORT_THREADS = 30;
const MAX_IMPORT_PAIRS = 120;

type Msg = { role?: unknown; content?: unknown };

function cleanUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s : null;
}

function cleanText(v: unknown, max = MAX_TEXT): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function cleanShort(v: unknown, max = 80): string | null {
  const s = cleanText(v, max);
  return s ? s.replace(/[^\w:.-]+/g, "_").slice(0, max) : null;
}

function cleanLang(v: unknown): string {
  return ["th", "en", "zh"].includes(String(v)) ? String(v) : "th";
}

function safeDate(v: unknown): Date {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) {
    const d = new Date(n);
    if (!Number.isNaN(d.valueOf())) return d;
  }
  return new Date();
}

function extractPairs(msgs: unknown): Array<{ question: string; answer: string; history: Msg[] }> {
  if (!Array.isArray(msgs)) return [];
  const out: Array<{ question: string; answer: string; history: Msg[] }> = [];
  const clean = msgs
    .map((m) => ({
      role: typeof m?.role === "string" ? m.role : "",
      content: cleanText(m?.content, 4_000) || "",
    }))
    .filter((m) => (m.role === "user" || m.role === "assistant" || m.role === "sifu") && m.content);

  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i];
    const b = clean[i + 1];
    if (a.role === "user" && (b.role === "assistant" || b.role === "sifu")) {
      out.push({
        question: a.content,
        answer: b.content,
        history: clean.slice(Math.max(0, i - 6), i).map((m) => ({ role: m.role, content: m.content })),
      });
      i += 1;
    }
  }
  return out;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 80);
  const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 80));
  const profileId = cleanUuid(url.searchParams.get("profileId") || url.searchParams.get("profile_id"));
  if (!profileId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }

  const rows = await q(
    `SELECT id, feature, profile_id, mode, topic, lang, question, answer,
            request_payload, response_meta, model, cached, created_at
       FROM research_ai_messages
      WHERE user_id=$1
        AND feature='sifu_master'
        AND status='ok'
        AND answer IS NOT NULL
        AND profile_id=$2::uuid
      ORDER BY created_at DESC
      LIMIT $3::int`,
    [session.userId, profileId, limit]
  );

  return NextResponse.json(
    { ok: true, history: rows },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const lang = cleanLang(body.lang);
  const profileId = cleanUuid(body.profileId);
  if (!profileId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }
  const threads = Array.isArray(body.threads) ? body.threads.slice(0, MAX_IMPORT_THREADS) : [];

  let imported = 0;
  let skipped = 0;
  let seenPairs = 0;

  for (const t of threads) {
    const threadId = cleanShort(t?.id, 80) || "imported";
    const title = cleanText(t?.title, 120);
    const createdAt = safeDate(t?.ts);
    const pairs = extractPairs(t?.msgs);

    for (const pair of pairs) {
      if (seenPairs >= MAX_IMPORT_PAIRS) break;
      seenPairs += 1;

      const exists = await q1<{ id: string }>(
        `SELECT id
           FROM research_ai_messages
          WHERE user_id=$1
            AND feature='sifu_master'
            AND profile_id=$2::uuid
            AND question=$3
            AND answer=$4
          LIMIT 1`,
        [session.userId, profileId, pair.question, pair.answer]
      );
      if (exists) {
        skipped += 1;
        continue;
      }

      await q1<{ id: string }>(
        `INSERT INTO research_ai_messages
           (org_id, user_id, profile_id, feature, mode, topic, lang, conversation_key,
            question, answer, history, request_payload, response_meta, model, status, cached,
            thread_id, thread_profile_id, profile_binding_status, audit_quality, prediction_phase, created_at)
         VALUES ($1,$2,$3,'sifu_master',NULL,NULL,$4,$5,
            $6,$7,$8::jsonb,$9::jsonb,$10::jsonb,NULL,'ok',false,
            $11,$3,'imported_profile_bound','legacy_import','general',$12)
         RETURNING id`,
        [
          session.orgId || null,
          session.userId,
          profileId,
          lang,
          buildResearchConversationKey({ feature: "sifu_master", userId: session.userId, profileId }),
          pair.question,
          pair.answer,
          JSON.stringify(pair.history),
          JSON.stringify({ imported_from: "local_master", local_thread_id: threadId, title, profileId, thread_profile_id: profileId }),
          JSON.stringify({ imported: true, local_thread_id: threadId, profileId, thread_profile_id: profileId, audit_quality: "legacy_import" }),
          threadId,
          createdAt,
        ]
      );
      imported += 1;
    }
  }

  return NextResponse.json({ ok: true, imported, skipped });
}
