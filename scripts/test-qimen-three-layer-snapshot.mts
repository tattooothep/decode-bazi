import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let runtime: Record<string, unknown> | null = null;
try {
  runtime = require("../src/lib/qimen-three-layer-notification.cjs");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
}
assert.ok(runtime, "the immutable Qimen three-layer snapshot runtime must exist");

const DIRECTIONS = ["N", "SW", "E", "SE", "C", "NW", "W", "NE", "S"] as const;
const INSTRUMENTS = ["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"] as const;

function layer(
  kind: "month" | "day" | "hour",
  validFrom: string,
  validUntil: string,
) {
  const faqiao = kind !== "hour";
  return {
    kind,
    calculationVersion: kind === "month"
      ? "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1"
      : kind === "day"
        ? "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1"
        : "QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_V1",
    sourceCode: faqiao ? "QIMEN_FAQIAO_FEIPAN" : "QIMEN_VERIFIED_ZHUANPAN_SHIJIA",
    schoolCode: faqiao ? "faqiao_feipan" : "zhuanpan_chai_bu",
    validFrom,
    validUntil,
    centerLodgingPolicy: faqiao ? "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1" : "hour_engine_source_policy",
    palaces: DIRECTIONS.map((direction, index) => ({
      palace: index + 1,
      direction,
      earthInstrument: INSTRUMENTS[index],
      heavenInstrument: INSTRUMENTS[(index + (kind === "month" ? 1 : kind === "day" ? 2 : 3)) % 9],
      starCode: `STAR_${kind}_${index + 1}`,
      starZh: `星${index + 1}`,
      doorCode: direction === "C" ? null : `DOOR_${kind}_${index + 1}`,
      doorZh: direction === "C" ? null : `門${index + 1}`,
      deityCode: direction === "C" ? null : `DEITY_${kind}_${index + 1}`,
      deityZh: direction === "C" ? null : `神${index + 1}`,
      formationCodes: [],
      warningCodes: [],
      isVoid: false,
      isHorse: false,
    })),
  };
}

function validInput() {
  return {
    event: "qimen_three_layer",
    notificationId: "notif_qimen_20260821_2100",
    accountId: "acct_test_owner",
    purpose: "travel",
    selectedDirection: "SE",
    createdAt: "2026-08-21T13:59:00.000Z",
    route: "/qimen/notification-detail",
    hourDecision: {
      direction: "SE",
      purpose: "travel",
      recommendationCode: "recommended",
      reasonCodes: ["hour_clear_direction"],
    },
    layers: {
      month: layer("month", "2026-08-07T12:00:00.000Z", "2026-09-07T15:00:00.000Z"),
      day: layer("day", "2026-08-20T17:00:00.000Z", "2026-08-21T17:00:00.000Z"),
      hour: layer("hour", "2026-08-21T14:00:00.000Z", "2026-08-21T16:00:00.000Z"),
    },
  };
}

const buildQimenThreeLayerSnapshot = runtime.buildQimenThreeLayerSnapshot as (
  input: ReturnType<typeof validInput>,
) => Record<string, any>;
const verifyQimenThreeLayerSnapshot = runtime.verifyQimenThreeLayerSnapshot as (
  snapshot: unknown,
) => boolean;

const snapshot = buildQimenThreeLayerSnapshot(validInput());
assert.equal(snapshot.snapshotSchema, 2);
assert.equal(snapshot.event, "qimen_three_layer");
assert.equal(snapshot.route, "/qimen/notification-detail");
assert.match(snapshot.snapshotDigest, /^[a-f0-9]{64}$/u);
assert.equal(snapshot.layers.month.decisionRole, "raw_context_only");
assert.equal(snapshot.layers.day.decisionRole, "raw_context_only");
assert.equal(snapshot.layers.hour.decisionRole, "sole_action_authority");
assert.equal(snapshot.hourDecision.direction, "SE");
assert.equal(snapshot.selectedEvidence.month.direction, "SE");
assert.equal(snapshot.selectedEvidence.month.deityCode, "DEITY_month_4");
assert.equal(snapshot.selectedEvidence.month.doorCode, "DOOR_month_4");
assert.equal(snapshot.selectedEvidence.month.starCode, "STAR_month_4");
assert.equal(snapshot.selectedEvidence.day.starCode, "STAR_day_4");
assert.equal(snapshot.selectedEvidence.hour.starCode, "STAR_hour_4");
assert.equal(verifyQimenThreeLayerSnapshot(snapshot), true);
assert.equal(Object.isFrozen(snapshot), true);
assert.equal(Object.isFrozen(snapshot.layers.month.palaces), true);
assert.doesNotMatch(JSON.stringify(snapshot), /latitude|longitude|profileId|address/iu);

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

console.log("qimen three-layer immutable snapshot tests passed");
