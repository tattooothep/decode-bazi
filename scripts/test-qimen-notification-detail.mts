import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const detail = require("../src/lib/mobile-qimen-notification-detail.cjs");
const snapshotRuntime = require("../src/lib/qimen-three-layer-notification.cjs");

const notificationId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const fixture = require("./fixtures/qimen-three-layer-valid-snapshot.cjs").build(accountId);
assert.equal(snapshotRuntime.verifyQimenThreeLayerSnapshot(fixture), true);

const queries: Array<{ sql: string; params: unknown[] }> = [];
const db = { async query(sql: string, params: unknown[]) {
  queries.push({ sql, params });
  return { rows: [{ notification_id: notificationId, snapshot: fixture, snapshot_digest: fixture.snapshotDigest }] };
} };
const result = await detail.readQimenNotificationDetail(db, accountId, notificationId);
assert.deepEqual(result, { notificationId, snapshot: fixture });
assert.deepEqual(queries[0].params, [notificationId, accountId]);
assert.match(queries[0].sql, /mobile_qimen_occurrences/u);
assert.match(queries[0].sql, /mobile_push_log/u);
assert.match(queries[0].sql, /l\.user_id=\$2/u);
assert.match(queries[0].sql, /o\.user_id=\$2/u);
assert.match(queries[0].sql, /l\.kind='qimen'/u);
assert.doesNotMatch(JSON.stringify(result), /latitude|longitude|device_push_token|expo_push_token/iu);

await assert.rejects(
  () => detail.readQimenNotificationDetail(db, accountId, "bad"),
  (error: any) => error?.code === "qimen_notification_id_invalid" && error?.status === 400,
);
await assert.rejects(
  () => detail.readQimenNotificationDetail({ query: async () => ({ rows: [] }) }, accountId, notificationId),
  (error: any) => error?.code === "qimen_notification_not_found" && error?.status === 404,
);
await assert.rejects(
  () => detail.readQimenNotificationDetail({ query: async () => ({ rows: [{ notification_id: notificationId, snapshot: fixture, snapshot_digest: "0".repeat(64) }] }) }, accountId, notificationId),
  (error: any) => error?.code === "qimen_notification_snapshot_invalid" && error?.status === 409,
);

const routeSource = require("node:fs").readFileSync("src/app/api/mobile/v1/qimen/notification-detail/route.ts", "utf8");
assert.match(routeSource, /getMobileSession/u);
assert.match(routeSource, /readQimenNotificationDetail/u);
assert.match(routeSource, /Cache-Control.*no-store/u);

console.log("QIMEN_NOTIFICATION_DETAIL_OK");
