import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { publicAiPayload } from "@/lib/public-ai-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCHOOLS = new Set(["chaibu", "zhirun", "yinpan"]);
const ACTIVITIES = new Set([
  "work_start",
  "negotiate",
  "wealth",
  "love",
  "travel",
  "authority",
  "decision",
  "health",
]);
const SPEC_KEYS = ["doors", "stars", "deities", "sanqi"] as const;
const BRANCHES = new Set(["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]);
const ELEMENTS = new Set(["wood", "fire", "earth", "metal", "water"]);
const FILTER_KEYS = [
  "useTongshu",
  "useBazi",
  "useJianchu",
  "useTaisui",
  "useXiu28",
  "useShen12",
  "useFly9",
  "useHeluo",
] as const;

function cleanDate(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

function cleanCoordinate(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function cleanCodeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter((item) => /^[A-Z0-9_]{1,40}$/.test(item))))
    .slice(0, 16);
}

function isEnabled(value: unknown): boolean {
  return value === true || value === "true";
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) {
    return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const mode = body.mode === "spec" ? "spec" : "activity";
  const school = String(body.school || "chaibu").toLowerCase();
  const activity = String(body.activity || "work_start");
  const dateFrom = cleanDate(body.dateFrom);
  const dateTo = cleanDate(body.dateTo);
  const latitude = cleanCoordinate(body.latitude ?? body.lat, -90, 90);
  const longitude = cleanCoordinate(body.longitude ?? body.lng, -180, 180);
  const limit = Math.max(1, Math.min(30, Math.floor(Number(body.limit) || 10)));

  if (!dateFrom || !dateTo || dateTo < dateFrom) {
    return NextResponse.json({ ok: false, error: "bad_date_range" }, { status: 400 });
  }
  const rangeDays = Math.floor((Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000) + 1;
  if (rangeDays > 30) {
    return NextResponse.json({ ok: false, error: "date_range_too_large" }, { status: 400 });
  }
  if (latitude === null || longitude === null) {
    return NextResponse.json({ ok: false, error: "location_required" }, { status: 422 });
  }
  if (!SCHOOLS.has(school)) {
    return NextResponse.json({ ok: false, error: "unsupported_school" }, { status: 400 });
  }
  if (mode === "activity" && !ACTIVITIES.has(activity)) {
    return NextResponse.json({ ok: false, error: "unsupported_activity" }, { status: 400 });
  }

  const rawSpec = body.spec && typeof body.spec === "object"
    ? body.spec as Record<string, unknown>
    : {};
  const spec = Object.fromEntries(SPEC_KEYS.map((key) => [key, cleanCodeList(rawSpec[key])]));
  if (mode === "spec" && !Object.values(spec).some((items) => items.length > 0)) {
    return NextResponse.json({ ok: false, error: "qimen_spec_required" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    mode,
    school,
    dateFrom,
    dateTo,
    lat: latitude,
    lng: longitude,
    limit,
    ...(mode === "activity" ? { activity } : { spec }),
    peopleBranches: Array.isArray(body.peopleBranches)
      ? Array.from(new Set(body.peopleBranches.filter((item): item is string => typeof item === "string" && BRANCHES.has(item)))).slice(0, 12)
      : [],
    userYongshen: Array.isArray(body.userYongshen)
      ? Array.from(new Set(body.userYongshen.filter((item): item is string => typeof item === "string" && ELEMENTS.has(item)))).slice(0, 5)
      : [],
  };
  for (const key of FILTER_KEYS) payload[key] = isEnabled(body[key]);

  const upstream = await fetch(`${internalAppOrigin(req)}/api/qimen/search`, {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `decode_auth=${bearer}`,
    },
    method: "POST",
  });
  const data = await upstream.json().catch(() => ({ ok: false, error: "invalid_qimen_search_response" }));
  return NextResponse.json(publicAiPayload({
    ...data,
    ok: upstream.ok,
    request_context: {
      date_from: dateFrom,
      date_to: dateTo,
      latitude,
      longitude,
      location_source: "mobile_explicit",
      mode,
      school,
    },
  }), {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: upstream.status,
  });
}
