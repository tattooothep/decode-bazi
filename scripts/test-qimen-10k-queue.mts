import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const scheduler = require("./mobile-qimen-push-cron.cjs");
const releaseCommit = "e".repeat(40);
const sourceDigest = "987997fa7ee6cbd148c337272975ac14c3b7e720f392d7671f93549b9315a460";
const queue = Array.from({ length: 10_000 }, (_, index) => ({
  user_id: `account_${index}`,
  installation_id: `installation_${index}`,
  lease_token: `lease_${index}`,
}));
const claimSizes: number[] = [];
let reservations = 0;
let released = 0;
let releaseQueries = 0;
let deviceDeliveries = 0;

const db = {
  async query(sql: string, params: unknown[] = []) {
    if (/mobile_qimen_producer_state/u.test(sql)) return { rows: [{
      producer_enabled: true, source_digest: sourceDigest, backend_commit: releaseCommit,
    }] };
    if (/claim_mobile_qimen_installations/u.test(sql)) {
      const limit = Number(params[1]);
      assert.ok(limit >= 1 && limit <= 500, "each claimed chunk remains memory- and cleanup-bounded");
      const claims = queue.splice(0, limit);
      claimSizes.push(claims.length);
      return { rows: claims };
    }
    if (/SET lease_token=NULL,lease_expires_at=NULL/u.test(sql)) {
      assert.ok(Array.isArray(params[0]), "cleanup must be batched by claim UUID arrays");
      releaseQueries += 1;
      released += params[0].length;
      return { rowCount: params[0].length, rows: [] };
    }
    throw new Error(`unexpected 10k queue SQL: ${sql}`);
  },
};

const reports = [];
for (let minute = 0; minute < 4; minute += 1) {
  reports.push(await scheduler.runScheduler(
    db,
    new AbortController().signal,
    new Date(Date.parse("2026-08-21T14:00:30.000Z") + minute * 60_000),
    {
      runtimeProducerEnabled: true,
      backendCommit: releaseCommit,
      batchLimit: 500,
      maxPerRun: 2_500,
      workerCount: 20,
      async processClaim() {
        reservations += 1;
        return { reserved: 1, skipped: 0, reason: null };
      },
    },
  ));
}

assert.equal(queue.length, 0, "four one-minute runs drain the full 10k due cohort inside the occurrence admission window");
assert.equal(reservations, 10_000, "every due installation reaches an immutable reservation decision");
assert.equal(released, 10_000, "every claimed installation lease is released after its reservation decision");
assert.equal(releaseQueries, 100, "10k cleanup uses bounded 100-row updates instead of 10k sequential round-trips");
assert.ok(claimSizes.every((size) => size === 500), "10k drain uses twenty bounded 500-row chunks");
assert.deepEqual(reports.map((report: { due: number; reserved: number }) => [report.due, report.reserved]),
  Array.from({ length: 4 }, () => [2_500, 2_500]));
assert.equal(deviceDeliveries, 0,
  "reservation capacity never claims provider acceptance or physical-device delivery evidence");

console.log("QIMEN_10K_QUEUE_OK due=10000 runs=4 chunks=20 chunkSize=500 deviceDelivery=unclaimed");
