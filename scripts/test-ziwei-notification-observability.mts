import assert from "node:assert/strict";
import { createRequire } from "node:module";
import science from "../src/lib/notification-science.cjs";

const require = createRequire(import.meta.url);
const observability = require("../src/lib/notification-observability.cjs");
const runtime = require("../src/lib/ziwei-hourly-runtime-observability.cjs");

const now = new Date("2026-08-26T12:00:00.000Z");
const commit = "a".repeat(40);
const digest = runtime.ZIWEI_HOURLY_SOURCE_DIGEST;
const capturedSql: string[] = [];

function aggregateDb(ziwei: Record<string, unknown>) {
  return {
    async query(sql: string) {
      capturedSql.push(sql);
      if (/^(?:BEGIN|COMMIT|ROLLBACK|SET LOCAL)/u.test(sql)) return { rows: [] };
      if (sql.includes("mobile_ziwei_hourly_producer_state")) return { rows: [ziwei] };
      if (sql.includes("mobile_zibai_installations")) return { rows: [{
        overdue_count: 0, oldest_lag_seconds: 0, active_enabled_count: 1, inactive_orphan_count: 3,
        location_absent_count: 0, location_fresh_count: 1, location_stale_count: 0,
        engine_failure_count: 0, daily_reserved_count: 0, shichen_reserved_count: 0,
        skipped_count: 0, quiet_skip_count: 0, duplicate_or_cap_count: 0,
      }] };
      if (sql.includes("mobile_qimen_installations")) return { rows: [{ producer_enabled: false }] };
      if (sql.includes("GROUP BY l.kind,a.provider,a.status")) return { rows: [] };
      return { rows: [{}] };
    },
  };
}

const heartbeat = {
  workerAt: now.toISOString(),
  schedulers: Object.fromEntries(science.SCHEDULER_NAMES.map((name: string) => [name, now.toISOString()])),
};
const mismatch = await observability.collectHealth(aggregateDb({
  producer_configured: true,
  producer_enabled: false,
  source_digest: "b".repeat(64),
  backend_commit: "c".repeat(40),
  enabled_count: 4,
  overdue_count: 2,
  oldest_lag_seconds: 900,
  stuck_occurrence_count: 1,
  oldest_stuck_seconds: 1200,
  reserved_count: 2,
  skipped_count: 3,
}), {
  now, heartbeat, providerReady: { fcm: true, expo: true },
  ziweiRuntime: { producerEnabled: false, backendCommit: commit, sourceReady: false, sourceDigest: digest },
});

assert.equal(mismatch.ok, false, "a fresh scheduler heartbeat cannot hide a disabled Ziwei producer");
for (const reason of [
  "ziwei_producer_disabled", "ziwei_runtime_disabled", "ziwei_source_not_ready",
  "ziwei_source_digest_mismatch", "ziwei_commit_mismatch", "ziwei_due_lag", "ziwei_occurrence_stuck",
]) assert.ok(mismatch.reasons.includes(reason), `health reports ${reason}`);
assert.deepEqual(mismatch.metrics.ziwei, {
  producerConfigured: true,
  producerEnabled: false,
  runtimeEnabled: false,
  sourceReady: false,
  sourceDigestMatches: false,
  runtimeCommitReady: true,
  commitMatches: false,
  enabledCount: 4,
  overdueCount: 2,
  oldestLagSeconds: 900,
  stuckOccurrenceCount: 1,
  oldestStuckSeconds: 1200,
  reservedCount: 2,
  skippedCount: 3,
}, "Ziwei health is aggregate/provenance status only");
assert.equal(JSON.stringify(mismatch).includes(commit), false, "health never emits a release commit");
assert.equal(JSON.stringify(mismatch).includes(digest), false, "health never emits a source digest");

const healthy = await observability.collectHealth(aggregateDb({
  producer_configured: true,
  producer_enabled: true,
  source_digest: digest,
  backend_commit: commit,
  enabled_count: 2,
  overdue_count: 0,
  oldest_lag_seconds: 0,
  stuck_occurrence_count: 0,
  oldest_stuck_seconds: 0,
  reserved_count: 1,
  skipped_count: 0,
}), {
  now, heartbeat, providerReady: { fcm: true, expo: true },
  ziweiRuntime: { producerEnabled: true, backendCommit: commit, sourceReady: true, sourceDigest: digest },
});
assert.equal(healthy.ok, true, "matching producer/runtime/source provenance stays healthy with no due or stuck work");

const zibaiSql = capturedSql.find((sql) => sql.includes("mobile_zibai_installations")) || "";
assert.match(zibaiSql, /JOIN mobile_push_tokens t/u, "Zi Bai health resolves the active installation owner token");
assert.match(zibaiSql, /t\.enabled=true/u, "Zi Bai health requires an enabled token");
assert.match(zibaiSql, /t\.zibai_payload_schema IN \(1,2\)/u, "Zi Bai health requires a capable token schema");
assert.match(zibaiSql, /t\.zibai_calculation_version=\$4/u, "Zi Bai health uses the active token calculation version");
assert.match(zibaiSql, /z\.calculation_version=\$4/u, "Zi Bai health uses the active installation calculation version");
assert.equal(mismatch.metrics.zibai.activeEnabledCount, 1);
assert.equal(mismatch.metrics.zibai.inactiveOrphanCount, 3,
  "inactive Zi Bai rows remain visible as a separate informational aggregate");

const runtimeContext = runtime.readZiweiRuntimeContext({
  ZIWEI_HOURLY_PRODUCER_ENABLED: "1",
  HOURKEY_RELEASE_COMMIT: commit,
}, { verifySources: () => true });
assert.equal(runtimeContext.producerEnabled, true);
assert.equal(runtimeContext.backendCommit, commit);
assert.equal(runtimeContext.sourceReady, true, "runtime context carries the source-manifest verifier result");
assert.equal(runtimeContext.sourceDigest, digest);
assert.equal(runtime.verifyZiweiRuntimeSources(), true,
  "observability source hashes stay aligned with the reviewed Ziwei runtime files");
const runtimeSource = String(require("node:fs").readFileSync("src/lib/ziwei-hourly-runtime-observability.cjs", "utf8"));
assert.doesNotMatch(runtimeSource, /repositoryRoot\s*\|\|\s*join\(__dirname/u,
  "source readiness never derives a release root from a webpack bundle directory");

console.log("ZIWEI_NOTIFICATION_OBSERVABILITY_OK");
