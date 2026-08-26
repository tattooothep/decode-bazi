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
const notificationRetention = require("../src/lib/notification-retention.cjs");
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
    is_active boolean NOT NULL DEFAULT true, deleted_at timestamptz,
    tier text NOT NULL DEFAULT 'premium',sub_expires_at timestamptz DEFAULT '2099-01-01T00:00:00Z',
    trial_ends_at timestamptz
  )`);
  await admin.query(`CREATE TABLE profiles(
    id uuid PRIMARY KEY, created_by_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    birth_datetime timestamptz, birth_time_known boolean,
    birth_lat float8,birth_lng float8,gender text,relationship_type text,
    is_archived boolean NOT NULL DEFAULT false, name text, nickname text
  )`);
  await admin.query(`CREATE TABLE mobile_notification_prefs(
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, timezone text DEFAULT 'Asia/Bangkok', locale text DEFAULT 'th',
    max_per_day integer NOT NULL DEFAULT 2, privacy_preview boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await admin.query(`CREATE TABLE mobile_push_tokens(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    installation_id uuid NOT NULL, device_push_token text, device_token_type text, expo_push_token text,
    platform text NOT NULL, enabled boolean NOT NULL DEFAULT true,last_registered_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),disabled_at timestamptz
  )`);
  await admin.query(`CREATE TABLE mobile_push_log(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, yam_key text NOT NULL,
    kind text NOT NULL,title text NOT NULL,body text NOT NULL,payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_facts jsonb NOT NULL DEFAULT '{}'::jsonb,delivery_status text NOT NULL DEFAULT 'pending',
    attempt_count integer NOT NULL DEFAULT 0,next_retry_at timestamptz,accepted_at timestamptz,sent_at timestamptz,
    last_error text,source_facts_redacted_at timestamptz,attempts_retired_at timestamptz,
    delivery_model_generation smallint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,yam_key)
  )`);
  await admin.query(`CREATE TABLE mobile_push_attempts(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),push_log_id uuid NOT NULL REFERENCES mobile_push_log(id) ON DELETE CASCADE,
    token_id uuid REFERENCES mobile_push_tokens(id) ON DELETE SET NULL,installation_id uuid NOT NULL,provider text NOT NULL,
    provider_message jsonb NOT NULL,message_sha256 text NOT NULL,privacy_safe boolean NOT NULL,
    transactional boolean NOT NULL,status text NOT NULL,next_retry_at timestamptz,
    send_count integer NOT NULL DEFAULT 0,lease_token text,lease_expires_at timestamptz,
    send_started_at timestamptz,provider_message_id text,provider_ticket_id text,next_receipt_at timestamptz,
    provider_receipt_checked_at timestamptz,receipt_poll_count integer NOT NULL DEFAULT 0,last_error text,
    accepted_at timestamptz,delivered_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL,
    UNIQUE(push_log_id,installation_id)
  )`);

  // Model the broad legacy application grants that production carries. The
  // Ziwei migration must narrow only parent DELETE while preserving soft-delete
  // UPDATE used by account and profile APIs.
  await admin.query("GRANT SELECT,INSERT,UPDATE,DELETE ON users,profiles TO hourkey_app");

  await admin.query(migration);
  await admin.query(migration);
  await admin.query(`GRANT USAGE ON SCHEMA ${quotedSchema} TO hourkey_app`);
  // Production inherited DELETE on this shared parent before the Ziwei
  // migration. Keep that exact privilege in the fixture so the Ziwei trigger,
  // not an accidental permission denial, proves the cascade boundary.
  await admin.query("GRANT SELECT,INSERT,UPDATE,DELETE ON mobile_push_log TO hourkey_app");
  await admin.query("GRANT SELECT,INSERT,UPDATE,DELETE ON mobile_push_attempts TO hourkey_app");

  async function assertHourkeyAppRejects(sql: string, params: unknown[], label: string): Promise<void> {
    await admin.query("BEGIN");
    try {
      await admin.query("SET LOCAL ROLE hourkey_app");
      await admin.query(`SET LOCAL search_path TO ${quotedSchema},public`);
      await assert.rejects(
        admin.query(sql, params),
        (error: any) => error?.code === "P0001" || error?.code === "42501",
        label,
      );
    } finally {
      await admin.query("ROLLBACK");
      await setSearchPath(admin);
    }
  }
  for (const [wall, timezone, expected, label] of [
    ["1984-12-31T13:15:00+07:00", "Asia/Bangkok", true, "ordinary IANA wall clock"],
    ["1984-12-31T13:15:00+07:00", "UTC", true, "explicit UTC wall clock"],
    ["1984-12-31T13:15:00+07:00", "CET", false, "abbreviated timezone"],
    ["1984-12-31T13:15:00+07:00", "Factory", false, "tzdb implementation alias"],
    ["1900-01-31T12:00:00+07:00", "Europe/Paris", false, "historical sub-minute offset"],
  ] as const) {
    assert.equal((await admin.query(
      "SELECT hourkey_ziwei_birth_wall_eligible($1::timestamptz,$2) AS eligible",
      [wall, timezone],
    )).rows[0].eligible, expected, `${label} follows the shared Ziwei resolver domain`);
  }
  assert.equal((await admin.query("SELECT producer_enabled FROM mobile_ziwei_hourly_producer_state")).rows[0].producer_enabled, false);
  await assert.rejects(
    admin.query("UPDATE mobile_ziwei_hourly_producer_state SET producer_enabled=true"),
    (error: any) => error?.code === "23514",
    "Ziwei producer cannot be enabled without exact provenance",
  );
  await assert.rejects(
    admin.query(`UPDATE mobile_ziwei_hourly_producer_state
                    SET producer_enabled=true,backend_commit=repeat('a',40),enabled_at=now(),enabled_by=NULL`),
    (error: any) => error?.code === "23514",
    "PostgreSQL CHECK null semantics cannot bypass Ziwei producer provenance",
  );
  assert.equal((await admin.query(
    "SELECT has_table_privilege('hourkey_app','mobile_ziwei_hourly_producer_state','SELECT') AS allowed",
  )).rows[0].allowed, true, "the runtime role can read the global producer fence");
  assert.equal((await admin.query(
    "SELECT has_table_privilege('hourkey_app','mobile_ziwei_hourly_producer_state','UPDATE') AS allowed",
  )).rows[0].allowed, false, "the runtime role cannot re-enable its own privileged kill switch");
  for (const table of ["users", "profiles"] as const) {
    assert.equal((await admin.query(
      `SELECT has_table_privilege('hourkey_app',$1,'DELETE') AS can_delete,
              has_table_privilege('hourkey_app',$1,'UPDATE') AS can_update`,
      [table],
    )).rows[0].can_delete, false, `runtime DELETE is revoked from the ${table} cascade parent`);
    assert.equal((await admin.query(
      `SELECT has_table_privilege('hourkey_app',$1,'UPDATE') AS can_update`,
      [table],
    )).rows[0].can_update, true, `soft-delete UPDATE remains available on ${table}`);
  }
  await assertHourkeyAppRejects(
    "UPDATE mobile_ziwei_hourly_producer_state SET producer_enabled=false",
    [],
    "SET ROLE hourkey_app cannot mutate the producer fence even to a superficially safe value",
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
  }, snapshot, occurrenceId, "2026-08-26T12:10:00.000Z", "a".repeat(40));
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
  assert.equal((await admin.query(
    "SELECT has_table_privilege('hourkey_app','mobile_ziwei_hourly_installations','DELETE') AS allowed",
  )).rows[0].allowed, false,
  "the runtime role cannot erase occurrence evidence through installation cascade");
  await assertHourkeyAppRejects(
    "DELETE FROM mobile_ziwei_hourly_installations WHERE user_id=$1 AND installation_id=$2",
    [userId, installationId],
    "SET ROLE hourkey_app cannot delete an installation that owns a reserved occurrence",
  );
  assert.equal((await admin.query(
    "SELECT count(*)::int AS total FROM mobile_ziwei_hourly_occurrences WHERE id=$1",
    [occurrenceId],
  )).rows[0].total, 1, "the rejected installation deletion leaves its attestation intact");
  await assertHourkeyAppRejects(
    "DELETE FROM profiles WHERE id=$1",
    [profileId],
    "SET ROLE hourkey_app cannot cascade-delete evidence through a profile parent",
  );
  await assertHourkeyAppRejects(
    "DELETE FROM users WHERE id=$1",
    [userId],
    "SET ROLE hourkey_app cannot cascade-delete evidence through an account parent",
  );

  const transferOldUserId = crypto.randomUUID();
  const transferNewUserId = crypto.randomUUID();
  const transferOldProfileId = crypto.randomUUID();
  const transferNewProfileId = crypto.randomUUID();
  const transferInstallationId = crypto.randomUUID();
  const transferOccurrenceId = crypto.randomUUID();
  await admin.query("INSERT INTO users(id) VALUES($1),($2)", [transferOldUserId, transferNewUserId]);
  await admin.query(
    `INSERT INTO profiles
       (id,created_by_user_id,birth_datetime,birth_time_known,birth_tz,gender,relationship_type,name)
     VALUES($1,$2,'1984-12-31T13:15:00+07:00',true,'Asia/Bangkok','M',NULL,'Old owner'),
           ($3,$4,'1984-12-31T13:15:00+07:00',true,'Asia/Bangkok','M',NULL,'New owner')`,
    [transferOldProfileId, transferOldUserId, transferNewProfileId, transferNewUserId],
  );
  await admin.query(
    `INSERT INTO mobile_ziwei_hourly_installations
       (user_id,installation_id,profile_id,enabled,reference_timezone,next_due_at)
     VALUES($1,$2,$3,true,'Asia/Bangkok',now())`,
    [transferOldUserId, transferInstallationId, transferOldProfileId],
  );
  await admin.query(
    `INSERT INTO mobile_ziwei_hourly_occurrences
       (id,user_id,installation_id,profile_id,owner_generation,occurrence_key,lineage,calculation_version,
        window_valid_from,window_valid_until,send_deadline,snapshot,snapshot_digest)
     VALUES($1,$2,$3,$4,1,'ziwei|account-transfer','lineage','version',
            now()-interval '1 minute',now()+interval '119 minutes',now()+interval '9 minutes','{}',$5)`,
    [transferOccurrenceId, transferOldUserId, transferInstallationId, transferOldProfileId, "3".repeat(64)],
  );
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL ROLE hourkey_app");
    await admin.query(`SET LOCAL search_path TO ${quotedSchema},public`);
    await admin.query(
      `UPDATE mobile_ziwei_hourly_installations
          SET enabled=false,next_due_at=NULL,last_skip_reason='installation_transferred',
              owner_generation=owner_generation+1,updated_at=now()
        WHERE user_id=$1 AND installation_id=$2`,
      [transferOldUserId, transferInstallationId],
    );
    await admin.query(
      `INSERT INTO mobile_ziwei_hourly_installations
         (user_id,installation_id,profile_id,enabled,reference_timezone,next_due_at)
       VALUES($1,$2,$3,true,'Asia/Bangkok',now())`,
      [transferNewUserId, transferInstallationId, transferNewProfileId],
    );
    await admin.query("COMMIT");
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  } finally {
    await setSearchPath(admin);
  }
  assert.deepEqual((await admin.query(
    `SELECT count(*)::int AS owners,count(*) FILTER (WHERE enabled)::int AS active
       FROM mobile_ziwei_hourly_installations WHERE installation_id=$1`,
    [transferInstallationId],
  )).rows[0], { owners: 2, active: 1 },
  "account transfer preserves the disabled historical owner and permits exactly one active owner");
  assert.equal((await admin.query(
    "SELECT count(*)::int AS total FROM mobile_ziwei_hourly_occurrences WHERE id=$1",
    [transferOccurrenceId],
  )).rows[0].total, 1, "account transfer preserves the old owner's occurrence evidence");
  await assert.rejects(
    admin.query(
      `INSERT INTO mobile_ziwei_hourly_installations
         (user_id,installation_id,profile_id,enabled,reference_timezone,next_due_at)
       VALUES($1,$2,$3,true,'Asia/Bangkok',now())`,
      [transferOldUserId, transferInstallationId, transferOldProfileId],
    ),
    (error: any) => error?.code === "23505",
    "the partial identity fence rejects two active owners for one physical installation",
  );

  const exploitInstallationId = claimed10k.rows[1].installation_id;
  const exploitTokenId = crypto.randomUUID();
  const exploitOccurrenceId = crypto.randomUUID();
  const exploitParentId = crypto.randomUUID();
  const exploitAttemptId = crypto.randomUUID();
  await admin.query(
    `INSERT INTO mobile_push_tokens
       (id,user_id,installation_id,device_push_token,device_token_type,expo_push_token,platform,ziwei_payload_schema)
     VALUES($1,$2,$3,'fcm-ziwei-exploit-fixture','fcm',NULL,'android',2)`,
    [exploitTokenId, userId, exploitInstallationId],
  );
  const exploitKey = scheduler.occurrenceKey({
    user_id: userId, installation_id: exploitInstallationId,
    profile_id: profileId, owner_generation: ownerGeneration,
  }, snapshot);
  await admin.query(
    `INSERT INTO mobile_ziwei_hourly_occurrences
       (id,user_id,installation_id,profile_id,owner_generation,occurrence_key,lineage,calculation_version,
        window_valid_from,window_valid_until,send_deadline,snapshot,snapshot_digest)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11::timestamptz,$12::jsonb,$13)`,
    [exploitOccurrenceId, userId, exploitInstallationId, profileId, ownerGeneration, exploitKey,
      snapshot.facts.lineage, snapshot.facts.calculationVersion, snapshot.facts.reference.validFrom,
      snapshot.facts.reference.validUntil, "2026-08-26T12:10:00.000Z",
      JSON.stringify(snapshot), snapshot.snapshotDigest],
  );
  const exploitNotice = scheduler.buildZiweiNotice({
    user_id: userId, installation_id: exploitInstallationId, profile_id: profileId,
    token_id: exploitTokenId, device_push_token: "fcm-ziwei-exploit-fixture",
    device_token_type: "fcm", expo_push_token: null, platform: "android",
    token_locale: "th", account_locale: "th", owner_generation: ownerGeneration,
    reference_timezone: "Asia/Bangkok", quiet_start: 22, quiet_end: 7,
  }, snapshot, exploitOccurrenceId, "2026-08-26T12:10:00.000Z", "a".repeat(40));
  const forgedProviderMessage = {
    notification: { title: "forged Ziwei", body: "forged science copy" },
    data: { body: JSON.stringify({ notificationId: exploitParentId, ziweiHourlyV2: "forged-envelope" }) },
    android: { priority: "HIGH", ttl: "300s", notification: { sound: "default", channel_id: "hourkey-ziwei-hourly-v1" } },
  };
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL ROLE hourkey_app");
    await admin.query(`SET LOCAL search_path TO ${quotedSchema},public`);
    await admin.query(
      `INSERT INTO mobile_push_log
         (id,user_id,yam_key,kind,title,body,payload,source_facts,delivery_status,attempt_count,next_retry_at)
       VALUES($1,$2,$3,'ziwei',$4,$5,$6::jsonb,$7::jsonb,'pending',0,now())`,
      [exploitParentId, userId, exploitKey, exploitNotice.title, exploitNotice.body,
        JSON.stringify(exploitNotice.payload), JSON.stringify(exploitNotice.sourceFacts)],
    );
    await admin.query(
      `INSERT INTO mobile_push_attempts
         (id,push_log_id,token_id,installation_id,provider,provider_message,message_sha256,
          privacy_safe,transactional,status,next_retry_at,updated_at)
       VALUES($1,$2,$3,$4,'fcm',$5::jsonb,$6,true,false,'reserved',now(),now())`,
      [exploitAttemptId, exploitParentId, exploitTokenId, exploitInstallationId,
        JSON.stringify(forgedProviderMessage), delivery.messageSha256(forgedProviderMessage)],
    );
    await admin.query(
      `UPDATE mobile_ziwei_hourly_occurrences
          SET state='reserved',push_log_id=$2,updated_at=now()
        WHERE id=$1`,
      [exploitOccurrenceId, exploitParentId],
    );
    await admin.query("COMMIT");
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  } finally {
    await setSearchPath(admin);
  }
  await admin.query(
    `UPDATE mobile_ziwei_hourly_producer_state
        SET producer_enabled=true,backend_commit=repeat('a',40),enabled_at=now(),enabled_by='security-db-test'`,
  );
  const previousRuntimeGate = process.env.ZIWEI_HOURLY_PRODUCER_ENABLED;
  const previousRuntimeCommit = process.env.HOURKEY_RELEASE_COMMIT;
  process.env.ZIWEI_HOURLY_PRODUCER_ENABLED = "1";
  process.env.HOURKEY_RELEASE_COMMIT = "a".repeat(40);
  let exploitSenderCalls = 0;
  try {
    const exploitRun = await delivery.runRetryBatch(admin, {
      attemptIds: [exploitAttemptId], limit: 1,
      hooks: { policyNow: new Date("2026-08-26T12:01:30.000Z") },
      sender: { async sendPrepared() { exploitSenderCalls += 1; return { kind: "provider_accepted" }; } },
    });
    assert.equal(exploitRun.dead, 1, "a direct-role fake bind is terminally fenced");
    assert.equal(exploitRun.outcomes[0]?.reason, "policy_attestation_changed");
    assert.equal(exploitSenderCalls, 0,
      "a SET ROLE hourkey_app fake parent/provider message never reaches the provider sender");
  } finally {
    if (previousRuntimeGate === undefined) delete process.env.ZIWEI_HOURLY_PRODUCER_ENABLED;
    else process.env.ZIWEI_HOURLY_PRODUCER_ENABLED = previousRuntimeGate;
    if (previousRuntimeCommit === undefined) delete process.env.HOURKEY_RELEASE_COMMIT;
    else process.env.HOURKEY_RELEASE_COMMIT = previousRuntimeCommit;
  }
  await assertHourkeyAppRejects(
    "UPDATE mobile_push_log SET source_facts=jsonb_set(source_facts,'{windowKey}','\"forged\"'::jsonb) WHERE id=$1",
    [reservation.id],
    "SET ROLE hourkey_app cannot rewrite a pending Ziwei source attestation",
  );
  await assertHourkeyAppRejects(
    "UPDATE mobile_push_log SET kind='daily' WHERE id=$1",
    [reservation.id],
    "SET ROLE hourkey_app cannot relabel a Ziwei parent to escape its policy gate",
  );
  const genericParentId = crypto.randomUUID();
  await admin.query(
    `INSERT INTO mobile_push_log(id,user_id,yam_key,kind,title,body,payload,source_facts)
     VALUES($1,$2,'generic-parent','daily','title','body','{}','{}')`,
    [genericParentId, userId],
  );
  await assertHourkeyAppRejects(
    "UPDATE mobile_push_log SET kind='ziwei' WHERE id=$1",
    [genericParentId],
    "SET ROLE hourkey_app cannot relabel an unattested generic parent as Ziwei",
  );
  await admin.query("BEGIN");
  try {
    await admin.query("UPDATE mobile_push_log SET delivery_status='accepted' WHERE id=$1", [reservation.id]);
    await admin.query("SET LOCAL ROLE hourkey_app");
    await admin.query(`SET LOCAL search_path TO ${quotedSchema},public`);
    await admin.query("CREATE TEMP TABLE mobile_push_attempts(push_log_id uuid,status text)");
    await assert.rejects(
      admin.query("UPDATE mobile_push_log SET source_facts='{}'::jsonb WHERE id=$1", [reservation.id]),
      (error: any) => error?.code === "P0001",
      "a pg_temp attempt table cannot shadow the real open Ziwei attempt and unlock provenance redaction",
    );
  } finally {
    await admin.query("ROLLBACK");
    await setSearchPath(admin);
  }
  const attemptId = reservation.attemptIds[0];
  await assertHourkeyAppRejects(
    "UPDATE mobile_push_attempts SET push_log_id=$2 WHERE id=$1",
    [attemptId, genericParentId],
    "SET ROLE hourkey_app cannot detach a Ziwei attempt from its immutable parent",
  );
  await admin.query("UPDATE mobile_push_attempts SET status='dead' WHERE id=$1", [attemptId]);
  await assertHourkeyAppRejects(
    "UPDATE mobile_push_attempts SET status='retry_due',send_started_at=NULL WHERE id=$1",
    [attemptId],
    "SET ROLE hourkey_app cannot resurrect a terminal Ziwei provider attempt",
  );
  await assertHourkeyAppRejects(
    "DELETE FROM mobile_push_attempts WHERE id=$1",
    [attemptId],
    "SET ROLE hourkey_app cannot delete a live-audit Ziwei attempt and reinsert it as reserved",
  );
  await assertHourkeyAppRejects(
    "DELETE FROM mobile_push_log WHERE id=$1",
    [reservation.id],
    "SET ROLE hourkey_app cannot delete and reconstruct a live-audit Ziwei parent",
  );
  assert.equal((await admin.query(
    "SELECT has_table_privilege('hourkey_app','mobile_push_log','DELETE') AS allowed",
  )).rows[0].allowed, true,
  "the fixture models production's inherited parent DELETE used by bounded history retention");

  const craftedParentId = crypto.randomUUID();
  const craftedOccurrenceId = crypto.randomUUID();
  await admin.query(
    `INSERT INTO mobile_push_log
       (id,user_id,yam_key,kind,title,body,payload,source_facts,delivery_status,attempt_count,
        next_retry_at,last_error,delivery_model_generation,created_at,updated_at)
     VALUES($1,$2,'ziwei-crafted-linked','ziwei','crafted','crafted','{}','{}',
            'failed',0,NULL,'no_deliverable_installation',1,now(),now())`,
    [craftedParentId, userId],
  );
  await admin.query(
    `INSERT INTO mobile_ziwei_hourly_occurrences
       (id,user_id,installation_id,profile_id,owner_generation,occurrence_key,lineage,calculation_version,
        window_valid_from,window_valid_until,send_deadline,snapshot,snapshot_digest,state,push_log_id)
     VALUES($1,$2,$3,$4,$5,'ziwei-crafted-linked','lineage','version',
            now()-interval '1 minute',now()+interval '119 minutes',now()+interval '9 minutes',
            '{}',$6,'reserved',$7)`,
    [craftedOccurrenceId, userId, installationId, profileId, ownerGeneration,
      "8".repeat(64), craftedParentId],
  );
  await assertHourkeyAppRejects(
    "DELETE FROM mobile_push_log WHERE id=$1",
    [craftedParentId],
    "a crafted zero-attempt parent cannot cascade-delete a linked Ziwei occurrence before retention",
  );
  assert.equal((await admin.query(
    "SELECT count(*)::int AS n FROM mobile_ziwei_hourly_occurrences WHERE id=$1",
    [craftedOccurrenceId],
  )).rows[0].n, 1, "the guarded parent delete leaves the linked immutable snapshot intact");

  const recentNoDeliveryParentId = crypto.randomUUID();
  await admin.query(
    `INSERT INTO mobile_push_log
       (id,user_id,yam_key,kind,title,body,payload,source_facts,delivery_status,attempt_count,
        next_retry_at,last_error,delivery_model_generation,created_at,updated_at)
     VALUES($1,$2,'ziwei-recent-no-deliverable','ziwei','recent','recent','{}','{}',
            'failed',0,NULL,'no_deliverable_installation',1,now(),now())`,
    [recentNoDeliveryParentId, userId],
  );
  await assertHourkeyAppRejects(
    "DELETE FROM mobile_push_log WHERE id=$1",
    [recentNoDeliveryParentId],
    "runtime parent DELETE cannot bypass the ordinary 180-day history window",
  );
  await assertHourkeyAppRejects(
    "UPDATE mobile_push_log SET attempts_retired_at=now() WHERE id=$1",
    [reservation.id],
    "SET ROLE hourkey_app cannot forge the retention marker for a recent Ziwei attempt",
  );
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL ROLE hourkey_app");
    await admin.query(`SET LOCAL search_path TO ${quotedSchema},public`);
    await admin.query("CREATE TEMP TABLE mobile_push_log(id uuid,kind text)");
    await admin.query("INSERT INTO mobile_push_log(id,kind) VALUES($1,'daily')", [reservation.id]);
    await assert.rejects(
      admin.query("UPDATE mobile_push_attempts SET status='retry_due' WHERE id=$1", [attemptId]),
      (error: any) => error?.code === "P0001",
      "a pg_temp parent table cannot shadow the real Ziwei parent and resurrect a terminal attempt",
    );
  } finally {
    await admin.query("ROLLBACK");
    await setSearchPath(admin);
  }
  await admin.query("UPDATE mobile_push_log SET delivery_status='failed' WHERE id=$1", [reservation.id]);
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL ROLE hourkey_app");
    await admin.query(`SET LOCAL search_path TO ${quotedSchema},public`);
    assert.equal((await admin.query(
      `UPDATE mobile_push_log
          SET source_facts='{}'::jsonb,source_facts_redacted_at=now()
        WHERE id=$1 RETURNING id`,
      [reservation.id],
    )).rowCount, 1, "terminal Ziwei provenance remains one-way redactable by the bounded retention path");
  } finally {
    await admin.query("ROLLBACK");
    await setSearchPath(admin);
  }

  const noDeliveryParentId = crypto.randomUUID();
  await admin.query(
    `INSERT INTO mobile_push_log
       (id,user_id,yam_key,kind,title,body,payload,source_facts,delivery_status,attempt_count,
        next_retry_at,last_error,delivery_model_generation,created_at,updated_at)
     VALUES($1,$2,'ziwei-no-deliverable-retention','ziwei','No device','No device','{}','{}',
            'failed',0,NULL,'no_deliverable_installation',1,
            now()-interval '200 days',now()-interval '200 days')`,
    [noDeliveryParentId, userId],
  );
  assert.equal((await admin.query(
    "SELECT count(*)::int AS n FROM mobile_push_attempts WHERE push_log_id=$1",
    [noDeliveryParentId],
  )).rows[0].n, 0, "the supported no-deliverable parent has no child evidence to retire");
  assert.equal(await notificationRetention.purgeHistoryBatch(admin, {
    historyDays: 180, securityHistoryDays: 365, batchSize: 100,
  }), 1, "bounded retention deletes an expired terminal Ziwei parent that never had a deliverable installation");
  assert.equal((await admin.query(
    "SELECT count(*)::int AS n FROM mobile_push_log WHERE id=$1",
    [noDeliveryParentId],
  )).rows[0].n, 0, "zero-attempt Ziwei history cannot permanently block a retention batch");

  await workerA.query(
    `SELECT pg_advisory_lock_shared(hashtextextended('mobile-ziwei-hourly-producer-gate:v1',0))`,
  );
  await workerB.query("BEGIN");
  await workerB.query("SET LOCAL lock_timeout='200ms'");
  await assert.rejects(
    workerB.query("UPDATE mobile_ziwei_hourly_producer_state SET updated_at=now()"),
    (error: any) => error?.code === "55P03",
    "an admin mutation cannot cross a shared provider gate held by an in-flight Ziwei send",
  );
  await workerB.query("ROLLBACK");
  assert.equal((await workerA.query(
    `SELECT pg_advisory_unlock_shared(hashtextextended('mobile-ziwei-hourly-producer-gate:v1',0)) AS unlocked`,
  )).rows[0].unlocked, true);
  await workerB.query("UPDATE mobile_ziwei_hourly_producer_state SET updated_at=now()",
    [],
  );
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

  async function assertNatalLifecycleRevokes(wall: string, timezone: string, label: string): Promise<void> {
    const lifecycleUserId = crypto.randomUUID();
    const lifecycleProfileId = crypto.randomUUID();
    const lifecycleInstallationId = crypto.randomUUID();
    await admin.query("INSERT INTO users(id) VALUES($1)", [lifecycleUserId]);
    await admin.query(
      `INSERT INTO profiles
         (id,created_by_user_id,birth_datetime,birth_time_known,birth_tz,gender,relationship_type,name)
       VALUES($1,$2,'1984-12-31T13:15:00+07:00',true,'Asia/Bangkok','M',NULL,'Lifecycle')`,
      [lifecycleProfileId, lifecycleUserId],
    );
    await admin.query(
      `INSERT INTO mobile_notification_prefs(user_id,ziwei_hourly_enabled,ziwei_profile_id)
       VALUES($1,true,$2)`,
      [lifecycleUserId, lifecycleProfileId],
    );
    await admin.query(
      `INSERT INTO mobile_ziwei_hourly_installations
         (user_id,installation_id,profile_id,enabled,reference_timezone,next_due_at)
       VALUES($1,$2,$3,true,'Asia/Bangkok',now())`,
      [lifecycleUserId, lifecycleInstallationId, lifecycleProfileId],
    );
    await admin.query(
      "UPDATE profiles SET birth_datetime=$2::timestamptz,birth_tz=$3 WHERE id=$1",
      [lifecycleProfileId, wall, timezone],
    );
    assert.equal((await admin.query(
      "SELECT ziwei_hourly_enabled FROM mobile_notification_prefs WHERE user_id=$1",
      [lifecycleUserId],
    )).rows[0].ziwei_hourly_enabled, false, `${label}: consent revoked`);
    assert.deepEqual((await admin.query(
      `SELECT enabled,next_due_at,lease_token,lease_expires_at,last_skip_reason
         FROM mobile_ziwei_hourly_installations WHERE user_id=$1 AND installation_id=$2`,
      [lifecycleUserId, lifecycleInstallationId],
    )).rows[0], {
      enabled: false,
      next_due_at: null,
      lease_token: null,
      lease_expires_at: null,
      last_skip_reason: "profile_ineligible",
    }, `${label}: installation fenced`);
  }

  await assertNatalLifecycleRevokes("1984-12-31T23:30:00+07:00", "Asia/Bangkok", "late-Zi birth");
  await assertNatalLifecycleRevokes("1900-01-30T12:00:00+07:00", "Asia/Bangkok", "lower out-of-range birth");
  await assertNatalLifecycleRevokes("2101-01-01T12:00:00+07:00", "Asia/Bangkok", "upper out-of-range birth");
  await assertNatalLifecycleRevokes("2026-03-08T02:30:00+07:00", "America/New_York", "IANA gap birth");
  await assertNatalLifecycleRevokes("2026-11-01T01:30:00+07:00", "America/New_York", "IANA fold birth");

  const fixedOffsetUserId = crypto.randomUUID();
  const fixedOffsetProfileId = crypto.randomUUID();
  const fixedOffsetInstallationId = crypto.randomUUID();
  await admin.query("INSERT INTO users(id) VALUES($1)", [fixedOffsetUserId]);
  await admin.query(
    `INSERT INTO profiles
       (id,created_by_user_id,birth_datetime,birth_time_known,birth_tz,gender,relationship_type,name)
     VALUES($1,$2,'1984-12-31T13:15:00+07:00',true,'+07:00','M',NULL,'Fixed')`,
    [fixedOffsetProfileId, fixedOffsetUserId],
  );
  await admin.query(
    `INSERT INTO mobile_notification_prefs(user_id,ziwei_hourly_enabled,ziwei_profile_id)
     VALUES($1,true,$2)`,
    [fixedOffsetUserId, fixedOffsetProfileId],
  );
  await admin.query(
    `INSERT INTO mobile_ziwei_hourly_installations
       (user_id,installation_id,profile_id,enabled,reference_timezone,next_due_at)
     VALUES($1,$2,$3,true,'Asia/Bangkok',now())`,
    [fixedOffsetUserId, fixedOffsetInstallationId, fixedOffsetProfileId],
  );
  await admin.query(
    "UPDATE profiles SET birth_datetime='1984-12-31T14:15:00+07:00' WHERE id=$1",
    [fixedOffsetProfileId],
  );
  assert.equal((await admin.query(
    "SELECT ziwei_hourly_enabled FROM mobile_notification_prefs WHERE user_id=$1",
    [fixedOffsetUserId],
  )).rows[0].ziwei_hourly_enabled, true, "fixed-offset natal birth remains eligible");
  assert.equal((await admin.query(
    "SELECT enabled FROM mobile_ziwei_hourly_installations WHERE user_id=$1 AND installation_id=$2",
    [fixedOffsetUserId, fixedOffsetInstallationId],
  )).rows[0].enabled, true, "fixed-offset installation remains enabled");

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

  await admin.query("DELETE FROM users WHERE id=$1", [userId]);
  assert.equal((await admin.query(
    "SELECT count(*)::int AS total FROM mobile_push_log WHERE user_id=$1",
    [userId],
  )).rows[0].total, 0,
  "account deletion may cascade through an unretired Ziwei parent/attempt without weakening direct-delete guards");

  const occurrencesBeforeRollback = (await admin.query(
    "SELECT count(*)::int AS total FROM mobile_ziwei_hourly_occurrences",
  )).rows[0].total;
  await admin.query(rollback);
  await admin.query("UPDATE profiles SET birth_time_known=true WHERE id=$1", [profileId]);
  assert.equal(
    (await admin.query("SELECT to_regclass('mobile_ziwei_hourly_occurrences') AS value")).rows[0].value,
    "mobile_ziwei_hourly_occurrences",
    "rollback preserves the immutable occurrence ledger",
  );
  assert.equal(
    (await admin.query("SELECT count(*)::int AS total FROM mobile_ziwei_hourly_occurrences")).rows[0].total,
    occurrencesBeforeRollback,
    "rollback preserves every retained occurrence row",
  );
  assert.equal((await admin.query(
    "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND column_name IN ('ziwei_hourly_enabled','ziwei_payload_schema','qizheng_payload_schema')",
    [schema],
  )).rows[0].n, 3, "rollback retains additive schema for old-release compatibility");
  assert.equal((await admin.query(
    "SELECT producer_enabled FROM mobile_ziwei_hourly_producer_state WHERE singleton=true",
  )).rows[0].producer_enabled, false, "rollback disables the producer");
  assert.equal((await admin.query(
    "SELECT count(*)::int AS total FROM mobile_ziwei_hourly_installations WHERE enabled OR next_due_at IS NOT NULL OR lease_token IS NOT NULL",
  )).rows[0].total, 0, "rollback drains every runnable installation without deleting it");
  assert.equal((await admin.query(
    "SELECT has_function_privilege('hourkey_app','claim_mobile_ziwei_hourly_installations(timestamptz,integer)','EXECUTE') AS allowed",
  )).rows[0].allowed, false, "rollback revokes worker claim authority");
  console.log("PASS mobile hourly science DB — rerunnable, immutable/deduped, disjoint claims, 10,000 capacity, non-destructive rollback");
} finally {
  await Promise.allSettled([workerA.end(), workerB.end()]);
  if (schemaCreated) await admin.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`).catch(() => undefined);
  await admin.end().catch(() => undefined);
}
