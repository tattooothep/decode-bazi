import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-three-layer-notification.cjs");
const catalog = require("../src/lib/qimen-component-catalog.cjs");
const fixture = require("./fixtures/qimen-three-layer-valid-snapshot-v3.cjs");
const v2Fixture = require("./fixtures/qimen-three-layer-valid-snapshot.cjs");

const snapshot = runtime.buildQimenThreeLayerSnapshotV3(fixture.input("acct_test_owner"));
assert.equal(snapshot.snapshotSchema, 3);
assert.equal(snapshot.selectedEvidence.month.deityBaseQuality, "auspicious");
assert.equal(snapshot.selectedEvidence.month.starBaseQuality, "severe");
assert.equal(snapshot.layers.month.palaces[4].doorBaseQuality, "unavailable");
assert.equal(runtime.verifyQimenThreeLayerSnapshotV3(snapshot), true);
assert.equal(Object.isFrozen(snapshot), true);

for (const layer of Object.values(snapshot.layers) as Array<Record<string, any>>) {
  for (const palace of layer.palaces) {
    for (const kind of ["deity", "door", "star"] as const) {
      const expected = palace[`${kind}Code`] === null
        ? "unavailable"
        : catalog.resolveQimenComponent(kind, palace[`${kind}Code`])?.baseQuality;
      assert.equal(palace[`${kind}BaseQuality`], expected);
    }
  }
}

const tampered = structuredClone(snapshot);
tampered.layers.month.palaces[0].deityBaseQuality = "great_auspicious";
assert.equal(runtime.verifyQimenThreeLayerSnapshotV3(tampered), false, "digest parity rejects changed quality");

const nonCanonicalCode = fixture.input("acct_test_owner");
nonCanonicalCode.layers.month.palaces[0].deityCode = "jiu_di";
assert.throws(
  () => runtime.buildQimenThreeLayerSnapshotV3(nonCanonicalCode),
  /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u,
  "catalog lookup must not silently normalize a non-canonical component code",
);

const contradictoryDecision = fixture.input("acct_test_owner");
contradictoryDecision.hourDecision.reasonCodes = ["hour_conditional_good", "hour_reading_suitable"];
assert.throws(
  () => runtime.buildQimenThreeLayerSnapshotV3(contradictoryDecision),
  /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u,
  "snapshot trust boundary rejects conditional+suitable without a warning",
);

const provider = runtime.buildQimenV3ProviderData(snapshot);
assert.deepEqual(Object.keys(provider), ["qimenV3"]);
const compact = runtime.parseQimenV3ProviderData(provider);
assert.equal(compact.v, 3);
assert.equal(compact.layers.hour.doorBaseQuality, snapshot.selectedEvidence.hour.doorBaseQuality);
assert.ok(Buffer.byteLength(provider.qimenV3, "utf8") < 3_500);
assert.equal(Object.isFrozen(compact), true);

const mismatchedQuality = provider.qimenV3.replace(
  `"deityBaseQuality":"${compact.layers.month.deityBaseQuality}"`,
  "\"deityBaseQuality\":\"great_auspicious\"",
);
assert.throws(
  () => runtime.parseQimenV3ProviderData({ qimenV3: mismatchedQuality }),
  /QIMEN_V3_PROVIDER_PAYLOAD_INVALID/u,
);

const duplicateTopKey = provider.qimenV3.replace(
  /^\{"accountId":"acct_test_owner",/u,
  "{\"accountId\":\"acct_test_owner\",\"accountId\":\"acct_test_owner\",",
);
assert.throws(
  () => runtime.parseQimenV3ProviderData({ qimenV3: duplicateTopKey }),
  /QIMEN_V3_PROVIDER_PAYLOAD_INVALID/u,
);
const duplicateEscapedKey = provider.qimenV3.replace(
  /^\{"accountId":"acct_test_owner",/u,
  "{\"accountId\":\"acct_test_owner\",\"\\u0061ccountId\":\"acct_test_owner\",",
);
assert.throws(
  () => runtime.parseQimenV3ProviderData({ qimenV3: duplicateEscapedKey }),
  /QIMEN_V3_PROVIDER_PAYLOAD_INVALID/u,
);

let accessorInvoked = false;
const accessorOuter = {};
Object.defineProperty(accessorOuter, "qimenV3", {
  enumerable: true,
  get() {
    accessorInvoked = true;
    return provider.qimenV3;
  },
});
assert.throws(
  () => runtime.parseQimenV3ProviderData(accessorOuter),
  /QIMEN_V3_PROVIDER_PAYLOAD_INVALID/u,
);
assert.equal(accessorInvoked, false);

const v2Snapshot = v2Fixture.build("acct_test_owner");
assert.equal(v2Snapshot.snapshotSchema, 2);
assert.equal(runtime.verifyQimenThreeLayerSnapshot(v2Snapshot), true);
assert.equal(runtime.parseQimenV2ProviderData(runtime.buildQimenV2ProviderData(v2Snapshot)).v, 2);

const detail = require("../src/lib/mobile-qimen-notification-detail.cjs");
const accountId = "22222222-2222-4222-8222-222222222222";
const notificationId = "11111111-1111-4111-8111-111111111111";
const detailSnapshot = fixture.build(accountId);
const detailResult = await detail.readQimenNotificationDetail({
  query: async () => ({ rows: [{
    notification_id: notificationId,
    snapshot: detailSnapshot,
    snapshot_digest: detailSnapshot.snapshotDigest,
  }] }),
}, accountId, notificationId);
assert.deepEqual(detailResult, { notificationId, snapshot: detailSnapshot });

console.log("qimen three-layer schema v3 tests passed");
