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
  { allow: true, sendDeadline: "2026-08-21T14:05:00.000Z" },
);
assert.deepEqual(
  scheduler.admissionDecision(row, occurrence, new Date("2026-08-21T14:05:00.000Z")),
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
const deliverySource = fs.readFileSync(new URL("../src/lib/mobile-notification-delivery.cjs", import.meta.url), "utf8");
assert.match(deliverySource, /qimenOccurrenceId/u);
assert.match(deliverySource, /mobile_qimen_occurrences/u);
assert.match(deliverySource, /qimen_payload_schema/u);
assert.deepEqual(
  delivery.currentPolicyDecision(
    { kind: "qimen", privacy_safe: true, transactional: false, source_facts: { eventEndAt: "2026-08-21T16:00:00.000Z" } },
    {
      privacy_preview: false,
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
assert.deepEqual(
  delivery.currentPolicyDecision(
    { kind: "qimen", privacy_safe: true, transactional: false, source_facts: { eventEndAt: "2026-08-21T16:00:00.000Z" } },
    {
      privacy_preview: false,
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
    { kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
    {
      privacy_preview: false,
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
  "a retry can never escape the five-minute occurrence admission window",
);
assert.deepEqual(
  delivery.currentPolicyDecision(
    { kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
    {
      privacy_preview: false,
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

console.log("qimen dedicated scheduler policy tests passed");
