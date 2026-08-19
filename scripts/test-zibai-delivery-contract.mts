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

assert.deepEqual(delivery.currentPolicyDecision(
  { kind: "zibai", transactional: false, privacy_safe: true, created_at: new Date().toISOString() },
  { privacy_preview: false, zibai_enabled: true, zibai_expires_at: new Date(Date.now() + 60_000).toISOString(), now_at: new Date() },
  999,
), { allow: true }, "Zi Bai uses its installation occurrence cap, not the generic account cap");
assert.equal(delivery.currentPolicyDecision(
  { kind: "zibai", transactional: false, privacy_safe: true, created_at: new Date().toISOString() },
  { privacy_preview: false, zibai_enabled: false, now_at: new Date() },
  0,
).reason, "policy_consent_revoked");
const quietContext = {
  privacy_preview: false, zibai_enabled: true, zibai_expires_at: "2026-08-17T01:00:00.000Z",
  now_at: new Date("2026-08-16T23:30:00.000Z"), zibai_timezone: "UTC", zibai_quiet_start: 22, zibai_quiet_end: 7,
};
assert.deepEqual(delivery.currentPolicyDecision(
  { kind: "zibai", payload: { event: "zibai_shichen" }, transactional: false, privacy_safe: true, created_at: new Date().toISOString() },
  quietContext,
  0,
), { allow: false, terminal: true, reason: "policy_quiet_hours" }, "a queued shichen crossing into quiet hours is discarded, never replayed");
assert.deepEqual(delivery.currentPolicyDecision(
  { kind: "zibai", payload: { event: "zibai_daily" }, transactional: false, privacy_safe: true, created_at: new Date().toISOString() },
  { ...quietContext, zibai_expires_at: "2026-08-17T01:00:00.000Z" },
  0,
), { allow: false, terminal: false, reason: "policy_quiet_hours" }, "a queued daily summary waits through quiet hours");
assert.deepEqual(delivery.currentPolicyDecision(
  { kind: "zibai", payload: { event: "zibai_daily" }, transactional: false, privacy_safe: true, created_at: new Date().toISOString() },
  { ...quietContext, now_at: new Date("2026-08-17T01:00:00.000Z"), zibai_expires_at: "2026-08-17T01:00:00.000Z" },
  0,
), { allow: false, terminal: true, reason: "policy_expired_occurrence" }, "a delayed daily chart expires at its immutable solar-day end and cannot replay later");

await assert.rejects(
  () => delivery.reserve({ query: async () => ({ rows: [] }) }, { userId: "a", key: "k", kind: "zibai", messages: [] }),
  /zibai occurrence reservation required/u,
);

console.log("ZIBAI_DELIVERY_CONTRACT_OK");
