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
            '20000000-0000-4000-8000-000000000001','ExponentPushToken[private-fixture-token]',NULL,'fcm','android',true),
           ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000002','ExponentPushToken[private-fcm-fixture-token]','fcm-private-fixture-token','fcm','android',true);
    INSERT INTO mobile_push_log(id,user_id,yam_key,kind,delivery_status,updated_at) VALUES
      ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','retry','daily','pending',now()-interval '2 hours'),
      ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','receipt','yam','accepted',now()-interval '2 hours'),
      ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','truth','goal','accepted',now()-interval '2 hours'),
      ('30000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','impossible','shrine','accepted',now()-interval '2 hours'),
      ('30000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','pending-stuck','daily','pending',now()-interval '2 hours'),
      ('30000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','old-retry','daily','pending',now()-interval '200 hours'),
      ('30000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','old-lease','daily','pending',now()-interval '200 hours'),
      ('30000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000001','old-receipt','daily','accepted',now()-interval '200 hours'),
      ('30000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001','old-truth','daily','accepted',now()-interval '200 hours'),
      ('30000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','old-impossible','daily','accepted',now()-interval '200 hours'),
      ('30000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','old-retry-null','daily','pending',now()-interval '200 hours'),
      ('30000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','old-permanent-lease','daily','pending',now()-interval '200 hours'),
      ('30000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','old-receipt-null-accepted','daily','accepted',now()-interval '200 hours'),
      ('30000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000001','old-delivered-null-times','daily','delivered',now()-interval '200 hours');
    INSERT INTO mobile_push_attempts
      (id,push_log_id,token_id,installation_id,provider,provider_message,message_sha256,status,next_retry_at,lease_token,lease_expires_at,created_at,updated_at,last_error)
    VALUES
      ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','fcm','{}',repeat('a',64),'retry_due',now()-interval '2 hours','stale-lease',now()-interval '2 hours',now()-interval '2 hours',now()-interval '2 hours','retryable'),
      ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('b',64),'provider_accepted',NULL,NULL,NULL,now()-interval '2 hours',now()-interval '2 hours',NULL),
      ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','fcm','{}',repeat('c',64),'dead',NULL,NULL,NULL,now()-interval '2 hours',now()-interval '2 hours','DeviceNotRegistered'),
      ('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('d',64),'provider_accepted',NULL,NULL,NULL,now()-interval '2 hours',now()-interval '2 hours',NULL),
      ('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('e',64),'reserved',now(),NULL,NULL,now()-interval '2 hours',now()-interval '2 hours',NULL),
      ('40000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('f',64),'retry_due',now()-interval '200 hours',NULL,NULL,now()-interval '200 hours',now()-interval '200 hours','retryable'),
      ('40000000-0000-4000-8000-000000000007','30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('1',64),'reserved',now(),NULL,now()-interval '200 hours',now()-interval '200 hours',now()-interval '200 hours',NULL),
      ('40000000-0000-4000-8000-000000000008','30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('2',64),'provider_accepted',NULL,NULL,NULL,now()-interval '200 hours',now()-interval '200 hours',NULL),
      ('40000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('3',64),'dead',NULL,NULL,NULL,now()-interval '200 hours',now()-interval '200 hours','dead'),
      ('40000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','fcm','{}',repeat('4',64),'provider_accepted',NULL,NULL,NULL,now()-interval '200 hours',now()-interval '200 hours',NULL),
      ('40000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('5',64),'retry_due',NULL,NULL,NULL,now()-interval '200 hours',now()-interval '200 hours','retryable'),
      ('40000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('6',64),'reserved',now(),'permanent-lease',NULL,now()-interval '200 hours',now()-interval '200 hours',NULL),
      ('40000000-0000-4000-8000-000000000013','30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('7',64),'provider_accepted',NULL,NULL,NULL,now()-interval '200 hours',now()-interval '200 hours',NULL),
      ('40000000-0000-4000-8000-000000000014','30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','expo','{}',repeat('8',64),'delivered',NULL,NULL,NULL,now()-interval '200 hours',now()-interval '200 hours',NULL);
    UPDATE mobile_push_attempts SET provider_ticket_id='ticket-safe', accepted_at=now()-interval '2 hours', next_receipt_at=now()-interval '2 hours'
      WHERE id='40000000-0000-4000-8000-000000000002';
    UPDATE mobile_push_attempts SET provider_ticket_id='old-ticket-safe', accepted_at=now()-interval '200 hours', next_receipt_at=now()-interval '200 hours'
      WHERE id='40000000-0000-4000-8000-000000000008';
    UPDATE mobile_push_attempts SET provider_ticket_id='old-impossible-ticket', accepted_at=now()-interval '200 hours'
      WHERE id='40000000-0000-4000-8000-000000000010';
    UPDATE mobile_push_attempts SET provider_ticket_id='old-missing-accepted-ticket', next_receipt_at=now()-interval '200 hours'
      WHERE id='40000000-0000-4000-8000-000000000013';
  `);

  const observability = require("../src/lib/notification-observability.cjs");
  const report = await observability.collectHealth(pool, {
    lookbackHours: 24,
    thresholds: { maxRetryBacklogCount: 0, maxRetryAgeSeconds: 1, maxStaleLeaseCount: 0, staleAttemptSeconds: 1, maxReceiptStalledCount: 0, receiptStallSeconds: 1, workerHeartbeatSeconds: 1 },
    heartbeat: { workerAt: new Date(Date.now() - 10_000).toISOString(), schedulerAt: new Date().toISOString() },
    providerReady: { fcm: false, expo: true },
  });
  assert.equal(report.ok, false, "health fails closed on overdue retry, stale lease, stalled receipt, readiness mismatch, and worker heartbeat loss");
  assert.equal(report.metrics.retry.overdueCount, 3, "retry_due attempts with NULL retry time are actionable and unhealthy beyond the historical metrics lookback");
  assert.equal(report.metrics.leases.staleCount, 4, "expired, unleased stuck, and permanent NULL-expiry leases remain unhealthy beyond the historical metrics lookback");
  assert.equal(report.metrics.receipts.stalledCount, 3, "Expo provider acceptance without accepted_at is stalled and unhealthy beyond the historical metrics lookback");
  assert.equal(report.metrics.readiness.mismatchCount, 2, "actively routed provider/token and credential readiness mismatches are counted without token output");
  assert.equal(report.metrics.worker.fresh, false, "stale worker heartbeat is visible and unhealthy");
  assert.equal(JSON.stringify(report).includes("private-fixture-token"), false, "health report never exposes a raw token");

  const reconciliation = await observability.reconcile(pool, { lookbackHours: 24 });
  assert.equal(reconciliation.ok, false, "reconciliation is unhealthy when any current invariant is violated");
  assert.equal(reconciliation.counts.parentTruthMismatch, 2, "reconciliation detects unresolved parent mismatch regardless of age");
  assert.equal(reconciliation.counts.impossibleState, 6, "reconciliation detects worker-semantic missing timestamps and impossible states regardless of age");
  assert.equal(reconciliation.counts.orphanReceipt, 0, "reconciliation reports a distinct aggregate for orphan receipt artifacts");
  assert.equal(JSON.stringify(reconciliation).includes("00000000-0000-4000-8000-000000000001"), false, "reconciliation is aggregate-only and never exposes user IDs");

  // Each worker has a different lease predicate. Exercise all nullable token /
  // expiry combinations against its current-schema state rather than assuming
  // a lease shape that the worker cannot actually recover.
  const leaseStates = [
    { label: "no-lease", leaseToken: null, expiry: "none" },
    { label: "orphan-expired", leaseToken: null, expiry: "past" },
    { label: "orphan-future", leaseToken: null, expiry: "future" },
    { label: "permanent", leaseToken: "present", expiry: "none" },
    { label: "expired", leaseToken: "present", expiry: "past" },
    { label: "active", leaseToken: "present", expiry: "future" },
  ] as const;
  const workerStates = [
    { name: "claim", status: "retry_due", deliveryStatus: "pending", sendStarted: false, provider: "expo" },
    { name: "recover", status: "retry_due", deliveryStatus: "pending", sendStarted: true, provider: "expo" },
    { name: "receipt", status: "provider_accepted", deliveryStatus: "accepted", sendStarted: false, provider: "expo" },
  ] as const;
  const matrixNow = Date.now();
  const past = new Date(matrixNow - 7_200_000).toISOString();
  const future = new Date(matrixNow + 7_200_000).toISOString();
  let nullTokenExpiredRecoveryId = "";
  for (const workerState of workerStates) {
    for (const leaseState of leaseStates) {
      const logId = crypto.randomUUID();
      const attemptId = crypto.randomUUID();
      const leaseExpiresAt = leaseState.expiry === "past" ? past : leaseState.expiry === "future" ? future : null;
      const leaseToken = leaseState.leaseToken === "present" ? `lease-${workerState.name}-${leaseState.label}` : null;
      await pool.query(
        `INSERT INTO mobile_push_log(id,user_id,yam_key,kind,delivery_status,updated_at)
         VALUES($1,$2,$3,'lease-matrix',$4,now())`,
        [logId, "00000000-0000-4000-8000-000000000001", `lease-matrix-${workerState.name}-${leaseState.label}`, workerState.deliveryStatus],
      );
      await pool.query(
        `INSERT INTO mobile_push_attempts
           (id,push_log_id,token_id,installation_id,provider,provider_message,message_sha256,status,
            provider_ticket_id,next_retry_at,next_receipt_at,accepted_at,send_started_at,lease_token,lease_expires_at,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,'{}',repeat('9',64),$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
        [attemptId, logId, "10000000-0000-4000-8000-000000000001", crypto.randomUUID(), workerState.provider,
          workerState.status, workerState.name === "receipt" ? `ticket-${leaseState.label}` : null,
          workerState.name === "receipt" ? null : past, workerState.name === "receipt" ? past : null,
          workerState.name === "receipt" ? past : null, workerState.sendStarted ? past : null, leaseToken, leaseExpiresAt, past],
      );
      if (workerState.name === "recover" && leaseState.label === "orphan-expired") nullTokenExpiredRecoveryId = attemptId;
    }
  }
  assert.notEqual(nullTokenExpiredRecoveryId, "", "matrix contains the null-token expired recovery fixture");
  const recoveryCandidate = await pool.query(
    `SELECT id FROM mobile_push_attempts
      WHERE id=$1 AND status IN ('reserved','retry_due') AND send_started_at IS NOT NULL AND lease_expires_at<=now()`,
    [nullTokenExpiredRecoveryId],
  );
  const recoveryCurrentMatch = await pool.query(
    `SELECT id FROM mobile_push_attempts
      WHERE id=$1 AND lease_token=$2 AND status IN ('reserved','retry_due') AND send_started_at IS NOT NULL AND lease_expires_at<=now()`,
    [nullTokenExpiredRecoveryId, null],
  );
  assert.equal(recoveryCandidate.rowCount, 1, "the null-token expired row is selected by recoverUncertainOne's candidate predicate");
  assert.equal(recoveryCurrentMatch.rowCount, 0, "the same row has no recoverUncertainOne current-row lease-token match");
  const delivery = require("../src/lib/mobile-notification-delivery.cjs");
  assert.equal(await delivery.recoverUncertainOne(pool, { attemptIds: [nullTokenExpiredRecoveryId] }), null, "worker recovery leaves the null-token candidate permanently stuck");

  const matrixHealth = await observability.collectHealth(pool, {
    lookbackHours: 24,
    thresholds: { maxRetryBacklogCount: 0, maxRetryAgeSeconds: 1, maxStaleLeaseCount: 0, staleAttemptSeconds: 1, maxReceiptStalledCount: 0, receiptStallSeconds: 1, workerHeartbeatSeconds: 1 },
    heartbeat: { workerAt: new Date(matrixNow - 10_000).toISOString(), schedulerAt: new Date(matrixNow).toISOString() },
    providerReady: { fcm: false, expo: true },
  });
  assert.equal(matrixHealth.metrics.retry.overdueCount - report.metrics.retry.overdueCount, 4, "claimOne's due retry lease matrix counts every reclaimable due retry but not active/permanent leases");
  assert.equal(matrixHealth.metrics.leases.staleCount - report.metrics.leases.staleCount, 9, "health counts expired/permanent leases and all unrecoverable null-token in-flight combinations");
  assert.equal(matrixHealth.metrics.receipts.stalledCount - report.metrics.receipts.stalledCount, 4, "receipt health counts only currently claimable stalled receipts and not an active future receipt lease");
  const matrixReconciliation = await observability.reconcile(pool);
  assert.equal(matrixReconciliation.counts.impossibleState - reconciliation.counts.impossibleState, 6, "reconciliation flags permanent leases and every null-token in-flight recovery combination without flagging recoverable/active leases");

  const terminalLeaseStates = leaseStates.filter((state) => state.label !== "no-lease");
  for (const status of ["dead", "delivered"] as const) {
    for (const leaseState of [...leaseStates]) {
      const logId = crypto.randomUUID();
      const leaseExpiresAt = leaseState.expiry === "past" ? past : leaseState.expiry === "future" ? future : null;
      const leaseToken = leaseState.leaseToken === "present" ? `terminal-${status}-${leaseState.label}` : null;
      await pool.query(
        `INSERT INTO mobile_push_log(id,user_id,yam_key,kind,delivery_status,updated_at)
         VALUES($1,$2,$3,'terminal-lease',$4,now())`,
        [logId, "00000000-0000-4000-8000-000000000001", `terminal-${status}-${leaseState.label}`, status === "dead" ? "failed" : "delivered"],
      );
      await pool.query(
        `INSERT INTO mobile_push_attempts
           (id,push_log_id,token_id,installation_id,provider,provider_message,message_sha256,status,
            accepted_at,delivered_at,send_started_at,lease_token,lease_expires_at,created_at,updated_at)
         VALUES($1,$2,$3,$4,'fcm','{}',repeat('8',64),$5,$6,$7,$6,$8,$9,$6,$6)`,
        [crypto.randomUUID(), logId, "10000000-0000-4000-8000-000000000001", crypto.randomUUID(), status,
          past, status === "delivered" ? past : null, leaseToken, leaseExpiresAt],
      );
    }
  }
  const terminalReconciliation = await observability.reconcile(pool);
  assert.equal(terminalReconciliation.counts.impossibleState - matrixReconciliation.counts.impossibleState, terminalLeaseStates.length * 2, "dead or delivered rows retaining either lease field are impossible while no-lease terminals remain valid");

  await pool.query(`UPDATE mobile_push_attempts SET status='dead',updated_at=now() WHERE id='40000000-0000-4000-8000-000000000001'`);
  const inventoryReadiness = await observability.collectHealth(pool, {
    lookbackHours: 24, heartbeat: { workerAt: new Date().toISOString() }, providerReady: { fcm: false, expo: true },
  });
  assert.equal(inventoryReadiness.metrics.readiness.credentialMismatchCount, 1, "provider credential readiness derives from enabled routable token inventory even without a current FCM attempt");

  const readOnlyCalls: string[] = [];
  const fakeDb = { async query(query: string) {
    readOnlyCalls.push(query);
    return { rows: query.includes("byCategoryProviderState") ? [] : [{}] };
  } };
  await observability.collectHealth(fakeDb, { heartbeat: { workerAt: new Date().toISOString() } });
  assert.equal(readOnlyCalls.some((query) => query.includes("BEGIN READ ONLY")), true, "health queries use a read-only transaction");
  assert.equal(readOnlyCalls.some((query) => query.includes("statement_timeout")), true, "health queries enforce a bounded database statement timeout");

  let activeQuery = false;
  const serialDb = { async query(query: string) {
    assert.equal(activeQuery, false, "health must not issue concurrent queries through one PostgreSQL client");
    activeQuery = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    activeQuery = false;
    return { rows: query.includes("SELECT l.kind") ? [] : [{}] };
  } };
  await observability.collectHealth(serialDb, { heartbeat: { workerAt: new Date().toISOString() } });

  console.log("NOTIFICATION_OBSERVABILITY_OK");
} finally {
  await pool?.end();
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch {}
}
