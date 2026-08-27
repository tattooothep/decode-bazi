import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  exactRecoveryConfirmationBody,
  recoveryCandidateDigest,
  recoveryConfirmationToken,
  recoveryTokenDigest,
  recoveryTokenMatchesDigest,
  ZIWEI_BIRTH_RECOVERY_CONTRACT,
} from "@/lib/astro/ziwei/birth-context-recovery";
import { resolveCanonicalZiweiHourlyContext } from "@/lib/astro/ziwei/context-resolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const;
const APPROVED_SOURCES = new Set(["user_confirmed_iana", "user_confirmed_exact_offset", "verified_import"]);

type RecoveryRow = {
  recovery_id: string;
  status: "confirmation_required" | "confirmed" | "expired" | "manual_review";
  profile_id: string;
  candidate_timezone: string;
  candidate_display_name: string | null;
  candidate_place_id: string | null;
  candidate_latitude: number | string | null;
  candidate_longitude: number | string | null;
  candidate_provider: string | null;
  candidate_digest: string;
  candidate_natal_fingerprint: string | null;
  confirmation_token_digest: string;
  chart_change_required: boolean;
  profile_fresh: boolean;
  unexpired: boolean;
  birth_wall: string | null;
  birth_time_known: boolean | null;
  gender: string | null;
  birth_tz: string | null;
  birth_tz_source: string | null;
  birth_tz_confirmed_at: string | Date | null;
  birth_location_name: string | null;
  birth_lat: number | string | null;
  birth_lng: number | string | null;
  birth_place_id: string | null;
  birth_location_source: string | null;
  birth_location_confirmed_at: string | Date | null;
};

function completePayload(
  profileId: string,
  timezone: string,
  fingerprint: string | null,
  birthFingerprint: string,
) {
  return {
    ok: true,
    contractVersion: ZIWEI_BIRTH_RECOVERY_CONTRACT,
    state: "complete",
    profile: { id: profileId, isSelf: true },
    context: { status: "resolved", timezone, fingerprint, birthFingerprint },
    requires_birth_reentry: false,
  };
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401, headers: PRIVATE_HEADERS });
  const limited = await rateLimit(`ziwei-birth-recovery-confirm:${session.userId}:${clientIp(req)}`, 10, 60_000);
  if (!limited.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: PRIVATE_HEADERS });
  const body = exactRecoveryConfirmationBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ ok: false, error: "invalid_confirmation_request" }, { status: 400, headers: PRIVATE_HEADERS });

  const tokenDigest = recoveryTokenDigest(body.confirmationToken);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('ziwei-birth-recovery:'||$1::text,0))`,
      [session.userId],
    );
    const selected = await client.query<RecoveryRow>(
      `SELECT r.id AS recovery_id,r.status,r.profile_id,r.candidate_timezone,
              r.candidate_display_name,r.candidate_place_id,r.candidate_latitude,
              r.candidate_longitude,r.candidate_provider,
              r.candidate_digest,r.candidate_natal_fingerprint,r.confirmation_token_digest,
              r.chart_change_required,
              (r.profile_updated_at_seen=p.updated_at) AS profile_fresh,
              (r.expires_at>now()) AS unexpired,
              to_char(p.birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_wall,
              p.birth_time_known,p.gender,p.birth_tz,p.birth_tz_source,p.birth_tz_confirmed_at,
              p.birth_location_name,p.birth_lat,p.birth_lng,p.birth_place_id,
              p.birth_location_source,p.birth_location_confirmed_at
         FROM profile_birth_context_recoveries r
         JOIN profiles p ON p.id=r.profile_id AND p.created_by_user_id=r.user_id
        WHERE r.confirmation_token_digest=$1 AND r.user_id=$2 AND r.profile_id=$3
          AND p.org_id=$4 AND COALESCE(p.is_archived,false)=false
          AND (p.relationship_type IS NULL OR btrim(p.relationship_type)='')
        FOR UPDATE OF r,p`,
      [tokenDigest, session.userId, body.profileId, session.orgId],
    );
    const row = selected.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "confirmation_not_found" }, { status: 404, headers: PRIVATE_HEADERS });
    }
    const authenticatedToken = recoveryConfirmationToken({
      recoveryId: row.recovery_id,
      userId: session.userId,
      profileId: row.profile_id,
      candidateDigest: row.candidate_digest,
    }, process.env.AUTH_SECRET || "");
    if (!recoveryTokenMatchesDigest(authenticatedToken, row.confirmation_token_digest)) {
      if (row.status === "confirmation_required") {
        await client.query(
          `UPDATE profile_birth_context_recoveries
              SET status='manual_review',failure_code='confirmation_token_authentication_mismatch',updated_at=now()
            WHERE id=$1`,
          [row.recovery_id],
        );
        await client.query("COMMIT");
      } else {
        await client.query("ROLLBACK");
      }
      return NextResponse.json(
        { ok: false, error: "confirmation_evidence_changed" },
        { status: 409, headers: PRIVATE_HEADERS },
      );
    }
    if (row.status === "confirmed") {
      const confirmedContext = row.birth_time_known === true
        && (row.gender === "M" || row.gender === "F")
        && row.birth_tz && row.birth_tz_confirmed_at
        && APPROVED_SOURCES.has(String(row.birth_tz_source || ""))
        ? resolveCanonicalZiweiHourlyContext({
          mode: "strict",
          birthWallClock: row.birth_wall || "",
          birthTimezone: row.birth_tz,
          birthTimezoneSource: "profile",
          referenceInstant: new Date(),
          referenceTimezone: "Asia/Bangkok",
        })
        : null;
      if (!confirmedContext || confirmedContext.status !== "resolved"
        || !row.candidate_natal_fingerprint
        || confirmedContext.birthFingerprint !== row.candidate_natal_fingerprint) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { ok: false, error: "profile_changed" },
          { status: 409, headers: PRIVATE_HEADERS },
        );
      }
      await client.query("COMMIT");
      return NextResponse.json(
        completePayload(
          row.profile_id,
          confirmedContext.birth.timezone,
          confirmedContext.fingerprint,
          confirmedContext.birthFingerprint,
        ),
        { headers: PRIVATE_HEADERS },
      );
    }
    if (row.status !== "confirmation_required") {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "confirmation_expired" }, { status: 409, headers: PRIVATE_HEADERS });
    }
    if (row.profile_fresh !== true || row.unexpired !== true) {
      await client.query(
        `UPDATE profile_birth_context_recoveries
            SET status='expired',failure_code='profile_changed_or_expired',updated_at=now()
          WHERE id=$1`,
        [row.recovery_id],
      );
      await client.query("COMMIT");
      return NextResponse.json({ ok: false, error: "profile_changed" }, { status: 409, headers: PRIVATE_HEADERS });
    }

    const candidateLatitude = typeof row.candidate_latitude === "number"
      ? row.candidate_latitude
      : Number(row.candidate_latitude);
    const candidateLongitude = typeof row.candidate_longitude === "number"
      ? row.candidate_longitude
      : Number(row.candidate_longitude);
    const candidateFactsValid = typeof row.candidate_display_name === "string"
      && row.candidate_display_name.trim().length > 0
      && typeof row.candidate_place_id === "string"
      && row.candidate_place_id.trim().length > 0
      && row.candidate_latitude !== null && row.candidate_longitude !== null
      && Number.isFinite(candidateLatitude) && candidateLatitude >= -90 && candidateLatitude <= 90
      && Number.isFinite(candidateLongitude) && candidateLongitude >= -180 && candidateLongitude <= 180
      && typeof row.candidate_timezone === "string" && row.candidate_timezone.trim().length > 0
      && row.candidate_provider === "google_geocoding_timezone_v1";
    const recomputedCandidateDigest = candidateFactsValid
      ? recoveryCandidateDigest({
        displayName: row.candidate_display_name!,
        placeId: row.candidate_place_id!,
        latitude: candidateLatitude,
        longitude: candidateLongitude,
        timezone: row.candidate_timezone,
        provider: "google_geocoding_timezone_v1",
        confidence: "candidate_requires_user_confirmation",
      })
      : null;
    if (!recomputedCandidateDigest || recomputedCandidateDigest !== row.candidate_digest) {
      await client.query(
        `UPDATE profile_birth_context_recoveries
            SET status='manual_review',failure_code='candidate_digest_mismatch',updated_at=now()
          WHERE id=$1`,
        [row.recovery_id],
      );
      await client.query("COMMIT");
      return NextResponse.json(
        { ok: false, error: "confirmation_evidence_changed" },
        { status: 409, headers: PRIVATE_HEADERS },
      );
    }
    if (row.chart_change_required && !body.acceptChartChange) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        ok: false,
        error: "chart_change_confirmation_required",
        candidate: { timezone: row.candidate_timezone },
        requires_birth_reentry: false,
      }, { status: 409, headers: PRIVATE_HEADERS });
    }

    const context = resolveCanonicalZiweiHourlyContext({
      mode: "strict",
      birthWallClock: row.birth_wall || "",
      birthTimezone: row.candidate_timezone,
      birthTimezoneSource: "profile",
      referenceInstant: new Date(),
      referenceTimezone: "Asia/Bangkok",
    });
    if (context.status !== "resolved") {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "candidate_birth_context_invalid" }, { status: 422, headers: PRIVATE_HEADERS });
    }
    if (!row.candidate_natal_fingerprint
      || context.birthFingerprint !== row.candidate_natal_fingerprint) {
      await client.query(
        `UPDATE profile_birth_context_recoveries
            SET status='manual_review',failure_code='candidate_natal_fingerprint_mismatch',updated_at=now()
          WHERE id=$1`,
        [row.recovery_id],
      );
      await client.query("COMMIT");
      return NextResponse.json(
        { ok: false, error: "confirmation_evidence_changed" },
        { status: 409, headers: PRIVATE_HEADERS },
      );
    }

    const beforeContext = {
      birthTimezone: row.birth_tz,
      birthTimezoneSource: row.birth_tz_source,
      birthTimezoneConfirmedAt: row.birth_tz_confirmed_at,
      birthLocationName: row.birth_location_name,
      birthLatitude: row.birth_lat,
      birthLongitude: row.birth_lng,
      birthPlaceId: row.birth_place_id,
      birthLocationSource: row.birth_location_source,
      birthLocationConfirmedAt: row.birth_location_confirmed_at,
    };
    const afterContext = {
      birthTimezone: context.birth.timezone,
      birthTimezoneSource: "user_confirmed_iana",
      candidateDigest: row.candidate_digest,
      resolverFingerprint: context.fingerprint,
      birthLocationName: row.candidate_display_name,
      birthLatitude: candidateLatitude,
      birthLongitude: candidateLongitude,
      birthPlaceId: row.candidate_place_id,
      birthLocationSource: "user_confirmed_geocoded_place",
    };
    const updatedProfile = await client.query(
      `UPDATE profiles
          SET birth_tz=$1,birth_tz_source='user_confirmed_iana',birth_tz_confirmed_at=now(),
              birth_tz_tzdb_version=$2,birth_location_name=$3,birth_place_id=$4,
              birth_lat=$5,birth_lng=$6,
              birth_location_source='user_confirmed_geocoded_place',
              birth_location_confirmed_at=now(),updated_at=now()
        WHERE id=$7 AND created_by_user_id=$8 AND org_id=$9`,
      [
        context.birth.timezone, `node-icu-${process.versions.icu || "unknown"}`,
        row.candidate_display_name, row.candidate_place_id, candidateLatitude,
        candidateLongitude, row.profile_id, session.userId, session.orgId,
      ],
    );
    if (updatedProfile.rowCount !== 1) throw new Error("recovery_profile_owner_changed");
    await client.query(
      `INSERT INTO profile_birth_context_events
         (recovery_id,user_id,profile_id,event_type,before_context,after_context,candidate_digest,resolver_fingerprint)
       VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,
      [
        row.recovery_id, session.userId, row.profile_id,
        row.birth_tz_confirmed_at ? "timezone_reconfirmed" : "timezone_confirmed",
        JSON.stringify(beforeContext), JSON.stringify(afterContext), row.candidate_digest, context.fingerprint,
      ],
    );
    await client.query(
      `UPDATE profile_birth_context_recoveries
          SET status='confirmed',confirmed_at=now(),applied_at=now(),updated_at=now()
        WHERE id=$1`,
      [row.recovery_id],
    );
    await client.query(
      `UPDATE mobile_ziwei_hourly_installations
          SET enabled=false,next_due_at=NULL,lease_token=NULL,lease_expires_at=NULL,
              last_skip_reason='birth_context_confirmed_reenroll_required',
              owner_generation=owner_generation+1,updated_at=now()
        WHERE user_id=$1 AND profile_id=$2
          AND (enabled=true OR next_due_at IS NOT NULL OR lease_token IS NOT NULL)`,
      [session.userId, row.profile_id],
    );
    await client.query("COMMIT");
    return NextResponse.json(
      completePayload(
        row.profile_id,
        context.birth.timezone,
        context.fingerprint,
        context.birthFingerprint,
      ),
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    console.error("[ziwei-birth-recovery-confirm]", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: "recovery_confirmation_failed" }, { status: 500, headers: PRIVATE_HEADERS });
  } finally {
    client.release();
  }
}
