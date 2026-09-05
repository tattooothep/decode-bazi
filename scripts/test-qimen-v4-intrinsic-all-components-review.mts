import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire, Module, stripTypeScriptTypes } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Independent synthetic contract review, not an engine calculation or delivery.
// Only local modules and read-only `git show` are used. No DB or engine imports.
// Run: node --experimental-strip-types scripts/test-qimen-v4-intrinsic-all-components-review.mts
// Optional: QIMEN_MOBILE_ROOT=/path/to/hourkey-mobile node --experimental-strip-types ...
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error("qimen_intrinsic_review_network_tripwire");
};

const backend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobile = resolve(process.env.QIMEN_MOBILE_ROOT || "/root/worktrees/hourkey-mobile-zibai-v3-p0");
const require = createRequire(import.meta.url);
const runtimePath = resolve(backend, "src/lib/qimen-three-layer-notification.cjs");
const mobilePath = resolve(mobile, "src/qimen/notificationContract.ts");
const runtime = require(runtimePath);
const fixture = require("./fixtures/qimen-three-layer-valid-snapshot-v4.cjs");
const seasonal = require("../src/lib/qimen-seasonal-vigor.cjs");
const catalog = require("../src/lib/qimen-component-catalog.cjs");
const detail = require("../src/lib/mobile-qimen-notification-detail.cjs");

// Freeze the pre-fix verifier logic in memory. Never restore working files,
// move HEAD/index, or invoke an old engine to create the RED comparison.
const backendBaseline = "9b2cfbf";
const mobileBaseline = "dad3b564";
const oldBackendSource = execFileSync("git", ["show", `${backendBaseline}:src/lib/qimen-three-layer-notification.cjs`], {
  cwd: backend, encoding: "utf8",
});
const oldModule = new Module(runtimePath);
oldModule.filename = runtimePath;
oldModule.require = createRequire(runtimePath);
(oldModule as any)._compile(oldBackendSource, runtimePath);
const oldRuntime = oldModule.exports;
const currentMobile = await import(pathToFileURL(mobilePath).href);
const oldMobileSource = execFileSync("git", ["show", `${mobileBaseline}:src/qimen/notificationContract.ts`], {
  cwd: mobile, encoding: "utf8",
});
const oldMobileImports = oldMobileSource
  .replace('"./componentPresentation.ts"', JSON.stringify(pathToFileURL(resolve(mobile, "src/qimen/componentPresentation.ts")).href))
  .replace('"../notifications/strictJson.ts"', JSON.stringify(pathToFileURL(resolve(mobile, "src/notifications/strictJson.ts")).href));
const oldMobile = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(oldMobileImports)).toString("base64")}`);

const account = "22222222-2222-4222-8222-222222222222";
const notificationId = "11111111-1111-4111-8111-111111111111";
const methods = ["STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1", "TONGZONG_DARK_RESIDUAL_QI_DOOR_MONTH_V1"];
const kinds = ["deity", "door", "star"] as const;
type Kind = typeof kinds[number];
let invalidPairs = 0;
let oldAccepted = 0;
let validPairs = 0;
let detailRejections = 0;
let publicBuildRejections = 0;
let legacyChecks = 0;
let badContextControls = 0;
const rejectedLabels: string[] = [];

function inputFor(method: string, pillar: string, target: Record<Kind, string>) {
  const input = fixture.input(account, method);
  const pillars = { ...input.layers.month.contextEvidence, monthPillarZh: pillar };
  for (const kind of ["month", "day"]) {
    input.layers[kind] = fixture.contextLayer(kind, input.layers[kind].validFrom, input.layers[kind].validUntil, pillars);
  }
  input.layers.hour.contextEvidence = seasonal.buildSeasonalVigorEvidence({
    monthPillarZh: pillar, monthBoundaryClock: seasonal.MONTH_BOUNDARY_CLOCK,
    monthValidFrom: input.layers.month.validFrom, monthValidUntil: input.layers.month.validUntil, doorMethod: method,
  });
  const maps = seasonal.separatedVigorForMonthPillar(pillar, method);
  for (const palace of input.layers.hour.palaces) {
    palace.starVigor = maps.star.byStarCode[palace.starCode];
    palace.doorVigor = palace.direction === "C" ? null : maps.door.byDoorCode[palace.doorCode];
  }
  const outer = input.layers.hour.palaces.filter((palace: any) => palace.direction !== "C");
  const selected = outer[0];
  for (const kind of kinds) {
    const code = target[kind];
    const donor = outer.find((palace: any) => palace[`${kind}Code`] === code);
    const entry = catalog.CATALOG[kind][code];
    const fields = [`${kind}Code`, `${kind}Zh`, ...(kind === "deity" ? [] : [`${kind}Vigor`])];
    if (donor) {
      // Complete code/name/seasonal tuples move together; never forge a vigor.
      for (const field of fields) [selected[field], donor[field]] = [donor[field], selected[field]];
    } else {
      // Bai Hu is absent in this synthetic eight-deity arrangement. Replace
      // one deity by its complete, unused canonical tuple, preserving uniqueness.
      assert.equal(kind, "deity");
      assert.equal(code, "BAI_HU");
      selected.deityCode = entry.code;
      selected.deityZh = entry.zh;
    }
  }
  input.selectedDirection = input.hourDecision.direction = selected.direction;
  assert.ok(["旺", "相"].includes(selected.starVigor), "attack must have a genuinely supporting star");
  assert.ok(["旺", "相"].includes(selected.doorVigor), "attack must have a genuinely supporting door");
  return input;
}

function fullFor(input: any, reasons: string[]) {
  input.hourDecision.reasonCodes = reasons;
  return oldRuntime.buildQimenThreeLayerSnapshotV4(input);
}

function rebind(full: any, reasons: string[]) {
  const changed = structuredClone(full);
  changed.hourDecision.reasonCodes = reasons;
  const { snapshotDigest: _old, ...unsigned } = changed;
  changed.snapshotDigest = createHash("sha256").update(runtime.canonicalStringify(unsigned)).digest("hex");
  return changed;
}

function compactFor(full: any) {
  // The unchanged three-warning-cap negative is already rejected by the old
  // provider builder. Bind it from an accepted compact control; compact wire
  // carries no reason codes, so only its digest changes with these reasons.
  const control = oldRuntime.verifyQimenThreeLayerSnapshotV4(full) ? full : rebind(full, ["hour_good"]);
  const compact = currentMobile.parseQimenV4ProviderPayload({
    ...oldRuntime.buildQimenV4ProviderData(control), notificationId,
  }, account);
  assert.ok(compact);
  return { ...compact, snapshotDigest: full.snapshotDigest };
}

async function rejects(full: any, label: string, wasAccepted = true) {
  const compact = compactFor(full);
  assert.equal(oldRuntime.verifyQimenThreeLayerSnapshotV4(full), wasAccepted, `${label}: baseline backend`);
  assert.equal(Boolean(oldMobile.parseQimenFullSnapshot(full, compact)), wasAccepted, `${label}: baseline mobile`);
  if (wasAccepted) oldAccepted += 2;
  assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(full), false, `${label}: backend rejects`);
  assert.equal(currentMobile.parseQimenFullSnapshot(full, compact), null, `${label}: mobile rejects`);
  invalidPairs += 1;
  rejectedLabels.push(label);
  assert.throws(() => runtime.buildQimenV4ProviderData(full), /QIMEN_V4_PROVIDER_PAYLOAD_INVALID/u);
  publicBuildRejections += 1;
  // Exercise the public detail helper with an inert query double, not a DB.
  await assert.rejects(detail.readQimenNotificationDetail({
    query: async () => ({ rows: [{ snapshot: full, snapshot_digest: full.snapshotDigest, notification_id: notificationId }] }),
  }, account, notificationId), /qimen_notification_snapshot_invalid/u);
  detailRejections += 1;
  for (const v of [2, 3]) {
    assert.equal(currentMobile.parseQimenFullSnapshot(full, { ...compact, v }), null, `${label}: no historical downgrade`);
  }
}

function accepts(full: any, label: string) {
  const compact = compactFor(full);
  assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(full), true, label);
  assert.ok(currentMobile.parseQimenFullSnapshot(full, compact), label);
  validPairs += 1;
}

for (const method of methods) {
  // Independent literal targets: each is bad, not severe, and the expected
  // warning is supplied literally by component kind, never by fixture policy.
  for (const [kind, code] of [["deity", "TENG_SHE"], ["door", "JING_FEAR_MEN"], ["star", "TIAN_ZHU"]] as const) {
    const input = inputFor(method, "壬申", { deity: "ZHI_FU", door: "KAI_MEN", star: "TIAN_REN", [kind]: code });
    const exact = `hour_warning_INTRINSIC_${kind.toUpperCase()}_BAD`;
    const full = fullFor(input, ["hour_conditional_good", "hour_reading_caution", exact]);
    accepts(full, `${method}/${kind}: exact warning`);
    for (const [label, reasons] of [
      ["missing", ["hour_conditional_good", "hour_reading_caution"]],
      ["false-clear", ["hour_clear_good", "hour_reading_suitable"]],
      ["legacy-hidden", ["hour_good"]],
      ["wrong-component", ["hour_conditional_good", "hour_reading_caution", `hour_warning_INTRINSIC_${kind === "door" ? "STAR" : "DOOR"}_BAD`]],
      ["invented-extra", ["hour_conditional_good", "hour_reading_caution", exact, "hour_warning_INTRINSIC_UNLISTED_BAD"]],
    ] as const) {
      await rejects(rebind(full, [...reasons]), `${method}/${kind}/${label}`);
    }
    accepts(rebind(full, ["hour_conditional_good", "hour_reading_caution", "hour_warning_KONG_WANG", exact]),
      `${method}/${kind}: preserve reordered other warning`);
  }
  for (const [kind, code] of [["deity", "BAI_HU"], ["door", "SI_MEN"], ["star", "TIAN_RUI"]] as const) {
    const input = inputFor(method, kind === "deity" ? "壬申" : "乙丑", {
      deity: "ZHI_FU", door: kind === "deity" ? "KAI_MEN" : "SHENG_MEN", star: "TIAN_REN", [kind]: code,
    });
    await rejects(fullFor(input, ["hour_clear_good", "hour_reading_suitable"]), `${method}/${kind}/severe`);
  }
  const pairInput = inputFor(method, "壬申", { deity: "ZHI_FU", door: "JING_FEAR_MEN", star: "TIAN_ZHU" });
  const reasons = ["hour_conditional_good", "hour_reading_caution", "hour_warning_INTRINSIC_STAR_BAD", "hour_warning_INTRINSIC_DOOR_BAD"];
  const pair = fullFor(pairInput, reasons);
  accepts(pair, `${method}: two exact intrinsic warnings`);
  for (const omitted of [2, 3]) {
    await rejects(rebind(pair, reasons.filter((_, index) => index !== omitted)), `${method}/two-intrinsics/omit-${omitted}`);
  }
  const cleanInput = inputFor(method, "壬申", { deity: "ZHI_FU", door: "KAI_MEN", star: "TIAN_REN" });
  const clean = fullFor(cleanInput, ["hour_clear_good", "hour_reading_suitable"]);
  accepts(clean, `${method}: clear control`);
  if (["month", "day"].some(kind => Object.values(clean.selectedEvidence[kind])
    .some(value => value === "severe" || value === "inauspicious"))) badContextControls += 1;
  await rejects(rebind(clean, ["hour_conditional_good", "hour_reading_caution", "hour_warning_INTRINSIC_DEITY_BAD"]),
    `${method}/clear/invented-intrinsic`);
  accepts(rebind(clean, ["hour_conditional_good", "hour_reading_caution", "hour_warning_KONG_WANG", "hour_warning_YI_MA"]),
    `${method}: two external warnings`);
  await rejects(rebind(clean, ["hour_conditional_good", "hour_reading_caution", "hour_warning_KONG_WANG", "hour_warning_YI_MA", "hour_warning_XING"]),
    `${method}/unchanged-two-warning-cap`, false);
}

for (const schema of [2, 3]) {
  const historicalFixture = require(`./fixtures/qimen-three-layer-valid-snapshot${schema === 2 ? "" : "-v3"}.cjs`);
  const suffix = schema === 2 ? "" : "V3";
  const full = oldRuntime[`buildQimenThreeLayerSnapshot${suffix}`](historicalFixture.input(account));
  assert.equal(runtime.canonicalStringify(runtime[`buildQimenThreeLayerSnapshot${suffix}`](historicalFixture.input(account))),
    runtime.canonicalStringify(full), `V${schema}: canonical bytes unchanged`);
  assert.deepEqual(runtime[`buildQimenV${schema}ProviderData`](full), oldRuntime[`buildQimenV${schema}ProviderData`](full),
    `V${schema}: compact bytes unchanged`);
  const compact = currentMobile[`parseQimenV${schema}ProviderPayload`]({
    ...runtime[`buildQimenV${schema}ProviderData`](full), notificationId,
  }, account);
  assert.ok(compact);
  assert.deepEqual(currentMobile.parseQimenFullSnapshot(full, compact), oldMobile.parseQimenFullSnapshot(full, compact),
    `V${schema}: historical parser output unchanged`);
  legacyChecks += 3;
}

assert.equal(oldAccepted, 84);
assert.equal(invalidPairs, 44);
assert.equal(validPairs, 18);
assert.equal(publicBuildRejections, 44);
assert.equal(detailRejections, 44);
assert.equal(legacyChecks, 6);
assert.equal(badContextControls, 2, "harmful context must remain inspectable without becoming an hour-action gate");
assert.equal(fetchCalls, 0);
assert.equal(Object.keys(require.cache).some(path => /[/\\]qimen-api[/\\]/u.test(path)), false, "no external engine or SQLite module import");
const sha256 = (source: string) => createHash("sha256").update(source).digest("hex");
console.log(JSON.stringify({
  review: "independent_complete_tuple_intrinsic_matrix",
  verdict: "APPROVED_BOUNDED_GUARD_NOT_RELEASE_OR_GOAL_SIGNATURE",
  backendBaseline, mobileBaseline,
  backendSourceSha256: sha256(readFileSync(runtimePath, "utf8")),
  mobileSourceSha256: sha256(readFileSync(mobilePath, "utf8")),
  oldInvalidAccepted: oldAccepted, newInvalidAccepted: 0,
  invalidPairs, validPairs, publicBuildRejections, detailRejections,
  legacyChecks, badContextControls, fetchCalls, rejectedLabels,
}, null, 2));
