import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const database = `zibai_notification_test_${process.pid}`;
assert.match(database, /^zibai_notification_test_/u);
const forward = readFileSync("migrations/20260816_mobile_zibai_notifications.sql", "utf8");
const rollback = readFileSync("migrations/20260816_mobile_zibai_notifications.rollback.sql", "utf8");
function psql(db: string, sql: string): string {
  return execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"], { encoding: "utf8", input: sql }).trim();
}
function rejected(sql: string): boolean {
  try { psql(database, sql); return false; } catch { return true; }
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database}; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE mobile_push_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    INSERT INTO users VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
  `);
  psql(database, forward);
  psql(database, `INSERT INTO mobile_zibai_installations
    (user_id,installation_id,location_permission,latitude,longitude,location_timezone,location_captured_at,location_expires_at,next_shichen_at)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','background',13.75,100.5,'Asia/Bangkok',now(),now()+interval '24 hours',now()+interval '1 hour');`);
  assert.equal(psql(database, `SELECT daily_enabled||','||shichen_enabled||','||daily_minute FROM mobile_zibai_installations;`), "false,false,420");
  assert.equal(rejected(`UPDATE mobile_zibai_installations SET shichen_enabled=true,location_permission='foreground';`), true);
  assert.equal(rejected(`UPDATE mobile_zibai_installations SET location_expires_at=location_captured_at+interval '24 hours 1 second';`), true);
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
  console.log("ZIBAI_MIGRATION_OK");
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`); } catch { /* guarded cleanup */ }
}
