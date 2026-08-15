import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const database = `notification_observability_migration_test_${process.pid}`;
const integrity = readFileSync("migrations/20260815_mobile_notification_integrity.sql", "utf8");
const forward = readFileSync("migrations/20260816_mobile_notification_observability.sql", "utf8");
const rollback = readFileSync("migrations/20260816_mobile_notification_observability.rollback.sql", "utf8");

assert.match(database, /^notification_observability_migration_test_/u, "migration test database name must be disposable");

function psql(db: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"],
    { encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

function hasIndex(name: string): boolean {
  return psql(database, `SELECT to_regclass('${name}') IS NOT NULL;`) === "t";
}

function plan(sql: string): string {
  return psql(database, `SET enable_seqscan=off; EXPLAIN (COSTS OFF) ${sql};`);
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users (id uuid PRIMARY KEY, timezone text DEFAULT 'Asia/Bangkok');
    CREATE TABLE mobile_push_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), installation_id uuid NOT NULL,
      expo_push_token text NOT NULL UNIQUE, device_push_token text, device_token_type text, platform text NOT NULL,
      enabled boolean NOT NULL DEFAULT true, fail_count integer NOT NULL DEFAULT 0, last_registered_at timestamptz,
      last_success_at timestamptz, disabled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, installation_id)
    );
    CREATE TABLE mobile_notification_prefs (user_id uuid PRIMARY KEY REFERENCES users(id));
    CREATE TABLE mobile_push_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), yam_key text NOT NULL, kind text NOT NULL DEFAULT 'daily',
      title text NOT NULL DEFAULT 'safe', body text NOT NULL DEFAULT 'safe', payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      sent_at timestamptz, read_at timestamptz, delivery_status text NOT NULL DEFAULT 'accepted' CHECK (delivery_status IN ('pending','accepted','failed')),
      attempt_count integer NOT NULL DEFAULT 0, next_retry_at timestamptz, accepted_at timestamptz, last_error text, updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id,yam_key)
    );
  `);
  psql(database, integrity);
  psql(database, forward);
  psql(database, `
    INSERT INTO users(id) VALUES ('00000000-0000-4000-8000-000000000001');
    WITH logs AS (
      INSERT INTO mobile_push_log(user_id,yam_key,kind,title,body,payload,delivery_status)
      SELECT '00000000-0000-4000-8000-000000000001', 'observability-plan-'||n, 'daily', 'safe', 'safe', '{}'::jsonb, 'pending'
        FROM generate_series(1,400) AS n
      RETURNING id,yam_key
    ) INSERT INTO mobile_push_attempts(push_log_id,installation_id,provider,provider_message,message_sha256,status,next_retry_at)
      SELECT id,gen_random_uuid(),'expo','{}',repeat('a',64),'retry_due',
             CASE WHEN yam_key='observability-plan-1' THEN now()-interval '1 second' ELSE now()+interval '1 day' END
        FROM logs;
    WITH logs AS (
      INSERT INTO mobile_push_log(user_id,yam_key,kind,title,body,payload,delivery_status)
      SELECT '00000000-0000-4000-8000-000000000001', 'observability-reserved-'||n, 'daily', 'safe', 'safe', '{}'::jsonb, 'pending'
        FROM generate_series(1,400) AS n
      RETURNING id,yam_key
    ) INSERT INTO mobile_push_attempts(push_log_id,installation_id,provider,provider_message,message_sha256,status,next_retry_at,updated_at)
      SELECT id,gen_random_uuid(),'expo','{}',repeat('b',64),'reserved',now(),
             CASE WHEN yam_key='observability-reserved-1' THEN now()-interval '1 day' ELSE now() END
        FROM logs;
    WITH logs AS (
      INSERT INTO mobile_push_log(user_id,yam_key,kind,title,body,payload,delivery_status)
      SELECT '00000000-0000-4000-8000-000000000001', 'observability-receipt-'||n, 'daily', 'safe', 'safe', '{}'::jsonb, 'accepted'
        FROM generate_series(1,400) AS n
      RETURNING id,yam_key
    ) INSERT INTO mobile_push_attempts(push_log_id,installation_id,provider,provider_message,message_sha256,status,provider_ticket_id,accepted_at)
      SELECT id,gen_random_uuid(),'expo','{}',repeat('c',64),'provider_accepted','observability-ticket-'||yam_key,
             CASE WHEN yam_key='observability-receipt-1' THEN now()-interval '1 day' ELSE now() END
        FROM logs;
    ANALYZE mobile_push_attempts;
  `);

  const indexes = [
    "ix_mobile_push_attempts_observability_reserved_stale",
    "ix_mobile_push_attempts_observability_receipt_stalled",
    "ix_mobile_push_attempts_observability_status_token",
    "ix_mobile_push_attempts_observability_updated",
    "ix_mobile_push_attempts_observability_parent_status",
    "ix_mobile_push_tokens_observability_enabled",
  ];
  for (const name of indexes) assert.equal(hasIndex(name), true, `${name} is created by the forward migration`);
  assert.match(plan(`SELECT id FROM mobile_push_attempts WHERE status='retry_due' AND next_retry_at<=now()`), /ix_mobile_push_attempts_due/u, "existing live retry health predicate retains its index plan");
  assert.match(plan(`SELECT id FROM mobile_push_attempts WHERE status='reserved' AND lease_token IS NULL AND COALESCE(send_started_at,updated_at,created_at)<=now()-interval '1 second'`), /ix_mobile_push_attempts_observability_reserved_stale/u, "stuck unleased reservation predicate has an index plan");
  assert.match(plan(`SELECT id FROM mobile_push_attempts WHERE provider='expo' AND status='provider_accepted' AND provider_ticket_id IS NOT NULL AND provider_receipt_checked_at IS NULL AND accepted_at<=now()-interval '1 second'`), /ix_mobile_push_attempts_observability_receipt_stalled/u, "stalled receipt predicate has an index plan");
  assert.match(plan(`SELECT id FROM mobile_push_attempts WHERE updated_at>=now()-interval '168 hours'`), /ix_mobile_push_attempts_observability_updated/u, "bounded historical metrics predicate has an index plan");

  psql(database, rollback);
  for (const name of indexes) assert.equal(hasIndex(name), false, `${name} is removed by schema-only rollback`);
  assert.equal(psql(database, `SELECT to_regclass('mobile_push_attempts') IS NOT NULL;`), "t", "rollback preserves Task 2 durable attempts");
  psql(database, forward);
  for (const name of indexes) assert.equal(hasIndex(name), true, `${name} is restored by forward reapply`);
  console.log("NOTIFICATION_OBSERVABILITY_MIGRATION_OK");
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`); } catch {}
}
