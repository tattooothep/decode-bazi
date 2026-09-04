#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAstronomyShadowOccurrence,
  type AstronomyShadowRow,
} from "../src/lib/mobile-science-shadow-r8";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

export type ShadowSchedulerDb = {
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

export type ShadowSchedulerOptions = Readonly<{
  at: Date;
  identityKey: Uint8Array;
  identityKeyId: string;
  dry: boolean;
}>;

export type ShadowSchedulerResult = Readonly<{
  candidates: number;
  inserted: number;
  duplicates: number;
  dry: boolean;
}>;

const ROWS_SQL = `SELECT c.id::text AS chain_id,c.account_delivery_chain_uuid::text,
       c.user_id::text,c.org_id::text,s.display_timezone,c.schema_version,
       p.rollout_epoch,c.target_revision,c.consent_generation,
       s.quiet_start,s.quiet_end,s.local_day_cap,
       COALESCE((
         SELECT count(*)::int
           FROM mobile_science_notification_occurrences prior
           JOIN mobile_science_notification_chains prior_chain ON prior_chain.id=prior.chain_id
          WHERE prior_chain.user_id=c.user_id AND prior_chain.org_id=c.org_id
            AND prior.state='shadowed'
            AND (prior.scheduled_for AT TIME ZONE s.display_timezone)::date
                = ($1::timestamptz AT TIME ZONE s.display_timezone)::date
       ),0)::int AS local_day_count,
       COALESCE((
         SELECT count(*)::int
           FROM mobile_science_notification_occurrences prior
           JOIN mobile_science_notification_chains prior_chain ON prior_chain.id=prior.chain_id
          WHERE prior_chain.user_id=c.user_id AND prior_chain.org_id=c.org_id
            AND prior.state='shadowed'
            AND prior.scheduled_for>$1::timestamptz-interval '24 hours'
            AND prior.scheduled_for<=$1::timestamptz
       ),0)::int AS rolling_24h_count
  FROM mobile_science_notification_shadow_cohort h
  JOIN mobile_science_notification_subscriptions s
    ON s.user_id=h.user_id AND s.science_id=h.science_id AND s.submode=h.submode
  JOIN mobile_science_notification_chains c
    ON c.user_id=h.user_id AND c.org_id=s.org_id
   AND c.science_id=h.science_id AND c.submode=h.submode
  JOIN mobile_science_notification_producer_state p
    ON p.science_id=c.science_id AND p.submode=c.submode AND p.schema_version=c.schema_version
  JOIN mobile_science_notification_endpoints e
    ON e.chain_id=c.id AND e.installation_id=c.primary_installation_id
   AND e.primary_endpoint=true AND e.active=true
 WHERE h.enabled=true AND h.approved_by IS NOT NULL AND h.approved_at IS NOT NULL
   AND h.science_id='astronomy_fact' AND h.submode='civil_two_hour'
   AND c.schema_version=1 AND c.active=false
   AND s.enabled=false AND p.provider_send_enabled=false
   AND c.consent_generation=s.consent_generation
   AND e.target_revision=c.target_revision
 ORDER BY c.id`;

export async function runShadowScheduler(
  db: ShadowSchedulerDb,
  options: ShadowSchedulerOptions,
): Promise<ShadowSchedulerResult> {
  if (!(options.at instanceof Date) || !Number.isFinite(options.at.valueOf())) throw new TypeError("r8_shadow_time_invalid");
  if (!options.dry) await db.query("BEGIN");
  let inserted = 0;
  let duplicates = 0;
  try {
    const selected = await db.query(ROWS_SQL, [options.at.toISOString()]);
    for (const row of selected.rows as AstronomyShadowRow[]) {
      const occurrence = buildAstronomyShadowOccurrence(row, options.at, {
        key: options.identityKey,
        keyId: options.identityKeyId,
      });
      if (options.dry) continue;
      const result = await db.query(
        `INSERT INTO mobile_science_notification_occurrences
          (chain_id,science_id,submode,schema_version,notification_unit_id,
           identity_cbor,identity_hash,result_revision_hash,rollout_epoch,state,suppression_reason,
           snapshot,snapshot_digest,scheduled_for,expires_at)
         VALUES($1::uuid,'astronomy_fact','civil_two_hour',1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
         ON CONFLICT DO NOTHING`,
        [occurrence.chainId,occurrence.notificationUnitId,occurrence.identityCbor,
          occurrence.identityHash,occurrence.resultRevisionHash,occurrence.rolloutEpoch,
          occurrence.state,occurrence.suppressionReason,JSON.stringify(occurrence.snapshot),occurrence.snapshotDigest,
          occurrence.scheduledFor.toISOString(),occurrence.expiresAt.toISOString()],
      );
      const count = Number(result.rowCount || 0);
      inserted += count;
      duplicates += count === 0 ? 1 : 0;
    }
    if (!options.dry) {
      await db.query(
        `UPDATE mobile_science_notification_producer_state
            SET last_shadow_run_at=$1,last_shadow_count=$2,updated_at=now()
          WHERE science_id='astronomy_fact' AND submode='civil_two_hour'
            AND schema_version=1 AND provider_send_enabled=false`,
        [options.at.toISOString(),selected.rows.length],
      );
      await db.query("COMMIT");
    }
    return Object.freeze({ candidates: selected.rows.length, inserted, duplicates, dry: options.dry });
  } catch (error) {
    if (!options.dry) await db.query("ROLLBACK").catch(() => null);
    throw error;
  }
}

function loadEnv(): void {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/gu, "");
  }
}

function identityKeyFromEnvironment(): { key: Buffer; keyId: string } {
  const encoded = String(process.env.R8_IDENTITY_HMAC_KEY || "");
  const keyId = String(process.env.R8_IDENTITY_HMAC_KEY_ID || "");
  const key = Buffer.from(encoded, "base64");
  if (key.length < 32 || key.length > 64 || !keyId) throw new Error("r8_identity_key_unavailable");
  return { key, keyId };
}

async function main(): Promise<void> {
  loadEnv();
  const dry = process.argv.includes("--dry");
  const atArg = (process.argv.find((value) => value.startsWith("--at=")) || "").slice(5);
  const at = atArg ? new Date(atArg) : new Date();
  const identity = identityKeyFromEnvironment();
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || "decode_db",
    user: process.env.PGUSER || "decode_user",
    password: process.env.PGPASSWORD,
  });
  await db.connect();
  let locked = false;
  try {
    const lease = await db.query(
      `SELECT pg_try_advisory_lock(hashtextextended('mobile-science-shadow:astronomy_fact:civil_two_hour:v1',0)) AS acquired`,
    );
    locked = lease.rows[0]?.acquired === true;
    if (!locked) return;
    const result = await runShadowScheduler(db, { at, identityKey: identity.key, identityKeyId: identity.keyId, dry });
    console.log(JSON.stringify(result));
  } finally {
    if (locked) {
      await db.query(
        `SELECT pg_advisory_unlock(hashtextextended('mobile-science-shadow:astronomy_fact:civil_two_hour:v1',0))`,
      ).catch(() => null);
    }
    await db.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    console.error("mobile_astronomy_fact_shadow_failed");
    process.exitCode = 1;
  });
}
