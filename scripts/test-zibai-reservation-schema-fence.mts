import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import delivery from "../src/lib/mobile-notification-delivery.cjs";
import { buildZibaiSnapshot } from "../src/lib/zibai-science.ts";
import scheduler from "./mobile-zibai-push-cron.cjs";

const database = `zibai_schema_fence_${process.pid}`;
const role = `zibai_schema_fence_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
const userId = "00000000-0000-4000-8000-000000000001";
const nextUserId = "00000000-0000-4000-8000-000000000002";
const installationId = "10000000-0000-4000-8000-000000000001";
const tokenId = "20000000-0000-4000-8000-000000000001";

function psql(db: string, sql: string) {
  return execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"], { encoding: "utf8", input: sql }).trim();
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY,is_active boolean NOT NULL DEFAULT true,deleted_at timestamptz,timezone text DEFAULT 'UTC',locale text DEFAULT 'en',tier text DEFAULT 'free',sub_expires_at timestamptz,trial_ends_at timestamptz);
    CREATE TABLE mobile_push_tokens(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),installation_id uuid NOT NULL,
      expo_push_token text NOT NULL UNIQUE,device_push_token text,device_token_type text,platform text NOT NULL,app_version text,
      locale text,timezone text,enabled boolean NOT NULL DEFAULT true,fail_count integer NOT NULL DEFAULT 0,last_registered_at timestamptz,
      last_success_at timestamptz,disabled_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id,installation_id)
    );
    CREATE TABLE mobile_notification_prefs(
      user_id uuid PRIMARY KEY REFERENCES users(id),timezone text DEFAULT 'UTC',locale text DEFAULT 'en',privacy_preview boolean NOT NULL DEFAULT false,
      security_enabled boolean NOT NULL DEFAULT true,saved_date_enabled boolean NOT NULL DEFAULT false,daily_enabled boolean NOT NULL DEFAULT true,
      yam_enabled boolean NOT NULL DEFAULT false,qimen_enabled boolean NOT NULL DEFAULT false,shrine_enabled boolean NOT NULL DEFAULT false,
      goal_enabled boolean NOT NULL DEFAULT false,service_enabled boolean NOT NULL DEFAULT true,quiet_start int NOT NULL DEFAULT 0,
      quiet_end int NOT NULL DEFAULT 0,max_per_day int NOT NULL DEFAULT 100,paused_until timestamptz
    );
    CREATE TABLE mobile_push_log(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),yam_key text NOT NULL,kind text NOT NULL,
      title text NOT NULL,body text NOT NULL,payload jsonb NOT NULL DEFAULT '{}'::jsonb,sent_at timestamptz,read_at timestamptz,
      delivery_status text NOT NULL DEFAULT 'accepted' CHECK(delivery_status IN ('pending','accepted','failed')),attempt_count integer NOT NULL DEFAULT 0,
      next_retry_at timestamptz,accepted_at timestamptz,last_error text,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,yam_key)
    );
  `);
  psql(database, readFileSync("migrations/20260815_mobile_notification_integrity.sql", "utf8"));
  psql(database, readFileSync("migrations/20260816_mobile_zibai_notifications.sql", "utf8"));
  psql(database, readFileSync("migrations/20260819_mobile_zibai_three_layer.sql", "utf8"));
  psql(database, readFileSync("migrations/20260823_mobile_zibai_v3_compatibility.sql", "utf8"));
  psql(database, `
    INSERT INTO users(id) VALUES('${userId}'),('${nextUserId}');
    INSERT INTO mobile_notification_prefs(user_id) VALUES('${userId}');
    INSERT INTO mobile_push_tokens(id,user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,locale,zibai_payload_schema,zibai_calculation_version)
      VALUES('${tokenId}','${userId}','${installationId}','ExponentPushToken[zibaischemafence]','fcm-schema-fence','fcm','android','en',2,'zibai-zaoming-true-solar-v2');
    INSERT INTO mobile_zibai_installations(user_id,installation_id,calculation_version)
      VALUES('${userId}','${installationId}','zibai-zaoming-true-solar-v2');
    INSERT INTO mobile_zibai_occurrences(user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version,state)
      VALUES('${userId}','${installationId}','schema-fence','shichen','2026-08-16','si','zibai-zaoming-true-solar-v2','claimed');
    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};
  `);
  const pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 3 });
  const registration = await pool.connect();
  let registrationOpen = false;
  try {
    const occurrenceId = (await pool.query(`SELECT id::text FROM mobile_zibai_occurrences WHERE occurrence_key='schema-fence'`)).rows[0].id;
    const snapshot = buildZibaiSnapshot(new Date("2026-08-16T03:00:00.000Z"), 100.5018);
    const notice = scheduler.buildZibaiNotice({
      user_id: userId,installation_id: installationId,token_id: tokenId,zibai_payload_schema: 2,
      calculation_version: "zibai-zaoming-true-solar-v2",zibai_calculation_version: "zibai-zaoming-true-solar-v2",
      device_push_token: "fcm-schema-fence",device_token_type: "fcm",expo_push_token: "ExponentPushToken[zibaischemafence]",
      platform: "android",token_locale: "en",privacy_preview: false,
    }, "zibai_shichen", snapshot, occurrenceId);
    assert.equal(notice.payload.snapshotSchema, 2, "producer builds v2 from the capability observed before reservation");

    await pool.query(`UPDATE mobile_zibai_occurrences SET calculation_version='zibai-zaoming-true-solar-v3' WHERE id=$1`, [occurrenceId]);
    await assert.rejects(() => delivery.reserve(pool, notice), /zibai_occurrence_binding_changed/u,
      "a v2 notice can never reserve against a v3 occurrence row");
    await pool.query(`UPDATE mobile_zibai_occurrences SET calculation_version='zibai-zaoming-true-solar-v2' WHERE id=$1`, [occurrenceId]);

    await registration.query("BEGIN");
    registrationOpen = true;
    await registration.query(`UPDATE mobile_push_tokens SET zibai_calculation_version='zibai-zaoming-true-solar-v3',updated_at=now() WHERE id=$1`, [tokenId]);
    await registration.query(`UPDATE mobile_zibai_installations SET calculation_version='zibai-zaoming-true-solar-v3',updated_at=now() WHERE user_id=$1 AND installation_id=$2`, [userId, installationId]);
    const calculationActivationReservation = delivery.reserve(pool, notice);
    assert.equal(await Promise.race([
      calculationActivationReservation.then(() => "settled", () => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 100)),
    ]), "blocked", "durable reservation waits for the concurrent calculation-capability row lock");
    await registration.query("COMMIT");
    registrationOpen = false;
    await assert.rejects(() => calculationActivationReservation, /zibai_token_calculation_capability_changed/u,
      "the V2 compatibility producer rejects a stale prebuilt notice after concurrent V3 activation");
    await pool.query(`UPDATE mobile_push_tokens SET zibai_calculation_version='zibai-zaoming-true-solar-v2' WHERE id=$1`, [tokenId]);
    await pool.query(`UPDATE mobile_zibai_installations SET calculation_version='zibai-zaoming-true-solar-v2' WHERE user_id=$1 AND installation_id=$2`, [userId, installationId]);

    await registration.query("BEGIN");
    registrationOpen = true;
    await registration.query(`UPDATE mobile_push_tokens SET zibai_payload_schema=1,updated_at=now() WHERE id=$1`, [tokenId]);
    const reservation = delivery.reserve(pool, notice);
    const stateBeforeCommit = await Promise.race([
      reservation.then(() => "settled", () => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 100)),
    ]);
    assert.equal(stateBeforeCommit, "blocked", "durable reservation waits for the concurrent registration row lock");
    await registration.query("COMMIT");
    registrationOpen = false;
    await assert.rejects(() => reservation, /zibai_token_capability_changed/u,
      "reservation rejects a prebuilt v2 notice after concurrent downgrade to v1");
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_push_log`)).rows[0].n, 0);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_push_attempts`)).rows[0].n, 0);
    assert.deepEqual((await pool.query(`SELECT state,push_log_id FROM mobile_zibai_occurrences`)).rows,
      [{ state: "claimed", push_log_id: null }], "a fenced mismatch remains recoverable with the new exact capability");

    await pool.query(`UPDATE mobile_push_tokens SET zibai_payload_schema=2 WHERE id=$1`, [tokenId]);

    await pool.query(`INSERT INTO mobile_zibai_occurrences(user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version,state)
      VALUES($1,$2,'delivery-capability-fence','daily',$3,NULL,'zibai-zaoming-true-solar-v2','claimed')`,
    [userId, installationId, snapshot.day.meta.apparentSolarDate]);
    const deliveryOccurrenceId = (await pool.query(`SELECT id::text FROM mobile_zibai_occurrences WHERE occurrence_key='delivery-capability-fence'`)).rows[0].id;
    const deliveryNotice = scheduler.buildZibaiNotice({
      user_id: userId,installation_id: installationId,token_id: tokenId,zibai_payload_schema: 2,
      calculation_version: "zibai-zaoming-true-solar-v2",zibai_calculation_version: "zibai-zaoming-true-solar-v2",
      device_push_token: "fcm-schema-fence",device_token_type: "fcm",expo_push_token: "ExponentPushToken[zibaischemafence]",
      platform: "android",token_locale: "en",privacy_preview: false,
    }, "zibai_daily", snapshot, deliveryOccurrenceId);
    const durable = await delivery.reserve(pool, deliveryNotice);
    assert.equal(durable?.attemptIds.length, 1, "v2 notice reserves exactly one immutable provider attempt");
    await pool.query(`UPDATE mobile_push_tokens SET zibai_calculation_version='zibai-zaoming-true-solar-v3',updated_at=now() WHERE id=$1`, [tokenId]);
    await pool.query(`UPDATE mobile_zibai_installations SET calculation_version='zibai-zaoming-true-solar-v3',updated_at=now() WHERE user_id=$1 AND installation_id=$2`, [userId, installationId]);
    let providerSends = 0;
    const fencedDelivery = await delivery.runRetryBatch(pool, {
      attemptIds: durable?.attemptIds, limit: 1,
      hooks: { policyNow: new Date("2026-08-16T03:00:00.000Z") },
      sender: { sendPrepared: async () => { providerSends += 1; return { kind: "provider_accepted" }; } },
    });
    assert.equal(providerSends, 0, "a durable v2 attempt is never sent after the installation activates v3");
    assert.equal(fencedDelivery.dead, 1, "the stale cross-version attempt terminates without replay");
    assert.deepEqual(fencedDelivery.outcomes,
      [{ kind: "policy_blocked", reason: "policy_calculation_version_changed", retryable: false }]);
    assert.equal((await pool.query(`SELECT send_count::int AS n,last_error FROM mobile_push_attempts WHERE id=$1`, [durable?.attemptIds[0]])).rows[0].n, 0,
      "the capability fence runs before the irreversible provider-send boundary");
    await pool.query(`UPDATE mobile_push_tokens SET zibai_calculation_version='zibai-zaoming-true-solar-v2' WHERE id=$1`, [tokenId]);
    await pool.query(`UPDATE mobile_zibai_installations SET calculation_version='zibai-zaoming-true-solar-v2' WHERE user_id=$1 AND installation_id=$2`, [userId, installationId]);
    const parentsBeforeTransfer = (await pool.query(`SELECT count(*)::int AS n FROM mobile_push_log`)).rows[0].n;
    const attemptsBeforeTransfer = (await pool.query(`SELECT count(*)::int AS n FROM mobile_push_attempts`)).rows[0].n;

    await registration.query("BEGIN");
    registrationOpen = true;
    await registration.query(`SELECT id FROM mobile_push_tokens WHERE id=$1 FOR UPDATE`, [tokenId]);
    const transferredReservation = delivery.reserve(pool, notice);
    assert.equal(await Promise.race([
      transferredReservation.then(() => "settled", () => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 100)),
    ]), "blocked", "old-owner reservation waits behind the registration token lock");
    const deletion = registration.query(`DELETE FROM mobile_zibai_installations WHERE user_id=$1 AND installation_id=$2`, [userId, installationId]);
    const deletionOutcome = await Promise.race([
      deletion.then(() => "deleted", (error: { code?: string }) => `error:${error.code || "unknown"}`),
      new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 2_000)),
    ]);
    assert.equal(deletionOutcome, "deleted",
      "cross-account registration can cascade the occurrence without a token/occurrence deadlock");
    await registration.query(`UPDATE mobile_push_tokens SET user_id=$2,updated_at=now() WHERE id=$1`, [tokenId, nextUserId]);
    await registration.query("COMMIT");
    registrationOpen = false;
    await assert.rejects(() => transferredReservation, /zibai_token_capability_changed/u,
      "reservation rejects the old-owner notice after a concurrent installation transfer");
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_push_log`)).rows[0].n, parentsBeforeTransfer);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_push_attempts`)).rows[0].n, attemptsBeforeTransfer);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_zibai_occurrences`)).rows[0].n, 0);
    console.log("ZIBAI_RESERVATION_SCHEMA_FENCE_OK concurrentSchemaDowngrade=1 concurrentVersionActivation=1 postReservationVersionFlip=1 crossAccountTransfer=1 staleCrossVersionSends=0");
  } finally {
    if (registrationOpen) await registration.query("ROLLBACK").catch(() => null);
    registration.release();
    await pool.end();
  }
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch { /* guarded cleanup */ }
}
