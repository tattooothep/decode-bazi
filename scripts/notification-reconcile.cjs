#!/usr/bin/env node
"use strict";

const { Client } = require("pg");
const { reconcile } = require("../src/lib/notification-observability.cjs");

function createDb() {
  return new Client({
    host: process.env.PGHOST || "127.0.0.1", port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || "decode_db", user: process.env.PGUSER || "decode_user", password: process.env.PGPASSWORD,
  });
}

function parseArgs(args) {
  return Array.isArray(args) && args.length === 0 ? { ok: true } : { ok: false, error: "invalid_arguments" };
}

async function main(options = {}) {
  const args = options.args || process.argv.slice(2);
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    const report = { ok: false, error: parsed.error };
    (options.log || console.log)(JSON.stringify(report));
    return report;
  }
  const ownsDb = !options.db;
  const db = options.db || createDb();
  try {
    if (ownsDb) await db.connect();
    const report = await reconcile(db);
    (options.log || console.log)(JSON.stringify(report));
    return report;
  } catch {
    const report = { ok: false, error: "reconciliation_query_failed" };
    (options.log || console.log)(JSON.stringify(report));
    return report;
  } finally {
    if (ownsDb) await db.end().catch(() => null);
  }
}

async function runCli(options = {}) {
  const report = await (options.execute || main)(options);
  (options.processRef || process).exitCode = report.ok === true ? 0 : 1;
  return report;
}

if (require.main === module) runCli();

module.exports = { main, parseArgs, runCli };
