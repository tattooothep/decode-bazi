import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import {
  loadMobileTimingProfile,
  mobileProfileSummary,
} from "@/lib/mobile-timing-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanProfileId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function birthParts(birthDateTime: string | null): { date: string | null; time: string } {
  if (!birthDateTime) return { date: null, time: "12:00" };
  return {
    date: birthDateTime.slice(0, 10),
    time: birthDateTime.slice(11, 16) || "12:00",
  };
}

function cookieHeaderForChart(req: Request): string {
  const bearer = mobileBearerToken(req);
  if (bearer) return `decode_auth=${bearer}`;
  return req.headers.get("cookie") || "";
}

async function resolveProfileId(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  if (req.method === "GET") return cleanProfileId(url.searchParams.get("profileId"));

  const body = await req.json().catch(() => ({}));
  return cleanProfileId((body as { profileId?: unknown }).profileId || url.searchParams.get("profileId"));
}

async function handle(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const profileId = await resolveProfileId(req);
  const profile = await loadMobileTimingProfile(session, profileId);
  if (!profile) {
    return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }

  const birth = birthParts(profile.birth_datetime);
  if (!birth.date) {
    return NextResponse.json({ ok: false, error: "profile has no birth date" }, { status: 422 });
  }

  const lng = typeof profile.birth_lng === "number" ? profile.birth_lng : Number(profile.birth_lng);
  const payload = {
    birthTimeKnown: profile.birth_time_known !== false,
    date: birth.date,
    dayBoundary: profile.day_boundary === "00:00" ? "00:00" : "23:00",
    gender: profile.gender === "F" ? "F" : "M",
    longitude: Number.isFinite(lng) ? lng : 100.5018,
    time: birth.time,
  };

  const origin = new URL(req.url).origin;
  const cookie = cookieHeaderForChart(req);
  const chartResp = await fetch(`${origin}/api/chart`, {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    method: "POST",
  });

  const text = await chartResp.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 400) || "invalid chart response" };
  }

  return NextResponse.json(
    {
      ok: chartResp.ok,
      profile: mobileProfileSummary(profile),
      source: "/api/chart",
      ...data,
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: chartResp.status,
    }
  );
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
