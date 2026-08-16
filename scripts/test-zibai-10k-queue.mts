import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import scheduler from "./mobile-zibai-push-cron.cjs";

const database = `zibai_queue_10k_${process.pid}`;
const role = `zibai_queue_10k_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
assert.match(database, /^zibai_queue_10k_/u);
function psql(db: string, sql: string) {
  return execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"], { encoding: "utf8", input: sql }).trim();
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE mobile_push_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());`);
  psql(database, readFileSync("migrations/20260816_mobile_zibai_notifications.sql", "utf8"));
  psql(database, `
    INSERT INTO users SELECT gen_random_uuid() FROM generate_series(1,10000);
    INSERT INTO mobile_zibai_installations
      (user_id,installation_id,daily_enabled,shichen_enabled,location_permission,latitude,longitude,location_timezone,
       location_captured_at,location_expires_at,next_daily_at,next_shichen_at)
    SELECT id,gen_random_uuid(),false,true,'background',13.75,100.5,'Asia/Bangkok',now(),now()+interval '24 hours',NULL,now()-interval '1 minute'
      FROM users;
    ANALYZE mobile_zibai_installations;
    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};
  `);
  const pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 24 });
  try {
    const started = performance.now();
    const claimed = await scheduler.claimDueBatches(pool, new Date(), 500, 20);
    const elapsedMs = performance.now() - started;
    assert.equal(claimed.length, 10_000);
    assert.equal(new Set(claimed.map((row) => `${row.user_id}|${row.installation_id}`)).size, 10_000, "SKIP LOCKED claims each installation once");
    assert.ok(elapsedMs < 30_000, `10k indexed claim took ${elapsedMs.toFixed(1)}ms`);
    let processed = 0;
    let active = 0;
    let maxActive = 0;
    await scheduler.forEachBounded(claimed, 20, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      processed += 1;
      active -= 1;
    });
    assert.equal(processed, 10_000);
    assert.equal(maxActive, 20, "the production bounded worker path must actually process twenty claims concurrently");
    const plan = psql(database, `EXPLAIN (COSTS OFF) SELECT user_id,installation_id FROM mobile_zibai_installations WHERE shichen_enabled=true AND next_shichen_at<=now() ORDER BY next_shichen_at LIMIT 500;`);
    assert.match(plan, /ix_mobile_zibai_shichen_due/u);
    psql(database, `UPDATE mobile_zibai_installations SET lease_token=NULL,lease_expires_at=NULL,location_captured_at=now()-interval '24 hours',location_expires_at=now()-interval '1 second' WHERE user_id=(SELECT id FROM users LIMIT 1);`);
    assert.equal(await scheduler.purgeExpiredLocations(pool, new Date()), 1);
    assert.equal(psql(database, `SELECT count(*) FROM mobile_zibai_installations WHERE latitude IS NULL AND longitude IS NULL AND location_expires_at IS NULL;`), "1");
    psql(database, `
      INSERT INTO mobile_zibai_occurrences(user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version,state,created_at,updated_at)
      SELECT user_id,installation_id,'old-retention','shichen',current_date-40,'zi','zibai-zaoming-true-solar-v1','skipped',now()-interval '40 days',now()-interval '40 days'
        FROM mobile_zibai_installations LIMIT 1;
      INSERT INTO mobile_zibai_occurrences(user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version,state)
      SELECT user_id,installation_id,'fresh-retention','shichen',current_date,'chou','zibai-zaoming-true-solar-v1','skipped'
        FROM mobile_zibai_installations LIMIT 1;
    `);
    assert.equal(await scheduler.purgeOldOccurrences(pool, new Date(), 10_000), 1);
    assert.equal(psql(database, `SELECT string_agg(occurrence_key,',' ORDER BY occurrence_key) FROM mobile_zibai_occurrences;`), "fresh-retention");
    console.log(`ZIBAI_10K_QUEUE_OK claimed=10000 elapsedMs=${elapsedMs.toFixed(1)}`);
  } finally { await pool.end(); }
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch { /* guarded cleanup */ }
}
