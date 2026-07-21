import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TEXT_LENGTH = 8_000;

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) {
    return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }

  const limited = await rateLimit(`mobile-network-bulk:${clientIp(req)}:${session.userId}`, 8, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1_000)) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof (body as { text?: unknown }).text === "string"
    ? (body as { text: string }).text.trim()
    : "";
  if (!text) return NextResponse.json({ ok: false, error: "text_required" }, { status: 400 });
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ ok: false, error: "text_too_long" }, { status: 413 });
  }

  try {
    const upstream = await fetch(`${internalAppOrigin(req)}/api/network/ai-parse-bulk`, {
      body: JSON.stringify({ text }),
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: `decode_auth=${bearer}`,
      },
      method: "POST",
      signal: AbortSignal.timeout(70_000),
    });
    const data = await upstream.json().catch(() => ({ ok: false, error: "invalid_bulk_response" }));
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: upstream.status,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "bulk_service_unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
