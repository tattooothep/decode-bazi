import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const database = `notification_integrity_test_${process.pid}`;
const forward = readFileSync("migrations/20260815_mobile_notification_integrity.sql", "utf8");
const rollback = readFileSync("migrations/20260815_mobile_notification_integrity.rollback.sql", "utf8");

function psql(db: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"],
    { encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

function expectSqlFailure(sql: string, message: string) {
  let failed = false;
  try {
    psql(database, sql);
  } catch {
    failed = true;
  }
  assert.equal(failed, true, message);
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database}; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users (id uuid PRIMARY KEY);
    CREATE TABLE mobile_push_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      installation_id uuid NOT NULL,
      CONSTRAINT mobile_push_tokens_user_id_installation_id_key UNIQUE(user_id, installation_id),
      expo_push_token text NOT NULL UNIQUE,
      device_push_token text,
      device_token_type text,
      platform text NOT NULL,
      app_version text,
      locale text,
      timezone text,
      enabled boolean NOT NULL DEFAULT true,
      fail_count integer NOT NULL DEFAULT 0,
      last_registered_at timestamptz,
      last_success_at timestamptz,
      disabled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE mobile_notification_prefs (user_id uuid PRIMARY KEY REFERENCES users(id));
    CREATE TABLE mobile_push_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      delivery_status text NOT NULL DEFAULT 'accepted'
        CHECK (delivery_status IN ('pending', 'accepted', 'failed'))
    );
    INSERT INTO users(id) VALUES
      ('00000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000002'),
      ('00000000-0000-4000-8000-000000000003'),
      ('00000000-0000-4000-8000-000000000004');
    INSERT INTO mobile_push_tokens
      (id,user_id,installation_id,expo_push_token,device_push_token,platform,last_registered_at,enabled)
    VALUES
      ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','ExponentPushToken[fixture-owner-a]','native-owner-a','android',now(),true),
      ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','ExponentPushToken[fixture-owner-b]','native-owner-b','android',now()-interval '1 minute',true),
      ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','ExponentPushToken[fixture-native-b]','native-owner-a','android',now()-interval '2 minutes',true);
  `);

  psql(database, forward);
  assert.equal(
    psql(database, `SELECT count(*) FROM mobile_push_tokens WHERE enabled=true AND (installation_id='20000000-0000-4000-8000-000000000001' OR device_push_token='native-owner-a');`),
    "1",
    "forward migration deterministically leaves exactly one active global owner",
  );
  expectSqlFailure(
    `INSERT INTO mobile_push_tokens(user_id,installation_id,expo_push_token,platform,enabled)
       VALUES('00000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','ExponentPushToken[fixture-conflict-install]','android',true);`,
    "active installation ownership must be enforced by PostgreSQL",
  );
  expectSqlFailure(
    `INSERT INTO mobile_push_tokens(user_id,installation_id,expo_push_token,device_push_token,platform,enabled)
       VALUES('00000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','ExponentPushToken[fixture-conflict-native]','native-owner-a','android',true);`,
    "active native-token ownership must be enforced by PostgreSQL",
  );
  psql(database, `INSERT INTO mobile_notification_prefs(user_id) VALUES('00000000-0000-4000-8000-000000000001');`);
  assert.equal(
    psql(database, `SELECT privacy_preview::text FROM mobile_notification_prefs WHERE user_id='00000000-0000-4000-8000-000000000001';`),
    "false",
    "privacy-preview defaults safely to false",
  );
  psql(database, `INSERT INTO mobile_push_tokens(user_id,installation_id,expo_push_token,platform,enabled)
    VALUES('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','ExponentPushToken[fixture-rotated-history]','android',false);`);
  assert.equal(
    psql(database, `SELECT count(*) FROM information_schema.table_constraints WHERE table_name='mobile_push_tokens' AND constraint_name='mobile_push_tokens_user_id_installation_id_key';`),
    "0",
    "migration replaces the legacy per-account installation constraint with the active-owner index",
  );

  psql(database, rollback);
  assert.equal(psql(database, `SELECT count(*) FROM information_schema.columns WHERE table_name='mobile_notification_prefs' AND column_name='privacy_preview';`), "0", "rollback removes only the new preference column");
  assert.equal(psql(database, `SELECT to_regclass('ux_mobile_push_tokens_active_installation') IS NULL;`), "t", "rollback removes active-installation index");
  assert.equal(psql(database, `SELECT count(*) FROM mobile_push_tokens;`), "4", "rollback preserves token audit history");
  assert.equal(
    psql(database, `SELECT count(*) FROM information_schema.table_constraints WHERE table_name='mobile_push_tokens' AND constraint_name='mobile_push_tokens_user_id_installation_id_key';`),
    "0",
    "rollback remains safe when audit history prevents restoring the legacy uniqueness constraint",
  );
  psql(database, rollback);
  assert.equal(psql(database, `SELECT count(*) FROM mobile_push_tokens;`), "4", "rollback remains rerunnable while preserving token audit history");

  psql(database, forward);
  assert.equal(psql(database, `SELECT to_regclass('ux_mobile_push_tokens_active_native') IS NOT NULL;`), "t", "forward migration reapplies after rollback");
  assert.equal(psql(database, `SELECT privacy_preview::text FROM mobile_notification_prefs WHERE user_id='00000000-0000-4000-8000-000000000001';`), "false", "reapplied migration preserves the safe preference default");
  console.log("NOTIFICATION_INTEGRITY_MIGRATION_OK");
} finally {
  try {
    psql("postgres", `DROP DATABASE IF EXISTS ${database};`);
  } catch {
    // Preserve the original failure; this disposable database is named uniquely.
  }
}
