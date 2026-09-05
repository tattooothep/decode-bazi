import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Synthetic contract matrix, never an ephemeris/science golden or live request.
const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-three-layer-notification.cjs");
const seasonal = require("../src/lib/qimen-seasonal-vigor.cjs");
const fixture = require("./fixtures/qimen-three-layer-valid-snapshot-v4.cjs");
const presentation = require("../src/lib/qimen-notification-presentation.cjs");
const push = require("../src/lib/push-send.cjs");
const accountId = "11111111-1111-4111-8111-111111111111";
const notificationId = "22222222-2222-4222-8222-222222222222";
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
type Sample = {
  method: string; pillar: string; locale: string; provider: "fcm" | "expo";
  syntheticRearrangement: boolean; bodyChars: number; sealedBytes: number;
  httpBodyBytes: number; notificationAndDataJsonBytes: number | null;
  notificationAndDataKeyValueBytes: number | null;
};
const samples: Sample[] = [];
let noSupportingPairCases = 0;
let hardIneligibleCases = 0;

for (const method of Object.keys(seasonal.DOOR_METHODS)) {
  for (const pillar of ["甲子", "乙丑", "丙寅", "丁卯", "戊辰", "己巳", "庚午", "辛未", "壬申", "癸酉", "甲戌", "乙亥"]) {
    const input = fixture.input(accountId, method);
    const pillars = { ...input.layers.month.contextEvidence, monthPillarZh: pillar };
    for (const layer of ["month", "day"]) input.layers[layer] = fixture.contextLayer(
      layer, input.layers[layer].validFrom, input.layers[layer].validUntil, pillars,
    );
    input.layers.hour.contextEvidence = seasonal.buildSeasonalVigorEvidence({
      monthPillarZh: pillar, monthBoundaryClock: seasonal.MONTH_BOUNDARY_CLOCK,
      monthValidFrom: input.layers.month.validFrom, monthValidUntil: input.layers.month.validUntil, doorMethod: method,
    });
    const maps = seasonal.separatedVigorForMonthPillar(pillar, method);
    for (const palace of input.layers.hour.palaces) {
      palace.starVigor = maps.star.byStarCode[palace.starCode];
      palace.doorVigor = palace.direction === "C" ? null : maps.door.byDoorCode[palace.doorCode];
    }
    const status = fixture.supportingDirectionStatus(input);
    const syntheticRearrangement = status.kind !== "admissible";
    if (syntheticRearrangement) {
      assert.throws(() => fixture.selectSupportingDirection(input),
        status.kind === "no_supporting_pair" ? /qimen_fixture_no_supporting_direction/u : /qimen_fixture_supporting_directions_intrinsically_ineligible/u);
      assert.throws(() => runtime.buildQimenThreeLayerSnapshotV4(input), /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u);
      if (status.kind === "no_supporting_pair") noSupportingPairCases += 1;
      else hardIneligibleCases += 1;
      fixture.arrangeSyntheticAdmissibleDirection(input);
    } else fixture.selectSupportingDirection(input);
    const snapshot = runtime.buildQimenThreeLayerSnapshotV4(input);
    assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(snapshot), true);
    for (const locale of ["th", "en", "zh"]) {
      const copy = presentation.buildQimenCopy(locale, snapshot);
      for (const provider of ["fcm", "expo"] as const) {
        const prepared = JSON.parse(JSON.stringify(push.prepareMessage({
          ...copy, category: "qimen", transactional: false,
          data: { ...runtime.buildQimenV4ProviderData(snapshot), notificationId },
          url: "/qimen/notification-detail",
        }, provider)));
        const visible = provider === "fcm" ? prepared.notification : prepared;
        assert.deepEqual({ title: visible.title, body: visible.body }, copy, "measurement must not silently truncate copy");
        const fullRequest = provider === "fcm"
          ? { message: { token: "f".repeat(256), ...prepared } }
          : { to: `ExponentPushToken[${"e".repeat(256)}]`, ...prepared };
        const notificationAndData = provider === "fcm"
          ? { notification: prepared.notification, data: prepared.data } : null;
        const notificationAndDataKeyValueBytes = provider === "fcm"
          ? [prepared.notification, prepared.data].reduce((total, fields) => total
            + Object.entries(fields).reduce((subtotal, [key, value]) => subtotal
              + Buffer.byteLength(key, "utf8") + Buffer.byteLength(String(value), "utf8"), 0), 0)
          : null;
        samples.push({
          method, pillar, locale, provider, syntheticRearrangement, bodyChars: copy.body.length,
          sealedBytes: size(prepared), httpBodyBytes: size(fullRequest),
          notificationAndDataJsonBytes: notificationAndData ? size(notificationAndData) : null,
          notificationAndDataKeyValueBytes,
        });
      }
    }
  }
}
assert.equal(noSupportingPairCases, 4);
assert.equal(hardIneligibleCases, 16);
assert.equal(samples.length, 144);

const byLocaleProvider = [];
for (const locale of ["th", "en", "zh"]) for (const provider of ["fcm", "expo"] as const) {
  const subset = samples.filter((sample) => sample.locale === locale && sample.provider === provider);
  const max = (field: keyof Sample) => subset.reduce((previous, sample) =>
    Number(sample[field]) > Number(previous[field]) ? sample : previous);
  const selected = max("httpBodyBytes");
  byLocaleProvider.push({
    locale, provider, count: subset.length,
    maxSealedBytes: max("sealedBytes").sealedBytes,
    maxHttpBodyBytes: selected.httpBodyBytes,
    maxNotificationAndDataJsonBytes: provider === "fcm" ? max("notificationAndDataJsonBytes").notificationAndDataJsonBytes : null,
    maxNotificationAndDataKeyValueBytes: provider === "fcm" ? max("notificationAndDataKeyValueBytes").notificationAndDataKeyValueBytes : null,
    maxHttpWitness: { method: selected.method, pillar: selected.pillar, syntheticRearrangement: selected.syntheticRearrangement },
  });
}
console.log(JSON.stringify({
  result: "QIMEN_V4_SIZE_INDEPENDENT_MEASUREMENT", cases: samples.length, noSupportingPairCases, hardIneligibleCases,
  noTruncation: true, network: 0, syntheticTargetLength: 256,
  sealedAtLeast4000: samples.filter((sample) => sample.sealedBytes >= 4_000).length,
  httpAtLeast4000: samples.filter((sample) => sample.httpBodyBytes >= 4_000).length,
  httpOver4096: samples.filter((sample) => sample.httpBodyBytes > 4_096).length,
  fcmNotificationAndDataJsonOver4096: samples.filter((sample) => sample.provider === "fcm"
    && sample.notificationAndDataJsonBytes! > 4_096).length,
  fcmNotificationAndDataKeyValuesOver4096: samples.filter((sample) => sample.provider === "fcm"
    && sample.notificationAndDataKeyValueBytes! > 4_096).length,
  byLocaleProvider,
}, null, 2));
