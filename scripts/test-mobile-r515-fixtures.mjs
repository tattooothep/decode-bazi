#!/usr/bin/env node

import assert from "node:assert/strict";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIXTURE_SPECS,
  SYNTHETIC_REPLY,
  buildFixtureSet,
  canonicalJson,
  scanFixturePrivacy,
  sha256,
  validateFixture,
  validateFixtureSet,
} from "./lib/mobile-r515-fixture-contract.mjs";
import { buildMobileR515Fixtures } from "./build-mobile-r515-fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMITTED_ROOT = path.join(ROOT, "test-fixtures/mobile-r515");
const PRIVACY_ONLY = process.argv.includes("--privacy-only");
const EXPECTED_FILENAMES = [
  "today.sanitized.json",
  "today-hours.sanitized.json",
  "today-directions.sanitized.json",
  "today-goals.sanitized.json",
  "chart.sanitized.json",
  "calendar.sanitized.json",
  "network.sanitized.json",
  "network-sifu.sanitized.json",
  "network-bulk.sanitized.json",
  "qimen-basic.sanitized.json",
  "qimen-professional.sanitized.json",
  "qimen-search.sanitized.json",
  "qimen-sifu.sanitized.json",
  "datepick.sanitized.json",
  "datepick-save.sanitized.json",
  "datepick-saved.sanitized.json",
  "datepick-delete.sanitized.json",
  "luopan-rings.sanitized.json",
  "luopan-bootstrap.sanitized.json",
  "luopan-rings-w4.sanitized.json",
  "luopan-analysis.sanitized.json",
  "luopan-snapshot.sanitized.json",
  "luopan-measurements-get.sanitized.json",
  "luopan-measurements-post.sanitized.json",
  "luopan-sifu.sanitized.json",
  "luopan-vision.sanitized.json",
  "sifu-chat.sanitized.json",
  "sifu-chat-stream.sanitized.json",
  "sifu-history.sanitized.json",
  "sifu-group.sanitized.json",
];
const EXPECTED_ENTRIES = [...EXPECTED_FILENAMES, "README.md", "manifest.json"].sort();

let passed = 0;

function check(label, condition) {
  assert.ok(condition, label);
  passed += 1;
  console.log(`PASS ${label}`);
}

function equal(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  passed += 1;
  console.log(`PASS ${label}`);
}

function throws(label, callback, expected) {
  assert.throws(callback, expected, label);
  passed += 1;
  console.log(`PASS ${label}`);
}

function parseFixtureDirectory(root) {
  return Object.fromEntries(FIXTURE_SPECS.map((spec) => [
    spec.key,
    JSON.parse(readFileSync(path.join(root, spec.filename), "utf8")),
  ]));
}

function verifyFixtureDirectory(root) {
  assert.deepEqual(readdirSync(root).sort(), EXPECTED_ENTRIES, "fixture_directory_exact_file_set");
  for (const filename of EXPECTED_ENTRIES) {
    const stat = lstatSync(path.join(root, filename));
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), "fixture_directory_regular_files_only");
  }

  const values = parseFixtureDirectory(root);
  for (const spec of FIXTURE_SPECS) {
    const bytes = readFileSync(path.join(root, spec.filename), "utf8");
    assert.equal(bytes, canonicalJson(values[spec.key]), "fixture_directory_canonical_fixture");
    assert.ok(validateFixture(spec.key, values[spec.key]).ok, "fixture_directory_contract");
    const result = scanFixturePrivacy(spec.key, values[spec.key]);
    assert.ok(result.ok, "fixture_directory_privacy");
  }
  assert.ok(validateFixtureSet(values).ok, "fixture_directory_set_contract");

  const manifestBytes = readFileSync(path.join(root, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifestBytes, canonicalJson(manifest), "fixture_directory_canonical_manifest");
  assert.equal(manifest.fixtureCount, FIXTURE_SPECS.length, "fixture_directory_manifest_count");
  assert.equal(manifest.fixtures.length, FIXTURE_SPECS.length, "fixture_directory_manifest_rows");
  assert.equal(new Set(manifest.fixtures.map((entry) => entry.filename)).size, FIXTURE_SPECS.length, "fixture_directory_manifest_unique_filenames");
  assert.equal(new Set(manifest.fixtures.map((entry) => entry.key)).size, FIXTURE_SPECS.length, "fixture_directory_manifest_unique_keys");
  const expectedManifestRows = FIXTURE_SPECS.map((spec) => {
    const bytes = readFileSync(path.join(root, spec.filename));
    return {
      aliases: spec.aliases.map((alias) => ({ ...alias })),
      bytes: bytes.byteLength,
      cacheControl: spec.cacheControl,
      contentType: spec.contentType,
      endpoint: spec.endpoint,
      family: spec.family,
      filename: spec.filename,
      key: spec.key,
      method: spec.method,
      removedClasses: [...spec.removedClasses],
      retainedClasses: [...spec.retainedClasses],
      sha256: sha256(bytes),
      status: spec.status,
      syntheticPlan: spec.syntheticPlan,
      variant: spec.variant,
    };
  });
  assert.deepEqual(manifest.fixtures, expectedManifestRows, "fixture_directory_manifest_catalog_projection");

  const fresh = mkdtempSync(path.join(tmpdir(), "hourkey-r515-fixtures-acceptance-"));
  try {
    buildMobileR515Fixtures(fresh);
    assert.deepEqual(readdirSync(fresh).sort(), EXPECTED_ENTRIES, "fixture_directory_fresh_file_set");
    for (const filename of EXPECTED_ENTRIES) {
      assert.deepEqual(
        readFileSync(path.join(root, filename)),
        readFileSync(path.join(fresh, filename)),
        "fixture_directory_byte_binding",
      );
    }
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }

  const allBytes = EXPECTED_ENTRIES
    .map((filename) => readFileSync(path.join(root, filename), "utf8"))
    .join("\n");
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  assert.ok(!emailPattern.test(allBytes), "fixture_directory_no_email");
  assert.ok(!uuidPattern.test(allBytes), "fixture_directory_no_uuid");
}

function runPrivacyAcceptance(root) {
  verifyFixtureDirectory(root);
  check("committed fixtures are canonical, private, exact, and generator-bound", true);
}

if (PRIVACY_ONLY) {
  runPrivacyAcceptance(COMMITTED_ROOT);
  console.log(`MOBILE_R515_FIXTURE_PRIVACY_OK checks=${passed}`);
  process.exit(0);
}

equal("catalog has the exact 30 basenames", FIXTURE_SPECS.map((spec) => spec.filename), EXPECTED_FILENAMES);
equal(
  "catalog covers every required family",
  [...new Set(FIXTURE_SPECS.map((spec) => spec.family))].sort(),
  ["calendar", "chart", "datepick", "directions", "goals", "hours", "luopan", "network", "qimen", "sifu", "today"],
);
check("every fixture is committed JSON", FIXTURE_SPECS.every((spec) => spec.filename.endsWith(".sanitized.json")));

const routePaths = new Set();
for (const spec of FIXTURE_SPECS) {
  routePaths.add(spec.endpoint.replace(/\?.*$/, ""));
  for (const alias of spec.aliases || []) routePaths.add(alias.endpoint.replace(/\?.*$/, ""));
}
equal("catalog covers 27 route paths", routePaths.size, 27);

const routeMethods = [...new Set(FIXTURE_SPECS.flatMap((spec) => [
  ...spec.method.split("|").map((method) => `${method} ${spec.endpoint}`),
  ...spec.aliases.map((alias) => `${alias.method} ${alias.endpoint}`),
]))].sort();
equal("catalog exposes the exact route-method variants", routeMethods, [
  "DELETE /api/mobile/v1/datepick/saved/[id]",
  "GET /api/mobile/v1/calendar",
  "GET /api/mobile/v1/chart",
  "GET /api/mobile/v1/chart/[id]",
  "GET /api/mobile/v1/datepick/saved",
  "GET /api/mobile/v1/luopan/bootstrap",
  "GET /api/mobile/v1/luopan/measurements",
  "GET /api/mobile/v1/luopan/rings",
  "GET /api/mobile/v1/luopan/snapshot",
  "GET /api/mobile/v1/network",
  "GET /api/mobile/v1/sifu/history",
  "GET /api/mobile/v1/today",
  "GET /api/mobile/v1/today/directions",
  "GET /api/mobile/v1/today/goals",
  "GET /api/mobile/v1/today/hours",
  "POST /api/mobile/v1/calendar",
  "POST /api/mobile/v1/chart",
  "POST /api/mobile/v1/datepick",
  "POST /api/mobile/v1/datepick/save",
  "POST /api/mobile/v1/luopan/analysis",
  "POST /api/mobile/v1/luopan/measurements",
  "POST /api/mobile/v1/luopan/sifu",
  "POST /api/mobile/v1/luopan/vision",
  "POST /api/mobile/v1/network/bulk",
  "POST /api/mobile/v1/network/sifu",
  "POST /api/mobile/v1/qimen",
  "POST /api/mobile/v1/qimen/search",
  "POST /api/mobile/v1/qimen/sifu",
  "POST /api/mobile/v1/sifu/chat",
  "POST /api/mobile/v1/sifu/chat?stream=1",
  "POST /api/mobile/v1/sifu/group",
  "POST /api/mobile/v1/today",
  "POST /api/mobile/v1/today/directions",
  "POST /api/mobile/v1/today/hours",
]);
equal(
  "every fixture is bound to its exact route, alias, variant, and synthetic plan",
  FIXTURE_SPECS.map((spec) => [spec.key, spec.method, spec.endpoint, spec.aliases, spec.variant, spec.syntheticPlan]),
  [
    ["today", "GET|POST", "/api/mobile/v1/today", [], "default", "premium"],
    ["todayHours", "GET|POST", "/api/mobile/v1/today/hours", [], "default", "premium"],
    ["todayDirections", "GET|POST", "/api/mobile/v1/today/directions", [], "default", "premium"],
    ["todayGoals", "GET", "/api/mobile/v1/today/goals", [], "default", "premium"],
    ["chart", "GET|POST", "/api/mobile/v1/chart", [{ endpoint: "/api/mobile/v1/chart/[id]", method: "GET" }], "default", "plan-neutral"],
    ["calendar", "GET|POST", "/api/mobile/v1/calendar", [], "default", "premium"],
    ["network", "GET", "/api/mobile/v1/network", [], "default", "premium"],
    ["networkSifu", "POST", "/api/mobile/v1/network/sifu", [], "default", "premium"],
    ["networkBulk", "POST", "/api/mobile/v1/network/bulk", [], "master", "master"],
    ["qimenBasic", "POST", "/api/mobile/v1/qimen", [], "free-basic", "free-post-trial"],
    ["qimenProfessional", "POST", "/api/mobile/v1/qimen", [], "master-technical", "master"],
    ["qimenSearch", "POST", "/api/mobile/v1/qimen/search", [], "premium", "premium"],
    ["qimenSifu", "POST", "/api/mobile/v1/qimen/sifu", [], "premium", "premium"],
    ["datepick", "POST", "/api/mobile/v1/datepick", [], "default", "premium"],
    ["datepickSave", "POST", "/api/mobile/v1/datepick/save", [], "default", "plan-neutral"],
    ["datepickSaved", "GET", "/api/mobile/v1/datepick/saved", [], "default", "plan-neutral"],
    ["datepickDelete", "DELETE", "/api/mobile/v1/datepick/saved/[id]", [], "default", "plan-neutral"],
    ["luopanRings", "GET", "/api/mobile/v1/luopan/rings", [], "free-locked", "free-post-trial"],
    ["luopanBootstrap", "GET", "/api/mobile/v1/luopan/bootstrap", [], "master", "master"],
    ["luopanRingsW4", "GET", "/api/mobile/v1/luopan/rings", [], "master-open", "master"],
    ["luopanAnalysis", "POST", "/api/mobile/v1/luopan/analysis", [], "master", "master"],
    ["luopanSnapshot", "GET", "/api/mobile/v1/luopan/snapshot", [], "master", "master"],
    ["luopanMeasurementsGet", "GET", "/api/mobile/v1/luopan/measurements", [], "default", "free-post-trial"],
    ["luopanMeasurementsPost", "POST", "/api/mobile/v1/luopan/measurements", [], "default", "free-post-trial"],
    ["luopanSifu", "POST", "/api/mobile/v1/luopan/sifu", [], "premium", "premium"],
    ["luopanVision", "POST", "/api/mobile/v1/luopan/vision", [], "premium", "premium"],
    ["sifuChat", "POST", "/api/mobile/v1/sifu/chat", [], "json", "plan-neutral"],
    ["sifuChatStream", "POST", "/api/mobile/v1/sifu/chat?stream=1", [], "sse-projection", "plan-neutral"],
    ["sifuHistory", "GET", "/api/mobile/v1/sifu/history", [], "default", "plan-neutral"],
    ["sifuGroup", "POST", "/api/mobile/v1/sifu/group", [], "default", "plan-neutral"],
  ],
);

const byKey = Object.fromEntries(FIXTURE_SPECS.map((spec) => [spec.key, spec]));
equal("saved-date creation status is 201", byKey.datepickSave.status, 201);
equal("Luopan measurement creation status is 201", byKey.luopanMeasurementsPost.status, 201);
equal("Sifu stream content type is SSE", byKey.sifuChatStream.contentType, "text/event-stream");
equal("Sifu stream cache policy is no-cache", byKey.sifuChatStream.cacheControl, "no-cache");

equal("canonical JSON sorts keys and ends in LF", canonicalJson({ z: 1, a: { y: 2, b: 3 } }), '{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}\n');
equal(
  "canonical JSON preserves an own __proto__ member",
  canonicalJson(JSON.parse('{"__proto__":{"fixture":"value"}}')),
  '{\n  "__proto__": {\n    "fixture": "value"\n  }\n}\n',
);
assert.throws(() => canonicalJson({ value: Number.NaN }), /fixture_non_finite/);
assert.throws(() => canonicalJson(Object.create({ inherited: true })), /fixture_non_plain_object/);
passed += 2;
console.log("PASS canonical JSON rejects unsafe values");

const emailCanary = ["fixture.person", "invalid.test"].join(String.fromCharCode(64));
const opaqueId = ["11111111", "1111", "4111", "8111", "111111111111"].join("-");
check("privacy rejects email values", !scanFixturePrivacy("canary", { contact: emailCanary }).ok);
check("privacy rejects opaque profile identifiers", !scanFixturePrivacy("canary", { profile_id: opaqueId }).ok);
check("privacy rejects authorization material", !scanFixturePrivacy("canary", { authorization: "private-value" }).ok);
for (const key of [
  "accessToken", "refreshToken", "sessionToken", "authToken", "apiKey", "clientSecret",
  "profileId", "userId", "orgId", "accountId", "deviceId", "emailAddress", "phoneNumber",
  "birthDate", "birthTime", "birthDateTime", "homeAddress", "imageBase64", "imageUrl", "coordinates",
  "firebaseAuthToken", "oauthToken", "privateNote", "profileIds", "profileUUID", "set-cookie", "setCookie", "geoCoordinates",
]) {
  check(`privacy rejects key variant ${key}`, !scanFixturePrivacy("canary", { [key]: "private-value" }).ok);
}
check("privacy rejects nested account identifiers", !scanFixturePrivacy("canary", { account: { id: "private-value" } }).ok);
check("privacy rejects identifiers nested under people", !scanFixturePrivacy("canary", { people: [{ id: "private-value" }] }).ok);
check("privacy rejects identifiers nested under profiles", !scanFixturePrivacy("canary", { profiles: [{ id: "private-value" }] }).ok);
check(
  "privacy rejects UUIDv7 values",
  !scanFixturePrivacy("canary", { opaque: "018f0f73-6f50-7cc8-9e5e-4aa3ac58aa11" }).ok,
);
check(
  "privacy rejects exact coordinates",
  !scanFixturePrivacy("canary", { coordinates: [13.7563, 100.5018] }).ok,
);
check(
  "privacy rejects real-looking house names",
  !scanFixturePrivacy("canary", { houses: [{ name: "Somchai Residence" }] }).ok,
);
check(
  "privacy rejects synthetic-prefix real names",
  !scanFixturePrivacy("canary", { activeProfile: { name: "Fixture Somchai Real" } }).ok,
);
for (const key of ["content", "response", "text", "transcript"]) {
  check(`privacy rejects arbitrary ${key}`, !scanFixturePrivacy("canary", { [key]: "private conversation" }).ok);
}
check("privacy rejects arbitrary reply text", !scanFixturePrivacy("canary", { reply: "private reply" }).ok);
check("privacy permits the fixed synthetic reply", scanFixturePrivacy("canary", { reply: SYNTHETIC_REPLY }).ok);
check(
  "privacy rejects arbitrary Sifu stream text",
  !scanFixturePrivacy("sifuChatStream", { events: [{ event: "chunk", data: { text: "private stream text" } }] }).ok,
);
check(
  "privacy rejects nested Sifu stream text",
  !scanFixturePrivacy("sifuChatStream", { events: [{ event: "chunk", data: { payload: { text: "private stream text" } } }] }).ok,
);
check(
  "privacy permits scientific names",
  scanFixturePrivacy("canary", { star_name_th: "ดาวตัวอย่าง", mountain: { name: "子" } }).ok,
);

const negativeValues = buildFixtureSet();
for (const rootValue of [null, "fixture", 1, []]) {
  equal("contract rejects a non-object root", validateFixture("today", rootValue), {
    error: "fixture_contract today /",
    ok: false,
  });
}
for (const badOk of [undefined, null, false, "true"]) {
  const badEnvelope = structuredClone(negativeValues.today);
  if (badOk === undefined) delete badEnvelope.ok;
  else badEnvelope.ok = badOk;
  equal("contract rejects every malformed ok envelope", validateFixture("today", badEnvelope), {
    error: "fixture_contract today /ok",
    ok: false,
  });
}
const malformedOk = structuredClone(negativeValues.today);
malformedOk.ok = false;
equal("contract rejects malformed ok envelope", validateFixture("today", malformedOk), {
  error: "fixture_contract today /ok",
  ok: false,
});
const missingPointer = structuredClone(negativeValues.today);
delete missingPointer.pillars.day;
equal("contract rejects missing required pointer", validateFixture("today", missingPointer), {
  error: "fixture_contract today /pillars/day",
  ok: false,
});
const privateValue = "private-value-must-not-leak";
const privatePayload = structuredClone(negativeValues.today);
privatePayload.authorization = privateValue;
const privateFailure = validateFixture("today", privatePayload);
check("contract privacy error is pointer-only", !JSON.stringify(privateFailure).includes(privateValue));
const mismatchedSet = structuredClone(negativeValues);
mismatchedSet.todayGoals.goals.wealth += 1;
check("cross-fixture mismatch is rejected", !validateFixtureSet(mismatchedSet).ok);

function deletePointer(root, pointer) {
  const segments = pointer.split("/").slice(1).map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  let parent = root;
  for (const segment of segments.slice(0, -1)) parent = parent[segment];
  delete parent[segments.at(-1)];
}

for (const spec of FIXTURE_SPECS) {
  for (const pointer of spec.requiredPointers.filter((candidate) => candidate !== "/ok")) {
    const mutation = structuredClone(negativeValues[spec.key]);
    deletePointer(mutation, pointer);
    equal(`contract reports missing pointer ${spec.key} ${pointer}`, validateFixture(spec.key, mutation), {
      error: `fixture_contract ${spec.key} ${pointer}`,
      ok: false,
    });
  }
}

for (const [key, pointer, mutate] of [
  ["todayHours", "/hours", (value) => { value.hours = {}; }],
  ["todayDirections", "/directions", (value) => { value.directions = {}; }],
  ["calendar", "/days", (value) => { value.days = {}; }],
  ["network", "/people", (value) => { value.people = {}; }],
  ["qimenBasic", "/data/palaces", (value) => { value.data.palaces = {}; }],
  ["luopanBootstrap", "/ring_reference/mountains_24", (value) => { value.ring_reference.mountains_24 = {}; }],
  ["sifuChatStream", "/events", (value) => { value.events = {}; }],
]) {
  const mutation = structuredClone(negativeValues[key]);
  mutate(mutation);
  equal(`contract rejects wrong container ${key}`, validateFixture(key, mutation), {
    error: `fixture_contract ${key} ${pointer}`,
    ok: false,
  });
}
check("set validator returns a failure instead of throwing", validateFixtureSet({}).ok === false);
const reorderedStream = structuredClone(negativeValues.sifuChatStream);
[reorderedStream.events[1].data.text, reorderedStream.events[2].data.text] = [
  reorderedStream.events[2].data.text,
  reorderedStream.events[1].data.text,
];
equal("stream contract rejects reordered synthetic fragments", validateFixture("sifuChatStream", reorderedStream), {
  error: "fixture_contract sifuChatStream /events",
  ok: false,
});
for (const mutate of [
  (value) => { [value.events[1].event, value.events[2].event] = [value.events[2].event, value.events[1].event]; },
  (value) => { value.events.splice(2, 1); },
  (value) => { value.events.push(structuredClone(value.events[2])); },
  (value) => { value.events[3].event = "chunk"; },
  (value) => { value.events[3].data.reply = "private reply"; },
]) {
  const mutation = structuredClone(negativeValues.sifuChatStream);
  mutate(mutation);
  const result = validateFixture("sifuChatStream", mutation);
  check("stream contract rejects malformed event sequence", !result.ok && /^fixture_contract sifuChatStream \/events(?:\/|$)/.test(result.error));
}

const expectedMountains = [
  ["壬", "N1", "水", "坎", "地元", "陽", 345, "N"],
  ["子", "N2", "水", "坎", "天元", "陰", 0, "N"],
  ["癸", "N3", "水", "坎", "人元", "陰", 15, "N"],
  ["丑", "NE1", "土", "艮", "地元", "陰", 30, "NE"],
  ["艮", "NE2", "土", "艮", "天元", "陽", 45, "NE"],
  ["寅", "NE3", "木", "艮", "人元", "陽", 60, "NE"],
  ["甲", "E1", "木", "震", "地元", "陽", 75, "E"],
  ["卯", "E2", "木", "震", "天元", "陰", 90, "E"],
  ["乙", "E3", "木", "震", "人元", "陰", 105, "E"],
  ["辰", "SE1", "土", "巽", "地元", "陰", 120, "SE"],
  ["巽", "SE2", "木", "巽", "天元", "陽", 135, "SE"],
  ["巳", "SE3", "火", "巽", "人元", "陽", 150, "SE"],
  ["丙", "S1", "火", "離", "地元", "陽", 165, "S"],
  ["午", "S2", "火", "離", "天元", "陰", 180, "S"],
  ["丁", "S3", "火", "離", "人元", "陰", 195, "S"],
  ["未", "SW1", "土", "坤", "地元", "陰", 210, "SW"],
  ["坤", "SW2", "土", "坤", "天元", "陽", 225, "SW"],
  ["申", "SW3", "金", "坤", "人元", "陽", 240, "SW"],
  ["庚", "W1", "金", "兌", "地元", "陽", 255, "W"],
  ["酉", "W2", "金", "兌", "天元", "陰", 270, "W"],
  ["辛", "W3", "金", "兌", "人元", "陰", 285, "W"],
  ["戌", "NW1", "土", "乾", "地元", "陰", 300, "NW"],
  ["乾", "NW2", "金", "乾", "天元", "陽", 315, "NW"],
  ["亥", "NW3", "水", "乾", "人元", "陽", 330, "NW"],
].map(([name, code, elementZh, trigram, yuan, yinYang, centerDeg, dir8]) => ({
  centerDeg, code, dir8, elementZh, name, trigram, yinYang, yuan,
}));
equal(
  "Luopan bootstrap matches the canonical backend 24-mountain projection",
  negativeValues.luopanBootstrap.ring_reference.mountains_24,
  expectedMountains,
);
equal("Luopan bootstrap contract version", negativeValues.luopanBootstrap.contract_version, "mobile-luopan-v1");
equal("Luopan bootstrap formula version", negativeValues.luopanBootstrap.formula_version, "luopan-core-v1-xuankong-chart-v1");
equal(
  "Luopan bootstrap binds request context to entitlement revision",
  negativeValues.luopanBootstrap.request_context.entitlement_revision,
  negativeValues.luopanBootstrap.entitlement.revision,
);
equal(
  "Luopan measurement POST exposes only returned database fields",
  Object.keys(negativeValues.luopanMeasurementsPost.measurement).sort(),
  ["created_at", "facing_mountain", "heading_deg", "id", "quality_reasons", "quality_status", "sitting_mountain"],
);
for (const pointer of ["facing", "sitting", "tigua", "pin_warnings"]) {
  check(`Luopan analysis retains core.${pointer}`, Object.hasOwn(negativeValues.luopanAnalysis.core, pointer));
}
equal(
  "Luopan analysis explicitly excludes unverified layers",
  negativeValues.luopanAnalysis.excluded_unverified_layers,
  ["pseudo_time_star", "simplified_kua", "sequential_hex64", "low_confidence_star_pairs"],
);
equal("Qimen basic uses a coherent free plan", negativeValues.qimenBasic.entitlement.plan, "free");
equal("Qimen basic entitlement detail", negativeValues.qimenBasic.entitlement.caps.detail, "basic");
equal("Qimen professional uses a coherent master plan", negativeValues.qimenProfessional.entitlement.plan, "master");
equal("Qimen professional entitlement detail", negativeValues.qimenProfessional.entitlement.caps.detail, "technical");
equal("Today fixture uses a coherent premium plan", negativeValues.today.entitlement.plan, "premium");
equal("Premium Today fixture does not claim multi-profile", negativeValues.today.entitlement.multi_profile, false);
equal("Network base fixture uses a coherent premium plan", negativeValues.network.entitlement.plan, "premium");
equal("Premium Network fixture does not claim bulk AI", negativeValues.network.entitlement.bulk_ai, false);
equal("Luopan full fixture is master", negativeValues.luopanBootstrap.entitlement.plan, "master");
check("Core Luopan rings omit hex64", !Object.hasOwn(negativeValues.luopanRings, "hex64"));
check("Core Luopan rings omit fenjin120", !Object.hasOwn(negativeValues.luopanRings, "fenjin120"));
check("Core Luopan rings omit yao384", !Object.hasOwn(negativeValues.luopanRings, "yao384"));
equal("Full Luopan ring faces canonical SE3", negativeValues.luopanRingsW4.mountain.code, "SE3");
equal("Full Luopan ring selects canonical hexagram", negativeValues.luopanRingsW4.hex64.id, 9);
equal("Full Luopan ring selects canonical fenjin", negativeValues.luopanRingsW4.fenjin120.index, 57);
equal("Full Luopan ring selects canonical yao", negativeValues.luopanRingsW4.yao384.id, 55);
equal("Luopan analysis formula version", negativeValues.luopanAnalysis.formula_version, "luopan-core-v1-xuankong-chart-v1-three-plates-v1");
equal("Luopan analysis school", negativeValues.luopanAnalysis.core.school, "full_24");
equal("Luopan analysis facing mountain", negativeValues.luopanAnalysis.core.facing.code, "SE3");
equal("Luopan analysis sitting mountain", negativeValues.luopanAnalysis.core.sitting.code, "NW3");
equal("Luopan analysis Earth plate", negativeValues.luopanAnalysis.core.three_plates.earth.code, "SE3");
equal("Luopan analysis Human plate", negativeValues.luopanAnalysis.core.three_plates.human.code, "S1");
equal("Luopan analysis Heaven plate", negativeValues.luopanAnalysis.core.three_plates.heaven.code, "SE3");
equal("Luopan base flight", negativeValues.luopanAnalysis.core.xuan_kong.base, [5, 6, 7, 8, 9, 1, 2, 3, 4]);
equal("Luopan water flight", negativeValues.luopanAnalysis.core.xuan_kong.water, [4, 5, 6, 7, 8, 9, 1, 2, 3]);
equal("Luopan mountain flight", negativeValues.luopanAnalysis.core.xuan_kong.mountain, [5, 4, 3, 2, 1, 9, 8, 7, 6]);
equal("Snapshot annual center is canonical for 2026", negativeValues.luopanSnapshot.layers.flying_stars.annual_center, 1);
equal("Snapshot uses directional flying-star palaces", Object.keys(negativeValues.luopanSnapshot.layers.flying_stars.palaces), ["SE", "S", "SW", "E", "C", "W", "NE", "N", "NW"]);
equal("Snapshot has its distinct 24-mountain object", negativeValues.luopanSnapshot.layers.twenty_four, {
  face_angle: 150,
  facing: "巳",
  mountains: expectedMountains.map((mountain) => mountain.name),
  sitting: "亥",
});
check("Qimen basic strips technical calculation", !Object.hasOwn(negativeValues.qimenBasic.data, "calculation"));
check("Qimen basic strips beginner readings", negativeValues.qimenBasic.data.palaces.every((palace) => !Object.hasOwn(palace, "beginner_reading")));
check("Qimen activity search omits spec-only matched_palaces", negativeValues.qimenSearch.top.every((row) => !Object.hasOwn(row, "matched_palaces")));

const first = mkdtempSync(path.join(tmpdir(), "hourkey-r515-fixtures-a-"));
const second = mkdtempSync(path.join(tmpdir(), "hourkey-r515-fixtures-b-"));

try {
  const firstResult = buildMobileR515Fixtures(first);
  const secondResult = buildMobileR515Fixtures(second);
  equal("builder reports 30 fixtures", firstResult.count, 30);
  equal("two builds report the same manifest hash", firstResult.manifestSha256, secondResult.manifestSha256);

  equal("builder emits only the approved files", readdirSync(first).sort(), EXPECTED_ENTRIES);
  equal("second build emits the same file set", readdirSync(second).sort(), EXPECTED_ENTRIES);

  for (const filename of EXPECTED_ENTRIES) {
    equal(
      `deterministic bytes ${filename}`,
      readFileSync(path.join(first, filename)),
      readFileSync(path.join(second, filename)),
    );
  }

  const values = parseFixtureDirectory(first);
  for (const spec of FIXTURE_SPECS) {
    const validation = validateFixture(spec.key, values[spec.key]);
    check(`contract ${spec.filename}`, validation.ok);
    check(`privacy generated ${spec.filename}`, scanFixturePrivacy(spec.key, values[spec.key]).ok);
  }
  check("cross-fixture invariants pass", validateFixtureSet(values).ok);

  const manifestBytes = readFileSync(path.join(first, "manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  equal("manifest schema is versioned", manifest.schema, "hourkey-mobile-r515-fixtures/v1");
  equal("manifest source is synthetic", manifest.sourceClass, "deterministic-synthetic-contract");
  equal("manifest has 30 entries", manifest.fixtures.length, 30);
  check("manifest has no raw source hash", !canonicalJson(manifest).includes("rawSha"));
  for (const entry of manifest.fixtures) {
    const bytes = readFileSync(path.join(first, entry.filename));
    equal(`manifest bytes ${entry.filename}`, entry.bytes, bytes.byteLength);
    equal(`manifest hash ${entry.filename}`, entry.sha256, sha256(bytes));
  }
} finally {
  rmSync(first, { recursive: true, force: true });
  rmSync(second, { recursive: true, force: true });
}

const recovery = mkdtempSync(path.join(tmpdir(), "hourkey-r515-fixtures-recovery-"));
try {
  writeFileSync(path.join(recovery, ".today.sanitized.json.tmp"), "interrupted", "utf8");
  buildMobileR515Fixtures(recovery);
  check("builder removes its own interrupted regular temp", !readdirSync(recovery).some((name) => name.endsWith(".tmp")));
} finally {
  rmSync(recovery, { recursive: true, force: true });
}

const unsafeTemp = mkdtempSync(path.join(tmpdir(), "hourkey-r515-fixtures-unsafe-temp-"));
try {
  symlinkSync("/etc/hosts", path.join(unsafeTemp, ".manifest.json.tmp"));
  throws("builder rejects an approved temp symlink", () => buildMobileR515Fixtures(unsafeTemp), /fixture_output_temp_unsafe/);
} finally {
  rmSync(unsafeTemp, { recursive: true, force: true });
}

const unknownTemp = mkdtempSync(path.join(tmpdir(), "hourkey-r515-fixtures-unknown-temp-"));
try {
  writeFileSync(path.join(unknownTemp, ".unknown.tmp"), "interrupted", "utf8");
  throws("builder rejects an unknown temp file", () => buildMobileR515Fixtures(unknownTemp), /fixture_output_unknown/);
} finally {
  rmSync(unknownTemp, { recursive: true, force: true });
}

const tampered = mkdtempSync(path.join(tmpdir(), "hourkey-r515-fixtures-tamper-"));
const resetTampered = () => {
  rmSync(tampered, { recursive: true, force: true });
  buildMobileR515Fixtures(tampered);
};
try {
  resetTampered();
  verifyFixtureDirectory(tampered);
  check("acceptance accepts a fresh canonical fixture directory", true);

  writeFileSync(path.join(tampered, "extra.json"), "{}\n", "utf8");
  throws("acceptance rejects an extra file", () => verifyFixtureDirectory(tampered), /fixture_directory_exact_file_set/);

  resetTampered();
  rmSync(path.join(tampered, "today.sanitized.json"));
  throws("acceptance rejects a missing fixture", () => verifyFixtureDirectory(tampered), /fixture_directory_exact_file_set/);

  resetTampered();
  const todayPath = path.join(tampered, "today.sanitized.json");
  writeFileSync(todayPath, `${readFileSync(todayPath, "utf8")}\n`, "utf8");
  throws("acceptance rejects whitespace-only fixture drift", () => verifyFixtureDirectory(tampered), /fixture_directory_canonical_fixture|fixture_directory_byte_binding/);

  resetTampered();
  const manifestPath = path.join(tampered, "manifest.json");
  const manifestMutation = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifestMutation.fixtureCount = 29;
  writeFileSync(manifestPath, canonicalJson(manifestMutation), "utf8");
  throws("acceptance rejects a manifest-only mutation", () => verifyFixtureDirectory(tampered), /fixture_directory_manifest_count|fixture_directory_byte_binding/);

  resetTampered();
  writeFileSync(path.join(tampered, "README.md"), "tampered\n", "utf8");
  throws("acceptance rejects README drift", () => verifyFixtureDirectory(tampered), /fixture_directory_byte_binding/);

  resetTampered();
  rmSync(path.join(tampered, "README.md"));
  symlinkSync("/etc/hosts", path.join(tampered, "README.md"));
  throws("acceptance rejects a symlink", () => verifyFixtureDirectory(tampered), /fixture_directory_regular_files_only/);
} finally {
  rmSync(tampered, { recursive: true, force: true });
}

runPrivacyAcceptance(COMMITTED_ROOT);
console.log(`MOBILE_R515_FIXTURES_OK checks=${passed} count=${FIXTURE_SPECS.length}`);
