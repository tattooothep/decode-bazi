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

async function main(options = {}) {
  const args = options.args || process.argv.slice(2);
  const index = args.indexOf("--lookback-hours");
  const ownsDb = !options.db;
  const db = options.db || createDb();
  try {
    if (ownsDb) await db.connect();
    const report = await reconcile(db, { lookbackHours: index >= 0 ? args[index + 1] : undefined });
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

if (require.main === module) main().then((report) => { if (report.ok === false) process.exitCode = 1; });

module.exports = { main };
