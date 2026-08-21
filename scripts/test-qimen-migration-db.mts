import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadEnv() {
  if (process.env.QIMEN_DB_TEST_PASSWORD || process.env.DATABASE_URL) return;
  const envPath = process.env.HOURKEY_BACKEND_ENV_PATH || path.resolve(".env.local");
  if (!fs.existsSync(envPath)) throw new Error("QIMEN_DB_TEST_ENV_UNAVAILABLE");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/gu, "");
  }
}

loadEnv();
const config = {
  ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}),
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.QIMEN_DB_TEST_PASSWORD || process.env.PGPASSWORD,
};
const schema = process.env.QIMEN_DB_TEST_SCHEMA || `qimen_migration_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
if (!/^qimen_migration_[a-z0-9_]+$/u.test(schema)) throw new Error("QIMEN_DB_TEST_SCHEMA_INVALID");
const quotedSchema = `"${schema}"`;
const migration = fs.readFileSync(new URL("../migrations/20260821_mobile_qimen_three_layer.sql", import.meta.url), "utf8");
const rollback = fs.readFileSync(new URL("../migrations/20260821_mobile_qimen_three_layer.rollback.sql", import.meta.url), "utf8");
const admin = new pg.Client(config);
const workerA = new pg.Client(config);
const workerB = new pg.Client(config);
let adminConnected = false;
let schemaCreated = false;

try {
  await admin.connect();
  adminConnected = true;
  if (process.env.QIMEN_DB_TEST_SCHEMA_PRECREATED !== "1") await admin.query(`CREATE SCHEMA ${quotedSchema}`);
  schemaCreated = true;
  await admin.query(`SET search_path TO ${quotedSchema},public`);
  await admin.query("CREATE TABLE users(id uuid PRIMARY KEY)");
  await admin.query("CREATE TABLE mobile_push_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid())");
  await admin.query("CREATE TABLE mobile_push_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid())");
  await admin.query(migration);

  const userId = "11111111-1111-4111-8111-111111111111";
  await admin.query("INSERT INTO users(id) VALUES($1)", [userId]);
  await admin.query(
    `INSERT INTO mobile_qimen_installations
       (user_id,installation_id,enabled,location_permission,latitude,longitude,location_timezone,
        location_captured_at,location_expires_at,next_due_at)
     SELECT $1,gen_random_uuid(),true,'foreground',13.7563,100.5018,'Asia/Bangkok',
            $2::timestamptz,$2::timestamptz+interval '7 days',$2::timestamptz
       FROM generate_series(1,10020)`,
    [userId, "2026-08-21T00:00:00.000Z"],
  );

  await Promise.all([workerA.connect(), workerB.connect()]);
  await Promise.all([
    workerA.query(`SET search_path TO ${quotedSchema},public`),
    workerB.query(`SET search_path TO ${quotedSchema},public`),
  ]);
  const [claimA, claimB] = await Promise.all([
    workerA.query("SELECT installation_id,lease_token FROM claim_mobile_qimen_installations($1,6000)", ["2026-08-21T00:00:00.000Z"]),
    workerB.query("SELECT installation_id,lease_token FROM claim_mobile_qimen_installations($1,6000)", ["2026-08-21T00:00:00.000Z"]),
  ]);
  const claimed = [...claimA.rows, ...claimB.rows];
  assert.equal(claimed.length, 10020, "concurrent workers drain a 10k+ due cohort without the old 1000 clamp");
  assert.equal(new Set(claimed.map((row) => row.installation_id)).size, 10020, "SKIP LOCKED claims never overlap");
  assert.ok(claimed.every((row) => row.lease_token));

  const installationId = claimed[0].installation_id;
  const occurrence = [
    userId, installationId, "qimen|one", "2026-08-21T00:00:00.000Z", "2026-08-21T02:00:00.000Z",
    "2026-08-21T00:05:00.000Z", "SE", JSON.stringify({ month: "m1", day: "d1", hour: "h1" }),
    JSON.stringify({ month: "m", day: "d", hour: "h" }), JSON.stringify({ accountId: userId, purpose: "travel" }), "a".repeat(64),
  ];
  const inserted = await admin.query(
    `INSERT INTO mobile_qimen_occurrences
       (user_id,installation_id,occurrence_key,purpose,hour_valid_from,hour_valid_until,send_deadline,
        selected_direction,version_tuple,source_tuple,snapshot,snapshot_digest,state)
     VALUES($1,$2,$3,'travel',$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,'claimed') RETURNING id`,
    occurrence,
  );
  await assert.rejects(
    admin.query(
      `INSERT INTO mobile_qimen_occurrences
       (user_id,installation_id,occurrence_key,purpose,hour_valid_from,hour_valid_until,send_deadline,
        selected_direction,version_tuple,source_tuple,snapshot,snapshot_digest,state)
       VALUES($1,$2,$3||'-changed','travel',$4,$5,$6,CASE WHEN $7::text='SE' THEN 'E' ELSE 'SE' END,$8::jsonb,$9::jsonb,$10::jsonb,$11,'claimed')`,
      occurrence,
    ),
    (error: any) => error?.code === "23505",
    "a direction/version change cannot duplicate the same logical shichen",
  );
  await assert.rejects(
    admin.query("UPDATE mobile_qimen_occurrences SET snapshot=jsonb_set(snapshot,'{purpose}','\"changed\"') WHERE id=$1", [inserted.rows[0].id]),
    /mobile_qimen_occurrence_immutable/u,
  );
  await admin.query("UPDATE mobile_qimen_occurrences SET state='skipped',skip_reason='test_skip' WHERE id=$1", [inserted.rows[0].id]);

  const push = await admin.query("INSERT INTO mobile_push_log DEFAULT VALUES RETURNING id");
  const second = await admin.query(
    `INSERT INTO mobile_qimen_occurrences
       (user_id,installation_id,occurrence_key,purpose,hour_valid_from,hour_valid_until,send_deadline,
        selected_direction,version_tuple,source_tuple,snapshot,snapshot_digest,state)
     VALUES($1,$2,'qimen|two','travel','2026-08-21T02:00:00Z','2026-08-21T04:00:00Z','2026-08-21T02:05:00Z',
       'SE',$3::jsonb,$4::jsonb,$5::jsonb,$6,'claimed') RETURNING id`,
    [userId, installationId, occurrence[7], occurrence[8], occurrence[9], occurrence[10]],
  );
  await admin.query("UPDATE mobile_qimen_occurrences SET state='reserved',push_log_id=$2 WHERE id=$1", [second.rows[0].id, push.rows[0].id]);
  await admin.query("DELETE FROM mobile_push_log WHERE id=$1", [push.rows[0].id]);
  assert.equal((await admin.query("SELECT 1 FROM mobile_qimen_occurrences WHERE id=$1", [second.rows[0].id])).rowCount, 0,
    "retention cascades parent and immutable occurrence together");

  await admin.query("INSERT INTO mobile_push_tokens(qimen_payload_schema) VALUES(2)");
  await admin.query("UPDATE mobile_qimen_producer_state SET producer_enabled=true,backend_commit=$1,enabled_at=now(),enabled_by='db-test'", ["a".repeat(40)]);
  await admin.query(rollback);
  assert.equal((await admin.query("SELECT producer_enabled FROM mobile_qimen_producer_state")).rows[0].producer_enabled, false);
  assert.equal((await admin.query("SELECT qimen_payload_schema FROM mobile_push_tokens")).rows[0].qimen_payload_schema, 1);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM mobile_qimen_occurrences")).rows[0].n, 1,
    "rollback preserves skipped evidence");

  console.log("qimen migration apply/concurrency/rollback DB tests passed");
} finally {
  await Promise.allSettled([workerA.end(), workerB.end()]);
  if (adminConnected) {
    try {
      if (schemaCreated) {
        await admin.query("SET search_path TO public");
        await admin.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
      }
    } finally {
      await admin.end();
    }
  }
}
