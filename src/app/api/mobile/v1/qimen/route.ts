import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { publicAiPayload } from "@/lib/public-ai-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCHOOLS = new Set(["chaibu", "zhirun", "yinpan"]);
const SYSTEM_TYPES = new Set(["hour", "day", "month", "year"]);

function cleanDate(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

function cleanTime(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [hour, minute] = text.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? text : null;
}

function cleanCoordinate(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function cleanText(value: unknown, max: number): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : undefined;
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) {
    return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const date = cleanDate(body.date);
  const time = cleanTime(body.time);
  const latitude = cleanCoordinate(body.latitude ?? body.lat, -90, 90);
  const longitude = cleanCoordinate(body.longitude ?? body.lng, -180, 180);
  const school = String(body.school || "chaibu").toLowerCase();
  const systemType = String(body.system_type || "hour").toLowerCase();
  if (!date || !time) return NextResponse.json({ ok: false, error: "bad_date_or_time" }, { status: 400 });
  if (latitude === null || longitude === null) {
    return NextResponse.json({ ok: false, error: "location_required" }, { status: 422 });
  }
  if (!SCHOOLS.has(school)) return NextResponse.json({ ok: false, error: "unsupported_school" }, { status: 400 });
  if (!SYSTEM_TYPES.has(systemType)) return NextResponse.json({ ok: false, error: "unsupported_system_type" }, { status: 400 });

  const upstream = await fetch(`${internalAppOrigin(req)}/api/qimen`, {
    body: JSON.stringify({
      date,
      time,
      lat: latitude,
      lng: longitude,
      school,
      system_type: systemType,
      question: cleanText(body.question, 600),
      purpose: cleanText(body.purpose, 120),
      use_case: cleanText(body.use_case, 80),
    }),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `decode_auth=${bearer}`,
    },
    method: "POST",
  });
  const data = await upstream.json().catch(() => ({ ok: false, error: "invalid_qimen_response" }));
  return NextResponse.json(publicAiPayload({
    ...data,
    ok: upstream.ok,
    request_context: {
      date,
      time,
      latitude,
      longitude,
      location_source: "mobile_explicit",
      school,
      system_type: systemType,
    },
  }), {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: upstream.status,
  });
}
