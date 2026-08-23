import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const database = `zibai_v3_migration_${process.pid}`;
const base = readFileSync("migrations/20260816_mobile_zibai_notifications.sql", "utf8");
const forward = readFileSync("migrations/20260823_mobile_zibai_v3_boundary_latch.sql", "utf8");
const rollback = readFileSync("migrations/20260823_mobile_zibai_v3_boundary_latch.rollback.sql", "utf8");

function psql(db: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"],
    { encoding: "utf8", input: sql },
  ).trim();
}

function rejected(sql: string): boolean {
  try { psql(database, sql); return false; } catch { return true; }
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE mobile_push_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    INSERT INTO users VALUES('00000000-0000-4000-8000-000000000001');
  `);
  psql(database, base);
  psql(database, `
    INSERT INTO mobile_zibai_installations(user_id,installation_id)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
    INSERT INTO mobile_zibai_occurrences
      (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,calculation_version)
    VALUES
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','old-daily-v2','daily','2026-08-22','zibai-zaoming-true-solar-v2');
    INSERT INTO mobile_zibai_occurrences
      (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version)
    VALUES
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','old-si-v2','shichen','2026-08-22','si','zibai-zaoming-true-solar-v2');
  `);

  psql(database, forward);
  assert.equal(psql(database, `SELECT column_default FROM information_schema.columns
    WHERE table_name='mobile_zibai_installations' AND column_name='calculation_version';`),
  "'zibai-zaoming-true-solar-v3'::text");
  assert.equal(psql(database, `SELECT calculation_version FROM mobile_zibai_installations;`),
    "zibai-zaoming-true-solar-v3");
  assert.equal(psql(database, `SELECT string_agg(calculation_version,',' ORDER BY occurrence_key)
    FROM mobile_zibai_occurrences;`),
  "zibai-zaoming-true-solar-v2,zibai-zaoming-true-solar-v2",
  "immutable v2 occurrence evidence survives the v3 upgrade");
  assert.equal(rejected(`INSERT INTO mobile_zibai_occurrences
    (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,calculation_version)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','new-daily-v3','daily','2026-08-22','zibai-zaoming-true-solar-v3');`), true,
  "v2 and v3 cannot both consume the same logical daily slot");
  assert.equal(rejected(`INSERT INTO mobile_zibai_occurrences
    (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','new-si-v3','shichen','2026-08-22','si','zibai-zaoming-true-solar-v3');`), true,
  "v2 and v3 cannot both consume the same logical shichen slot");
  psql(database, `INSERT INTO mobile_zibai_occurrences
    (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','new-wu-v3','shichen','2026-08-22','wu','zibai-zaoming-true-solar-v3');`);
  assert.equal(rejected(`INSERT INTO mobile_zibai_occurrences
    (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','future-v4','shichen','2026-08-22','wei','zibai-zaoming-true-solar-v4');`), true);
  assert.equal(psql(database, `SELECT to_regclass('ux_mobile_zibai_daily_logical_slot') IS NOT NULL
    AND to_regclass('ux_mobile_zibai_shichen_logical_slot') IS NOT NULL;`), "t");
  psql(database, forward);

  psql(database, rollback);
  assert.equal(psql(database, `SELECT column_default FROM information_schema.columns
    WHERE table_name='mobile_zibai_installations' AND column_name='calculation_version';`),
  "'zibai-zaoming-true-solar-v2'::text");
  assert.equal(psql(database, `SELECT calculation_version FROM mobile_zibai_installations;`),
    "zibai-zaoming-true-solar-v2");
  assert.equal(psql(database, `SELECT count(*) FROM mobile_zibai_occurrences
    WHERE calculation_version='zibai-zaoming-true-solar-v3';`), "1",
  "rollback preserves v3 audit history");
  assert.equal(rejected(`INSERT INTO mobile_zibai_occurrences
    (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version)
    VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','rollback-wu-v2','shichen','2026-08-22','wu','zibai-zaoming-true-solar-v2');`), true,
  "rollback keeps the cross-version replay fence");
  console.log("ZIBAI_V3_MIGRATION_OK");
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`); } catch { /* guarded cleanup */ }
}
