// GET /api/mobile/v1/ziwei — ผัง紫微斗數เต็ม 12 宮สำหรับแอพ (21 ก.ค. 2569 · ⑪ ใน 15 งาน)
// engine เดิม src/lib/astro/ziwei (ใช้ใน fusion5 อยู่แล้ว) — route นี้แค่สะพานอ่านโปรไฟล์→คำนวณ→ส่ง JSON
// AI ไม่เกี่ยว: ผังล้วนจาก engine deterministic · ห้ามปั้นดาวฝั่งแอพ
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ziweiChart, type Gender } from "@/lib/astro/ziwei/engine";
import { resolveCanonicalZiweiContext } from "@/lib/astro/ziwei/context-resolver";
import { birthTimezoneMeta } from "@/lib/birth-timezone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const APPROVED_BIRTH_TIMEZONE_SOURCES = new Set([
  "user_confirmed_iana",
  "user_confirmed_exact_offset",
  "verified_import",
]);

function cleanId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-ziwei:${clientIp(req)}:${session.userId}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }
  const url = new URL(req.url);
  const profileId = cleanId(url.searchParams.get("profileId"));
  if (!profileId) return NextResponse.json({ ok: false, error: "profile_required" }, { status: 400 });

  const row = await q1<{
    id: string; name: string | null; nickname: string | null; birth_datetime: string | null;
    birth_lat: string | null; birth_lng: string | null; gender: string | null; birth_time_known: boolean | null;
    birth_tz: string | null; birth_tz_source: string | null; birth_tz_confirmed_at: string | Date | null;
  }>(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
            birth_lat, birth_lng, gender, birth_time_known,
            birth_tz,birth_tz_source,birth_tz_confirmed_at
       FROM profiles
      WHERE id=$1 AND org_id=$2 AND created_by_user_id=$3 AND COALESCE(is_archived,false)=false`,
    [profileId, session.orgId, session.userId]
  );
  if (!row || !row.birth_datetime) {
    return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }
  const birthLat = row.birth_lat === null ? Number.NaN : Number(row.birth_lat);
  const birthLng = row.birth_lng === null ? Number.NaN : Number(row.birth_lng);
  const gender = row.gender === "M" || row.gender === "F" ? row.gender as Gender : null;
  const birthTimezone = row.birth_tz;
  if (!birthTimezone || !row.birth_tz_confirmed_at
    || !APPROVED_BIRTH_TIMEZONE_SOURCES.has(String(row.birth_tz_source || ""))
    || !gender) {
    const timezoneConfirmed = !!birthTimezone && !!row.birth_tz_confirmed_at
      && APPROVED_BIRTH_TIMEZONE_SOURCES.has(String(row.birth_tz_source || ""));
    return NextResponse.json(
      {
        ok: false,
        error: "ziwei_context_blocked",
        reason: timezoneConfirmed ? "birth_gender_invalid" : "birth_timezone_unconfirmed",
      },
      { status: 422, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
  // Coordinates are engine metadata only once gmtOffsetHours is explicit.
  // Match hourly preview's neutral policy rather than inventing Bangkok.
  const engineLocation = Number.isFinite(birthLat) && Number.isFinite(birthLng)
    && birthLat >= -90 && birthLat <= 90 && birthLng >= -180 && birthLng <= 180
    ? { lat: birthLat, lng: birthLng }
    : { lat: 0, lng: 0 };
  const referenceInstant = new Date();
  const ziweiContext = resolveCanonicalZiweiContext({
    mode: "legacy_chart",
    birthWallClock: row.birth_datetime,
    birthTimezone,
    birthTimezoneSource: "profile",
    referenceInstant,
    // The established chart evaluates reference facts in the birth offset. Keep that
    // compatibility explicit until the chart API accepts a separate reference zone.
    referenceTimezone: birthTimezone,
    legacyReferenceUsesBirthOffset: true,
  });
  if (ziweiContext.status === "blocked") {
    return NextResponse.json(
      { ok: false, error: "ziwei_context_blocked", reason: ziweiContext.reason, ziweiContext },
      { status: 422 },
    );
  }
  const chart = ziweiChart(
    new Date(ziweiContext.birth.instant),
    engineLocation.lat,
    engineLocation.lng,
    gender,
    row.birth_time_known !== false,
    {
      refDate: referenceInstant,
      gmtOffsetHours: ziweiContext.birth.utcOffsetMinutes / 60,
      refGmtOffsetHours: ziweiContext.reference.utcOffsetMinutes / 60,
    },
  );
  const timezone = birthTimezoneMeta({
    label: ziweiContext.birth.timezone,
    kind: ziweiContext.birth.timezoneKind === "iana" ? "zone" : "offset",
    offsetMin: ziweiContext.birth.utcOffsetMinutes,
  }, true);
  return NextResponse.json(
    {
      ok: true,
      profile: { id: row.id, name: row.nickname || row.name || "" },
      timezone,
      ziweiContext,
      chart,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
