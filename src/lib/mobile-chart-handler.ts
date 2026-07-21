import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { loadMobileTimingProfile, mobileProfileSummary } from "@/lib/mobile-timing-context";
import { internalAppOrigin } from "@/lib/internal-app-origin";

function cleanProfileId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function birthParts(birthDateTime: string | null): { date: string | null; time: string } {
  if (!birthDateTime) return { date: null, time: "12:00" };
  return { date: birthDateTime.slice(0, 10), time: birthDateTime.slice(11, 16) || "12:00" };
}

function cookieHeaderForChart(req: Request): string {
  const bearer = mobileBearerToken(req);
  return bearer ? `decode_auth=${bearer}` : req.headers.get("cookie") || "";
}

async function resolveProfileId(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  if (req.method === "GET") return cleanProfileId(url.searchParams.get("profileId"));
  const raw = await req.text().catch(() => "");
  let body: { profileId?: unknown } = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  return cleanProfileId(body.profileId || url.searchParams.get("profileId"));
}

export async function handleMobileChart(req: Request, explicitProfileId?: string) {
  const inputReq = req.clone();
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });

  const profileId = explicitProfileId === undefined ? await resolveProfileId(inputReq) : cleanProfileId(explicitProfileId);
  if (explicitProfileId !== undefined && !profileId) return NextResponse.json({ ok: false, error: "bad_profile_id" }, { status: 400 });
  const profile = await loadMobileTimingProfile(session, profileId);
  if (!profile) return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });

  const birth = birthParts(profile.birth_datetime);
  if (!birth.date) return NextResponse.json({ ok: false, error: "profile has no birth date" }, { status: 422 });
  const lng = typeof profile.birth_lng === "number" ? profile.birth_lng : Number(profile.birth_lng);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180 || (profile.gender !== "M" && profile.gender !== "F")) {
    return NextResponse.json({ ok: false, error: "incomplete_birth_data", required: ["birth_location", "gender"] }, { status: 422 });
  }

  const chartResp = await fetch(`${internalAppOrigin(req)}/api/chart`, {
    body: JSON.stringify({
      birthTimeKnown: profile.birth_time_known !== false,
      date: birth.date,
      dayBoundary: profile.day_boundary === "00:00" ? "00:00" : "23:00",
      gender: profile.gender,
      longitude: lng,
      time: birth.time,
    }),
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(cookieHeaderForChart(req) ? { Cookie: cookieHeaderForChart(req) } : {}) },
    method: "POST",
  });
  const text = await chartResp.text();
  let data: Record<string, unknown>;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { error: text.slice(0, 400) || "invalid chart response" }; }

  return NextResponse.json({
    ok: chartResp.ok,
    source: "/api/chart",
    ...data,
    profile: mobileProfileSummary(profile),
    request_context: { requested_profile_id: profileId, profile_id: profile.id, profile_source: profileId ? "mobile_explicit" : "account_self" },
  }, { headers: { "Cache-Control": "no-store, max-age=0" }, status: chartResp.status });
}
