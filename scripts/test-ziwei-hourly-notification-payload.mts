import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildZiweiHourlyNotificationFacts, buildZiweiHourlyPreview } from "../src/lib/astro/ziwei/hourly-preview";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/ziwei-hourly-notification.cjs");

const facts = buildZiweiHourlyNotificationFacts({
  birthInstant: new Date("1984-12-31T06:15:00.000Z"),
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "M",
  referenceInstant: new Date("2026-08-26T12:30:00.000Z"),
  referenceTimezone: "Asia/Bangkok",
});
const snapshot = runtime.buildZiweiHourlyNotificationSnapshot({
  accountId: "00000000-0000-4000-8000-000000000001",
  profile: { id: "00000000-0000-4000-8000-000000000002", name: "Owner", isSelf: true },
  facts,
});
const factsWithoutCoordinates = buildZiweiHourlyNotificationFacts({
  birthInstant: new Date("1984-12-31T06:15:00.000Z"),
  birthTimezone: "Asia/Bangkok",
  birthLocation: null,
  gender: "M",
  referenceInstant: new Date("2026-08-26T12:30:00.000Z"),
  referenceTimezone: "Asia/Bangkok",
});
assert.deepEqual(factsWithoutCoordinates.layers, facts.layers,
  "locked explicit birth timezone makes coordinates non-scientific metadata for this lineage");

assert.equal(runtime.verifyZiweiHourlyNotificationSnapshot(snapshot), true);
assert.equal(snapshot.interpretation, "none_structural_chart_only");
assert.equal(snapshot.facts.capability, "notification_facts");
assert.equal(snapshot.facts.decisionSupported, false);
assert.equal(snapshot.facts.productionEligible, true);
assert.equal(snapshot.facts.calculationVersion, "ziwei-hourly-notification-v1");
assert.equal("score" in snapshot, false);
assert.equal("verdict" in snapshot, false);

const data = runtime.buildZiweiHourlyProviderData(snapshot);
const compact = runtime.parseZiweiHourlyProviderData(data);
assert.ok(compact);
assert.deepEqual(Object.keys(data), ["ziweiHourlyV2"]);
assert.equal(compact.v, 2);
assert.equal(compact.snapshotDigest, snapshot.snapshotDigest);
assert.equal(compact.month.flowStars.length, 10);
assert.equal(compact.day.flowStars.length, 10);
assert.equal(compact.hour.flowStars.length, 10);
assert.deepEqual(compact.month.siHua[0], [
  snapshot.facts.layers.liuYue.siHua[0].star,
  snapshot.facts.layers.liuYue.siHua[0].type,
  snapshot.facts.layers.liuYue.siHua[0].palaceName,
  snapshot.facts.layers.liuYue.siHua[0].branch,
]);
assert.deepEqual(compact.hour.flowStars[0], [
  snapshot.facts.layers.liuShi.hourlyStars[0].star,
  snapshot.facts.layers.liuShi.hourlyStars[0].palaceName,
  snapshot.facts.layers.liuShi.hourlyStars[0].branch,
]);
assert.deepEqual(
  [compact.month.lunarMonth, compact.month.isLeapMonth, compact.month.effectiveMonth],
  [snapshot.facts.layers.liuYue.lunarMonth, snapshot.facts.layers.liuYue.isLeapMonth, snapshot.facts.layers.liuYue.effectiveMonth],
);
assert.deepEqual([compact.day.dateISO, compact.day.lunarDay],
  [snapshot.facts.layers.liuRi.dateISO, snapshot.facts.layers.liuRi.lunarDay]);
assert.deepEqual([compact.hour.civilDateISO, compact.hour.calculationDateISO, compact.hour.timeIndex],
  [snapshot.facts.layers.liuShi.civilDateISO, snapshot.facts.layers.liuShi.calculationDateISO, snapshot.facts.layers.liuShi.timeIndex]);
assert.ok(Buffer.byteLength(JSON.stringify(data), "utf8") < 3.5 * 1_024);
assert.equal(runtime.parseZiweiHourlyProviderData({ ziweiHourlyV2: `${data.ziweiHourlyV2}x` }), null);

for (const locale of ["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]) {
  const copy = runtime.buildZiweiHourlyCopy(locale, snapshot);
  assert.ok(copy.title.length > 0 && copy.title.length <= 120);
  assert.ok(copy.body.length > 0 && copy.body.length <= 400);
  assert.doesNotMatch(`${copy.title} ${copy.body}`, /lucky|auspicious|best|มงคล|吉方|score/iu);
}
assert.match(runtime.buildZiweiHourlyCopy("vi", snapshot).body, /Tháng/u);
assert.match(runtime.buildZiweiHourlyPrivateCopy("es").body, /HourKey/u);

const tampered = JSON.parse(JSON.stringify(snapshot));
tampered.facts.layers.liuShi.ganzhi = "甲子";
assert.equal(runtime.verifyZiweiHourlyNotificationSnapshot(tampered), false);

const duplicateTransformationFacts = JSON.parse(JSON.stringify(facts));
duplicateTransformationFacts.layers.liuShi.siHua[1].type = duplicateTransformationFacts.layers.liuShi.siHua[0].type;
assert.throws(() => runtime.buildZiweiHourlyNotificationSnapshot({
  accountId: "00000000-0000-4000-8000-000000000001",
  profile: { id: "00000000-0000-4000-8000-000000000002", name: "Owner", isSelf: true },
  facts: duplicateTransformationFacts,
}), /ziwei_hourly_snapshot_invalid/u);

for (const [label, mutate] of [
  ["window calculation date", (value: any) => { value.reference.windowKey = value.reference.windowKey.replace(":2026-08-26:", ":2026-08-25:"); }],
  ["window branch", (value: any) => { value.reference.windowKey = value.reference.windowKey.replace(/:戌$/u, ":酉"); }],
  ["hour Ganzhi branch", (value: any) => { value.layers.liuShi.ganzhi = `${value.layers.liuShi.ganzhi.slice(0, 1)}酉`; }],
  ["day identity", (value: any) => { value.layers.liuRi.dateISO = "2026-08-25"; }],
  ["civil date", (value: any) => { value.layers.liuShi.civilDateISO = "2026-08-25"; }],
  ["stale realized bounds", (value: any) => {
    value.reference.validFrom = "2026-08-25T12:00:00.000Z";
    value.reference.validUntil = "2026-08-25T14:00:00.000Z";
    value.reference.instant = "2026-08-25T12:30:00.000Z";
  }],
] as const) {
  const mixedFacts = JSON.parse(JSON.stringify(facts));
  mutate(mixedFacts);
  assert.throws(() => runtime.buildZiweiHourlyNotificationSnapshot({
    accountId: "00000000-0000-4000-8000-000000000001",
    profile: { id: "00000000-0000-4000-8000-000000000002", name: "Owner", isSelf: true },
    facts: mixedFacts,
  }), /ziwei_hourly_snapshot_invalid/u, `${label} cannot enter a signed occurrence snapshot`);
}

const preview = buildZiweiHourlyPreview({
  birthInstant: new Date("1984-12-31T06:15:00.000Z"),
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "M",
  referenceInstant: new Date("2026-08-26T12:30:00.000Z"),
  referenceTimezone: "Asia/Bangkok",
});
assert.throws(() => runtime.buildZiweiHourlyNotificationSnapshot({
  accountId: "00000000-0000-4000-8000-000000000001",
  profile: { id: "00000000-0000-4000-8000-000000000002", name: "Owner", isSelf: true },
  facts: preview,
}), /ziwei_hourly_snapshot_invalid/u, "preview-only results must never enter production notification snapshots");

const duplicateCompact = JSON.parse(JSON.stringify(compact));
duplicateCompact.day.siHua[1][1] = duplicateCompact.day.siHua[0][1];
assert.equal(runtime.parseZiweiHourlyProviderData({
  ziweiHourlyV2: Buffer.from(runtime.canonicalStringify(duplicateCompact), "utf8").toString("base64url"),
}), null);

for (const mutate of [
  (value: any) => { value.windowKey = value.windowKey.replace(":2026-08-26:", ":2026-08-25:"); },
  (value: any) => { value.hour.ganzhi = `${value.hour.ganzhi.slice(0, 1)}酉`; },
  (value: any) => { value.day.dateISO = "2026-08-25"; },
  (value: any) => {
    value.validFrom = "2026-08-25T12:00:00.000Z";
    value.validUntil = "2026-08-25T14:00:00.000Z";
  },
]) {
  const mixedCompact = JSON.parse(JSON.stringify(compact));
  mutate(mixedCompact);
  assert.equal(runtime.parseZiweiHourlyProviderData({
    ziweiHourlyV2: Buffer.from(runtime.canonicalStringify(mixedCompact), "utf8").toString("base64url"),
  }), null, "compact provider identity must remain bound to its exact realized shichen");
}

console.log("PASS ziwei hourly notification payload — immutable three-layer facts, compact provider data, no verdict");
