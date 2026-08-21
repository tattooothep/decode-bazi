import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-three-layer-notification.cjs");
const fixture = require("./fixtures/qimen-three-layer-valid-snapshot.cjs");
assert.equal(typeof runtime.buildQimenV2ProviderData, "function", "Qimen v2 provider projection must exist");
assert.equal(typeof runtime.parseQimenV2ProviderData, "function", "Qimen v2 provider parser must exist");
assert.equal(typeof runtime.buildQimenV3ProviderData, "function", "Qimen v3 provider projection coexists with v2");
assert.equal(typeof runtime.parseQimenV3ProviderData, "function", "Qimen v3 provider parser coexists with v2");

const snapshot = fixture.build("acct_test_owner");

const provider = runtime.buildQimenV2ProviderData(snapshot);
assert.deepEqual(Object.keys(provider), ["qimenV2"]);
assert.equal(typeof provider.qimenV2, "string");
assert.equal("qimenV3" in provider, false, "v2 projection shape stays unchanged");
assert.ok(Buffer.byteLength(provider.qimenV2, "utf8") < 3_500, "compact payload stays below safety cap");
const parsed = runtime.parseQimenV2ProviderData(provider);
assert.equal(parsed.v, 2);
assert.equal(parsed.event, "qimen_three_layer");
assert.equal(parsed.url, "/qimen/notification-detail");
assert.equal(parsed.direction, "SE");
assert.equal(parsed.hourStart, snapshot.layers.hour.validFrom);
assert.equal(parsed.hourEnd, snapshot.layers.hour.validUntil);
assert.equal(parsed.snapshotDigest, snapshot.snapshotDigest);
assert.equal(parsed.layers.month.deityCode, snapshot.selectedEvidence.month.deityCode);
assert.equal(parsed.layers.day.doorCode, snapshot.selectedEvidence.day.doorCode);
assert.equal(parsed.layers.hour.starCode, snapshot.selectedEvidence.hour.starCode);
assert.deepEqual(parsed.layers.month.conflictCodes, ["CENTER_LODGING_SOURCE_CONFLICT_DECLARED"]);
assert.deepEqual(parsed.layers.day.unavailableCodes, ["CONTEXT_VIGOR_NOT_DEFINED", "CONTEXT_CLASH_NOT_EVALUATED"]);
assert.deepEqual(parsed.layers.hour.explanationCodes, ["HOUR_SOLE_ACTION_AUTHORITY"]);
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
