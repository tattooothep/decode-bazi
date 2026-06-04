import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanProfileId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function cleanLimit(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 20;
  return Math.max(1, Math.min(80, Math.floor(num)));
}

function cookieHeaderForHistory(req: Request): string {
  const bearer = mobileBearerToken(req);
  if (bearer) return `decode_auth=${bearer}`;
  return req.headers.get("cookie") || "";
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const cookie = cookieHeaderForHistory(req);
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "mobile session token missing" }, { status: 401 });
  }

  const url = new URL(req.url);
  const params = new URLSearchParams();
  const profileId = cleanProfileId(url.searchParams.get("profileId"));
  if (profileId) params.set("profileId", profileId);
  params.set("limit", String(cleanLimit(url.searchParams.get("limit"))));

  const origin = url.origin;
  const historyResp = await fetch(`${origin}/api/sifu/history?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Cookie: cookie,
    },
    method: "GET",
  });

  const text = await historyResp.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 400) || "invalid sifu history response" };
  }

  return NextResponse.json(
    {
      ok: historyResp.ok,
      ...data,
      source: "/api/sifu/history",
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: historyResp.status,
    }
  );
}
