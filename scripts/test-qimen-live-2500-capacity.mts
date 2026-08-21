import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { createRequire } from "node:module";

function loadEnv(): void {
  if (process.env.QIMEN_DB_TEST_PASSWORD || process.env.DATABASE_URL) return;
  const envPath = process.env.HOURKEY_BACKEND_ENV_PATH || path.resolve(".env.local");
  if (!fs.existsSync(envPath)) throw new Error("QIMEN_DB_TEST_ENV_UNAVAILABLE");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/gu, "");
  }
}

loadEnv();
const require = createRequire(import.meta.url);
const scheduler = require("./mobile-qimen-push-cron.cjs");
const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || "127.0.0.1",
      port: Number(process.env.PGPORT || 5433),
      database: process.env.PGDATABASE || "decode_db",
      user: process.env.PGUSER || "decode_user",
      password: process.env.QIMEN_DB_TEST_PASSWORD || process.env.PGPASSWORD,
    };
const schema = process.env.QIMEN_CAPACITY_SCHEMA || `qimen_capacity_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
if (!/^qimen_capacity_[a-z0-9_]+$/u.test(schema)) throw new Error("QIMEN_CAPACITY_SCHEMA_INVALID");
const quotedSchema = `"${schema}"`;
const migration = fs.readFileSync(new URL("../migrations/20260821_mobile_qimen_three_layer.sql", import.meta.url), "utf8");
const admin = new pg.Client(config);
let pool: pg.Pool | null = null;
let schemaCreated = false;

try {
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${quotedSchema}`);
  schemaCreated = true;
  await admin.query(`SET search_path TO ${quotedSchema},public`);
  await admin.query(`CREATE TABLE users(
    id uuid PRIMARY KEY,
    tier text NOT NULL,
    sub_expires_at timestamptz,
    trial_ends_at timestamptz,
    deleted_at timestamptz,
    is_active boolean NOT NULL DEFAULT true
  )`);
  await admin.query(`CREATE TABLE mobile_push_tokens(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    installation_id uuid NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    device_push_token text,
    device_token_type text,
    expo_push_token text,
    platform text,
    locale text
  )`);
  await admin.query("CREATE TABLE mobile_push_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid())");
  await admin.query(`CREATE TABLE mobile_notification_prefs(
    user_id uuid PRIMARY KEY,
    privacy_preview boolean NOT NULL DEFAULT false,
    paused_until timestamptz
  )`);
  await admin.query(migration);

  const at = new Date("2026-01-06T18:30:00.000Z");
  const releaseCommit = "e".repeat(40);
  await admin.query(
    `INSERT INTO users(id,tier,sub_expires_at,trial_ends_at,deleted_at,is_active)
     SELECT gen_random_uuid(),'premium','2027-08-21T00:00:00Z',NULL,NULL,true
       FROM generate_series(1,2500)`,
  );
  await admin.query(
    `INSERT INTO mobile_qimen_installations
       (user_id,installation_id,enabled,purpose,quiet_start,quiet_end,location_permission,
        latitude,longitude,location_timezone,location_captured_at,location_expires_at,next_due_at)
     SELECT id,gen_random_uuid(),true,'travel',0,0,'foreground',13.7563,100.5018,'Asia/Bangkok',
            $1::timestamptz-interval '1 day',$1::timestamptz+interval '6 days',$1::timestamptz
       FROM users`,
    [at.toISOString()],
  );
  await admin.query(
    `INSERT INTO mobile_push_tokens
       (user_id,installation_id,enabled,device_push_token,device_token_type,expo_push_token,platform,locale,qimen_payload_schema)
     SELECT user_id,installation_id,true,'capacity-device-'||installation_id::text,'fcm',NULL,'android','th',2
       FROM mobile_qimen_installations`,
  );
  await admin.query(
    `UPDATE mobile_qimen_producer_state
        SET producer_enabled=true,backend_commit=$1,enabled_at=now(),enabled_by='capacity-test',updated_at=now()`,
    [releaseCommit],
  );

  pool = new pg.Pool({
    ...config,
    max: 24,
    options: `-c search_path=${schema},public`,
  });
  const started = performance.now();
  const report = await scheduler.runScheduler(pool, new AbortController().signal, at, {
    runtimeProducerEnabled: true,
    backendCommit: releaseCommit,
    batchLimit: 500,
    maxPerRun: 2_500,
    workerCount: 20,
    async deliver(db: pg.Pool, notice: { qimenOccurrenceId: string }) {
      const push = await db.query("INSERT INTO mobile_push_log DEFAULT VALUES RETURNING id");
      const reserved = await db.query(
        `UPDATE mobile_qimen_occurrences
            SET state='reserved',push_log_id=$2,updated_at=now()
          WHERE id=$1 AND state='claimed' AND push_log_id IS NULL`,
        [notice.qimenOccurrenceId, push.rows[0].id],
      );
      assert.equal(reserved.rowCount, 1);
      return { status: "pending" };
    },
  });
  const elapsedMs = performance.now() - started;

  assert.deepEqual(report, { disabled: false, due: 2_500, reserved: 2_500, skipped: 0 });
  const durable = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE state='reserved' AND push_log_id IS NOT NULL)::int AS reserved,
            count(DISTINCT snapshot_digest)::int AS unique_digests
       FROM mobile_qimen_occurrences`,
  );
  assert.deepEqual(durable.rows, [{ total: 2_500, reserved: 2_500, unique_digests: 2_500 }]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM mobile_push_log")).rows[0].n, 2_500);
  assert.equal((await pool.query(
    "SELECT count(*)::int AS n FROM mobile_qimen_installations WHERE lease_token IS NULL AND next_due_at>$1",
    [at.toISOString()],
  )).rows[0].n, 2_500);
  assert.ok(elapsedMs < 50_000, `live 2500 scheduler run exceeded lease budget: ${Math.round(elapsedMs)}ms`);

  console.log(`QIMEN_LIVE_2500_CAPACITY_OK due=2500 reserved=2500 durable=2500 elapsedMs=${Math.round(elapsedMs)} workers=20`);
} finally {
  if (pool) await pool.end();
  if (schemaCreated) {
    await admin.query("SET search_path TO public");
    await admin.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  }
  await admin.end().catch(() => undefined);
}
