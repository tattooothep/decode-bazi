import { NextResponse } from "next/server";
import { GET as calendarGet } from "@/app/api/calendar/route";
import { getMobileSession } from "@/lib/mobile-auth";
import {
  buildMobileTimingPayload,
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
  if (!profile) {
    return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }

  const payload = buildMobileTimingPayload(profile, `${year}-${String(month).padStart(2, "0")}-01`);
  if (!payload.userChart.day) {
    return NextResponse.json({ ok: false, error: "profile has no day pillar" }, { status: 422 });
  }

  const url = new URL(req.url);
  url.search = "";
  url.searchParams.set("year", String(year));
  url.searchParams.set("month", String(month));
  url.searchParams.set("dm", payload.userChart.day.stem);
  if (payload.birthDate) url.searchParams.set("birthDate", payload.birthDate);
  url.searchParams.set("birthTime", payload.birthTime);
  url.searchParams.set("birthLng", String(payload.birthLng));
  url.searchParams.set("birthTimeKnown", String(payload.birthTimeKnown));
  url.searchParams.set("gender", payload.gender);
  url.searchParams.set("dayBoundary", payload.dayBoundary);

  const resp = await calendarGet(new Request(url.toString(), { method: "GET" }));
  const data = await resp.json();

  return NextResponse.json(
    {
      ok: resp.ok,
      profile: mobileProfileSummary(profile),
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
