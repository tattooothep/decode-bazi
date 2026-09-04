import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-three-layer-notification.cjs");
const fixture = require("./fixtures/qimen-three-layer-valid-snapshot-v4.cjs");
const account = "00000000-0000-4000-8000-000000000001";
const methods = ["STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1", "TONGZONG_DARK_RESIDUAL_QI_DOOR_MONTH_V1"];
const failures: string[] = [];
let checks = 0;
function check(label: string, run: () => void) {
  checks++;
  try { run(); } catch (error) { failures.push(`${label}: ${(error as Error).message}`); }
}
const hash = (value: unknown) => createHash("sha256").update(runtime.canonicalStringify(value)).digest("hex");
function resign(value: any) {
  const { snapshotDigest: _old, ...base } = value;
  value.snapshotDigest = hash(base);
  return value;
}
function select(value: any, direction: string) {
  value.selectedDirection = direction;
  value.hourDecision.direction = direction;
  if (value.selectedEvidence) for (const kind of ["month", "day", "hour"]) {
    const palace = value.layers[kind].palaces.find((p: any) => p.direction === direction);
    for (const key of Object.keys(value.selectedEvidence[kind])) value.selectedEvidence[kind][key] = palace[key];
  }
  return value;
}

// Compare to actual pre-V4 source, not an author-supplied digest assertion.
function historicalModule(relative: string, overrides: Record<string, any> = {}) {
  const filename = fileURLToPath(new URL(`../${relative}`, import.meta.url));
  const source = execFileSync("git", ["show", `919e56a^:${relative}`], { encoding: "utf8" });
  const mod = new Module(filename);
  mod.filename = filename;
  const localRequire = createRequire(filename);
  mod.require = ((id: string) => overrides[id] ?? localRequire(id)) as typeof mod.require;
  (mod as any)._compile(source, filename);
  return mod.exports;
}
const oldManifest = historicalModule("src/lib/qimen-canonical-source-manifest.cjs");
const oldRuntime = historicalModule("src/lib/qimen-three-layer-notification.cjs", {
  "./qimen-canonical-source-manifest.cjs": oldManifest,
});
for (const schema of [2, 3]) {
  const suffix = schema === 2 ? "" : "V3";
  const oldFixture = require(`./fixtures/qimen-three-layer-valid-snapshot${schema === 2 ? "" : "-v3"}.cjs`);
  const historical = oldRuntime[`buildQimenThreeLayerSnapshot${suffix}`](oldFixture.input(account));
  check(`V${schema} complete canonical bytes unchanged`, () => assert.equal(
    runtime.canonicalStringify(oldFixture.build(account)), oldRuntime.canonicalStringify(historical)));
  check(`V${schema} compact bytes unchanged`, () => assert.deepEqual(
    runtime[`buildQimenV${schema}ProviderData`](historical), oldRuntime[`buildQimenV${schema}ProviderData`](historical)));
  check(`V${schema} old reader still accepts history`, () => assert.equal(runtime[`verifyQimenThreeLayerSnapshot${suffix}`](historical), true));
}

for (const method of methods) {
  const input = fixture.input(account, method);
  // Independent literal oracle for the fixture's 申 (metal) month.
  const starStates: Record<string, string> = { TIAN_RUI: "旺", TIAN_QIN: "旺", TIAN_REN: "旺", TIAN_XIN: "相", TIAN_ZHU: "相", TIAN_YING: "休", TIAN_CHONG: "囚", TIAN_FU: "囚", TIAN_PENG: "廢" };
  const doorStates: Record<string, string> = method === methods[0]
    ? { KAI_MEN: "旺", JING_FEAR_MEN: "旺", XIU_MEN: "相", SHENG_MEN: "休", SI_MEN: "休", JING_VIEW_MEN: "囚", DU_MEN: "死", SHANG_MEN: "死" }
    : { KAI_MEN: "旺", JING_FEAR_MEN: "旺", SHENG_MEN: "相", SI_MEN: "相", JING_VIEW_MEN: "休", DU_MEN: "囚", SHANG_MEN: "囚", XIU_MEN: "廢" };
  check(`${method} independent month oracle`, () => {
    assert.equal(input.layers.hour.contextEvidence.monthPillarZh[1], "申");
    for (const p of input.layers.hour.palaces) {
      assert.equal(p.starVigor, starStates[p.starCode]);
      assert.equal(p.doorVigor, p.direction === "C" ? null : doorStates[p.doorCode]);
    }
  });
  const good = method === methods[0] ? "W" : "SE";
  const full = runtime.buildQimenThreeLayerSnapshotV4(select(input, good));
  const provider = runtime.buildQimenV4ProviderData(full);
  check(`${method} supportive control`, () => assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(full), true));
  check(`${method} compact route and bytes`, () => {
    assert.equal(runtime.parseQimenV4ProviderData(provider).url, "/qimen/notification-detail");
    assert.ok(Buffer.byteLength(provider.qimenV4) < 3500);
  });
  check(`${method} reject non-travel builder`, () => {
    const changed = select(fixture.input(account, method), good);
    changed.purpose = changed.hourDecision.purpose = "wealth";
    assert.throws(() => runtime.buildQimenThreeLayerSnapshotV4(changed));
  });
  check(`${method} reject re-signed non-travel full`, () => {
    const changed = structuredClone(full); changed.purpose = changed.hourDecision.purpose = "wealth";
    assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(resign(changed)), false);
  });
  check(`${method} reject non-travel compact`, () => {
    const changed = JSON.parse(provider.qimenV4); changed.purpose = "wealth";
    assert.throws(() => runtime.parseQimenV4ProviderData({ qimenV4: runtime.canonicalStringify(changed) }));
  });
  for (const direction of ["N", "S", "SW"]) {
    check(`${method}/${direction} reject weak selected builder`, () => assert.throws(() =>
      runtime.buildQimenThreeLayerSnapshotV4(select(fixture.input(account, method), direction))));
    check(`${method}/${direction} reject re-signed weak selected full`, () => assert.equal(
      runtime.verifyQimenThreeLayerSnapshotV4(resign(select(structuredClone(full), direction))), false));
  }
  for (const path of [[], ["layers", "hour", "contextEvidence"], ["layers", "hour", "palaces", 0], ["selectedEvidence", "hour"]]) {
    for (const attack of ["symbol", "prototype", "accessor"]) {
      check(`${method}/${path.join(".")}/${attack}`, () => {
        const changed = structuredClone(full);
        const record = path.reduce((v: any, key: any) => v[key], changed);
        let calls = 0;
        if (attack === "symbol") record[Symbol("unexpected")] = true;
        if (attack === "prototype") Object.setPrototypeOf(record, { inherited: true });
        if (attack === "accessor") {
          const key = Object.keys(record)[0];
          Object.defineProperty(record, key, { enumerable: true, get() { calls++; throw new Error("getter executed"); } });
        }
        assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(changed), false);
        assert.equal(calls, 0);
      });
    }
  }
  for (const key of ["qimenV2", "qimenV3", "notificationId"]) check(`${method} mixed outer ${key}`, () =>
    assert.throws(() => runtime.parseQimenV4ProviderData({ ...provider, [key]: "unexpected" })));
  for (const field of ["earthInstrument", "heavenInstrument", "starCode", "doorCode", "deityCode"]) {
    check(`${method} re-signed duplicate ${field}`, () => {
      const changed = structuredClone(full);
      const a = changed.layers.hour.palaces[1]; const b = changed.layers.hour.palaces[2];
      if (field.endsWith("Code")) {
        const prefix = field.slice(0, -4);
        for (const key of Object.keys(a).filter(k => k.startsWith(prefix))) a[key] = b[key];
      } else a[field] = b[field];
      assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(resign(changed)), false);
    });
  }
}
console.log(JSON.stringify({ checks, failures }, null, 2));
assert.equal(failures.length, 0, "Independent V4 contract review regressions must all pass");
