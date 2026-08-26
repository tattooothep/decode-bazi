import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  exactObjectKeys, guardSciencePreviewRequest, PRIVATE_NO_STORE_HEADERS, readBoundedJson,
  sciencePreviewEnabledForUser, strictIanaTimezone, strictRfc3339Instant, strictUuid,
} from "@/lib/mobile-science-preview-route";
import {
  buildQizhengElectionalPreview, QIZHENG_ELECTIONAL_SOURCE_VERSION, type QizhengPreviewActivity,
} from "@/lib/astro/qizheng/electional-preview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await guardSciencePreviewRequest(req, {
    rateKeyPrefix: "mobile-qizheng-electional-preview", rateMax: 6, rateWindowMs: 60_000,
    enabledKey: "QIZHENG_ELECTIONAL_PREVIEW_ENABLED", allowlistKey: "QIZHENG_ELECTIONAL_PREVIEW_USER_IDS",
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
  if (body.schema !== 1 || !exactObjectKeys(body, [
    "schema", "profileId", "candidateInstant", "candidateTimezone", "candidateLocation",
    "activity", "directionDeg", "sourceEvidenceVersion",
  ])) {
    return NextResponse.json({ ok: false, error: "invalid_preview_request" }, { status: 422, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const profileId = strictUuid(body.profileId);
  const candidateInstant = strictRfc3339Instant(body.candidateInstant);
  if (!profileId || !candidateInstant || body.sourceEvidenceVersion !== QIZHENG_ELECTIONAL_SOURCE_VERSION) {
    return NextResponse.json({ ok: false, error: "invalid_preview_request" }, { status: 422, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const candidateTimezone = strictIanaTimezone(body.candidateTimezone, candidateInstant);
  const location = body.candidateLocation && typeof body.candidateLocation === "object" && !Array.isArray(body.candidateLocation)
    ? body.candidateLocation as Record<string, unknown> : {};
  if (!exactObjectKeys(location, ["lat", "lng"])) {
    return NextResponse.json({ ok: false, error: "invalid_preview_request" }, { status: 422, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const lat = typeof location.lat === "number" ? location.lat : Number.NaN;
  const lng = typeof location.lng === "number" ? location.lng : Number.NaN;
  const directionDeg = typeof body.directionDeg === "number" ? body.directionDeg : Number.NaN;
  const activity = typeof body.activity === "string" ? body.activity as QizhengPreviewActivity : "" as QizhengPreviewActivity;
  if (!candidateTimezone || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(directionDeg)) {
    return NextResponse.json({ ok: false, error: "invalid_preview_request" }, { status: 422, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const row = await q1<{ id: string; name: string | null; nickname: string | null }>(
    `SELECT id,name,nickname FROM profiles
      WHERE id=$1 AND org_id=$2 AND created_by_user_id=$3
        AND COALESCE(is_archived, false)=false
        AND (relationship_type IS NULL OR btrim(relationship_type) = '')`,
    [profileId, session.orgId, session.userId],
  );
  if (!row) return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });

  try {
    const preview = buildQizhengElectionalPreview({
      candidateInstant,
      candidateTimezone,
      candidateLocation: { lat, lng },
      activity,
      directionDeg,
      sourceEvidenceVersion: QIZHENG_ELECTIONAL_SOURCE_VERSION,
    });
    return NextResponse.json({ ok: true, profile: { id: row.id, name: row.nickname || row.name || "", isSelf: true }, preview }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "preview_inputs_unavailable" }, { status: 422, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
