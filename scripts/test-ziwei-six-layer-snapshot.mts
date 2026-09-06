import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { buildZiweiHourlyNotificationFacts } from "../src/lib/astro/ziwei/hourly-preview";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/ziwei-hourly-notification.cjs");
const builderPath = "../src/lib/astro/ziwei/hourly-six-layer.ts";
const build = existsSync(new URL(builderPath, import.meta.url))
  ? require(builderPath).buildZiweiHourlySixLayerSnapshot
  : (input: any, owner: any) => runtime.buildZiweiHourlyNotificationSnapshot({ ...owner, facts: buildZiweiHourlyNotificationFacts(input) });
const owner = { accountId: "00000000-0000-4000-8000-000000000001", profile: { id: "00000000-0000-4000-8000-000000000002", name: "Owner", isSelf: true } };
const cases = [
  ["1984-12-31T06:15:00.000Z", "2026-09-06T12:01:00.000Z", "M", 43],
  ["1985-01-01T06:15:00.000Z", "2024-02-09T15:59:00.000Z", "M", 40],
  ["1985-01-01T06:15:00.000Z", "2024-02-09T16:00:00.000Z", "M", 41],
  ["1986-04-12T09:42:00.000Z", "2026-09-06T12:01:00.000Z", "F", 41],
  ["2026-06-01T06:15:00.000Z", "2026-09-06T12:01:00.000Z", "M", 1],
  ["1900-02-01T06:15:00.000Z", "2021-09-06T12:01:00.000Z", "M", 122],
  ["1900-02-01T06:15:00.000Z", "2022-09-06T12:01:00.000Z", "M", 123],
] as const;
for (const [birth, reference, gender, age] of cases) {
  const input = { birthInstant: new Date(birth), birthTimezone: "Asia/Bangkok", birthLocation: null,
    gender, referenceInstant: new Date(reference), referenceTimezone: "Asia/Bangkok" };
  const snapshot = build(input, owner);
  assert.equal(snapshot.snapshotSchema, 2, "new notifications must freeze all six layers, not only the three-layer push view");
  assert.equal(snapshot.sixLayers.decade.nominalAge, age, "decade selection uses lunar nominal age at the frozen forward-Zi date");
  const legacy = runtime.buildZiweiHourlyNotificationSnapshot({ ...owner, facts: buildZiweiHourlyNotificationFacts(input) });
  assert.deepEqual(snapshot.facts, legacy.facts, "the six-layer addition cannot change the locked hourly science");
  assert.ok(runtime.verifyZiweiHourlyNotificationSnapshot(snapshot));
  const reorderKeys = (value: any): any => Array.isArray(value) ? value.map(reorderKeys)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reorderKeys(value[key])])) : value;
  assert.ok(runtime.verifyZiweiHourlyNotificationSnapshot(reorderKeys(snapshot)), "JSONB object-key ordering cannot invalidate a persisted snapshot");
  assert.ok(runtime.verifyZiweiHourlyNotificationSnapshot(legacy));
  assert.equal(legacy.snapshotSchema, 1, "legacy construction remains byte-compatible");
  const board = snapshot.sixLayers.natal.palaces;
  assert.equal(board.length, 12);
  assert.equal(new Set(board.map((p: any) => p.branch)).size, 12);
  assert.equal(board.reduce((n: number, p: any) => n + p.majorStars.length, 0), 14);
  const expected = board.find((p: any) => age >= p.daXian.ageStart && age <= p.daXian.ageEnd);
  const decade = snapshot.sixLayers.decade;
  assert.equal(decade.selected?.branch ?? null, expected?.branch ?? null);
  if (!expected) assert.equal(decade.unavailableReason,
    age < Math.min(...board.map((p: any) => p.daXian.ageStart)) ? "before_first_decade" : "outside_recorded_decades");
  for (const key of ["natal", "decade", "year", "month", "day", "hour"]) {
    const layer = snapshot.sixLayers.palaceLayers[key];
    if (key === "decade" && !expected) { assert.equal(layer, null); continue; }
    assert.equal(layer.length, 12); assert.equal(new Set(layer.map((p: any) => p.palaceName)).size, 12);
  }
  for (const schema of [2, 3]) {
    const data = runtime.buildZiweiHourlyProviderData(snapshot, { schema });
    const expanded = runtime.parseZiweiHourlyProviderData(data);
    assert.equal(expanded.snapshotDigest, snapshot.snapshotDigest);
    assert.equal(JSON.stringify(data).includes("sixLayers"), false, "full private chart is not stuffed into provider data");
    const old = runtime.parseZiweiHourlyProviderData(runtime.buildZiweiHourlyProviderData(legacy, { schema }));
    assert.deepEqual({ ...expanded, snapshotDigest: old.snapshotDigest }, old, "wire stays unchanged apart from its binding to the fuller snapshot");
  }
  for (const mutate of [
    (s: any) => { s.sixLayers.natal.palaces[0].branch = s.sixLayers.natal.palaces[1].branch; },
    (s: any) => { s.sixLayers.palaceLayers.hour[0].palaceName = "made-up"; },
    (s: any) => { s.sixLayers.decade.selected = null; s.sixLayers.decade.unavailableReason = null; },
  ]) {
    const corrupt = structuredClone(snapshot); mutate(corrupt);
    assert.equal(runtime.verifyZiweiHourlyNotificationSnapshot(corrupt), false);
  }
}
console.log(`ZIWEI_SIX_LAYER_SNAPSHOT_OK cases=${cases.length} legacy_and_wire_preserved=PASS lunar_age_and_full_board=PASS`);
