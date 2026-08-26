import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  exactObjectKeys, guardSciencePreviewRequest, PRIVATE_NO_STORE_HEADERS, readBoundedJson,
  sciencePreviewEnabledForUser, strictIanaTimezone, strictRfc3339Instant, strictUuid,
} from "@/lib/mobile-science-preview-route";
import {
  buildZiweiHourlyPreview, resolveUnambiguousBirthWallClock, ZIWEI_HOURLY_LINEAGE,
} from "@/lib/astro/ziwei/hourly-preview";
import type { Gender } from "@/lib/astro/ziwei/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProfileRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  birth_wall: string | null;
  birth_tz: string | null;
  birth_lat: string | null;
  birth_lng: string | null;
  gender: string | null;
};

export async function POST(req: Request) {
  const guard = await guardSciencePreviewRequest(req, {
    rateKeyPrefix: "mobile-ziwei-hourly-preview", rateMax: 20, rateWindowMs: 60_000,
    enabledKey: "ZIWEI_HOURLY_PREVIEW_ENABLED", allowlistKey: "ZIWEI_HOURLY_PREVIEW_USER_IDS",
  }, { getSession: getMobileSession, rateLimit, clientIp, enabledForUser: sciencePreviewEnabledForUser });
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, {
    status: guard.status,
    headers: guard.retryAfterSeconds
      ? { ...PRIVATE_NO_STORE_HEADERS, "Retry-After": String(guard.retryAfterSeconds) }
      : PRIVATE_NO_STORE_HEADERS,
  });
  const session = guard.session;

  let body: Record<string, unknown>;
  try { body = await readBoundedJson(req); } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "preview_invalid_json" }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  if (body.schema !== 1 || !exactObjectKeys(body, ["schema", "profileId", "referenceInstant", "referenceTimezone", "lineage"])) {
    return NextResponse.json({ ok: false, error: "invalid_preview_request" }, { status: 422, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const profileId = strictUuid(body.profileId);
  const referenceInstant = strictRfc3339Instant(body.referenceInstant);
  if (!profileId || !referenceInstant || body.lineage !== ZIWEI_HOURLY_LINEAGE) {
    return NextResponse.json({ ok: false, error: "invalid_preview_request" }, { status: 422, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const referenceTimezone = strictIanaTimezone(body.referenceTimezone, referenceInstant);
  if (!referenceTimezone) return NextResponse.json({ ok: false, error: "invalid_reference_timezone" }, { status: 422, headers: PRIVATE_NO_STORE_HEADERS });

  const row = await q1<ProfileRow>(
    `SELECT id,name,nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_wall,
            birth_tz,birth_lat,birth_lng,gender
       FROM profiles
      WHERE id=$1 AND org_id=$2 AND created_by_user_id=$3
        AND COALESCE(is_archived, false)=false
        AND birth_time_known=true
        AND (relationship_type IS NULL OR btrim(relationship_type) = '')`,
    [profileId, session.orgId, session.userId],
  );
  if (!row || !row.birth_wall || !row.birth_tz || !row.gender || row.birth_lat === null || row.birth_lng === null) {
    return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const gender = row.gender === "M" || row.gender === "F" ? row.gender as Gender : null;
  const lat = Number(row.birth_lat);
  const lng = Number(row.birth_lng);
  if (!gender || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  }

  try {
    const birthInstant = resolveUnambiguousBirthWallClock(row.birth_wall, row.birth_tz);
    const preview = buildZiweiHourlyPreview({
      birthInstant,
      birthTimezone: row.birth_tz,
      birthLocation: { lat, lng },
      gender,
      referenceInstant,
      referenceTimezone,
    });
    return NextResponse.json({ ok: true, profile: { id: row.id, name: row.nickname || row.name || "", isSelf: true }, preview }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "preview_inputs_unavailable" }, { status: 422, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
