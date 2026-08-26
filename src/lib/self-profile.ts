/**
 * self-profile.ts · shared upsert for the OWNER's self profile
 * Codex direction: one self profile per user · do not create duplicates
 *
 * Identity key: active row in the org whose relationship_type is blank/null.
 * Multiple active rows? → pick newest by created_at · preserve UUID · UPDATE.
 * No active row? → INSERT new · created_at=now() · updated_at=now().
 *
 * Concurrency guarantee:
 *   pg_advisory_xact_lock keyed by hashtext(org_id + user_id) inside a single
 *   transaction. Two concurrent self-create requests for the same user serialize
 *   on the lock so only one INSERT happens.
 *
 * BaZi derived columns (day_master, day_master_strength, yongshen, bazi_pillars)
 * are recomputed via the shared Layer 0 helper `calcBazi`. Do NOT inline tyme4ts.
 */

import crypto from "node:crypto";
import { pool } from "./db";
import { calcBazi } from "./bazi-calc";
import { resolveBirthTz, tzOffsetHoursAt, wallClockToUtc, type TzSpec } from "./birth-timezone";
import { strictCanonicalZiweiTimezone } from "./astro/ziwei/context-resolver";

export type UpsertSelfFields = {
  name: string;
  nickname?: string | null;
  birthDate: string;   // "YYYY-MM-DD"
  birthTime: string;   // "HH:MM" · ignored ถ้า birthTimeKnown=false
  birthLat?: number | null;
  birthLng?: number | null;
  locationName?: string | null;
  gender?: "M" | "F" | null;
  dayBoundary?: "23:00" | "00:00";
  /* 19 พ.ค. Option α · birthTimeKnown=false → 3p mode · hour pillar = null */
  birthTimeKnown?: boolean;
  birthTz?: string | null;
  birthPlaceId?: string | null;
  birthLocationConfirmed?: boolean;
};

export type UpsertSelfResult = {
  id: string;
  created: boolean;
};

export type BirthCoordinatePatch =
  | { provided: false }
  | { provided: true; birthLat: number | null; birthLng: number | null };

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/**
 * Preserve the semantic difference between an omitted location and an explicit
 * clear. A coordinate is one fact, so latitude and longitude must move together.
 */
export function parseBirthCoordinatePatch(input: {
  birthLat?: unknown;
  birthLng?: unknown;
}): BirthCoordinatePatch {
  const latProvided = hasOwn(input, "birthLat") && input.birthLat !== undefined;
  const lngProvided = hasOwn(input, "birthLng") && input.birthLng !== undefined;
  if (latProvided !== lngProvided) {
    throw new TypeError("birthLat and birthLng must be provided together");
  }
  if (!latProvided) return { provided: false };

  const latEmpty = input.birthLat === null || (typeof input.birthLat === "string" && !input.birthLat.trim());
  const lngEmpty = input.birthLng === null || (typeof input.birthLng === "string" && !input.birthLng.trim());
  if (latEmpty !== lngEmpty) {
    throw new TypeError("birthLat and birthLng must both be coordinates or both be empty");
  }
  if (latEmpty) return { provided: true, birthLat: null, birthLng: null };

  const supportedLat = typeof input.birthLat === "number" || typeof input.birthLat === "string";
  const supportedLng = typeof input.birthLng === "number" || typeof input.birthLng === "string";
  const birthLat = supportedLat ? Number(input.birthLat) : Number.NaN;
  const birthLng = supportedLng ? Number(input.birthLng) : Number.NaN;
  if (!Number.isFinite(birthLat) || !Number.isFinite(birthLng)) {
    throw new TypeError("birth coordinates invalid");
  }
  if (birthLat < -90 || birthLat > 90 || birthLng < -180 || birthLng > 180) {
    throw new RangeError("birth coordinates out of range");
  }
  return { provided: true, birthLat, birthLng };
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function upsertSelfProfile(
  session: { orgId?: string | null; userId: string },
  fields: UpsertSelfFields
): Promise<UpsertSelfResult> {
  if (!session.orgId) throw new Error("upsertSelfProfile: session.orgId required");
  const orgId = session.orgId;

  const coordinatePatch = parseBirthCoordinatePatch(fields);
  const nicknameProvided = fields.nickname !== undefined;
  const locationNameProvided = fields.locationName !== undefined;
  const genderProvided = fields.gender !== undefined;
  const birthTimeKnownProvided = fields.birthTimeKnown !== undefined;
  const dayBoundaryProvided = fields.dayBoundary !== undefined;
  const birthTzText = typeof fields.birthTz === "string" ? fields.birthTz.trim() : "";
  const requestedBirthTz = fields.birthTz === undefined
    ? undefined
    : strictCanonicalZiweiTimezone(birthTzText || null);
  if (birthTzText && !requestedBirthTz) throw new TypeError("upsertSelfProfile: birth timezone invalid");
  const birthPlaceIdProvided = fields.birthPlaceId !== undefined;
  const birthPlaceId = typeof fields.birthPlaceId === "string" && fields.birthPlaceId.trim()
    ? fields.birthPlaceId.trim().slice(0, 255)
    : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // advisory lock · serialize concurrent self-upserts for the same user
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`,
      [orgId, session.userId]
    );

    const existingRes = await client.query<{
      id: string;
      birth_tz: string | null;
      birth_lat: string | number | null;
      birth_lng: string | number | null;
      gender: string | null;
      birth_time_known: boolean | null;
      day_boundary: string | null;
    }>(
      `SELECT id,birth_tz,birth_lat,birth_lng,gender,birth_time_known,day_boundary FROM profiles
       WHERE org_id=$1
         AND created_by_user_id=$2
         AND is_archived=false
         AND (relationship_type IS NULL OR btrim(relationship_type) = '')
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId, session.userId]
    );
    const existing = existingRes.rows[0] || null;
    const birthTimeKnown = birthTimeKnownProvided
      ? fields.birthTimeKnown !== false
      : existing?.birth_time_known !== false;                    /* insert default true · update preserves */
    const dayBoundary = dayBoundaryProvided
      ? (fields.dayBoundary === "00:00" ? "00:00" : "23:00")
      : (existing?.day_boundary === "00:00" ? "00:00" : "23:00");
    const effectiveBirthLng = coordinatePatch.provided
      ? coordinatePatch.birthLng
      : finiteNumber(existing?.birth_lng);
    const effectiveGender = genderProvided
      ? fields.gender
      : (existing?.gender === "M" || existing?.gender === "F" ? existing.gender : null);
    const canonicalBirthTz = requestedBirthTz !== undefined
      ? requestedBirthTz
      : strictCanonicalZiweiTimezone(existing?.birth_tz ?? null);
    const birthTzSpec: TzSpec | null = canonicalBirthTz
      ? {
        label: canonicalBirthTz.timezone,
        kind: canonicalBirthTz.kind === "fixed_offset" ? "offset" : "zone",
        ...(canonicalBirthTz.offsetMinutes === undefined ? {} : { offsetMin: canonicalBirthTz.offsetMinutes }),
      }
      : null;
    const birthTz = birthTzSpec?.label ?? null;
    const birthTzSource = birthTzSpec
      ? (birthTzSpec.kind === "offset" ? "user_confirmed_exact_offset" : "user_confirmed_iana")
      : null;
    const birthWall = `${fields.birthDate}T${birthTimeKnown ? fields.birthTime : "12:00"}:00`;
    const resolvedBirthTz = resolveBirthTz(birthTzSpec);
    const birthInstant = wallClockToUtc(birthWall, resolvedBirthTz);
    if (!birthInstant || !Number.isFinite(birthInstant.valueOf())) {
      throw new TypeError("upsertSelfProfile: birth datetime invalid");
    }
    const gmtOffsetHours = tzOffsetHoursAt(resolvedBirthTz, birthInstant);
    const calc = birthTimeKnown
      ? await calcBazi({
          date: fields.birthDate,
          time: fields.birthTime,
          longitude: effectiveBirthLng ?? 100.5018,
          gmtOffsetHours,
          gender: effectiveGender ?? undefined,
          dayBoundary,
          birthTimeKnown: true,
        })
      : await calcBazi({
          date: fields.birthDate,
          longitude: effectiveBirthLng ?? 100.5018,
          gmtOffsetHours,
          gender: effectiveGender ?? undefined,
          birthTimeKnown: false,
        });

    /* 3p: birth_datetime ใน DB ใช้ 12:00 anchor (ไม่ใช่ pillar) · flag birth_time_known=false */
    const dbTime = birthTimeKnown ? fields.birthTime : "12:00";
    const isoDt = `${fields.birthDate}T${dbTime}:00+07:00`;
    const yongshenJson = JSON.stringify({ top3: calc.yongshen, climate: calc.climate });
    const baziJson = JSON.stringify({ pillars: calc.pillars, ge_ju: calc.geJu.structure, day_boundary: dayBoundary });

    if (existing) {
      await client.query(
        `UPDATE profiles SET
           name=$1, nickname=CASE WHEN $2::boolean THEN $3 ELSE nickname END,
           birth_datetime=$4,
           birth_lat=CASE WHEN $5::boolean THEN $6 ELSE birth_lat END,
           birth_lng=CASE WHEN $5::boolean THEN $7 ELSE birth_lng END,
           birth_location_name=CASE WHEN $8::boolean THEN $9 ELSE birth_location_name END,
           gender=CASE WHEN $10::boolean THEN $11 ELSE gender END,
           day_master=$12, day_master_strength=$13, yongshen=$14, bazi_pillars=$15,
           birth_time_known=CASE WHEN $16::boolean THEN $17 ELSE birth_time_known END,
           day_boundary=CASE WHEN $18::boolean THEN $19 ELSE day_boundary END,
           birth_tz=CASE WHEN $20::boolean THEN $21 ELSE birth_tz END,
           birth_tz_source=CASE WHEN $20::boolean THEN $22 ELSE birth_tz_source END,
           birth_tz_confirmed_at=CASE WHEN $20::boolean THEN CASE WHEN $21::text IS NULL THEN NULL ELSE now() END ELSE birth_tz_confirmed_at END,
           birth_tz_tzdb_version=CASE WHEN $20::boolean THEN CASE WHEN $21::text IS NULL THEN NULL ELSE $23 END ELSE birth_tz_tzdb_version END,
           birth_place_id=CASE WHEN $24::boolean THEN $25 ELSE birth_place_id END,
           birth_location_source=CASE WHEN $24::boolean THEN CASE WHEN $25::text IS NULL THEN NULL ELSE 'user_confirmed_google_place' END ELSE birth_location_source END,
           birth_location_confirmed_at=CASE WHEN $24::boolean THEN CASE WHEN $26::boolean THEN now() ELSE NULL END ELSE birth_location_confirmed_at END,
           network_group='self', network_group_label=NULL,
           updated_at=now()
         WHERE id=$27`,
        [
          fields.name,
          nicknameProvided,
          fields.nickname ?? null,
          isoDt,
          coordinatePatch.provided,
          coordinatePatch.provided ? coordinatePatch.birthLat : null,
          coordinatePatch.provided ? coordinatePatch.birthLng : null,
          locationNameProvided,
          fields.locationName ?? null,
          genderProvided,
          fields.gender ?? null,
          calc.dayMaster,
          calc.strength.level,
          yongshenJson,
          baziJson,
          birthTimeKnownProvided,
          birthTimeKnown,
          dayBoundaryProvided,
          dayBoundary,
          fields.birthTz !== undefined,
          birthTz,
          birthTzSource,
          birthTz ? `node-icu-${process.versions.icu || "unknown"}` : null,
          birthPlaceIdProvided,
          birthPlaceId,
          fields.birthLocationConfirmed === true && birthPlaceId !== null,
          existing.id,
        ]
      );
      await client.query("COMMIT");
      return { id: existing.id, created: false };
    }

    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO profiles (
         id, org_id, created_by_user_id, name, nickname,
         birth_datetime, birth_lat, birth_lng, birth_location_name, gender,
         relationship_type, network_group, network_group_label, day_master, day_master_strength, yongshen, bazi_pillars,
         birth_source, birth_time_known, day_boundary, birth_tz, birth_tz_source,
         birth_tz_confirmed_at,birth_tz_tzdb_version,birth_place_id,birth_location_source,birth_location_confirmed_at,
         is_archived, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9,$10, NULL, 'self', NULL, $11,$12,$13,$14,
                 'self_reported', $15, $16, $17, $18,
                 CASE WHEN $17::text IS NULL THEN NULL ELSE now() END,$19,$20,$21,
                 CASE WHEN $22::boolean THEN now() ELSE NULL END,
                 false, now(), now())`,
      [
        id,
        orgId,
        session.userId,
        fields.name,
        fields.nickname ?? null,
        isoDt,
        coordinatePatch.provided ? coordinatePatch.birthLat : null,
        coordinatePatch.provided ? coordinatePatch.birthLng : null,
        fields.locationName ?? null,
        fields.gender ?? null,
        calc.dayMaster,
        calc.strength.level,
        yongshenJson,
        baziJson,
        birthTimeKnown,
        dayBoundary,
        birthTz,
        birthTzSource,
        birthTz ? `node-icu-${process.versions.icu || "unknown"}` : null,
        birthPlaceId,
        birthPlaceId ? "user_confirmed_google_place" : null,
        fields.birthLocationConfirmed === true && birthPlaceId !== null,
      ]
    );
    await client.query("COMMIT");
    return { id, created: true };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
