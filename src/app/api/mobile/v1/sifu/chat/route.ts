import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { q1 } from "@/lib/db";
import { publicAiPayload } from "@/lib/public-ai-response";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isSifuAnswerLang } from "@/lib/sifu-answer-lang";
import {
  inspectMobileSifuImage,
  MAX_INLINE_IMAGE_BYTES,
  mobileSifuStreamPolicy,
} from "../image-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;

function cookieHeaderForSifu(req: Request): string {
  const bearer = mobileBearerToken(req);
  if (bearer) return `decode_auth=${bearer}`;
  return req.headers.get("cookie") || "";
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
    .slice(-6);
}

function cleanString(value: unknown, max = 120): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : undefined;
}

function cleanProfileId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function safeSigPart(value: unknown): string {
  return String(value || "").replace(/[^\w:-]+/g, "_").slice(0, 96);
}

async function loadCurrentProfileSig(
  orgId: string | null | undefined,
  userId: string,
  profileId: string
): Promise<string | null> {
  if (!orgId) return null;
  const row = await q1<{
    id: string;
    day_master: string | null;
    day_boundary: string | null;
    birth_datetime: string | null;
    birth_lng: string | null;
    gender: string | null;
    birth_time_known: boolean | null;
  }>(
    `SELECT id, day_master, day_boundary, birth_lng::text AS birth_lng, gender, birth_time_known,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime
       FROM profiles
      WHERE id=$1 AND org_id=$2 AND created_by_user_id=$3 AND COALESCE(is_archived, false)=false`,
    [profileId, orgId, userId]
  );
  if (!row) return null;
  return [
    row.id,
    row.day_master || "nodm",
    row.day_boundary || "nodb",
    row.birth_datetime || "nobt",
    row.birth_lng || "nolng",
    row.gender || "nogender",
    row.birth_time_known === false ? "time_unknown" : "time_known",
  ].map(safeSigPart).join("_");
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const limited = await rateLimit(`mobile-sifu-chat:${clientIp(req)}:${session.userId}`, 12, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "ถามซินแสถี่เกินไป · กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const image = inspectMobileSifuImage(body);
  if (image.invalid) {
    return NextResponse.json({ ok: false, error: "image_attachment_invalid" }, { status: 400 });
  }
  if (image.tooLarge) {
    return NextResponse.json(
      { ok: false, error: "image_attachment_too_large", max_bytes: MAX_INLINE_IMAGE_BYTES },
      { status: 413 }
    );
  }
  if (image.present) {
    return NextResponse.json(
      {
        ok: false,
        error: "image_attachments_not_supported",
        image_supported: false,
        reason: "Mobile Sifu ยังไม่มี vision contract ที่ตรวจสิทธิ์และอายุไฟล์ครบ จึงไม่รับรูปแบบเงียบ ๆ",
      },
      { status: 422 }
    );
  }

  const message = cleanString(body.message, MAX_MESSAGE_LENGTH) || "";
  if (!message) {
    return NextResponse.json({ ok: false, error: "no message" }, { status: 400 });
  }
  const profileId = cleanProfileId(body.profileId);
  if (!profileId) {
    return NextResponse.json({ ok: false, error: "profile_required" }, { status: 400 });
  }
  const currentProfileSig = await loadCurrentProfileSig(session.orgId, session.userId, profileId);
  if (!currentProfileSig) {
    return NextResponse.json({ ok: false, error: "profile_context_unlocked" }, { status: 404 });
  }
  const history = cleanHistory(body.history);
  const threadProfileId = cleanProfileId(body.threadProfileId || body.historyProfileId);
  const threadProfileSig = cleanString(body.threadProfileSig, 180);
  const suppliedHistoryProfileIds: string[] = Array.isArray(body.historyProfileIds)
    ? body.historyProfileIds.map(cleanProfileId).filter((x: string | null): x is string => !!x)
    : [];
  const historyBound = history.length === 0
    || (threadProfileId === profileId
      && threadProfileSig === currentProfileSig
      && suppliedHistoryProfileIds.length > 0
      && suppliedHistoryProfileIds.every((id) => id === profileId));

  const cookie = cookieHeaderForSifu(req);
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "mobile session token missing" }, { status: 401 });
  }

  const wantsStream = new URL(req.url).searchParams.get("stream") === "1";
  const origin = internalAppOrigin(req);
  const payload = {
    history,
    lang: isSifuAnswerLang(body.lang) ? body.lang : "th",
    message,
    profileId,
    ...mobileSifuStreamPolicy(wantsStream),
    threadId: cleanString(body.threadId, 80),
    threadProfileId: historyBound ? profileId : undefined,
    threadProfileSig: historyBound ? currentProfileSig : threadProfileSig,
    historyProfileIds: suppliedHistoryProfileIds,
    topic: cleanString(body.topic, 40),
  };

  const sifuResp = await fetch(`${origin}/api/sifu`, {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      Accept: wantsStream ? "text/event-stream" : "application/json",
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    method: "POST",
  });

  if (wantsStream) {
    const headers = new Headers({
      "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
      "Content-Type": sifuResp.headers.get("content-type") || "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    });
    const retryAfter = sifuResp.headers.get("retry-after");
    if (retryAfter) headers.set("Retry-After", retryAfter);
    return new Response(sifuResp.body, { headers, status: sifuResp.status });
  }

  const text = await sifuResp.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 400) || "invalid sifu response" };
  }

  return NextResponse.json(
    publicAiPayload({
      ok: sifuResp.ok,
      ...data,
      source: "/api/sifu",
    }),
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: sifuResp.status,
    }
  );
}
