import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-seasonal-vigor.cjs");
assert.equal(typeof runtime.buildSeasonalVigorEvidence, "function");
assert.equal(typeof runtime.verifySeasonalVigorEvidence, "function");
const input = {
  monthPillarZh: "甲午",
  monthBoundaryClock: "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1",
  monthValidFrom: "2026-06-05T15:48:00.000Z",
  monthValidUntil: "2026-07-07T01:56:00.000Z",
  doorMethod: "STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1",
};
const expectedKeys = ["version", "monthPillarZh", "monthBoundaryClock", "monthValidFrom", "monthValidUntil",
  "starMethod", "starSourceSha256", "doorMethod", "doorSourceSha256", "doorProvenance"].sort();
for (const doorMethod of Object.keys(runtime.DOOR_METHODS)) {
  const evidence = runtime.buildSeasonalVigorEvidence({ ...input, doorMethod });
  assert.deepEqual(Object.keys(evidence).sort(), expectedKeys);
  assert.ok(Object.isFrozen(evidence));
  assert.equal(evidence.version, "QIMEN_SEASONAL_VIGOR_EVIDENCE_V1");
  assert.equal(evidence.starMethod, "YANBO_NINE_STAR_MONTH_V1");
  assert.equal(evidence.starSourceSha256, "cc3a5a5dbc4742467551456b3f296efd7e7c4b36336cbb4b9133162093b5c16e");
  assert.equal(evidence.doorProvenance, runtime.DOOR_METHODS[doorMethod].provenance);
  assert.equal(runtime.verifySeasonalVigorEvidence(evidence), true);
  for (const key of expectedKeys) {
    const missing = { ...evidence }; delete missing[key];
    assert.equal(runtime.verifySeasonalVigorEvidence(missing), false, `missing ${key}`);
  }
  for (const change of [
    { version: "QIMEN_SEASONAL_VIGOR_EVIDENCE_V2" }, { starMethod: doorMethod },
    { starSourceSha256: "0".repeat(64) }, { doorSourceSha256: "0".repeat(64) },
    { doorProvenance: "UNANIMOUS_CLASSICAL_RULE" }, { doorMethod: "__proto__" },
    { monthBoundaryClock: "TRUE_SOLAR_TIME" }, { monthPillarZh: "甲未" },
    { monthValidFrom: input.monthValidUntil }, { monthValidUntil: input.monthValidFrom },
    { monthValidFrom: "2026-06-05T15:48:00Z" }, { monthValidUntil: "2026-02-30T00:00:00.000Z" },
    { unexpected: true },
  ]) assert.equal(runtime.verifySeasonalVigorEvidence({ ...evidence, ...change }), false, JSON.stringify(change));
  const accessor = { ...evidence };
  Object.defineProperty(accessor, "starMethod", { enumerable: true, get() { throw new Error("must_not_invoke"); } });
  assert.equal(runtime.verifySeasonalVigorEvidence(accessor), false);
  assert.equal(runtime.verifySeasonalVigorEvidence(Object.create(evidence)), false);
  assert.equal(runtime.verifySeasonalVigorEvidence({ ...evidence, [Symbol("extra")]: true }), false);
}
assert.throws(() => runtime.buildSeasonalVigorEvidence({ ...input, doorMethod: undefined }));
assert.throws(() => runtime.buildSeasonalVigorEvidence({ ...input, extra: true }));
console.log("QIMEN_SEASONAL_EVIDENCE_OK exact10keys=PASS profiles=2 no_implicit_method=PASS");
