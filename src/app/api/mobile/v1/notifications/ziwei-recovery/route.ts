import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import pushRegistrationReadiness from "@/lib/mobile-push-registration-readiness.cjs";
import { GET as getBirthContextRecovery } from "@/app/api/mobile/v1/profiles/self/birth-context-recovery/route";
import { POST as confirmBirthContextRecovery } from "@/app/api/mobile/v1/profiles/self/birth-context-recovery/confirm/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type DeviceStatus = {
  push_subscribed: boolean;
  push_deliverable: boolean;
  ziwei_enrolled: boolean;
};

const { expoIosPushReady } = pushRegistrationReadiness;

function installationIdFromRequest(req: Request): string | null {
  const installationId = new URL(req.url).searchParams.get("installation_id") || "";
  return UUID_RE.test(installationId) ? installationId.toLowerCase() : null;
}

async function deviceStatus(userId: string, installationId: string): Promise<DeviceStatus> {
  const row = await q1<DeviceStatus & { ios_subscribed: boolean }>(
    `SELECT EXISTS(
              SELECT 1 FROM mobile_push_tokens t
               WHERE t.user_id=$1 AND t.installation_id=$2::uuid AND t.enabled=true
            ) AS push_subscribed,
            EXISTS(
              SELECT 1 FROM mobile_push_tokens t
               WHERE t.user_id=$1 AND t.installation_id=$2::uuid AND t.enabled=true
                 AND ((t.platform='android' AND t.device_token_type='fcm'
                   AND NULLIF(t.device_push_token,'') IS NOT NULL)
                   )
            ) AS push_deliverable,
            EXISTS(
              SELECT 1 FROM mobile_push_tokens t
               WHERE t.user_id=$1 AND t.installation_id=$2::uuid
                 AND t.enabled=true AND t.platform='ios'
            ) AS ios_subscribed,
            EXISTS(
              SELECT 1 FROM mobile_ziwei_hourly_installations i
               WHERE i.user_id=$1 AND i.installation_id=$2::uuid AND i.enabled=true
                 AND i.birth_context_fingerprint IS NOT NULL
            ) AS ziwei_enrolled`,
    [userId, installationId],
  );
  if (!row) return { push_subscribed: false, push_deliverable: false, ziwei_enrolled: false };
  return {
    push_subscribed: row.push_subscribed,
    push_deliverable: row.push_deliverable
      || (row.ios_subscribed && expoIosPushReady(process.env)),
    ziwei_enrolled: row.ziwei_enrolled,
  };
}

function response(status: number, recovery: Record<string, unknown>) {
  return NextResponse.json({ ok: true, recovery }, { status, headers: PRIVATE_HEADERS });
}

function normalizedRecovery(
  raw: Record<string, any>,
  device: DeviceStatus,
): Record<string, unknown> {
  const profileId = typeof raw.profile?.id === "string" ? raw.profile.id : null;
  const common = {
    contractVersion: 1,
    profileId,
    pushSubscribed: device.push_subscribed,
    settingsAction: null as "open_os_settings" | null,
    ziweiEnrolled: device.ziwei_enrolled,
  };
  if (raw.state === "confirmation_required" && profileId && raw.candidate
    && typeof raw.confirmationToken === "string") {
    return {
      ...common,
      candidate: {
        chartChangeRequired: raw.chartChangeRequired === true,
        confirmationToken: raw.confirmationToken,
        locationName: String(raw.candidate.displayName || ""),
        profileId,
        provenance: "location_name_match",
        timezone: typeof raw.candidate.timezone === "string" ? raw.candidate.timezone : null,
      },
      reason: "location_confirmation_required",
      status: "confirmation_required",
    };
  }
  if (raw.state === "complete" && profileId) {
    if (!device.push_subscribed || !device.push_deliverable) {
      return {
        ...common,
        candidate: null,
        reason: "push_permission_blocked",
        settingsAction: "open_os_settings",
        status: "blocked",
      };
    }
    return {
      ...common,
      candidate: null,
      reason: "canonical_context_ready",
      status: "ready",
    };
  }
  const scienceBlockedReason = new Set([
    "birth_calendar_range_unsupported",
    "birth_late_zi_unsupported",
    "birth_wall_clock_ambiguous",
  ]).has(String(raw.reason || ""))
    ? String(raw.reason)
    : null;
  if (raw.state === "manual_review" && profileId && scienceBlockedReason) {
    return {
      ...common,
      candidate: null,
      reason: scienceBlockedReason,
      status: "blocked",
    };
  }
  return {
    ...common,
    candidate: null,
    reason: profileId ? "location_evidence_lost" : "profile_ineligible",
    status: "blocked",
  };
}

async function relayStatus(req: Request, upstream: Response, installationId: string) {
  const raw = await upstream.json().catch(() => null) as Record<string, any> | null;
  if (!upstream.ok || !raw || raw.ok !== true) {
    return NextResponse.json(raw || { ok: false, error: "recovery_api_unavailable" }, {
      status: upstream.status,
      headers: PRIVATE_HEADERS,
    });
  }
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401, headers: PRIVATE_HEADERS });
  return response(200, normalizedRecovery(raw, await deviceStatus(session.userId, installationId)));
}

export async function GET(req: Request) {
  const installationId = installationIdFromRequest(req);
  if (!installationId) {
    return NextResponse.json({ ok: false, error: "invalid_installation_id" }, { status: 400, headers: PRIVATE_HEADERS });
  }
  return relayStatus(req, await getBirthContextRecovery(req), installationId);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body).sort() : [];
  if (!body || JSON.stringify(keys) !== JSON.stringify(["acceptChartChange", "action", "confirmationToken", "installation_id", "profileId"])) {
    return NextResponse.json({ ok: false, error: "invalid_confirmation_request" }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (typeof body.installation_id !== "string" || !UUID_RE.test(body.installation_id)) {
    return NextResponse.json({ ok: false, error: "invalid_installation_id" }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const installationId = body.installation_id.toLowerCase();
  if (body.action !== "confirm_location" || typeof body.confirmationToken !== "string"
    || typeof body.profileId !== "string" || typeof body.acceptChartChange !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_confirmation_request" }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const forwarded = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({
      profileId: body.profileId,
      confirmationToken: body.confirmationToken,
      confirm: true,
      acceptChartChange: body.acceptChartChange,
    }),
  });
  return relayStatus(req, await confirmBirthContextRecovery(forwarded), installationId);
}
