import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const backendRoot = resolve(import.meta.dirname, "..");
const mobileRoot = resolve(process.env.QIMEN_MOBILE_ROOT || "/root/worktrees/zibai-three-layer-mobile");
const expectedMobileCommit = "b97fc3a02c5f2fa18f5298b1dff6d189851fc278";

assert.equal(
  execFileSync("git", ["-C", mobileRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  expectedMobileCommit,
  "the transport regression must execute the parser embedded in the installed v223 APK",
);

const push = require(resolve(backendRoot, "src/lib/push-send.cjs"));
const qimen = require(resolve(backendRoot, "src/lib/qimen-three-layer-notification.cjs"));
const v2Fixture = require(resolve(backendRoot, "scripts/fixtures/qimen-three-layer-valid-snapshot.cjs"));
const v3Fixture = require(resolve(backendRoot, "scripts/fixtures/qimen-three-layer-valid-snapshot-v3.cjs"));
const mobile = await import(pathToFileURL(resolve(mobileRoot, "src/qimen/notificationContract.ts")).href);

const accountId = "11111111-1111-4111-8111-111111111111";
const notificationId = "33333333-3333-4333-8333-333333333333";
const route = "/qimen/notification-detail";

for (const testCase of [
  {
    schema: 2,
    snapshot: v2Fixture.build(accountId),
    provider: qimen.buildQimenV2ProviderData,
    parser: mobile.parseQimenV2ProviderPayload,
    key: "qimenV2",
  },
  {
    schema: 3,
    snapshot: v3Fixture.build(accountId),
    provider: qimen.buildQimenV3ProviderData,
    parser: mobile.parseQimenV3ProviderPayload,
    key: "qimenV3",
  },
] as const) {
  const canonical = testCase.provider(testCase.snapshot);
  const data = { ...canonical, notificationId };
  for (const transport of ["fcm", "expo"] as const) {
    const prepared = push.prepareMessage({
      title: `Qimen v${testCase.schema}`,
      body: "transport contract",
      category: "qimen",
      url: route,
      data,
    }, transport);
    const actual = transport === "fcm" ? JSON.parse(prepared.data.body) : prepared.data;
    assert.deepEqual(
      Object.keys(actual).sort(),
      [testCase.key, "notificationId"].sort(),
      `Qimen v${testCase.schema} ${transport} must not add a parallel outer route key`,
    );
    assert.equal(actual[testCase.key], canonical[testCase.key], "canonical compact bytes must remain unchanged");
    const compact = testCase.parser(actual, accountId);
    assert.ok(compact, `installed v223 must accept Qimen v${testCase.schema} ${transport} provider data`);
    const full = mobile.parseQimenFullSnapshot(testCase.snapshot, compact);
    assert.ok(full, `installed v223 must bind Qimen v${testCase.schema} ${transport} to the full snapshot`);
    assert.equal(full.snapshotDigest, testCase.snapshot.snapshotDigest, "science snapshot digest must remain unchanged");
    assert.deepEqual(Object.keys(full.layers), ["month", "day", "hour"]);
    assert.deepEqual(Object.values(full.layers).map((layer: { palaces: readonly unknown[] }) => layer.palaces.length), [9, 9, 9]);
    assert.equal(
      testCase.parser({ ...actual, extra: "must-fail-closed" }, accountId),
      null,
      `Qimen v${testCase.schema} ${transport} must still reject unknown outer keys`,
    );
  }
}

for (const transport of ["fcm", "expo"] as const) {
  const prepared = push.prepareMessage({
    title: "ordinary route",
    body: "must keep generic navigation",
    category: "daily",
    url: "/today",
    data: { kind: "daily" },
  }, transport);
  const actual = transport === "fcm" ? JSON.parse(prepared.data.body) : prepared.data;
  assert.equal(actual.url, "/today", `ordinary ${transport} notifications must retain the transport route`);
}

console.log("QIMEN_V223_TRANSPORT_CONTRACT_OK schemas=2+3 providers=fcm+expo layers=3x9");
