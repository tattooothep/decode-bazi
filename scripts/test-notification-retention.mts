import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import pg from "pg";
import { recordNotificationEngagement } from "../src/lib/mobile-notification-engagement.ts";

const require = createRequire(import.meta.url);
const database = `notification_retention_test_${process.pid}`;
const role = `notification_retention_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
const integrity = readFileSync("migrations/20260815_mobile_notification_integrity.sql", "utf8");
const observability = readFileSync("migrations/20260816_mobile_notification_observability.sql", "utf8");
const engagement = readFileSync("migrations/20260816_mobile_notification_engagement.sql", "utf8");

assert.match(database, /^notification_retention_test_/u, "retention test database is disposable");

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
    CREATE TABLE users(id uuid PRIMARY KEY,timezone text,locale text);
    CREATE TABLE mobile_notification_prefs(user_id uuid PRIMARY KEY REFERENCES users(id));
    CREATE TABLE mobile_ziwei_hourly_occurrences(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),state text NOT NULL,push_log_id uuid,
      snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,window_valid_until timestamptz NOT NULL DEFAULT now(),
      send_deadline timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE mobile_push_tokens(
      id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),installation_id uuid NOT NULL,
      expo_push_token text NOT NULL UNIQUE,device_push_token text,device_token_type text,platform text NOT NULL,
      enabled boolean NOT NULL DEFAULT true,fail_count int NOT NULL DEFAULT 0,last_registered_at timestamptz,
      last_success_at timestamptz,disabled_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id,installation_id)
    );
    CREATE TABLE mobile_push_log(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),yam_key text NOT NULL,kind text NOT NULL,
      title text NOT NULL,body text NOT NULL,payload jsonb NOT NULL DEFAULT '{}'::jsonb,sent_at timestamptz,read_at timestamptz,
      delivery_status text NOT NULL DEFAULT 'accepted' CHECK(delivery_status IN('pending','accepted','failed')),
      attempt_count int NOT NULL DEFAULT 0,next_retry_at timestamptz,accepted_at timestamptz,last_error text,updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id,yam_key)
    );
    INSERT INTO users VALUES('00000000-0000-4000-8000-000000000001','Asia/Bangkok','en');
  `);
  psql(database, integrity);
  psql(database, observability);
  psql(database, engagement);
  psql(database, `GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};`);
  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 2 });

  await pool.query(`
    INSERT INTO mobile_push_log(id,user_id,yam_key,kind,title,body,payload,source_facts,delivery_status,sent_at,accepted_at,updated_at,delivery_model_generation)
    VALUES
      ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','retain-old-daily','daily','Useful old history','Open Today for details','{"kind":"daily","accountId":"private-account"}','{"profileId":"private-profile"}','delivered',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days',1),
      ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','retain-recent','daily','Useful recent history','Open Today for details','{"kind":"daily"}','{"score":72}','delivered',now()-interval '5 days',now()-interval '5 days',now()-interval '5 days',1),
      ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','purge-daily','daily','Expired daily history','Old detail','{"kind":"daily"}','{"profileId":"private-old"}','delivered',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days',1),
      ('30000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','retain-security','security','Security history','Review Account','{"kind":"security"}','{"event":"login"}','delivered',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days',1),
      ('30000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','purge-security','security','Expired security history','Old detail','{"kind":"security"}','{"event":"old-login"}','delivered',now()-interval '400 days',now()-interval '400 days',now()-interval '400 days',1),
      ('30000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','active-retry','daily','Active retry history','Must survive','{"kind":"daily"}','{"profileId":"active-private"}','pending',NULL,NULL,now()-interval '400 days',1),
      ('30000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','old-parent-recent-attempt','daily','Recent delivery audit','Must survive until attempt expiry','{"kind":"daily"}','{"score":68}','delivered',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days',1),
      ('30000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000001','corrupt-terminal-lease','daily','Corrupt lease evidence','Must survive','{"kind":"daily"}','{"case":"lease"}','delivered',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days',1),
      ('30000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001','corrupt-delivered-time','daily','Corrupt timestamp evidence','Must survive','{"kind":"daily"}','{"case":"timestamp"}','delivered',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days',1),
      ('30000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','corrupt-expo-id','daily','Corrupt Expo evidence','Must survive','{"kind":"daily"}','{"case":"expo-id"}','accepted',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days',1),
      ('30000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','corrupt-fcm-id','daily','Corrupt FCM evidence','Must survive','{"kind":"daily"}','{"case":"fcm-id"}','accepted',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days',1),
      ('30000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','corrupt-parent-status','daily','Corrupt parent evidence','Must survive','{"kind":"daily"}','{"case":"parent-status"}','failed',NULL,NULL,now()-interval '200 days',1),
      ('30000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','corrupt-attempt-count','daily','Corrupt count evidence','Must survive','{"kind":"daily"}','{"case":"attempt-count"}','delivered',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days',1),
      ('30000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000001','corrupt-time-order','daily','Corrupt time order','Must survive','{"kind":"daily"}','{"case":"time-order"}','accepted',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days',1);
    INSERT INTO mobile_push_attempts(push_log_id,installation_id,provider,provider_message,message_sha256,status,transactional,accepted_at,delivered_at,send_started_at,next_retry_at,updated_at,created_at)
    SELECT id,gen_random_uuid(),'fcm','{"title":"provider-private"}',repeat('a',64),
           CASE WHEN yam_key='active-retry' THEN 'retry_due' ELSE 'delivered' END,
           kind IN ('security','service'),
           CASE WHEN yam_key='active-retry' THEN NULL ELSE updated_at END,
           CASE WHEN yam_key='active-retry' THEN NULL ELSE updated_at END,
           CASE WHEN yam_key='active-retry' THEN NULL ELSE updated_at-interval '1 second' END,
           CASE WHEN yam_key='active-retry' THEN now()-interval '1 minute' ELSE NULL END,
           updated_at,updated_at
      FROM mobile_push_log;
    INSERT INTO mobile_push_tokens(id,user_id,installation_id,expo_push_token,platform,enabled)
      VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
             '90000000-0000-4000-8000-000000000001','ExponentPushToken[retention-owned-device]','ios',true);
    UPDATE mobile_push_attempts a SET installation_id='90000000-0000-4000-8000-000000000001'
      FROM mobile_push_log l WHERE l.id=a.push_log_id AND l.yam_key='retain-old-daily';
    UPDATE mobile_push_attempts a SET provider='expo',status='provider_accepted',provider_ticket_id='checked-safe-ticket',
           provider_receipt_checked_at=a.updated_at,delivered_at=NULL
      FROM mobile_push_log l WHERE l.id=a.push_log_id AND l.yam_key='retain-security';
    UPDATE mobile_push_log SET delivery_status='accepted' WHERE yam_key='retain-security';
    UPDATE mobile_push_attempts a SET provider_message_id='message-'||a.id::text
      FROM mobile_push_log l WHERE l.id=a.push_log_id AND a.provider='fcm' AND l.yam_key<>'active-retry';
    UPDATE mobile_push_attempts a SET updated_at=now()-interval '5 days'
      FROM mobile_push_log l WHERE l.id=a.push_log_id AND l.yam_key='old-parent-recent-attempt';
    UPDATE mobile_push_attempts a SET lease_token='corrupt-lease',lease_expires_at=now()+interval '1 day'
      FROM mobile_push_log l WHERE l.id=a.push_log_id AND l.yam_key='corrupt-terminal-lease';
    UPDATE mobile_push_attempts a SET delivered_at=NULL
      FROM mobile_push_log l WHERE l.id=a.push_log_id AND l.yam_key='corrupt-delivered-time';
    UPDATE mobile_push_attempts a SET provider='expo',status='provider_accepted',provider_message_id=NULL,
           provider_ticket_id=NULL,provider_receipt_checked_at=a.updated_at,delivered_at=NULL
      FROM mobile_push_log l WHERE l.id=a.push_log_id AND l.yam_key='corrupt-expo-id';
    UPDATE mobile_push_attempts a SET status='provider_accepted',provider_message_id=NULL,delivered_at=NULL
      FROM mobile_push_log l WHERE l.id=a.push_log_id AND l.yam_key='corrupt-fcm-id';
    UPDATE mobile_push_log SET attempt_count=99 WHERE yam_key='corrupt-attempt-count';
    UPDATE mobile_push_attempts a SET status='provider_accepted',delivered_at=NULL,
           accepted_at=a.updated_at-interval '2 seconds',send_started_at=a.updated_at,
           provider_message_id='stale-generation-message'
      FROM mobile_push_log l WHERE l.id=a.push_log_id AND l.yam_key='corrupt-time-order';
    UPDATE mobile_push_log SET delivery_status='accepted' WHERE yam_key='corrupt-time-order';
    INSERT INTO mobile_notification_engagements(user_id,installation_id,push_log_id,event,recorded_at) VALUES
      ('00000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','opened',now()-interval '100 days'),
      ('00000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','opened',now()-interval '5 days');
  `);

  const retention = require("../src/lib/notification-retention.cjs");
  const report = await retention.runRetention(pool, {
    sourceFactsDays: 30, attemptDays: 90, engagementDays: 90, historyDays: 180, securityHistoryDays: 365,
    batchSize: 100, maxBatches: 5,
  });
  assert.equal(report.ok, true, "bounded retention completes successfully");
  assert.deepEqual(Object.keys(report).sort(), ["attemptsPurged", "engagementPurged", "historyPurged", "ok", "sourceFactsRedacted", "status", "ziweiOccurrencesPurged"], "retention reports aggregate counts and run status only");
  assert.equal(report.ziweiOccurrencesPurged, 0, "a database without eligible old Ziwei snapshots reports an aggregate zero");
  assert.equal(report.engagementPurged, 1, "old app engagement evidence expires on its explicit shorter retention window");
  assert.equal(Number((await pool.query(`SELECT count(*)::int AS n FROM mobile_notification_engagements`)).rows[0].n), 1, "recent aggregate engagement evidence remains available");
  assert.equal(JSON.stringify(report).includes("private"), false, "retention output contains no user, payload, source-fact, or provider content");

  const retainedOld = (await pool.query(`SELECT title,body,payload,source_facts,source_facts_redacted_at IS NOT NULL AS redacted,attempts_retired_at IS NOT NULL AS retired FROM mobile_push_log WHERE yam_key='retain-old-daily'`)).rows[0];
  assert.deepEqual({ title: retainedOld.title, body: retainedOld.body }, { title: "Useful old history", body: "Open Today for details" }, "useful authenticated history remains available inside its retention window");
  assert.deepEqual(retainedOld.source_facts, {}, "old source facts are redacted before history expiry");
  assert.equal(retainedOld.payload.accountId, "private-account", "typed history payload remains available until the parent history expires");
  assert.equal(retainedOld.redacted, true);
  assert.equal(retainedOld.retired, false);
  assert.equal(Number((await pool.query(`SELECT count(*)::int AS n FROM mobile_push_attempts WHERE push_log_id='30000000-0000-4000-8000-000000000001'`)).rows[0].n), 1, "installation ownership survives for the full 90-day engagement acceptance window");
  assert.equal(await recordNotificationEngagement(pool, '00000000-0000-4000-8000-000000000001', {
    notificationId: '30000000-0000-4000-8000-000000000001',
    installationId: '90000000-0000-4000-8000-000000000001',
    event: 'opened', actionId: '',
  }), 'recorded', "an owned first open at day 40 remains authenticated and recordable");
  assert.equal(await recordNotificationEngagement(pool, '00000000-0000-4000-8000-000000000099', {
    notificationId: '30000000-0000-4000-8000-000000000001',
    installationId: '90000000-0000-4000-8000-000000000001',
    event: 'opened', actionId: '',
  }), 'not_found', "cross-account engagement remains hidden and rejected");

  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_log WHERE yam_key='purge-daily'`)).rowCount, 0, "ordinary parent history expires at the bounded history window");
  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_log WHERE yam_key='retain-security'`)).rowCount, 1, "security history uses the longer required history window");
  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='retain-security'`)).rowCount, 0, "checked old Expo acceptance detail expires after the 90-day engagement acceptance window");
  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_log WHERE yam_key='purge-security'`)).rowCount, 0, "security history is still bounded and eventually expires");
  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_log WHERE yam_key='old-parent-recent-attempt'`)).rowCount, 1, "an old parent is preserved until its recent terminal attempt finishes the shorter audit window");
  assert.equal((await pool.query(`SELECT source_facts FROM mobile_push_log WHERE yam_key='active-retry'`)).rows[0].source_facts.profileId, "active-private", "active retry source facts are never redacted mid-delivery");
  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='active-retry'`)).rowCount, 1, "active retry attempts are never purged");
  const corruptKeys = [
    "corrupt-terminal-lease", "corrupt-delivered-time", "corrupt-expo-id",
    "corrupt-fcm-id", "corrupt-parent-status", "corrupt-attempt-count", "corrupt-time-order",
  ];
  const corruptRows = await pool.query(
    `SELECT l.yam_key,l.attempts_retired_at,a.id AS attempt_id
       FROM mobile_push_log l LEFT JOIN mobile_push_attempts a ON a.push_log_id=l.id
      WHERE l.yam_key=ANY($1::text[]) ORDER BY l.yam_key`,
    [corruptKeys],
  );
  assert.equal(corruptRows.rowCount, corruptKeys.length, "corrupt or parent-mismatched old rows survive both attempt and history retention");
  assert.equal(corruptRows.rows.every((row) => row.attempt_id && row.attempts_retired_at === null), true, "corrupt evidence keeps its child attempt and never receives attempts_retired_at");
  const reconciliation = await require("../src/lib/notification-observability.cjs").reconcile(pool);
  assert.equal(reconciliation.ok, false, "retention cannot turn corrupt durable state into a healthy reconciliation result by deleting evidence");
  assert.equal(reconciliation.counts.impossibleState >= 5, true, "terminal lease, missing/order timestamps, and provider-ID corruption remains visible");
  assert.equal(reconciliation.counts.parentTruthMismatch >= 1, true, "parent delivery-status corruption remains visible");
  assert.equal(reconciliation.counts.parentAttemptCountMismatch >= 1, true, "parent attempt-count corruption remains visible");
  console.log("NOTIFICATION_RETENTION_OK");
} finally {
  await pool?.end().catch(() => null);
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch {}
}
