import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const builder = require("../src/lib/qimen-canonical-occurrence-builder.cjs");
const snapshots = require("../src/lib/qimen-three-layer-notification.cjs");
const seasonal = require("../src/lib/qimen-seasonal-vigor.cjs");
const fixture = require("./fixtures/qimen-seasonal-engine-witness.cjs");
const at = new Date("2026-06-22T03:00:00.000Z");
const row = { user_id: "11111111-1111-4111-8111-111111111111", installation_id: "22222222-2222-4222-8222-222222222222",
  purpose: "travel", latitude: 13.7563, longitude: 100.5018, location_timezone: "Asia/Bangkok" };
const doorMethod = "STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1";
const invoke = (response = fixture.build(), instant = at, extra = {}) => builder.buildCanonicalQimenOccurrence(row, instant, {
  schema: 4, doorMethod,
  fetchCanonicalQimenEngineSnapshot: async (_request: unknown, options: any) => {
    assert.equal(options.schema, 4); assert.equal(options.doorMethod, doorMethod);
    // A stale injected advisory must never override source-based V4 selection.
    return { result: response, advisory: { purpose: "travel", recommendation: "recommended", direction: { code: "NW" } } };
  }, ...extra,
});
const original = fixture.build();
const before = JSON.stringify(original);
const snapshot = await invoke(original);
assert.equal(JSON.stringify(original), before, "never rewrite the raw engine response");
assert.equal(snapshot.snapshotSchema, 4);
assert.ok(snapshots.verifyQimenThreeLayerSnapshotV4(snapshot));
assert.equal(snapshot.selectedDirection, "SE");
assert.equal(snapshot.layers.hour.calculationVersion, seasonal.SEASONAL_HOUR_CALCULATION_VERSION);
assert.equal(snapshot.layers.hour.contextEvidence.monthPillarZh, "甲午");
assert.equal(snapshot.layers.hour.contextEvidence.monthPillarZh, snapshot.layers.month.contextEvidence.subjectPillarZh);
assert.equal(snapshot.layers.hour.contextEvidence.monthValidFrom, snapshot.layers.month.validFrom);
assert.equal(snapshot.layers.hour.contextEvidence.monthValidUntil, snapshot.layers.month.validUntil);
assert.equal(snapshot.layers.hour.palaces[3].starVigor, "旺");
assert.equal(snapshot.layers.hour.palaces[3].doorVigor, "相");
assert.equal(snapshot.layers.hour.palaces[4].starVigor, "廢");
assert.equal(snapshot.layers.hour.palaces[4].doorVigor, null);
for (const kind of ["month", "day"]) {
  assert.equal(snapshot.layers[kind].decisionRole, "raw_context_only");
  assert.ok(snapshot.layers[kind].palaces.every((palace: any) => palace.doorVigor === null && palace.starVigor === null));
}
const noCache = fixture.build(); delete noCache.chart.wang_xiang_status;
assert.deepEqual((await invoke(noCache)).layers.hour, snapshot.layers.hour);
const weak = fixture.build(); weak.palaces[3].display_score = 59;
assert.equal(await invoke(weak), null, "do not weaken the score filter");
const wrongPillars = fixture.build(); wrongPillars.calculation.pillars = { ...wrongPillars.calculation.pillars, monthPillarZh: "乙未" };
wrongPillars.palaces[3].display_score = 1;
await assert.rejects(invoke(wrongPillars), /QIMEN_ENGINE_PILLARS_MISMATCH/u,
  "validate source month even when no direction would be eligible");
await assert.rejects(invoke(fixture.build(), at, { doorMethod: undefined }), /qimen_seasonal_door_method_required/u);
const jie = new Date("2026-04-04T18:40:00.000Z");
await assert.rejects(invoke(fixture.build(jie), jie), /QIMEN_CONTEXT_TRANSITION_INSIDE_HOUR/u,
  "never emit a whole hour with one month state across a Jie");
console.log("QIMEN_SEASONAL_OCCURRENCE_BUILDER_OK canonical_month=PASS selection=PASS all9=PASS immutable=PASS boundary=PASS");
