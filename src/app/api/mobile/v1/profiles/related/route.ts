import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    birthTimeKnown: body.birthTimeKnown !== false,
    dayBoundary: body.dayBoundary === "00:00" ? "00:00" : "23:00",
    gender: body.gender === "M" || body.gender === "F" ? body.gender : undefined,
    locationName: trimString(body.locationName, 120),
    name: trimString(body.name, 120),
    networkGroup: trimString(body.networkGroup, 40) || "general",
    networkGroupLabel: trimString(body.networkGroupLabel, 80),
    nickname: trimString(body.nickname, 80),
    relationshipType: trimString(body.relationshipType, 80) || "คนในเครือข่าย",
  };
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const payload = cleanBody(body as Record<string, unknown>);
  if (!payload.name || !payload.birthDate) {
    return NextResponse.json({ ok: false, error: "กรอกชื่อและวันเกิดก่อน" }, { status: 400 });
  }

  const cookie = cookieHeaderForProfile(req);
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "mobile session token missing" }, { status: 401 });
  }

  const origin = internalAppOrigin(req);
  const profileResp = await fetch(`${origin}/api/profile/create`, {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    method: "POST",
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
      source: "/api/profile/create",
      ...data,
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: profileResp.status,
    }
  );
}
