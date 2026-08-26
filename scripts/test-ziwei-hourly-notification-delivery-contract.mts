import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import delivery from "../src/lib/mobile-notification-delivery.cjs";
import push from "../src/lib/push-send.cjs";
import sourceContract from "../src/lib/ziwei-hourly-source-contract.cjs";
import ziweiRuntime from "../src/lib/ziwei-hourly-notification.cjs";
import { buildZiweiHourlyNotificationFacts } from "../src/lib/astro/ziwei/hourly-preview";

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
const releaseCommit = "c".repeat(40);
const sourceDigest = sourceContract.SOURCE_DIGEST;
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
    sourceDigest,
    backendCommit: releaseCommit,
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
  ziwei_hourly_producer_enabled: true,
  ziwei_hourly_producer_source_digest: sourceDigest,
  ziwei_hourly_producer_backend_commit: releaseCommit,
  ziwei_hourly_runtime_enabled: true,
  ziwei_hourly_runtime_commit: releaseCommit,
  ziwei_hourly_runtime_source_digest: sourceDigest,
  ziwei_hourly_attempt_attested: true,
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

const accountId = "00000000-0000-4000-8000-000000000011";
const profileId = "00000000-0000-4000-8000-000000000012";
const pushLogId = "00000000-0000-4000-8000-000000000013";
const facts = buildZiweiHourlyNotificationFacts({
  birthInstant: new Date("1984-12-31T06:15:00.000Z"),
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "F",
  referenceInstant: new Date("2026-08-26T12:30:00.000Z"),
  referenceTimezone: "Asia/Bangkok",
});
const snapshot = ziweiRuntime.buildZiweiHourlyNotificationSnapshot({
  accountId,
  profile: { id: profileId, name: "Owner", isSelf: true },
  facts,
});
const exactPayload = ziweiRuntime.buildZiweiHourlyProviderData(snapshot);
const privateCopy = ziweiRuntime.buildZiweiHourlyPrivateCopy("th");
const providerMessage = push.prepareMessage({
  category: "ziwei",
  ...privateCopy,
  url: "/ziwei/hourly",
  transactional: false,
  data: { ...exactPayload, notificationId: pushLogId },
}, "fcm");
const exactRow = {
  push_log_id: pushLogId,
  user_id: accountId,
  yam_key: `ziwei|${"d".repeat(64)}`,
  title: "history title",
  body: "history body",
  payload: exactPayload,
  source_facts: {
    accountId,
    profileId,
    lineage: snapshot.facts.lineage,
    calculationVersion: snapshot.facts.calculationVersion,
    windowKey: snapshot.facts.reference.windowKey,
    snapshotDigest: snapshot.snapshotDigest,
    ownerGeneration: 7,
    eventEndAt: snapshot.facts.reference.validUntil,
    sendDeadline: "2026-08-26T12:40:00.000Z",
  },
  provider: "fcm",
  provider_message: providerMessage,
  message_sha256: delivery.messageSha256(providerMessage),
  privacy_safe: true,
};
const occurrence = {
  occurrence_user_id: accountId,
  occurrence_profile_id: profileId,
  occurrence_state: "reserved",
  occurrence_key: exactRow.yam_key,
  occurrence_owner_generation: 7,
  lineage: snapshot.facts.lineage,
  calculation_version: snapshot.facts.calculationVersion,
  window_key: snapshot.facts.reference.windowKey,
  window_valid_from: snapshot.facts.reference.validFrom,
  window_valid_until: snapshot.facts.reference.validUntil,
  send_deadline: exactRow.source_facts.sendDeadline,
  snapshot_digest: snapshot.snapshotDigest,
};
assert.equal(delivery.ziweiAttemptAttestationValid(exactRow, snapshot, occurrence), true,
  "retry attestation reconstructs the exact locked snapshot and provider message");
for (const [label, changed] of [
  ["occurrence state", { ...occurrence, occurrence_state: "claimed" }],
  ["occurrence key", { ...occurrence, occurrence_key: `${exactRow.yam_key}-forged` }],
  ["window start", { ...occurrence, window_valid_from: "2026-08-26T12:01:00.000Z" }],
  ["window end", { ...occurrence, window_valid_until: "2026-08-26T14:01:00.000Z" }],
  ["send deadline", { ...occurrence, send_deadline: "2026-08-26T12:41:00.000Z" }],
  ["snapshot digest", { ...occurrence, snapshot_digest: "e".repeat(64) }],
] as const) {
  assert.equal(delivery.ziweiAttemptAttestationValid(exactRow, snapshot, changed), false,
    `${label} drift is terminally fenced before provider send`);
}
assert.equal(delivery.ziweiAttemptAttestationValid({
  ...exactRow,
  provider_message: { ...providerMessage, notification: { title: "forged", body: "forged" } },
}, snapshot, occurrence), false, "provider-visible message drift is terminally fenced");

console.log("PASS Ziwei hourly delivery contract — immutable binding, consent, expiry, privacy, no generic cap");
