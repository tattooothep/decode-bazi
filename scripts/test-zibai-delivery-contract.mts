import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import push from "../src/lib/push-send.cjs";
import delivery from "../src/lib/mobile-notification-delivery.cjs";
import { buildZibaiSnapshot, solarDayWindow } from "../src/lib/zibai-science.ts";
import scheduler from "./mobile-zibai-push-cron.cjs";

const data = { v: 1, kind: "zibai", event: "zibai_shichen", accountId: "a", url: "/zibai" };
const fcm = push.prepareMessage({ category: "zibai", title: "t", body: "b", data }, "fcm");
const expo = push.prepareMessage({ category: "zibai", title: "t", body: "b", data }, "expo");
assert.equal(fcm.data.categoryId, "hourkey_zibai");
assert.equal(expo.categoryId, "hourkey_zibai");
assert.deepEqual(JSON.parse(fcm.data.body), expo.data);

const daily = push.prepareMessage({ category: "zibai", title: "t", body: "b", data: { ...data, event: "zibai_daily" } }, "expo");
assert.equal("categoryId" in daily, false);
assert.equal(fcm.android.ttl, "300s", "FCM Zi Bai queue lifetime is bounded to five minutes");
assert.equal(expo.ttl, 300, "Expo Zi Bai queue lifetime is bounded to five minutes");
assert.equal(daily.ttl, 300, "daily Zi Bai uses the same bounded provider queue lifetime");

const accountId = "00000000-0000-4000-8000-000000000001";
const notificationId = "00000000-0000-4000-8000-000000000002";
const occurrenceId = "00000000-0000-4000-8000-000000000003";
const at = new Date("2026-08-16T03:00:00.000Z");
const exactSnapshot = buildZibaiSnapshot(at, 100.5018);
const row = {
  user_id: accountId, installation_id: "00000000-0000-4000-8000-000000000004",
  token_id: "00000000-0000-4000-8000-000000000005", device_push_token: "fcm-fixture",
  device_token_type: "fcm", expo_push_token: "ExponentPushToken[zibaiparityfixture]",
  platform: "android", token_locale: "th", privacy_preview: true, zibai_payload_schema: 1,
  calculation_version: "zibai-zaoming-true-solar-v2",
  zibai_calculation_version: "zibai-zaoming-true-solar-v2",
};
const window = solarDayWindow(at, 100.5018);
const exactDailySnapshot = {
  ...exactSnapshot, shichenKey: null, startAt: window.start.toISOString(), endAt: window.end.toISOString(),
  shichenPalaces: null,
  focus: exactSnapshot.focus.map((item) => ({
    star: item.star, dayDirection: item.dayDirection, dayRelation: item.dayRelation,
    shichenDirection: null, shichenRelation: null, overlaps: false,
  })),
};
for (const schema of [1, 2] as const) {
  for (const [event, sourceSnapshot] of [["zibai_shichen", exactSnapshot], ["zibai_daily", exactDailySnapshot]] as const) {
    const schemaRow = { ...row, zibai_payload_schema: schema };
    const notice = scheduler.buildZibaiNotice(schemaRow, event, sourceSnapshot, occurrenceId);
    const exactData = { ...notice.messages[0].data, notificationId };
    const fcmExact = push.prepareMessage({ ...notice.messages[0], transactional: false, data: exactData }, "fcm");
    const expoExact = push.prepareMessage({ ...notice.messages[0], transactional: false, data: exactData }, "expo");
    const fcmPayload = JSON.parse(fcmExact.data.body);
    assert.deepEqual(fcmPayload, expoExact.data, `${event} schema ${schema} FCM and Expo exact data must remain identical`);
    assert.deepEqual(fcmPayload, exactData,
      `${event} schema ${schema} provider sanitization must preserve the exact strict Zi Bai contract`);
    if (schema === 1) {
      assert.equal(Object.hasOwn(fcmPayload, "snapshotSchema"), false);
      assert.equal(Object.hasOwn(fcmPayload, "shichenKey"), true, `${event} v1 retains shichenKey even when null`);
      assert.equal(Object.hasOwn(fcmPayload, "shichenPalaces"), true, `${event} v1 retains shichenPalaces even when null`);
    } else {
      assert.equal(fcmPayload.snapshotSchema, 2);
      assert.equal(Object.hasOwn(fcmPayload, "shichenKey"), false, `${event} v2 never merges legacy fields`);
      assert.equal(event === "zibai_daily" ? fcmPayload.shichen === null : fcmPayload.shichen.key === exactSnapshot.shichen.meta.key, true);
    }
  }
}

const deliverySource = readFileSync("src/lib/mobile-notification-delivery.cjs", "utf8");
const retryWorkerSource = readFileSync("scripts/mobile-push-retry-worker.cjs", "utf8");
assert.match(deliverySource, /providerMessage:\s*started\.provider_message/u,
  "retry sends each schema attempt's immutable reserved provider message");
assert.doesNotMatch(retryWorkerSource, /mobile-zibai-push-cron|buildZibaiNotice|buildZibaiV2Facts/u,
  "retry worker cannot recompute either v1 or v2 from the scheduler");

const capFixtureNow = new Date("2026-08-16T12:00:00.000Z");
const policyCalculationVersion = "zibai-zaoming-true-solar-v3";
const internalBoundaryPayloads = [
  {
    event: "zibai_daily", snapshotSchema: 2, calculationVersion: policyCalculationVersion,
    month: { endAt: "2026-08-23T02:18:49.000Z" }, day: { endAt: "2026-08-23T15:30:00.000Z" }, shichen: null,
  },
  {
    event: "zibai_shichen", snapshotSchema: 2, calculationVersion: policyCalculationVersion,
    month: { endAt: "2026-08-23T02:18:49.000Z" }, day: { endAt: "2026-08-23T15:30:00.000Z" },
    shichen: { endAt: "2026-08-23T03:30:00.000Z" },
  },
  {
    event: "zibai_shichen", snapshotSchema: 2, calculationVersion: policyCalculationVersion,
    month: { endAt: "2026-08-24T02:18:49.000Z" }, day: { endAt: "2026-08-23T02:18:00.000Z" },
    shichen: { endAt: "2026-08-23T03:30:00.000Z" },
  },
] as const;
const legacyV3BoundaryPayload = {
  event: "zibai_shichen", calculationVersion: policyCalculationVersion,
  endAt: "2026-08-23T03:30:00.000Z",
} as const;
const legacyV3BoundaryFacts = {
  calculationVersion: policyCalculationVersion, occurrenceType: "shichen",
  apparentSolarDate: "2026-08-23", shichen: "si",
  monthEndAt: "2026-08-23T02:18:49.000Z", dayEndAt: "2026-08-23T15:30:00.000Z",
  shichenEndAt: "2026-08-23T03:30:00.000Z",
} as const;
const legacyV3DailyBoundaryPayload = {
  event: "zibai_daily", calculationVersion: policyCalculationVersion,
  endAt: "2026-08-23T15:30:00.000Z",
} as const;
const legacyV3DailyBoundaryFacts = {
  calculationVersion: policyCalculationVersion, occurrenceType: "daily",
  apparentSolarDate: "2026-08-23", shichen: null,
  monthEndAt: "2026-08-23T02:18:49.000Z", dayEndAt: "2026-08-23T15:30:00.000Z",
  shichenEndAt: null,
} as const;
assert.equal(delivery.zibaiOccurrenceEndAt(internalBoundaryPayloads[0]), "2026-08-23T02:18:49.000Z",
  "daily queue validity ends at the earlier month/Jie boundary, not only at day end");
assert.equal(delivery.zibaiOccurrenceEndAt(internalBoundaryPayloads[1]), "2026-08-23T02:18:49.000Z",
  "shichen queue validity ends at the earliest month/day/shichen boundary");
assert.equal(delivery.zibaiOccurrenceEndAt(internalBoundaryPayloads[2]), "2026-08-23T02:18:00.000Z",
  "an internal apparent-solar day boundary also expires a shichen payload");
assert.equal(delivery.zibaiOccurrenceEndAt({
  event: "zibai_daily", snapshotSchema: 2, calculationVersion: policyCalculationVersion,
  month: {}, day: { endAt: "2026-08-23T15:30:00.000Z" },
}), null, "three-layer provider validity fails closed when a required layer end is absent");
assert.equal(delivery.zibaiOccurrenceEndAt(legacyV3BoundaryPayload, legacyV3BoundaryFacts),
  "2026-08-23T02:18:49.000Z",
  "a V3 legacy envelope is bounded by its immutable month/day/shichen source facts, not only legacy endAt");
assert.equal(delivery.zibaiOccurrenceEndAt(legacyV3DailyBoundaryPayload, legacyV3DailyBoundaryFacts),
  "2026-08-23T02:18:49.000Z",
  "a V3 legacy daily envelope is bounded by the earlier immutable Jie boundary");
assert.equal(delivery.zibaiOccurrenceEndAt(
  { ...legacyV3BoundaryPayload, calculationVersion: "zibai-zaoming-true-solar-v2" },
  { ...legacyV3BoundaryFacts, calculationVersion: "zibai-zaoming-true-solar-v2" },
), "2026-08-23T02:18:49.000Z",
"a newly produced V2 legacy envelope also uses its available immutable layer bounds at Jie");
assert.equal(delivery.zibaiOccurrenceEndAt(
  { ...legacyV3BoundaryPayload, calculationVersion: "zibai-zaoming-true-solar-v2" },
  { calculationVersion: "zibai-zaoming-true-solar-v2", occurrenceType: "shichen" },
), "2026-08-23T03:30:00.000Z",
"a historical V2 envelope created before layer attestation retains its bounded legacy expiry during rollout");
assert.equal(delivery.zibaiOccurrenceEndAt(legacyV3BoundaryPayload, {
  ...legacyV3BoundaryFacts, monthEndAt: undefined,
}), null, "a V3 legacy envelope fails closed without every immutable layer end");
const legacyBoundaryNow = new Date("2026-08-23T02:17:00.000Z");
assert.deepEqual(delivery.currentPolicyDecision(
  { kind: "zibai", payload: legacyV3BoundaryPayload, source_facts: legacyV3BoundaryFacts,
    zibai_token_calculation_version: policyCalculationVersion, transactional: false, privacy_safe: true,
    created_at: legacyBoundaryNow.toISOString() },
  { privacy_preview: false, zibai_enabled: true, zibai_timezone: "UTC", zibai_quiet_start: 22, zibai_quiet_end: 7,
    zibai_calculation_version: policyCalculationVersion,
    zibai_expires_at: delivery.zibaiOccurrenceEndAt(legacyV3BoundaryPayload, legacyV3BoundaryFacts), now_at: legacyBoundaryNow },
  0,
), { allow: false, terminal: true, reason: "policy_expired_occurrence" },
"a V3 legacy envelope cannot enter the provider queue across an internal month boundary");
for (const payload of internalBoundaryPayloads) {
  const boundaryNow = new Date("2026-08-23T02:17:00.000Z");
  assert.deepEqual(delivery.currentPolicyDecision(
    { kind: "zibai", payload, source_facts: { calculationVersion: policyCalculationVersion },
      zibai_token_calculation_version: policyCalculationVersion, transactional: false, privacy_safe: true,
      created_at: boundaryNow.toISOString() },
    { privacy_preview: false, zibai_enabled: true, zibai_timezone: "UTC", zibai_quiet_start: 22, zibai_quiet_end: 7,
      zibai_calculation_version: policyCalculationVersion, zibai_expires_at: delivery.zibaiOccurrenceEndAt(payload), now_at: boundaryNow },
    0,
  ), { allow: false, terminal: true, reason: "policy_expired_occurrence" },
  `${payload.event} is rejected when any visible layer expires inside the provider safety window`);
}
assert.deepEqual(delivery.currentPolicyDecision(
  { kind: "zibai", payload: { calculationVersion: policyCalculationVersion }, source_facts: { calculationVersion: policyCalculationVersion },
    zibai_token_calculation_version: policyCalculationVersion, transactional: false, privacy_safe: true, created_at: capFixtureNow.toISOString() },
  { privacy_preview: false, zibai_enabled: true, zibai_timezone: "UTC", zibai_quiet_start: 22, zibai_quiet_end: 7,
    zibai_calculation_version: policyCalculationVersion,
    zibai_expires_at: new Date(capFixtureNow.valueOf() + 10 * 60_000).toISOString(), now_at: capFixtureNow },
  999,
), { allow: true }, "Zi Bai uses its installation occurrence cap, not the generic account cap");
for (const event of ["zibai_daily", "zibai_shichen"] as const) {
  const now = new Date("2026-08-16T12:00:00.000Z");
  const row = { kind: "zibai", payload: { event, calculationVersion: policyCalculationVersion },
    source_facts: { calculationVersion: policyCalculationVersion }, zibai_token_calculation_version: policyCalculationVersion,
    transactional: false, privacy_safe: true, created_at: now.toISOString() };
  const context = { privacy_preview: false, zibai_enabled: true, zibai_timezone: "UTC", zibai_quiet_start: 22, zibai_quiet_end: 7,
    zibai_calculation_version: policyCalculationVersion, now_at: now };
  assert.deepEqual(delivery.currentPolicyDecision(row,
    { ...context, zibai_expires_at: new Date(now.valueOf() + 361_000).toISOString() }, 0), { allow: true },
  `${event} may enter the provider queue only with TTL plus acceptance headroom remaining`);
  assert.deepEqual(delivery.currentPolicyDecision(row,
    { ...context, zibai_expires_at: new Date(now.valueOf() + 360_000).toISOString() }, 0),
  { allow: false, terminal: true, reason: "policy_expired_occurrence" },
  `${event} is rejected when the immutable occurrence cannot contain provider TTL plus acceptance headroom`);
  for (const missingExpiry of [undefined, null, ""]) {
    assert.deepEqual(delivery.currentPolicyDecision(row, { ...context, zibai_expires_at: missingExpiry }, 0),
      { allow: false, terminal: true, reason: "policy_missing_occurrence_expiry" },
    `${event} fails closed without its immutable occurrence end`);
  }
}
assert.equal(delivery.currentPolicyDecision(
  { kind: "zibai", payload: { calculationVersion: policyCalculationVersion }, source_facts: { calculationVersion: policyCalculationVersion },
    zibai_token_calculation_version: policyCalculationVersion, transactional: false, privacy_safe: true, created_at: new Date().toISOString() },
  { privacy_preview: false, zibai_enabled: false, zibai_calculation_version: policyCalculationVersion, now_at: new Date() },
  0,
).reason, "policy_consent_revoked");
const quietContext = {
  privacy_preview: false, zibai_enabled: true, zibai_expires_at: "2026-08-17T01:00:00.000Z",
  zibai_calculation_version: policyCalculationVersion,
  now_at: new Date("2026-08-16T23:30:00.000Z"), zibai_timezone: "UTC", zibai_quiet_start: 22, zibai_quiet_end: 7,
};
assert.deepEqual(delivery.currentPolicyDecision(
  { kind: "zibai", payload: { event: "zibai_shichen", calculationVersion: policyCalculationVersion },
    source_facts: { calculationVersion: policyCalculationVersion }, zibai_token_calculation_version: policyCalculationVersion,
    transactional: false, privacy_safe: true, created_at: new Date().toISOString() },
  quietContext,
  0,
), { allow: false, terminal: true, reason: "policy_quiet_hours" }, "a queued shichen crossing into quiet hours is discarded, never replayed");
assert.deepEqual(delivery.currentPolicyDecision(
  { kind: "zibai", payload: { event: "zibai_daily", calculationVersion: policyCalculationVersion },
    source_facts: { calculationVersion: policyCalculationVersion }, zibai_token_calculation_version: policyCalculationVersion,
    transactional: false, privacy_safe: true, created_at: new Date().toISOString() },
  { ...quietContext, zibai_expires_at: "2026-08-17T01:00:00.000Z" },
  0,
), { allow: false, terminal: false, reason: "policy_quiet_hours" }, "a queued daily summary waits through quiet hours");
assert.deepEqual(delivery.currentPolicyDecision(
  { kind: "zibai", payload: { event: "zibai_daily", calculationVersion: policyCalculationVersion },
    source_facts: { calculationVersion: policyCalculationVersion }, zibai_token_calculation_version: policyCalculationVersion,
    transactional: false, privacy_safe: true, created_at: new Date().toISOString() },
  { ...quietContext, now_at: new Date("2026-08-17T01:00:00.000Z"), zibai_expires_at: "2026-08-17T01:00:00.000Z" },
  0,
), { allow: false, terminal: true, reason: "policy_expired_occurrence" }, "a delayed daily chart expires at its immutable solar-day end and cannot replay later");
assert.equal(delivery.currentPolicyDecision(
  { kind: "zibai", payload: { event: "zibai_daily", calculationVersion: policyCalculationVersion },
    source_facts: { calculationVersion: policyCalculationVersion }, zibai_token_calculation_version: "zibai-zaoming-true-solar-v2",
    transactional: false, privacy_safe: true, created_at: new Date().toISOString() },
  quietContext,
  0,
).reason, "policy_calculation_version_changed", "a V2-only client cannot cross the final V3 provider boundary");

await assert.rejects(
  () => delivery.reserve({ query: async () => ({ rows: [] }) }, { userId: "a", key: "k", kind: "zibai", messages: [] }),
  /zibai occurrence reservation required/u,
);

console.log("ZIBAI_DELIVERY_CONTRACT_OK");
