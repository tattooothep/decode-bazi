/**
 * POST /api/mobile/v1/sifu/realtime/summary · สมุดดวงห้องคุยสดซินแส (4 ส.ค. 2569)
 *
 * แอพยิงตอนวางสาย: ส่งคู่ถาม-ตอบของสาย → บันทึก "ใบสรุป 1 แถว" ลงประวัติ
 * ซินแสเดิม (research_ai_messages · feature sifu_master) — โผล่ใน
 * /api/sifu/history และ /api/mobile/v1/sifu/history ทันที ไม่ต้องแก้จออ่าน
 *
 * additive ล้วน: ไม่แตะตารางเดิม/route เดิม · กันซ้ำด้วย conversationId
 * (วางสายเบิ้ล/ยิงซ้ำตอนเน็ตสะดุด = แถวเดียว)
 */
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logResearchAiMessage } from "@/lib/research-log";
import {
  SIFU_LIVE_SUMMARY_SOURCE,
  buildSifuLiveCallSummaryEntry,
  cleanSifuLiveConversationId,
  cleanSifuLiveDurationSec,
  cleanSifuLiveSummaryLang,
  cleanSifuLiveSummaryPairs,
} from "@/lib/sifu-live-call-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanProfileId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return UUID_RE.test(text) ? text : null;
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const limited = await rateLimit(
    `mobile-sifu-live-summary:${clientIp(req)}:${session.userId}`,
    10,
    60_000
  );
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const profileId = cleanProfileId(body.profileId);
  if (!profileId) {
    return NextResponse.json({ ok: false, error: "profile_required" }, { status: 400 });
  }
  const conversationId = cleanSifuLiveConversationId(body.conversationId);
  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversation_invalid" }, { status: 400 });
  }
  const pairs = cleanSifuLiveSummaryPairs(body.pairs);
  if (pairs.length === 0) {
    /* สายที่ไม่มีคู่ถาม-ตอบจบสมบูรณ์ = ไม่มีอะไรให้จด — ไม่ใช่ความผิด */
    return NextResponse.json({ ok: true, saved: false, reason: "empty_call" });
  }
  const lang = cleanSifuLiveSummaryLang(body.lang);
  const durationSec = cleanSifuLiveDurationSec(body.durationSec);

  /* ดวงต้องเป็นของผู้ใช้เอง (กติกาเดียวกับ /sifu/chat) */
  const owned = await q1<{ id: string }>(
    `SELECT id FROM profiles
      WHERE id=$1 AND org_id=$2 AND created_by_user_id=$3
        AND COALESCE(is_archived, false)=false`,
    [profileId, session.orgId, session.userId]
  );
  if (!owned) {
    return NextResponse.json({ ok: false, error: "profile_context_unlocked" }, { status: 404 });
  }

  /* กันซ้ำ: 1 สาย = 1 ใบสรุป */
  const existing = await q1<{ id: string }>(
    `SELECT id FROM research_ai_messages
      WHERE user_id=$1 AND feature='sifu_master' AND thread_id=$2
        AND response_meta->>'source'=$3
      LIMIT 1`,
    [session.userId, conversationId, SIFU_LIVE_SUMMARY_SOURCE]
  );
  if (existing) {
    return NextResponse.json({ ok: true, saved: false, duplicate: true });
  }

  const entry = buildSifuLiveCallSummaryEntry({
    durationSec,
    endedAt: new Date(),
    lang,
    pairs,
  });
  if (!entry) {
    return NextResponse.json({ ok: true, saved: false, reason: "empty_call" });
  }

  const id = await logResearchAiMessage({
    session,
    req,
    feature: "sifu_master",
    mode: "live_call",
    lang,
    profileId,
    question: entry.question,
    answer: entry.answer,
    requestPayload: {
      source: SIFU_LIVE_SUMMARY_SOURCE,
      profileId,
      thread_id: conversationId,
      duration_sec: durationSec,
      pair_count: pairs.length,
    },
    responseMeta: {
      source: SIFU_LIVE_SUMMARY_SOURCE,
      duration_sec: durationSec,
      pair_count: pairs.length,
    },
    status: "ok",
    threadId: conversationId,
    threadProfileId: profileId,
    profileBindingStatus: "live_call_profile_bound",
    auditQuality: "live_call_summary",
  }).catch(() => null);

  if (!id) {
    return NextResponse.json({ ok: false, error: "summary_save_failed" }, { status: 500 });
  }
  return NextResponse.json(
    { ok: true, saved: true, id },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
