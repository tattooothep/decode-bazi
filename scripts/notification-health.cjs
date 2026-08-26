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
    const report = await execute(db, {
      lookbackHours,
      heartbeat: {
        workerAt: readHeartbeat(workerFile),
        schedulers: schedulerHeartbeat.readSchedulerHeartbeats(schedulerDirectory),
      },
      providerReady: providerReadiness(options.env || process.env),
      ziweiRuntime: readZiweiRuntimeContext(options.env || process.env),
    });
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

module.exports = { argumentValue, main, providerReadiness, readHeartbeat };
