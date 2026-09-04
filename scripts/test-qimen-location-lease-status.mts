import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const preferences = await import("../src/lib/mobile-notification-preferences.ts");
assert.equal(
  typeof preferences.qimenLocationLeaseStatus,
  "function",
  "the notification API must expose a deterministic seven-day Qi Men location lease status",
);

const at = new Date("2026-09-04T00:00:00.000Z");
const valid = preferences.qimenLocationLeaseStatus({
  qimen_latitude: 13.7563,
  qimen_longitude: 100.5018,
  qimen_location_updated_at: "2026-09-03T00:00:00.000Z",
}, at);
assert.deepEqual(valid, {
  fresh: true,
  expiresAt: "2026-09-10T00:00:00.000Z",
});

const expired = preferences.qimenLocationLeaseStatus({
  qimen_latitude: 13.7563,
  qimen_longitude: 100.5018,
  qimen_location_updated_at: "2026-08-28T00:00:00.000Z",
}, at);
assert.deepEqual(expired, {
  fresh: false,
  expiresAt: "2026-09-04T00:00:00.000Z",
}, "the exact seven-day boundary is expired, matching the scheduler policy");

for (const incomplete of [
  { qimen_latitude: null, qimen_longitude: 100.5018, qimen_location_updated_at: "2026-09-03T00:00:00.000Z" },
  { qimen_latitude: 13.7563, qimen_longitude: null, qimen_location_updated_at: "2026-09-03T00:00:00.000Z" },
  { qimen_latitude: 13.7563, qimen_longitude: 100.5018, qimen_location_updated_at: null },
]) {
  assert.deepEqual(preferences.qimenLocationLeaseStatus(incomplete, at), {
    fresh: false,
    expiresAt: null,
  }, "incomplete location evidence must fail closed");
}

const route = readFileSync("src/app/api/mobile/v1/notifications/route.ts", "utf8");
assert.match(route, /qimenLocationFresh:\s*qimenLocation\.fresh/u);
assert.match(route, /qimenLocationExpiresAt:\s*qimenLocation\.expiresAt/u);

console.log("Qi Men location lease status tests passed");
