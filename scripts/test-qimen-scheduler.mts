import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let scheduler: Record<string, any> | null = null;
try {
  scheduler = require("./mobile-qimen-push-cron.cjs");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
}
assert.ok(scheduler, "the dedicated Qimen scheduler must exist");

const row = {
  user_id: "11111111-1111-4111-8111-111111111111",
  installation_id: "22222222-2222-4222-8222-222222222222",
  purpose: "travel",
  location_timezone: "Asia/Bangkok",
  longitude: 100.5018,
  quiet_start: 22,
  quiet_end: 7,
  location_permission: "foreground",
};
const occurrence = {
  snapshotDigest: "a".repeat(64),
  selectedDirection: "SE",
  versionTuple: {
    month: "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1",
    day: "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1",
    hour: "QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_V1",
  },
  layers: { hour: { validFrom: "2026-08-21T14:00:00.000Z", validUntil: "2026-08-21T16:00:00.000Z" } },
};

const key = scheduler.occurrenceKey(row, occurrence);
assert.match(key, /^qimen\|[a-f0-9]{64}$/u);
assert.notEqual(key, scheduler.occurrenceKey(row, { ...occurrence, selectedDirection: "E" }));
assert.notEqual(key, scheduler.occurrenceKey(row, {
  ...occurrence,
  versionTuple: { ...occurrence.versionTuple, day: "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V2" },
}));

assert.deepEqual(
  scheduler.admissionDecision(row, occurrence, new Date("2026-08-21T14:00:30.000Z")),
  { allow: true, sendDeadline: "2026-08-21T14:10:00.000Z" },
);
assert.deepEqual(
  scheduler.admissionDecision(row, occurrence, new Date("2026-08-21T14:05:00.000Z")),
  { allow: true, sendDeadline: "2026-08-21T14:10:00.000Z" },
  "the scheduler must still admit a science-approved direction after the five-minute boundary buffer",
);
assert.deepEqual(
  scheduler.admissionDecision(row, occurrence, new Date("2026-08-21T14:10:00.000Z")),
  { allow: false, reason: "late_occurrence" },
);
assert.deepEqual(
  scheduler.admissionDecision(
    { ...row, quiet_start: 0, quiet_end: 0 },
    { ...occurrence, layers: { hour: { validFrom: "2026-08-21T15:54:00.000Z", validUntil: "2026-08-21T15:59:30.000Z" } } },
    new Date("2026-08-21T15:54:30.000Z"),
  ),
  { allow: false, reason: "provider_safety_window" },
);
assert.deepEqual(
  scheduler.admissionDecision({ ...row, quiet_start: 20, quiet_end: 7 }, occurrence, new Date("2026-08-21T14:00:30.000Z")),
  { allow: false, reason: "quiet_hours" },
);

const queries: string[] = [];
const fakeDb = {
  async query(sql: string, params: unknown[]) {
    queries.push(sql);
    assert.equal(params[1], 25);
    return { rows: [{ installation_id: row.installation_id }] };
  },
};
const claimed = await scheduler.claimDue(fakeDb, new Date("2026-08-21T14:00:30.000Z"), 25);
assert.equal(claimed.length, 1);
assert.match(queries[0], /claim_mobile_qimen_installations/u);
assert.doesNotMatch(queries[0], /yam|today|personal/iu);
assert.deepEqual(scheduler.localDateTime("Asia/Bangkok", new Date("2026-08-21T17:30:00.000Z")), {
  date: "2026-08-22", time: "00:30",
});
assert.equal(scheduler.localDateTime("not/a-zone", new Date()), null);

const selectedEvidence = {
  month: { deityZh: "九天", doorZh: "開門", starZh: "天任" },
  day: { deityZh: "太陰", doorZh: "生門", starZh: "天心" },
  hour: { deityZh: "六合", doorZh: "開門", starZh: "天心" },
};
const copy = scheduler.buildQimenCopy("th", {
  purpose: "travel",
  selectedDirection: "SE",
  layers: { hour: occurrence.layers.hour },
  selectedEvidence,
});
assert.match(copy.title, /ฉีเหมิน/u);
assert.match(copy.body, /เดือน.*九天.*開門.*天任/u);
assert.match(copy.body, /วัน.*太陰.*生門.*天心/u);
assert.match(copy.body, /ยาม.*六合.*開門.*天心/u);

const source = fs.readFileSync(new URL("./mobile-qimen-push-cron.cjs", import.meta.url), "utf8");
assert.doesNotMatch(source, /mobile-yam-push|mobile-personal-reminders|today_occurrence/iu);
assert.match(source, /withSchedulerRunLease\(db, "qimen"/u);
assert.match(source, /writeSchedulerHeartbeat\("qimen"\)/u);

const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const snapshotRuntime = require("../src/lib/qimen-three-layer-notification.cjs");
const snapshotFixture = require("./fixtures/qimen-three-layer-valid-snapshot.cjs");
const deliverySource = fs.readFileSync(new URL("../src/lib/mobile-notification-delivery.cjs", import.meta.url), "utf8");
assert.match(deliverySource, /qimenOccurrenceId/u);
assert.match(deliverySource, /mobile_qimen_occurrences/u);
assert.match(deliverySource, /qimen_payload_schema/u);
assert.match(deliverySource, /location_permission,location_captured_at,location_expires_at/u,
  "retry must re-read current location permission and freshness from the installation");
assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: "11111111-1111-4111-8111-111111111111", kind: "qimen", privacy_safe: true, transactional: false, source_facts: { eventEndAt: "2026-08-21T16:00:00.000Z" } },
    {
      privacy_preview: false,
      account_active: true,
      account_tier: "premium",
      account_sub_expires_at: "2027-08-21T00:00:00.000Z",
      account_trial_ends_at: null,
      now_at: new Date("2026-08-21T14:00:30.000Z"),
      qimen_enabled: true,
      qimen_expires_at: "2026-08-21T16:00:00.000Z",
      qimen_timezone: "Asia/Bangkok",
      qimen_quiet_start: 22,
      qimen_quiet_end: 7,
    },
    999,
  ),
  { allow: true },
  "Qimen retry policy uses its own installation consent and ignores the unrelated generic daily cap",
);
for (const [contextPatch, reason] of [
  [{ qimen_location_permission: "denied" }, "policy_location_permission_revoked"],
  [{ qimen_location_expires_at: "2026-08-21T14:00:00.000Z" }, "policy_location_expired"],
] as const) {
  assert.deepEqual(
    delivery.currentPolicyDecision(
      { user_id: "11111111-1111-4111-8111-111111111111", kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
      {
        privacy_preview: false, account_active: true, account_tier: "premium",
        account_sub_expires_at: "2027-08-21T00:00:00.000Z", account_trial_ends_at: null,
        now_at: new Date("2026-08-21T14:00:30.000Z"), qimen_enabled: true,
        qimen_location_required: true, qimen_location_permission: "foreground",
        qimen_location_captured_at: "2026-08-20T14:00:30.000Z",
        qimen_location_expires_at: "2026-08-27T14:00:30.000Z",
        qimen_expires_at: "2026-08-21T16:00:00.000Z", qimen_timezone: "Asia/Bangkok",
        qimen_quiet_start: 22, qimen_quiet_end: 7, ...contextPatch,
      },
      0,
    ),
    { allow: false, terminal: true, reason },
  );
}
assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: "11111111-1111-4111-8111-111111111111", kind: "qimen", privacy_safe: true, transactional: false, source_facts: { eventEndAt: "2026-08-21T16:00:00.000Z" } },
    {
      privacy_preview: false,
      account_active: true,
      account_tier: "premium",
      account_sub_expires_at: "2027-08-21T00:00:00.000Z",
      account_trial_ends_at: null,
      now_at: new Date("2026-08-21T14:00:30.000Z"),
      qimen_enabled: true,
      qimen_expires_at: "2026-08-21T16:00:00.000Z",
      qimen_timezone: "Asia/Bangkok",
      qimen_quiet_start: 20,
      qimen_quiet_end: 7,
    },
    0,
  ),
  { allow: false, terminal: true, reason: "policy_quiet_hours" },
  "a queued Qimen attempt is terminal in quiet hours and cannot replay in another shichen",
);
assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: "11111111-1111-4111-8111-111111111111", kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
    {
      privacy_preview: false,
      account_active: true,
      account_tier: "premium",
      account_sub_expires_at: "2027-08-21T00:00:00.000Z",
      account_trial_ends_at: null,
      now_at: new Date("2026-08-21T14:06:00.000Z"),
      qimen_enabled: true,
      qimen_expires_at: "2026-08-21T16:00:00.000Z",
      qimen_send_deadline: "2026-08-21T14:05:00.000Z",
      qimen_timezone: "Asia/Bangkok",
      qimen_quiet_start: 22,
      qimen_quiet_end: 7,
    },
    0,
  ),
  { allow: false, terminal: true, reason: "policy_late_occurrence" },
  "a retry can never escape the immutable occurrence admission deadline",
);
assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: "11111111-1111-4111-8111-111111111111", kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
    {
      privacy_preview: false,
      account_active: true,
      account_tier: "premium",
      account_sub_expires_at: "2027-08-21T00:00:00.000Z",
      account_trial_ends_at: null,
      now_at: new Date("2026-08-21T14:01:00.000Z"),
      qimen_enabled: true,
      qimen_expires_at: "2026-08-21T16:00:00.000Z",
      qimen_send_deadline: "2026-08-21T14:05:00.000Z",
      qimen_paused_until: "2026-08-22T00:00:00.000Z",
      qimen_timezone: "Asia/Bangkok",
      qimen_quiet_start: 22,
      qimen_quiet_end: 7,
    },
    0,
  ),
  { allow: false, terminal: true, reason: "policy_paused" },
  "pause terminally skips this immutable shichen instead of replaying it later",
);
assert.match(source, /snapshot\.accountId !== row\.user_id/u);
assert.match(source, /snapshot\.purpose !== row\.purpose/u);
assert.match(source, /snapshot\.layers\.hour\.validFrom !== canonicalWindow\.startAt/u);
assert.match(source, /qimenNotificationEntitlement/u);
assert.match(source, /paused_until/u);
assert.match(source, /HOURKEY_RELEASE_COMMIT/u);
assert.match(source, /producer\.backend_commit !== runtimeCommit/u);

const disabledQueries: string[] = [];
const disabledDb = {
  async query(sql: string) {
    disabledQueries.push(sql);
    if (/mobile_qimen_producer_state/u.test(sql)) return { rows: [{ producer_enabled: false }] };
    throw new Error("disabled scheduler must not claim installations");
  },
};
const report = await scheduler.runScheduler(
  disabledDb,
  { throwIfAborted() {} },
  new Date("2026-08-21T14:00:30.000Z"),
  { runtimeProducerEnabled: true },
);
assert.deepEqual(report, { disabled: true, due: 0, reserved: 0, skipped: 0 });
assert.equal(disabledQueries.length, 1);

const canonicalSeed = new Date("2026-08-21T12:30:00.000Z");
const canonicalWindow = require("../src/lib/qimen-notification-advisory.cjs").trueSolarShichenWindow({
  timezone: "Asia/Bangkok", longitude: 100.5018, instant: canonicalSeed,
});
const canonicalAt = new Date(Date.parse(canonicalWindow.startAt) + 60_000);
const recoveredInput = snapshotFixture.input("acct_recovery");
recoveredInput.createdAt = canonicalAt.toISOString();
recoveredInput.layers.hour.validFrom = canonicalWindow.startAt;
recoveredInput.layers.hour.validUntil = canonicalWindow.endAt;
const persistedSnapshot = snapshotRuntime.buildQimenThreeLayerSnapshot(recoveredInput);
const recoveryClaim = { user_id: "acct_recovery", installation_id: "installation_recovery", lease_token: "lease_recovery" };
const recoveryRow = {
  ...recoveryClaim,
  purpose: "travel",
  location_timezone: "Asia/Bangkok",
  longitude: 100.5018,
  quiet_start: 22,
  quiet_end: 7,
  location_captured_at: new Date(canonicalAt.valueOf() - 24 * 60 * 60 * 1_000).toISOString(),
  location_expires_at: new Date(canonicalAt.valueOf() + 6 * 24 * 60 * 60 * 1_000).toISOString(),
  location_permission: "foreground",
  qimen_payload_schema: 2,
  tier: "premium",
  sub_expires_at: "2027-08-21T00:00:00.000Z",
  trial_ends_at: null,
  paused_until: null,
  token_id: "token_recovery",
  device_push_token: "device_recovery",
  device_token_type: "fcm",
  expo_push_token: null,
  platform: "android",
  token_locale: "th",
};
let recoveryBuildCalls = 0;
let recoveryDeliverCalls = 0;
const recoveryDb = {
  async query(sql: string) {
    if (/SELECT q\.\*,t\.id AS token_id/u.test(sql)) return { rows: [recoveryRow] };
    if (/SELECT id,state,push_log_id,snapshot,send_deadline/u.test(sql)) return { rows: [{
      id: "occurrence_recovery",
      state: "claimed",
      push_log_id: null,
      snapshot: persistedSnapshot,
      send_deadline: new Date(Date.parse(canonicalWindow.startAt) + 10 * 60_000).toISOString(),
    }] };
    if (/UPDATE mobile_qimen_installations SET next_due_at/u.test(sql)) return { rowCount: 1, rows: [] };
    throw new Error(`unexpected recovery SQL: ${sql}`);
  },
};
assert.deepEqual(
  await scheduler.processClaim(recoveryDb, recoveryClaim, canonicalAt, {
    signal: new AbortController().signal,
    async buildCanonicalOccurrence() {
      recoveryBuildCalls += 1;
      throw new Error("recovery must not rebuild a persisted immutable occurrence");
    },
    async deliver(_db: unknown, notice: Record<string, any>) {
      recoveryDeliverCalls += 1;
      assert.equal(notice.qimenOccurrenceId, "occurrence_recovery");
      assert.equal(notice.sourceFacts.snapshotDigest, persistedSnapshot.snapshotDigest);
      return { status: "pending" };
    },
  }),
  { reserved: 1, skipped: 0, reason: null },
);
assert.equal(recoveryBuildCalls, 0, "crash recovery reuses the original createdAt and digest without calling the engine");
assert.equal(recoveryDeliverCalls, 1, "the recovered occurrence is reserved exactly once");

const abortController = new AbortController();
const abortReason = new Error("bounded scheduler abort");
const boundedClaims = Array.from({ length: 500 }, (_, index) => ({
  user_id: `acct_${index}`, installation_id: `installation_${index}`, lease_token: `lease_${index}`,
}));
let claimedLimit = 0;
let abortBuildCalls = 0;
let releasedClaims = 0;
let releaseQueries = 0;
const abortDb = {
  async query(sql: string, params: unknown[] = []) {
    if (/mobile_qimen_producer_state/u.test(sql)) return { rows: [{
      producer_enabled: true,
      source_digest: "987997fa7ee6cbd148c337272975ac14c3b7e720f392d7671f93549b9315a460",
      backend_commit: "d".repeat(40),
    }] };
    if (/claim_mobile_qimen_installations/u.test(sql)) {
      claimedLimit = Number(params[1]);
      return { rows: boundedClaims };
    }
    if (/SELECT q\.\*,t\.id AS token_id/u.test(sql)) return { rows: [{
      ...recoveryRow,
      user_id: params[0], installation_id: params[1], lease_token: params[2],
    }] };
    if (/SELECT id,state,push_log_id,snapshot,send_deadline/u.test(sql)) return { rows: [] };
    if (/SET lease_token=NULL,lease_expires_at=NULL/u.test(sql)) {
      assert.ok(Array.isArray(params[0]), "lease cleanup must use bounded UUID arrays instead of one SQL round-trip per claim");
      releaseQueries += 1;
      releasedClaims += params[0].length;
      return { rowCount: params[0].length, rows: [] };
    }
    throw new Error(`unexpected abort SQL: ${sql}`);
  },
};
await assert.rejects(
  scheduler.runScheduler(abortDb, abortController.signal, canonicalAt, {
    runtimeProducerEnabled: true,
    backendCommit: "d".repeat(40),
    batchLimit: 10_000,
    workerCount: 1,
    async buildCanonicalOccurrence(_row: unknown, _at: unknown, options: { signal: AbortSignal }) {
      abortBuildCalls += 1;
      assert.equal(options.signal, abortController.signal, "the scheduler abort signal reaches the engine builder");
      abortController.abort(abortReason);
      throw abortReason;
    },
  }),
  abortReason,
);
assert.equal(claimedLimit, 500, "one in-memory chunk is bounded to 500 claims within the 50-second lease");
assert.equal(abortBuildCalls, 1, "aborting stops the scheduler from starting another claim");
assert.equal(releasedClaims, 500, "abort cleanup releases every claimed lease, including work not started");
assert.equal(releaseQueries, 5, "a 500-claim cleanup uses five bounded 100-row updates");

let cleanupAttempts = 0;
await assert.rejects(
  scheduler.releaseClaims({
    async query() {
      cleanupAttempts += 1;
      if (cleanupAttempts === 2) throw new Error("one cleanup failed");
      return { rowCount: 1, rows: [] };
    },
  }, boundedClaims.slice(0, 250), canonicalAt),
  /one cleanup failed/u,
);
assert.equal(cleanupAttempts, 3, "one cleanup chunk failure never strands later cleanup chunks");

assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: row.user_id, kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
    {
      privacy_preview: false, account_active: false, account_tier: "premium",
      account_sub_expires_at: "2027-08-21T00:00:00.000Z", account_trial_ends_at: null,
      now_at: canonicalAt, qimen_enabled: true, qimen_expires_at: canonicalWindow.endAt,
      qimen_timezone: "Asia/Bangkok", qimen_quiet_start: 22, qimen_quiet_end: 7,
    },
    0,
  ),
  { allow: false, terminal: true, reason: "policy_account_inactive" },
);
assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: "", kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
    {
      privacy_preview: false, account_active: true, account_tier: "premium",
      account_sub_expires_at: "2026-08-20T00:00:00.000Z", account_trial_ends_at: null,
      now_at: canonicalAt, qimen_enabled: true, qimen_expires_at: canonicalWindow.endAt,
      qimen_timezone: "Asia/Bangkok", qimen_quiet_start: 22, qimen_quiet_end: 7,
    },
    0,
  ),
  { allow: false, terminal: true, reason: "qimen_not_entitled" },
  "Qimen entitlement identity is rechecked before provider delivery",
);

console.log("qimen dedicated scheduler policy tests passed");
