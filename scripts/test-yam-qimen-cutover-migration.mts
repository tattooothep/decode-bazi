import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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
      attempts_retired_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE mobile_push_attempts(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), push_log_id uuid NOT NULL REFERENCES mobile_push_log(id) ON DELETE CASCADE,
      installation_id uuid NOT NULL, provider text NOT NULL DEFAULT 'expo', provider_message jsonb NOT NULL DEFAULT '{}'::jsonb,
      message_sha256 text NOT NULL DEFAULT repeat('a',64), status text NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved','provider_accepted','delivered','retry_due','dead')),
      send_count integer NOT NULL DEFAULT 0, next_retry_at timestamptz, lease_token text, lease_expires_at timestamptz,
      next_receipt_at timestamptz, last_error text, updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(push_log_id,installation_id)
    );
    INSERT INTO mobile_push_log(id,yam_key,kind,body,source_facts,delivery_status,next_retry_at,last_error) VALUES
      ('00000000-0000-4000-8000-000000000001','legacy-yam','yam',E'Yam core copy\\nLegacy Qimen direction','{"qimen":{"direction":"SE"},"branch":"巳"}','pending',now(),'old'),
      ('00000000-0000-4000-8000-000000000002','clean-yam','yam',E'Clean Yam\\nsecond line','{"branch":"午"}','accepted',NULL,'clean-error'),
      ('00000000-0000-4000-8000-000000000003','other-kind','daily',E'Daily\\nLegacy Qimen direction','{"qimen":{"direction":"SE"}}','pending',now(),'daily-error');
    INSERT INTO mobile_push_attempts(push_log_id,installation_id,status,next_retry_at,lease_token,lease_expires_at,next_receipt_at,last_error) VALUES
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','reserved',now(),'lease-a',now()+interval '1 hour',NULL,'old'),
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','retry_due',now(),'lease-b',now()+interval '1 hour',NULL,'old'),
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','provider_accepted',NULL,NULL,NULL,now(),'old'),
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','delivered',NULL,NULL,NULL,NULL,'delivered'),
      ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','retry_due',now(),'clean-lease',now()+interval '1 hour',NULL,'clean'),
      ('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006','retry_due',now(),'daily-lease',now()+interval '1 hour',NULL,'daily');
  `);
  const cleanBefore = psql(database, `SELECT row_to_json(l)::text FROM mobile_push_log l WHERE yam_key='clean-yam';`);
  const cleanAttemptBefore = psql(database, `SELECT row_to_json(a)::text FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='clean-yam';`);
  psql(database, forward);
  const legacy = psql(database, `SELECT body||'|'||(source_facts ? 'qimen')||'|'||delivery_status||'|'||(next_retry_at IS NULL)||'|'||last_error||'|'||(attempts_retired_at IS NOT NULL) FROM mobile_push_log WHERE yam_key='legacy-yam';`);
  assert.equal(legacy, "Yam core copy|false|failed|true|legacy_yam_qimen_cutover_retired|true");
  const retired = psql(database, `SELECT string_agg(status||':'||(lease_token IS NULL)::text||':'||(lease_expires_at IS NULL)::text||':'||(next_retry_at IS NULL)::text||':'||(next_receipt_at IS NULL)::text||':'||last_error,',' ORDER BY installation_id) FROM mobile_push_attempts WHERE push_log_id='00000000-0000-4000-8000-000000000001';`);
  assert.equal(retired, "dead:true:true:true:true:legacy_yam_qimen_cutover_retired,dead:true:true:true:true:legacy_yam_qimen_cutover_retired,dead:true:true:true:true:legacy_yam_qimen_cutover_retired,delivered:true:true:true:true:delivered");
  assert.equal(psql(database, `SELECT row_to_json(l)::text FROM mobile_push_log l WHERE yam_key='clean-yam';`), cleanBefore,
    "clean Yam rows must be byte-unchanged");
  assert.equal(psql(database, `SELECT row_to_json(a)::text FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='clean-yam';`), cleanAttemptBefore,
    "clean Yam attempts must be byte-unchanged");
  assert.equal(psql(database, `SELECT body||'|'||(source_facts ? 'qimen')||'|'||delivery_status FROM mobile_push_log WHERE yam_key='other-kind';`), "Daily\nLegacy Qimen direction|true|pending",
    "non-Yam rows remain out of scope");
  const legacyAfterFirst = psql(database, `SELECT row_to_json(l)::text FROM mobile_push_log l WHERE yam_key='legacy-yam';`);
  psql(database, forward);
  assert.equal(psql(database, `SELECT row_to_json(l)::text FROM mobile_push_log l WHERE yam_key='legacy-yam';`), legacyAfterFirst,
    "rerunning the cutover is idempotent after the Qimen fact is removed");
  console.log("YAM_QIMEN_CUTOVER_MIGRATION_OK");
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch {}
}
