import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const database = `notification_observability_test_${process.pid}`;
const role = `notification_observability_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
const migration = readFileSync("migrations/20260815_mobile_notification_integrity.sql", "utf8");

assert.match(database, /^notification_observability_test_/u, "test database name must be disposable");
assert.match(role, /^notification_observability_role_/u, "test role name must be disposable");

function psql(db: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"],
    { encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

let pool: pg.Pool | undefined;

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users (id uuid PRIMARY KEY, timezone text DEFAULT 'Asia/Bangkok');
    CREATE TABLE mobile_push_tokens (
      id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), installation_id uuid NOT NULL,
      expo_push_token text NOT NULL UNIQUE, device_push_token text, device_token_type text,
      platform text NOT NULL, enabled boolean NOT NULL DEFAULT true, fail_count integer NOT NULL DEFAULT 0,
      last_registered_at timestamptz, last_success_at timestamptz, disabled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, installation_id)
    );
    CREATE TABLE mobile_notification_prefs (user_id uuid PRIMARY KEY REFERENCES users(id));
    CREATE TABLE mobile_push_log (
      id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), yam_key text NOT NULL, kind text NOT NULL,
      title text NOT NULL DEFAULT 'safe-title', body text NOT NULL DEFAULT 'safe-body', payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      sent_at timestamptz, read_at timestamptz, delivery_status text NOT NULL DEFAULT 'accepted'
        CHECK (delivery_status IN ('pending', 'accepted', 'failed')),
      attempt_count integer NOT NULL DEFAULT 0, next_retry_at timestamptz, accepted_at timestamptz,
      last_error text, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, yam_key)
    );
    INSERT INTO users(id) VALUES ('00000000-0000-4000-8000-000000000001');
  `);
  psql(database, migration);
  psql(database, `GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};`);

  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password });
  await pool.query(`
    INSERT INTO mobile_push_tokens(id,user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,enabled)
    VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001','ExponentPushToken[private-fixture-token]',NULL,'fcm','android',true);
    INSERT INTO mobile_push_log(id,user_id,yam_key,kind,delivery_status,updated_at) VALUES
      ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','retry','daily','pending',now()-interval '2 hours'),
      ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','receipt','yam','accepted',now()-interval '2 hours'),
      ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','truth','goal','accepted',now()-interval '2 hours'),
      ('30000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','impossible','shrine','accepted',now()-interval '2 hours'),
      ('30000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','pending-stuck','daily','pending',now()-interval '2 hours');
    INSERT INTO mobile_push_attempts
      (id,push_log_id,token_id,installation_id,provider,provider_message,message_sha256,status,next_retry_at,lease_token,lease_expires_at,created_at,updated_at,last_error)
    VALUES
      ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','fcm','{}',repeat('a',64),'retry_due',now()-interval '2 hours','stale-lease',now()-interval '2 hours',now()-interval '2 hours',now()-interval '2 hours','retryable'),
      ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('b',64),'provider_accepted',NULL,NULL,NULL,now()-interval '2 hours',now()-interval '2 hours',NULL),
      ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','fcm','{}',repeat('c',64),'dead',NULL,NULL,NULL,now()-interval '2 hours',now()-interval '2 hours','DeviceNotRegistered'),
      ('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('d',64),'provider_accepted',NULL,NULL,NULL,now()-interval '2 hours',now()-interval '2 hours',NULL),
      ('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('e',64),'reserved',now(),NULL,NULL,now()-interval '2 hours',now()-interval '2 hours',NULL);
    UPDATE mobile_push_attempts SET provider_ticket_id='ticket-safe', accepted_at=now()-interval '2 hours', next_receipt_at=now()-interval '2 hours'
      WHERE id='40000000-0000-4000-8000-000000000002';
  `);

  const observability = require("../src/lib/notification-observability.cjs");
  const report = await observability.collectHealth(pool, {
    lookbackHours: 24,
    thresholds: { maxRetryBacklogCount: 0, maxRetryAgeSeconds: 1, maxStaleLeaseCount: 0, staleAttemptSeconds: 1, maxReceiptStalledCount: 0, receiptStallSeconds: 1, workerHeartbeatSeconds: 1 },
    heartbeat: { workerAt: new Date(Date.now() - 10_000).toISOString(), schedulerAt: new Date().toISOString() },
    providerReady: { fcm: false, expo: true },
  });
  assert.equal(report.ok, false, "health fails closed on overdue retry, stale lease, stalled receipt, readiness mismatch, and worker heartbeat loss");
  assert.equal(report.metrics.retry.overdueCount, 1, "retry backlog is reported as an aggregate count");
  assert.equal(report.metrics.leases.staleCount, 2, "expired leases and unleased stuck pending attempts are both counted");
  assert.equal(report.metrics.receipts.stalledCount, 1, "unprocessed Expo receipt backlog is reported as an aggregate count");
  assert.equal(report.metrics.readiness.mismatchCount, 2, "actively routed provider/token and credential readiness mismatches are counted without token output");
  assert.equal(report.metrics.worker.fresh, false, "stale worker heartbeat is visible and unhealthy");
  assert.equal(JSON.stringify(report).includes("private-fixture-token"), false, "health report never exposes a raw token");

  const reconciliation = await observability.reconcile(pool, { lookbackHours: 24 });
  assert.equal(reconciliation.counts.parentTruthMismatch, 1, "reconciliation detects a parent status that disagrees with all child attempts");
  assert.equal(reconciliation.counts.impossibleState, 1, "reconciliation detects provider-accepted Expo attempts without receipt identifiers");
  assert.equal(JSON.stringify(reconciliation).includes("00000000-0000-4000-8000-000000000001"), false, "reconciliation is aggregate-only and never exposes user IDs");

  const readOnlyCalls: string[] = [];
  const fakeDb = { async query(query: string) {
    readOnlyCalls.push(query);
    return { rows: query.includes("byCategoryProviderState") ? [] : [{}] };
  } };
  await observability.collectHealth(fakeDb, { heartbeat: { workerAt: new Date().toISOString() } });
  assert.equal(readOnlyCalls.some((query) => query.includes("BEGIN READ ONLY")), true, "health queries use a read-only transaction");
  assert.equal(readOnlyCalls.some((query) => query.includes("statement_timeout")), true, "health queries enforce a bounded database statement timeout");

  console.log("NOTIFICATION_OBSERVABILITY_OK");
} finally {
  await pool?.end();
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch {}
}
