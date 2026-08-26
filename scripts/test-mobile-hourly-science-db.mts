import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { createRequire } from "node:module";
import { buildZiweiHourlyNotificationFacts } from "../src/lib/astro/ziwei/hourly-preview";
import * as scheduler from "./mobile-ziwei-hourly-push-cron.mts";

const require = createRequire(import.meta.url);
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const ziweiRuntime = require("../src/lib/ziwei-hourly-notification.cjs");

function loadEnv(): void {
  if (process.env.DATABASE_URL || process.env.PGPASSWORD) return;
  const envPath = process.env.HOURKEY_BACKEND_ENV_PATH || path.resolve(".env.local");
  if (!fs.existsSync(envPath)) throw new Error("MOBILE_HOURLY_DB_TEST_ENV_UNAVAILABLE");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/gu, "");
  }
}

loadEnv();
const config = {
  ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}),
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.PGPASSWORD,
};
const schema = process.env.MOBILE_HOURLY_DB_TEST_SCHEMA
  || `mobile_hourly_science_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
if (!/^mobile_hourly_science_[a-z0-9_]+$/u.test(schema)) throw new Error("MOBILE_HOURLY_DB_TEST_SCHEMA_INVALID");
const quotedSchema = `"${schema}"`;
const migration = fs.readFileSync(new URL("../migrations/20260826_mobile_hourly_sciences.sql", import.meta.url), "utf8");
const rollback = fs.readFileSync(new URL("../migrations/20260826_mobile_hourly_sciences.rollback.sql", import.meta.url), "utf8");
const admin = new pg.Client(config);
const workerA = new pg.Client(config);
const workerB = new pg.Client(config);
let schemaCreated = false;

async function setSearchPath(client: pg.Client): Promise<void> {
  await client.query(`SET search_path TO ${quotedSchema},public`);
}

try {
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${quotedSchema}`);
  schemaCreated = true;
  await setSearchPath(admin);
  await admin.query(`CREATE TABLE users(
    id uuid PRIMARY KEY, timezone text DEFAULT 'Asia/Bangkok', locale text DEFAULT 'th',
    is_active boolean NOT NULL DEFAULT true, deleted_at timestamptz
  )`);
  await admin.query(`CREATE TABLE profiles(
    id uuid PRIMARY KEY, created_by_user_id uuid REFERENCES users(id),
    birth_datetime timestamptz, birth_time_known boolean,
    birth_lat float8,birth_lng float8,gender text,relationship_type text,
    is_archived boolean NOT NULL DEFAULT false, name text, nickname text
  )`);
  await admin.query(`CREATE TABLE mobile_notification_prefs(
    user_id uuid PRIMARY KEY REFERENCES users(id), timezone text DEFAULT 'Asia/Bangkok', locale text DEFAULT 'th',
    max_per_day integer NOT NULL DEFAULT 2, privacy_preview boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await admin.query(`CREATE TABLE mobile_push_tokens(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
    installation_id uuid NOT NULL, device_push_token text, device_token_type text, expo_push_token text,
    platform text NOT NULL, enabled boolean NOT NULL DEFAULT true
  )`);
  await admin.query(`CREATE TABLE mobile_push_log(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), yam_key text NOT NULL,
    kind text NOT NULL,title text NOT NULL,body text NOT NULL,payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_facts jsonb NOT NULL DEFAULT '{}'::jsonb,delivery_status text NOT NULL DEFAULT 'pending',
    attempt_count integer NOT NULL DEFAULT 0,next_retry_at timestamptz,accepted_at timestamptz,sent_at timestamptz,
    last_error text,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,yam_key)
  )`);
  await admin.query(`CREATE TABLE mobile_push_attempts(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),push_log_id uuid NOT NULL REFERENCES mobile_push_log(id),
    token_id uuid REFERENCES mobile_push_tokens(id),installation_id uuid NOT NULL,provider text NOT NULL,
    provider_message jsonb NOT NULL,message_sha256 text NOT NULL,privacy_safe boolean NOT NULL,
    transactional boolean NOT NULL,status text NOT NULL,next_retry_at timestamptz,updated_at timestamptz NOT NULL,
    UNIQUE(push_log_id,installation_id)
  )`);

  await admin.query(migration);
  await admin.query(migration);
  assert.equal((await admin.query("SELECT producer_enabled FROM mobile_ziwei_hourly_producer_state")).rows[0].producer_enabled, false);
  await assert.rejects(
    admin.query("UPDATE mobile_ziwei_hourly_producer_state SET producer_enabled=true"),
    (error: any) => error?.code === "23514",
    "Ziwei producer cannot be enabled without exact provenance",
  );
  await assert.rejects(
    admin.query("UPDATE mobile_qizheng_electional_producer_state SET producer_enabled=true"),
    (error: any) => error?.code === "23514",
    "Qizheng producer cannot be enabled while evidence is incomplete",
  );
  await assert.rejects(
    admin.query(`UPDATE mobile_qizheng_electional_producer_state
                    SET evidence_status='complete',producer_enabled=true,
                        backend_commit=repeat('a',40),enabled_at=now(),enabled_by='db-test'`),
    (error: any) => error?.code === "23514",
    "Qizheng producer remains hard-disabled even if one row claims evidence is complete",
  );

  const userId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  await admin.query("INSERT INTO users(id) VALUES($1)", [userId]);
  await admin.query(
    `INSERT INTO profiles
       (id,created_by_user_id,birth_datetime,birth_time_known,birth_tz,birth_lat,birth_lng,gender,relationship_type,name)
     VALUES($1,$2,'1984-12-31T06:15:00.000Z',true,'Asia/Bangkok',13.7563,100.5018,'M',NULL,'Owner')`,
    [profileId, userId],
  );
  await admin.query(
    `INSERT INTO mobile_notification_prefs(user_id,ziwei_hourly_enabled,ziwei_profile_id)
     VALUES($1,true,$2)`,
    [userId, profileId],
  );
  await assert.rejects(
    admin.query("UPDATE mobile_notification_prefs SET qizheng_electional_enabled=true WHERE user_id=$1", [userId]),
    (error: any) => error?.code === "23514",
  );

  const due = "2026-08-26T12:00:00.000Z";
  await admin.query(
    `INSERT INTO mobile_ziwei_hourly_installations
       (user_id,installation_id,profile_id,enabled,reference_timezone,next_due_at)
     SELECT $1,gen_random_uuid(),$2,true,'Asia/Bangkok',$3::timestamptz
       FROM generate_series(1,10000)`,
    [userId, profileId, due],
  );
  const claimed10k = await admin.query(
    "SELECT user_id,installation_id FROM claim_mobile_ziwei_hourly_installations($1::timestamptz,10000)",
    [due],
  );
  assert.equal(claimed10k.rowCount, 10_000, "one bounded claim supports the requested 10,000 installations");
  assert.equal(new Set(claimed10k.rows.map((row) => row.installation_id)).size, 10_000);
  await admin.query("UPDATE mobile_ziwei_hourly_installations SET lease_token=NULL,lease_expires_at=NULL");

  await workerA.connect();
  await workerB.connect();
  await setSearchPath(workerA);
  await setSearchPath(workerB);
  const [a, b] = await Promise.all([
    workerA.query("SELECT installation_id FROM claim_mobile_ziwei_hourly_installations($1::timestamptz,100)", [due]),
    workerB.query("SELECT installation_id FROM claim_mobile_ziwei_hourly_installations($1::timestamptz,100)", [due]),
  ]);
  const aIds = new Set(a.rows.map((row) => row.installation_id));
  const bIds = new Set(b.rows.map((row) => row.installation_id));
  assert.equal(a.rowCount, 100);
  assert.equal(b.rowCount, 100);
  assert.equal([...aIds].some((id) => bIds.has(id)), false, "SKIP LOCKED claims are disjoint");

  const installationId = claimed10k.rows[0].installation_id;
  const ownerGeneration = Number((await admin.query(
    "SELECT owner_generation FROM mobile_ziwei_hourly_installations WHERE user_id=$1 AND installation_id=$2",
    [userId, installationId],
  )).rows[0].owner_generation);
  const tokenId = crypto.randomUUID();
  await admin.query(
    `INSERT INTO mobile_push_tokens
       (id,user_id,installation_id,device_push_token,device_token_type,expo_push_token,platform,ziwei_payload_schema)
     VALUES($1,$2,$3,'fcm-ziwei-db-fixture','fcm','ExponentPushToken[ziwei-db-fixture]','android',2)`,
    [tokenId, userId, installationId],
  );
  const facts = buildZiweiHourlyNotificationFacts({
    birthInstant: new Date("1984-12-31T06:15:00.000Z"),
    birthTimezone: "Asia/Bangkok",
    birthLocation: { lat: 13.7563, lng: 100.5018 },
    gender: "M",
    referenceInstant: new Date("2026-08-26T12:01:00.000Z"),
    referenceTimezone: "Asia/Bangkok",
  });
  const snapshot = ziweiRuntime.buildZiweiHourlyNotificationSnapshot({
    accountId: userId,
    profile: { id: profileId, name: "Owner", isSelf: true },
    facts,
  });
  const occurrenceId = crypto.randomUUID();
  await admin.query(
    `INSERT INTO mobile_ziwei_hourly_occurrences
       (id,user_id,installation_id,profile_id,owner_generation,occurrence_key,lineage,calculation_version,
        window_valid_from,window_valid_until,send_deadline,snapshot,snapshot_digest)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11::timestamptz,$12::jsonb,$13)`,
    [occurrenceId, userId, installationId, profileId, ownerGeneration, scheduler.occurrenceKey({
      user_id: userId, installation_id: installationId, profile_id: profileId, owner_generation: ownerGeneration,
    }, snapshot), snapshot.facts.lineage, snapshot.facts.calculationVersion,
    snapshot.facts.reference.validFrom, snapshot.facts.reference.validUntil,
    "2026-08-26T12:10:00.000Z", JSON.stringify(snapshot), snapshot.snapshotDigest],
  );
  const notice = scheduler.buildZiweiNotice({
    user_id: userId,
    installation_id: installationId,
    profile_id: profileId,
    token_id: tokenId,
    device_push_token: "fcm-ziwei-db-fixture",
    device_token_type: "fcm",
    expo_push_token: "ExponentPushToken[ziwei-db-fixture]",
    platform: "android",
    token_locale: "th",
    account_locale: "th",
    owner_generation: ownerGeneration,
    reference_timezone: "Asia/Bangkok",
    quiet_start: 22,
    quiet_end: 7,
  }, snapshot, occurrenceId, "2026-08-26T12:10:00.000Z");
  const reservation = await delivery.reserve(admin, notice);
  assert.equal(reservation.attemptIds.length, 1, "valid Ziwei occurrence creates exactly one attempt");
  const persisted = (await admin.query(
    `SELECT o.state,o.push_log_id,a.provider_message,l.payload,l.source_facts
       FROM mobile_ziwei_hourly_occurrences o
       JOIN mobile_push_log l ON l.id=o.push_log_id
       JOIN mobile_push_attempts a ON a.push_log_id=l.id WHERE o.id=$1`,
    [occurrenceId],
  )).rows[0];
  assert.equal(persisted.state, "reserved");
  assert.equal(persisted.push_log_id, reservation.id);
  assert.deepEqual(persisted.payload, notice.payload);
  assert.equal(persisted.source_facts.windowKey, snapshot.facts.reference.windowKey);
  const providerEnvelope = JSON.parse(persisted.provider_message.data.body);
  assert.deepEqual(Object.keys(providerEnvelope).sort(), ["notificationId", "ziweiHourlyV2"]);
  assert.equal(providerEnvelope.notificationId, reservation.id);
  assert.equal(providerEnvelope.ziweiHourlyV2, notice.payload.ziweiHourlyV2);
  assert.equal(await delivery.reserve(admin, notice), null, "same occurrence cannot reserve twice");
  await assert.rejects(
    admin.query("UPDATE mobile_ziwei_hourly_occurrences SET snapshot='{\"tampered\":true}' WHERE id=$1", [occurrenceId]),
    (error: any) => error?.code === "P0001",
    "persisted chart snapshot is immutable",
  );
  await assert.rejects(
    admin.query(
      `INSERT INTO mobile_ziwei_hourly_occurrences
         (user_id,installation_id,profile_id,owner_generation,occurrence_key,lineage,calculation_version,
          window_valid_from,window_valid_until,send_deadline,snapshot,snapshot_digest)
       VALUES($1,$2,$3,$4,'ziwei|different-key','lineage','version',$5,$6,$7,'{}',$8)`,
      [userId, installationId, profileId, ownerGeneration, due, "2026-08-26T14:00:00.000Z",
        "2026-08-26T12:10:00.000Z", "1".repeat(64)],
    ),
    (error: any) => error?.code === "23505",
    "profile/window dedupe rejects a second occurrence",
  );

  await admin.query("UPDATE profiles SET birth_time_known=false WHERE id=$1", [profileId]);
  assert.equal((await admin.query(
    "SELECT ziwei_hourly_enabled FROM mobile_notification_prefs WHERE user_id=$1",
    [userId],
  )).rows[0].ziwei_hourly_enabled, false, "an ineligible bound profile atomically revokes consent");
  const invalidated = (await admin.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE enabled=false AND next_due_at IS NULL AND lease_token IS NULL
              AND lease_expires_at IS NULL AND last_skip_reason='profile_ineligible'
              AND owner_generation=$2)::int AS reconciled
       FROM mobile_ziwei_hourly_installations WHERE user_id=$1`,
    [userId, ownerGeneration + 1],
  )).rows[0];
  assert.equal(invalidated.reconciled, invalidated.total,
    "profile invalidation fences every installation without leaving a lease or due row");
  await admin.query(
    `INSERT INTO mobile_ziwei_hourly_occurrences
       (user_id,installation_id,profile_id,owner_generation,occurrence_key,lineage,calculation_version,
        window_valid_from,window_valid_until,send_deadline,snapshot,snapshot_digest)
     VALUES($1,$2,$3,$4,'ziwei|fresh-generation','lineage','version',$5,$6,$7,'{}',$8)`,
    [userId, installationId, profileId, ownerGeneration + 1, due, "2026-08-26T14:00:00.000Z",
      "2026-08-26T12:10:00.000Z", "2".repeat(64)],
  );

  await admin.query(rollback);
  await admin.query("UPDATE profiles SET birth_time_known=true WHERE id=$1", [profileId]);
  assert.equal((await admin.query("SELECT to_regclass('mobile_ziwei_hourly_occurrences') AS value")).rows[0].value, null);
  assert.equal((await admin.query(
    "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND column_name IN ('ziwei_hourly_enabled','ziwei_payload_schema','qizheng_payload_schema')",
    [schema],
  )).rows[0].n, 0);
  console.log("PASS mobile hourly science DB — rerunnable, immutable/deduped, disjoint claims, 10,000 capacity, rollback");
} finally {
  await Promise.allSettled([workerA.end(), workerB.end()]);
  if (schemaCreated) await admin.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`).catch(() => undefined);
  await admin.end().catch(() => undefined);
}
