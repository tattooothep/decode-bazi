import assert from "node:assert/strict";
import runtime from "../src/lib/notification-payload.cjs";

const dayPalaces = { N: 1, NE: 2, E: 3, SE: 4, S: 5, SW: 6, W: 7, NW: 8, C: 9 };
const hourPalaces = { N: 9, NE: 8, E: 7, SE: 6, S: 5, SW: 4, W: 3, NW: 2, C: 1 };
const focus = [1, 2, 5, 9].map((star) => ({
  star,
  dayDirection: Object.keys(dayPalaces).find((key) => dayPalaces[key as keyof typeof dayPalaces] === star),
  dayRelation: "same-element",
  shichenDirection: Object.keys(hourPalaces).find((key) => hourPalaces[key as keyof typeof hourPalaces] === star),
  shichenRelation: "generates-palace",
  overlaps: star === 5,
}));

const facts = {
  event: "zibai_shichen",
  referenceId: "zibai|2026-08-16|si|zibai-zaoming-true-solar-v2",
  calculationVersion: "zibai-zaoming-true-solar-v2",
  apparentSolarDate: "2026-08-16",
  shichenKey: "si",
  startAt: "2026-08-16T02:07:00.000Z",
  endAt: "2026-08-16T04:07:00.000Z",
  dayPalaces,
  shichenPalaces: hourPalaces,
  focus,
  url: "/zibai",
};

const payload = runtime.buildNotificationPayload("zibai", "00000000-0000-4000-8000-000000000001", facts);
assert.equal(payload.kind, "zibai");
assert.equal(payload.url, "/zibai");
assert.ok(JSON.stringify(payload).length < 4_096);

assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, { ...facts, dayPalaces: { ...dayPalaces, C: 8 } }), /invalid zibai/u);
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, { ...facts, shichenKey: "midnight" }), /invalid zibai/u);
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, { ...facts, latitude: 13.7 }), /invalid zibai/u);
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, { ...facts, url: "/luopan" }), /invalid zibai/u);
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, { ...facts, referenceId: "zibai|2026-08-15|si|zibai-zaoming-true-solar-v2" }), /invalid zibai/u,
  "the occurrence reference date must equal apparentSolarDate");

const daily = runtime.buildNotificationPayload("zibai", payload.accountId, {
  ...facts,
  event: "zibai_daily",
  referenceId: "zibai|2026-08-16|daily|zibai-zaoming-true-solar-v2",
  shichenKey: null,
  endAt: "2026-08-17T02:07:00.000Z",
  shichenPalaces: null,
  focus: focus.map((item) => ({ ...item, shichenDirection: null, shichenRelation: null, overlaps: false })),
});
assert.equal(daily.event, "zibai_daily");
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, {
  ...daily,
  endAt: "2026-08-16T04:07:00.000Z",
}), /invalid zibai/u, "daily envelopes must cover one apparent-solar day, not one shichen");
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, {
  ...facts,
  endAt: "2026-08-17T02:07:00.000Z",
}), /invalid zibai/u, "shichen envelopes cannot claim a full day");

console.log("ZIBAI_NOTIFICATION_PAYLOAD_OK");
