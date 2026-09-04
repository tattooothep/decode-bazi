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
  return { fcm, expo: expoIosPushReady(env) };
}

function createDb() {
  return new Client({
    host: process.env.PGHOST || "127.0.0.1", port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || "decode_db", user: process.env.PGUSER || "decode_user", password: process.env.PGPASSWORD,
  });
}

async function readR8ShadowHealth(db) {
  if (!db || typeof db.query !== "function") return null;
  try {
    const relation = await db.query(
      "SELECT to_regclass('mobile_science_notification_producer_state')::text AS relation",
    );
    if (!relation.rows[0]?.relation) return null;
    const result = await db.query(
      `SELECT last_shadow_run_at,last_shadow_count,provider_send_enabled
         FROM mobile_science_notification_producer_state
        WHERE science_id='astronomy_fact' AND submode='civil_two_hour' AND schema_version=1
        LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return { available: false, lastRunAt: null, lastCount: 0, providerSendEnabled: false };
    return {
      available: true,
      lastRunAt: row.last_shadow_run_at instanceof Date
        ? row.last_shadow_run_at.toISOString()
        : (row.last_shadow_run_at || null),
      lastCount: Number(row.last_shadow_count || 0),
      providerSendEnabled: row.provider_send_enabled === true,
    };
  } catch {
    return { available: false, lastRunAt: null, lastCount: 0, providerSendEnabled: false };
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
    const r8Shadow = await readR8ShadowHealth(db);
    if (r8Shadow && report?.metrics && typeof report.metrics === "object") {
      report = { ...report, metrics: { ...report.metrics, r8Shadow } };
    }
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
