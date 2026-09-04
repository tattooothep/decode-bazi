import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-three-layer-notification.cjs");
const manifest = require("../src/lib/qimen-canonical-source-manifest.cjs");
const seasonal = require("../src/lib/qimen-seasonal-vigor.cjs");
const oldFixture = require("./fixtures/qimen-three-layer-valid-snapshot-v3.cjs");
const v2Fixture = require("./fixtures/qimen-three-layer-valid-snapshot.cjs");
const fixture = require("./fixtures/qimen-three-layer-valid-snapshot-v4.cjs");
const detail = require("../src/lib/mobile-qimen-notification-detail.cjs");
const accountId = "00000000-0000-4000-8000-000000000001";
const historical = oldFixture.build(accountId);
assert.equal(typeof runtime.buildQimenThreeLayerSnapshotV4, "function", "V4 needs its own explicit snapshot contract");
assert.equal(manifest.loadCanonicalSourceManifest().layers.hour.calculationVersion, "QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_V1");
assert.equal(manifest.loadCanonicalSourceManifest({ schema: 4 }).layers.hour.calculationVersion, seasonal.SEASONAL_HOUR_CALCULATION_VERSION);
assert.equal(runtime.verifyQimenThreeLayerSnapshotV3(historical), true);

const methods = Object.keys(seasonal.DOOR_METHODS);
assert.equal(methods.length, 2);
assert.throws(() => fixture.build(accountId), /door_method_required/u);
assert.throws(() => fixture.build(accountId, "unknown"), /door_method_required/u);
const hash = (value: unknown) => createHash("sha256").update(runtime.canonicalStringify(value)).digest("hex");
function resign(value: any) {
  const { snapshotDigest: _digest, ...base } = value;
  value.snapshotDigest = hash(base);
  return value;
}
const legacyV2 = v2Fixture.build(accountId);
assert.equal(legacyV2.snapshotDigest, "982a0d63f93b801a3ef8c45af0f7c6133ec714c4b93f8b5fb683c4599b1727ca");
assert.equal(hash(legacyV2), "dcacd8dc9ddfea9cb68e33c9241a54c12eb890cf61b10081d465428cc3a4efa3");
assert.equal(historical.snapshotDigest, "4be262819a3b94f91a426db08eb99c6c5a49a98f536a26b092a997687eb939c5");
assert.equal(hash(historical), "1bc9e3b011827e5155f97682888c2a0596d751f2609d4f8e7a1b15d61d2ad248");
for (const schema of [2, 3]) {
  assert.equal(manifest.loadCanonicalSourceManifest({ schema }), manifest.loadCanonicalSourceManifest());
}
assert.throws(() => manifest.loadCanonicalSourceManifest({ schema: 5 }));
const currentManifest = manifest.loadCanonicalSourceManifest({ schema: 4 });
assert.equal(Object.isFrozen(currentManifest.layers.hour), true);
assert.deepEqual({ ...currentManifest.layers.hour, calculationVersion: historical.versionTuple.hour }, manifest.loadCanonicalSourceManifest().layers.hour);

let checkedPalaces = 0;
const fullSizes: number[] = [];
const compactSizes: number[] = [];
for (const method of methods) {
  const snapshot = fixture.build(accountId, method);
  assert.equal(snapshot.snapshotSchema, 4);
  assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(snapshot), true);
  assert.equal(runtime.verifyQimenThreeLayerSnapshotV3(snapshot), false);
  assert.equal(runtime.verifyQimenThreeLayerSnapshot(snapshot), false);
  assert.deepEqual(snapshot.sourceTuple, historical.sourceTuple, "external arrangement source pins are unchanged");
  assert.equal(Object.isFrozen(snapshot.layers.hour.contextEvidence), true);
  const evidence = snapshot.layers.hour.contextEvidence;
  assert.equal(Object.keys(evidence).length, 10);
  assert.equal(evidence.doorMethod, method);
  assert.equal(evidence.monthPillarZh, snapshot.layers.month.contextEvidence.monthPillarZh);
  assert.equal(evidence.monthValidFrom, snapshot.layers.month.validFrom);
  assert.equal(evidence.monthValidUntil, snapshot.layers.month.validUntil);
  assert.equal(evidence.monthBoundaryClock, snapshot.layers.month.boundaryEvidence.clock);
  for (const kind of ["month", "day"]) {
    for (const palace of snapshot.layers[kind].palaces) {
      assert.equal(palace.starVigor, null);
      assert.equal(palace.doorVigor, null);
    }
  }

  // Every branch, every star (including central Tian Qin), every door and both
  // explicitly named profiles. This is a synthetic contract matrix, not ephemeris evidence.
  for (const pillar of ["甲子", "乙丑", "丙寅", "丁卯", "戊辰", "己巳", "庚午", "辛未", "壬申", "癸酉", "甲戌", "乙亥"]) {
    const input = fixture.input(accountId, method);
    const pillars = { ...input.layers.month.contextEvidence, monthPillarZh: pillar };
    input.layers.month = fixture.contextLayer("month", input.layers.month.validFrom, input.layers.month.validUntil, pillars);
    input.layers.day = fixture.contextLayer("day", input.layers.day.validFrom, input.layers.day.validUntil, pillars);
    input.layers.hour.contextEvidence = seasonal.buildSeasonalVigorEvidence({
      monthPillarZh: pillar, monthBoundaryClock: seasonal.MONTH_BOUNDARY_CLOCK,
      monthValidFrom: input.layers.month.validFrom, monthValidUntil: input.layers.month.validUntil, doorMethod: method,
    });
    const maps = seasonal.separatedVigorForMonthPillar(pillar, method);
    for (const palace of input.layers.hour.palaces) {
      palace.starVigor = maps.star.byStarCode[palace.starCode];
      palace.doorVigor = palace.direction === "C" ? null : maps.door.byDoorCode[palace.doorCode];
    }
    const result = runtime.buildQimenThreeLayerSnapshotV4(input);
    assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(result), true);
    for (let index = 0; index < 9; index += 1) {
      const palace = result.layers.hour.palaces[index];
      assert.equal(palace.starVigor, maps.star.byStarCode[palace.starCode]);
      assert.equal(palace.doorVigor, palace.direction === "C" ? null : maps.door.byDoorCode[palace.doorCode]);
      for (const field of ["starVigor", "doorVigor"]) {
        const changed = structuredClone(result);
        changed.layers.hour.palaces[index][field] = palace[field] === "旺" ? "相" : "旺";
        assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(resign(changed)), false, `${method}/${pillar}/${index}/${field}`);
      }
      checkedPalaces += 1;
    }
  }

  const corruptions: Array<[string, (value: any) => void]> = [
    ["null evidence", s => { s.layers.hour.contextEvidence = null; }],
    ...Object.keys(evidence).map(key => [`evidence ${key}`, (s: any) => { s.layers.hour.contextEvidence[key] = "wrong"; }] as [string, (s: any) => void]),
    ["extra evidence key", s => { s.layers.hour.contextEvidence.extra = true; }],
    ["valid but different month", s => { s.layers.hour.contextEvidence.monthPillarZh = "丁酉"; }],
    ["valid but different lower bound", s => { s.layers.hour.contextEvidence.monthValidFrom = "2026-08-07T00:00:01.000Z"; }],
    ["valid but different upper bound", s => { s.layers.hour.contextEvidence.monthValidUntil = "2026-09-07T00:00:01.000Z"; }],
    ["other profile without changed states", s => {
      const other = methods.find(candidate => candidate !== method)!;
      s.layers.hour.contextEvidence.doorMethod = other;
      s.layers.hour.contextEvidence.doorProvenance = seasonal.DOOR_METHODS[other].provenance;
    }],
    ["hour old calculation", s => { s.layers.hour.calculationVersion = historical.versionTuple.hour; }],
    ["old version tuple", s => { s.versionTuple.hour = historical.versionTuple.hour; }],
    ["changed engine source", s => { s.sourceTuple.hour.engineSourceDigest = "a".repeat(64); }],
    ["unknown source key", s => { s.sourceTuple.hour.classifier = evidence.starMethod; }],
    ["month vigor invented", s => { s.layers.month.palaces[0].starVigor = "旺"; }],
    ["day vigor invented", s => { s.layers.day.palaces[0].doorVigor = "旺"; }],
    ["month subject metadata conflict", s => { s.layers.month.contextEvidence.monthPillarZh = "戊申"; s.layers.hour.contextEvidence.monthPillarZh = "戊申"; s.layers.day.contextEvidence.monthPillarZh = "戊申"; }],
    ["day subject metadata conflict", s => { s.layers.day.contextEvidence.dayPillarZh = "己卯"; }],
    ["day seasonal month mismatch", s => { s.layers.day.contextEvidence.monthPillarZh = "戊申"; }],
    ["wrong intrinsic quality", s => { s.layers.hour.palaces[0].starBaseQuality = "unavailable"; }],
    ["unknown palace field", s => { s.layers.hour.palaces[0].season = "autumn"; }],
  ];
  for (const [label, mutate] of corruptions) {
    const changed = structuredClone(snapshot);
    mutate(changed);
    assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(resign(changed)), false, label);
  }
  for (const [from, until] of [
    ["2026-08-21T14:00:00.000Z", "2026-08-21T15:29:59.999Z"],
    ["2026-08-21T14:00:00.000Z", "2026-08-21T16:30:00.001Z"],
    ["2026-09-06T23:00:00.000Z", "2026-09-07T01:00:00.000Z"],
    ["2026-08-21T23:00:00.000Z", "2026-08-22T01:00:00.000Z"],
  ]) {
    const input = fixture.input(accountId, method);
    input.layers.hour.validFrom = from; input.layers.hour.validUntil = until; input.createdAt = from;
    assert.throws(() => runtime.buildQimenThreeLayerSnapshotV4(input), /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u);
  }
  // Isolate the month containment guard: the synthetic day fully contains the
  // hour, while the hour crosses one of the fixture's actual pinned Jie bounds.
  for (const boundary of [snapshot.layers.month.validFrom, snapshot.layers.month.validUntil]) {
    const input = fixture.input(accountId, method);
    const at = Date.parse(boundary);
    input.layers.hour.validFrom = new Date(at - 60 * 60_000).toISOString();
    input.layers.hour.validUntil = new Date(at + 60 * 60_000).toISOString();
    input.layers.day.validFrom = new Date(at - 12 * 60 * 60_000).toISOString();
    input.layers.day.validUntil = new Date(at + 12 * 60 * 60_000).toISOString();
    input.createdAt = input.layers.hour.validFrom;
    assert.throws(() => runtime.buildQimenThreeLayerSnapshotV4(input), /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u);
  }
  for (const minutes of [90, 150]) {
    const input = fixture.input(accountId, method);
    input.layers.hour.validUntil = new Date(Date.parse(input.layers.hour.validFrom) + minutes * 60_000).toISOString();
    assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(runtime.buildQimenThreeLayerSnapshotV4(input)), true);
  }

  const provider = runtime.buildQimenV4ProviderData(snapshot);
  assert.deepEqual(Object.keys(provider), ["qimenV4"]);
  const compact = runtime.parseQimenV4ProviderData(provider);
  assert.equal(compact.v, 4);
  assert.equal(compact.snapshotDigest, snapshot.snapshotDigest);
  assert.equal(compact.layers.hour.version, seasonal.SEASONAL_HOUR_CALCULATION_VERSION);
  assert.deepEqual(compact, JSON.parse(provider.qimenV4));
  assert.equal(Object.isFrozen(compact.layers.hour), true);
  assert.equal("starVigor" in compact.layers.hour, false, "full-only evidence is bound by immutable digest");
  assert.throws(() => runtime.parseQimenV3ProviderData({ qimenV3: provider.qimenV4 }));
  assert.throws(() => runtime.buildQimenV3ProviderData(snapshot));
  assert.throws(() => runtime.buildQimenV4ProviderData(historical));
  assert.throws(() => runtime.parseQimenV4ProviderData({ qimenV4: runtime.buildQimenV3ProviderData(historical).qimenV3 }));
  for (const wire of [
    ` ${provider.qimenV4}`, `${provider.qimenV4}\n`, "x".repeat(3500), "{", 
    provider.qimenV4.replace(/^\{/u, '{"v":4,'),
    provider.qimenV4.replace(/^\{/u, '{"\\u0076":4,'),
    provider.qimenV4.replace('"v":4', '"v":3'),
    provider.qimenV4.replace(seasonal.SEASONAL_HOUR_CALCULATION_VERSION, historical.versionTuple.hour),
    provider.qimenV4.replace('"starBaseQuality":"severe"', '"starBaseQuality":"unavailable"'),
  ]) assert.throws(() => runtime.parseQimenV4ProviderData({ qimenV4: wire }), /QIMEN_V4_PROVIDER_PAYLOAD_INVALID/u);
  assert.throws(() => runtime.parseQimenV4ProviderData({ ...provider, qimenV3: provider.qimenV4 }));
  assert.throws(() => runtime.parseQimenV4ProviderData(Object.assign(Object.create({ inherited: true }), provider)));
  for (const mutate of [
    (s: any) => { s.extra = true; },
    (s: any) => { s.layers.hour.extra = true; },
    (s: any) => { s.layers.hour.explanationCodes = ["HOUR_SOLE_ACTION_AUTHORITY", "HOUR_SOLE_ACTION_AUTHORITY"]; },
    (s: any) => { s.snapshotDigest = "0".repeat(64); },
    (s: any) => { s.hourEnd = s.hourStart; },
    (s: any) => { s.layers.hour.starCode = "tian_rui"; },
  ]) {
    const changed = structuredClone(compact); mutate(changed);
    assert.throws(() => runtime.parseQimenV4ProviderData({ qimenV4: runtime.canonicalStringify(changed) }));
  }
  let accessorCalls = 0;
  const outer = Object.defineProperty({}, "qimenV4", { enumerable: true, get() { accessorCalls += 1; return provider.qimenV4; } });
  assert.throws(() => runtime.parseQimenV4ProviderData(outer));
  const hostile = structuredClone(snapshot);
  Object.defineProperty(hostile.layers.hour.contextEvidence, "doorMethod", { enumerable: true, get() { accessorCalls += 1; return method; } });
  assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(hostile), false);
  assert.equal(accessorCalls, 0);
  for (const mutate of [
    (s: any) => { s.layers.hour.palaces.extra = true; },
    (s: any) => { delete s.layers.hour.palaces[0]; },
    (s: any) => { Object.setPrototypeOf(s.layers.hour.contextEvidence, { inherited: true }); },
    (s: any) => { s.layers.hour.contextEvidence.self = s; },
  ]) {
    const changed = structuredClone(snapshot); mutate(changed);
    assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(changed), false);
  }

  const notificationId = "11111111-1111-4111-8111-111111111111";
  const row = { notification_id: notificationId, snapshot, snapshot_digest: snapshot.snapshotDigest };
  const db = { query: async (sql: string, args: string[]) => {
    assert.match(sql, /l\.user_id=\$2 AND o\.user_id=\$2/u);
    assert.deepEqual(args, [notificationId, accountId]); return { rows: [row] };
  } };
  assert.deepEqual(await detail.readQimenNotificationDetail(db, accountId, notificationId), { notificationId, snapshot });
  for (const bad of [
    { ...row, snapshot_digest: "a".repeat(64) },
    { ...row, snapshot: fixture.build("00000000-0000-4000-8000-000000000002", method) },
  ]) await assert.rejects(detail.readQimenNotificationDetail({ query: async () => ({ rows: [bad] }) }, accountId, notificationId), /qimen_notification_snapshot_invalid/u);
  fullSizes.push(Buffer.byteLength(runtime.canonicalStringify(snapshot)));
  compactSizes.push(Buffer.byteLength(provider.qimenV4));
}
assert.notEqual(fixture.build(accountId, methods[0]).snapshotDigest, fixture.build(accountId, methods[1]).snapshotDigest);
for (const [snapshot, verify] of [[legacyV2, runtime.verifyQimenThreeLayerSnapshot], [historical, runtime.verifyQimenThreeLayerSnapshotV3]]) {
  const changed = structuredClone(snapshot); changed.layers.hour.palaces[0].starVigor = "廢";
  assert.equal(verify(resign(changed)), false, "historical vocabularies remain frozen even with a correct new digest");
  const evidence = structuredClone(snapshot); evidence.layers.hour.contextEvidence = fixture.build(accountId, methods[0]).layers.hour.contextEvidence;
  assert.equal(verify(resign(evidence)), false, "historical hour evidence stays null");
}
console.log(JSON.stringify({ result: "qimen V4 contract passed", profiles: methods.length, branchCases: 24, checkedPalaces, fullSizes, compactSizes }));
