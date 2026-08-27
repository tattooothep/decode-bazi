import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { pool, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  lookupZiweiBirthTimezoneCandidate,
  lookupZiweiBirthTimezoneAtCoordinates,
  recoveryCandidateDigest,
  recoveryConfirmationToken,
  recoveryTokenDigest,
  recoveryTokenMatchesDigest,
  ZIWEI_BIRTH_RECOVERY_CONTRACT,
  type ZiweiBirthTimezoneCandidate,
} from "@/lib/astro/ziwei/birth-context-recovery";
import {
  resolveCanonicalZiweiContext,
  resolveCanonicalZiweiHourlyContext,
  type CanonicalZiweiBlockedReason,
} from "@/lib/astro/ziwei/context-resolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const;
const APPROVED_SOURCES = new Set(["user_confirmed_iana", "user_confirmed_exact_offset", "verified_import"]);

type ProfileRow = {
  id: string;
  birth_wall: string | null;
  birth_tz: string | null;
  birth_tz_source: string | null;
  birth_tz_confirmed_at: string | Date | null;
  birth_location_name: string | null;
  birth_lat: string | number | null;
  birth_lng: string | number | null;
  birth_place_id: string | null;
  birth_location_confirmed_at: string | Date | null;
  birth_time_known: boolean | null;
  gender: string | null;
  updated_at_exact: string;
};

type PendingRow = {
  id: string;
  candidate_display_name: string | null;
  candidate_place_id: string | null;
  candidate_latitude: string | number | null;
  candidate_longitude: string | number | null;
  candidate_timezone: string | null;
  candidate_provider: string | null;
  candidate_digest: string;
  confirmation_token_digest: string;
  profile_fresh: boolean;
  chart_change_required: boolean;
};

function profilePayload(profileId: string) {
  return { id: profileId, isSelf: true };
}

function publicCandidate(candidate: ZiweiBirthTimezoneCandidate) {
  return { displayName: candidate.displayName, timezone: candidate.timezone };
}

function candidateFromPending(row: PendingRow): ZiweiBirthTimezoneCandidate | null {
  const latitude = row.candidate_latitude === null ? Number.NaN : Number(row.candidate_latitude);
  const longitude = row.candidate_longitude === null ? Number.NaN : Number(row.candidate_longitude);
  if (typeof row.candidate_display_name !== "string" || !row.candidate_display_name.trim()
    || typeof row.candidate_place_id !== "string" || !row.candidate_place_id.trim()
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || typeof row.candidate_timezone !== "string" || !row.candidate_timezone.trim()
    || row.candidate_provider !== "google_geocoding_timezone_v1") {
    return null;
  }
  const candidate: ZiweiBirthTimezoneCandidate = Object.freeze({
    displayName: row.candidate_display_name,
    placeId: row.candidate_place_id,
    latitude,
    longitude,
    timezone: row.candidate_timezone,
    provider: "google_geocoding_timezone_v1",
    confidence: "candidate_requires_user_confirmation",
  });
  return recoveryCandidateDigest(candidate) === row.candidate_digest ? candidate : null;
}

function confirmationRequiredPayload(
  profileId: string,
  recoveryId: string,
  candidate: ZiweiBirthTimezoneCandidate,
  confirmationToken: string,
  chartChangeRequired: boolean,
) {
  return {
    ok: true,
    contractVersion: ZIWEI_BIRTH_RECOVERY_CONTRACT,
    state: "confirmation_required",
    recoveryId,
    profile: profilePayload(profileId),
    candidate: publicCandidate(candidate),
    confirmationToken,
    chartChangeRequired,
    requires_birth_reentry: false,
  };
}

function compatibilityAndCandidate(profile: ProfileRow, timezone: string) {
  const referenceInstant = new Date();
  const referenceTimezone = "Asia/Bangkok";
  const oldContext = resolveCanonicalZiweiContext({
    mode: "legacy_chart",
    birthWallClock: profile.birth_wall || "",
    birthTimezone: profile.birth_tz,
    birthTimezoneSource: profile.birth_tz ? "profile" : undefined,
    referenceInstant,
    referenceTimezone,
  });
  const candidateContext = resolveCanonicalZiweiHourlyContext({
    mode: "strict",
    birthWallClock: profile.birth_wall || "",
    birthTimezone: timezone,
    birthTimezoneSource: "profile",
    referenceInstant,
    referenceTimezone,
  });
  if (candidateContext.status === "blocked") {
    return { blockedReason: candidateContext.reason } as const;
  }
  if (candidateContext.status !== "resolved") {
    return { blockedReason: "birth_timezone_invalid" as CanonicalZiweiBlockedReason } as const;
  }
  const oldCalculation = oldContext.status === "blocked" ? null : {
    instant: oldContext.birth.instant,
    offset: oldContext.birth.utcOffsetMinutes,
  };
  const candidateCalculation = {
    instant: candidateContext.birth.instant,
    offset: candidateContext.birth.utcOffsetMinutes,
  };
  return {
    chartChangeRequired: oldCalculation === null
      || oldCalculation.instant !== candidateCalculation.instant
      || oldCalculation.offset !== candidateCalculation.offset,
    oldFingerprint: oldContext.status === "blocked" ? null : oldContext.birthFingerprint,
    candidateFingerprint: candidateContext.birthFingerprint,
  };
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401, headers: PRIVATE_HEADERS });
  const limited = await rateLimit(`ziwei-birth-recovery:${session.userId}:${clientIp(req)}`, 10, 60_000);
  if (!limited.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: PRIVATE_HEADERS });

  const profile = await q1<ProfileRow>(
    `SELECT id,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_wall,
            birth_tz,birth_tz_source,birth_tz_confirmed_at,birth_location_name,
            birth_lat,birth_lng,birth_place_id,birth_location_confirmed_at,
            birth_time_known,gender,updated_at::text AS updated_at_exact
       FROM profiles
      WHERE org_id=$1 AND created_by_user_id=$2 AND COALESCE(is_archived,false)=false
        AND (relationship_type IS NULL OR btrim(relationship_type)='')
      ORDER BY created_at DESC LIMIT 1`,
    [session.orgId, session.userId],
  );
  if (!profile || !profile.birth_wall || profile.birth_time_known !== true
    || (profile.gender !== "M" && profile.gender !== "F")) {
    return NextResponse.json({
      ok: true,
      contractVersion: ZIWEI_BIRTH_RECOVERY_CONTRACT,
      state: "manual_review",
      reason: "canonical_birth_facts_unavailable",
      requires_birth_reentry: false,
    }, { headers: PRIVATE_HEADERS });
  }

  if (profile.birth_tz && profile.birth_tz_confirmed_at
    && APPROVED_SOURCES.has(String(profile.birth_tz_source || ""))) {
    const context = resolveCanonicalZiweiHourlyContext({
      mode: "strict",
      birthWallClock: profile.birth_wall,
      birthTimezone: profile.birth_tz,
      birthTimezoneSource: "profile",
      referenceInstant: new Date(),
      referenceTimezone: "Asia/Bangkok",
    });
    if (context.status === "resolved") {
      return NextResponse.json({
        ok: true,
        contractVersion: ZIWEI_BIRTH_RECOVERY_CONTRACT,
        state: "complete",
        profile: profilePayload(profile.id),
        context: { status: "resolved", timezone: context.birth.timezone, fingerprint: context.fingerprint },
        requires_birth_reentry: false,
      }, { headers: PRIVATE_HEADERS });
    }
  }

  const existing = await q1<PendingRow>(
    `SELECT r.id,r.candidate_display_name,r.candidate_place_id,r.candidate_latitude,
            r.candidate_longitude,r.candidate_timezone,r.candidate_provider,r.candidate_digest,
            r.confirmation_token_digest,(r.profile_updated_at_seen=p.updated_at) AS profile_fresh,
            r.chart_change_required
       FROM profile_birth_context_recoveries r
       JOIN profiles p ON p.id=r.profile_id AND p.created_by_user_id=r.user_id
      WHERE r.user_id=$1 AND r.profile_id=$2
        AND r.status='confirmation_required' AND r.expires_at>now()`,
    [session.userId, profile.id],
  ).catch(() => null);

  const existingCandidate = existing?.profile_fresh === true ? candidateFromPending(existing) : null;
  let candidate: ZiweiBirthTimezoneCandidate | null = null;
  let candidateFailureReason = "recovery_provider_unavailable";
  if (existingCandidate) {
    candidate = existingCandidate;
  } else {
    try {
      const latitude = Number(profile.birth_lat);
      const longitude = Number(profile.birth_lng);
      const hasConfirmedCoordinates = profile.birth_lat !== null && profile.birth_lng !== null
        && Number.isFinite(latitude) && Number.isFinite(longitude)
        && !!profile.birth_place_id && !!profile.birth_location_name
        && !!profile.birth_location_confirmed_at;
      candidate = hasConfirmedCoordinates ? {
        displayName: String(profile.birth_location_name || ""),
        placeId: profile.birth_place_id!,
        latitude,
        longitude,
        timezone: await lookupZiweiBirthTimezoneAtCoordinates({
          latitude,
          longitude,
          birthWallClock: profile.birth_wall,
          apiKey: process.env.GOOGLE_MAPS_SERVER_KEY || "",
        }),
        provider: "google_geocoding_timezone_v1",
        confidence: "candidate_requires_user_confirmation",
      } : await lookupZiweiBirthTimezoneCandidate({
          locationName: String(profile.birth_location_name || ""),
          birthWallClock: profile.birth_wall,
          apiKey: process.env.GOOGLE_MAPS_SERVER_KEY || "",
        });
    } catch (error) {
      candidateFailureReason = error instanceof Error ? error.message : "recovery_provider_unavailable";
    }
  }
  const tokenSecret = process.env.AUTH_SECRET || "";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('ziwei-birth-recovery:'||$1::text,0))`, [session.userId]);
    const locked = await client.query<{ updated_at_exact: string; profile_unchanged: boolean }>(
      `SELECT updated_at::text AS updated_at_exact,
              (updated_at=$4::timestamptz) AS profile_unchanged
         FROM profiles
        WHERE id=$1 AND created_by_user_id=$2 AND org_id=$3
          AND COALESCE(is_archived,false)=false
          AND (relationship_type IS NULL OR btrim(relationship_type)='')
        FOR UPDATE`,
      [profile.id, session.userId, session.orgId, profile.updated_at_exact],
    );
    if (!locked.rows[0] || locked.rows[0].profile_unchanged !== true) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "profile_changed" }, { status: 409, headers: PRIVATE_HEADERS });
    }

    // The initial read/provider lookup happens outside the transaction. Read
    // the pending row again under the owner lock so overlapping GET requests
    // converge on one immutable row and one reusable token.
    const activeResult = await client.query<PendingRow>(
      `SELECT r.id,r.candidate_display_name,r.candidate_place_id,r.candidate_latitude,
              r.candidate_longitude,r.candidate_timezone,r.candidate_provider,r.candidate_digest,
              r.confirmation_token_digest,(r.profile_updated_at_seen=p.updated_at) AS profile_fresh,
              r.chart_change_required
         FROM profile_birth_context_recoveries r
         JOIN profiles p ON p.id=r.profile_id AND p.created_by_user_id=r.user_id
        WHERE r.user_id=$1 AND r.profile_id=$2
          AND r.status='confirmation_required' AND r.expires_at>now()
        FOR UPDATE OF r`,
      [session.userId, profile.id],
    );
    const active = activeResult.rows[0];
    if (active) {
      const activeCandidate = candidateFromPending(active);
      if (!activeCandidate) {
        await client.query(
          `UPDATE profile_birth_context_recoveries
              SET status='manual_review',failure_code='candidate_digest_mismatch',updated_at=now()
            WHERE id=$1`,
          [active.id],
        );
        await client.query("COMMIT");
        return NextResponse.json({
          ok: true,
          contractVersion: ZIWEI_BIRTH_RECOVERY_CONTRACT,
          state: "manual_review",
          reason: "recovery_evidence_changed",
          profile: profilePayload(profile.id),
          requires_birth_reentry: false,
        }, { headers: PRIVATE_HEADERS });
      }
      const activeFresh = active.profile_fresh === true;
      const reusableToken = activeFresh ? recoveryConfirmationToken({
        recoveryId: active.id,
        userId: session.userId,
        profileId: profile.id,
        candidateDigest: active.candidate_digest,
      }, tokenSecret) : null;
      if (reusableToken && recoveryTokenMatchesDigest(reusableToken, active.confirmation_token_digest)) {
        await client.query("COMMIT");
        return NextResponse.json(
          confirmationRequiredPayload(
            profile.id,
            active.id,
            activeCandidate,
            reusableToken,
            active.chart_change_required,
          ),
          { headers: PRIVATE_HEADERS },
        );
      }
      await client.query(
        `UPDATE profile_birth_context_recoveries
            SET status='expired',failure_code=$2,updated_at=now()
          WHERE id=$1`,
        [active.id, activeFresh ? "token_format_rotated" : "profile_changed_or_expired"],
      );
    }

    // A concurrent request may have created the reusable row while this
    // request's provider lookup failed. Only expose the provider failure after
    // the locked re-read proves there is no usable active row.
    if (!candidate) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        ok: true,
        contractVersion: ZIWEI_BIRTH_RECOVERY_CONTRACT,
        state: "manual_review",
        reason: candidateFailureReason,
        profile: profilePayload(profile.id),
        requires_birth_reentry: false,
      }, { headers: PRIVATE_HEADERS });
    }

    const comparison = compatibilityAndCandidate(profile, candidate.timezone);
    if ("blockedReason" in comparison) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        ok: true,
        contractVersion: ZIWEI_BIRTH_RECOVERY_CONTRACT,
        state: "manual_review",
        reason: comparison.blockedReason,
        profile: profilePayload(profile.id),
        requires_birth_reentry: false,
      }, { headers: PRIVATE_HEADERS });
    }
    const candidateDigest = recoveryCandidateDigest(candidate);

    // Clear an elapsed legacy pending row that is still covered by the unique
    // pending index before inserting its deterministic replacement.
    await client.query(
      `UPDATE profile_birth_context_recoveries
          SET status='expired',failure_code='expired_before_reissue',updated_at=now()
        WHERE user_id=$1 AND profile_id=$2 AND status='confirmation_required'`,
      [session.userId, profile.id],
    );

    const recoveryId = crypto.randomUUID();
    const confirmationToken = recoveryConfirmationToken({
      recoveryId,
      userId: session.userId,
      profileId: profile.id,
      candidateDigest,
    }, tokenSecret);
    const tokenDigest = recoveryTokenDigest(confirmationToken);
    await client.query(
      `INSERT INTO profile_birth_context_recoveries
         (id,user_id,profile_id,status,observed_location_name,observed_birth_tz,
          candidate_display_name,candidate_place_id,candidate_latitude,candidate_longitude,
          candidate_timezone,candidate_provider,candidate_digest,evidence_kind,
          confirmation_token_digest,profile_updated_at_seen,chart_change_required,
          old_natal_fingerprint,candidate_natal_fingerprint,expires_at)
       VALUES($1,$2,$3,'confirmation_required',$4,$5,$6,$7,$8,$9,$10,$11,$12,
              'geocoded_existing_location_user_confirmation',$13,$14,$15,$16,$17,now()+interval '15 minutes')`,
      [
        recoveryId, session.userId, profile.id, profile.birth_location_name, profile.birth_tz,
        candidate.displayName, candidate.placeId, candidate.latitude, candidate.longitude,
        candidate.timezone, candidate.provider, candidateDigest, tokenDigest,
        locked.rows[0].updated_at_exact, comparison.chartChangeRequired,
        comparison.oldFingerprint, comparison.candidateFingerprint,
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json(
      confirmationRequiredPayload(
        profile.id,
        recoveryId,
        candidate,
        confirmationToken,
        comparison.chartChangeRequired,
      ),
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    console.error("[ziwei-birth-recovery]", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: "recovery_unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  } finally {
    client.release();
  }
}
