import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const database = `notification_retention_test_${process.pid}`;
const role = `notification_retention_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
const integrity = readFileSync("migrations/20260815_mobile_notification_integrity.sql", "utf8");
const observability = readFileSync("migrations/20260816_mobile_notification_observability.sql", "utf8");

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
      ('30000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','old-parent-recent-attempt','daily','Recent delivery audit','Must survive until attempt expiry','{"kind":"daily"}','{"score":68}','delivered',now()-interval '200 days',now()-interval '200 days',now()-interval '200 days',1);
    INSERT INTO mobile_push_attempts(push_log_id,installation_id,provider,provider_message,message_sha256,status,transactional,accepted_at,delivered_at,next_retry_at,updated_at,created_at)
    SELECT id,gen_random_uuid(),'fcm','{"title":"provider-private"}',repeat('a',64),
           CASE WHEN yam_key='active-retry' THEN 'retry_due' ELSE 'delivered' END,
           kind IN ('security','service'),
           CASE WHEN yam_key='active-retry' THEN NULL ELSE updated_at END,
           CASE WHEN yam_key='active-retry' THEN NULL ELSE updated_at END,
           CASE WHEN yam_key='active-retry' THEN now()-interval '1 minute' ELSE NULL END,
           updated_at,updated_at
      FROM mobile_push_log;
    UPDATE mobile_push_attempts a SET provider='expo',status='provider_accepted',provider_ticket_id='checked-safe-ticket',
           provider_receipt_checked_at=a.updated_at,delivered_at=NULL
      FROM mobile_push_log l WHERE l.id=a.push_log_id AND l.yam_key='retain-security';
    UPDATE mobile_push_log SET delivery_status='accepted' WHERE yam_key='retain-security';
    UPDATE mobile_push_attempts a SET updated_at=now()-interval '5 days'
      FROM mobile_push_log l WHERE l.id=a.push_log_id AND l.yam_key='old-parent-recent-attempt';
  `);

  const retention = require("../src/lib/notification-retention.cjs");
  const report = await retention.runRetention(pool, {
    sourceFactsDays: 30, attemptDays: 30, historyDays: 180, securityHistoryDays: 365,
    batchSize: 100, maxBatches: 5,
  });
  assert.equal(report.ok, true, "bounded retention completes successfully");
  assert.deepEqual(Object.keys(report).sort(), ["attemptsPurged", "historyPurged", "ok", "sourceFactsRedacted", "status"], "retention reports aggregate counts and run status only");
  assert.equal(JSON.stringify(report).includes("private"), false, "retention output contains no user, payload, source-fact, or provider content");

  const retainedOld = (await pool.query(`SELECT title,body,payload,source_facts,source_facts_redacted_at IS NOT NULL AS redacted,attempts_retired_at IS NOT NULL AS retired FROM mobile_push_log WHERE yam_key='retain-old-daily'`)).rows[0];
  assert.deepEqual({ title: retainedOld.title, body: retainedOld.body }, { title: "Useful old history", body: "Open Today for details" }, "useful authenticated history remains available inside its retention window");
  assert.deepEqual(retainedOld.source_facts, {}, "old source facts are redacted before history expiry");
  assert.equal(retainedOld.payload.accountId, "private-account", "typed history payload remains available until the parent history expires");
  assert.equal(retainedOld.redacted, true);
  assert.equal(retainedOld.retired, true);
  assert.equal(Number((await pool.query(`SELECT count(*)::int AS n FROM mobile_push_attempts WHERE push_log_id='30000000-0000-4000-8000-000000000001'`)).rows[0].n), 0, "terminal provider attempt detail is purged after its shorter retention window");

  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_log WHERE yam_key='purge-daily'`)).rowCount, 0, "ordinary parent history expires at the bounded history window");
  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_log WHERE yam_key='retain-security'`)).rowCount, 1, "security history uses the longer required history window");
  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='retain-security'`)).rowCount, 0, "checked old Expo acceptance detail is terminal for retention and is purged");
  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_log WHERE yam_key='purge-security'`)).rowCount, 0, "security history is still bounded and eventually expires");
  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_log WHERE yam_key='old-parent-recent-attempt'`)).rowCount, 1, "an old parent is preserved until its recent terminal attempt finishes the shorter audit window");
  assert.equal((await pool.query(`SELECT source_facts FROM mobile_push_log WHERE yam_key='active-retry'`)).rows[0].source_facts.profileId, "active-private", "active retry source facts are never redacted mid-delivery");
  assert.equal((await pool.query(`SELECT 1 FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='active-retry'`)).rowCount, 1, "active retry attempts are never purged");
  console.log("NOTIFICATION_RETENTION_OK");
} finally {
  await pool?.end().catch(() => null);
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch {}
}
