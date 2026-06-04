import { NextResponse } from "next/server";
import { POST as todayDirectionsPost } from "@/app/api/today/directions/route";
import { getMobileSession } from "@/lib/mobile-auth";
import {
  buildMobileTimingPayload,
  loadMobileTimingProfile,
  mobileProfileSummary,
} from "@/lib/mobile-timing-context";

export const dynamic = "force-dynamic";

async function resolveInput(req: Request): Promise<{ date: string; profileId: string | null }> {
  const url = new URL(req.url);
  if (req.method === "GET") {
    return {
      date: url.searchParams.get("date") || new Date().toISOString().slice(0, 10),
      profileId: url.searchParams.get("profileId"),
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    date: String((body as { date?: unknown }).date || url.searchParams.get("date") || new Date().toISOString().slice(0, 10)),
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

  const { date, profileId } = await resolveInput(req);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "date YYYY-MM-DD required" }, { status: 400 });
  }

  const profile = await loadMobileTimingProfile(session, profileId);
  if (!profile) {
    return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }

  const payload = buildMobileTimingPayload(profile, date);
  if (!payload.userChart.day) {
    return NextResponse.json({ ok: false, error: "profile has no day pillar" }, { status: 422 });
  }

  const internalReq = new Request(req.url, {
    body: JSON.stringify({
      date: payload.date,
      userChart: payload.userChart,
      yongshen: payload.yongshen[0] || null,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const resp = await todayDirectionsPost(internalReq);
  const data = await resp.json();

  return NextResponse.json(
    {
      ok: resp.ok,
      profile: mobileProfileSummary(profile),
      source: "/api/today/directions",
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
