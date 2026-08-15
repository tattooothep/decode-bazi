import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { updateNotificationPreferences } from "../src/lib/mobile-notification-preferences.ts";

const database = `notification_preference_race_test_${process.pid}`;
const role = `notification_preference_race_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
const userId = "00000000-0000-4000-8000-000000000001";

assert.match(database, /^notification_preference_race_test_/u, "preference race test database is disposable");

function psql(db: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"],
    { encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

async function waitForAdvisoryWaiters(observer: pg.Pool, minimum: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await observer.query(
      `SELECT count(*)::int AS n FROM pg_locks
        WHERE locktype='advisory' AND NOT granted
          AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`,
    );
    if (Number(result.rows[0]?.n || 0) >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`expected ${minimum} advisory lock waiters`);
}

let pool: pg.Pool | undefined;
let lockClient: pg.PoolClient | undefined;
try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE TABLE users(id uuid PRIMARY KEY,timezone text DEFAULT 'Asia/Bangkok');
    CREATE TABLE mobile_notification_prefs(
      user_id uuid PRIMARY KEY REFERENCES users(id),timezone text DEFAULT 'Asia/Bangkok',
      security_enabled boolean NOT NULL DEFAULT true,saved_date_enabled boolean NOT NULL DEFAULT false,
      yam_enabled boolean NOT NULL DEFAULT false,auspicious_enabled boolean NOT NULL DEFAULT false,
      daily_enabled boolean NOT NULL DEFAULT false,qimen_enabled boolean NOT NULL DEFAULT false,
      shrine_enabled boolean NOT NULL DEFAULT false,goal_enabled boolean NOT NULL DEFAULT false,
      service_enabled boolean NOT NULL DEFAULT true,yam_min_quality text NOT NULL DEFAULT 'best',
      yam_lead_minutes int NOT NULL DEFAULT 60,daily_slot text NOT NULL DEFAULT 'morning',
      quiet_start int NOT NULL DEFAULT 22,quiet_end int NOT NULL DEFAULT 7,max_per_day int NOT NULL DEFAULT 2,
      paused_until timestamptz,qimen_latitude float8,qimen_longitude float8,qimen_location_updated_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),privacy_preview boolean NOT NULL DEFAULT false,locale text NOT NULL DEFAULT 'th'
    );
    INSERT INTO users(id,timezone) VALUES('${userId}','Asia/Bangkok');
    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT,INSERT,UPDATE,DELETE ON users,mobile_notification_prefs TO ${role};
  `);
  const connection = { host: "127.0.0.1", port: 5433, database, user: role, password };
  pool = new pg.Pool({ ...connection, max: 5 });
  lockClient = await pool.connect();
  await lockClient.query("BEGIN");
  await lockClient.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||$1::text,0))`,
    [userId],
  );

  const savedDateWrite = updateNotificationPreferences(pool, userId, { savedDate: true });
  await waitForAdvisoryWaiters(pool, 1);
  const qimenWrite = updateNotificationPreferences(pool, userId, {
    qimen: true, qimenLatitude: 13.7563, qimenLongitude: 100.5018,
  });
  await waitForAdvisoryWaiters(pool, 2);
  await lockClient.query("COMMIT");
  lockClient.release();
  lockClient = undefined;
  await Promise.all([savedDateWrite, qimenWrite]);

  const merged = (await pool.query(
    `SELECT saved_date_enabled,qimen_enabled,qimen_latitude,qimen_longitude FROM mobile_notification_prefs WHERE user_id=$1`,
    [userId],
  )).rows[0];
  assert.deepEqual(
    merged,
    { saved_date_enabled: true, qimen_enabled: true, qimen_latitude: 13.7563, qimen_longitude: 100.5018 },
    "two API preference writes serialize and merge fields instead of losing the first update",
  );

  psql(database, `
    CREATE FUNCTION fail_notification_pref_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.locale='ru' THEN RAISE EXCEPTION 'forced private preference failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_notification_pref_update BEFORE INSERT OR UPDATE ON mobile_notification_prefs
      FOR EACH ROW EXECUTE FUNCTION fail_notification_pref_update();
  `);
  await assert.rejects(
    updateNotificationPreferences(pool, userId, { daily: true, locale: "ru" }),
    /forced private preference failure/u,
    "database errors are surfaced to the API boundary",
  );
  const rolledBack = (await pool.query(
    `SELECT daily_enabled,locale FROM mobile_notification_prefs WHERE user_id=$1`,
    [userId],
  )).rows[0];
  assert.deepEqual(rolledBack, { daily_enabled: false, locale: "th" }, "a failed partial update rolls back every requested field");
  console.log("NOTIFICATION_PREFERENCE_RACE_OK");
} finally {
  if (lockClient) {
    await lockClient.query("ROLLBACK").catch(() => null);
    lockClient.release();
  }
  await pool?.end();
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch {}
}
