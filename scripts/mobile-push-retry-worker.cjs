#!/usr/bin/env node
/**
 * Independent durable mobile push retry/receipt worker.
 * Claims are implemented in the delivery library with FOR UPDATE SKIP LOCKED;
 * this process never asks a scheduler to rebuild notification content.
 */
const { Pool } = require("pg");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");

async function main(options = {}) {
  const ownsDb = !options.db;
  const concurrency = Math.max(1, Math.min(32, Number(options.concurrency || process.env.MOBILE_PUSH_RETRY_CONCURRENCY || 20)));
  const limit = Math.max(1, Math.min(20_000, Number(options.limit || process.env.MOBILE_PUSH_RETRY_LIMIT || 10_000)));
  const db = options.db || (options.createDb ? options.createDb() : new Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || "decode_db",
    user: process.env.PGUSER || "decode_user",
    password: process.env.PGPASSWORD,
    max: Math.min(36, concurrency + 4),
  }));
  const runRetry = options.runRetryBatch || delivery.runRetryBatch;
  const pollReceipts = options.pollReceiptBatch || delivery.pollReceiptBatch;
  const log = options.log || console.log;
  const ownedPool = ownsDb && typeof db?.totalCount === "number" && typeof db?.query === "function";
  if (ownsDb && !ownedPool) await db.connect();
  try {
    const retry = await runRetry(db, { limit, concurrency });
    const receipts = await pollReceipts(db);
    log(
      `[mobile-push-retry] claimed=${retry.claimed} accepted=${retry.accepted} retry_due=${retry.retryDue} dead=${retry.dead} receipt_checked=${receipts.claimed} receipt_accepted=${receipts.accepted || 0} delivered=${receipts.delivered} receipt_errors=${receipts.errors} receipt_pending=${receipts.pending || 0} receipt_provider_errors=${receipts.providerErrors || 0}`,
    );
  } finally {
    if (ownsDb) await db.end();
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error("[mobile-push-retry] worker_failed");
    process.exitCode = 1;
  });
}

module.exports = {
  claimOne: delivery.claimOne,
  claimReceiptOne: delivery.claimReceiptOne,
  finishReceipt: delivery.finishReceipt,
  main,
  pollReceiptBatch: delivery.pollReceiptBatch,
  runRetryBatch: delivery.runRetryBatch,
};
