import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";

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

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = cleanString(body.message, MAX_MESSAGE_LENGTH) || "";
  if (!message) {
    return NextResponse.json({ ok: false, error: "no message" }, { status: 400 });
  }

  const cookie = cookieHeaderForSifu(req);
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "mobile session token missing" }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const payload = {
    history: cleanHistory(body.history),
    lang: ["th", "en", "zh"].includes(body.lang) ? body.lang : "th",
    message,
    model: cleanString(body.model, 40),
    profileId: cleanString(body.profileId, 80),
    stream: false,
    topic: cleanString(body.topic, 40),
  };

  const sifuResp = await fetch(`${origin}/api/sifu`, {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    method: "POST",
  });

  const text = await sifuResp.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 400) || "invalid sifu response" };
  }

  return NextResponse.json(
    {
      ok: sifuResp.ok,
      ...data,
      source: "/api/sifu",
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: sifuResp.status,
    }
  );
}
