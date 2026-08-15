import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const delivery = require("../src/lib/mobile-notification-delivery.cjs");

const queries: Array<{ sql: string; params: unknown[] }> = [];
const db = {
  async query(sql: string, params: unknown[] = []) {
    queries.push({ sql, params });
    if (/pg_try_advisory_lock/iu.test(sql)) return { rows: [{ locked: true }], rowCount: 1 };
    if (/pg_advisory_unlock/iu.test(sql)) return { rows: [{ unlocked: true }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  },
};

const lease = await delivery.trySchedulerRunLease(db, "yam");
assert.equal(lease.acquired, true);
await lease.release();
assert.match(queries[0].sql, /pg_try_advisory_lock/iu);
assert.match(queries[1].sql, /pg_advisory_unlock/iu);

const source = delivery.reserve.toString();
assert.match(source, /pg_advisory_xact_lock/iu, "cap reservation must serialize by user");
assert.match(source, /AT TIME ZONE/iu, "cap must use local calendar date");
assert.doesNotMatch(source, /interval\s+'24 hours'/iu, "cap must not be rolling 24h");
assert.match(source, /max_per_day/iu, "cap and logical reservation must share transaction");
assert.match(source, /assertNoCredentialFacts\(notice\.sourceFacts\)/u, "source facts must be credential-key guarded before storage");
assert.doesNotMatch(delivery.deriveParent.toString(), /notice\.sourceFacts/u, "parent derivation must not reference an undefined notice");

for (const forbidden of ["authorization", "auth", "cookie", "session", "apiKey", "privateKey", "bearer", "accessToken", "refresh_token"]) {
  assert.throws(
    () => delivery.assertNoCredentialFacts({ nested: { [forbidden]: "raw-secret" } }),
    /forbidden credential key/u,
    `${forbidden} must be rejected before source facts can be stored`,
  );
}

let releaseArgument: unknown = undefined;
const pooledDb = {
  totalCount: 1,
  async connect() {
    return {
      async query(sql: string) {
        if (/pg_try_advisory_lock/iu.test(sql)) return { rows: [{ locked: true }] };
        if (/pg_advisory_unlock/iu.test(sql)) throw new Error("fixture unlock failed");
        return { rows: [] };
      },
      release(argument: unknown) { releaseArgument = argument; },
    };
  },
};
const brokenLease = await delivery.trySchedulerRunLease(pooledDb, "yam");
await assert.rejects(brokenLease.release(), /fixture unlock failed/u);
assert.equal(releaseArgument, true, "a session with an uncertain advisory-lock state must be discarded");

let held = false;
let releases = 0;
const timeoutDb = {
  async query(sql: string) {
    if (/pg_try_advisory_lock/iu.test(sql)) {
      if (held) return { rows: [{ locked: false }] };
      held = true;
      return { rows: [{ locked: true }] };
    }
    if (/pg_advisory_unlock/iu.test(sql)) {
      held = false;
      releases += 1;
      return { rows: [{ unlocked: true }] };
    }
    return { rows: [] };
  },
};
await assert.rejects(
  delivery.withSchedulerRunLease(timeoutDb, "yam", async () => new Promise(() => {}), { timeoutMs: 20 }),
  /notification_internal_timeout/u,
);
assert.equal(releases, 1, "a total-timeout abort releases the scheduler lease");
const nextRun = await delivery.withSchedulerRunLease(timeoutDb, "yam", async () => "next", { timeoutMs: 20 });
assert.deepEqual(nextRun, { acquired: true, result: "next" }, "the next scheduler run can acquire after a timed-out fetch");

console.log("NOTIFICATION_ATOMICITY_TASK3_OK");
