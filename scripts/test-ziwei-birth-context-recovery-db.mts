import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const database = `ziwei_birth_recovery_test_${process.pid}`;
assert.match(database, /^ziwei_birth_recovery_test_\d+$/u);

function psql(db: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"],
    { encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE profiles(
      id uuid PRIMARY KEY,
      created_by_user_id uuid REFERENCES users(id),
      birth_datetime timestamptz,
      birth_time_known boolean,
      birth_tz varchar(64),
      birth_tz_source varchar(32),
      birth_location_name text,
      gender text,
      relationship_type text,
      is_archived boolean DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE mobile_notification_prefs(
      user_id uuid PRIMARY KEY REFERENCES users(id),
      ziwei_hourly_enabled boolean NOT NULL DEFAULT false,
      ziwei_profile_id uuid,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE mobile_ziwei_hourly_installations(
      user_id uuid NOT NULL,
      installation_id uuid NOT NULL,
      profile_id uuid NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      next_due_at timestamptz,
      lease_token uuid,
      lease_expires_at timestamptz,
      last_skip_reason text,
      owner_generation bigint NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(user_id,installation_id)
    );
    CREATE TABLE mobile_ziwei_hourly_producer_state(
      singleton boolean PRIMARY KEY,
      producer_enabled boolean NOT NULL,
      source_digest text NOT NULL,
      backend_commit text,
      enabled_at timestamptz,
      enabled_by text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO mobile_ziwei_hourly_producer_state(singleton,producer_enabled,source_digest)
      VALUES(true,true,repeat('b',64));
    CREATE FUNCTION hourkey_birth_timezone_valid(text) RETURNS boolean
      LANGUAGE sql IMMUTABLE AS $$ SELECT $1 IN ('Asia/Bangkok','UTC','+07:00') $$;
    CREATE FUNCTION hourkey_ziwei_birth_wall_eligible(timestamptz,text) RETURNS boolean
      LANGUAGE sql IMMUTABLE AS $$ SELECT $1 IS NOT NULL AND hourkey_birth_timezone_valid($2) $$;
  `);

  const migration = readFileSync("migrations/20260827_ziwei_birth_context_recovery.sql", "utf8");
  psql(database, migration);
  psql(database, migration);
  assert.equal(psql(database, `SELECT hourkey_ziwei_birth_context_confirmed('user_confirmed_iana',now());`), "t");
  assert.equal(psql(database, `SELECT hourkey_ziwei_birth_context_confirmed('user_confirmed_exact_offset',now());`), "t");
  assert.equal(psql(database, `SELECT hourkey_ziwei_birth_context_confirmed('user_input',now());`), "f");
  assert.equal(psql(database, `SELECT count(*) FROM information_schema.columns
    WHERE table_name='mobile_ziwei_hourly_installations' AND column_name='birth_context_fingerprint';`), "1");
  assert.equal(
    psql(database, `SELECT producer_enabled||','||source_digest FROM mobile_ziwei_hourly_producer_state WHERE singleton=true;`),
    "false,b311fc6a4ff531c7b97ac80ae9d586c95008b929151b2b5115aabd0b49486b0a",
  );

  const userId = "00000000-0000-4000-8000-000000000001";
  const profileId = "00000000-0000-4000-8000-000000000002";
  const installationId = "00000000-0000-4000-8000-000000000003";
  psql(database, `
    INSERT INTO users(id) VALUES('${userId}');
    INSERT INTO profiles(
      id,created_by_user_id,birth_datetime,birth_time_known,birth_tz,birth_tz_source,
      gender,relationship_type,is_archived,birth_tz_confirmed_at
    ) VALUES(
      '${profileId}','${userId}','1984-01-02 03:04:00+07',true,'Asia/Bangkok',
      'user_confirmed_iana','M',NULL,false,now()
    );
    INSERT INTO mobile_notification_prefs(user_id,ziwei_hourly_enabled,ziwei_profile_id)
      VALUES('${userId}',true,'${profileId}');
    INSERT INTO mobile_ziwei_hourly_installations(
      user_id,installation_id,profile_id,enabled,next_due_at,owner_generation,birth_context_fingerprint
    ) VALUES(
      '${userId}','${installationId}','${profileId}',true,now(),1,repeat('a',64)
    );
    UPDATE profiles SET birth_tz_source='user_input',birth_tz_confirmed_at=NULL WHERE id='${profileId}';
  `);
  assert.equal(
    psql(database, `SELECT ziwei_hourly_enabled FROM mobile_notification_prefs WHERE user_id='${userId}';`),
    "f",
  );
  assert.equal(
    psql(database, `SELECT enabled||','||(next_due_at IS NULL)||','||owner_generation||','||(birth_context_fingerprint IS NULL)
      FROM mobile_ziwei_hourly_installations WHERE user_id='${userId}';`),
    "false,true,2,true",
  );

  psql(database, readFileSync("migrations/20260827_ziwei_birth_context_recovery.rollback.sql", "utf8"));
  assert.equal(psql(database, `SELECT to_regclass('profile_birth_context_recoveries') IS NULL;`), "t");
  console.log("PASS Ziwei birth-context recovery DB — rerunnable migration, provenance fence, rollback");
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`); } catch {}
}
