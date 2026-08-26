import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import pg from "pg";

const require = createRequire(import.meta.url);
const retention = require("../src/lib/notification-retention.cjs");
const retentionMigration = readFileSync(new URL("../migrations/20260826_mobile_ziwei_occurrence_retention.sql", import.meta.url), "utf8");
const database = `ziwei_occurrence_retention_test_${process.pid}`;
const role = `ziwei_occurrence_retention_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
assert.match(database, /^ziwei_occurrence_retention_test_/u);
assert.match(role, /^ziwei_occurrence_retention_role_/u);

function psql(db: string, sql: string): string {
  return execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"], {
    encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

let pool: pg.Pool | undefined;
try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE TABLE mobile_ziwei_hourly_installations (
      user_id uuid NOT NULL,
      installation_id uuid NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      PRIMARY KEY(user_id,installation_id)
    );
    CREATE UNIQUE INDEX ux_mobile_ziwei_hourly_active_installation
      ON mobile_ziwei_hourly_installations(installation_id);
    CREATE TABLE mobile_ziwei_hourly_occurrences (
      id uuid PRIMARY KEY,
      state text NOT NULL CHECK (state IN ('claimed','reserved','skipped')),
      push_log_id uuid,
      snapshot jsonb NOT NULL,
      window_valid_until timestamptz NOT NULL,
      send_deadline timestamptz NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
    INSERT INTO mobile_ziwei_hourly_occurrences VALUES
      ('00000000-0000-4000-8000-000000000001','claimed',NULL,'{"private":"old-claimed"}',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days'),
      ('00000000-0000-4000-8000-000000000002','skipped',NULL,'{"private":"old-skipped"}',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days'),
      ('00000000-0000-4000-8000-000000000003','skipped',NULL,'{"private":"locked-old"}',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days'),
      ('00000000-0000-4000-8000-000000000004','reserved',NULL,'{"private":"reserved"}',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days'),
      ('00000000-0000-4000-8000-000000000005','reserved','10000000-0000-4000-8000-000000000005','{"private":"push-linked"}',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days'),
      ('00000000-0000-4000-8000-000000000006','claimed',NULL,'{"private":"live"}',now()+interval '1 hour',now()+interval '30 minutes',now()-interval '40 days',now()-interval '40 days'),
      ('00000000-0000-4000-8000-000000000007','skipped',NULL,'{"private":"recent"}',now()-interval '5 days',now()-interval '5 days',now()-interval '5 days',now()-interval '5 days');
    GRANT SELECT,UPDATE ON mobile_ziwei_hourly_occurrences TO ${role};
  `);
  psql(database, retentionMigration);
  psql(database, retentionMigration);
  assert.equal(psql(database, "SELECT has_table_privilege('hourkey_app','public.mobile_ziwei_hourly_occurrences','DELETE');"), "f",
    "the shared application role cannot bypass retention with direct occurrence DELETE");
  assert.equal(psql(database, "SELECT has_table_privilege('hourkey_app','public.mobile_ziwei_hourly_installations','DELETE');"), "f",
    "the shared application role cannot bypass retention through installation cascade");
  assert.match(psql(database, `
    SELECT pg_get_indexdef(indexrelid) FROM pg_index
     WHERE indexrelid='public.ux_mobile_ziwei_hourly_active_installation'::regclass;
  `), /WHERE \(enabled = true\)$/u,
  "the repair converts an earlier global identity index into an active-owner-only fence");
  assert.equal(psql(database, "SELECT to_regprocedure('public.purge_mobile_ziwei_hourly_occurrences(integer,integer)') IS NOT NULL;"), "t",
    "the migration installs the bounded occurrence purge boundary");
  assert.equal(psql(database, "SELECT has_function_privilege('hourkey_app','public.purge_mobile_ziwei_hourly_occurrences(integer,integer)','EXECUTE');"), "t",
    "the shared application role can invoke only the bounded purge function");
  assert.equal(psql(database, `SELECT has_function_privilege('${role}','public.purge_mobile_ziwei_hourly_occurrences(integer,integer)','EXECUTE');`), "f",
    "PUBLIC has no inherited execution path into the privileged purge boundary");
  assert.equal(psql(database, `
    SELECT pg_get_userbyid(p.proowner)<>'hourkey_app'
      FROM pg_proc p
     WHERE p.oid='public.purge_mobile_ziwei_hourly_occurrences(integer,integer)'::regprocedure;
  `), "t", "the shared application role does not own or redefine the definer function");
  psql(database, `GRANT EXECUTE ON FUNCTION public.purge_mobile_ziwei_hourly_occurrences(integer,integer) TO ${role};`);
  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 3 });
  const locker = await pool.connect();
  const worker = await pool.connect();
  try {
    await assert.rejects(
      worker.query("DELETE FROM mobile_ziwei_hourly_occurrences WHERE id='00000000-0000-4000-8000-000000000004'"),
      (error: any) => error?.code === "42501",
      "a retention caller cannot directly delete even an old reserved occurrence",
    );
    await assert.rejects(
      worker.query("SELECT * FROM public.purge_mobile_ziwei_hourly_occurrences(0,10)"),
      (error: any) => error?.code === "22023",
      "the definer boundary rejects a zero-day destructive window",
    );
    await assert.rejects(
      worker.query("SELECT * FROM public.purge_mobile_ziwei_hourly_occurrences(30,5001)"),
      (error: any) => error?.code === "22023",
      "the definer boundary rejects an oversized batch even when called outside the CLI",
    );
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM mobile_ziwei_hourly_occurrences WHERE id='00000000-0000-4000-8000-000000000003' FOR UPDATE");
    const first = await retention.purgeZiweiOccurrencesBatch(worker, retention.optionsFor({
      ziweiOccurrenceDays: 30, batchSize: 10, maxBatches: 1,
    }));
    assert.equal(first, 2, "SKIP LOCKED purges other eligible rows without waiting for a live owner");
    assert.equal((await worker.query("SELECT 1 FROM mobile_ziwei_hourly_occurrences WHERE id='00000000-0000-4000-8000-000000000003'")).rowCount, 1,
      "the concurrently locked occurrence survives this bounded batch");
    await locker.query("COMMIT");
    const second = await retention.purgeZiweiOccurrencesBatch(worker, retention.optionsFor({
      ziweiOccurrenceDays: 30, batchSize: 10, maxBatches: 1,
    }));
    assert.equal(second, 1, "the old unlocked skipped snapshot becomes eligible on a later batch");
  } finally {
    await locker.query("ROLLBACK").catch(() => null);
    locker.release();
    worker.release();
  }

  const survivors = (await pool.query("SELECT snapshot->>'private' AS name FROM mobile_ziwei_hourly_occurrences ORDER BY id")).rows.map((row) => row.name);
  assert.deepEqual(survivors, ["reserved", "push-linked", "live", "recent"],
    "retention preserves reserved, push-linked, still-live, and recent personal snapshots");
  console.log("ZIWEI_OCCURRENCE_RETENTION_OK");
} finally {
  await pool?.end().catch(() => null);
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch {}
}
