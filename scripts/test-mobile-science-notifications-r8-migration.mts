import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ASTRONOMY_FACT_MODEL_DIGEST } from "../src/lib/astro/astronomy-fact-model-attestation";

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
assert.match(forward, /astronomy_fact_audience_binding/u);
assert.match(forward, /primary_token_id uuid NOT NULL/u);
assert.match(forward, /lifecycle_state text NOT NULL/u);
assert.match(forward, /ON DELETE CASCADE/u);
assert.match(forward, /pg_trigger_depth\(\)>1/u);
assert.doesNotMatch(forward, /REFERENCES mobile_push_tokens\(user_id,installation_id\)/u);
assert.match(forward, /octet_length\(identity_hash\)=32/u);
assert.doesNotMatch(forward, /UPDATE mobile_(?:ziwei|zibai|qimen)_/iu);
assert.doesNotMatch(rollback, /\bDROP\s+(?:TABLE|COLUMN|FUNCTION|TRIGGER|INDEX)\b/iu);
assert.match(forward, /SECURITY DEFINER SET search_path=pg_catalog,public/iu);
assert.match(forward, /REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER/iu);

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
    CREATE TABLE users(id uuid PRIMARY KEY,deleted_at timestamptz,is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE profiles(id uuid PRIMARY KEY,created_by_user_id uuid NOT NULL REFERENCES users(id));
    CREATE TABLE mobile_notification_prefs(user_id uuid PRIMARY KEY REFERENCES users(id));
    CREATE TABLE mobile_push_tokens(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      installation_id uuid NOT NULL,qizheng_payload_schema smallint NOT NULL DEFAULT 0,
      enabled boolean NOT NULL DEFAULT true
    );
    CREATE UNIQUE INDEX ux_mobile_push_tokens_active_installation
      ON mobile_push_tokens(installation_id) WHERE enabled=true;
  `);
  psql(database, forward);
  psql(database, forward);
  assert.equal(psql(database,
    "SELECT source_digest FROM mobile_science_notification_producer_state WHERE science_id='astronomy_fact' AND submode='civil_two_hour' AND schema_version=1",
  ), ASTRONOMY_FACT_MODEL_DIGEST);
  for (const table of [
    "mobile_science_notification_producer_state",
    "mobile_science_notification_subscriptions",
    "mobile_science_notification_shadow_cohort",
    "mobile_science_notification_chains",
    "mobile_science_notification_endpoints",
    "mobile_science_notification_occurrences",
  ]) {
    assert.equal(psql(database, `SELECT has_table_privilege('hourkey_app','${table}','SELECT')`), "t");
    for (const privilege of ["INSERT","UPDATE","DELETE"]) {
      assert.equal(psql(database, `SELECT has_table_privilege('hourkey_app','${table}','${privilege}')`), "f",
        `hourkey_app has no broad ${privilege} privilege on ${table}`);
    }
  }
  for (const signature of [
    "hourkey_r8_remove_transferred_bindings(uuid,uuid,text,text)",
    "hourkey_r8_rebind_primary_token(uuid,uuid,uuid,text)",
    "hourkey_r8_revoke_delivery_scope(uuid,uuid)",
    "hourkey_r8_record_astronomy_shadow_occurrence(uuid,text,bytea,bytea,bytea,bigint,text,text,jsonb,text,timestamp with time zone,timestamp with time zone,text)",
    "hourkey_r8_mark_astronomy_shadow_run(timestamp with time zone,integer,text)",
  ]) {
    assert.equal(psql(database, `SELECT has_function_privilege('hourkey_app','${signature}','EXECUTE')`), "t",
      `runtime can execute only the scoped ${signature} capability`);
  }

  const userId = crypto.randomUUID();
  const installationId = crypto.randomUUID();
  const tokenId = psql(database, `
    INSERT INTO users(id) VALUES('${userId}');
    INSERT INTO mobile_push_tokens(user_id,installation_id) VALUES('${userId}','${installationId}') RETURNING id;
  `).split("\n").at(-1)!;
  const audienceBinding = psql(database,
    `SELECT astronomy_fact_audience_binding FROM mobile_push_tokens WHERE id='${tokenId}'`,
  );
  assert.match(audienceBinding, /^[A-Za-z0-9_-]{22,64}$/u);
  psql(database, `
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
      (user_id,org_id,science_id,submode,schema_version,primary_token_id,primary_installation_id)
    VALUES('${userId}',gen_random_uuid(),'astronomy_fact','civil_two_hour',1,'${tokenId}','${installationId}')
    RETURNING id;
  `).split("\n").at(-1)!;
  const qizhengTokenId = psql(database, `
    INSERT INTO mobile_push_tokens(user_id,installation_id,enabled)
    VALUES('${userId}','${installationId}',false) RETURNING id;
  `).split("\n").at(-1)!;
  const qizhengAudience = psql(database,
    `SELECT astronomy_fact_audience_binding FROM mobile_push_tokens WHERE id='${qizhengTokenId}'`,
  );
  const qizhengChainId = psql(database, `
    WITH inserted AS (
      INSERT INTO mobile_science_notification_chains
        (user_id,org_id,science_id,submode,schema_version,primary_token_id,primary_installation_id)
      VALUES('${userId}',gen_random_uuid(),'qizheng','electional_window',0,'${qizhengTokenId}','${installationId}')
      RETURNING id
    )
    INSERT INTO mobile_science_notification_endpoints
      (chain_id,token_id,installation_id,audience_binding,target_revision,primary_endpoint)
    SELECT id,'${qizhengTokenId}','${installationId}','${qizhengAudience}',1,true FROM inserted
    RETURNING chain_id;
  `).split("\n").at(-1)!;
  const qizhengBefore = psql(database, `
    SELECT jsonb_build_object(
      'chain',to_jsonb(c),
      'endpoints',COALESCE((
        SELECT jsonb_agg(to_jsonb(e) ORDER BY e.installation_id)
          FROM mobile_science_notification_endpoints e WHERE e.chain_id=c.id
      ),'[]'::jsonb)
    )::text
      FROM mobile_science_notification_chains c WHERE c.id='${qizhengChainId}';
  `);
  const replacementTokenId = psql(database, `
    UPDATE mobile_push_tokens SET enabled=false WHERE id='${tokenId}';
    INSERT INTO mobile_push_tokens(user_id,installation_id) VALUES('${userId}','${installationId}') RETURNING id;
  `).split("\n").at(-1)!;
  const replacementAudience = psql(database,
    `SELECT astronomy_fact_audience_binding FROM mobile_push_tokens WHERE id='${replacementTokenId}'`,
  );
  assert.equal(psql(database,
    `SELECT hourkey_r8_rebind_primary_token('${userId}','${installationId}','${replacementTokenId}','${replacementAudience}')`,
  ), "1");
  assert.equal(psql(database,
    `SELECT primary_token_id::text FROM mobile_science_notification_chains WHERE id='${chainId}'`,
  ), replacementTokenId);
  assert.equal(psql(database,
    `SELECT token_id::text||':'||audience_binding||':'||target_revision::text
       FROM mobile_science_notification_endpoints WHERE chain_id='${chainId}'`,
  ), `${replacementTokenId}:${replacementAudience}:2`, "the scoped rebind creates the exact Astronomy endpoint");
  const qizhengAfter = psql(database, `
    SELECT jsonb_build_object(
      'chain',to_jsonb(c),
      'endpoints',COALESCE((
        SELECT jsonb_agg(to_jsonb(e) ORDER BY e.installation_id)
          FROM mobile_science_notification_endpoints e WHERE e.chain_id=c.id
      ),'[]'::jsonb)
    )::text
      FROM mobile_science_notification_chains c WHERE c.id='${qizhengChainId}';
  `);
  assert.equal(qizhengAfter, qizhengBefore,
    "an Astronomy token refresh leaves the complete Qizheng chain and endpoint byte-identical");
  rejectsSql(database,
    `INSERT INTO mobile_science_notification_endpoints(chain_id,token_id,installation_id,audience_binding,primary_endpoint)
     VALUES('${chainId}','${replacementTokenId}',gen_random_uuid(),'B8c7wP4nY2kLm8QrV5sT1u',true)`,
    "one chain has only one active primary endpoint",
  );
  psql(database, `
    INSERT INTO mobile_science_notification_occurrences
      (chain_id,science_id,submode,schema_version,notification_unit_id,identity_cbor,identity_hash,result_revision_hash,rollout_epoch,state,snapshot,snapshot_digest,scheduled_for,expires_at)
    VALUES('${chainId}','astronomy_fact','civil_two_hour',1,'civil:2026-09-04T12:00:00+07:00',decode('a100','hex'),digest('identity','sha256'),digest('revision','sha256'),1,'shadowed','{}',encode(digest('{}','sha256'),'hex'),'2026-09-04T05:00:00Z','2026-09-04T07:00:00Z');
  `);
  rejectsSql(database,
    `UPDATE mobile_science_notification_occurrences SET snapshot='{"changed":true}'`,
    "immutable occurrence evidence cannot be rewritten",
  );
  rejectsSql(database,
    "DELETE FROM mobile_science_notification_occurrences",
    "direct occurrence deletion remains immutable",
  );

  psql(database, rollback);
  assert.equal(psql(database, "SELECT count(*) FROM mobile_science_notification_occurrences"), "1");
  assert.equal(psql(database, `SELECT lifecycle_state FROM mobile_science_notification_chains WHERE id='${chainId}'`), "rollback");
  assert.equal(psql(database, `SELECT active FROM mobile_science_notification_endpoints WHERE chain_id='${chainId}'`), "f");
  assert.equal(psql(database, "SELECT count(*) FROM mobile_science_notification_producer_state WHERE provider_send_enabled"), "0");
  assert.equal(psql(database, "SELECT count(*) FROM mobile_science_notification_shadow_cohort WHERE enabled"), "0");

  psql(database, `DELETE FROM users WHERE id='${userId}'`);
  assert.equal(psql(database, `SELECT count(*) FROM mobile_science_notification_occurrences WHERE chain_id='${chainId}'`), "0",
    "account deletion cascades through immutable R8 evidence without being blocked");
  assert.equal(psql(database, `SELECT count(*) FROM mobile_science_notification_chains WHERE id='${chainId}'`), "0");
} finally {
  if (databasePattern.test(database)) {
    psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
  }
}

console.log("MOBILE_SCIENCE_NOTIFICATIONS_R8_MIGRATION_OK hard-off immutable");
