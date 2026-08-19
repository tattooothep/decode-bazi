import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { buildZibaiSnapshot, solarDayWindow } from "../src/lib/zibai-science.ts";
import scheduler from "./mobile-zibai-push-cron.cjs";

const require = createRequire(import.meta.url);
let projection: any = null;
try {
  projection = require("../src/lib/zibai-payload-projection.cjs");
} catch {
  // RED until the projection boundary exists.
}
assert.equal(typeof projection?.projectZibaiPayload, "function", "history projection helper must exist");
assert.equal(typeof projection?.parseRequestedZibaiSchema, "function", "history schema parser must exist");

assert.equal(projection.parseRequestedZibaiSchema(null), 1, "an absent history header means exact schema 1");
assert.equal(projection.parseRequestedZibaiSchema("1"), 1);
assert.equal(projection.parseRequestedZibaiSchema("2"), 2);
for (const invalid of ["", "0", "3", "02", " 2", "2 ", "v2"]) {
  assert.throws(() => projection.parseRequestedZibaiSchema(invalid), /zibai_history_schema_invalid/u,
    `invalid history schema header rejects: ${JSON.stringify(invalid)}`);
}

const at = new Date("2026-08-16T03:07:00.000Z");
const snapshot = buildZibaiSnapshot(at, 100.5018);
const row = {
  user_id: "00000000-0000-4000-8000-000000000001",
  installation_id: "10000000-0000-4000-8000-000000000001",
  token_id: "20000000-0000-4000-8000-000000000001",
  device_push_token: "fixture-native-token",
  device_token_type: "fcm",
  expo_push_token: "ExponentPushToken[fixture]",
  platform: "android",
  token_locale: "en",
  privacy_preview: true,
};
const occurrenceId = "30000000-0000-4000-8000-000000000001";
const v1 = scheduler.buildZibaiNotice({ ...row, zibai_payload_schema: 1 }, "zibai_shichen", snapshot, occurrenceId).payload;
const v2 = scheduler.buildZibaiNotice({ ...row, zibai_payload_schema: 2 }, "zibai_shichen", snapshot, occurrenceId).payload;
assert.strictEqual(projection.projectZibaiPayload(v2, 2), v2, "new history clients retain the exact immutable v2 object");
assert.deepEqual(projection.projectZibaiPayload(v2, 1), v1,
  "old history clients receive the exact legacy v1 projection from immutable v2 maps");
assert.strictEqual(projection.projectZibaiPayload(v1, 2), v1,
  "stored v1 history is never upconverted or recomputed for a new client");

const window = solarDayWindow(at, 100.5018);
const dailyV1Snapshot = {
  ...snapshot,
  shichenKey: null,
  startAt: window.start.toISOString(),
  endAt: window.end.toISOString(),
  shichenPalaces: null,
  focus: snapshot.focus.map((item) => ({
    star: item.star,
    dayDirection: item.dayDirection,
    dayRelation: item.dayRelation,
    shichenDirection: null,
    shichenRelation: null,
    overlaps: false,
  })),
};
const dailyV1 = scheduler.buildZibaiNotice({ ...row, zibai_payload_schema: 1 }, "zibai_daily", dailyV1Snapshot, occurrenceId).payload;
const dailyV2 = scheduler.buildZibaiNotice({ ...row, zibai_payload_schema: 2 }, "zibai_daily", snapshot, occurrenceId).payload;
assert.deepEqual(projection.projectZibaiPayload(dailyV2, 1), dailyV1,
  "daily history projection uses the immutable v2 day bounds and keeps shichen null");

const projected = projection.projectZibaiPayload(v2, 1);
assert.deepEqual(Object.keys(projected).sort(), [
  "accountId", "apparentSolarDate", "calculationVersion", "dayPalaces", "endAt", "event",
  "focus", "kind", "referenceId", "shichenKey", "shichenPalaces", "startAt", "url", "v",
].sort());
assert.equal(/latitude|longitude|source_facts|sourceFacts|month|sectors|interpretationVersion/iu.test(JSON.stringify(projected)), false,
  "v1 history projection returns no coordinates, audit facts, or v2-only fields");
assert.throws(() => projection.projectZibaiPayload(v2, 3), /zibai_history_schema_invalid/u);

const historyRoute = readFileSync("src/app/api/mobile/v1/notifications/route.ts", "utf8");
assert.match(historyRoute, /req\.headers\.get\(["']X-Hourkey-Zibai-Schema["']\)/u,
  "history GET reads the explicit Zi Bai schema header");
assert.match(historyRoute, /projectZibaiPayload/u, "history GET projects Zi Bai rows before adding the durable ID");
assert.match(historyRoute, /invalid_zibai_schema/u, "history GET rejects invalid schema headers");

console.log("ZIBAI_HISTORY_PROJECTION_OK");
