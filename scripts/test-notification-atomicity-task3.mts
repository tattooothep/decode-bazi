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

await assert.rejects(
  delivery.reserve({ async query() { throw new Error("transactional validation ran too late"); } }, {
    userId: "acct-policy", key: "invalid-transactional", kind: "daily", transactional: true,
    title: "Daily", body: "Daily body", payload: {}, sourceFacts: {}, messages: [],
  }, true),
  /transactional.*security.*service/iu,
  "reservation rejects a raw transactional bypass for advisory/science categories before any query",
);
const untrustedTransactional = delivery.currentPolicyDecision(
  { kind: "daily", transactional: true, privacy_safe: true, created_at: new Date().toISOString() },
  { privacy_preview: true, has_prefs: false, timezone: "UTC", now_at: new Date(), prefs: null },
  0,
);
assert.equal(untrustedTransactional.allow, false, "retry policy does not trust a raw transactional flag on a daily parent");
assert.equal(
  delivery.currentPolicyDecision(
    { kind: "security", transactional: true, privacy_safe: true, created_at: new Date().toISOString() },
    { privacy_preview: true, has_prefs: false, timezone: "UTC", now_at: new Date(), prefs: null },
    0,
  ).allow,
  true,
  "validated transactional security remains eligible for its explicit bypass",
);

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
let settleIgnoredCallback!: () => void;
let observedAbort = false;
const ignoredCallback = new Promise<void>((resolve) => { settleIgnoredCallback = resolve; });
const timedOutRun = delivery.withSchedulerRunLease(timeoutDb, "yam", async (signal: AbortSignal) => {
  signal.addEventListener("abort", () => { observedAbort = true; }, { once: true });
  await ignoredCallback;
  return "late-result";
}, { timeoutMs: 20 });
await new Promise((resolve) => setTimeout(resolve, 40));
assert.equal(observedAbort, true, "the shared scheduler signal is aborted at the total deadline");
assert.equal(releases, 0, "the scheduler lease stays fenced while an abort-ignoring callback is unsettled");
const overlappingRun = await delivery.withSchedulerRunLease(timeoutDb, "yam", async () => "overlap", { timeoutMs: 20 });
assert.deepEqual(overlappingRun, { acquired: false, result: null }, "a next run cannot acquire while the old callback is unsettled");
settleIgnoredCallback();
await assert.rejects(timedOutRun, /notification_internal_timeout/u);
assert.equal(releases, 1, "the timed-out scheduler unlocks only after its callback settles");
const nextRun = await delivery.withSchedulerRunLease(timeoutDb, "yam", async () => "next", { timeoutMs: 20 });
assert.deepEqual(nextRun, { acquired: true, result: "next" }, "the next scheduler run can acquire after the old callback settles");

console.log("NOTIFICATION_ATOMICITY_TASK3_OK");
