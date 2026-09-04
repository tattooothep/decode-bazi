import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runAcceleratedProviderFreeSoak } from "./lib/notification-r8-soak.mts";

const first = runAcceleratedProviderFreeSoak();
const second = runAcceleratedProviderFreeSoak();
assert.deepEqual(first, second, "the same pinned workload must reproduce byte-equivalent metrics");
assert.equal(first.mode, "accelerated_provider_free_72h_simulation");
assert.equal(first.observedWindowHours, 72);
assert.equal(first.accounts, 10_000);
assert.equal(first.boundariesPerDay, 120_000);
assert.equal(first.boundaries, 360_000);
assert.equal(first.providerCalls, 0);
assert.equal(first.duplicateLineages, 0);
assert.equal(first.deduplicatedReplays, first.crashReplayAttempts);
assert.equal(first.processedOccurrences + first.revokedBeforeEnqueue + first.deletedBeforeEnqueue, first.boundaries);
assert.ok(first.p95Minutes <= 5);
assert.ok(first.p99Minutes <= 10);
assert.ok(first.maxBacklogMinutes < 10);
assert.ok(first.poolPercent < 70);
assert.ok(first.quotaPercent < 70);
assert.ok(first.headroomMultiplier >= 2);
assert.ok(first.legacyP95RegressionPercent < 5);
assert.equal(first.tzdb, "2026c");
assert.equal(first.qizhengSuppressionReasons.every((reason) => reason === "source_incomplete"), true);

const source = readFileSync("scripts/lib/notification-r8-soak.mts", "utf8");
assert.doesNotMatch(source, /firebase|expo-server-sdk|apns2|sendMulticast|sendEachForMulticast/iu);
assert.doesNotMatch(source, /p95Minutes:\s*1\.9|poolPercent:\s*48|quotaPercent:\s*50/iu,
  "release metrics must be calculated from the workload, not copied constants");

console.log(`NOTIFICATION_R8_SOAK_OK boundaries=${first.boundaries} p95=${first.p95Minutes}m p99=${first.p99Minutes}m`);
