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
const qimenMigration = readFileSync("migrations/20260821_mobile_qimen_three_layer.sql", "utf8");
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
const qimenRuntime = require("../src/lib/qimen-three-layer-notification.cjs");
const qimenFixture = require("./fixtures/qimen-three-layer-valid-snapshot.cjs");
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
  data: { url: "/today", locale: "en", score: 88, apiToken: "embedded-raw-token", authSecret: "embedded-raw-secret" },
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
    CREATE TABLE users (
      id uuid PRIMARY KEY, timezone text DEFAULT 'Asia/Bangkok',
      is_active boolean NOT NULL DEFAULT true, deleted_at timestamptz,
      tier text NOT NULL DEFAULT 'premium', sub_expires_at timestamptz DEFAULT '2099-01-01T00:00:00Z',
      trial_ends_at timestamptz
    );
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
    CREATE TABLE mobile_notification_prefs (
      user_id uuid PRIMARY KEY REFERENCES users(id), timezone text DEFAULT 'Asia/Bangkok',
      security_enabled boolean NOT NULL DEFAULT true, saved_date_enabled boolean NOT NULL DEFAULT false,
      daily_enabled boolean NOT NULL DEFAULT true, yam_enabled boolean NOT NULL DEFAULT false,
      qimen_enabled boolean NOT NULL DEFAULT false, shrine_enabled boolean NOT NULL DEFAULT false,
      goal_enabled boolean NOT NULL DEFAULT false, service_enabled boolean NOT NULL DEFAULT true,
      quiet_start int NOT NULL DEFAULT 0, quiet_end int NOT NULL DEFAULT 0,
      max_per_day int NOT NULL DEFAULT 100, paused_until timestamptz
    );
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
    INSERT INTO mobile_notification_prefs(user_id) VALUES('${userId}');
    INSERT INTO mobile_push_tokens
      (id,user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,locale,last_registered_at)
    VALUES
      ('${fcmTokenId}','${userId}','${fcmInstallation}','ExponentPushToken[fcm-fallback-fixture]','fcm-secret-not-persisted','fcm','android','en',now()),
      ('${expoTokenId}','${userId}','${expoInstallation}','ExponentPushToken[secret-not-persisted]',NULL,'apns','ios','th',now());
  `);
  psql(database, migration);
  psql(database, qimenMigration);
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

  const qimenOccurrenceId = "30000000-0000-4000-8000-000000000001";
  const qimenInput = qimenFixture.input(userId);
  const qimenSnapshot = qimenRuntime.buildQimenThreeLayerSnapshot(qimenInput);
  const qimenPayload = qimenRuntime.buildQimenV2ProviderData(qimenSnapshot);
  await pool.query("UPDATE mobile_push_tokens SET qimen_payload_schema=2 WHERE id=$1", [fcmTokenId]);
  await pool.query(
    `INSERT INTO mobile_qimen_installations(user_id,installation_id,enabled,location_permission)
     VALUES($1,$2,false,'unknown')`,
    [userId, fcmInstallation],
  );
  await pool.query(
    `INSERT INTO mobile_qimen_occurrences
       (id,user_id,installation_id,occurrence_key,purpose,hour_valid_from,hour_valid_until,send_deadline,
        selected_direction,version_tuple,source_tuple,snapshot,snapshot_digest,state)
     VALUES($1,$2,$3,'qimen|delivery-binding','travel',$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,'claimed')`,
    [qimenOccurrenceId, userId, fcmInstallation,
      qimenSnapshot.layers.hour.validFrom, qimenSnapshot.layers.hour.validUntil,
      new Date(Date.parse(qimenSnapshot.layers.hour.validFrom) + 5 * 60_000).toISOString(),
      qimenSnapshot.selectedDirection, JSON.stringify(qimenSnapshot.versionTuple), JSON.stringify(qimenSnapshot.sourceTuple),
      JSON.stringify(qimenSnapshot), qimenSnapshot.snapshotDigest],
  );
  function qimenNotice(payload: Record<string, unknown>, key: string) {
    return {
      userId,
      key,
      kind: "qimen",
      qimenOccurrenceId,
      title: "ฉีเหมิน",
      body: "สามชั้น",
      historyCopies: {
        th: { title: "ฉีเหมิน", body: "สามชั้น" },
        en: { title: "Qimen", body: "three layers" },
        zh: { title: "奇門", body: "三層" },
      },
      payload,
      sourceFacts: {
        eventEndAt: qimenSnapshot.layers.hour.validUntil,
        sendDeadline: new Date(Date.parse(qimenSnapshot.layers.hour.validFrom) + 5 * 60_000).toISOString(),
        snapshotDigest: qimenSnapshot.snapshotDigest,
        selectedDirection: qimenSnapshot.selectedDirection,
        calculationVersion: qimenSnapshot.versionTuple.hour,
      },
      messages: [{
        ...fcmMessage,
        category: "qimen",
        title: "Qimen",
        body: "Month Day Hour",
        url: "/qimen/notification-detail",
        data: payload,
      }],
    };
  }
  const mutatedCompact = JSON.parse(qimenPayload.qimenV2);
  mutatedCompact.direction = mutatedCompact.direction === "SE" ? "E" : "SE";
  const mutatedPayload = { ...qimenPayload, qimenV2: JSON.stringify(mutatedCompact) };
  await assert.rejects(
    delivery.deliver(pool, qimenNotice(mutatedPayload, "qimen-mutated"), { defer: true }),
    /qimen_occurrence_binding_changed/u,
  );
  check(
    (await pool.query("SELECT 1 FROM mobile_push_log WHERE yam_key='qimen-mutated'")).rowCount === 0,
    "a one-field qimenV2 mutation rolls back before any durable provider attempt",
  );
  const boundQimen = await delivery.deliver(pool, qimenNotice(qimenPayload, "qimen-bound"), { defer: true });
  const boundQimenAttemptCount = (await row(
    `SELECT count(*)::int AS n FROM mobile_push_attempts a
      JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='qimen-bound'`,
  )).n;
  check(boundQimen.status === "pending" && boundQimenAttemptCount === 1,
    "the exact qimenV2 bytes are bound to the immutable occurrence before reservation");
  const boundOccurrence = await row("SELECT state,push_log_id IS NOT NULL AS linked FROM mobile_qimen_occurrences WHERE id=$1", [qimenOccurrenceId]);
  check(boundOccurrence.state === "reserved" && boundOccurrence.linked === true,
    "Qimen occurrence and provider attempt become reserved in the same transaction");
  await pool.query("DELETE FROM mobile_push_log WHERE yam_key='qimen-bound'");

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
  check(JSON.stringify(attempts).includes("secret-not-persisted") === false
    && JSON.stringify(attempts).includes("embedded-raw-token") === false
    && JSON.stringify(attempts).includes("embedded-raw-secret") === false,
  "attempt rows never persist provider credentials, including credential-like data keys");
  check(attempts.find((attempt) => attempt.provider === "fcm")?.status === "provider_accepted", "FCM HTTP acceptance remains provider_accepted, not delivered");
  check(attempts.find((attempt) => attempt.provider === "fcm")?.provider_message_id === "projects/test/messages/fcm-1", "FCM provider message name is persisted");
  check(attempts.find((attempt) => attempt.provider === "expo")?.status === "retry_due", "only the failed Expo installation becomes retry-due");
  const mixedNotificationId = (await row(`SELECT id::text FROM mobile_push_log WHERE yam_key='mixed'`)).id;
  const fcmEnvelope = JSON.parse(attempts.find((attempt) => attempt.provider === "fcm")!.provider_message.data.body);
  const expoEnvelope = attempts.find((attempt) => attempt.provider === "expo")!.provider_message.data;
  check(fcmEnvelope.notificationId === mixedNotificationId && expoEnvelope.notificationId === mixedNotificationId,
    "every provider envelope carries the exact durable notification UUID required by the mobile parser");
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
    sender: { async pollExpoReceipts() { return { "expo-ticket-1": { kind: "provider_receipt_ok" } }; } },
  });
  check(receipt.accepted === 1 && receipt.delivered === 0, "Expo receipt success confirms provider handoff without claiming device delivery");
  let parent = await row(`SELECT delivery_status,sent_at IS NOT NULL AS sent FROM mobile_push_log WHERE yam_key='mixed'`);
  check(parent.delivery_status === "accepted" && parent.sent === true, "parent remains provider accepted without device evidence");

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

  const reacceptTokenId = "10000000-0000-4000-8000-000000000020";
  await pool.query(
    `INSERT INTO mobile_push_tokens
       (id,user_id,installation_id,expo_push_token,device_token_type,platform,locale,last_registered_at)
     VALUES($1,$2,'20000000-0000-4000-8000-000000000020','ExponentPushToken[receipt-reaccept]','apns','ios','th',now())`,
    [reacceptTokenId, userId],
  );
  await delivery.deliver(pool, notice("receipt-reaccept", [{ ...expoMessage, tokenId: reacceptTokenId,
    expoToken: "ExponentPushToken[receipt-reaccept]" }]), { defer: true });
  await pool.query(
    `UPDATE mobile_push_attempts SET status='provider_accepted',send_count=1,provider_ticket_id='expo-ticket-reaccept-old',
       accepted_at=now()-interval '1 day',send_started_at=now()-interval '1 day'-interval '2 seconds',next_receipt_at=now()
      WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='receipt-reaccept')`,
  );
  const retryableReceiptError = await worker.pollReceiptBatch(pool, {
    sender: { async pollExpoReceipts() { return { "expo-ticket-reaccept-old": { kind: "error", reason: "MessageRateExceeded", retryable: true } }; } },
    baseDelaySeconds: 1,
  });
  const clearedGeneration = await row(
    `SELECT status,accepted_at,provider_ticket_id,provider_receipt_checked_at,send_started_at
       FROM mobile_push_attempts WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='receipt-reaccept')`,
  );
  check(retryableReceiptError.errors === 1 && clearedGeneration.status === "retry_due"
    && clearedGeneration.accepted_at === null && clearedGeneration.provider_ticket_id === null
    && clearedGeneration.provider_receipt_checked_at === null && clearedGeneration.send_started_at === null,
  "a receipt-triggered resend clears every provider timestamp and identifier from the prior send generation");
  await pool.query(
    `UPDATE mobile_push_attempts SET next_retry_at=now()-interval '1 second'
      WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='receipt-reaccept')`,
  );
  const reaccepted = await worker.runRetryBatch(pool, {
    sender: { async sendPrepared() { return { kind: "provider_accepted", provider: "expo", providerTicketId: "expo-ticket-reaccept-new" }; } },
    limit: 1,
  });
  const currentGeneration = await row(
    `SELECT status,provider_ticket_id,accepted_at>=send_started_at AS nonnegative
       FROM mobile_push_attempts WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='receipt-reaccept')`,
  );
  check(reaccepted.accepted === 1 && currentGeneration.status === "provider_accepted"
    && currentGeneration.provider_ticket_id === "expo-ticket-reaccept-new" && currentGeneration.nonnegative === true,
  "retry acceptance timestamps and identifiers belong only to the current send generation");
  const reacceptedReceipt = await worker.pollReceiptBatch(pool, {
    limit: 1,
    sender: { async pollExpoReceipts() { return { "expo-ticket-reaccept-new": { kind: "provider_receipt_ok" } }; } },
  });
  check(reacceptedReceipt.accepted === 1, "the new send generation owns and completes its own receipt lifecycle");

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

  await delivery.deliver(pool, notice("crash-before-send", [fcmMessage]), { defer: true });
  let crashedBefore = false;
  try {
    await worker.runRetryBatch(pool, {
      sender: { async sendPrepared() { throw new Error("must not reach provider"); } },
      hooks: { async afterClaim() { throw new Error("crash-before-send-started"); } },
      limit: 1,
    });
  } catch {
    crashedBefore = true;
  }
  const beforeCrash = await row(
    `SELECT lease_token,send_started_at FROM mobile_push_attempts WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='crash-before-send')`,
  );
  await pool.query(`UPDATE mobile_push_attempts SET lease_expires_at=now()-interval '1 second' WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='crash-before-send')`);
  let crashedBeforeAgain = false;
  try {
    await worker.runRetryBatch(pool, {
      sender: { async sendPrepared() { throw new Error("must not reach provider"); } },
      hooks: { async afterClaim() { throw new Error("second-crash-before-send-started"); } },
      limit: 1,
    });
  } catch {
    crashedBeforeAgain = true;
  }
  const secondBeforeCrash = await row(
    `SELECT lease_token,send_started_at FROM mobile_push_attempts WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='crash-before-send')`,
  );
  await pool.query(`UPDATE mobile_push_attempts SET lease_expires_at=now()-interval '1 second' WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='crash-before-send')`);
  let reclaimedSends = 0;
  await worker.runRetryBatch(pool, {
    sender: { async sendPrepared() { reclaimedSends += 1; return { kind: "provider_accepted", providerMessageId: "crash-before-recovered" }; } },
    limit: 1,
  });
  const afterReclaim = await row(
    `SELECT lease_token,send_started_at FROM mobile_push_attempts WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='crash-before-send')`,
  );
  check(crashedBefore && crashedBeforeAgain && beforeCrash.send_started_at === null && secondBeforeCrash.send_started_at === null && reclaimedSends === 1, "a stale reservation that never crossed send-start is safely reclaimed");
  check(beforeCrash.lease_token !== secondBeforeCrash.lease_token && secondBeforeCrash.lease_token !== afterReclaim.lease_token, "every claim receives a fresh random lease token");

  await delivery.deliver(pool, notice("crash-after-send-start", [fcmMessage]), { defer: true });
  let crashedAfter = false;
  try {
    await worker.runRetryBatch(pool, {
      sender: { async sendPrepared() { throw new Error("must not reach provider after hook crash"); } },
      hooks: { async afterSendStarted() { throw new Error("crash-after-send-started"); } },
      limit: 1,
    });
  } catch {
    crashedAfter = true;
  }
  const startedCrash = await row(
    `SELECT send_started_at FROM mobile_push_attempts WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='crash-after-send-start')`,
  );
  await pool.query(`UPDATE mobile_push_attempts SET lease_expires_at=now()-interval '1 second' WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='crash-after-send-start')`);
  let uncertainResends = 0;
  await worker.runRetryBatch(pool, {
    sender: { async sendPrepared() { uncertainResends += 1; return { kind: "provider_accepted", providerMessageId: "must-not-send" }; } },
    limit: 1,
  });
  const uncertain = await row(
    `SELECT a.status,a.last_error,l.delivery_status FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='crash-after-send-start'`,
  );
  check(crashedAfter && startedCrash.send_started_at !== null && uncertainResends === 0, "an expired unknown provider result is never resent");
  check(uncertain.status === "dead" && uncertain.last_error === "uncertain_provider_result" && uncertain.delivery_status === "failed", "unknown provider outcome recovers deterministically to dead");

  await delivery.deliver(pool, notice("adapter-uncertain", [fcmMessage]), { defer: true });
  let ambiguousProviderSends = 0;
  const ambiguousFirst = await worker.runRetryBatch(pool, {
    sender: { async sendPrepared() { ambiguousProviderSends += 1; return { kind: "uncertain", provider: "fcm", reason: "uncertain_provider_result", retryable: false }; } },
    limit: 1,
  });
  const ambiguousSecond = await worker.runRetryBatch(pool, {
    sender: { async sendPrepared() { ambiguousProviderSends += 1; return { kind: "provider_accepted", providerMessageId: "must-not-resend-ambiguous" }; } },
    limit: 1,
  });
  const ambiguousAttempt = await row(
    `SELECT a.status,a.last_error,a.send_started_at,l.delivery_status
       FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='adapter-uncertain'`,
  );
  check(ambiguousFirst.dead === 1 && ambiguousSecond.claimed === 0 && ambiguousProviderSends === 1,
    "an adapter response-lost outcome is attempted exactly once across worker runs");
  check(ambiguousAttempt.status === "dead" && ambiguousAttempt.last_error === "uncertain_provider_result"
    && ambiguousAttempt.send_started_at !== null && ambiguousAttempt.delivery_status === "failed",
  "an explicit uncertain outcome preserves the send boundary and becomes terminal");

  const secondTokenId = "10000000-0000-4000-8000-000000000005";
  const secondInstallation = "20000000-0000-4000-8000-000000000005";
  await pool.query(
    `INSERT INTO mobile_push_tokens
       (id,user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,locale,last_registered_at)
     VALUES($1,$2,$3,'ExponentPushToken[second-fcm]','second-current-fcm','fcm','android','en',now())`,
    [secondTokenId, userId, secondInstallation],
  );
  const secondFcmMessage = { ...fcmMessage, tokenId: secondTokenId };
  await delivery.deliver(pool, notice("slow-single-claim", [fcmMessage, secondFcmMessage]), { defer: true });
  let releaseSlow!: () => void;
  let enteredSlow!: () => void;
  const slowEntered = new Promise<void>((resolve) => { enteredSlow = resolve; });
  const slowRelease = new Promise<void>((resolve) => { releaseSlow = resolve; });
  let slowSends = 0;
  const slowWorker = worker.runRetryBatch(pool, {
    sender: { async sendPrepared() { slowSends += 1; enteredSlow(); await slowRelease; return { kind: "provider_accepted", providerMessageId: `slow-${slowSends}` }; } },
    leaseSeconds: 5,
    limit: 2,
  });
  await slowEntered;
  const siblingWhileSlow = await row(
    `SELECT count(*)::int AS leased FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id
      WHERE l.yam_key='slow-single-claim' AND a.lease_token IS NOT NULL AND a.send_started_at IS NULL`,
  );
  const inFlightSlow = await row(
    `SELECT a.id FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id
      WHERE l.yam_key='slow-single-claim' AND a.send_started_at IS NOT NULL`,
  );
  await pool.query(`UPDATE mobile_push_attempts SET lease_expires_at=now()-interval '1 second' WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='slow-single-claim') AND send_started_at IS NOT NULL`);
  const competingSlow = await worker.runRetryBatch(pool, {
    sender: { async sendPrepared() { slowSends += 1; return { kind: "provider_accepted", providerMessageId: "duplicate-slow" }; } },
    limit: 1,
    attemptIds: [inFlightSlow.id],
  });
  check(siblingWhileSlow.leased === 0, "worker never pre-claims a sibling before the current external send finishes");
  check(competingSlow.claimed === 0 && slowSends === 1, "a second worker cannot resend a slow in-flight provider call after lease expiry");
  releaseSlow();
  await slowWorker;

  const drainThirdTokenId = "10000000-0000-4000-8000-000000000099";
  const drainThirdInstallation = "20000000-0000-4000-8000-000000000099";
  await pool.query(
    `INSERT INTO mobile_push_tokens
       (id,user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,locale,last_registered_at)
     VALUES($1,$2,$3,'ExponentPushToken[drain-third]','drain-third-fcm','fcm','android','en',now())`,
    [drainThirdTokenId, userId, drainThirdInstallation],
  );
  await delivery.deliver(pool, notice("concurrent-error-drain", [
    fcmMessage,
    secondFcmMessage,
    { ...fcmMessage, tokenId: drainThirdTokenId },
  ]), { defer: true });
  let enteredDrainBarrier!: () => void;
  let enteredCount = 0;
  let failingDrainInstallation: string | null = null;
  const bothDrainWorkersEntered = new Promise<void>((resolve) => { enteredDrainBarrier = resolve; });
  let releaseSibling!: () => void;
  const siblingRelease = new Promise<void>((resolve) => { releaseSibling = resolve; });
  const batch = worker.runRetryBatch(pool, {
    concurrency: 2,
    limit: 3,
    sender: { async sendPrepared() { return { kind: "provider_accepted", providerMessageId: "drained-sibling" }; } },
    hooks: {
      async afterClaim(attempt: { installation_id: string }) {
        enteredCount += 1;
        if (enteredCount === 1) failingDrainInstallation = attempt.installation_id;
        if (enteredCount === 2) enteredDrainBarrier();
        await bothDrainWorkersEntered;
        if (attempt.installation_id === failingDrainInstallation) throw new Error("fixture-concurrent-worker-failure");
        await siblingRelease;
      },
    },
  });
  let batchSettled = false;
  const batchOutcome = batch.then(
    () => ({ rejected: false, error: null as unknown }),
    (error: unknown) => ({ rejected: true, error }),
  ).finally(() => { batchSettled = true; });
  await bothDrainWorkersEntered;
  await new Promise<void>((resolve) => setImmediate(resolve));
  check(batchSettled === false,
    "a concurrent worker failure waits for every in-flight sibling before rejecting the batch");
  releaseSibling();
  const drainedOutcome = await batchOutcome;
  check(drainedOutcome.rejected && String(drainedOutcome.error).includes("fixture-concurrent-worker-failure"),
    "the drained concurrent batch still exposes the original worker failure");
  const drainedSiblings = await row(
    `SELECT count(*) FILTER (WHERE a.status='provider_accepted')::int AS accepted,
            count(*) FILTER (WHERE a.status='reserved' AND a.lease_token IS NULL)::int AS unclaimed
      FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id
      WHERE l.yam_key='concurrent-error-drain' AND a.installation_id<>$1`,
    [failingDrainInstallation],
  );
  check(drainedSiblings.accepted === 1,
    "a sibling already in flight completes durably before the concurrent batch reports failure");
  check(drainedSiblings.unclaimed === 1,
    "a fatal concurrent worker error stops new claims after draining already in-flight siblings");
  await pool.query(`DELETE FROM mobile_push_log WHERE yam_key='concurrent-error-drain'`);

  const receiptTokenId = "10000000-0000-4000-8000-000000000006";
  const receiptInstallation = "20000000-0000-4000-8000-000000000006";
  await pool.query(
    `INSERT INTO mobile_push_tokens
       (id,user_id,installation_id,expo_push_token,device_token_type,platform,locale,last_registered_at)
     VALUES($1,$2,$3,'ExponentPushToken[receipt-fence]','apns','ios','th',now())`,
    [receiptTokenId, userId, receiptInstallation],
  );
  await delivery.deliver(pool, notice("receipt-fence", [{ ...expoMessage, tokenId: receiptTokenId }]), { defer: true });
  await pool.query(
    `UPDATE mobile_push_attempts SET status='provider_accepted',provider_ticket_id='receipt-fence-ticket',accepted_at=now()
      WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='receipt-fence')`,
  );
  const receiptClaimA = await worker.claimReceiptOne(pool, { leaseSeconds: 5 });
  await pool.query(`UPDATE mobile_push_attempts SET lease_expires_at=now()-interval '1 second' WHERE id=$1`, [receiptClaimA.id]);
  const receiptClaimB = await worker.claimReceiptOne(pool, { leaseSeconds: 5 });
  const staleReceiptFinished = await worker.finishReceipt(pool, receiptClaimA, { kind: "provider_receipt_ok" });
  const receiptBeforeCurrent = await row(`SELECT status FROM mobile_push_attempts WHERE id=$1`, [receiptClaimA.id]);
  const currentReceiptFinished = await worker.finishReceipt(pool, receiptClaimB, { kind: "provider_receipt_ok" });
  check(receiptClaimA.lease_token !== receiptClaimB.lease_token, "receipt recovery receives a fresh random lease token");
  check(staleReceiptFinished === false && receiptBeforeCurrent.status === "provider_accepted" && currentReceiptFinished === true,
    "a stale receipt worker cannot clear or finalize a replacement lease");

  const receiptBackoffTokenA = "10000000-0000-4000-8000-000000000008";
  const receiptBackoffTokenB = "10000000-0000-4000-8000-000000000009";
  await pool.query(
    `INSERT INTO mobile_push_tokens
       (id,user_id,installation_id,expo_push_token,device_token_type,platform,locale,last_registered_at)
     VALUES
       ($1,$3,'20000000-0000-4000-8000-000000000008','ExponentPushToken[receipt-backoff-a]','apns','ios','th',now()),
       ($2,$3,'20000000-0000-4000-8000-000000000009','ExponentPushToken[receipt-backoff-b]','apns','ios','th',now())`,
    [receiptBackoffTokenA, receiptBackoffTokenB, userId],
  );
  await delivery.deliver(pool, notice("receipt-backoff", [
    { ...expoMessage, tokenId: receiptBackoffTokenA },
    { ...expoMessage, tokenId: receiptBackoffTokenB },
  ]), { defer: true });
  await pool.query(
    `UPDATE mobile_push_attempts SET status='provider_accepted',accepted_at=now(),next_receipt_at=now(),
       provider_ticket_id=CASE installation_id
         WHEN '20000000-0000-4000-8000-000000000008' THEN 'receipt-backoff-a'
         ELSE 'receipt-backoff-b' END
      WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='receipt-backoff')`,
  );
  let receiptBackoffCalls = 0;
  const receiptBackoff = await worker.pollReceiptBatch(pool, {
    limit: 2,
    receiptBaseDelaySeconds: 30,
    sender: { async pollExpoReceipts(ids: string[]) {
      receiptBackoffCalls += 1;
      return receiptBackoffCalls === 1 ? {} : { [ids[0]]: { kind: "provider_receipt_ok" } };
    } },
  });
  const receiptBackoffRows = (await pool.query(
    `SELECT status,receipt_poll_count,next_receipt_at>now() AS backed_off
       FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id
      WHERE l.yam_key='receipt-backoff' ORDER BY status`,
  )).rows;
  check(receiptBackoff.claimed === 2 && receiptBackoff.accepted === 1 && receiptBackoff.delivered === 0 && receiptBackoff.pending === 1 && receiptBackoffCalls === 2,
    "a missing first Expo receipt is backed off without starving a later ready receipt in the same batch");
  check(receiptBackoffRows.every((attempt) => Number(attempt.receipt_poll_count) === 1)
    && receiptBackoffRows.some((attempt) => attempt.status === "provider_accepted" && attempt.backed_off === true),
  "receipt misses durably advance poll count and next-receipt schedule");
  const receiptImmediate = await worker.pollReceiptBatch(pool, {
    limit: 2,
    sender: { async pollExpoReceipts() { throw new Error("backed-off receipt must not be polled immediately"); } },
  });
  check(receiptImmediate.claimed === 0, "a backed-off receipt is not reclaimed again in an immediate worker run");
  await pool.query(
    `UPDATE mobile_push_attempts SET next_receipt_at=now()-interval '1 second'
      WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='receipt-backoff') AND status='provider_accepted'`,
  );
  const receiptRepeated = await worker.pollReceiptBatch(pool, {
    limit: 2,
    sender: { async pollExpoReceipts(ids: string[]) { return { [ids[0]]: { kind: "provider_receipt_ok" } }; } },
  });
  check(receiptRepeated.accepted === 1 && receiptRepeated.delivered === 0, "a later worker run resumes a due receipt without claiming device delivery");

  const receiptErrorTokenA = "10000000-0000-4000-8000-000000000010";
  const receiptErrorTokenB = "10000000-0000-4000-8000-000000000011";
  await pool.query(
    `INSERT INTO mobile_push_tokens
       (id,user_id,installation_id,expo_push_token,device_token_type,platform,locale,last_registered_at)
     VALUES
       ($1,$3,'20000000-0000-4000-8000-000000000010','ExponentPushToken[receipt-error-a]','apns','ios','th',now()),
       ($2,$3,'20000000-0000-4000-8000-000000000011','ExponentPushToken[receipt-error-b]','apns','ios','th',now())`,
    [receiptErrorTokenA, receiptErrorTokenB, userId],
  );
  await delivery.deliver(pool, notice("receipt-provider-error", [
    { ...expoMessage, tokenId: receiptErrorTokenA },
    { ...expoMessage, tokenId: receiptErrorTokenB },
  ]), { defer: true });
  await pool.query(
    `UPDATE mobile_push_attempts SET status='provider_accepted',accepted_at=now(),next_receipt_at=now(),
       provider_ticket_id='receipt-provider-error-'||installation_id::text
      WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='receipt-provider-error')`,
  );
  const providerReceiptError = await worker.pollReceiptBatch(pool, {
    limit: 2,
    receiptBaseDelaySeconds: 30,
    sender: { async pollExpoReceipts() { throw new Error("fixture provider unavailable"); } },
  });
  const providerErrorRows = (await pool.query(
    `SELECT receipt_poll_count,next_receipt_at>now() AS backed_off
       FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id
      WHERE l.yam_key='receipt-provider-error' ORDER BY receipt_poll_count DESC`,
  )).rows;
  check(providerReceiptError.claimed === 1 && providerReceiptError.providerErrors === 1
    && Number(providerErrorRows[0].receipt_poll_count) === 1 && providerErrorRows[0].backed_off === true
    && Number(providerErrorRows[1].receipt_poll_count) === 0,
  "a provider-wide receipt error backs off the claimed ticket and stops that batch");

  await delivery.deliver(pool, notice("concurrent-all-dead", [fcmMessage, secondFcmMessage]), { defer: true });
  let siblingEntered = 0;
  let releaseSiblings!: () => void;
  let bothSiblingsEntered!: () => void;
  const siblingGate = new Promise<void>((resolve) => { releaseSiblings = resolve; });
  const bothEntered = new Promise<void>((resolve) => { bothSiblingsEntered = resolve; });
  const siblingSender = {
    async sendPrepared() {
      siblingEntered += 1;
      if (siblingEntered === 2) bothSiblingsEntered();
      await siblingGate;
      return { kind: "failed", reason: "permanent-sibling-failure", retryable: false };
    },
  };
  const siblingWorkerA = worker.runRetryBatch(pool, { sender: siblingSender, limit: 1 });
  const siblingWorkerB = worker.runRetryBatch(pool, { sender: siblingSender, limit: 1 });
  await bothEntered;
  releaseSiblings();
  await Promise.all([siblingWorkerA, siblingWorkerB]);
  const allDeadParent = await row(
    `SELECT delivery_status,sent_at,accepted_at FROM mobile_push_log WHERE yam_key='concurrent-all-dead'`,
  );
  check(allDeadParent.delivery_status === "failed" && allDeadParent.sent_at === null && allDeadParent.accepted_at === null,
    "concurrent sibling completions serialize on the parent and preserve all-dead truth");

  const transferUserId = "00000000-0000-4000-8000-000000000003";
  await pool.query(`INSERT INTO users(id) VALUES($1)`, [transferUserId]);
  await delivery.deliver(pool, notice("transfer-during-send", [secondFcmMessage]), { defer: true });
  let releaseTransferSend!: () => void;
  let enteredTransferSend!: () => void;
  const transferSendEntered = new Promise<void>((resolve) => { enteredTransferSend = resolve; });
  const transferSendRelease = new Promise<void>((resolve) => { releaseTransferSend = resolve; });
  let sentDuringTransfer: string | null = null;
  const transferWorker = worker.runRetryBatch(pool, {
    sender: { async sendPrepared(target: { deviceToken: string }) { sentDuringTransfer = target.deviceToken; enteredTransferSend(); await transferSendRelease; return { kind: "provider_accepted", providerMessageId: "transfer-held-fcm" }; } },
    limit: 1,
  });
  await transferSendEntered;
  const transferClient = new pg.Client({
    host: process.env.PGHOST || "127.0.0.1", port: Number(process.env.PGPORT || 5433), database,
    user: databaseRole, password: databasePassword,
  });
  await transferClient.connect();
  let transferCommitted = false;
  const transferPromise = (async () => {
    await transferClient.query("BEGIN");
    await transferClient.query(`SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-installation:'||$1::text,0))`, [secondInstallation]);
    await transferClient.query(`UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now() WHERE id=$1`, [secondTokenId]);
    await transferClient.query(
      `INSERT INTO mobile_push_tokens(id,user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,locale,last_registered_at)
       VALUES('10000000-0000-4000-8000-000000000007',$1,$2,'ExponentPushToken[transfer-new-owner]','transfer-new-owner-fcm','fcm','android','en',now())`,
      [transferUserId, secondInstallation],
    );
    await transferClient.query("COMMIT");
    transferCommitted = true;
  })();
  await new Promise((resolve) => setTimeout(resolve, 100));
  check(transferCommitted === false, "ownership transfer cannot commit while the old owner's provider send is in flight");
  releaseTransferSend();
  await transferWorker;
  await transferPromise;
  await transferClient.end();
  check(sentDuringTransfer === "second-current-fcm" && transferCommitted, "in-flight content uses only the locked old-owner transport before transfer commits");

  await delivery.deliver(pool, notice("provider-id-first", [fcmMessage]), {
    sender: { async sendPrepared() { return { kind: "provider_accepted", providerMessageId: "duplicate-provider-id" }; } },
  });
  const identifierConflict = await delivery.deliver(pool, notice("provider-id-second", [fcmMessage]), {
    sender: { async sendPrepared() { return { kind: "provider_accepted", providerMessageId: "duplicate-provider-id" }; } },
  });
  const identifierConflictRow = await row(
    `SELECT a.status,a.last_error,l.delivery_status FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE l.yam_key='provider-id-second'`,
  );
  check(identifierConflict.status === "failed" && identifierConflictRow.status === "dead"
    && identifierConflictRow.last_error === "provider_identifier_conflict" && identifierConflictRow.delivery_status === "failed",
  "duplicate provider identifiers fail generically without corrupting parent truth");

  const cliEvents: string[] = [];
  let injectedConnects = 0;
  let injectedReleases = 0;
  let injectedEnds = 0;
  let cliReport = "";
  const injectedPool = {
    totalCount: 1,
    async connect() { injectedConnects += 1; return { release() { injectedReleases += 1; } }; },
    async end() { injectedEnds += 1; },
  };
  await worker.main({
    db: injectedPool,
    async runRetryBatch(db: unknown) { assert.equal(db, injectedPool); cliEvents.push("retry"); return { claimed: 0, accepted: 0, retryDue: 0, dead: 0 }; },
    async pollReceiptBatch(db: unknown) { assert.equal(db, injectedPool); cliEvents.push("receipt"); return { claimed: 0, delivered: 0, errors: 0 }; },
    log(value: unknown) { cliReport = String(value); cliEvents.push("report"); },
  });
  check(cliEvents.join(",") === "retry,receipt,report" && injectedConnects === 0 && injectedReleases === 0 && injectedEnds === 0,
    "CLI main uses an injected Pool without leaking a connect handle or ending caller-owned state");
  check(cliReport.includes("receipt_accepted=0") && cliReport.includes("receipt_pending=0") && cliReport.includes("receipt_provider_errors=0"),
    "CLI aggregate report includes receipt backoff and provider-wide error counts");
  const ownedPoolEvents: string[] = [];
  await worker.main({
    createDb() {
      return {
        totalCount: 0,
        async query() { return { rows: [] }; },
        async connect() { ownedPoolEvents.push("connect"); return { release() { ownedPoolEvents.push("release"); } }; },
        async end() { ownedPoolEvents.push("end"); },
      };
    },
    async runRetryBatch() { ownedPoolEvents.push("retry"); return { claimed: 0, accepted: 0, retryDue: 0, dead: 0 }; },
    async pollReceiptBatch() { ownedPoolEvents.push("receipt"); return { claimed: 0, delivered: 0, errors: 0 }; },
    log() { ownedPoolEvents.push("report"); },
  });
  check(ownedPoolEvents.join(",") === "retry,receipt,report,end",
    "CLI main does not acquire an unused handle from an internally-owned Pool and ends only that owned Pool");
  const cliFailureEvents: string[] = [];
  let cliFailed = false;
  try {
    await worker.main({
      db: injectedPool,
      async runRetryBatch() { cliFailureEvents.push("retry"); throw new Error("fixture-worker-failure"); },
      async pollReceiptBatch() { cliFailureEvents.push("receipt"); return { claimed: 0, delivered: 0, errors: 0 }; },
      log() { cliFailureEvents.push("report"); },
    });
  } catch {
    cliFailed = true;
  }
  check(cliFailed && cliFailureEvents.join(",") === "retry" && injectedConnects === 0 && injectedReleases === 0 && injectedEnds === 0,
    "CLI main exposes injected-worker failure without polling, reporting, or closing caller-owned state");

  const unlockEvents: Array<string | boolean> = [];
  const unlockClient = {
    async query(sql: string) {
      if (sql.includes("pg_advisory_unlock")) throw new Error("fixture advisory unlock failed");
      return { rows: [{ pg_advisory_lock: null }] };
    },
    release(destroy: boolean) { unlockEvents.push(destroy); },
  };
  const unlockPool = {
    totalCount: 1,
    async connect() { unlockEvents.push("connect"); return unlockClient; },
  };
  await assert.rejects(
    delivery.withInstallationLock(unlockPool, fcmInstallation, async () => "finished"),
    /advisory unlock failed/u,
  );
  check(unlockEvents.join(",") === "connect,true", "an advisory unlock failure is surfaced and destroys the pooled client instead of reusing it");

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

  async function reservePolicyAttempt(key: string, options: {
    privacy?: boolean;
    transactional?: boolean;
    kind?: "daily" | "service" | "yam" | "qimen";
    sourceFacts?: Record<string, unknown>;
  } = {}) {
    const tokenId = crypto.randomUUID();
    const installationId = crypto.randomUUID();
    const kind = options.kind || "daily";
    await pool!.query(
      `UPDATE mobile_notification_prefs SET daily_enabled=true,yam_enabled=true,qimen_enabled=true,service_enabled=true,paused_until=NULL,
         quiet_start=0,quiet_end=0,max_per_day=100,privacy_preview=$2 WHERE user_id=$1`,
      [userId, options.privacy === true],
    );
    await pool!.query(
      `INSERT INTO mobile_push_tokens
         (id,user_id,installation_id,expo_push_token,device_token_type,platform,locale,last_registered_at)
       VALUES($1,$2,$3,$4,'apns','ios','en',now())`,
      [tokenId, userId, installationId, `ExponentPushToken[policy-${tokenId}]`],
    );
    const date = new Date().toISOString().slice(0, 10);
    const payload = kind === "service"
      ? { v: 1, kind, accountId: userId, event: "support_reply", referenceId: `case-${key}`, url: "/support" }
      : kind === "yam"
        ? { v: 1, kind, accountId: userId, range: "09:00-11:00", quality: "best", date, url: "/today" }
        : kind === "qimen"
          ? { v: 1, kind, accountId: userId, date, direction: "SE", score: 67, url: "/qimen/board" }
          : { v: 1, kind, accountId: userId, slot: "morning", date, url: "/today" };
    const reservation = await delivery.reserve(pool, {
      userId, key, kind, transactional: options.transactional === true,
      title: "Authenticated history detail", body: "Sensitive immutable detail", payload,
      sourceFacts: options.sourceFacts,
      messages: [{ tokenId, expoToken: `ExponentPushToken[policy-${tokenId}]`, platform: "ios", locale: "en",
        category: kind, title: "Detailed preview", body: "Sensitive preview", url: payload.url, data: payload }],
    });
    assert.ok(reservation?.attemptIds?.[0]);
    return reservation.attemptIds;
  }

  async function assertPolicyBlocked(
    key: string,
    mutate: () => Promise<unknown>,
    expected: string,
    options: {
      privacy?: boolean;
      kind?: "daily" | "service" | "yam" | "qimen";
      sourceFacts?: Record<string, unknown>;
      policyNow?: string;
    } = {},
  ) {
    const attemptIds = await reservePolicyAttempt(key, options);
    await mutate();
    let calls = 0;
    await worker.runRetryBatch(pool, {
      attemptIds, limit: 1, hooks: options.policyNow ? { policyNow: options.policyNow } : undefined,
      sender: { async sendPrepared() { calls += 1; return { kind: "provider_accepted" }; } },
    });
    const attempt = await row(`SELECT status,last_error FROM mobile_push_attempts WHERE id=$1`, [attemptIds[0]]);
    check(calls === 0 && attempt.last_error === expected, `${key}: current policy is re-read and blocks provider delivery (${expected})`);
    return attempt;
  }

  await assertPolicyBlocked("policy-revoked", async () => {
    await pool!.query(`UPDATE mobile_notification_prefs SET daily_enabled=false WHERE user_id=$1`, [userId]);
  }, "policy_consent_revoked");
  const paused = await assertPolicyBlocked("policy-paused", async () => {
    await pool!.query(`UPDATE mobile_notification_prefs SET paused_until=now()+interval '1 hour' WHERE user_id=$1`, [userId]);
  }, "policy_paused");
  check(paused.status === "retry_due", "pause defers the immutable attempt durably");
  const nowHour = new Date().getUTCHours();
  const quiet = await assertPolicyBlocked("policy-quiet", async () => {
    await pool!.query(
      `UPDATE mobile_notification_prefs SET timezone='UTC',quiet_start=$2,quiet_end=$3 WHERE user_id=$1`,
      [userId, nowHour, (nowHour + 1) % 24],
    );
  }, "policy_quiet_hours");
  check(quiet.status === "retry_due", "quiet hours back off the immutable attempt durably");
  await assertPolicyBlocked("policy-privacy", async () => {
    await pool!.query(`UPDATE mobile_notification_prefs SET privacy_preview=false WHERE user_id=$1`, [userId]);
  }, "policy_privacy_changed", { privacy: true });
  await assertPolicyBlocked("policy-cap", async () => {
    await pool!.query(`UPDATE mobile_notification_prefs SET max_per_day=1 WHERE user_id=$1`, [userId]);
  }, "policy_cap_reached");
  const unlimitedIds = await reservePolicyAttempt("policy-unlimited");
  await pool.query(`UPDATE mobile_notification_prefs SET max_per_day=0 WHERE user_id=$1`, [userId]);
  let unlimitedCalls = 0;
  const unlimitedResult = await worker.runRetryBatch(pool, {
    attemptIds: unlimitedIds, limit: 1,
    sender: { async sendPrepared() { unlimitedCalls += 1; return { kind: "provider_accepted" }; } },
  });
  check(unlimitedCalls === 1 && unlimitedResult.accepted === 1,
    "max_per_day=0 keeps an immutable retry eligible after earlier daily notifications");
  await assertPolicyBlocked("policy-expired-day", async () => {
    await pool!.query(
      `UPDATE mobile_push_attempts SET created_at=now()-interval '1 day'
        WHERE push_log_id=(SELECT id FROM mobile_push_log WHERE yam_key='policy-expired-day')`,
    );
  }, "policy_expired_local_day");

  const occurrenceNow = "2026-08-19T01:00:00.000Z";
  await assertPolicyBlocked("policy-expired-qimen", async () => {}, "policy_expired_occurrence", {
    kind: "qimen", policyNow: occurrenceNow,
    sourceFacts: { eventStartAt: "2026-08-19T00:21:00.000Z", eventEndAt: "2026-08-19T01:04:59.000Z" },
  });
  await assertPolicyBlocked("policy-missing-yam-expiry", async () => {}, "policy_missing_occurrence_expiry", {
    kind: "yam", policyNow: occurrenceNow, sourceFacts: { eventStartAt: "2026-08-19T00:00:00.000Z" },
  });
  const validQimenIds = await reservePolicyAttempt("policy-valid-qimen", {
    kind: "qimen",
    sourceFacts: { eventStartAt: "2026-08-19T00:21:00.000Z", eventEndAt: "2026-08-19T01:05:01.000Z" },
  });
  await pool.query(
    `UPDATE mobile_push_attempts SET created_at=$2
      WHERE id=ANY($1::uuid[])`,
    [validQimenIds, occurrenceNow],
  );
  let validQimenCalls = 0;
  const validQimen = await worker.runRetryBatch(pool, {
    attemptIds: validQimenIds, limit: 1, hooks: { policyNow: occurrenceNow },
    sender: { async sendPrepared() { validQimenCalls += 1; return { kind: "provider_accepted", providerTicketId: "valid-qimen-ticket" }; } },
  });
  check(validQimenCalls === 1 && validQimen.accepted === 1,
    "a Qimen attempt with more than its exact provider TTL remaining may be sent once");

  const transactionalIds = await reservePolicyAttempt("policy-transactional", { transactional: true, kind: "service" });
  await pool.query(
    `UPDATE mobile_notification_prefs SET service_enabled=false,paused_until=now()+interval '1 hour',
       max_per_day=0,quiet_start=0,quiet_end=23,privacy_preview=false WHERE user_id=$1`,
    [userId],
  );
  let transactionalCalls = 0;
  const transactionalResult = await worker.runRetryBatch(pool, {
    attemptIds: transactionalIds, limit: 1,
    sender: { async sendPrepared() { transactionalCalls += 1; return { kind: "provider_accepted", providerTicketId: "transactional-ticket" }; } },
  });
  check(transactionalCalls === 1 && transactionalResult.accepted === 1,
    "an explicitly transactional safe-preview service attempt bypasses consent, pause, quiet hours and cap");

  console.log(`${checks} mobile push retry checks passed`);
} finally {
  await pool?.end().catch(() => null);
  try {
    psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${databaseRole};`);
  } catch {
    // Preserve the original failure; the hard-guarded disposable DB is unique.
  }
}
