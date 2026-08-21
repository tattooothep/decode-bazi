import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fixture = require("./fixtures/qimen-three-layer-valid-snapshot.cjs") as {
  input(accountId: string): Record<string, any>;
  layer(kind: "month" | "day" | "hour", validFrom: string, validUntil: string, chartInput?: {
    dun: "yang" | "yin"; ju: number; subjectPillarZh: string;
  }): Record<string, any>;
};
const { buildFaqiaoFeipan } = require("../src/lib/qimen-canonical-context-engine.cjs") as {
  buildFaqiaoFeipan(input: {
    dun: "yang" | "yin"; ju: number; subjectPillarZh: string;
    centerLodgingPolicy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1";
  }): {
    rawDoorTarget: number; effectiveDoorTarget: number;
    rawDeityTarget: number; effectiveDeityTarget: number;
  };
};
let runtime: Record<string, unknown> | null = null;
try {
  runtime = require("../src/lib/qimen-three-layer-notification.cjs");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
}
assert.ok(runtime, "the immutable Qimen three-layer snapshot runtime must exist");

function validInput() {
  return structuredClone(fixture.input("acct_test_owner"));
}

const buildQimenThreeLayerSnapshot = runtime.buildQimenThreeLayerSnapshot as (
  input: ReturnType<typeof validInput>,
) => Record<string, any>;
const verifyQimenThreeLayerSnapshot = runtime.verifyQimenThreeLayerSnapshot as (
  snapshot: unknown,
) => boolean;

const snapshot = buildQimenThreeLayerSnapshot(validInput());
assert.equal(snapshot.snapshotSchema, 2);
assert.equal(snapshot.snapshotDigest, "ab8f6b35bfb1c82ff01e403525f8ef188e150b0704c675c2ec1af9cc3bbc7f41");
assert.equal(snapshot.event, "qimen_three_layer");
assert.equal(snapshot.route, "/qimen/notification-detail");
assert.match(snapshot.snapshotDigest, /^[a-f0-9]{64}$/u);
assert.equal(snapshot.layers.month.decisionRole, "raw_context_only");
assert.equal(snapshot.layers.day.decisionRole, "raw_context_only");
assert.equal(snapshot.layers.hour.decisionRole, "sole_action_authority");
assert.equal(snapshot.hourDecision.direction, "SE");
assert.equal(snapshot.selectedEvidence.month.direction, "SE");
assert.ok(snapshot.selectedEvidence.month.deityCode);
assert.ok(snapshot.selectedEvidence.month.doorCode);
assert.ok(snapshot.selectedEvidence.month.starCode);
assert.ok(snapshot.selectedEvidence.day.starCode);
assert.ok(snapshot.selectedEvidence.hour.starCode);
assert.equal(verifyQimenThreeLayerSnapshot(snapshot), true);
assert.equal(Object.isFrozen(snapshot), true);
assert.equal(Object.isFrozen(snapshot.layers.month.palaces), true);
assert.equal("deityBaseQuality" in snapshot.layers.month.palaces[0], false, "stored v2 shape stays unchanged");
function collectKeys(value: unknown, output = new Set<string>()) {
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      output.add(key.toLowerCase());
      collectKeys(child, output);
    }
  }
  return output;
}
const snapshotKeys = collectKeys(snapshot);
for (const forbidden of ["latitude", "longitude", "profileid", "address"]) {
  assert.equal(snapshotKeys.has(forbidden), false, `snapshot must not carry private field ${forbidden}`);
}

const tampered = structuredClone(snapshot);
tampered.layers.month.palaces[3].starCode = "TAMPERED";
assert.equal(verifyQimenThreeLayerSnapshot(tampered), false, "digest parity rejects changed evidence");

const preliminary = validInput();
preliminary.layers.day.calculationVersion = "preliminary_simplified_dmy";
assert.throws(
  () => buildQimenThreeLayerSnapshot(preliminary),
  /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u,
);

const missingSelectedEvidence = validInput();
missingSelectedEvidence.layers.month.palaces[3].deityCode = null as never;
assert.throws(
  () => buildQimenThreeLayerSnapshot(missingSelectedEvidence),
  /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u,
);

const inventedHourCenterInstrument = validInput();
const usedHourInstruments = new Set(inventedHourCenterInstrument.layers.hour.palaces
  .filter((palace: Record<string, unknown>) => palace.direction !== "C")
  .map((palace: Record<string, unknown>) => palace.heavenInstrument));
inventedHourCenterInstrument.layers.hour.palaces[4].heavenInstrument
  = ["乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"].find((stem) => !usedHourInstruments.has(stem));
assert.throws(
  () => buildQimenThreeLayerSnapshot(inventedHourCenterInstrument),
  /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u,
  "hour center must preserve the engine's explicit null heaven instrument",
);

const inventedHourCenterStar = validInput();
[inventedHourCenterStar.layers.hour.palaces[4].starCode, inventedHourCenterStar.layers.hour.palaces[5].starCode]
  = [inventedHourCenterStar.layers.hour.palaces[5].starCode, inventedHourCenterStar.layers.hour.palaces[4].starCode];
[inventedHourCenterStar.layers.hour.palaces[4].starZh, inventedHourCenterStar.layers.hour.palaces[5].starZh]
  = [inventedHourCenterStar.layers.hour.palaces[5].starZh, inventedHourCenterStar.layers.hour.palaces[4].starZh];
assert.throws(
  () => buildQimenThreeLayerSnapshot(inventedHourCenterStar),
  /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u,
  "hour center must preserve the canonical 天禽 star",
);

const wrongDecision = validInput();
wrongDecision.hourDecision.direction = "E";
assert.throws(
  () => buildQimenThreeLayerSnapshot(wrongDecision),
  /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u,
);

const leaking = { ...validInput(), latitude: 13.7563 };
assert.throws(
  () => buildQimenThreeLayerSnapshot(leaking as never),
  /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u,
);

let accessorInvoked = false;
const accessorInput = validInput();
Object.defineProperty(accessorInput, "purpose", {
  enumerable: true,
  get() {
    accessorInvoked = true;
    return "travel";
  },
});
assert.throws(
  () => buildQimenThreeLayerSnapshot(accessorInput),
  /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u,
);
assert.equal(accessorInvoked, false, "input accessors are rejected without invocation");

function centerSnapshotInput(dun: "yang" | "yin", ju: number) {
  const result = validInput();
  const chartInput = { dun, ju, subjectPillarZh: "甲戌" };
  result.layers.month = fixture.layer("month", "2026-08-07T00:00:00.000Z", "2026-09-07T00:00:00.000Z", chartInput);
  result.layers.day = fixture.layer("day", "2026-08-21T00:00:00.000Z", "2026-08-22T00:00:00.000Z", chartInput);
  return result;
}

for (const [dun, ju, lodging] of [["yang", 4, 8], ["yin", 6, 2]] as const) {
  const centerInput = centerSnapshotInput(dun, ju);
  const built = buildQimenThreeLayerSnapshot(centerInput);
  for (const kind of ["month", "day"] as const) {
    assert.deepEqual(built.layers[kind].contextEvidence.centerEvidence, {
      policy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
      sourceConflictCode: "FAQIAO_VOL2_SEASONAL_VS_VOL6_FIXED_YINYANG",
      rawCenterPalace: 5,
      effectiveLodgingPalace: lodging,
      rawDoorTargetPalace: 5,
      effectiveDoorTargetPalace: lodging,
      rawDeityTargetPalace: 5,
      effectiveDeityTargetPalace: lodging,
    });
  }
}

for (const [dun, ju] of [["yang", 1], ["yang", 7], ["yin", 9], ["yin", 3]] as const) {
  const chart = buildFaqiaoFeipan({
    dun, ju, subjectPillarZh: "甲戌",
    centerLodgingPolicy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
  });
  assert.equal(chart.rawDoorTarget, chart.effectiveDoorTarget, `${dun} ${ju} door target does not silently lodge`);
  assert.equal(chart.rawDeityTarget, chart.effectiveDeityTarget, `${dun} ${ju} deity target does not silently lodge`);
}

const centerMutations: Record<string, unknown> = {
  policy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V2",
  sourceConflictCode: "FAQIAO_CONFLICT_HIDDEN",
  rawCenterPalace: 4,
  effectiveLodgingPalace: 2,
  rawDoorTargetPalace: 6,
  effectiveDoorTargetPalace: 7,
  rawDeityTargetPalace: 6,
  effectiveDeityTargetPalace: 7,
};
for (const [field, value] of Object.entries(centerMutations)) {
  const changed = centerSnapshotInput("yang", 4);
  changed.layers.month.contextEvidence.centerEvidence[field] = value;
  assert.throws(
    () => buildQimenThreeLayerSnapshot(changed),
    /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u,
    `mutated center evidence ${field} must fail closed`,
  );
}

console.log("qimen three-layer immutable snapshot tests passed");
