import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const forwardPath = "migrations/20260904_mobile_science_notifications_r8.sql";
const rollbackPath = "migrations/20260904_mobile_science_notifications_r8.rollback.sql";
const forward = readFileSync(forwardPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");

assert.match(forward, /science_id IN \('astronomy_fact','qizheng'\)/u);
assert.match(forward, /CHECK \(provider_send_enabled=false\)/u);
assert.match(forward, /CHECK \(enabled=false\)/u);
assert.match(forward, /CHECK \(qizheng_payload_schema=0\)/u);
assert.match(forward, /UNIQUE NULLS NOT DISTINCT/u);
assert.match(forward, /mobile_science_notification_shadow_cohort/u);
assert.match(forward, /primary_endpoint/u);
assert.match(forward, /audience_binding text NOT NULL UNIQUE/u);
assert.match(forward, /octet_length\(identity_hash\)=32/u);
assert.doesNotMatch(forward, /UPDATE mobile_(?:ziwei|zibai|qimen)_/iu);
assert.doesNotMatch(rollback, /\bDROP\s+(?:TABLE|COLUMN|FUNCTION|TRIGGER|INDEX)\b/iu);

const database = `mobile_science_r8_${process.pid}`;
const databasePattern = /^mobile_science_r8_\d+$/u;
assert.match(database, databasePattern);

function psql(db: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"],
    { encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

function rejectsSql(db: string, sql: string, message: string): void {
  let rejected = false;
  try { psql(db, sql); } catch { rejected = true; }
  assert.equal(rejected, true, message);
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE profiles(id uuid PRIMARY KEY,created_by_user_id uuid NOT NULL REFERENCES users(id));
    CREATE TABLE mobile_notification_prefs(user_id uuid PRIMARY KEY REFERENCES users(id));
    CREATE TABLE mobile_push_tokens(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),
      installation_id uuid NOT NULL,qizheng_payload_schema smallint NOT NULL DEFAULT 0,
      UNIQUE(user_id,installation_id)
    );
  `);
  psql(database, forward);
  psql(database, forward);

  const userId = crypto.randomUUID();
  const installationId = crypto.randomUUID();
  psql(database, `
    INSERT INTO users(id) VALUES('${userId}');
    INSERT INTO mobile_push_tokens(user_id,installation_id) VALUES('${userId}','${installationId}');
    INSERT INTO mobile_science_notification_subscriptions
      (user_id,org_id,science_id,submode,cadence,local_day_cap,locale,display_timezone,receipt)
    VALUES('${userId}',gen_random_uuid(),'astronomy_fact','civil_two_hour','two_hour',12,'th','Asia/Bangkok','{}');
  `);
  rejectsSql(database,
    `UPDATE mobile_science_notification_subscriptions SET enabled=true WHERE user_id='${userId}'`,
    "production subscriptions remain structurally hard-off",
  );
  rejectsSql(database,
    "UPDATE mobile_science_notification_producer_state SET provider_send_enabled=true",
    "no producer can obtain provider capability",
  );
  rejectsSql(database,
    `UPDATE mobile_push_tokens SET qizheng_payload_schema=1 WHERE user_id='${userId}'`,
    "Qizheng clients remain schema zero",
  );
  rejectsSql(database,
    `INSERT INTO mobile_science_notification_shadow_cohort(user_id,science_id,submode,enabled)
     VALUES('${userId}','astronomy_fact','civil_two_hour',true)`,
    "shadow enrollment requires explicit approval evidence",
  );

  const chainId = psql(database, `
    INSERT INTO mobile_science_notification_chains
      (user_id,org_id,science_id,submode,schema_version,primary_installation_id)
    VALUES('${userId}',gen_random_uuid(),'astronomy_fact','civil_two_hour',1,'${installationId}')
    RETURNING id;
  `).split("\n").at(-1)!;
  psql(database, `
    INSERT INTO mobile_science_notification_endpoints(chain_id,installation_id,audience_binding,primary_endpoint)
    VALUES('${chainId}','${installationId}','A9c7wP4nY2kLm8QrV5sT1u',true);
  `);
  rejectsSql(database,
    `INSERT INTO mobile_science_notification_endpoints(chain_id,installation_id,audience_binding,primary_endpoint)
     VALUES('${chainId}',gen_random_uuid(),'B8c7wP4nY2kLm8QrV5sT1u',true)`,
    "one chain has only one active primary endpoint",
  );
  psql(database, `
    INSERT INTO mobile_science_notification_occurrences
      (chain_id,science_id,submode,schema_version,notification_unit_id,identity_cbor,identity_hash,result_revision_hash,rollout_epoch,state,snapshot,snapshot_digest)
    VALUES('${chainId}','astronomy_fact','civil_two_hour',1,'civil:2026-09-04T12:00:00+07:00',decode('a100','hex'),digest('identity','sha256'),digest('revision','sha256'),1,'shadowed','{}',encode(digest('{}','sha256'),'hex'));
  `);
  rejectsSql(database,
    `UPDATE mobile_science_notification_occurrences SET snapshot='{"changed":true}'`,
    "immutable occurrence evidence cannot be rewritten",
  );

  psql(database, rollback);
  assert.equal(psql(database, "SELECT count(*) FROM mobile_science_notification_occurrences"), "1");
  assert.equal(psql(database, "SELECT count(*) FROM mobile_science_notification_producer_state WHERE provider_send_enabled"), "0");
  assert.equal(psql(database, "SELECT count(*) FROM mobile_science_notification_shadow_cohort WHERE enabled"), "0");
} finally {
  if (databasePattern.test(database)) {
    psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
  }
}

console.log("MOBILE_SCIENCE_NOTIFICATIONS_R8_MIGRATION_OK hard-off immutable");
