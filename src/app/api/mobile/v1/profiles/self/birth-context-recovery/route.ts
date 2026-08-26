import { NextResponse } from "next/server";
import { pool, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  lookupZiweiBirthTimezoneCandidate,
  lookupZiweiBirthTimezoneAtCoordinates,
  newRecoveryToken,
  recoveryCandidateDigest,
  recoveryTokenDigest,
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
  updated_at: string | Date;
};

type PendingRow = {
  id: string;
  candidate_display_name: string;
  candidate_place_id: string;
  candidate_latitude: string | number;
  candidate_longitude: string | number;
  candidate_timezone: string;
  candidate_provider: "google_geocoding_timezone_v1";
  candidate_digest: string;
  chart_change_required: boolean;
};

function profilePayload(profileId: string) {
  return { id: profileId, isSelf: true };
}

function publicCandidate(row: Pick<PendingRow, "candidate_display_name" | "candidate_timezone">) {
  return { displayName: row.candidate_display_name, timezone: row.candidate_timezone };
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
            birth_time_known,gender,updated_at
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
    `SELECT id,candidate_display_name,candidate_place_id,candidate_latitude,candidate_longitude,
            candidate_timezone,candidate_provider,candidate_digest,chart_change_required
       FROM profile_birth_context_recoveries
      WHERE user_id=$1 AND profile_id=$2 AND status='confirmation_required' AND expires_at>now()`,
    [session.userId, profile.id],
  ).catch(() => null);

  let candidate: ZiweiBirthTimezoneCandidate;
  if (existing) {
    candidate = {
      displayName: existing.candidate_display_name,
      placeId: existing.candidate_place_id,
      latitude: Number(existing.candidate_latitude),
      longitude: Number(existing.candidate_longitude),
      timezone: existing.candidate_timezone,
      provider: existing.candidate_provider,
      confidence: "candidate_requires_user_confirmation",
    };
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
      const reason = error instanceof Error ? error.message : "recovery_provider_unavailable";
      return NextResponse.json({
        ok: true,
        contractVersion: ZIWEI_BIRTH_RECOVERY_CONTRACT,
        state: "manual_review",
        reason,
        profile: profilePayload(profile.id),
        requires_birth_reentry: false,
      }, { headers: PRIVATE_HEADERS });
    }
  }

  const comparison = compatibilityAndCandidate(profile, candidate.timezone);
  if ("blockedReason" in comparison) {
    return NextResponse.json({
      ok: true,
      contractVersion: ZIWEI_BIRTH_RECOVERY_CONTRACT,
      state: "manual_review",
      reason: comparison.blockedReason,
      profile: profilePayload(profile.id),
      requires_birth_reentry: false,
    }, { headers: PRIVATE_HEADERS });
  }

  const confirmationToken = newRecoveryToken();
  const tokenDigest = recoveryTokenDigest(confirmationToken);
  const candidateDigest = recoveryCandidateDigest(candidate);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('ziwei-birth-recovery:'||$1::text,0))`, [session.userId]);
    const locked = await client.query<{ updated_at: string | Date }>(
      `SELECT updated_at FROM profiles WHERE id=$1 AND created_by_user_id=$2 FOR UPDATE`,
      [profile.id, session.userId],
    );
    if (!locked.rows[0] || new Date(locked.rows[0].updated_at).valueOf() !== new Date(profile.updated_at).valueOf()) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "profile_changed" }, { status: 409, headers: PRIVATE_HEADERS });
    }
    await client.query(
      `UPDATE profile_birth_context_recoveries
          SET status='expired',failure_code='superseded',updated_at=now()
        WHERE user_id=$1 AND profile_id=$2 AND status='confirmation_required'`,
      [session.userId, profile.id],
    );
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO profile_birth_context_recoveries
         (user_id,profile_id,status,observed_location_name,observed_birth_tz,
          candidate_display_name,candidate_place_id,candidate_latitude,candidate_longitude,
          candidate_timezone,candidate_provider,candidate_digest,evidence_kind,
          confirmation_token_digest,profile_updated_at_seen,chart_change_required,
          old_natal_fingerprint,candidate_natal_fingerprint,expires_at)
       VALUES($1,$2,'confirmation_required',$3,$4,$5,$6,$7,$8,$9,$10,$11,
              'geocoded_existing_location_user_confirmation',$12,$13,$14,$15,$16,now()+interval '15 minutes')
       RETURNING id`,
      [
        session.userId, profile.id, profile.birth_location_name, profile.birth_tz,
        candidate.displayName, candidate.placeId, candidate.latitude, candidate.longitude,
        candidate.timezone, candidate.provider, candidateDigest, tokenDigest,
        new Date(profile.updated_at).toISOString(), comparison.chartChangeRequired,
        comparison.oldFingerprint, comparison.candidateFingerprint,
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      contractVersion: ZIWEI_BIRTH_RECOVERY_CONTRACT,
      state: "confirmation_required",
      recoveryId: inserted.rows[0].id,
      profile: profilePayload(profile.id),
      candidate: publicCandidate({
        candidate_display_name: candidate.displayName,
        candidate_timezone: candidate.timezone,
      }),
      confirmationToken,
      chartChangeRequired: comparison.chartChangeRequired,
      requires_birth_reentry: false,
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    console.error("[ziwei-birth-recovery]", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: "recovery_unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  } finally {
    client.release();
  }
}
