#!/usr/bin/env node
"use strict";

const { Client } = require("pg");
const retention = require("../src/lib/notification-retention.cjs");

const ARGUMENTS = Object.freeze({
  "--source-facts-days": "sourceFactsDays",
  "--attempt-days": "attemptDays",
  "--history-days": "historyDays",
  "--security-history-days": "securityHistoryDays",
  "--batch-size": "batchSize",
  "--max-batches": "maxBatches",
});

function parseArgs(args) {
  const input = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = ARGUMENTS[args[index]];
    const value = args[index + 1];
    if (!key || value === undefined || !/^\d+$/u.test(value)) return { ok: false, error: "invalid_arguments" };
    input[key] = Number(value);
  }
  try { return { ok: true, ...retention.optionsFor(input) }; }
  catch { return { ok: false, error: "invalid_arguments" }; }
}

function createDb(env = process.env) {
  return new Client({
    host: env.PGHOST || "127.0.0.1", port: Number(env.PGPORT || 5433),
    database: env.PGDATABASE || "decode_db", user: env.PGUSER || "decode_user", password: env.PGPASSWORD,
  });
}

async function main(options = {}) {
  const parsed = parseArgs(options.args || process.argv.slice(2));
  const log = options.log || console.log;
  if (!parsed.ok) {
    const report = { ok: false, error: "invalid_arguments" };
    log(JSON.stringify(report));
    return report;
  }
  const ownsDb = !options.db;
  const db = options.db || createDb(options.env || process.env);
  try {
    if (ownsDb) await db.connect();
    const report = await retention.runRetention(db, parsed);
    log(JSON.stringify(report));
    return report;
  } catch {
    const report = { ok: false, error: "retention_failed" };
    log(JSON.stringify(report));
    return report;
  } finally {
    if (ownsDb) await db.end().catch(() => null);
  }
}

if (require.main === module) {
  main().then((report) => { if (!report.ok) process.exitCode = 1; });
}

module.exports = { main,parseArgs };
