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

console.log("NOTIFICATION_ATOMICITY_TASK3_OK");
