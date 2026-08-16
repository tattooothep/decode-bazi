import assert from "node:assert/strict";
import push from "../src/lib/push-send.cjs";
import delivery from "../src/lib/mobile-notification-delivery.cjs";

const data = { v: 1, kind: "zibai", event: "zibai_shichen", accountId: "a", url: "/zibai" };
const fcm = push.prepareMessage({ category: "zibai", title: "t", body: "b", data }, "fcm");
const expo = push.prepareMessage({ category: "zibai", title: "t", body: "b", data }, "expo");
assert.equal(fcm.data.categoryId, "hourkey_zibai");
assert.equal(expo.categoryId, "hourkey_zibai");
assert.deepEqual(JSON.parse(fcm.data.body), expo.data);

const daily = push.prepareMessage({ category: "zibai", title: "t", body: "b", data: { ...data, event: "zibai_daily" } }, "expo");
assert.equal("categoryId" in daily, false);

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
  { ...quietContext, zibai_expires_at: null },
  0,
), { allow: false, terminal: false, reason: "policy_quiet_hours" }, "a queued daily summary waits through quiet hours");

await assert.rejects(
  () => delivery.reserve({ query: async () => ({ rows: [] }) }, { userId: "a", key: "k", kind: "zibai", messages: [] }),
  /zibai occurrence reservation required/u,
);

console.log("ZIBAI_DELIVERY_CONTRACT_OK");
