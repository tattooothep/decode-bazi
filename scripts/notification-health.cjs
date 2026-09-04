#!/usr/bin/env node
"use strict";

const { readFileSync, statSync } = require("node:fs");
const { Client } = require("pg");
const { collectHealth } = require("../src/lib/notification-observability.cjs");
const schedulerHeartbeat = require("../src/lib/notification-scheduler-heartbeat.cjs");
const { expoIosPushReady } = require("../src/lib/mobile-push-registration-readiness.cjs");
const { readZiweiRuntimeContext } = require("../src/lib/ziwei-hourly-runtime-observability.cjs");

function argumentValue(argumentsList, name) {
  const index = argumentsList.indexOf(name);
  return index >= 0 && argumentsList[index + 1] ? argumentsList[index + 1] : undefined;
}

function readHeartbeat(file) {
  if (!file) return null;
  try { return statSync(file).mtime.toISOString(); } catch { return null; }
}

function providerReadiness(env = process.env) {
  const keyPath = env.FCM_SERVICE_ACCOUNT_PATH || "/root/secrets/hourkey-fcm-service-account.json";
  let fcm = false;
  try {
    const credential = JSON.parse(readFileSync(keyPath, "utf8"));
    fcm = ["private_key", "client_email", "project_id", "token_uri"].every((key) => typeof credential?.[key] === "string" && credential[key].trim());
  } catch {}
  return {
    fcm,
    expoIos: expoIosPushReady(env),
    expoAndroid: env.EXPO_ANDROID_PUSH_READY === "true",
  };
}

function createDb() {
  return new Client({
    host: process.env.PGHOST || "127.0.0.1", port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || "decode_db", user: process.env.PGUSER || "decode_user", password: process.env.PGPASSWORD,
  });
}

function r8HealthResult(overrides = {}) {
  return {
    phase: "shadow", migrationApplied: true, available: false, ok: false, reasons: [],
    lastRunAt: null, lastCount: 0, providerSendEnabled: false, fresh: false,
    ageSeconds: null, future: false, futureSkewSeconds: 0,
    ...overrides,
  };
}

async function readR8ShadowHealth(db, options = {}) {
  if (!db || typeof db.query !== "function") {
    return r8HealthResult({
      phase: "migration_not_applied", migrationApplied: false, available: false,
      ok: true, reasons: [],
    });
  }
  const now = options.now instanceof Date ? options.now : new Date();
  const maxAgeSeconds = Number.isFinite(options.maxAgeSeconds) ? Number(options.maxAgeSeconds) : 300;
  const maxFutureSkewSeconds = Number.isFinite(options.maxFutureSkewSeconds)
    ? Number(options.maxFutureSkewSeconds) : 60;
  try {
    const relation = await db.query(
      "SELECT to_regclass('mobile_science_notification_producer_state')::text AS relation",
    );
    if (!relation.rows[0]?.relation) {
      return r8HealthResult({
        phase: "migration_not_applied", migrationApplied: false, available: false,
        ok: true, reasons: [],
      });
    }
    const result = await db.query(
      `SELECT last_shadow_run_at,last_shadow_count,provider_send_enabled
         FROM mobile_science_notification_producer_state
        WHERE science_id='astronomy_fact' AND submode='civil_two_hour' AND schema_version=1
        LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return r8HealthResult({ reasons: ["r8_shadow_state_missing"] });
    const rawLastRun = row.last_shadow_run_at;
    const lastRun = rawLastRun instanceof Date ? rawLastRun : (rawLastRun ? new Date(rawLastRun) : null);
    const validLastRun = lastRun && Number.isFinite(lastRun.valueOf()) ? lastRun : null;
    const ageSeconds = validLastRun ? (now.valueOf() - validLastRun.valueOf()) / 1000 : null;
    const futureSkewSeconds = ageSeconds !== null && ageSeconds < 0 ? -ageSeconds : 0;
    const future = futureSkewSeconds > maxFutureSkewSeconds;
    const fresh = ageSeconds !== null && !future && ageSeconds <= maxAgeSeconds;
    const providerSendEnabled = row.provider_send_enabled === true;
    const reasons = [];
    if (!validLastRun) reasons.push("r8_shadow_heartbeat_missing");
    else if (future) reasons.push("r8_shadow_heartbeat_future");
    else if (!fresh) reasons.push("r8_shadow_heartbeat_stale");
    if (providerSendEnabled) reasons.push("r8_provider_send_enabled");
    return r8HealthResult({
      available: true, ok: reasons.length === 0, reasons,
      lastRunAt: validLastRun ? validLastRun.toISOString() : null,
      lastCount: Number(row.last_shadow_count || 0), providerSendEnabled, fresh,
      ageSeconds, future, futureSkewSeconds,
    });
  } catch {
    return r8HealthResult({ reasons: ["r8_shadow_health_query_failed"] });
  }
}

async function main(options = {}) {
  const args = options.args || process.argv.slice(2);
  const workerFile = argumentValue(args, "--worker-heartbeat-file") || process.env.NOTIFICATION_WORKER_HEARTBEAT_FILE;
  const schedulerDirectory = argumentValue(args, "--scheduler-heartbeat-dir") || process.env.NOTIFICATION_SCHEDULER_HEARTBEAT_DIR;
  const lookbackHours = argumentValue(args, "--lookback-hours");
  const ownsDb = !options.db;
  const db = options.db || createDb();
  try {
    if (ownsDb) await db.connect();
    const execute = options.collectHealth || collectHealth;
    let report = await execute(db, {
      lookbackHours,
      heartbeat: {
        workerAt: readHeartbeat(workerFile),
        schedulers: schedulerHeartbeat.readSchedulerHeartbeats(schedulerDirectory),
      },
      providerReady: providerReadiness(options.env || process.env),
      ziweiRuntime: readZiweiRuntimeContext(options.env || process.env),
    });
    const inspectR8 = options.readR8ShadowHealth || readR8ShadowHealth;
    const r8Shadow = await inspectR8(db, {
      now: options.now,
      maxAgeSeconds: options.r8ShadowMaxAgeSeconds,
      maxFutureSkewSeconds: options.r8ShadowMaxFutureSkewSeconds,
    });
    const existingReasons = Array.isArray(report?.reasons) ? report.reasons : [];
    const r8Reasons = Array.isArray(r8Shadow?.reasons) ? r8Shadow.reasons : [];
    report = {
      ...report,
      ok: report?.ok === true && r8Shadow?.ok === true,
      reasons: [...new Set([...existingReasons, ...r8Reasons])],
      metrics: { ...(report?.metrics && typeof report.metrics === "object" ? report.metrics : {}), r8Shadow },
    };
    (options.log || console.log)(JSON.stringify(report));
    return report;
  } catch {
    const report = { ok: false, reasons: ["health_query_failed"] };
    (options.log || console.log)(JSON.stringify(report));
    return report;
  } finally {
    if (ownsDb) await db.end().catch(() => null);
  }
}

if (require.main === module) {
  main().then((report) => { if (!report.ok) process.exitCode = 1; });
}

module.exports = { argumentValue, main, providerReadiness, readHeartbeat, readR8ShadowHealth };
