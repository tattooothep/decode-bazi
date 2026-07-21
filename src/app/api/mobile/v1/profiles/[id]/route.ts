import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function cleanProfileId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function cookieHeaderForProfile(req: Request): string {
  const bearer = mobileBearerToken(req);
  if (bearer) return `decode_auth=${bearer}`;
  return req.headers.get("cookie") || "";
}

function trimString(value: unknown, max = 120): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : undefined;
}

function cleanBody(body: Record<string, unknown>) {
  return {
    birthDate: trimString(body.birthDate, 20),
    birthLat: body.birthLat,
    birthLng: body.birthLng,
    birthTime: trimString(body.birthTime, 20),
    birthTimeKnown: typeof body.birthTimeKnown === "boolean" ? body.birthTimeKnown : undefined,
    dayBoundary: body.dayBoundary === "00:00" || body.dayBoundary === "23:00" ? body.dayBoundary : undefined,
    gender: body.gender === "M" || body.gender === "F" ? body.gender : undefined,
    locationName: trimString(body.locationName, 120),
    name: trimString(body.name, 120),
    networkGroup: trimString(body.networkGroup, 40),
    networkGroupLabel: trimString(body.networkGroupLabel, 80),
    nickname: trimString(body.nickname, 80),
    relationshipType: trimString(body.relationshipType, 80),
  };
}

async function proxyProfile(req: Request, ctx: Ctx, method: "GET" | "PUT" | "DELETE") {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const { id: rawId } = await ctx.params;
  const id = cleanProfileId(rawId);
  if (!id) {
    return NextResponse.json({ ok: false, error: "profile id invalid" }, { status: 400 });
  }

  const cookie = cookieHeaderForProfile(req);
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "mobile session token missing" }, { status: 401 });
  }

  const body = method === "PUT" ? cleanBody((await req.json().catch(() => ({}))) as Record<string, unknown>) : undefined;
  const origin = internalAppOrigin(req);
  const profileResp = await fetch(`${origin}/api/profile/${encodeURIComponent(id)}`, {
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      Cookie: cookie,
    },
    method,
  });

  const text = await profileResp.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 400) || "invalid profile response" };
  }

  return NextResponse.json(
    {
      ok: profileResp.ok,
      source: `/api/profile/${id}`,
      ...data,
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: profileResp.status,
    }
  );
}

export async function GET(req: Request, ctx: Ctx) {
  return proxyProfile(req, ctx, "GET");
}

export async function PUT(req: Request, ctx: Ctx) {
  return proxyProfile(req, ctx, "PUT");
}

export async function DELETE(req: Request, ctx: Ctx) {
  return proxyProfile(req, ctx, "DELETE");
}
