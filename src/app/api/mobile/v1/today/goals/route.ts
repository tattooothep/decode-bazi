import { NextResponse } from "next/server";
import { GET as mobileCalendarGet } from "@/app/api/mobile/v1/calendar/route";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { currentDateWindow, withinDayWindow } from "@/lib/product-date-gate";
import { entitlementDenied } from "@/lib/product-entitlement";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { currentBangkokDate, projectCalendarGoals } from "./project";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanDate(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

function cleanUuid(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session?.orgId) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const limited = await rateLimit(`mobile-today-goals:${clientIp(req)}:${session.userId}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "โหลดเป้าหมายวันนี้ถี่เกินไป" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const requestUrl = new URL(req.url);
  const date = cleanDate(requestUrl.searchParams.get("date") || currentBangkokDate());
  if (!date) return NextResponse.json({ ok: false, error: "date YYYY-MM-DD required" }, { status: 400 });

  const dateAccess = await currentDateWindow("today", req);
  if (!withinDayWindow(date, dateAccess.max)) {
    return NextResponse.json(
      { ok: false, ...entitlementDenied("today_date_window", { plan: dateAccess.plan, max_days: dateAccess.max }) },
      { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const rawProfileId = requestUrl.searchParams.get("profileId");
  const profileId = rawProfileId ? cleanUuid(rawProfileId) : null;
  if (rawProfileId && !profileId) {
    return NextResponse.json({ ok: false, error: "profile id invalid" }, { status: 400 });
  }
  if (profileId) {
    const owned = await q1<{ id: string }>(
      `SELECT id
         FROM profiles
        WHERE id=$1
          AND org_id=$2
          AND created_by_user_id=$3
          AND COALESCE(is_archived, false)=false`,
      [profileId, session.orgId, session.userId]
    );
    if (!owned) return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }

  const calendarUrl = new URL(req.url);
  calendarUrl.search = "";
  calendarUrl.searchParams.set("year", date.slice(0, 4));
  calendarUrl.searchParams.set("month", date.slice(5, 7));
  if (profileId) calendarUrl.searchParams.set("profileId", profileId);

  const calendarResp = await mobileCalendarGet(new Request(calendarUrl.toString(), {
    headers: req.headers,
    method: "GET",
  }));
  const calendarData = await calendarResp.json() as Record<string, unknown>;
  if (!calendarResp.ok) {
    return NextResponse.json(
      { ok: false, source: "/api/calendar", ...calendarData },
      { status: calendarResp.status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const days = Array.isArray(calendarData.days) ? calendarData.days as Array<Record<string, unknown>> : [];
  const day = days.find((item) => item.date === date);
  if (!day) {
    return NextResponse.json({ ok: false, error: "calendar_day_not_found", date }, { status: 404 });
  }

  const rawGoals = day.goals && typeof day.goals === "object"
    ? day.goals as Record<string, unknown>
    : {};
  const { goals, lockedGoals, complete } = projectCalendarGoals(rawGoals);

  return NextResponse.json(
    {
      ok: true,
      date,
      profile: calendarData.profile || null,
      goals,
      intent_status: day.intentStatus && typeof day.intentStatus === "object" ? day.intentStatus : {},
      complete,
      locked_goals: lockedGoals,
      entitlement: { plan: dateAccess.plan, ...dateAccess.caps },
      source: "/api/calendar",
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
