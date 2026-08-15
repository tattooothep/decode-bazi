import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import { recordNotificationEngagement } from "../src/lib/mobile-notification-engagement.ts";

const database = `notification_engagement_test_${process.pid}`;
const role = `notification_engagement_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
const migration = readFileSync("migrations/20260816_mobile_notification_engagement.sql", "utf8");
const rollback = readFileSync("migrations/20260816_mobile_notification_engagement.rollback.sql", "utf8");
const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const notificationId = "30000000-0000-4000-8000-000000000001";
const installationId = "20000000-0000-4000-8000-000000000001";

assert.match(database, /^notification_engagement_test_/u, "engagement test database is disposable");

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
    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE mobile_push_log(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),kind text NOT NULL);
    CREATE TABLE mobile_push_attempts(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),push_log_id uuid NOT NULL REFERENCES mobile_push_log(id) ON DELETE CASCADE,
      installation_id uuid NOT NULL,status text NOT NULL DEFAULT 'provider_accepted',accepted_at timestamptz DEFAULT now(),
      send_started_at timestamptz DEFAULT now(),UNIQUE(push_log_id,installation_id)
    );
    CREATE TABLE mobile_push_tokens(user_id uuid NOT NULL REFERENCES users(id),installation_id uuid NOT NULL,enabled boolean NOT NULL DEFAULT true);
    INSERT INTO users(id) VALUES('${userA}'),('${userB}');
    INSERT INTO mobile_push_log(id,user_id,kind) VALUES('${notificationId}','${userA}','daily');
    INSERT INTO mobile_push_attempts(push_log_id,installation_id) VALUES('${notificationId}','${installationId}');
    INSERT INTO mobile_push_tokens(user_id,installation_id) VALUES('${userA}','${installationId}');
  `);
  psql(database, migration);
  assert.equal(psql(database, `SELECT to_regclass('ix_mobile_push_attempts_engagement_cohort') IS NOT NULL;`), "t", "health cohort has an indexed acceptance-time path");
  psql(database, `GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};`);
  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 3 });

  assert.equal(await recordNotificationEngagement(pool, userA, { notificationId, installationId, event: "app_received", actionId: "" }), "recorded");
  assert.equal(await recordNotificationEngagement(pool, userA, { notificationId, installationId, event: "app_received", actionId: "" }), "duplicate");
  assert.equal(await recordNotificationEngagement(pool, userA, { notificationId, installationId, event: "opened", actionId: "" }), "recorded");
  assert.equal(await recordNotificationEngagement(pool, userA, { notificationId, installationId, event: "action", actionId: "mute" }), "recorded");
  assert.equal(await recordNotificationEngagement(pool, userB, { notificationId, installationId, event: "opened", actionId: "" }), "not_found", "cross-account event cannot observe or mutate the notification");
  assert.equal(await recordNotificationEngagement(pool, userA, { notificationId, installationId: crypto.randomUUID(), event: "opened", actionId: "" }), "not_found", "an untargeted installation cannot claim engagement");
  psql(database, `UPDATE mobile_push_tokens SET user_id='${userB}' WHERE installation_id='${installationId}';`);
  assert.equal(
    await recordNotificationEngagement(pool, userA, { notificationId, installationId, event: "action", actionId: "open_detail" }),
    "not_found",
    "a transferred installation cannot report engagement for its former account",
  );
  assert.equal(psql(database, `SELECT count(*) FROM mobile_notification_engagements;`), "3", "only unique owned engagement evidence is retained");

  psql(database, rollback);
  assert.equal(psql(database, `SELECT to_regclass('mobile_notification_engagements') IS NULL;`), "t", "rollback removes engagement evidence schema");
  assert.equal(psql(database, `SELECT to_regclass('ix_mobile_push_attempts_engagement_cohort') IS NULL;`), "t", "rollback removes the engagement cohort index");
  psql(database, migration);
  psql(database, migration);
  assert.equal(psql(database, `SELECT to_regclass('mobile_notification_engagements') IS NOT NULL;`), "t", "forward migration is reapply-safe");
  console.log("NOTIFICATION_ENGAGEMENT_OK");
} finally {
  await pool?.end();
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch {}
}
