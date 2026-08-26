import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);

const migrationPath = "migrations/20260821_mobile_yam_qimen_cutover.sql";
const rollbackNotePath = "migrations/20260821_mobile_yam_qimen_cutover.rollback.md";
assert.ok(existsSync(migrationPath), "Yam/Qimen cutover migration must exist");
assert.ok(existsSync(rollbackNotePath), "Yam/Qimen cutover rollback note must exist");
const forward = readFileSync(migrationPath, "utf8");
const rollbackNote = readFileSync(rollbackNotePath, "utf8");
assert.match(forward, /kind='yam'[\s\S]*source_facts\s*\?\s*'qimen'/u,
  "cutover scope must require both Yam kind and legacy Qimen source facts");
assert.match(forward, /split_part\(body,\s*E'\\n',\s*1\)/u,
  "cutover must preserve only the first history body line");
assert.match(forward, /source_facts\s*-\s*'qimen'/u,
  "cutover must remove only the legacy Qimen source fact");
assert.match(forward, /status IN \('reserved','retry_due','provider_accepted'\)/u,
  "cutover must contain sendable and receipt-pending attempts");
assert.doesNotMatch(forward, /attempts_retired_at\s*=/u,
  "cutover must leave attempt retirement to the normal retention lifecycle");
assert.match(rollbackNote, /not resurrect|never resurrect/iu,
  "rollback note must forbid restoring unsafe legacy attempts or privacy data");

const database = `yam_qimen_cutover_test_${process.pid}`;
const role = `yam_qimen_cutover_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
assert.match(database, /^yam_qimen_cutover_test_/u);

function psql(db: string, sql: string): string {
  return execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"], {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

let pool: pg.Pool | undefined;
try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE mobile_push_log(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), yam_key text UNIQUE, kind text NOT NULL,
      title text NOT NULL DEFAULT 'title', body text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      source_facts jsonb NOT NULL DEFAULT '{}'::jsonb, delivery_status text NOT NULL DEFAULT 'pending'
        CHECK (delivery_status IN ('pending','accepted','delivered','failed')),
      attempt_count integer NOT NULL DEFAULT 0, next_retry_at timestamptz, last_error text,
      sent_at timestamptz,accepted_at timestamptz,attempts_retired_at timestamptz,
      source_facts_redacted_at timestamptz,delivery_model_generation smallint NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE mobile_push_attempts(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), push_log_id uuid NOT NULL REFERENCES mobile_push_log(id) ON DELETE CASCADE,
      installation_id uuid NOT NULL, provider text NOT NULL DEFAULT 'expo', provider_message jsonb NOT NULL DEFAULT '{}'::jsonb,
      message_sha256 text NOT NULL DEFAULT repeat('a',64), status text NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved','provider_accepted','delivered','retry_due','dead')),
      send_count integer NOT NULL DEFAULT 0, next_retry_at timestamptz, lease_token text, lease_expires_at timestamptz,
      send_started_at timestamptz,provider_message_id text,provider_ticket_id text,next_receipt_at timestamptz,
      provider_receipt_checked_at timestamptz,accepted_at timestamptz,delivered_at timestamptz,
      receipt_poll_count integer NOT NULL DEFAULT 0,privacy_safe boolean NOT NULL DEFAULT false,transactional boolean NOT NULL DEFAULT false,
      last_error text, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(push_log_id,installation_id)
    );
    CREATE TABLE mobile_notification_engagements(user_id uuid,installation_id uuid,push_log_id uuid,event text,action_id text,recorded_at timestamptz);
    CREATE FUNCTION purge_mobile_ziwei_hourly_occurrences(integer,integer)
      RETURNS TABLE(deleted_id uuid) LANGUAGE sql
      AS $$ SELECT NULL::uuid WHERE false $$;
    INSERT INTO mobile_push_log(id,yam_key,kind,body,source_facts,delivery_status,next_retry_at,last_error) VALUES
      ('00000000-0000-4000-8000-000000000001','legacy-yam','yam',E'Yam core copy\\nLegacy Qimen direction','{"qimen":{"direction":"SE"},"branch":"巳"}','pending',now(),'old'),
      ('00000000-0000-4000-8000-000000000002','clean-yam','yam',E'Clean Yam\\nsecond line','{"branch":"午"}','pending',NULL,'clean-error'),
      ('00000000-0000-4000-8000-000000000003','other-kind','daily',E'Daily\\nLegacy Qimen direction','{"qimen":{"direction":"SE"}}','pending',now(),'daily-error');
    INSERT INTO mobile_push_attempts(push_log_id,installation_id,status,next_retry_at,lease_token,lease_expires_at,next_receipt_at,last_error) VALUES
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','reserved',now(),'lease-a',now()+interval '1 hour',NULL,'old'),
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','retry_due',now(),'lease-b',now()+interval '1 hour',NULL,'old'),
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','provider_accepted',NULL,NULL,NULL,now(),'old'),
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','delivered',NULL,NULL,NULL,NULL,'delivered'),
      ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','retry_due',now(),'clean-lease',now()+interval '1 hour',NULL,'clean'),
      ('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006','retry_due',now(),'daily-lease',now()+interval '1 hour',NULL,'daily');
    UPDATE mobile_push_attempts SET send_started_at=now()-interval '3 seconds',accepted_at=now()-interval '2 seconds',
      delivered_at=now()-interval '1 second',provider_ticket_id='legacy-delivered-ticket'
    WHERE installation_id='10000000-0000-4000-8000-000000000004';
  `);
  psql(database, `GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};`);
  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 2 });
  const cleanBefore = psql(database, `SELECT row_to_json(l)::text FROM mobile_push_log l WHERE yam_key='clean-yam';`);
  const cleanAttemptBefore = psql(database, `SELECT row_to_json(a)::text FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='clean-yam';`);
  psql(database, forward);
  const legacy = psql(database, `SELECT body||'|'||(source_facts ? 'qimen')||'|'||delivery_status||'|'||(next_retry_at IS NULL)||'|'||last_error||'|'||(attempts_retired_at IS NOT NULL) FROM mobile_push_log WHERE yam_key='legacy-yam';`);
  assert.equal(legacy, "Yam core copy|false|delivered|true|legacy_yam_qimen_cutover_retired|false");
  const retired = psql(database, `SELECT string_agg(status||':'||(lease_token IS NULL)::text||':'||(lease_expires_at IS NULL)::text||':'||(next_retry_at IS NULL)::text||':'||(next_receipt_at IS NULL)::text||':'||last_error,',' ORDER BY installation_id) FROM mobile_push_attempts WHERE push_log_id='00000000-0000-4000-8000-000000000001';`);
  assert.equal(retired, "dead:true:true:true:true:legacy_yam_qimen_cutover_retired,dead:true:true:true:true:legacy_yam_qimen_cutover_retired,dead:true:true:true:true:legacy_yam_qimen_cutover_retired,delivered:true:true:true:true:delivered");
  assert.equal(psql(database, `SELECT row_to_json(l)::text FROM mobile_push_log l WHERE yam_key='clean-yam';`), cleanBefore,
    "clean Yam rows must be byte-unchanged");
  assert.equal(psql(database, `SELECT row_to_json(a)::text FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='clean-yam';`), cleanAttemptBefore,
    "clean Yam attempts must be byte-unchanged");
  assert.equal(psql(database, `SELECT body||'|'||(source_facts ? 'qimen')||'|'||delivery_status FROM mobile_push_log WHERE yam_key='other-kind';`), "Daily\nLegacy Qimen direction|true|pending",
    "non-Yam rows remain out of scope");
  const observability = require("../src/lib/notification-observability.cjs");
  const reconciliationBeforeRetention = await observability.reconcile(pool);
  assert.equal(reconciliationBeforeRetention.ok, true,
    `contained legacy Yam children remain reconciled before normal retention: ${JSON.stringify(reconciliationBeforeRetention.counts)}`);
  psql(database, `UPDATE mobile_push_attempts SET updated_at=now()-interval '100 days',created_at=now()-interval '100 days'
    WHERE push_log_id='00000000-0000-4000-8000-000000000001';`);
  const retention = require("../src/lib/notification-retention.cjs");
  const retentionReport = await retention.runRetention(pool, {
    sourceFactsDays: 30, attemptDays: 90, engagementDays: 90, historyDays: 180, securityHistoryDays: 365,
    batchSize: 100, maxBatches: 2,
  });
  assert.equal(retentionReport.ok, true);
  assert.equal(retentionReport.attemptsPurged, 4, "normal retention, not cutover, retires contained child attempts");
  assert.equal(psql(database, `SELECT (attempts_retired_at IS NOT NULL)::text||'|'||(SELECT count(*) FROM mobile_push_attempts WHERE push_log_id=l.id) FROM mobile_push_log l WHERE yam_key='legacy-yam';`), "true|0",
    "retention records the retirement marker only after it removes the contained children");
  const reconciliationAfterRetention = await observability.reconcile(pool);
  assert.equal(reconciliationAfterRetention.ok, true,
    `normal retention leaves the contained legacy Yam parent healthy: ${JSON.stringify(reconciliationAfterRetention.counts)}`);
  const legacyAfterFirst = psql(database, `SELECT row_to_json(l)::text FROM mobile_push_log l WHERE yam_key='legacy-yam';`);
  psql(database, forward);
  assert.equal(psql(database, `SELECT row_to_json(l)::text FROM mobile_push_log l WHERE yam_key='legacy-yam';`), legacyAfterFirst,
    "rerunning the cutover is idempotent after the Qimen fact is removed");
  console.log("YAM_QIMEN_CUTOVER_MIGRATION_OK");
} finally {
  await pool?.end().catch(() => null);
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch {}
}
