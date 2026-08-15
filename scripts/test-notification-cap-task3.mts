import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const database = `notification_integrity_cap_test_${process.pid}`;
const role = `notification_integrity_cap_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
assert.match(database, /^notification_integrity_cap_test_/u);

function psql(db: string, sql: string) {
  execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db], {
    encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"],
  });
}

let pool: pg.Pool | null = null;
const userId = "00000000-0000-4000-8000-000000000099";
try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users (id uuid PRIMARY KEY, timezone text);
    CREATE TABLE mobile_notification_prefs (
      user_id uuid PRIMARY KEY REFERENCES users(id), timezone text, max_per_day int,
      privacy_preview boolean NOT NULL DEFAULT false, locale text NOT NULL DEFAULT 'th'
    );
    CREATE TABLE mobile_push_tokens (
      id uuid PRIMARY KEY, user_id uuid, installation_id uuid, device_push_token text,
      device_token_type text, expo_push_token text, platform text, enabled boolean
    );
    CREATE TABLE mobile_push_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
      yam_key text NOT NULL, kind text NOT NULL, title text NOT NULL, body text NOT NULL,
      payload jsonb NOT NULL, source_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
      delivery_status text NOT NULL, attempt_count int NOT NULL, next_retry_at timestamptz,
      accepted_at timestamptz, sent_at timestamptz, last_error text, updated_at timestamptz NOT NULL,
      UNIQUE(user_id,yam_key)
    );
    CREATE TABLE mobile_push_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), push_log_id uuid, token_id uuid,
      installation_id uuid, provider text, provider_message jsonb, message_sha256 text,
      privacy_safe boolean NOT NULL DEFAULT false, transactional boolean NOT NULL DEFAULT false,
      status text, next_retry_at timestamptz, updated_at timestamptz,
      UNIQUE(push_log_id,installation_id)
    );
    INSERT INTO users VALUES ('${userId}','America/New_York');
    INSERT INTO mobile_notification_prefs VALUES ('${userId}','America/New_York',1,false,'en');
    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};
  `);
  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 8 });
  const notice = (key: string) => ({
    userId, key, kind: "daily", title: "history", body: "full facts",
    payload: { v: 1, kind: "daily", accountId: userId, slot: "morning", date: "2026-08-15", url: "/today" },
    messages: [],
  });
  await assert.rejects(
    delivery.reserve(pool, { ...notice("credential-rejected"), sourceFacts: { nested: { api_key: "must-not-store" } } }),
    /forbidden credential key/u,
  );
  assert.equal(
    Number((await pool.query(`SELECT count(*)::int AS n FROM mobile_push_log WHERE yam_key='credential-rejected'`)).rows[0].n),
    0,
    "actual reservation rejects normalized credential keys before storing parent history",
  );
  const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) => delivery.reserve(pool, notice(`atomic-${index}`))));
  assert.equal(concurrent.filter(Boolean).length, 1, "concurrent cap reservations must admit exactly one logical notification");

  await pool.query(`DELETE FROM mobile_push_log WHERE user_id=$1`, [userId]);
  await pool.query(
    `INSERT INTO mobile_push_log(user_id,yam_key,kind,title,body,payload,delivery_status,attempt_count,accepted_at,sent_at,updated_at)
     VALUES($1,'previous-local-day','daily','old','old','{}','accepted',1,
       (date_trunc('day',now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York')-interval '1 minute',
       (date_trunc('day',now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York')-interval '1 minute',now())`,
    [userId],
  );
  const afterBoundary = await delivery.reserve(pool, notice("new-local-day"));
  assert.ok(afterBoundary, "a prior local-calendar-day row must not consume today's cap even inside rolling 24h");

  await pool.query(`DELETE FROM mobile_push_log WHERE user_id=$1`, [userId]);
  const tokenId = "10000000-0000-4000-8000-000000000099";
  await pool.query(
    `INSERT INTO mobile_push_tokens VALUES($1,$2,'20000000-0000-4000-8000-000000000099',NULL,NULL,'ExponentPushToken[synthetic-cap-test]','android',true)`,
    [tokenId, userId],
  );
  const privateNotice = notice("private-preview");
  privateNotice.title = "ประวัติภาษาไทย";
  privateNotice.body = "รายละเอียดภาษาไทย";
  privateNotice.historyCopies = {
    th: { title: privateNotice.title, body: privateNotice.body },
    en: { title: "English account history", body: "Full useful facts for the authenticated account history" },
    zh: { title: "中文帳戶記錄", body: "完整且有用的已驗證帳戶通知內容" },
  };
  privateNotice.sourceFacts = { score: 72, profileId: "profile-synthetic" };
  privateNotice.messages = [{
    tokenId, expoToken: "ExponentPushToken[synthetic-cap-test]", platform: "android",
    category: "daily", locale: "en", title: "Personal score 72", body: "Full personal detail",
    url: "/today", data: privateNotice.payload,
  }];
  const privateReservation = await delivery.reserve(pool, privateNotice);
  assert.ok(privateReservation);
  const privacy = await pool.query(
    `SELECT l.title,l.body,l.payload,l.source_facts,a.provider_message
       FROM mobile_push_log l JOIN mobile_push_attempts a ON a.push_log_id=l.id WHERE l.yam_key='private-preview'`,
  );
  assert.equal(privacy.rows[0].title, "English account history", "authenticated history uses the account preference locale");
  assert.equal(privacy.rows[0].body, "Full useful facts for the authenticated account history", "authenticated history keeps useful full localized copy");
  assert.deepEqual(privacy.rows[0].source_facts, privateNotice.sourceFacts, "authenticated history keeps sanitized source facts");
  assert.deepEqual(privacy.rows[0].payload, privateNotice.payload, "stored typed payload keeps exact server facts");
  assert.equal(privacy.rows[0].provider_message.title, "Private notification", "privacy-off provider title is redacted");
  assert.equal(privacy.rows[0].provider_message.body, "Open HourKey to view details", "privacy-off provider body is redacted");
  const { notificationId, ...providerFacts } = privacy.rows[0].provider_message.data;
  assert.equal(notificationId, privateReservation.id, "provider envelope identifies the exact durable parent notification");
  assert.deepEqual(providerFacts, privateNotice.payload, "provider data equals stored typed facts plus only the server notification ID");
  console.log("NOTIFICATION_CAP_TASK3_OK concurrent=8 admitted=1 local_day=pass privacy=pass");
} finally {
  await pool?.end().catch(() => null);
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`);
}
