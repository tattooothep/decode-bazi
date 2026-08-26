import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const retention = require("../src/lib/notification-retention.cjs");
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
    GRANT SELECT,UPDATE,DELETE ON mobile_ziwei_hourly_occurrences TO ${role};
  `);
  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 3 });
  const locker = await pool.connect();
  const worker = await pool.connect();
  try {
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
