import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PRODUCT_PAGE_ENTITLEMENTS } from "../src/lib/product-page-entitlements.ts";

const require = createRequire(import.meta.url);
const qimen = require("../src/lib/qimen-notification-advisory.cjs");

const accessAt = "2026-08-19T01:05:00.000Z";
const freeUser = { id: "acct-free", tier: "free", sub_expires_at: null, trial_ends_at: "2026-08-18T00:00:00.000Z" };

assert.deepEqual(qimen.QIMEN_PLAN_CAPS, Object.fromEntries(
  Object.entries(PRODUCT_PAGE_ENTITLEMENTS).map(([plan, caps]) => [plan, {
    timeWindowDays: caps.qimen.time_window_days,
    hoursPerDay: caps.qimen.hours_per_day,
  }]),
), "notification eligibility must mirror the product Qimen contract exactly");

assert.deepEqual(qimen.qimenNotificationEntitlement(freeUser, {
  date: "2026-08-19", time: "08:05", timezone: "Asia/Bangkok", instant: accessAt,
}), { allow: true, plan: "free", reason: null });
assert.equal(qimen.qimenNotificationEntitlement({}, {
  date: "2026-08-19", time: "08:05", timezone: "Asia/Bangkok", instant: accessAt,
}).reason, "qimen_not_entitled");
assert.equal(qimen.qimenNotificationEntitlement(freeUser, {
  date: "2026-08-19", time: "10:00", timezone: "Asia/Bangkok", instant: accessAt,
}).reason, "qimen_hour_locked");
assert.equal(qimen.qimenNotificationEntitlement({ ...freeUser, trial_ends_at: "2026-08-20T00:00:00.000Z" }, {
  date: "2026-08-19", time: "10:00", timezone: "Asia/Bangkok", instant: accessAt,
}).allow, true);
assert.equal(qimen.qimenNotificationEntitlement({
  ...freeUser, tier: "premium", sub_expires_at: "2026-10-01T00:00:00.000Z",
}, {
  date: "2026-08-20", time: "00:00", timezone: "Asia/Bangkok", instant: accessAt,
}).allow, true);
assert.equal(qimen.qimenNotificationEntitlement({
  ...freeUser, tier: "premium", sub_expires_at: "2026-08-18T00:00:00.000Z",
}, {
  date: "2026-08-20", time: "00:00", timezone: "Asia/Bangkok", instant: accessAt,
}).reason, "qimen_time_window_locked");

console.log("QIMEN_NOTIFICATION_ENTITLEMENT_OK");
