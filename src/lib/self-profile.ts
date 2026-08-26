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
import { parseTz, resolveBirthTz, tzOffsetHoursAt, wallClockToUtc } from "./birth-timezone";

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
};

export type UpsertSelfResult = {
  id: string;
  created: boolean;
};

export async function upsertSelfProfile(
  session: { orgId?: string | null; userId: string },
  fields: UpsertSelfFields
): Promise<UpsertSelfResult> {
  if (!session.orgId) throw new Error("upsertSelfProfile: session.orgId required");
  const orgId = session.orgId;

  const birthTimeKnown = fields.birthTimeKnown !== false;        /* default true · backward compat */
  const dayBoundary = fields.dayBoundary === "00:00" ? "00:00" : "23:00";
  const birthTzText = typeof fields.birthTz === "string" ? fields.birthTz.trim() : "";
  const requestedBirthTz = fields.birthTz === undefined ? undefined : parseTz(birthTzText || null);
  if (birthTzText && !requestedBirthTz) throw new TypeError("upsertSelfProfile: birth timezone invalid");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // advisory lock · serialize concurrent self-upserts for the same user
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`,
      [orgId, session.userId]
    );

    const existingRes = await client.query<{ id: string; birth_tz: string | null }>(
      `SELECT id,birth_tz FROM profiles
       WHERE org_id=$1
         AND created_by_user_id=$2
         AND is_archived=false
         AND (relationship_type IS NULL OR btrim(relationship_type) = '')
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId, session.userId]
    );
    const existing = existingRes.rows[0] || null;
    const birthTzSpec = requestedBirthTz !== undefined ? requestedBirthTz : parseTz(existing?.birth_tz ?? null);
    const birthTz = birthTzSpec?.label ?? null;
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
          longitude: fields.birthLng ?? 100.5018,
          gmtOffsetHours,
          gender: fields.gender ?? undefined,
          dayBoundary,
          birthTimeKnown: true,
        })
      : await calcBazi({
          date: fields.birthDate,
          longitude: fields.birthLng ?? 100.5018,
          gmtOffsetHours,
          gender: fields.gender ?? undefined,
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
           name=$1, nickname=$2,
           birth_datetime=$3, birth_lat=$4, birth_lng=$5, birth_location_name=$6, gender=$7,
          day_master=$8, day_master_strength=$9, yongshen=$10, bazi_pillars=$11,
           birth_time_known=$12, day_boundary=$13,
           birth_tz=CASE WHEN $14::boolean THEN $15 ELSE birth_tz END,
           birth_tz_source=CASE WHEN $14::boolean THEN $16 ELSE birth_tz_source END,
           network_group='self', network_group_label=NULL,
           updated_at=now()
         WHERE id=$17`,
        [
          fields.name,
          fields.nickname ?? null,
          isoDt,
          fields.birthLat ?? null,
          fields.birthLng ?? null,
          fields.locationName ?? null,
          fields.gender ?? null,
          calc.dayMaster,
          calc.strength.level,
          yongshenJson,
          baziJson,
          birthTimeKnown,
          dayBoundary,
          fields.birthTz !== undefined,
          birthTz,
          birthTz ? "user_input" : null,
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
         is_archived, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9,$10, NULL, 'self', NULL, $11,$12,$13,$14,
                 'self_reported', $15, $16, $17, $18, false, now(), now())`,
      [
        id,
        orgId,
        session.userId,
        fields.name,
        fields.nickname ?? null,
        isoDt,
        fields.birthLat ?? null,
        fields.birthLng ?? null,
        fields.locationName ?? null,
        fields.gender ?? null,
        calc.dayMaster,
        calc.strength.level,
        yongshenJson,
        baziJson,
        birthTimeKnown,
        dayBoundary,
        birthTz,
        birthTz ? "user_input" : null,
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
