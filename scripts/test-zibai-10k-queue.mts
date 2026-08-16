import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import scheduler from "./mobile-zibai-push-cron.cjs";
import delivery from "../src/lib/mobile-notification-delivery.cjs";

const database = `zibai_queue_10k_${process.pid}`;
const role = `zibai_queue_10k_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
const INSTALLATIONS = 10_000;
const WORKERS = 20;
const BATCH = 500;
const RUN_SLO_MS = 50_000;
const PROVIDER_DRAIN_SLO_MS = 120_000;
const startAt = new Date("2026-08-16T06:59:00.000Z");
assert.match(database, /^zibai_queue_10k_/u);

function psql(db: string, sql: string) {
  return execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"], { encoding: "utf8", input: sql }).trim();
}

function percentile(values: number[], fraction: number): number {
  assert.ok(values.length > 0);
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      deleted_at timestamptz,
      timezone text DEFAULT 'UTC',
      locale text DEFAULT 'en'
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
      user_id uuid PRIMARY KEY REFERENCES users(id), timezone text DEFAULT 'UTC',
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
      delivery_status text NOT NULL DEFAULT 'accepted' CHECK (delivery_status IN ('pending','accepted','failed')),
      attempt_count integer NOT NULL DEFAULT 0,
      next_retry_at timestamptz,
      accepted_at timestamptz,
      last_error text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id,yam_key)
    );
  `);
  psql(database, readFileSync("migrations/20260815_mobile_notification_integrity.sql", "utf8"));
  psql(database, readFileSync("migrations/20260816_mobile_zibai_notifications.sql", "utf8"));
  psql(database, `
    INSERT INTO users(id)
    SELECT gen_random_uuid() FROM generate_series(1,${INSTALLATIONS});
    INSERT INTO mobile_push_tokens
      (user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,locale,timezone,last_registered_at)
    SELECT id,gen_random_uuid(),'ExponentPushToken['||id::text||']','fcm-'||id::text,'fcm','android','en','UTC',now()
      FROM users;
    INSERT INTO mobile_notification_prefs(user_id,privacy_preview,locale)
    SELECT id,true,'en' FROM (
      SELECT id,row_number() OVER (ORDER BY id) AS ordinal FROM users
    ) ranked WHERE ordinal % 2 = 0;
    INSERT INTO mobile_zibai_installations
      (user_id,installation_id,daily_enabled,shichen_enabled,quiet_start,quiet_end,location_permission,
       latitude,longitude,location_timezone,location_captured_at,location_expires_at,next_daily_at,next_shichen_at)
    SELECT t.user_id,t.installation_id,false,true,0,0,'background',13.75,0,'UTC',
           '${new Date(startAt.getTime() - 60_000).toISOString()}',
           '${new Date(startAt.getTime() + 23 * 3_600_000).toISOString()}',NULL,
           '${new Date(startAt.getTime() - 1_000).toISOString()}'
      FROM mobile_push_tokens t;
    ANALYZE mobile_zibai_installations;
    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};
  `);
  const pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 24 });
  try {
    const scienceImported = await import("../src/lib/zibai-science.ts");
    const stateImported = await import("../src/lib/mobile-zibai-installation.ts");
    const science = { ...scienceImported, nextCivilMinute: stateImported.nextCivilMinute };
    let peakTotal = 0;
    let peakBusy = 0;
    let peakWaiting = 0;
    const monitor = setInterval(() => {
      peakTotal = Math.max(peakTotal, pool.totalCount);
      peakBusy = Math.max(peakBusy, pool.totalCount - pool.idleCount);
      peakWaiting = Math.max(peakWaiting, pool.waitingCount);
    }, 5);
    const cpuStart = process.cpuUsage();
    const testStarted = performance.now();
    const runStats: Array<{ durationMs: number; p95LagMs: number; p99LagMs: number; errors: number; providerMs: number }> = [];

    for (let cycle = 0; cycle < 2; cycle += 1) {
      const at = cycle === 0
        ? startAt
        : new Date((await pool.query(`SELECT min(next_shichen_at) AS at FROM mobile_zibai_installations`)).rows[0].at.getTime() + 1_000);
      const runStarted = performance.now();
      const claimed = await scheduler.claimDueBatches(pool, at, BATCH, WORKERS);
      assert.equal(claimed.length, INSTALLATIONS);
      assert.equal(new Set(claimed.map((row: { user_id: string; installation_id: string }) => `${row.user_id}|${row.installation_id}`)).size, INSTALLATIONS,
        "SKIP LOCKED claims each installation once per run");
      let errors = 0;
      const errorSamples: string[] = [];
      const completionLagMs: number[] = [];
      await scheduler.forEachBounded(claimed, WORKERS, async (claim: unknown) => {
        try {
          const result = await scheduler.processClaim(pool, claim, at, science);
          assert.deepEqual(result, { reserved: 1, skipped: 0, reason: null });
        } catch (error) {
          errors += 1;
          if (errorSamples.length < 3) errorSamples.push(error instanceof Error ? error.message : String(error));
        } finally {
          completionLagMs.push(performance.now() - runStarted);
        }
      });
      const durationMs = performance.now() - runStarted;
      const p95LagMs = percentile(completionLagMs, 0.95);
      const p99LagMs = percentile(completionLagMs, 0.99);
      const providerStarted = performance.now();
      let providerSequence = cycle * INSTALLATIONS;
      const provider = await delivery.runRetryBatch(pool, {
        limit: INSTALLATIONS,
        concurrency: WORKERS,
        sender: {
          async sendPrepared() {
            providerSequence += 1;
            return { kind: "provider_accepted", providerMessageId: `stub-zibai-${providerSequence}` };
          },
        },
      });
      const providerMs = performance.now() - providerStarted;
      runStats.push({ durationMs, p95LagMs, p99LagMs, errors, providerMs });
      assert.equal(errors, 0, `cycle ${cycle + 1} must have zero pipeline errors: ${errorSamples.join(" | ")}`);
      assert.equal(completionLagMs.length, INSTALLATIONS);
      assert.ok(durationMs < RUN_SLO_MS, `cycle ${cycle + 1} full pipeline took ${durationMs.toFixed(1)}ms`);
      assert.ok(p99LagMs < RUN_SLO_MS, `cycle ${cycle + 1} p99 due-to-reservation lag took ${p99LagMs.toFixed(1)}ms`);
      assert.equal(provider.claimed, INSTALLATIONS, `cycle ${cycle + 1} must drain every reserved provider attempt`);
      assert.equal(provider.accepted, INSTALLATIONS, `cycle ${cycle + 1} stub provider must accept every exact message`);
      assert.equal(provider.retryDue + provider.dead, 0);
      assert.ok(providerMs < PROVIDER_DRAIN_SLO_MS, `cycle ${cycle + 1} provider-stage drain took ${providerMs.toFixed(1)}ms`);
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_zibai_installations WHERE lease_token IS NOT NULL`)).rows[0].n, 0,
        "full pipeline releases every claimed lease");
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_zibai_installations WHERE next_shichen_at<=$1`, [at.toISOString()])).rows[0].n, 0,
        "full pipeline drains the due queue for the run");
    }

    clearInterval(monitor);
    const cpu = process.cpuUsage(cpuStart);
    const cpuMs = (cpu.user + cpu.system) / 1_000;
    const totalMs = performance.now() - testStarted;
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_zibai_occurrences WHERE state='reserved'`)).rows[0].n, INSTALLATIONS * 2);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_push_log WHERE kind='zibai' AND delivery_status='accepted'`)).rows[0].n, INSTALLATIONS * 2);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_push_attempts WHERE status='provider_accepted' AND provider='fcm'`)).rows[0].n, INSTALLATIONS * 2);
    const invalidHistoryCopy = await pool.query(`
      SELECT count(*)::int AS n FROM mobile_push_log
       WHERE length(body)>400 OR body NOT LIKE '%1%' OR body NOT LIKE '%2%' OR body NOT LIKE '%5%' OR body NOT LIKE '%9%'
    `);
    assert.equal(invalidHistoryCopy.rows[0].n, 0, "all 20k durable history rows retain bounded 1/2/5/9 copy");
    const invalidPreviewCopy = await pool.query(`
      SELECT count(*)::int AS n FROM mobile_push_attempts
       WHERE privacy_safe=false AND (
         length(provider_message#>>'{notification,body}')>400
         OR provider_message#>>'{notification,body}' NOT LIKE '%1%'
         OR provider_message#>>'{notification,body}' NOT LIKE '%2%'
         OR provider_message#>>'{notification,body}' NOT LIKE '%5%'
         OR provider_message#>>'{notification,body}' NOT LIKE '%9%'
       )
    `);
    assert.equal(invalidPreviewCopy.rows[0].n, 0,
      "every privacy-preview provider reservation retains bounded 1/2/5/9 copy");
    const previewSplit = await pool.query(`SELECT privacy_safe,count(*)::int AS n FROM mobile_push_attempts GROUP BY privacy_safe ORDER BY privacy_safe`);
    assert.deepEqual(previewSplit.rows, [{ privacy_safe: false, n: INSTALLATIONS }, { privacy_safe: true, n: INSTALLATIONS }],
      "the load gate exercises equal full-preview and lock-screen-redacted provider paths");
    assert.ok(peakTotal <= 24 && peakBusy <= 24, "the full pipeline remains inside the configured database pool");
    assert.ok(peakWaiting < INSTALLATIONS, "the bounded worker never creates an unbounded connection waiter storm");

    const plan = psql(database, `EXPLAIN (COSTS OFF) SELECT user_id,installation_id FROM mobile_zibai_installations WHERE shichen_enabled=true AND next_shichen_at<=now() ORDER BY next_shichen_at LIMIT 500;`);
    assert.match(plan, /ix_mobile_zibai_shichen_due/u);
    psql(database, `UPDATE mobile_zibai_installations SET lease_token=NULL,lease_expires_at=NULL,location_captured_at=now()-interval '24 hours',location_expires_at=now()-interval '1 second' WHERE user_id=(SELECT id FROM users LIMIT 1);`);
    assert.equal(await scheduler.purgeExpiredLocations(pool, new Date()), 1);
    assert.equal(psql(database, `SELECT count(*) FROM mobile_zibai_installations WHERE latitude IS NULL AND longitude IS NULL AND location_expires_at IS NULL;`), "1");
    console.log(`ZIBAI_10K_PIPELINE_OK installations=${INSTALLATIONS} cycles=2 accepted=${INSTALLATIONS * 2} totalMs=${totalMs.toFixed(1)} cpuMs=${cpuMs.toFixed(1)} peakPool=${peakBusy}/${peakTotal} peakWaiting=${peakWaiting} runs=${runStats.map((run) => `${run.durationMs.toFixed(1)}:${run.p95LagMs.toFixed(1)}:${run.p99LagMs.toFixed(1)}:${run.providerMs.toFixed(1)}:${run.errors}`).join(",")}`);
  } finally { await pool.end(); }
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch { /* guarded cleanup */ }
}
