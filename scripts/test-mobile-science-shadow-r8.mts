import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  buildAstronomyShadowOccurrence,
  canonicalCbor,
  shadowAdmissionDecision,
} from "../src/lib/mobile-science-shadow-r8";
import { ASTRONOMY_FACT_MODEL_DIGEST } from "../src/lib/astro/astronomy-fact-model-attestation";
import { runShadowScheduler, type ShadowSchedulerDb } from "./mobile-astronomy-fact-shadow-cron.mts";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const preflight = require("./notification-observability-preflight.cjs");
const KEY = Buffer.alloc(32, 7);
const EXPECTED_R8_SCHEMA_DEFINITION_DIGEST = "fb8f54d63c6e693d7cf8f35befcf322b79519f718a6517d0b41c38c01b27dff8";
const ROW = Object.freeze({
  chain_id: "00000000-0000-4000-8000-000000000001",
  account_delivery_chain_uuid: "00000000-0000-4000-8000-000000000002",
  user_id: "00000000-0000-4000-8000-000000000003",
  org_id: "00000000-0000-4000-8000-000000000004",
  display_timezone: "Asia/Bangkok",
  schema_version: 1,
  rollout_epoch: 1,
  target_revision: 1,
  consent_generation: 1,
  quiet_start: 22,
  quiet_end: 7,
  local_day_cap: 12,
  local_day_count: 0,
  rolling_24h_count: 0,
});

assert.deepEqual(canonicalCbor({ b: 2, a: 1 }), canonicalCbor({ a: 1, b: 2 }),
  "canonical CBOR ignores object insertion order");
const first = buildAstronomyShadowOccurrence(ROW, new Date("2026-09-04T05:17:00.000Z"), {
  key: KEY,
  keyId: "r8-test-key-1",
});
const second = buildAstronomyShadowOccurrence(ROW, new Date("2026-09-04T05:59:00.000Z"), {
  key: KEY,
  keyId: "r8-test-key-1",
});
assert.deepEqual(second, first, "all runs inside one civil unit produce one revision");
assert.equal(first.snapshot.facts.localBoundary, "2026-09-04T12:00:00+07:00");
assert.equal(first.identityHash.length, 32);
assert.equal(first.resultRevisionHash.length, 32);
assert.notDeepEqual(first.identityHash, first.resultRevisionHash, "lineage and result domains are separated");
assert.doesNotMatch(
  JSON.stringify(first.snapshot),
  /"(?:userId|user_id|orgId|org_id|profileId|profile_id|birthDate|birthTime|birthLocation|lat|lng|coordinates)"/iu,
  "stored facts contain astronomy coordinates but no account, profile, birth, or terrestrial coordinate fields",
);

const nextRevision = buildAstronomyShadowOccurrence({ ...ROW, target_revision: 2 }, new Date("2026-09-04T05:59:00.000Z"), {
  key: KEY,
  keyId: "r8-test-key-1",
});
assert.deepEqual(nextRevision.identityHash, first.identityHash, "target rotation preserves delivery lineage");
assert.notDeepEqual(nextRevision.resultRevisionHash, first.resultRevisionHash, "target rotation creates a new result revision");
assert.deepEqual(shadowAdmissionDecision({ ...ROW, quiet_start: 12, quiet_end: 14 }, first.snapshot.facts),
  { state: "expired", suppressionReason: "quiet_hours" });
assert.deepEqual(shadowAdmissionDecision({ ...ROW, local_day_cap: 1, local_day_count: 1 }, first.snapshot.facts),
  { state: "expired", suppressionReason: "local_day_cap" });
assert.deepEqual(shadowAdmissionDecision({ ...ROW, rolling_24h_count: 12 }, first.snapshot.facts),
  { state: "expired", suppressionReason: "rolling_24h_cap" });
assert.deepEqual(shadowAdmissionDecision(ROW, first.snapshot.facts),
  { state: "shadowed", suppressionReason: null });

let writes = 0;
let heartbeats = 0;
const db: ShadowSchedulerDb = {
  async query(sql) {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
    if (sql.includes("FROM mobile_science_notification_shadow_cohort")) return { rows: [ROW], rowCount: 1 };
    if (sql.includes("hourkey_r8_record_astronomy_shadow_occurrence")) { writes += 1; return { rows: [{ inserted: true }], rowCount: 1 }; }
    if (sql.includes("hourkey_r8_mark_astronomy_shadow_run")) { heartbeats += 1; return { rows: [{ marked: true }], rowCount: 1 }; }
    throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
  },
};
assert.deepEqual(await runShadowScheduler(db, {
  at: new Date("2026-09-04T05:17:00.000Z"), identityKey: KEY, identityKeyId: "r8-test-key-1", dry: true,
}), { candidates: 1, inserted: 0, duplicates: 0, dry: true });
assert.equal(writes, 0, "dry shadow cannot write an occurrence");
assert.equal(heartbeats, 0, "dry shadow cannot claim a durable heartbeat");

assert.deepEqual(await runShadowScheduler(db, {
  at: new Date("2026-09-04T05:17:00.000Z"), identityKey: KEY, identityKeyId: "r8-test-key-1", dry: false,
}), { candidates: 1, inserted: 1, duplicates: 0, dry: false });
assert.equal(writes, 1);
assert.equal(heartbeats, 1);

const schedulerSource = readFileSync("scripts/mobile-astronomy-fact-shadow-cron.mts", "utf8");
const moduleSource = readFileSync("src/lib/mobile-science-shadow-r8.ts", "utf8");
for (const source of [schedulerSource, moduleSource]) {
  assert.doesNotMatch(source, /push-send|mobile-notification-delivery|firebase|expo-server|apns|FCM_SERVICE_ACCOUNT/iu,
    "shadow dependency inventory contains no provider capability");
  assert.doesNotMatch(source, /qimen|zibai|ziwei|yam/iu, "shadow calculation is isolated from other sciences");
}
assert.match(schedulerSource, /provider_send_enabled=false/u);
assert.match(schedulerSource, /p\.evidence_complete=true/u);
assert.match(schedulerSource, /p\.source_digest=\$2/u);
assert.match(schedulerSource, /JOIN users u/u);
assert.match(schedulerSource, /u\.deleted_at IS NULL/u);
assert.match(schedulerSource, /science_id='astronomy_fact'/u);
assert.match(schedulerSource, /submode='civil_two_hour'/u);
assert.match(schedulerSource, /primary_endpoint=true/u);
assert.match(schedulerSource, /JOIN mobile_push_tokens t/u);
assert.match(schedulerSource, /t\.id=c\.primary_token_id/u);
assert.match(schedulerSource, /t\.user_id=c\.user_id/u);
assert.match(schedulerSource, /t\.installation_id=c\.primary_installation_id/u);
assert.match(schedulerSource, /t\.enabled=true/u);
assert.match(schedulerSource, /e\.target_revision=c\.target_revision/u);
assert.match(schedulerSource, /c\.consent_generation=s\.consent_generation/u);

const health = require("./notification-health.cjs");
assert.deepEqual(await health.readR8ShadowHealth({ query: async () => ({ rows: [{ relation: null }] }) }), {
  phase: "migration_not_applied", migrationApplied: false, available: false, ok: true, reasons: [],
  lastRunAt: null, lastCount: 0, providerSendEnabled: false, fresh: false,
  ageSeconds: null, future: false, futureSkewSeconds: 0,
}, "R8 shadow health is neutral only before the additive migration exists");
const healthQueries: string[] = [];
assert.deepEqual(await health.readR8ShadowHealth({
  query: async (sql: string) => {
    healthQueries.push(sql);
    if (sql.includes("to_regclass")) return { rows: [{ relation: "mobile_science_notification_producer_state" }] };
    return { rows: [{ last_shadow_run_at: new Date("2026-09-04T05:00:00.000Z"), last_shadow_count: 3, provider_send_enabled: false }] };
  },
}, { now: new Date("2026-09-04T05:03:00.000Z") }), {
  phase: "shadow", migrationApplied: true, available: true, ok: true, reasons: [],
  lastRunAt: "2026-09-04T05:00:00.000Z", lastCount: 3, providerSendEnabled: false,
  fresh: true, ageSeconds: 180, future: false, futureSkewSeconds: 0,
});
assert.equal(healthQueries.length, 2);

const forward = readFileSync("migrations/20260904_mobile_science_notifications_r8.sql", "utf8");
assert.match(forward, /scheduled_for timestamptz NOT NULL/u);
assert.match(forward, /quiet_start smallint NOT NULL DEFAULT 22/u);
assert.match(forward, /consent_generation bigint NOT NULL DEFAULT 1/u);

const database = `mobile_science_shadow_r8_${process.pid}`;
const databasePattern = /^mobile_science_shadow_r8_\d+$/u;
let observedSchemaDefinitionDigest = "";
assert.match(database, databasePattern);

function psql(dbName: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", dbName, "-Atq"],
    { encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

const localEnv: Record<string, string> = {};
const envFile = [process.env.HOURKEY_TEST_ENV_FILE,".env.local","/etc/hourkey/hourkey.env","/root/decode-app/.env.local"]
  .find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
assert.ok(envFile, "a test-only PostgreSQL environment file is available");
for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
  if (match) localEnv[match[1]] = match[2].replace(/^['"]|['"]$/gu, "");
}
const clientOptions = {
  host: localEnv.PGHOST || "127.0.0.1",
  port: Number(localEnv.PGPORT || 5433),
  database,
  user: localEnv.PGUSER || "decode_user",
  password: localEnv.PGPASSWORD,
};
assert.match(clientOptions.user, /^[a-z_][a-z0-9_]{0,62}$/u, "test database role is a safe identifier");

async function waitForDatabaseLock(observer: any, applicationName: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await observer.query(
      `SELECT wait_event_type FROM pg_stat_activity
        WHERE datname=$1 AND application_name=$2 AND state='active'`,
      [database,applicationName],
    );
    if (result.rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`${applicationName} did not reach a database lock wait`);
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY,deleted_at timestamptz,is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE profiles(id uuid PRIMARY KEY,created_by_user_id uuid NOT NULL REFERENCES users(id));
    CREATE TABLE mobile_push_tokens(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      installation_id uuid NOT NULL,qizheng_payload_schema smallint NOT NULL DEFAULT 0,
      enabled boolean NOT NULL DEFAULT true
    );
    CREATE UNIQUE INDEX ux_mobile_push_tokens_active_installation
      ON mobile_push_tokens(installation_id) WHERE enabled=true;
    CREATE TABLE notification_scheduler_runs(name text PRIMARY KEY,last_run_at timestamptz NOT NULL,run_count int NOT NULL);
    CREATE TABLE mobile_ziwei_hourly_producer_state(id integer);
    CREATE TABLE mobile_push_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE mobile_push_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE mobile_ziwei_hourly_occurrences(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE mobile_ziwei_hourly_installations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    INSERT INTO notification_scheduler_runs VALUES('qimen','2026-09-04T00:00:00Z',17);
  `);
  psql(database, forward);
  psql(database, forward);
  psql(database, `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${clientOptions.user};`);

  const accountId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const primaryInstallation = crypto.randomUUID();
  const secondaryInstallation = crypto.randomUUID();
  psql(database, `
    INSERT INTO users(id) VALUES('${accountId}');
    INSERT INTO mobile_science_notification_subscriptions
      (user_id,org_id,science_id,submode,cadence,local_day_cap,locale,display_timezone,receipt,quiet_start,quiet_end)
    VALUES('${accountId}','${orgId}','astronomy_fact','civil_two_hour','two_hour',12,'th','Asia/Bangkok','{}',22,7);
    INSERT INTO mobile_science_notification_shadow_cohort
      (user_id,science_id,submode,enabled,approved_by,approved_at)
    VALUES('${accountId}','astronomy_fact','civil_two_hour',true,'r8-test','2026-09-04T00:00:00Z');
    WITH primary_token AS (
      INSERT INTO mobile_push_tokens(user_id,installation_id)
      VALUES('${accountId}','${primaryInstallation}')
      RETURNING id,installation_id,astronomy_fact_audience_binding
    ), secondary_token AS (
      INSERT INTO mobile_push_tokens(user_id,installation_id)
      VALUES('${accountId}','${secondaryInstallation}')
      RETURNING id,installation_id,astronomy_fact_audience_binding
    ), inserted AS (
      INSERT INTO mobile_science_notification_chains
        (user_id,org_id,science_id,submode,schema_version,primary_token_id,primary_installation_id,consent_generation)
      SELECT '${accountId}','${orgId}','astronomy_fact','civil_two_hour',1,id,installation_id,1 FROM primary_token
      RETURNING id
    )
    INSERT INTO mobile_science_notification_endpoints
      (chain_id,token_id,installation_id,audience_binding,target_revision,primary_endpoint)
    SELECT inserted.id,primary_token.id,primary_token.installation_id,
           primary_token.astronomy_fact_audience_binding,1,true FROM inserted,primary_token
    UNION ALL
    SELECT inserted.id,secondary_token.id,secondary_token.installation_id,
           secondary_token.astronomy_fact_audience_binding,1,false FROM inserted,secondary_token;
  `);

  const client = new Client(clientOptions);
  const leasePeer = new Client(clientOptions);
  await client.connect();
  await leasePeer.connect();
  try {
    assert.equal((await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended('mobile-science-shadow:astronomy_fact:civil_two_hour:v1',0)) AS acquired",
    )).rows[0].acquired, true);
    assert.equal((await leasePeer.query(
      "SELECT pg_try_advisory_lock(hashtextextended('mobile-science-shadow:astronomy_fact:civil_two_hour:v1',0)) AS acquired",
    )).rows[0].acquired, false, "the R8 lease excludes a concurrent R8 scheduler");
    assert.equal((await leasePeer.query(
      "SELECT pg_try_advisory_lock(hashtextextended('mobile-qimen-push-cron',0)) AS acquired",
    )).rows[0].acquired, true, "the R8 lease namespace cannot block a legacy scheduler");
    await leasePeer.query("SELECT pg_advisory_unlock(hashtextextended('mobile-qimen-push-cron',0))");
    await client.query("SELECT pg_advisory_unlock(hashtextextended('mobile-science-shadow:astronomy_fact:civil_two_hour:v1',0))");

    const at = new Date("2026-09-04T05:17:00.000Z");
    assert.deepEqual(await runShadowScheduler(client, { at, identityKey: KEY, identityKeyId: "r8-test-key-1", dry: false }),
      { candidates: 1, inserted: 1, duplicates: 0, dry: false }, "two registered devices still produce one primary-chain occurrence");
    assert.deepEqual(await runShadowScheduler(client, { at, identityKey: KEY, identityKeyId: "r8-test-key-1", dry: false }),
      { candidates: 1, inserted: 0, duplicates: 1, dry: false }, "restart replay is idempotent");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM mobile_science_notification_occurrences")).rows[0].count, 1);
    await client.query("UPDATE mobile_push_tokens SET enabled=false WHERE installation_id=$1", [primaryInstallation]);
    assert.deepEqual(await runShadowScheduler(client, { at, identityKey: KEY, identityKeyId: "r8-test-key-1", dry: true }),
      { candidates: 0, inserted: 0, duplicates: 0, dry: true }, "a disabled primary device cannot enter the shadow scheduler");
    await client.query("UPDATE mobile_push_tokens SET enabled=true WHERE installation_id=$1", [primaryInstallation]);
    await client.query("UPDATE mobile_science_notification_chains SET target_revision=2 WHERE user_id=$1", [accountId]);
    await client.query("UPDATE mobile_science_notification_endpoints SET target_revision=2 WHERE installation_id=$1", [primaryInstallation]);
    assert.deepEqual(await runShadowScheduler(client, { at, identityKey: KEY, identityKeyId: "r8-test-key-1", dry: false }),
      { candidates: 1, inserted: 0, duplicates: 1, dry: false }, "target rotation cannot duplicate an existing delivery lineage");

    await client.query("UPDATE mobile_science_notification_subscriptions SET local_day_cap=1 WHERE user_id=$1", [accountId]);
    assert.deepEqual(await runShadowScheduler(client, {
      at: new Date("2026-09-04T07:17:00.000Z"), identityKey: KEY, identityKeyId: "r8-test-key-1", dry: false,
    }), { candidates: 1, inserted: 1, duplicates: 0, dry: false });
    assert.deepEqual((await client.query(
      "SELECT state,suppression_reason FROM mobile_science_notification_occurrences ORDER BY scheduled_for DESC LIMIT 1",
    )).rows[0], { state: "expired", suppression_reason: "local_day_cap" });

    await client.query(
      "UPDATE mobile_science_notification_subscriptions SET local_day_cap=12,quiet_start=12,quiet_end=14 WHERE user_id=$1",
      [accountId],
    );
    assert.deepEqual(await runShadowScheduler(client, {
      at: new Date("2026-09-05T05:17:00.000Z"), identityKey: KEY, identityKeyId: "r8-test-key-1", dry: false,
    }), { candidates: 1, inserted: 1, duplicates: 0, dry: false });
    assert.deepEqual((await client.query(
      "SELECT state,suppression_reason FROM mobile_science_notification_occurrences ORDER BY scheduled_for DESC LIMIT 1",
    )).rows[0], { state: "expired", suppression_reason: "quiet_hours" });

    await client.query("UPDATE mobile_science_notification_subscriptions SET consent_generation=2 WHERE user_id=$1", [accountId]);
    assert.deepEqual(await runShadowScheduler(client, {
      at: new Date("2026-09-05T07:17:00.000Z"), identityKey: KEY, identityKeyId: "r8-test-key-1", dry: true,
    }), { candidates: 0, inserted: 0, duplicates: 0, dry: true }, "a stale consent generation is suppressed before occurrence creation");

    const rollingUser = crypto.randomUUID();
    const rollingOrg = crypto.randomUUID();
    const rollingInstallation = crypto.randomUUID();
    const rollingChain = crypto.randomUUID();
    await client.query("INSERT INTO users(id) VALUES($1)", [rollingUser]);
    const rollingToken = (await client.query(
      "INSERT INTO mobile_push_tokens(user_id,installation_id) VALUES($1,$2) RETURNING id,astronomy_fact_audience_binding",
      [rollingUser,rollingInstallation],
    )).rows[0];
    await client.query(`INSERT INTO mobile_science_notification_subscriptions
      (user_id,org_id,science_id,submode,cadence,local_day_cap,locale,display_timezone,receipt,quiet_start,quiet_end)
      VALUES($1,$2,'astronomy_fact','civil_two_hour','two_hour',12,'th','UTC','{}',1,2)`, [rollingUser,rollingOrg]);
    await client.query(`INSERT INTO mobile_science_notification_shadow_cohort
      (user_id,science_id,submode,enabled,approved_by,approved_at)
      VALUES($1,'astronomy_fact','civil_two_hour',true,'r8-test',now())`, [rollingUser]);
    await client.query(`INSERT INTO mobile_science_notification_chains
      (id,user_id,org_id,science_id,submode,schema_version,primary_token_id,primary_installation_id,consent_generation)
      VALUES($1,$2,$3,'astronomy_fact','civil_two_hour',1,$4,$5,1)`,
      [rollingChain,rollingUser,rollingOrg,rollingToken.id,rollingInstallation]);
    await client.query(`INSERT INTO mobile_science_notification_endpoints
      (chain_id,token_id,installation_id,audience_binding,target_revision,primary_endpoint)
      VALUES($1,$2,$3,$4,1,true)`,
      [rollingChain,rollingToken.id,rollingInstallation,rollingToken.astronomy_fact_audience_binding]);
    await client.query(`INSERT INTO mobile_science_notification_occurrences
      (chain_id,science_id,submode,schema_version,notification_unit_id,identity_cbor,identity_hash,
       result_revision_hash,rollout_epoch,state,snapshot,snapshot_digest,scheduled_for,expires_at)
      SELECT $1,'astronomy_fact','civil_two_hour',1,'prior-'||n,decode('a100','hex'),
             digest('rolling-identity-'||n,'sha256'),digest('rolling-result-'||n,'sha256'),1,
             'shadowed','{}',encode(digest('{}','sha256'),'hex'),
             '2026-09-01T12:00:00Z'::timestamptz + n*interval '1 hour',
             '2026-09-01T14:00:00Z'::timestamptz + n*interval '1 hour'
        FROM generate_series(0,11) n`, [rollingChain]);
    assert.deepEqual(await runShadowScheduler(client, {
      at: new Date("2026-09-02T00:17:00.000Z"), identityKey: KEY, identityKeyId: "r8-test-key-1", dry: false,
    }), { candidates: 1, inserted: 1, duplicates: 0, dry: false });
    assert.deepEqual((await client.query(
      "SELECT state,suppression_reason FROM mobile_science_notification_occurrences WHERE chain_id=$1 ORDER BY scheduled_for DESC LIMIT 1",
      [rollingChain],
    )).rows[0], { state: "expired", suppression_reason: "rolling_24h_cap" });

    async function createRaceFixture(connection: any, label: string) {
      const userId = crypto.randomUUID();
      const orgId = crypto.randomUUID();
      const installationId = crypto.randomUUID();
      await connection.query("INSERT INTO users(id) VALUES($1)", [userId]);
      const token = (await connection.query(
        `INSERT INTO mobile_push_tokens(user_id,installation_id)
         VALUES($1,$2) RETURNING id,astronomy_fact_audience_binding`,
        [userId,installationId],
      )).rows[0];
      await connection.query(
        `INSERT INTO mobile_science_notification_subscriptions
          (user_id,org_id,science_id,submode,cadence,local_day_cap,locale,display_timezone,receipt,quiet_start,quiet_end)
         VALUES($1,$2,'astronomy_fact','civil_two_hour','two_hour',12,'th','UTC','{}',1,2)`,
        [userId,orgId],
      );
      await connection.query(
        `INSERT INTO mobile_science_notification_shadow_cohort
          (user_id,science_id,submode,enabled,approved_by,approved_at)
         VALUES($1,'astronomy_fact','civil_two_hour',true,'r8-race-test',now())`,
        [userId],
      );
      const chainId = (await connection.query(
        `INSERT INTO mobile_science_notification_chains
          (user_id,org_id,science_id,submode,schema_version,primary_token_id,primary_installation_id,consent_generation)
         VALUES($1,$2,'astronomy_fact','civil_two_hour',1,$3,$4,1) RETURNING id`,
        [userId,orgId,token.id,installationId],
      )).rows[0].id;
      await connection.query(
        `INSERT INTO mobile_science_notification_endpoints
          (chain_id,token_id,installation_id,audience_binding,target_revision,primary_endpoint)
         VALUES($1,$2,$3,$4,1,true)`,
        [chainId,token.id,installationId,token.astronomy_fact_audience_binding],
      );
      return { userId, chainId, label };
    }

    function recordOccurrence(connection: any, fixture: { chainId: string; label: string }) {
      return connection.query(
        `SELECT hourkey_r8_record_astronomy_shadow_occurrence(
          $1,$2,decode('a100','hex'),digest($3,'sha256'),digest($4,'sha256'),1,
          'shadowed',NULL,'{}',encode(digest('{}','sha256'),'hex'),
          '2026-09-04T05:00:00Z','2026-09-04T07:00:00Z',$5
        ) AS inserted`,
        [fixture.chainId,`race-${fixture.label}`,`identity-${fixture.label}`,
          `revision-${fixture.label}`,ASTRONOMY_FACT_MODEL_DIGEST],
      );
    }

    async function finishDeletion(connection: any, userId: string) {
      await connection.query(
        "UPDATE users SET deleted_at=now(),is_active=false WHERE id=$1",
        [userId],
      );
      await connection.query("SELECT hourkey_r8_revoke_delivery_scope($1,NULL::uuid)", [userId]);
      await connection.query("UPDATE mobile_push_tokens SET enabled=false WHERE user_id=$1", [userId]);
    }

    const blocker = new Client({ ...clientOptions, application_name: "r8-race-blocker" });
    const recorder = new Client({ ...clientOptions, application_name: "r8-race-recorder" });
    const deleter = new Client({ ...clientOptions, application_name: "r8-race-deleter" });
    const observer = new Client({ ...clientOptions, application_name: "r8-race-observer" });
    await Promise.all([blocker.connect(),recorder.connect(),deleter.connect(),observer.connect()]);
    try {
      const recordWins = await createRaceFixture(client, "record-wins");
      await blocker.query("BEGIN");
      await blocker.query("SELECT 1 FROM mobile_science_notification_chains WHERE id=$1 FOR UPDATE", [recordWins.chainId]);
      const recording = recordOccurrence(recorder, recordWins);
      await waitForDatabaseLock(observer, "r8-race-recorder");
      await deleter.query("BEGIN");
      const deleteAdvisory = deleter.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||$1::text,0))",
        [recordWins.userId],
      );
      await deleteAdvisory;
      const deleteUserLock = deleter.query("SELECT 1 FROM users WHERE id=$1 FOR UPDATE", [recordWins.userId]);
      await waitForDatabaseLock(observer, "r8-race-deleter");
      await blocker.query("COMMIT");
      assert.equal((await recording).rows[0].inserted, true,
        "when recording wins the shared user fence it commits the occurrence first");
      await deleteUserLock;
      await finishDeletion(deleter, recordWins.userId);
      await deleter.query("COMMIT");
      assert.equal((await client.query(
        "SELECT lifecycle_state FROM mobile_science_notification_chains WHERE id=$1",
        [recordWins.chainId],
      )).rows[0].lifecycle_state, "revoked", "deletion follows and revokes the recorded chain");

      const deleteWins = await createRaceFixture(client, "delete-wins");
      await deleter.query("BEGIN");
      await deleter.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||$1::text,0))",
        [deleteWins.userId],
      );
      await deleter.query("SELECT 1 FROM users WHERE id=$1 FOR UPDATE", [deleteWins.userId]);
      await finishDeletion(deleter, deleteWins.userId);
      const recordingAfterDelete = recordOccurrence(recorder, deleteWins);
      await waitForDatabaseLock(observer, "r8-race-recorder");
      await deleter.query("COMMIT");
      assert.equal((await recordingAfterDelete).rows[0].inserted, false,
        "when deletion wins the shared user fence, recording rechecks the inactive user and fails closed");
      assert.equal((await client.query(
        "SELECT count(*)::int AS count FROM mobile_science_notification_occurrences WHERE chain_id=$1",
        [deleteWins.chainId],
      )).rows[0].count, 0, "no post-deletion occurrence can be inserted");

      const crossUserOne = await createRaceFixture(client, "cross-user-one");
      const crossUserTwo = await createRaceFixture(client, "cross-user-two");
      const [lowerUser,higherUser] = [crossUserOne,crossUserTwo]
        .sort((left,right) => left.userId.localeCompare(right.userId));
      await recorder.query("BEGIN");
      assert.equal((await recordOccurrence(recorder,higherUser)).rows[0].inserted,true);
      await deleter.query("BEGIN");
      await deleter.query("SET LOCAL statement_timeout='1s'");
      await deleter.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||$1::text,0))",
        [lowerUser.userId],
      );
      await deleter.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||$1::text,0))",
        [higherUser.userId],
      );
      await deleter.query("SELECT 1 FROM users WHERE id=$1 FOR UPDATE", [lowerUser.userId]);
      const schedulerSecondUser = recordOccurrence(recorder,lowerUser);
      await waitForDatabaseLock(observer,"r8-race-recorder");
      await deleter.query("COMMIT");
      assert.equal((await schedulerSecondUser).rows[0].inserted,true,
        "a multi-user push transfer and opposite scheduler order serialize without an advisory-lock cycle");
      await recorder.query("COMMIT");
    } finally {
      await blocker.query("ROLLBACK").catch(() => null);
      await deleter.query("ROLLBACK").catch(() => null);
      await Promise.all([blocker.end(),recorder.end(),deleter.end(),observer.end()]);
    }

    assert.deepEqual((await client.query("SELECT last_run_at,run_count FROM notification_scheduler_runs WHERE name='qimen'" )).rows[0],
      { last_run_at: new Date("2026-09-04T00:00:00.000Z"), run_count: 17 }, "R8 shadow does not mutate legacy scheduler heartbeat state");

    psql(database, `REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON mobile_science_notification_producer_state,mobile_science_notification_subscriptions,
         mobile_science_notification_shadow_cohort,mobile_science_notification_chains,
         mobile_science_notification_endpoints,mobile_science_notification_occurrences
      FROM hourkey_app`);
    const proofEnvironment = { PGHOST: "test", PGPORT: "5432", PGDATABASE: database, PGUSER: "hourkey_app", PGPASSWORD: "hidden" };
    const schemaProbeClient = new Client(clientOptions);
    await schemaProbeClient.connect();
    await schemaProbeClient.query("SET ROLE hourkey_app");
    const schemaProbe = await preflight.inspectDatabaseAccess({
      r8Required: true,
      expectedModelDigest: ASTRONOMY_FACT_MODEL_DIGEST,
      expectedSourceDigest: "af7999aff8395b33bc73fa3c6821e3455715bc03d76f0959afddb1392a394bf2",
      expectedSchemaDigest: "0".repeat(64),
      environment: proofEnvironment,
      connect: async () => schemaProbeClient,
      onError: (error: unknown) => { throw error; },
    });
    assert.match(schemaProbe.r8SchemaDefinitionDigest,/^[0-9a-f]{64}$/u);
    assert.equal(schemaProbe.r8SchemaDefinitionDigest,EXPECTED_R8_SCHEMA_DEFINITION_DIGEST,
      "the twice-applied migration must match the independently pinned complete catalog fingerprint");
    observedSchemaDefinitionDigest = schemaProbe.r8SchemaDefinitionDigest;
    const proofClient = new Client(clientOptions);
    await proofClient.connect();
    await proofClient.query("SET ROLE hourkey_app");
    const databaseProof = await preflight.inspectDatabaseAccess({
      r8Required: true,
      expectedModelDigest: ASTRONOMY_FACT_MODEL_DIGEST,
      expectedSourceDigest: "af7999aff8395b33bc73fa3c6821e3455715bc03d76f0959afddb1392a394bf2",
      expectedSchemaDigest: EXPECTED_R8_SCHEMA_DEFINITION_DIGEST,
      environment: proofEnvironment,
      connect: async () => proofClient,
    });
    assert.deepEqual({
      migration: databaseProof.r8MigrationApplied,
      schema: databaseProof.r8SchemaComplete,
      rows: databaseProof.r8ProducerRowsExact,
      sources: databaseProof.r8SourceDigestsMatch,
      hardOff: databaseProof.r8HardOff,
      tablesReadOnly: databaseProof.r8RuntimeTablesReadOnly,
      publicDenied: databaseProof.r8PublicMutationDenied,
      functionsExecutable: databaseProof.r8ScopedFunctionsExecutable,
      functionsHardened: databaseProof.r8ScopedFunctionsHardened,
    }, {
      migration: true, schema: true, rows: true, sources: true, hardOff: true,
      tablesReadOnly: true, publicDenied: true, functionsExecutable: true, functionsHardened: true,
    }, "the real twice-applied migration satisfies every R8 schema, hard-off, source, and least-privilege proof");

    const hardOffConstraint = (await client.query(
      `SELECT co.conname
         FROM pg_catalog.pg_constraint co
         JOIN pg_catalog.pg_class cl ON cl.oid=co.conrelid
         JOIN pg_catalog.pg_namespace ns ON ns.oid=cl.relnamespace
        WHERE ns.nspname='public' AND cl.relname='mobile_science_notification_producer_state'
          AND pg_catalog.pg_get_constraintdef(co.oid,true) LIKE '%provider_send_enabled = false%'
        ORDER BY co.conname LIMIT 1`,
    )).rows[0]?.conname;
    assert.match(hardOffConstraint,/^[a-z_][a-z0-9_]*$/u);
    psql(database,`ALTER TABLE mobile_science_notification_producer_state DROP CONSTRAINT "${hardOffConstraint}";`);
    const driftClient = new Client(clientOptions);
    await driftClient.connect();
    await driftClient.query("SET ROLE hourkey_app");
    const driftProof = await preflight.inspectDatabaseAccess({
      r8Required: true,
      expectedModelDigest: ASTRONOMY_FACT_MODEL_DIGEST,
      expectedSourceDigest: "af7999aff8395b33bc73fa3c6821e3455715bc03d76f0959afddb1392a394bf2",
      expectedSchemaDigest: EXPECTED_R8_SCHEMA_DEFINITION_DIGEST,
      environment: proofEnvironment,
      connect: async () => driftClient,
    });
    assert.equal(driftProof.r8SchemaDefinitionDigestMatches,false,
      "dropping one hard-off CHECK constraint changes the authenticated catalog fingerprint");
    assert.equal(driftProof.r8SchemaComplete,false,
      "catalog drift blocks application readiness even while current rows remain hard-off");
  } finally {
    await client.end();
    await leasePeer.end();
  }
} finally {
  if (databasePattern.test(database)) psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}

console.log(`MOBILE_SCIENCE_SHADOW_R8_OK provider-incapable deterministic schema=${observedSchemaDefinitionDigest}`);
