import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const database = `zibai_notification_test_${process.pid}`;
assert.match(database, /^zibai_notification_test_/u);
const forward = readFileSync("migrations/20260816_mobile_zibai_notifications.sql", "utf8");
const legacyForward = forward
  .replaceAll("zibai-zaoming-true-solar-v2", "zibai-zaoming-true-solar-v1")
  .replaceAll("interval '7 days'", "interval '24 hours'");
const rollback = readFileSync("migrations/20260816_mobile_zibai_notifications.rollback.sql", "utf8");
const leaseUpgrade = readFileSync("migrations/20260817_mobile_zibai_location_lease.sql", "utf8");
const leaseRollback = readFileSync("migrations/20260817_mobile_zibai_location_lease.rollback.sql", "utf8");
const capabilityForwardPath = "migrations/20260819_mobile_zibai_three_layer.sql";
const capabilityRollbackPath = "migrations/20260819_mobile_zibai_three_layer.rollback.sql";
const capabilityForward = existsSync(capabilityForwardPath) ? readFileSync(capabilityForwardPath, "utf8") : "";
const capabilityRollback = existsSync(capabilityRollbackPath) ? readFileSync(capabilityRollbackPath, "utf8") : "";
const pushRoute = readFileSync("src/app/api/mobile/v1/push/route.ts", "utf8");
function psql(db: string, sql: string): string {
  return execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"], { encoding: "utf8", input: sql }).trim();
}
function rejected(sql: string): boolean {
  try { psql(database, sql); return false; } catch { return true; }
}

const capabilityFailures: Error[] = [];
function capabilityContract(name: string, check: () => void) {
  try {
    check();
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    capabilityFailures.push(new Error(`${name}: ${cause.message}`, { cause }));
  }
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database}; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE mobile_push_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE mobile_push_tokens(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      installation_id uuid NOT NULL,
      expo_push_token text NOT NULL UNIQUE,
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO users VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
  `);
  psql(database, legacyForward);
  psql(database, `INSERT INTO mobile_zibai_installations(user_id,installation_id)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009');
    UPDATE mobile_zibai_installations SET location_permission='foreground',latitude=13.75,longitude=100.5,
      location_timezone='Asia/Bangkok',location_captured_at='2026-08-16T00:00:00.000Z',
      location_expires_at='2026-08-17T00:00:00.000Z'
      WHERE installation_id='10000000-0000-4000-8000-000000000009';
    INSERT INTO mobile_zibai_occurrences
      (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,calculation_version)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','legacy-v1','daily','2026-08-15','zibai-zaoming-true-solar-v1');`);
  psql(database, leaseUpgrade);
  assert.equal(psql(database, `SELECT location_expires_at::text FROM mobile_zibai_installations
    WHERE installation_id='10000000-0000-4000-8000-000000000009';`), "2026-08-17 00:00:00+00",
    "the upgrade must not silently extend an existing authorized location");
  psql(database, `UPDATE mobile_zibai_installations
    SET location_expires_at=location_captured_at+interval '7 days'
    WHERE installation_id='10000000-0000-4000-8000-000000000009';`);
  assert.equal(rejected(`UPDATE mobile_zibai_installations SET location_expires_at=location_captured_at+interval '7 days 1 second';`), true);
  psql(database, leaseRollback);
  assert.equal(psql(database, `SELECT location_expires_at-location_captured_at FROM mobile_zibai_installations
    WHERE installation_id='10000000-0000-4000-8000-000000000009';`), "1 day");
  psql(database, leaseUpgrade);
  psql(database, forward);
  assert.equal(psql(database, `SELECT column_default FROM information_schema.columns
    WHERE table_name='mobile_zibai_installations' AND column_name='calculation_version';`), "'zibai-zaoming-true-solar-v2'::text");
  assert.equal(psql(database, `SELECT calculation_version FROM mobile_zibai_installations
    WHERE installation_id='10000000-0000-4000-8000-000000000009';`), "zibai-zaoming-true-solar-v2");
  assert.equal(psql(database, `SELECT calculation_version FROM mobile_zibai_occurrences WHERE occurrence_key='legacy-v1';`),
    "zibai-zaoming-true-solar-v1", "immutable legacy occurrence evidence must survive the upgrade");
  psql(database, `INSERT INTO mobile_zibai_occurrences
    (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,calculation_version)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','upgrade-v2','daily','2026-08-16','zibai-zaoming-true-solar-v2');`);
  psql(database, rollback);
  psql(database, forward);
  psql(database, `INSERT INTO mobile_zibai_installations
    (user_id,installation_id,location_permission,latitude,longitude,location_timezone,location_captured_at,location_expires_at,next_shichen_at)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','background',13.75,100.5,'Asia/Bangkok',now(),now()+interval '7 days',now()+interval '1 hour');`);
  assert.equal(psql(database, `SELECT daily_enabled||','||shichen_enabled||','||daily_minute FROM mobile_zibai_installations;`), "false,false,420");
  assert.equal(rejected(`UPDATE mobile_zibai_installations SET shichen_enabled=true,location_permission='foreground';`), true);
  assert.equal(rejected(`UPDATE mobile_zibai_installations SET location_expires_at=location_captured_at+interval '7 days 1 second';`), true);
  assert.equal(rejected(`INSERT INTO mobile_zibai_installations(user_id,installation_id) VALUES('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');`), true);
  psql(database, `UPDATE mobile_zibai_installations SET shichen_enabled=true; INSERT INTO mobile_zibai_occurrences
    (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','fixture','shichen','2026-08-16','si','zibai-zaoming-true-solar-v2');`);
  assert.equal(rejected(`INSERT INTO mobile_zibai_occurrences
    (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','fixture','shichen','2026-08-16','si','zibai-zaoming-true-solar-v2');`), true);
  assert.equal(psql(database, `SELECT count(*) FROM information_schema.columns WHERE table_name='mobile_zibai_occurrences' AND column_name IN ('latitude','longitude');`), "0");
  assert.equal(psql(database, `SELECT to_regclass('ix_mobile_zibai_occurrence_retention') IS NOT NULL;`), "t");
  psql(database, rollback);
  assert.equal(psql(database, `SELECT to_regclass('mobile_zibai_installations') IS NULL AND to_regclass('mobile_zibai_occurrences') IS NULL;`), "t");
  psql(database, forward);
  assert.equal(psql(database, `SELECT to_regclass('mobile_zibai_installations') IS NOT NULL AND to_regclass('mobile_zibai_occurrences') IS NOT NULL;`), "t");
  capabilityContract("additive capability migration files exist", () => {
    assert.ok(capabilityForward.length > 0, capabilityForwardPath);
    assert.ok(capabilityRollback.length > 0, capabilityRollbackPath);
  });
  if (capabilityForward && capabilityRollback) {
    capabilityContract("fresh migration has a strict schema-1 default and accepts schema 2", () => {
      psql(database, capabilityForward);
      assert.equal(psql(database, `SELECT data_type||','||is_nullable||','||column_default
        FROM information_schema.columns
        WHERE table_name='mobile_push_tokens' AND column_name='zibai_payload_schema';`),
      "smallint,NO,1", "fresh capability column shape");
      psql(database, `INSERT INTO mobile_push_tokens(user_id,installation_id,expo_push_token)
        VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000008','fresh-default');`);
      assert.equal(psql(database, `SELECT zibai_payload_schema FROM mobile_push_tokens WHERE expo_push_token='fresh-default';`), "1");
      psql(database, `UPDATE mobile_push_tokens SET zibai_payload_schema=2 WHERE expo_push_token='fresh-default';`);
      assert.equal(psql(database, `SELECT zibai_payload_schema FROM mobile_push_tokens WHERE expo_push_token='fresh-default';`), "2");
      assert.equal(rejected(`UPDATE mobile_push_tokens SET zibai_payload_schema=0 WHERE expo_push_token='fresh-default';`), true);
      assert.equal(rejected(`UPDATE mobile_push_tokens SET zibai_payload_schema=3 WHERE expo_push_token='fresh-default';`), true);
      assert.equal(rejected(`UPDATE mobile_push_tokens SET zibai_payload_schema=NULL WHERE expo_push_token='fresh-default';`), true);
    });
    capabilityContract("rollback and upgrade preserve rows while backfilling legacy capability", () => {
      psql(database, capabilityRollback);
      assert.equal(psql(database, `SELECT count(*) FROM information_schema.columns
        WHERE table_name='mobile_push_tokens' AND column_name='zibai_payload_schema';`), "0");
      psql(database, `INSERT INTO mobile_push_tokens(user_id,installation_id,expo_push_token)
        VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','legacy-upgrade');`);
      psql(database, capabilityForward);
      assert.equal(psql(database, `SELECT string_agg(zibai_payload_schema::text,',' ORDER BY expo_push_token)
        FROM mobile_push_tokens;`), "1,1", "all pre-capability rows downgrade safely to schema 1");
      psql(database, capabilityForward);
      assert.equal(psql(database, `SELECT count(*) FROM mobile_push_tokens;`), "2", "rerun never rewrites or drops token rows");
    });
    capabilityContract("registration persistence supports explicit 2 and omitted downgrade to 1 without touching consent", () => {
      psql(database, `INSERT INTO mobile_zibai_installations
        (user_id,installation_id,daily_enabled,shichen_enabled,location_permission,latitude,longitude,
         location_timezone,location_captured_at,location_expires_at,next_daily_at,next_shichen_at)
        VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009',
          true,true,'background',13.75,100.5,'Asia/Bangkok',now(),now()+interval '7 days',now()+interval '1 hour',now()+interval '2 hours');`);
      const consentBefore = psql(database, `SELECT row_to_json(z)::text FROM (
        SELECT daily_enabled,shichen_enabled,location_permission,latitude,longitude,location_timezone,
               location_captured_at,location_expires_at
          FROM mobile_zibai_installations
         WHERE user_id='00000000-0000-4000-8000-000000000001'
           AND installation_id='10000000-0000-4000-8000-000000000009'
      ) z;`);
      psql(database, `INSERT INTO mobile_push_tokens(user_id,installation_id,expo_push_token,zibai_payload_schema)
        VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','legacy-upgrade',2)
        ON CONFLICT(expo_push_token) DO UPDATE SET zibai_payload_schema=EXCLUDED.zibai_payload_schema,updated_at=now();`);
      assert.equal(psql(database, `SELECT zibai_payload_schema FROM mobile_push_tokens WHERE expo_push_token='legacy-upgrade';`), "2");
      psql(database, `INSERT INTO mobile_push_tokens(user_id,installation_id,expo_push_token,zibai_payload_schema)
        VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','legacy-upgrade',1)
        ON CONFLICT(expo_push_token) DO UPDATE SET zibai_payload_schema=EXCLUDED.zibai_payload_schema,updated_at=now();`);
      assert.equal(psql(database, `SELECT zibai_payload_schema FROM mobile_push_tokens WHERE expo_push_token='legacy-upgrade';`), "1",
        "an omitted/legacy re-registration actively clears stale schema-2 capability");
      const consentAfter = psql(database, `SELECT row_to_json(z)::text FROM (
        SELECT daily_enabled,shichen_enabled,location_permission,latitude,longitude,location_timezone,
               location_captured_at,location_expires_at
          FROM mobile_zibai_installations
         WHERE user_id='00000000-0000-4000-8000-000000000001'
           AND installation_id='10000000-0000-4000-8000-000000000009'
      ) z;`);
      assert.equal(consentAfter, consentBefore, "capability registration never changes Zi Bai consent or retained location");
      psql(database, capabilityRollback);
      psql(database, capabilityForward);
      assert.equal(psql(database, `SELECT string_agg(zibai_payload_schema::text,',' ORDER BY expo_push_token)
        FROM mobile_push_tokens;`), "1,1", "rollback/reapply restores the safe schema-1 capability");
    });
  }
  capabilityContract("route defaults omission to 1 and rejects non-1/2 values before mutation", () => {
    const postStart = pushRoute.indexOf("export async function POST");
    const deleteStart = pushRoute.indexOf("export async function DELETE", postStart);
    assert.ok(postStart >= 0 && deleteStart > postStart, "POST route bounds");
    const post = pushRoute.slice(postStart, deleteStart);
    const mutationStart = post.indexOf("const client = await pool.connect()");
    assert.ok(mutationStart > 0, "registration mutation boundary");
    const beforeMutation = post.slice(0, mutationStart);
    assert.match(beforeMutation,
      /const zibaiPayloadSchema = body\.zibaiPayloadSchema === undefined \? 1 : body\.zibaiPayloadSchema;/u,
      "omission must explicitly become schema 1 without coercion");
    assert.match(beforeMutation,
      /!\(zibaiPayloadSchema === 1 \|\| zibaiPayloadSchema === 2\)/u,
      "only exact integer capability values 1 and 2 are valid");
    assert.match(beforeMutation, /invalid_push_registration[\s\S]*status: 400/u,
      "invalid capability must return 400 before pool.connect/mutation");
  });
  capabilityContract("route persists negotiated capability on insert and every re-registration", () => {
    const post = pushRoute.slice(pushRoute.indexOf("export async function POST"), pushRoute.indexOf("export async function DELETE"));
    assert.match(post, /INSERT INTO mobile_push_tokens[\s\S]*zibai_payload_schema/u);
    assert.match(post, /zibai_payload_schema=EXCLUDED\.zibai_payload_schema/u,
      "re-registration must overwrite, not COALESCE, stale capability");
    assert.match(post, /\[[^\]]*\bzibaiPayloadSchema\b[^\]]*\]/u,
      "the negotiated value must be bound to the upsert even when later capabilities follow it");
    assert.doesNotMatch(post, /(?:INSERT INTO|UPDATE) mobile_zibai_installations/u,
      "push registration must not opt into or rewrite Zi Bai consent/location state");
  });
  if (capabilityFailures.length > 0) {
    throw new AggregateError(capabilityFailures, "Zi Bai capability migration/registration contract is RED");
  }
  console.log("ZIBAI_MIGRATION_OK");
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`); } catch { /* guarded cleanup */ }
}
