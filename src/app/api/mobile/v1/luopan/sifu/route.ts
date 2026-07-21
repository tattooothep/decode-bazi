import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { getProductAccess, entitlementDenied } from "@/lib/product-entitlement";
import { publicAiPayload } from "@/lib/public-ai-response";
import { isSifuAnswerLang } from "@/lib/sifu-answer-lang";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QUESTION_CHARS = 600;
const MAX_EVIDENCE_BYTES = 10_000;
const MAX_UPSTREAM_MESSAGE_CHARS = 2_000;

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function compactEvidence(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "{}";
  const raw = value as Record<string, unknown>;
  const allowed = {
    house: raw.house,
    measurement: raw.measurement,
    core: raw.core,
    snapshot: raw.snapshot,
    verified_pins: raw.verified_pins,
    warnings: raw.warnings,
    recommendations: raw.recommendations,
  };
  const encoded = JSON.stringify(allowed);
  if (Buffer.byteLength(encoded, "utf8") > MAX_EVIDENCE_BYTES) return null;
  // The production Sifu route has a 2,000-character direct-message boundary.
  return encoded.slice(0, 1_250);
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) {
    return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }

  const access = await getProductAccess(session.userId);
  if (!access?.pages.luopan.sifu) {
    return NextResponse.json(entitlementDenied("luopan_sifu", { plan: access?.plan || "free" }), { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const question = cleanText(body.question, MAX_QUESTION_CHARS);
  const profileId = cleanText(body.profile_id ?? body.profileId, 80).replace(/^hk_/, "");
  const evidence = compactEvidence(body.evidence);
  const lang = isSifuAnswerLang(body.lang) ? String(body.lang) : "th";
  if (!question) return NextResponse.json({ ok: false, error: "question_required" }, { status: 400 });
  if (!UUID_RE.test(profileId)) return NextResponse.json({ ok: false, error: "profile_required" }, { status: 400 });
  if (!evidence) return NextResponse.json({ ok: false, error: "evidence_too_large" }, { status: 413 });

  const profile = session.orgId ? await q1<{ id: string }>(
    `SELECT id FROM profiles
      WHERE id=$1 AND org_id=$2 AND created_by_user_id=$3 AND COALESCE(is_archived,false)=false`,
    [profileId, session.orgId, session.userId]
  ) : null;
  if (!profile) return NextResponse.json({ ok: false, error: "profile_context_unlocked" }, { status: 404 });

  const instruction = "LUOPAN VERIFIED EVIDENCE: Use only these measured house facts. Separate verified facts from interpretation; never invent a direction, pin, date, or missing layer. ";
  const questionBlock = `\nQUESTION: ${question}`;
  const evidenceBudget = Math.max(0, MAX_UPSTREAM_MESSAGE_CHARS - instruction.length - questionBlock.length);
  const message = `${instruction}${evidence.slice(0, evidenceBudget)}${questionBlock}`;
  const upstream = await fetch(`${internalAppOrigin(req)}/api/sifu`, {
    body: JSON.stringify({ lang, message, profileId, stream: false, topic: "luopan" }),
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json", Cookie: `decode_auth=${bearer}` },
    method: "POST",
  });
  const data = await upstream.json().catch(() => ({ error: "invalid_sifu_response" })) as Record<string, unknown>;
  return NextResponse.json(publicAiPayload({ ok: upstream.ok, ...data }), {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: upstream.status,
  });
}
