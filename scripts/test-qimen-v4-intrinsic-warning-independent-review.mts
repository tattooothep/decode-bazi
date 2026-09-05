import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

// Independent reproducible boundary test: real canonical builder/clock, controlled
// synthetic engine arrangement, no external engine import/request or DB.
const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-three-layer-notification.cjs");
const builder = require("../src/lib/qimen-canonical-occurrence-builder.cjs");
const advisory = require("../src/lib/qimen-notification-advisory.cjs");
const engine = require("./fixtures/qimen-seasonal-engine-witness.cjs");
const at = new Date("2026-06-22T02:25:34.852Z");
const result = engine.build(at);
const selected = result.palaces.find((palace: any) => palace.direction === "SE");
const originalSnake = result.palaces.find((palace: any) => palace.deity_code === "TENG_SHE");
for (const key of ["deity_code", "deity_zh", "deity_quality"]) {
  [selected[key], originalSnake[key]] = [originalSnake[key], selected[key]];
}
selected.deity_quality = "inauspicious";
selected.beginner_reading.code = "caution";
const method = "STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1";
const decision = advisory.buildQimenAdvisory({ data: result }, {
  timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel", schema: 4, doorMethod: method,
});
assert.equal(decision.recommendation, "recommended");
assert.equal(decision.decisionClass, "conditional");
assert.equal(decision.direction.code, "SE");
assert.deepEqual(decision.canonicalWarningCodes, ["INTRINSIC_DEITY_BAD"]);

const snapshot = await builder.buildCanonicalQimenOccurrence({
  user_id: "11111111-1111-4111-8111-111111111111",
  installation_id: "22222222-2222-4222-8222-222222222222",
  latitude: 13.7563, longitude: 100.5018, location_timezone: "Asia/Bangkok", purpose: "travel",
}, at, { schema: 4, doorMethod: method,
  fetchCanonicalQimenEngineSnapshot: async () => ({ result }),
});
assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(snapshot), true);
assert.equal(snapshot.selectedEvidence.hour.deityBaseQuality, "inauspicious");
assert.ok(snapshot.hourDecision.reasonCodes.includes("hour_warning_INTRINSIC_DEITY_BAD"));

const acceptedMissingWarnings: string[] = [];
for (const reasonCodes of [
  ["hour_conditional_good", "hour_reading_caution"],
  ["hour_clear_good", "hour_reading_suitable"],
  ["hour_conditional_good", "hour_reading_caution", "hour_warning_INTRINSIC_STAR_BAD"],
]) {
  const mutated = structuredClone(snapshot);
  mutated.hourDecision.reasonCodes = reasonCodes;
  const { snapshotDigest: _removed, ...unsigned } = mutated;
  mutated.snapshotDigest = createHash("sha256").update(runtime.canonicalStringify(unsigned)).digest("hex");
  if (runtime.verifyQimenThreeLayerSnapshotV4(mutated)) acceptedMissingWarnings.push(reasonCodes.join("|"));
}
console.log(`QIMEN_V4_INTRINSIC_WARNING_REVIEW baseline=canonical_builder_controlled_engine omissionsAccepted=${acceptedMissingWarnings.length} network=0`);
assert.deepEqual(acceptedMissingWarnings, [], "V4 must not omit the selected deity's mandatory intrinsic warning while claiming clear/conditional recommendation");
