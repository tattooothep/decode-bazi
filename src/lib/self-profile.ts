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

export type UpsertSelfFields = {
  name: string;
  nickname?: string | null;
  birthDate: string;   // "YYYY-MM-DD"
  birthTime: string;   // "HH:MM" · ignored ถ้า birthTimeKnown=false
  birthLat?: number | null;
  birthLng?: number | null;
  locationName?: string | null;
  gender?: "M" | "F" | null;
  /* 19 พ.ค. Option α · birthTimeKnown=false → 3p mode · hour pillar = null */
  birthTimeKnown?: boolean;
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

  // Pre-compute outside the transaction — calcBazi is pure and may be slow.
  // Codex direction: shared Layer 0/1 source · no inline tyme4ts.
  // 19 พ.ค. Option α · branch by birthTimeKnown · 3p ส่ง birthTimeKnown:false · 4p เดิม
  const birthTimeKnown = fields.birthTimeKnown !== false;        /* default true · backward compat */
  const calc = birthTimeKnown
    ? await calcBazi({
        date: fields.birthDate,
        time: fields.birthTime,
        longitude: fields.birthLng ?? 100.5018,
        gmtOffsetHours: 7,
        gender: fields.gender ?? undefined,
        birthTimeKnown: true,
      })
    : await calcBazi({
        date: fields.birthDate,
        longitude: fields.birthLng ?? 100.5018,
        gmtOffsetHours: 7,
        gender: fields.gender ?? undefined,
        birthTimeKnown: false,
      });

  /* 3p: birth_datetime ใน DB ใช้ 12:00 anchor (ไม่ใช่ pillar) · flag birth_time_known=false */
  const dbTime = birthTimeKnown ? fields.birthTime : "12:00";
  const isoDt = `${fields.birthDate}T${dbTime}:00+07:00`;
  const yongshenJson = JSON.stringify({ top3: calc.yongshen, climate: calc.climate });
  const baziJson = JSON.stringify({ pillars: calc.pillars, ge_ju: calc.geJu.structure });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // advisory lock · serialize concurrent self-upserts for the same user
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`,
      [orgId, session.userId]
    );

    const existingRes = await client.query<{ id: string }>(
      `SELECT id FROM profiles
       WHERE org_id=$1
         AND created_by_user_id=$2
         AND is_archived=false
         AND (relationship_type IS NULL OR btrim(relationship_type) = '')
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId, session.userId]
    );
    const existing = existingRes.rows[0] || null;

    if (existing) {
      await client.query(
        `UPDATE profiles SET
           name=$1, nickname=$2,
           birth_datetime=$3, birth_lat=$4, birth_lng=$5, birth_location_name=$6, gender=$7,
           day_master=$8, day_master_strength=$9, yongshen=$10, bazi_pillars=$11,
           birth_time_known=$12,
           updated_at=now()
         WHERE id=$13`,
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
         relationship_type, day_master, day_master_strength, yongshen, bazi_pillars,
         birth_source, birth_time_known, is_archived, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9,$10, NULL, $11,$12,$13,$14, 'self_reported', $15, false, now(), now())`,
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
