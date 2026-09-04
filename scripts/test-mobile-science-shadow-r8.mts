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
import { runShadowScheduler, type ShadowSchedulerDb } from "./mobile-astronomy-fact-shadow-cron.mts";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const KEY = Buffer.alloc(32, 7);
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
    if (sql.includes("INSERT INTO mobile_science_notification_occurrences")) { writes += 1; return { rows: [], rowCount: 1 }; }
    if (sql.includes("last_shadow_run_at")) { heartbeats += 1; return { rows: [], rowCount: 1 }; }
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
assert.match(schedulerSource, /science_id='astronomy_fact'/u);
assert.match(schedulerSource, /submode='civil_two_hour'/u);
assert.match(schedulerSource, /primary_endpoint=true/u);
assert.match(schedulerSource, /e\.target_revision=c\.target_revision/u);
assert.match(schedulerSource, /c\.consent_generation=s\.consent_generation/u);

const health = require("./notification-health.cjs");
assert.equal(await health.readR8ShadowHealth({ query: async () => ({ rows: [{ relation: null }] }) }), null,
  "R8 shadow health is optional before the additive migration exists");
const healthQueries: string[] = [];
assert.deepEqual(await health.readR8ShadowHealth({
  query: async (sql: string) => {
    healthQueries.push(sql);
    if (sql.includes("to_regclass")) return { rows: [{ relation: "mobile_science_notification_producer_state" }] };
    return { rows: [{ last_shadow_run_at: new Date("2026-09-04T05:00:00.000Z"), last_shadow_count: 3, provider_send_enabled: false }] };
  },
}), { available: true, lastRunAt: "2026-09-04T05:00:00.000Z", lastCount: 3, providerSendEnabled: false });
assert.equal(healthQueries.length, 2);

const forward = readFileSync("migrations/20260904_mobile_science_notifications_r8.sql", "utf8");
assert.match(forward, /scheduled_for timestamptz NOT NULL/u);
assert.match(forward, /quiet_start smallint NOT NULL DEFAULT 22/u);
assert.match(forward, /consent_generation bigint NOT NULL DEFAULT 1/u);

const database = `mobile_science_shadow_r8_${process.pid}`;
const databasePattern = /^mobile_science_shadow_r8_\d+$/u;
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

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE profiles(id uuid PRIMARY KEY,created_by_user_id uuid NOT NULL REFERENCES users(id));
    CREATE TABLE mobile_push_tokens(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),
      installation_id uuid NOT NULL,qizheng_payload_schema smallint NOT NULL DEFAULT 0,
      UNIQUE(user_id,installation_id)
    );
    CREATE TABLE notification_scheduler_runs(name text PRIMARY KEY,last_run_at timestamptz NOT NULL,run_count int NOT NULL);
    INSERT INTO notification_scheduler_runs VALUES('qimen','2026-09-04T00:00:00Z',17);
  `);
  psql(database, forward);
  psql(database, `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${clientOptions.user};`);

  const accountId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const primaryInstallation = crypto.randomUUID();
  const secondaryInstallation = crypto.randomUUID();
  psql(database, `
    INSERT INTO users(id) VALUES('${accountId}');
    INSERT INTO mobile_push_tokens(user_id,installation_id) VALUES
      ('${accountId}','${primaryInstallation}'),('${accountId}','${secondaryInstallation}');
    INSERT INTO mobile_science_notification_subscriptions
      (user_id,org_id,science_id,submode,cadence,local_day_cap,locale,display_timezone,receipt,quiet_start,quiet_end)
    VALUES('${accountId}','${orgId}','astronomy_fact','civil_two_hour','two_hour',12,'th','Asia/Bangkok','{}',22,7);
    INSERT INTO mobile_science_notification_shadow_cohort
      (user_id,science_id,submode,enabled,approved_by,approved_at)
    VALUES('${accountId}','astronomy_fact','civil_two_hour',true,'r8-test','2026-09-04T00:00:00Z');
    WITH inserted AS (
      INSERT INTO mobile_science_notification_chains
        (user_id,org_id,science_id,submode,schema_version,primary_installation_id,consent_generation)
      VALUES('${accountId}','${orgId}','astronomy_fact','civil_two_hour',1,'${primaryInstallation}',1)
      RETURNING id
    )
    INSERT INTO mobile_science_notification_endpoints
      (chain_id,installation_id,audience_binding,target_revision,primary_endpoint)
    SELECT id,'${primaryInstallation}'::uuid,'A9c7wP4nY2kLm8QrV5sT1u',1,true FROM inserted
    UNION ALL
    SELECT id,'${secondaryInstallation}'::uuid,'B8c7wP4nY2kLm8QrV5sT1u',1,false FROM inserted;
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
    await client.query("INSERT INTO mobile_push_tokens(user_id,installation_id) VALUES($1,$2)", [rollingUser,rollingInstallation]);
    await client.query(`INSERT INTO mobile_science_notification_subscriptions
      (user_id,org_id,science_id,submode,cadence,local_day_cap,locale,display_timezone,receipt,quiet_start,quiet_end)
      VALUES($1,$2,'astronomy_fact','civil_two_hour','two_hour',12,'th','UTC','{}',1,2)`, [rollingUser,rollingOrg]);
    await client.query(`INSERT INTO mobile_science_notification_shadow_cohort
      (user_id,science_id,submode,enabled,approved_by,approved_at)
      VALUES($1,'astronomy_fact','civil_two_hour',true,'r8-test',now())`, [rollingUser]);
    await client.query(`INSERT INTO mobile_science_notification_chains
      (id,user_id,org_id,science_id,submode,schema_version,primary_installation_id,consent_generation)
      VALUES($1,$2,$3,'astronomy_fact','civil_two_hour',1,$4,1)`, [rollingChain,rollingUser,rollingOrg,rollingInstallation]);
    await client.query(`INSERT INTO mobile_science_notification_endpoints
      (chain_id,installation_id,audience_binding,target_revision,primary_endpoint)
      VALUES($1,$2,'C7c7wP4nY2kLm8QrV5sT1u',1,true)`, [rollingChain,rollingInstallation]);
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

    assert.deepEqual((await client.query("SELECT last_run_at,run_count FROM notification_scheduler_runs WHERE name='qimen'" )).rows[0],
      { last_run_at: new Date("2026-09-04T00:00:00.000Z"), run_count: 17 }, "R8 shadow does not mutate legacy scheduler heartbeat state");
  } finally {
    await client.end();
    await leasePeer.end();
  }
} finally {
  if (databasePattern.test(database)) psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}

console.log("MOBILE_SCIENCE_SHADOW_R8_OK provider-incapable deterministic");
