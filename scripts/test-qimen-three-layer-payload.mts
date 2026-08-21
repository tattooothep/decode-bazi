import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-three-layer-notification.cjs");
assert.equal(typeof runtime.buildQimenV2ProviderData, "function", "Qimen v2 provider projection must exist");
assert.equal(typeof runtime.parseQimenV2ProviderData, "function", "Qimen v2 provider parser must exist");

const directions = ["N", "SW", "E", "SE", "C", "NW", "W", "NE", "S"];
const instruments = ["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"];
const versions = {
  month: "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1",
  day: "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1",
  hour: "QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_V1",
};

function layer(kind: "month" | "day" | "hour", validFrom: string, validUntil: string) {
  return {
    kind,
    calculationVersion: versions[kind],
    sourceCode: kind === "hour" ? "QIMEN_VERIFIED_ZHUANPAN_SHIJIA" : "QIMEN_FAQIAO_FEIPAN",
    schoolCode: kind === "hour" ? "zhuanpan_chai_bu" : "faqiao_feipan",
    validFrom,
    validUntil,
    centerLodgingPolicy: kind === "hour"
      ? "hour_engine_source_policy"
      : "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
    palaces: directions.map((direction, index) => ({
      palace: index + 1,
      direction,
      earthInstrument: instruments[index],
      heavenInstrument: instruments[(index + 1) % 9],
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

const snapshot = runtime.buildQimenThreeLayerSnapshot({
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
});

const provider = runtime.buildQimenV2ProviderData(snapshot);
assert.deepEqual(Object.keys(provider), ["qimenV2"]);
assert.equal(typeof provider.qimenV2, "string");
assert.ok(Buffer.byteLength(provider.qimenV2, "utf8") < 3_500, "compact payload stays below safety cap");
const parsed = runtime.parseQimenV2ProviderData(provider);
assert.equal(parsed.v, 2);
assert.equal(parsed.event, "qimen_three_layer");
assert.equal(parsed.url, "/qimen/notification-detail");
assert.equal(parsed.direction, "SE");
assert.equal(parsed.hourStart, snapshot.layers.hour.validFrom);
assert.equal(parsed.hourEnd, snapshot.layers.hour.validUntil);
assert.equal(parsed.snapshotDigest, snapshot.snapshotDigest);
assert.equal(parsed.layers.month.deityCode, "DEITY_month_4");
assert.equal(parsed.layers.day.doorCode, "DOOR_day_4");
assert.equal(parsed.layers.hour.starCode, "STAR_hour_4");
assert.equal(Object.isFrozen(parsed), true);

const duplicateTopKey = provider.qimenV2.replace(
  /^\{"accountId":"acct_test_owner",/u,
  "{\"accountId\":\"acct_test_owner\",\"accountId\":\"acct_test_owner\",",
);
assert.throws(
  () => runtime.parseQimenV2ProviderData({ qimenV2: duplicateTopKey }),
  /QIMEN_V2_PROVIDER_PAYLOAD_INVALID/u,
);
const duplicateEscapedKey = provider.qimenV2.replace(
  /^\{"accountId":"acct_test_owner",/u,
  "{\"accountId\":\"acct_test_owner\",\"\\u0061ccountId\":\"acct_test_owner\",",
);
assert.throws(
  () => runtime.parseQimenV2ProviderData({ qimenV2: duplicateEscapedKey }),
  /QIMEN_V2_PROVIDER_PAYLOAD_INVALID/u,
);
assert.throws(
  () => runtime.parseQimenV2ProviderData({ qimenV2: provider.qimenV2, extra: "x" }),
  /QIMEN_V2_PROVIDER_PAYLOAD_INVALID/u,
);
assert.throws(
  () => runtime.parseQimenV2ProviderData({ qimenV2: provider.qimenV2.replace("/qimen/notification-detail", "/qimen/board") }),
  /QIMEN_V2_PROVIDER_PAYLOAD_INVALID/u,
);
assert.throws(
  () => runtime.parseQimenV2ProviderData({ qimenV2: provider.qimenV2.replace(snapshot.snapshotDigest, "0".repeat(64)) }),
  /QIMEN_V2_PROVIDER_PAYLOAD_INVALID/u,
);

let getterInvoked = false;
const accessorOuter = {};
Object.defineProperty(accessorOuter, "qimenV2", {
  enumerable: true,
  get() {
    getterInvoked = true;
    return provider.qimenV2;
  },
});
assert.throws(
  () => runtime.parseQimenV2ProviderData(accessorOuter),
  /QIMEN_V2_PROVIDER_PAYLOAD_INVALID/u,
);
assert.equal(getterInvoked, false);

assert.deepEqual(
  runtime.buildQimenV2ProviderData(snapshot),
  provider,
  "FCM and Expo callers receive byte-equivalent canonical content",
);

console.log("qimen three-layer compact provider payload tests passed");
