import { NextResponse } from "next/server";
import { POST as todayDirectionsPost } from "@/app/api/today/directions/route";
import { getMobileSession } from "@/lib/mobile-auth";
import {
  loadMobileTimingProfile,
  mobileProfileSummary,
} from "@/lib/mobile-timing-context";

export const dynamic = "force-dynamic";

type DirectionInput = {
  date: string;
  time: string;
  profileId: string | null;
  latitude: number;
  longitude: number;
  school: "chaibu" | "zhirun";
  timezone: string;
};

function inputValue(body: Record<string, unknown>, url: URL, key: string) {
  return body[key] ?? url.searchParams.get(key);
}

async function resolveInput(req: Request): Promise<DirectionInput> {
  const url = new URL(req.url);
  const body = req.method === "GET"
    ? {} as Record<string, unknown>
    : await req.json().catch(() => ({} as Record<string, unknown>));
  const school = String(inputValue(body, url, "school") || "chaibu").toLowerCase();
  const latitudeRaw = inputValue(body, url, "latitude") ?? inputValue(body, url, "lat");
  const longitudeRaw = inputValue(body, url, "longitude") ?? inputValue(body, url, "lng");
  return {
    date: String(inputValue(body, url, "date") || ""),
    time: String(inputValue(body, url, "time") || ""),
    profileId: inputValue(body, url, "profileId") ? String(inputValue(body, url, "profileId")) : null,
    latitude: latitudeRaw === null || latitudeRaw === undefined || latitudeRaw === "" ? Number.NaN : Number(latitudeRaw),
    longitude: longitudeRaw === null || longitudeRaw === undefined || longitudeRaw === "" ? Number.NaN : Number(longitudeRaw),
    school: school === "zhirun" ? "zhirun" : "chaibu",
    timezone: String(inputValue(body, url, "timezone") || ""),
  };
}

async function handle(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const input = await resolveInput(req);
  const { date, profileId } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "date YYYY-MM-DD required" }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(input.time)) {
    return NextResponse.json({ ok: false, error: "local time HH:MM required", code: "time_required" }, { status: 422 });
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90 ||
      !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    return NextResponse.json({ ok: false, error: "location required", code: "location_required" }, { status: 422 });
  }
  if (!input.timezone || input.timezone.length > 80) {
    return NextResponse.json({ ok: false, error: "timezone required", code: "timezone_required" }, { status: 422 });
  }

  const profile = await loadMobileTimingProfile(session, profileId);
  if (!profile) {
    return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }

  const internalReq = new Request(req.url, {
    body: JSON.stringify({
      date,
      time: input.time,
      profileId: profile.id,
      lat: input.latitude,
      lng: input.longitude,
      school: input.school,
    }),
    headers: {
      Authorization: req.headers.get("authorization") || "",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const resp = await todayDirectionsPost(internalReq);
  const data = await resp.json();

  return NextResponse.json(
    {
      ok: resp.ok,
      profile: mobileProfileSummary(profile),
      source: "/api/today/directions",
      request_context: {
        date,
        local_time: input.time,
        timezone: input.timezone,
        latitude: input.latitude,
        longitude: input.longitude,
        location_source: "mobile_explicit",
        school: input.school,
      },
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
