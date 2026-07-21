import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { publicAiPayload } from "@/lib/public-ai-response";
import { isSifuAnswerLang } from "@/lib/sifu-answer-lang";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 6;
const MAX_PAYLOAD_BYTES = 220_000;

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        role: row.role === "assistant" || row.role === "sifu" ? "assistant" : "user",
        content: cleanText(row.content, MAX_MESSAGE_LENGTH),
      };
    })
    .filter((item) => item.content)
    .slice(-MAX_HISTORY_ITEMS);
}

function cleanPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const payload = {
    qimen: raw.qimen,
    user_yongshen_v2: raw.user_yongshen_v2,
    profile_id: cleanText(raw.profile_id ?? raw.profileId, 80) || undefined,
    activity: cleanText(raw.activity, 80) || undefined,
    search_results: Array.isArray(raw.search_results) ? raw.search_results.slice(0, 10) : undefined,
  };
  return Buffer.byteLength(JSON.stringify(payload), "utf8") <= MAX_PAYLOAD_BYTES ? payload : null;
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) {
    return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const message = cleanText(body.message, MAX_MESSAGE_LENGTH);
  const lang = isSifuAnswerLang(body.lang) ? String(body.lang) : "th";
  const payload = cleanPayload(body.payload);
  if (!message) {
    return NextResponse.json({ ok: false, error: "message_required" }, { status: 400 });
  }
  if (!payload) {
    return NextResponse.json({ ok: false, error: "qimen_payload_too_large" }, { status: 413 });
  }

  const upstream = await fetch(`${internalAppOrigin(req)}/api/qimen/sifu`, {
    body: JSON.stringify({
      message,
      history: cleanHistory(body.history),
      lang,
      topic: cleanText(body.topic, 80) || undefined,
      payload,
    }),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `decode_auth=${bearer}`,
    },
    method: "POST",
  });
  const data = await upstream.json().catch(() => ({ ok: false, error: "invalid_qimen_sifu_response" }));
  return NextResponse.json(publicAiPayload({ ...data, ok: upstream.ok }), {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: upstream.status,
  });
}
