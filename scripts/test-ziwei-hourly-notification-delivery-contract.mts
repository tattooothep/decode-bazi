import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import delivery from "../src/lib/mobile-notification-delivery.cjs";
import push from "../src/lib/push-send.cjs";

const source = readFileSync(new URL("../src/lib/mobile-notification-delivery.cjs", import.meta.url), "utf8");

assert.match(source, /require\("\.\/ziwei-hourly-notification\.cjs"\)/u,
  "delivery must verify Ziwei payloads with the locked notification runtime");
assert.match(source, /ziweiOccurrenceId/u,
  "Ziwei delivery must require an immutable occurrence id");
assert.match(source, /JOIN mobile_ziwei_hourly_occurrences/u,
  "token and Ziwei occurrence must be bound in one database read");
assert.match(source, /FOR UPDATE OF t,o/u,
  "token and immutable occurrence must be locked together");
assert.match(source, /o\.snapshot->'facts'->'reference'->>'windowKey' AS window_key/u,
  "retry policy must read the window key from the persisted snapshot facts path");
assert.doesNotMatch(source, /o\.snapshot->'preview'->'reference'->>'windowKey' AS window_key/u,
  "retry policy must not read a nonexistent preview wrapper");
assert.match(source, /ziwei_payload_schema/u,
  "delivery must re-check the current token capability");
assert.match(source, /verifyZiweiHourlyNotificationSnapshot/u,
  "delivery must verify the persisted full snapshot");
assert.match(source, /buildZiweiHourlyProviderData/u,
  "delivery must reproduce and compare the compact provider envelope");
assert.match(source, /mobile_ziwei_hourly_occurrences SET state='reserved'/u,
  "a successful attempt reservation must link the immutable occurrence");
assert.match(source, /attemptIds\.length > 0/u,
  "an occurrence cannot become reserved without a deliverable attempt");
assert.match(source, /i\.owner_generation AS current_owner_generation/u);
assert.match(source, /o\.owner_generation AS occurrence_owner_generation/u);
assert.match(source, /context\.locale/u,
  "provider-visible Ziwei copy must use the locked current account locale, never stale token locale");
assert.equal(push.providerTtlSeconds("ziwei"), 300);
assert.equal(push.providerQueueSafetySeconds("ziwei"), 360,
  "Ziwei retries keep acceptance headroom before the immutable shichen expires");

const now = new Date("2026-08-26T12:01:00.000Z");
const row = {
  user_id: "00000000-0000-4000-8000-000000000001",
  kind: "ziwei",
  payload: { ziweiHourlyV2: "immutable-envelope" },
  source_facts: {
    accountId: "00000000-0000-4000-8000-000000000001",
    profileId: "00000000-0000-4000-8000-000000000002",
    lineage: "iztro_2_5_8_normal_forward_zi_v1",
    calculationVersion: "ziwei-hourly-notification-v1",
    windowKey: "fixture-window",
    eventEndAt: "2026-08-26T14:00:00.000Z",
    sendDeadline: "2026-08-26T12:10:00.000Z",
    ownerGeneration: 7,
  },
  ziwei_token_payload_schema: 2,
  transactional: false,
  privacy_safe: true,
  created_at: now.toISOString(),
};
const context = {
  privacy_preview: false,
  account_active: true,
  now_at: now,
  ziwei_hourly_enabled: true,
  ziwei_hourly_profile_id: row.source_facts.profileId,
  ziwei_hourly_timezone: "Asia/Bangkok",
  ziwei_hourly_quiet_start: 22,
  ziwei_hourly_quiet_end: 7,
  ziwei_hourly_lineage: row.source_facts.lineage,
  ziwei_hourly_calculation_version: row.source_facts.calculationVersion,
  ziwei_hourly_window_key: row.source_facts.windowKey,
  ziwei_hourly_expires_at: row.source_facts.eventEndAt,
  ziwei_hourly_send_deadline: row.source_facts.sendDeadline,
  ziwei_hourly_current_owner_generation: 7,
  ziwei_hourly_occurrence_owner_generation: 7,
};

assert.deepEqual(delivery.currentPolicyDecision(row, context, 999), { allow: true },
  "every-shichen Ziwei ignores the unrelated generic daily cap");
assert.deepEqual(delivery.currentPolicyDecision(row, {
  ...context, ziwei_hourly_current_owner_generation: 8,
}, 0), { allow: false, terminal: true, reason: "policy_profile_changed" },
"a queued snapshot cannot send after the bound profile generation changes");
assert.deepEqual(delivery.currentPolicyDecision(row, { ...context, ziwei_hourly_enabled: false }, 0),
  { allow: false, terminal: true, reason: "policy_consent_revoked" });
assert.deepEqual(delivery.currentPolicyDecision(row, {
  ...context, ziwei_hourly_profile_id: "00000000-0000-4000-8000-000000000003",
}, 0), { allow: false, terminal: true, reason: "policy_profile_changed" });
assert.deepEqual(delivery.currentPolicyDecision(row, {
  ...context, ziwei_hourly_send_deadline: "2026-08-26T12:00:00.000Z",
}, 0), { allow: false, terminal: true, reason: "policy_late_occurrence" });
assert.deepEqual(delivery.currentPolicyDecision(row, {
  ...context, ziwei_hourly_expires_at: "2026-08-26T12:06:00.000Z",
}, 0), { allow: false, terminal: true, reason: "policy_expired_occurrence" },
"a retry cannot enter a provider queue that could outlive the current shichen");
assert.deepEqual(delivery.currentPolicyDecision(row, {
  ...context, now_at: new Date("2026-08-26T16:01:00.000Z"),
  ziwei_hourly_expires_at: "2026-08-26T18:00:00.000Z",
  ziwei_hourly_send_deadline: "2026-08-26T16:10:00.000Z",
}, 0), { allow: false, terminal: true, reason: "policy_quiet_hours" },
"quiet hours terminally skip this immutable shichen instead of replaying it later");
assert.deepEqual(delivery.currentPolicyDecision({ ...row, ziwei_token_payload_schema: 0 }, context, 0),
  { allow: false, terminal: true, reason: "policy_payload_schema_changed" });

console.log("PASS Ziwei hourly delivery contract — immutable binding, consent, expiry, privacy, no generic cap");
