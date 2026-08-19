import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import pg from "pg";

const require = createRequire(import.meta.url);
const scheduler = require("./mobile-zibai-push-cron.cjs");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const database = `zibai_scheduler_db_${process.pid}`;
const role = `zibai_scheduler_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
const at = new Date("2026-08-16T06:59:00.000Z");

function psql(db: string, sql: string): string {
  return execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"], { encoding: "utf8", input: sql }).trim();
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY,deleted_at timestamptz);
    CREATE TABLE mobile_push_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE mobile_push_tokens(
      id uuid PRIMARY KEY,user_id uuid NOT NULL,installation_id uuid NOT NULL,enabled boolean NOT NULL,
      device_push_token text,device_token_type text,expo_push_token text,platform text,locale text
    );
    CREATE TABLE mobile_notification_prefs(user_id uuid PRIMARY KEY,privacy_preview boolean NOT NULL DEFAULT false);
  `);
  psql(database, readFileSync("migrations/20260816_mobile_zibai_notifications.sql", "utf8"));
  psql(database, readFileSync("migrations/20260819_mobile_zibai_three_layer.sql", "utf8"));
  psql(database, `
    INSERT INTO users VALUES
      ('00000000-0000-4000-8000-000000000001',NULL),
      ('00000000-0000-4000-8000-000000000002',NULL),
      ('00000000-0000-4000-8000-000000000003',NULL),
      ('00000000-0000-4000-8000-000000000004',NULL),
      ('00000000-0000-4000-8000-000000000005',NULL);
    INSERT INTO mobile_push_tokens VALUES
      ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true,'native-1','fcm','ExponentPushToken[one]','android','th'),
      ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',true,'native-2','fcm','ExponentPushToken[two]','android','en'),
      ('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',true,'native-3','fcm','ExponentPushToken[three]','android','en'),
      ('20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',true,'native-4','fcm','ExponentPushToken[four]','android','en'),
      ('20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',true,'native-5','fcm','ExponentPushToken[five]','android','en');
    INSERT INTO mobile_notification_prefs VALUES
      ('00000000-0000-4000-8000-000000000001',false),
      ('00000000-0000-4000-8000-000000000002',false),
      ('00000000-0000-4000-8000-000000000003',false),
      ('00000000-0000-4000-8000-000000000004',false),
      ('00000000-0000-4000-8000-000000000005',false);
    INSERT INTO mobile_zibai_installations
      (user_id,installation_id,shichen_enabled,quiet_start,quiet_end,location_permission,latitude,longitude,location_timezone,location_captured_at,location_expires_at,next_shichen_at)
    VALUES
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true,22,7,'background',13.75,0,'UTC','${new Date(at.getTime() - 60_000).toISOString()}','${new Date(at.getTime() + 23 * 3_600_000).toISOString()}','${new Date(at.getTime() - 1_000).toISOString()}'),
      ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',true,0,0,'background',13.75,0,'UTC','${new Date(at.getTime() - (7 * 24 * 3_600_000 - 60_000)).toISOString()}','${new Date(at.getTime() + 60_000).toISOString()}','${new Date(at.getTime() - 1_000).toISOString()}'),
      ('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',true,0,0,'background',13.75,0,'UTC','${new Date(at.getTime() - 60_000).toISOString()}','${new Date(at.getTime() + 23 * 3_600_000).toISOString()}','${new Date(at.getTime() - 1_000).toISOString()}');
    INSERT INTO mobile_zibai_installations
      (user_id,installation_id,shichen_enabled,quiet_start,quiet_end,location_permission,latitude,longitude,location_timezone,location_captured_at,location_expires_at,next_shichen_at)
    VALUES
      ('00000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',true,0,0,'background',13.75,0,'UTC','${new Date(at.getTime() - 60_000).toISOString()}','${new Date(at.getTime() + 23 * 3_600_000).toISOString()}','${new Date(at.getTime() - 1_000).toISOString()}');
    INSERT INTO mobile_zibai_installations
      (user_id,installation_id,daily_enabled,daily_minute,quiet_start,quiet_end,location_permission,latitude,longitude,location_timezone,location_captured_at,location_expires_at,next_daily_at)
    VALUES
      ('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',true,419,22,7,'foreground',13.75,0,'UTC','${new Date(at.getTime() - 60_000).toISOString()}','${new Date(at.getTime() + 23 * 3_600_000).toISOString()}','${new Date(at.getTime() - 1_000).toISOString()}');
    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};
  `);
  const pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 4 });
  const originalDeliver = delivery.deliver;
  let providerReservations = 0;
  const reservedNotices: any[] = [];
  let failDurableReservation = true;
  delivery.deliver = async (_db: unknown, notice: { userId: string }) => {
    if (notice.userId === "00000000-0000-4000-8000-000000000005" && failDurableReservation) throw new Error("synthetic_durable_reservation_failure");
    providerReservations += 1;
    reservedNotices.push(notice);
    return { status: "pending" };
  };
  try {
    const claimed = await scheduler.claimDue(pool, at, 10);
    const byUser = new Map(claimed.map((claim: { user_id: string }) => [claim.user_id, claim]));
    const quietClaim = byUser.get("00000000-0000-4000-8000-000000000001");
    const failingClaim = byUser.get("00000000-0000-4000-8000-000000000002");
    const recoveryClaim = byUser.get("00000000-0000-4000-8000-000000000003");
    const delayedDailyClaim = byUser.get("00000000-0000-4000-8000-000000000004");
    const durableFailureClaim = byUser.get("00000000-0000-4000-8000-000000000005");
    assert.ok(quietClaim && failingClaim && recoveryClaim && delayedDailyClaim && durableFailureClaim);
    const science = await import("../src/lib/zibai-science.ts");
    const state = await import("../src/lib/mobile-zibai-installation.ts");
    const workingScience = { ...science, nextCivilMinute: state.nextCivilMinute };
    const quietResult = await scheduler.processClaim(pool, quietClaim, at, workingScience);
    assert.deepEqual(quietResult, { reserved: 0, skipped: 1, reason: "quiet_hours" });
    assert.equal(providerReservations, 0, "quiet shichen is skipped before any provider reservation");
    const quietState = await pool.query(`SELECT lease_token,last_skip_reason,next_shichen_at FROM mobile_zibai_installations WHERE user_id=$1`, [quietClaim.user_id]);
    assert.equal(quietState.rows[0].lease_token, null);
    assert.equal(quietState.rows[0].last_skip_reason, "quiet_hours");
    assert.ok(new Date(quietState.rows[0].next_shichen_at).getTime() > at.getTime());
    const quietOccurrence = await pool.query(`SELECT state,skip_reason FROM mobile_zibai_occurrences WHERE user_id=$1`, [quietClaim.user_id]);
    assert.deepEqual(quietOccurrence.rows, [{ state: "skipped", skip_reason: "quiet_hours" }]);

    const failingScience = { ...workingScience, buildZibaiSnapshot() { throw new Error("synthetic_engine_failure"); } };
    const failureResult = await scheduler.processClaim(pool, failingClaim, at, failingScience);
    assert.deepEqual(failureResult, { reserved: 0, skipped: 1, reason: "engine_unavailable" });
    assert.equal(providerReservations, 0);
    const failureState = await pool.query(`SELECT lease_token,lease_expires_at,last_skip_reason,next_shichen_at FROM mobile_zibai_installations WHERE user_id=$1`, [failingClaim.user_id]);
    assert.equal(failureState.rows[0].lease_token, null, "engine failure cannot strand the scheduler lease");
    assert.equal(failureState.rows[0].lease_expires_at, null);
    assert.equal(failureState.rows[0].last_skip_reason, "engine_unavailable");
    assert.ok(new Date(failureState.rows[0].next_shichen_at).getTime() > at.getTime());

    const recoverySnapshot = workingScience.buildZibaiSnapshot(at, Number(recoveryClaim.longitude));
    const strandedOccurrenceId = await scheduler.admitOccurrence(pool, recoveryClaim, "zibai_shichen", recoverySnapshot);
    assert.ok(strandedOccurrenceId, "fixture must persist the occurrence before simulating a process crash");
    const recoveryResult = await scheduler.processClaim(pool, recoveryClaim, at, workingScience);
    assert.deepEqual(recoveryResult, { reserved: 1, skipped: 0, reason: null }, "a crash-stranded claimed occurrence must resume its durable reservation");
    const recoveryOccurrences = await pool.query(`SELECT id,state,push_log_id FROM mobile_zibai_occurrences WHERE user_id=$1`, [recoveryClaim.user_id]);
    assert.equal(recoveryOccurrences.rows.length, 1, "crash recovery must reuse rather than duplicate the occurrence");
    assert.equal(recoveryOccurrences.rows[0].id, strandedOccurrenceId);
    assert.equal(providerReservations, 1);

    const delayedResult = await scheduler.processClaim(pool, delayedDailyClaim, at, workingScience);
    assert.deepEqual(delayedResult, { reserved: 0, skipped: 1, reason: "quiet_hours" });
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_zibai_occurrences WHERE user_id=$1`, [delayedDailyClaim.user_id])).rows[0].n, 0,
      "a daily alert delayed by quiet hours must not consume its occurrence key");
    const delayedState = await pool.query(`SELECT next_daily_at FROM mobile_zibai_installations WHERE user_id=$1`, [delayedDailyClaim.user_id]);
    const delayedAt = new Date(delayedState.rows[0].next_daily_at);
    assert.equal(delayedAt.toISOString(), "2026-08-16T07:00:00.000Z");
    const delayedClaims = await scheduler.claimDue(pool, delayedAt, 10);
    assert.equal(delayedClaims.length, 1);
    const deliveredAfterQuiet = await scheduler.processClaim(pool, delayedClaims[0], delayedAt, workingScience);
    assert.deepEqual(deliveredAfterQuiet, { reserved: 1, skipped: 0, reason: null });
    assert.equal(providerReservations, 2);

    await assert.rejects(
      () => scheduler.processClaim(pool, durableFailureClaim, at, workingScience),
      /synthetic_durable_reservation_failure/u,
      "a durable reservation failure must fail the run instead of being mislabeled as an engine skip",
    );
    const stranded = await pool.query(`SELECT z.lease_token,z.next_shichen_at,o.state,o.push_log_id
      FROM mobile_zibai_installations z JOIN mobile_zibai_occurrences o USING(user_id,installation_id)
      WHERE z.user_id=$1`, [durableFailureClaim.user_id]);
    assert.ok(stranded.rows[0].lease_token, "the claim remains fenced until lease expiry");
    assert.ok(new Date(stranded.rows[0].next_shichen_at).getTime() <= at.getTime(), "the occurrence remains due for recovery");
    assert.equal(stranded.rows[0].state, "claimed");
    assert.equal(stranded.rows[0].push_log_id, null);
    await pool.query(`UPDATE mobile_zibai_installations SET lease_expires_at=$2 WHERE user_id=$1`, [durableFailureClaim.user_id, new Date(at.getTime() - 1_000).toISOString()]);
    failDurableReservation = false;
    const resumed = await scheduler.claimDue(pool, at, 10);
    assert.equal(resumed.length, 1);
    assert.deepEqual(await scheduler.processClaim(pool, resumed[0], at, workingScience), { reserved: 1, skipped: 0, reason: null });
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_zibai_occurrences WHERE user_id=$1`, [durableFailureClaim.user_id])).rows[0].n, 1,
      "durable reservation recovery must reuse the original occurrence");
    assert.equal((await scheduler.claimDue(pool, at, 10)).length, 0, "skipped/failed/resumed shichen is never replayed in the same slot");

    await pool.query(`INSERT INTO users VALUES ('00000000-0000-4000-8000-000000000006',NULL)`);
    await pool.query(`INSERT INTO mobile_notification_prefs VALUES ('00000000-0000-4000-8000-000000000006',false)`);
    await pool.query(`
      INSERT INTO mobile_push_tokens
        (id,user_id,installation_id,enabled,device_push_token,device_token_type,expo_push_token,platform,locale,zibai_payload_schema)
      VALUES
        ('20000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',true,'native-6','fcm','ExponentPushToken[six]','android','en',1),
        ('20000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000007',true,'native-7','fcm','ExponentPushToken[seven]','android','en',2)
    `);
    await pool.query(`
      INSERT INTO mobile_zibai_installations
        (user_id,installation_id,shichen_enabled,quiet_start,quiet_end,location_permission,latitude,longitude,location_timezone,location_captured_at,location_expires_at,next_shichen_at)
      VALUES
        ('00000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',true,0,0,'background',13.75,0,'UTC',$1,$2,$3),
        ('00000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000007',true,0,0,'background',13.75,0,'UTC',$1,$2,$3)
    `, [
      new Date(at.getTime() - 60_000).toISOString(),
      new Date(at.getTime() + 23 * 3_600_000).toISOString(),
      new Date(at.getTime() - 1_000).toISOString(),
    ]);
    const mixedClaims = await scheduler.claimDue(pool, at, 10);
    assert.equal(mixedClaims.length, 2, "same-user mixed devices retain separate installation claims");
    for (const mixedClaim of mixedClaims) {
      assert.deepEqual(await scheduler.processClaim(pool, mixedClaim, at, workingScience), { reserved: 1, skipped: 0, reason: null });
    }
    const mixedNotices = reservedNotices.filter((notice) => notice.userId === "00000000-0000-4000-8000-000000000006");
    assert.equal(mixedNotices.length, 2);
    const legacyNotice = mixedNotices.find((notice) => notice.messages[0].tokenId === "20000000-0000-4000-8000-000000000006");
    const capableNotice = mixedNotices.find((notice) => notice.messages[0].tokenId === "20000000-0000-4000-8000-000000000007");
    assert.equal(Object.hasOwn(legacyNotice.payload, "snapshotSchema"), false, "legacy installation reserves exact v1");
    assert.equal(capableNotice.payload.snapshotSchema, 2, "capable installation reserves exact v2");
    assert.equal(legacyNotice.messages.length, 1);
    assert.equal(capableNotice.messages.length, 1);
    assert.notEqual(legacyNotice.key, capableNotice.key, "mixed devices reserve distinct parent keys");
    const mixedOccurrences = await pool.query(
      `SELECT installation_id::text FROM mobile_zibai_occurrences WHERE user_id=$1 ORDER BY installation_id`,
      ["00000000-0000-4000-8000-000000000006"],
    );
    assert.deepEqual(mixedOccurrences.rows.map((row) => row.installation_id), [
      "10000000-0000-4000-8000-000000000006",
      "10000000-0000-4000-8000-000000000007",
    ]);
    console.log("ZIBAI_SCHEDULER_DB_OK quietSkip=1 dailyDelay=1 engineFailureReleased=1 crashRecovery=1 durableRecovery=1 mixedSchemas=2");
  } finally {
    delivery.deliver = originalDeliver;
    await pool.end();
  }
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch { /* guarded cleanup */ }
}
