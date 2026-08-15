import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const database = `notification_integrity_retry_test_${process.pid}`;
const databaseRole = `notification_integrity_retry_role_${process.pid}`;
const databasePassword = crypto.randomBytes(24).toString("hex");
assert.match(database, /^notification_integrity_retry_test_/u, "retry tests may only create an explicitly disposable database");
assert.match(databaseRole, /^notification_integrity_retry_role_/u, "retry tests may only create an explicitly disposable role");

const migration = readFileSync("migrations/20260815_mobile_notification_integrity.sql", "utf8");
const workerSource = readFileSync("scripts/mobile-push-retry-worker.cjs", "utf8");
assert.match(workerSource, /FOR UPDATE SKIP LOCKED/u, "retry claims must use PostgreSQL skip-locked leasing");

function psql(db: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"],
    { encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

function loadLocalEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/u);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/gu, "");
    }
  } catch {
    // The local PostgreSQL test container accepts the repository defaults.
  }
}

loadLocalEnv();
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const worker = require("./mobile-push-retry-worker.cjs");
const userId = "00000000-0000-4000-8000-000000000001";
const fcmTokenId = "10000000-0000-4000-8000-000000000001";
const expoTokenId = "10000000-0000-4000-8000-000000000002";
const fcmInstallation = "20000000-0000-4000-8000-000000000001";
const expoInstallation = "20000000-0000-4000-8000-000000000002";
let pool: pg.Pool | null = null;
let checks = 0;

function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
  console.log(`PASS ${message}`);
}

async function row(sql: string, values: unknown[] = []) {
  const result = await pool!.query(sql, values);
  return result.rows[0];
}

function notice(key: string, messages: Array<Record<string, unknown>>) {
  return {
    userId,
    key,
    kind: "daily",
    title: "หัวข้อแม่",
    body: "ข้อความแม่",
    payload: { url: "/today", logical: key },
    messages,
  };
}

const fcmMessage = {
  tokenId: fcmTokenId,
  deviceToken: "fcm-secret-not-persisted",
  deviceTokenType: "fcm",
  platform: "android",
  category: "daily",
  title: "English title",
  body: "English exact body",
  url: "/today",
  data: { url: "/today", locale: "en", score: 88 },
};
const expoMessage = {
  tokenId: expoTokenId,
  expoToken: "ExponentPushToken[secret-not-persisted]",
  deviceTokenType: "apns",
  platform: "ios",
  category: "daily",
  title: "หัวข้อภาษาไทย",
  body: "ข้อความภาษาไทยตรงตัว",
  url: "/today",
  data: { url: "/today", locale: "th", score: 91 },
};

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${databaseRole}; CREATE ROLE ${databaseRole} LOGIN PASSWORD '${databasePassword}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users (id uuid PRIMARY KEY);
    CREATE TABLE mobile_push_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      installation_id uuid NOT NULL,
      expo_push_token text NOT NULL UNIQUE,
      device_push_token text,
      device_token_type text,
      platform text NOT NULL,
      app_version text,
      locale text,
      timezone text,
      enabled boolean NOT NULL DEFAULT true,
      fail_count integer NOT NULL DEFAULT 0,
      last_registered_at timestamptz,
      last_success_at timestamptz,
      disabled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT mobile_push_tokens_user_id_installation_id_key UNIQUE(user_id, installation_id)
    );
    CREATE TABLE mobile_notification_prefs (user_id uuid PRIMARY KEY REFERENCES users(id));
    CREATE TABLE mobile_push_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      yam_key text NOT NULL,
      kind text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      sent_at timestamptz,
      read_at timestamptz,
      delivery_status text NOT NULL DEFAULT 'accepted' CHECK (delivery_status IN ('pending', 'accepted', 'failed')),
      attempt_count integer NOT NULL DEFAULT 0,
      next_retry_at timestamptz,
      accepted_at timestamptz,
      last_error text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, yam_key)
    );
    INSERT INTO users(id) VALUES('${userId}');
    INSERT INTO mobile_push_tokens
      (id,user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,locale,last_registered_at)
    VALUES
      ('${fcmTokenId}','${userId}','${fcmInstallation}','ExponentPushToken[fcm-fallback-fixture]','fcm-secret-not-persisted','fcm','android','en',now()),
      ('${expoTokenId}','${userId}','${expoInstallation}','ExponentPushToken[secret-not-persisted]',NULL,'apns','ios','th',now());
  `);
  psql(database, migration);
  psql(database, `GRANT USAGE ON SCHEMA public TO ${databaseRole}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${databaseRole};`);

  pool = new pg.Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5433),
    database,
    user: databaseRole,
    password: databasePassword,
    max: 8,
  });

  const sentMessages: Array<{ provider: string; message: unknown }> = [];
  let expoSend = 0;
  const mixedSender = {
    async sendPrepared(target: { provider: string; providerMessage: unknown }) {
      sentMessages.push({ provider: target.provider, message: target.providerMessage });
      if (target.provider === "fcm") {
        return { kind: "provider_accepted", provider: "fcm", providerMessageId: "projects/test/messages/fcm-1" };
      }
      expoSend += 1;
      return expoSend === 1
        ? { kind: "failed", provider: "expo", reason: "expo_503", retryable: true }
        : { kind: "provider_accepted", provider: "expo", providerTicketId: "expo-ticket-1" };
    },
  };

  const mixed = await delivery.deliver(pool, notice("mixed", [fcmMessage, expoMessage]), {
    sender: mixedSender,
    baseDelaySeconds: 10,
  });
  check(mixed.status === "accepted" && mixed.sent === 1 && mixed.failed === 1, "mixed FCM/Expo results are reported independently");
  let attempts = (await pool.query(
    `SELECT installation_id::text,provider,status,send_count,provider_message,message_sha256,
            provider_message_id,provider_ticket_id
       FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id
      WHERE l.yam_key='mixed' ORDER BY provider`,
  )).rows;
  check(attempts.length === 2, "one durable attempt is created per installation");
  check(attempts.every((attempt) => /^[0-9a-f]{64}$/u.test(attempt.message_sha256)), "every exact provider message has a SHA-256 digest");
  check(JSON.stringify(attempts).includes("secret-not-persisted") === false, "attempt rows never persist provider credentials");
  check(attempts.find((attempt) => attempt.provider === "fcm")?.status === "provider_accepted", "FCM HTTP acceptance remains provider_accepted, not delivered");
  check(attempts.find((attempt) => attempt.provider === "fcm")?.provider_message_id === "projects/test/messages/fcm-1", "FCM provider message name is persisted");
  check(attempts.find((attempt) => attempt.provider === "expo")?.status === "retry_due", "only the failed Expo installation becomes retry-due");
  const exactExpo = attempts.find((attempt) => attempt.provider === "expo")!.provider_message;

  let immutableRejected = false;
  try {
    await pool.query(
      `UPDATE mobile_push_attempts SET provider_message='{"title":"changed"}'::jsonb WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='mixed') AND provider='expo'`,
    );
  } catch {
    immutableRejected = true;
  }
  check(immutableRejected, "database rejects mutation of a reserved exact message");

  await pool.query(`UPDATE mobile_push_attempts SET next_retry_at=now()-interval '1 second' WHERE status='retry_due'`);
  const retry = await worker.runRetryBatch(pool, { sender: mixedSender, baseDelaySeconds: 10, maxAttempts: 3 });
  check(retry.claimed === 1 && retry.accepted === 1, "retry worker claims only the failed installation");
  check(JSON.stringify(sentMessages.at(-1)?.message) === JSON.stringify(exactExpo), "retry sends the immutable localized provider message without scheduler recomputation");
  attempts = (await pool.query(
    `SELECT provider,status,send_count,provider_ticket_id FROM mobile_push_attempts a
      JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='mixed' ORDER BY provider`,
  )).rows;
  check(attempts.find((attempt) => attempt.provider === "expo")?.provider_ticket_id === "expo-ticket-1", "Expo ticket ID is persisted after retry acceptance");

  const receipt = await worker.pollReceiptBatch(pool, {
    sender: { async pollExpoReceipts() { return { "expo-ticket-1": { kind: "delivered" } }; } },
  });
  check(receipt.delivered === 1, "Expo receipt confirmation moves the child to delivered");
  let parent = await row(`SELECT delivery_status,sent_at IS NOT NULL AS sent FROM mobile_push_log WHERE yam_key='mixed'`);
  check(parent.delivery_status === "delivered" && parent.sent === true, "parent state is derived from a delivered child");

  let duplicateCalls = 0;
  const duplicate = await delivery.deliver(pool, notice("mixed", [fcmMessage, expoMessage]), {
    sender: { async sendPrepared() { duplicateCalls += 1; return { kind: "failed", retryable: true }; } },
  });
  check(duplicate.status === "duplicate" && duplicateCalls === 0, "logical dedupe does not recreate or resend installation attempts");

  await delivery.deliver(pool, notice("receipt-error", [expoMessage]), { defer: true });
  await pool.query(
    `UPDATE mobile_push_attempts SET status='provider_accepted',send_count=1,provider_ticket_id='expo-ticket-dead',accepted_at=now()
      WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='receipt-error')`,
  );
  const receiptError = await worker.pollReceiptBatch(pool, {
    sender: { async pollExpoReceipts() { return { "expo-ticket-dead": { kind: "error", reason: "DeviceNotRegistered", retryable: false } }; } },
  });
  check(receiptError.errors === 1, "Expo receipt errors are normalized separately from delivery confirmations");
  parent = await row(`SELECT delivery_status,sent_at,accepted_at FROM mobile_push_log WHERE yam_key='receipt-error'`);
  check(parent.delivery_status === "failed" && parent.sent_at === null && parent.accepted_at === null, "an all-dead parent is failed and never accepted/sent");

  await delivery.deliver(pool, notice("stale", [fcmMessage]), { defer: true });
  await pool.query(
    `UPDATE mobile_push_attempts SET lease_token='abandoned',lease_expires_at=now()-interval '1 minute'
      WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='stale')`,
  );
  let staleCalls = 0;
  const stale = await worker.runRetryBatch(pool, {
    sender: { async sendPrepared() { staleCalls += 1; return { kind: "provider_accepted", providerMessageId: "stale-fcm" }; } },
  });
  check(stale.claimed === 1 && staleCalls === 1, "expired reserved leases are recoverable");

  await delivery.deliver(pool, notice("atomic-finish", [fcmMessage]), { defer: true });
  psql(database, `
    CREATE FUNCTION fail_task2_parent_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.yam_key='atomic-finish' THEN RAISE EXCEPTION 'forced parent derivation failure'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fail_task2_parent_update BEFORE UPDATE ON mobile_push_log
      FOR EACH ROW EXECUTE FUNCTION fail_task2_parent_update();
  `);
  let finishFailed = false;
  try {
    await worker.runRetryBatch(pool, {
      sender: { async sendPrepared() { return { kind: "provider_accepted", providerMessageId: "atomic-fcm" }; } },
      limit: 1,
    });
  } catch {
    finishFailed = true;
  } finally {
    psql(database, `DROP TRIGGER IF EXISTS fail_task2_parent_update ON mobile_push_log; DROP FUNCTION IF EXISTS fail_task2_parent_update();`);
  }
  const atomicAttempt = await row(
    `SELECT a.status,a.send_count,a.lease_token,l.delivery_status
       FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='atomic-finish'`,
  );
  check(finishFailed && atomicAttempt.status === "reserved" && atomicAttempt.lease_token !== null && atomicAttempt.delivery_status === "pending",
    "attempt completion and parent derivation roll back atomically on a database failure");

  await delivery.deliver(pool, notice("double-worker", [fcmMessage]), { defer: true });
  let releaseSend!: () => void;
  let enteredSend!: () => void;
  const entered = new Promise<void>((resolve) => { enteredSend = resolve; });
  const release = new Promise<void>((resolve) => { releaseSend = resolve; });
  let concurrentSends = 0;
  const blockingSender = {
    async sendPrepared() {
      concurrentSends += 1;
      enteredSend();
      await release;
      return { kind: "provider_accepted", providerMessageId: "double-fcm" };
    },
  };
  const firstWorker = worker.runRetryBatch(pool, { sender: blockingSender, limit: 1 });
  await entered;
  const secondWorker = await worker.runRetryBatch(pool, { sender: blockingSender, limit: 1 });
  releaseSend();
  const firstWorkerResult = await firstWorker;
  check(firstWorkerResult.claimed === 1 && secondWorker.claimed === 0 && concurrentSends === 1, "duplicate workers cannot double-claim or double-send an active lease");

  await delivery.deliver(pool, notice("exhaust", [fcmMessage]), { defer: true });
  const delays: number[] = [];
  const failingSender = { async sendPrepared() { return { kind: "failed", reason: "temporary", retryable: true }; } };
  for (let count = 1; count <= 3; count += 1) {
    await pool.query(
      `UPDATE mobile_push_attempts SET next_retry_at=now()-interval '1 second'
        WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='exhaust')`,
    );
    await worker.runRetryBatch(pool, { sender: failingSender, baseDelaySeconds: 10, maxAttempts: 3 });
    const attempt = await row(
      `SELECT status,send_count,EXTRACT(EPOCH FROM (next_retry_at-updated_at)) AS delay
         FROM mobile_push_attempts WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='exhaust')`,
    );
    if (attempt.delay !== null) delays.push(Number(attempt.delay));
    assert.equal(Number(attempt.send_count), count);
  }
  check(delays.length === 2 && delays[0] >= 9 && delays[1] >= 19, "retry scheduling uses bounded exponential backoff");
  const exhausted = await row(
    `SELECT a.status,l.delivery_status,l.sent_at,l.accepted_at
       FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='exhaust'`,
  );
  check(exhausted.status === "dead" && exhausted.delivery_status === "failed", "bounded attempts exhaust to a dead child and failed parent");
  check(exhausted.sent_at === null && exhausted.accepted_at === null, "all-dead retry exhaustion never leaves accepted timestamps");

  const leaseAttemptId = crypto.randomUUID();
  const deterministicA = worker.deterministicLeaseToken(leaseAttemptId, 2);
  const deterministicB = worker.deterministicLeaseToken(leaseAttemptId, 2);
  check(/^[0-9a-f-]{36}$/u.test(deterministicA) && deterministicA === deterministicB, "lease-token generation is deterministic for an attempt/ordinal pair");

  await delivery.deliver(pool, notice("same-owner-rotation", [fcmMessage]), { defer: true });
  const exactBeforeRotation = await row(
    `SELECT provider_message FROM mobile_push_attempts WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='same-owner-rotation')`,
  );
  const rotatedTokenId = "10000000-0000-4000-8000-000000000003";
  await pool.query(`UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now() WHERE id=$1`, [fcmTokenId]);
  await pool.query(
    `INSERT INTO mobile_push_tokens
       (id,user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,locale,last_registered_at)
     VALUES($1,$2,$3,'ExponentPushToken[rotated-fallback]','rotated-current-fcm','fcm','android','en',now())`,
    [rotatedTokenId, userId, fcmInstallation],
  );
  let rotatedTarget: { deviceToken?: string; providerMessage?: unknown } | null = null;
  const rotation = await worker.runRetryBatch(pool, {
    sender: { async sendPrepared(target: typeof rotatedTarget) { rotatedTarget = target; return { kind: "provider_accepted", providerMessageId: "rotated-fcm" }; } },
    limit: 1,
  });
  check(rotation.accepted === 1 && rotatedTarget?.deviceToken === "rotated-current-fcm", "same-owner installation rotation retries through the current active transport");
  check(JSON.stringify(rotatedTarget?.providerMessage) === JSON.stringify(exactBeforeRotation.provider_message), "token rotation does not alter the exact reserved provider message");

  await delivery.deliver(pool, notice("cross-owner-takeover", [{ ...fcmMessage, tokenId: rotatedTokenId }]), { defer: true });
  const otherUserId = "00000000-0000-4000-8000-000000000002";
  await pool.query(`INSERT INTO users(id) VALUES($1)`, [otherUserId]);
  await pool.query(`UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now() WHERE id=$1`, [rotatedTokenId]);
  await pool.query(
    `INSERT INTO mobile_push_tokens
       (id,user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,locale,last_registered_at)
     VALUES('10000000-0000-4000-8000-000000000004',$1,$2,'ExponentPushToken[new-owner]','new-owner-fcm','fcm','android','en',now())`,
    [otherUserId, fcmInstallation],
  );
  let takeoverSends = 0;
  const takeover = await worker.runRetryBatch(pool, {
    sender: { async sendPrepared() { takeoverSends += 1; return { kind: "provider_accepted" }; } },
    limit: 1,
  });
  check(takeover.dead === 1 && takeoverSends === 0, "an installation transferred to another account never receives the prior owner's reserved message");

  console.log(`${checks} mobile push retry checks passed`);
} finally {
  await pool?.end().catch(() => null);
  try {
    psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${databaseRole};`);
  } catch {
    // Preserve the original failure; the hard-guarded disposable DB is unique.
  }
}
