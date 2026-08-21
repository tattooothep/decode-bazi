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
const observabilityMigration = readFileSync("migrations/20260816_mobile_notification_observability.sql", "utf8");
const engagementMigration = readFileSync("migrations/20260816_mobile_notification_engagement.sql", "utf8");
const zibaiMigration = readFileSync("migrations/20260816_mobile_zibai_notifications.sql", "utf8");
const qimenMigration = readFileSync("migrations/20260821_mobile_qimen_three_layer.sql", "utf8");

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
  psql(database, observabilityMigration);
  psql(database, engagementMigration);
  psql(database, zibaiMigration);
  psql(database, qimenMigration);
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
    UPDATE mobile_push_attempts SET provider_ticket_id='ticket-safe', accepted_at=now()-interval '2 hours',
      send_started_at=now()-interval '2 hours'-interval '2 seconds',next_receipt_at=now()-interval '2 hours'
      WHERE id='40000000-0000-4000-8000-000000000002';
    UPDATE mobile_push_attempts SET provider_ticket_id='old-ticket-safe', accepted_at=now()-interval '200 hours',
      send_started_at=now()-interval '200 hours 1 second',next_receipt_at=now()-interval '200 hours'
      WHERE id='40000000-0000-4000-8000-000000000008';
    UPDATE mobile_push_attempts SET provider_ticket_id='old-impossible-ticket', accepted_at=now()-interval '200 hours'
      WHERE id='40000000-0000-4000-8000-000000000010';
    UPDATE mobile_push_attempts SET provider_ticket_id='old-missing-accepted-ticket', next_receipt_at=now()-interval '200 hours'
      WHERE id='40000000-0000-4000-8000-000000000013';
    UPDATE mobile_push_log SET delivery_model_generation=1;
    INSERT INTO mobile_notification_engagements(user_id,installation_id,push_log_id,event,action_id) VALUES
      ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','app_received',''),
      ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','opened',''),
      ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','action','mute');
    INSERT INTO mobile_push_log(id,user_id,yam_key,kind,delivery_status,updated_at,delivery_model_generation) VALUES
      ('30000000-0000-4000-8000-000000000018','00000000-0000-4000-8000-000000000001','latency-valid','latency-regression','accepted',now(),1),
      ('30000000-0000-4000-8000-000000000019','00000000-0000-4000-8000-000000000001','latency-stale','latency-regression','accepted',now(),1);
    INSERT INTO mobile_push_attempts
      (id,push_log_id,token_id,installation_id,provider,provider_message,message_sha256,status,
       provider_message_id,accepted_at,send_started_at,created_at,updated_at)
    VALUES
      ('40000000-0000-4000-8000-000000000018','30000000-0000-4000-8000-000000000018','10000000-0000-4000-8000-000000000002',
       '20000000-0000-4000-8000-000000000018','fcm','{}',repeat('a',64),'provider_accepted','latency-valid-message',now(),now()-interval '2 seconds',now(),now()),
      ('40000000-0000-4000-8000-000000000019','30000000-0000-4000-8000-000000000019','10000000-0000-4000-8000-000000000002',
       '20000000-0000-4000-8000-000000000019','fcm','{}',repeat('b',64),'provider_accepted','latency-stale-message',now()-interval '1 hour',now(),now(),now());
    INSERT INTO mobile_push_log(id,user_id,yam_key,kind,delivery_status,updated_at,delivery_model_generation) VALUES
      ('30000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000001','legacy-accepted-no-attempt','service','accepted',now()-interval '400 days',0),
      ('30000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000001','new-accepted-no-attempt','service','accepted',now()-interval '1 hour',1);
    INSERT INTO mobile_push_log(id,user_id,yam_key,kind,delivery_status,last_error,updated_at,delivery_model_generation)
    VALUES ('30000000-0000-4000-8000-000000000017','00000000-0000-4000-8000-000000000001','new-intentional-no-delivery','service','failed','no_deliverable_installation',now()-interval '1 hour',1);
    INSERT INTO mobile_zibai_installations
      (user_id,installation_id,daily_enabled,shichen_enabled,location_permission,latitude,longitude,location_timezone,
       location_captured_at,location_expires_at,next_daily_at,next_shichen_at,last_skip_reason,updated_at)
    VALUES ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',true,false,'foreground',13.75,100.5,'Asia/Bangkok',now()-interval '6 days',now()+interval '1 day',now()-interval '20 minutes',NULL,'engine_unavailable',now());
    INSERT INTO mobile_zibai_occurrences
      (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version,state,skip_reason)
    VALUES ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','observability-quiet','shichen',current_date,'si','zibai-zaoming-true-solar-v2','skipped','quiet_hours');
    INSERT INTO mobile_qimen_installations
      (user_id,installation_id,enabled,location_permission,latitude,longitude,location_timezone,
       location_captured_at,location_expires_at,next_due_at,last_skip_reason,updated_at)
    VALUES ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',true,'foreground',13.75,100.5,'Asia/Bangkok',
      now()-interval '6 days',now()+interval '1 day',now()-interval '20 minutes','QIMEN_SYNTHETIC_ENGINE_FAILURE',now());
    INSERT INTO mobile_qimen_occurrences
      (user_id,installation_id,occurrence_key,purpose,hour_valid_from,hour_valid_until,send_deadline,
       version_tuple,source_tuple,state,skip_reason)
    VALUES ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','observability-qimen-quiet','travel',
      now()-interval '1 hour',now()+interval '1 hour',now()-interval '55 minutes','{}','{}','skipped','quiet_hours');
    UPDATE mobile_qimen_producer_state SET producer_enabled=true,backend_commit=repeat('a',40),enabled_at=now(),enabled_by='observability-test';
  `);

  const observability = require("../src/lib/notification-observability.cjs");
  const schedulerNames = require("../src/lib/notification-science.cjs").SCHEDULER_NAMES as string[];
  const freshSchedulers = Object.fromEntries(schedulerNames.map((name) => [name, new Date().toISOString()]));
  const report = await observability.collectHealth(pool, {
    lookbackHours: 24,
    thresholds: { maxRetryBacklogCount: 0, maxRetryAgeSeconds: 1, maxStaleLeaseCount: 0, staleAttemptSeconds: 1, maxReceiptStalledCount: 0, receiptStallSeconds: 1, workerHeartbeatSeconds: 1, maxZibaiDueLagSeconds: 600, maxZibaiEngineFailureCount: 0, maxQimenDueLagSeconds: 600, maxQimenEngineFailureCount: 0 },
    heartbeat: { workerAt: new Date(Date.now() - 10_000).toISOString(), schedulers: freshSchedulers },
    providerReady: { fcm: false, expo: true },
  });
  assert.equal(report.ok, false, "health fails closed on overdue retry, stale lease, stalled receipt, readiness mismatch, and worker heartbeat loss");
  assert.equal(report.metrics.retry.overdueCount, 3, "retry_due attempts with NULL retry time are actionable and unhealthy beyond the historical metrics lookback");
  assert.equal(report.metrics.leases.staleCount, 4, "expired, unleased stuck, and permanent NULL-expiry leases remain unhealthy beyond the historical metrics lookback");
  assert.equal(report.metrics.receipts.stalledCount, 3, "Expo provider acceptance without accepted_at is stalled and unhealthy beyond the historical metrics lookback");
  assert.equal(report.metrics.readiness.mismatchCount, 2, "actively routed provider/token and credential readiness mismatches are counted without token output");
  assert.equal(report.metrics.worker.fresh, false, "stale worker heartbeat is visible and unhealthy");
  assert.equal(report.metrics.schedulers.every((entry: { fresh: boolean }) => entry.fresh), true, "all fresh scheduler heartbeats are individually healthy");
  assert.deepEqual(report.metrics.zibai, {
    overdueCount: 1, oldestLagSeconds: report.metrics.zibai.oldestLagSeconds,
    locationFreshCount: 1, locationStaleCount: 0, locationAbsentCount: 0, engineFailureCount: 1,
    dailyReservedCount: 0, shichenReservedCount: 0, skippedCount: 1, quietSkipCount: 1, duplicateOrCapCount: 0,
  }, "health exposes aggregate Zi Bai queue, freshness, skip, and occurrence metrics without coordinates");
  assert.ok(report.metrics.zibai.oldestLagSeconds >= 1_200);
  assert.equal(report.reasons.includes("zibai_due_lag"), true);
  assert.equal(report.reasons.includes("zibai_engine_failures"), true);
  assert.deepEqual(report.metrics.qimen, {
    producerEnabled: true, overdueCount: 1, oldestLagSeconds: report.metrics.qimen.oldestLagSeconds,
    locationFreshCount: 1, locationStaleCount: 0, locationAbsentCount: 0, engineFailureCount: 1,
    reservedCount: 0, skippedCount: 1, quietSkipCount: 1, duplicateCount: 0,
  }, "health exposes aggregate Qimen queue, location, engine, and occurrence truth without coordinates");
  assert.ok(report.metrics.qimen.oldestLagSeconds >= 1_200);
  assert.equal(report.reasons.includes("qimen_due_lag"), true);
  assert.equal(report.reasons.includes("qimen_engine_failures"), true);
  assert.deepEqual(report.metrics.engagement, {
    targetedCount: 2, appReceivedCount: 1, openedCount: 1, actionCount: 1,
    ackRate: 0.5, openRate: 0.5, actionRate: 0.5,
  }, "health exposes aggregate app acknowledgement/open/action rates with explicit honest denominators");
  const latency = report.metrics.byCategoryProviderState.find((entry: { category: string }) => entry.category === "latency-regression");
  assert.ok(latency.providerLatencyP50Ms >= 1_500 && latency.providerLatencyP50Ms <= 3_000,
    "provider latency excludes an impossible stale acceptance generation and preserves the valid send percentile");
  assert.equal(JSON.stringify(report).includes("private-fixture-token"), false, "health report never exposes a raw token");

  const partialSchedulers = { ...freshSchedulers };
  delete partialSchedulers.yam;
  partialSchedulers["daily-fortune"] = new Date(Date.now() - 10_000).toISOString();
  const schedulerReport = await observability.collectHealth(pool, {
    thresholds: { schedulerHeartbeatSeconds: 1 },
    heartbeat: { workerAt: new Date().toISOString(), schedulers: partialSchedulers },
    providerReady: { fcm: false, expo: true },
  });
  assert.equal(schedulerReport.reasons.includes("scheduler_heartbeat_missing:yam"), true, "a missing named scheduler heartbeat has an actionable reason");
  assert.equal(schedulerReport.reasons.includes("scheduler_heartbeat_stale:daily-fortune"), true, "a stale named scheduler heartbeat has an actionable reason");
  assert.equal(schedulerReport.metrics.schedulers.length, schedulerNames.length, "health reports every notification scheduler rather than one generic marker");
  const cadenceNow = new Date("2026-08-16T12:00:00.000Z");
  const cadenceSchedulers = Object.fromEntries(schedulerNames.map((name) => [name, cadenceNow.toISOString()]));
  cadenceSchedulers.yam = new Date(cadenceNow.valueOf() - 2 * 3_600_000).toISOString();
  cadenceSchedulers["monthly-report"] = new Date(cadenceNow.valueOf() - 10 * 86_400_000).toISOString();
  const cadenceReport = await observability.collectHealth(pool, {
    now: cadenceNow, heartbeat: { workerAt: cadenceNow.toISOString(), schedulers: cadenceSchedulers },
    providerReady: { fcm: false, expo: true },
  });
  assert.equal(cadenceReport.reasons.includes("scheduler_heartbeat_stale:yam"), true, "hourly Yam freshness becomes stale after two hours");
  assert.equal(cadenceReport.reasons.includes("scheduler_heartbeat_stale:monthly-report"), false, "monthly scheduler freshness follows its reviewed monthly cadence");

  const futureNow = new Date("2026-08-16T12:00:00.000Z");
  const futureSchedulers = Object.fromEntries(schedulerNames.map((name) => [name, futureNow.toISOString()]));
  futureSchedulers.yam = new Date("2027-08-16T12:00:00.000Z").toISOString();
  const futureReport = await observability.collectHealth(pool, {
    now: futureNow,
    thresholds: { heartbeatFutureSkewSeconds: 60 },
    heartbeat: { workerAt: new Date(futureNow.valueOf() + 365 * 86_400_000).toISOString(), schedulers: futureSchedulers },
    providerReady: { fcm: false, expo: true },
  });
  assert.equal(futureReport.reasons.includes("worker_heartbeat_future"), true, "a worker heartbeat one year in the future is unhealthy with a named reason");
  assert.equal(futureReport.reasons.includes("scheduler_heartbeat_future:yam"), true, "a scheduler heartbeat beyond the explicit small skew is unhealthy with its name");
  const toleratedSchedulers = Object.fromEntries(schedulerNames.map((name) => [name, futureNow.toISOString()]));
  toleratedSchedulers.yam = new Date(futureNow.valueOf() + 30_000).toISOString();
  const toleratedReport = await observability.collectHealth(pool, {
    now: futureNow,
    thresholds: { heartbeatFutureSkewSeconds: 60 },
    heartbeat: { workerAt: new Date(futureNow.valueOf() + 30_000).toISOString(), schedulers: toleratedSchedulers },
    providerReady: { fcm: false, expo: true },
  });
  assert.equal(toleratedReport.reasons.includes("worker_heartbeat_future"), false, "documented 60-second clock skew is tolerated");
  assert.equal(toleratedReport.reasons.includes("scheduler_heartbeat_future:yam"), false, "the same small scheduler clock skew is tolerated");

  const reconciliation = await observability.reconcile(pool, { lookbackHours: 24 });
  assert.equal(reconciliation.ok, false, "reconciliation is unhealthy when any current invariant is violated");
  assert.equal(reconciliation.counts.parentTruthMismatch, 2, "reconciliation detects unresolved parent mismatch regardless of age");
  assert.equal(reconciliation.counts.orphanFailedParent, 1, "only a generation-1 accepted parent without attempts is an unhealthy orphan");
  assert.equal(reconciliation.counts.legacyParentIgnored, 1, "a preserved pre-attempt accepted legacy parent is explicitly classified and ignored");
  assert.equal(reconciliation.counts.noDeliveryParentIgnored, 1, "an explicitly failed generation-1 no-deliverable parent is informational rather than a corrupt orphan");
  assert.equal(reconciliation.counts.impossibleState, 7, "reconciliation detects worker-semantic missing/order timestamps and impossible states regardless of age");
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
        `INSERT INTO mobile_push_log(id,user_id,yam_key,kind,delivery_status,updated_at,delivery_model_generation)
         VALUES($1,$2,$3,'lease-matrix',$4,now(),1)`,
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
    heartbeat: { workerAt: new Date(matrixNow - 10_000).toISOString(), schedulers: Object.fromEntries(schedulerNames.map((name) => [name, new Date(matrixNow).toISOString()])) },
    providerReady: { fcm: false, expo: true },
  });
  assert.equal(matrixHealth.metrics.retry.overdueCount - report.metrics.retry.overdueCount, 4, "claimOne's due retry lease matrix counts every reclaimable due retry but not active/permanent leases");
  assert.equal(matrixHealth.metrics.leases.staleCount - report.metrics.leases.staleCount, 9, "health counts expired/permanent leases and all unrecoverable null-token in-flight combinations");
  assert.equal(matrixHealth.metrics.receipts.stalledCount - report.metrics.receipts.stalledCount, 4, "receipt health counts only currently claimable stalled receipts and not an active future receipt lease");
  const matrixReconciliation = await observability.reconcile(pool);
  assert.equal(matrixReconciliation.counts.impossibleState - reconciliation.counts.impossibleState, 11,
    "reconciliation flags permanent leases, every null-token in-flight recovery combination, and provider acceptance without a send generation");

  const terminalLeaseStates = leaseStates.filter((state) => state.label !== "no-lease");
  for (const status of ["dead", "delivered"] as const) {
    for (const leaseState of [...leaseStates]) {
      const logId = crypto.randomUUID();
      const leaseExpiresAt = leaseState.expiry === "past" ? past : leaseState.expiry === "future" ? future : null;
      const leaseToken = leaseState.leaseToken === "present" ? `terminal-${status}-${leaseState.label}` : null;
      await pool.query(
        `INSERT INTO mobile_push_log(id,user_id,yam_key,kind,delivery_status,updated_at,delivery_model_generation)
         VALUES($1,$2,$3,'terminal-lease',$4,now(),1)`,
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
  await pool.query(
    `UPDATE mobile_push_attempts a SET provider_message_id='terminal-message-'||a.id::text
       FROM mobile_push_log l WHERE l.id=a.push_log_id AND l.kind='terminal-lease' AND a.status='delivered'`,
  );
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
