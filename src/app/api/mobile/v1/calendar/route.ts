import { NextResponse } from "next/server";
import { GET as calendarGet } from "@/app/api/calendar/route";
import { getMobileSession } from "@/lib/mobile-auth";
import {
  loadMobileTimingProfile,
  mobileProfileSummary,
} from "@/lib/mobile-timing-context";

export const dynamic = "force-dynamic";

function currentBangkokMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value || new Date().getFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value || new Date().getMonth() + 1);
  return { year, month };
}

async function resolveInput(req: Request): Promise<{ year: number; month: number; profileId: string | null }> {
  const url = new URL(req.url);
  const fallback = currentBangkokMonth();

  if (req.method === "GET") {
    return {
      year: Number(url.searchParams.get("year") || fallback.year),
      month: Number(url.searchParams.get("month") || fallback.month),
      profileId: url.searchParams.get("profileId"),
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    year: Number((body as { year?: unknown }).year || url.searchParams.get("year") || fallback.year),
    month: Number((body as { month?: unknown }).month || url.searchParams.get("month") || fallback.month),
    profileId: (body as { profileId?: unknown }).profileId
      ? String((body as { profileId?: unknown }).profileId)
      : url.searchParams.get("profileId"),
  };
}

async function handle(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const { year, month, profileId } = await resolveInput(req);
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ ok: false, error: "year and month required" }, { status: 400 });
  }

  const profile = await loadMobileTimingProfile(session, profileId);
  if (profileId && !profile) {
    return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  url.search = "";
  url.searchParams.set("year", String(year));
  url.searchParams.set("month", String(month));
  if (profile) url.searchParams.set("profileId", profile.id);

  const resp = await calendarGet(new Request(url.toString(), {
    headers: req.headers,
    method: "GET",
  }));
  const data = await resp.json();

  return NextResponse.json(
    {
      ok: resp.ok,
      profile: profile ? mobileProfileSummary(profile) : null,
      source: "/api/calendar",
      ...data,
    },
    { status: resp.status, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
