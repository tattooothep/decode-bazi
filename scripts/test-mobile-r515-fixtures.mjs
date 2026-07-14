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
const SOURCE_DATA_ROOT = path.join(ROOT, "scripts/data");
const PRIVACY_ONLY = process.argv.includes("--privacy-only");
const SOURCE_DATA_SHA256 = Object.freeze({
  "mobile-r515-calendar-days-01-10.json": "33c6a905e1ea9850f5145679bef496b147f0b299704d7d66315aabcd93ac5de7",
  "mobile-r515-calendar-days-11-20.json": "f1681fe8606f4f2a46502fadb10ef6c640ab26facf5234f50014e4b2790a07a8",
  "mobile-r515-calendar-days-21-31.json": "e25d980dac0d33b32af3df77c0b83e8ee8205cd5e3c6c4c0bb70e6192b13ceee",
  "mobile-r515-calendar-meta.json": "7bd2e7f8842bc87f1fb5f70bbe49c5762701cc9c51e46e9f3ab7391c130030c9",
  "mobile-r515-qimen-network-wire.json": "8286396fd98e5e4d66e0d4252b205ca93e3984257c646c2a50c3eeb675eca390",
  "mobile-r515-today-wire.json": "61735b176de37944a937c5aba410dab2cad4372464b6c372472a75b49394be30",
});
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
  const normalizedBytes = allBytes.normalize("NFKC").replace(/\p{Cf}/gu, "");
  const emailPattern = /[\p{L}\p{M}\p{N}._%+-]+@[\p{L}\p{M}\p{N}.-]+\.[\p{L}\p{M}]{2,}/iu;
  const credentialPattern = /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,})/i;
  const phonePattern = /^\s*(?:\+\d(?:[\s().-]*\d){7,14}|0\d(?:[\s().-]*\d){8,10})\s*$/mu;
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
  assert.ok(!emailPattern.test(normalizedBytes), "fixture_directory_no_email");
  assert.ok(!credentialPattern.test(normalizedBytes), "fixture_directory_no_credential_shape");
  assert.ok(!phonePattern.test(normalizedBytes), "fixture_directory_no_phone_shape");
  assert.deepEqual(
    [...normalizedBytes.matchAll(uuidPattern)].map((match) => match[0]).sort(),
    [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000002",
    ],
    "fixture_directory_only_exact_synthetic_record_uuids",
  );
}

function runPrivacyAcceptance(root) {
  verifyFixtureDirectory(root);
  check("committed fixtures are canonical, private, exact, and generator-bound", true);
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
    ["chart", "GET|POST", "/api/mobile/v1/chart", [{ endpoint: "/api/mobile/v1/chart/[id]", method: "GET" }], "default", "premium"],
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
equal("Sifu stream content type preserves deployed charset", byKey.sifuChatStream.contentType, "text/event-stream; charset=utf-8");
equal("Sifu stream cache policy matches the mobile relay", byKey.sifuChatStream.cacheControl, "no-cache, no-store, max-age=0, must-revalidate");

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
const unicodeEmailCanary = ["ทดสอบ", "ตัวอย่าง.ไทย"].join(String.fromCharCode(64));
const zeroWidthEmailCanary = `fixture.person\u200b${String.fromCharCode(64)}invalid.test`;
const fullWidthEmailCanary = "ｆｉｘｔｕｒｅ＠ｉｎｖａｌｉｄ．ｔｅｓｔ";
const opaqueId = ["11111111", "1111", "4111", "8111", "111111111111"].join("-");
const uuidV7Canary = ["018f0f73", "6f50", "7cc8", "9e5e", "4aa3ac58aa11"].join("-");
const canaryPersonName = ["Canary", "Person"].join(" ");
const githubTokenCanary = ["gh", "p_", "0123456789", "abcdefghijklmnopqrstuvwxyz"].join("");
const privateKeyCanary = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
const awsAccessKeyCanary = ["ASIA", "IOSFODNN7EXAMPLE"].join("");
const googleApiKeyCanary = ["AI", "zaSyD", "EXAMPLE0123456789012345678901234567"].join("");
const phoneCanary = `+${["66", "81", "234", "5678"].join(" ")}`;
const jwtCanary = [["ey", "Jheader12"].join(""), "payload12", "signature12"].join(".");
const bearerCanary = ["Bear", "er ", "abcdefghijklmnop"].join("");
const slackTokenCanary = ["xox", "b-", "1234567890", "abcdefghijklmnopqrstuv"].join("");
const gitlabTokenCanary = ["gl", "pat-", "abcdefghijklmnopqrstuvwx"].join("");
const npmTokenCanary = ["npm", "_", "abcdefghijklmnopqrstuvwxyz123456"].join("");
const sendgridTokenCanary = [["S", "G"].join(""), "abcdefghijklmnopqrstuv", "abcdefghijklmnopqrstuvwxyz123456"].join(".");
const domainLiteralEmailCanary = ["fixture.user", "[192.0.2.1]"].join(String.fromCharCode(64));
const ideographicDotEmailCanary = `${["fixture", "example"].join(String.fromCharCode(64))}${String.fromCharCode(0x3002)}com`;
const halfwidthDotEmailCanary = `${["fixture", "example"].join(String.fromCharCode(64))}${String.fromCharCode(0xff61)}com`;
check("privacy rejects email values", !scanFixturePrivacy("canary", { contact: emailCanary }).ok);
check("privacy rejects Unicode email values", !scanFixturePrivacy("canary", { contact: unicodeEmailCanary }).ok);
check("privacy scans email-shaped object keys", !scanFixturePrivacy("canary", { [emailCanary]: "value" }).ok);
check("privacy scans Unicode email-shaped object keys", !scanFixturePrivacy("canary", { [unicodeEmailCanary]: "value" }).ok);
check("privacy rejects zero-width-obfuscated email values", !scanFixturePrivacy("canary", { contact: zeroWidthEmailCanary }).ok);
check("privacy rejects NFKC full-width email values", !scanFixturePrivacy("canary", { contact: fullWidthEmailCanary }).ok);
check("privacy rejects opaque profile identifiers", !scanFixturePrivacy("canary", { profile_id: opaqueId }).ok);
check("privacy rejects authorization material", !scanFixturePrivacy("canary", { authorization: "private-value" }).ok);
check("privacy rejects GitHub token shapes", !scanFixturePrivacy("canary", { opaque: githubTokenCanary }).ok);
check("privacy rejects private-key headers", !scanFixturePrivacy("canary", { opaque: privateKeyCanary }).ok);
check("privacy rejects compact profile identifiers", !scanFixturePrivacy("canary", { profileid: "prof_7d3c91b6a0ef" }).ok);
check("privacy rejects full personal names", !scanFixturePrivacy("canary", { fullName: canaryPersonName }).ok);
check("privacy rejects arbitrary memo fields", !scanFixturePrivacy("canary", { memo: "private financial question" }).ok);
check("privacy rejects saved-date free text", !scanFixturePrivacy("canary", { saved_date: { summary: "private appointment" } }).ok);
check("privacy rejects numeric house identifiers", !scanFixturePrivacy("canary", { house_id: 42 }).ok);
check("privacy rejects profile birth-place names", !scanFixturePrivacy("canary", { profile: { birth_location_name: "private place" } }).ok);
check("privacy rejects house owner names", !scanFixturePrivacy("canary", { house: { owner_name: canaryPersonName } }).ok);
check("privacy rejects generic profile identifiers", !scanFixturePrivacy("canary", { profile: { identifier: "private-profile" } }).ok);
check("privacy rejects non-ASCII confusable credential keys", !scanFixturePrivacy("canary", { ["t\u043eken"]: "private-value" }).ok);
check("privacy rejects non-ASCII confusable identity keys", !scanFixturePrivacy("canary", { ["pr\u03bffile_id"]: "private-profile" }).ok);
check("privacy rejects AWS temporary access-key shapes", !scanFixturePrivacy("canary", { accessKey: awsAccessKeyCanary }).ok);
check("privacy rejects Google API-key shapes", !scanFixturePrivacy("canary", { opaque: googleApiKeyCanary }).ok);
check("privacy rejects prefixed GitHub token shapes", !scanFixturePrivacy("canary", { opaque: `prefix_${githubTokenCanary}` }).ok);
check("privacy rejects suffixed GitHub token shapes", !scanFixturePrivacy("canary", { opaque: `${githubTokenCanary}_suffix` }).ok);
check("privacy rejects prefixed AWS token shapes", !scanFixturePrivacy("canary", { opaque: `prefix_${awsAccessKeyCanary}` }).ok);
check("privacy rejects prefixed Google API-key shapes", !scanFixturePrivacy("canary", { opaque: `prefix_${googleApiKeyCanary}` }).ok);
check("privacy rejects prefixed JWT shapes", !scanFixturePrivacy("canary", { opaque: `prefix_${jwtCanary}` }).ok);
check("privacy rejects prefixed bearer credentials", !scanFixturePrivacy("canary", { opaque: `prefix_${bearerCanary}` }).ok);
check("privacy rejects Slack token shapes", !scanFixturePrivacy("canary", { opaque: slackTokenCanary }).ok);
check("privacy rejects GitLab token shapes", !scanFixturePrivacy("canary", { opaque: gitlabTokenCanary }).ok);
check("privacy rejects npm token shapes", !scanFixturePrivacy("canary", { opaque: npmTokenCanary }).ok);
check("privacy rejects SendGrid token shapes", !scanFixturePrivacy("canary", { opaque: sendgridTokenCanary }).ok);
check("privacy rejects international phone-number shapes", !scanFixturePrivacy("canary", { contact: phoneCanary }).ok);
check("privacy rejects domain-literal email syntax", !scanFixturePrivacy("canary", { opaque: domainLiteralEmailCanary }).ok);
check("privacy rejects ideographic-dot email syntax", !scanFixturePrivacy("canary", { opaque: ideographicDotEmailCanary }).ok);
check("privacy rejects halfwidth-dot email syntax", !scanFixturePrivacy("canary", { opaque: halfwidthDotEmailCanary }).ok);
check("privacy rejects display-name aliases", !scanFixturePrivacy("canary", { displayName: canaryPersonName }).ok);
check("privacy rejects first-name aliases", !scanFixturePrivacy("canary", { firstName: "Canary" }).ok);
check("privacy rejects last-name aliases", !scanFixturePrivacy("canary", { lastName: "Person" }).ok);
check("privacy rejects date-of-birth aliases", !scanFixturePrivacy("canary", { dob: "1990-01-02" }).ok);
check("privacy rejects member identifiers", !scanFixturePrivacy("canary", { memberId: "prod-member-837281" }).ok);
check("privacy rejects avatar URL aliases", !scanFixturePrivacy("canary", { avatarUrl: "https://private.invalid/photo.jpg" }).ok);
check("privacy rejects exact location aliases", !scanFixturePrivacy("canary", { location: "13.7563,100.5018" }).ok);
check("privacy rejects exact position aliases", !scanFixturePrivacy("canary", { position: [13.7563, 100.5018] }).ok);
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
  !scanFixturePrivacy("canary", { opaque: uuidV7Canary }).ok,
);
check("privacy rejects prefixed UUID values", !scanFixturePrivacy("canary", { opaque: `profile_${uuidV7Canary}` }).ok);
check("privacy rejects suffixed UUID values", !scanFixturePrivacy("canary", { opaque: `${uuidV7Canary}_suffix` }).ok);
check("privacy rejects letter-prefixed UUID values", !scanFixturePrivacy("canary", { opaque: `x${uuidV7Canary}` }).ok);
check(
  "privacy rejects exact coordinates",
  !scanFixturePrivacy("canary", { coordinates: [13.7563, 100.5018] }).ok,
);
check(
  "privacy rejects real-looking house names",
  !scanFixturePrivacy("canary", { houses: [{ name: ["Canary", "Residence"].join(" ") }] }).ok,
);
check(
  "privacy rejects synthetic-prefix real names",
  !scanFixturePrivacy("canary", { activeProfile: { name: ["Fixture", "Canary", "Person"].join(" ") } }).ok,
);
for (const key of ["content", "response", "text", "transcript"]) {
  check(`privacy rejects arbitrary ${key}`, !scanFixturePrivacy("canary", { [key]: "private conversation" }).ok);
}
check("privacy rejects arbitrary reply text", !scanFixturePrivacy("canary", { reply: "private reply" }).ok);
check("privacy permits the fixed synthetic reply only at an approved path", scanFixturePrivacy("sifuChat", { reply: SYNTHETIC_REPLY }).ok);
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
const syntheticSavedUuid = "00000000-0000-4000-8000-000000000001";
check("privacy permits the saved-date UUID only at its exact DELETE path", scanFixturePrivacy("datepickDelete", { id: syntheticSavedUuid }).ok);
check("privacy rejects relocation of the fixed saved-date UUID", !scanFixturePrivacy("datepickDelete", { nested: { id: syntheticSavedUuid } }).ok);
check("privacy rejects a different UUID at the approved path", !scanFixturePrivacy("datepickDelete", { id: "00000000-0000-4000-8000-000000000003" }).ok);
check("privacy permits zero synthetic Qimen coordinates at exact paths", scanFixturePrivacy("qimenBasic", { input: { lat: 0, lng: 0 }, request_context: { latitude: 0, longitude: 0 } }).ok);
check("privacy permits the deployed Qimen search zero-coordinate projections", scanFixturePrivacy("qimenSearch", { lat: 0, lng: 0, request_context: { latitude: 0, longitude: 0 } }).ok);
check("privacy rejects nonzero exact coordinates at approved paths", !scanFixturePrivacy("qimenBasic", { input: { lat: 13.7, lng: 100.5 } }).ok);
check("privacy rejects nonzero Qimen search root coordinates", !scanFixturePrivacy("qimenSearch", { lat: 13.7, lng: 100.5 }).ok);
check("privacy permits an empty datepick people_ids projection", scanFixturePrivacy("datepick", { people_ids: [] }).ok);
check("privacy rejects populated datepick people_ids", !scanFixturePrivacy("datepick", { people_ids: [syntheticSavedUuid] }).ok);

const sourceData = Object.fromEntries(Object.keys(SOURCE_DATA_SHA256).map((filename) => {
  const bytes = readFileSync(path.join(SOURCE_DATA_ROOT, filename));
  equal(`sanitized generator source hash ${filename}`, sha256(bytes), SOURCE_DATA_SHA256[filename]);
  return [filename, JSON.parse(bytes.toString("utf8"))];
}));
const sourceCalendarDays = [
  ...sourceData["mobile-r515-calendar-days-01-10.json"],
  ...sourceData["mobile-r515-calendar-days-11-20.json"],
  ...sourceData["mobile-r515-calendar-days-21-31.json"],
];
const sourceToday = sourceData["mobile-r515-today-wire.json"];
const sourceQimenNetwork = sourceData["mobile-r515-qimen-network-wire.json"];
for (const [key, value] of [
  ["today", sourceToday.today],
  ["todayHours", sourceToday.today_hours],
  ["todayDirections", sourceToday.today_directions],
  ["todayGoals", sourceToday.today_goals],
  ["calendar", { ...sourceData["mobile-r515-calendar-meta.json"], days: sourceCalendarDays }],
  ["network", sourceQimenNetwork.network],
  ["networkBulk", sourceQimenNetwork.network_bulk],
  ["qimenBasic", sourceQimenNetwork.qimen.basic],
  ["qimenProfessional", sourceQimenNetwork.qimen.professional],
  ["qimenSearch", sourceQimenNetwork.qimen.search],
]) {
  check(`sanitized generator source privacy ${key}`, scanFixturePrivacy(key, value).ok);
}

if (PRIVACY_ONLY) {
  runPrivacyAcceptance(COMMITTED_ROOT);
  console.log(`MOBILE_R515_FIXTURE_PRIVACY_OK checks=${passed}`);
  process.exit(0);
}

const negativeValues = buildFixtureSet();
const expectedHourRanges = [
  "23:00-01:00", "01:00-03:00", "03:00-05:00", "05:00-07:00",
  "07:00-09:00", "09:00-11:00", "11:00-13:00", "13:00-15:00",
  "15:00-17:00", "17:00-19:00", "19:00-21:00", "21:00-23:00",
];
equal("Today hours use the deployed twelve shichen ranges", negativeValues.todayHours.hours.map((hour) => hour.range), expectedHourRanges);
check(
  "Today hour labels are deployed quality labels rather than clock ranges",
  negativeValues.todayHours.hours.every((hour) => ["ดีมาก", "ดี", "กลาง", "ห้าม"].includes(hour.label)),
);
equal("Today Hours preserves the deployed wrapper bug as an explicit null profile context", negativeValues.todayHours.profile_context, null);
equal("Today Hours cannot claim personalized useful gods when the deployed wrapper omits profileId", [negativeValues.todayHours.yongshen, negativeValues.todayHours.jishen, negativeValues.todayHours.user_branch], [[], [], null]);
equal(
  "Today Hours uses the exact generic July 14 quality sequence from the deployed route",
  negativeValues.todayHours.hours.map((hour) => hour.quality),
  ["good", "ok", "ok", "ok", "ok", "ok", "ok", "bad", "ok", "ok", "ok", "ok"],
);
equal(
  "Today Hours uses the deployed generic July 14 windows",
  [negativeValues.todayHours.golden_window, negativeValues.todayHours.avoid_window, negativeValues.todayHours.calm_window],
  [
    { start: "23:00", end: "01:00" },
    { start: "13:00", end: "15:00" },
    { start: "01:00", end: "13:00" },
  ],
);
equal(
  "Today Hours does not freeze a capture-time current-hour marker into a deterministic fixture",
  negativeValues.todayHours.hours.filter((hour) => hour.isNow).length,
  0,
);
check(
  "Today direction layer signals use the deployed bounded signal alphabet",
  negativeValues.todayDirections.direction_energy.scores.every((row) => /^[+-]{2,5}$|^0$/.test(row.qimen.signal) && /^[+-]{2,5}$|^0$/.test(row.zibai.signal)),
);
equal("Today directions expose the deployed Chaibu label", negativeValues.todayDirections.direction_energy.school_label, "拆補 Chaibu");
equal("Today directions expose the deployed Qi Men source", negativeValues.todayDirections.direction_energy.source.qimen, "qimen-api");
equal("Today directions expose the deployed Zi Bai source", negativeValues.todayDirections.direction_energy.source.zibai, "local-luxing");
check("paid Today directions explicitly expose locked false", negativeValues.todayDirections.directions.every((row) => row.locked === false));

equal("Chart uses the deployed analysis ge_ju key", Object.hasOwn(negativeValues.chart.analysis, "ge_ju"), true);
check("Chart never emits the impossible analysis geJu alias", !Object.hasOwn(negativeValues.chart.analysis, "geJu"));
equal("Chart uses the deployed route source", negativeValues.chart.source, "/api/chart");
check("Chart includes its deployed product entitlement", negativeValues.chart.entitlement && typeof negativeValues.chart.entitlement.plan === "string");
check("Chart includes its deployed request context", negativeValues.chart.request_context && typeof negativeValues.chart.request_context === "object");
check("Chart ten-gods values preserve stem and ten_god objects", Object.values(negativeValues.chart.analysis.ten_gods_map).every((item) => typeof item.stem === "string" && typeof item.ten_god === "string"));
equal("Chart strength is the exact immutable-engine result for the synthetic pillars", negativeValues.chart.strength, { level: "very_weak", percent: 32 });
equal("Chart structure is coherent across every deployed projection", [negativeValues.chart.geJu, negativeValues.chart.ge_ju, negativeValues.chart.analysis.ge_ju], [
  { basis: "DM 甲 + 己 (hour) → earth", confidence: "high", raw_structure: "化土格", structure: "化土格" },
  { basis: "DM 甲 + 己 (hour) → earth", confidence: "high", raw_structure: "化土格", structure: "化土格" },
  { basis: "DM 甲 + 己 (hour) → earth", confidence: "high", raw_structure: "化土格", structure: "化土格" },
]);
equal("Chart element counts come from the same immutable synthetic pillars", negativeValues.chart.analysis.element_counts, { earth: 3.5, fire: 4.5, metal: 0.5, water: 1.5, wood: 2.5 });
equal("Chart yongshen matches the deployed post-scrub HTTP projection", negativeValues.chart.yongshen, [
  { element: "water", stem: "壬" },
  { element: "water", stem: "癸" },
  { element: "wood", stem: "甲" },
]);
equal("Premium Chart exposes all eight immutable-engine luck cycles", [negativeValues.chart.analysis.luck_pillars.length, negativeValues.chart.entitlement.luck_total, negativeValues.chart.entitlement.luck_visible], [8, 8, 8]);
check("Chart luck cycles use the deployed age_start key", negativeValues.chart.analysis.luck_pillars.every((item, index) => Number.isFinite(item.age_start) && item.original_index === index && !Object.hasOwn(item, "start_age")));
equal("Chart first luck cycle is the exact immutable-engine projection", negativeValues.chart.analysis.luck_pillars[0], {
  age_end: 16.8,
  age_end_detail: "16 ปี 9 เดือน 22 วัน",
  age_start: 6.81,
  age_start_detail: "6 ปี 9 เดือน 22 วัน",
  branch: "申",
  direction: "forward",
  direction_th: "เดินหน้า順",
  element: "fire",
  end_date: "1923-05-11",
  original_index: 0,
  qi_phase: "絕",
  start_date: "1913-05-11",
  stem: "丙",
  timing_method: "tyme4ts ChildLimit.fromSolarTime → age_start; date = birth datetime + age_start",
  year_end: 1923,
  year_start: 1912,
});
for (const key of ["luck_decade_drilldown", "lp_natal_interactions", "liu_nian_timeline"]) check(`Bounded Chart fixture omits ${key} instead of claiming a false empty engine result`, !Object.hasOwn(negativeValues.chart.analysis, key));

equal("Calendar uses the deployed route source", negativeValues.calendar.source, "/api/calendar");
equal(
  "Calendar preserves the mobile wrapper top-level profile summary",
  negativeValues.calendar.profile,
  { id: null, is_self: true, name: "Fixture Center", nickname: null },
);
equal("Calendar uses the deployed score policy", negativeValues.calendar.score_policy, "wrapper7-strict-primary");
check("Calendar uses a deployed score source", ["profile-db", "profile-db+wrapper-7", "profile-db+wrapper-6-fallback", "profile-db+wrapper-4", "universal-only"].includes(negativeValues.calendar.score_source));
equal("Calendar premium entitlement exposes all intents", negativeValues.calendar.entitlement.intents, "all");
check("Calendar entitlement includes allowed intents", Array.isArray(negativeValues.calendar.entitlement.allowed_intents) && negativeValues.calendar.entitlement.allowed_intents.length === 16);
check("Calendar entitlement includes locked intents", Array.isArray(negativeValues.calendar.entitlement.locked_intents));
equal("Calendar covers the full July month", [negativeValues.calendar.days.length, negativeValues.calendar.total_days], [31, 31]);
const july14 = negativeValues.calendar.days.find((day) => day.date === "2026-07-14");
equal("Calendar July 14 science matches deployed tyme4ts and Tongshu", [july14.pillar, july14.day_officer, july14.twelve_star, july14.twenty_eight_star, july14.nine_star], ["己丑", "破", "朱雀", "觜", 2]);
equal("Today science uses the same deployed July 14 pillars", negativeValues.today.pillars, { day: "己丑", month: "乙未", year: "丙午" });
equal(
  "Today July 14 hexagram is the exact deployed stem-branch projection",
  negativeValues.today.hex,
  {
    num: 33,
    zh: "遯",
    th: "ตุ้น · หลีก",
    en: "Retreat",
    symbol: "䷠",
    upper_zh: "艮",
    upper_th: "เกิ้น",
    lower_zh: "乾",
    lower_th: "เฉียน",
    changing_line: 2,
  },
);
equal("Calendar July 14 ten-god is computed against the fixture DM", july14.ten_god, "正財");
equal("Calendar July 14 universal hard-block is the exact deployed result", july14.universal_verdict, { score: 7, level: "avoid", hardBlocked: true });
equal(
  "Calendar July 14 universal intent status is neutral except the destruction-safe prayer/healing intent",
  july14.universal_intent_status,
  Object.fromEntries([
    "start_work", "sign_contract", "open_business", "negotiate", "invest", "loan",
    "marriage", "engagement", "gathering", "move_house", "construct", "renovate",
    "install_bed", "travel", "pray_heal", "medical",
  ].map((id) => [id, id === "pray_heal" ? "good" : "neutral"])),
);
equal(
  "Calendar July 14 universal intent score leaves use the deployed six-field envelope",
  Object.values(july14.intent_scores.universal).every((leaf) => (
    Object.keys(leaf).sort().join(",") === "level,personalScore,policy,score,status,universalScore"
  )),
  true,
);
equal("Calendar July 14 破-day universal score never exceeds its hard cap", july14.universal_verdict.score <= 30, true);
equal(
  "Calendar hard-block caps every non-health personal goal",
  ["wealth", "career", "love", "family", "travel"].every((goal) => july14.goals[goal] <= 35),
  true,
);
equal(
  "Calendar premium days retain a four-pillar hexagram object on every pillar",
  negativeValues.calendar.days.every((day) => ["year", "month", "day", "hour"].every((key) => {
    const hex = day.pillars_full?.[key]?.hex;
    return hex && Number.isInteger(hex.num) && typeof hex.zh === "string" && typeof hex.th === "string" && typeof hex.en === "string" && typeof hex.symbol === "string";
  })),
  true,
);
equal("Today preserves the full daily-verdict envelope", Object.keys(negativeValues.today.verdict).sort(), ["engine", "evidence", "flags", "jishen", "label", "legacy", "level", "raw", "score", "source", "tags", "targetDate", "yongshen"]);

equal("Network uses the deployed scoring version", negativeValues.network.version, "pair-reaction-v2");
check(
  "Network people retain every deployed pair-reaction-v2 score frame",
  negativeValues.network.people.every((person) => ["day", "week", "month", "year", "luck", "overall"].every((key) => Number.isFinite(person.scores?.[key]))),
);
check(
  "Network people retain deployed reading, guidance, and directional projections",
  negativeValues.network.people.every((person) => person.reading && person.guidance && Number.isFinite(person.directional?.atob) && Number.isFinite(person.directional?.btoa)),
);
equal("Successful Network Bulk always settles at least the reserved hour", negativeValues.networkBulk.spent >= 1, true);
equal("Datepick uses the deployed route source", negativeValues.datepick.source, "/api/auspicious");
check("Datepick includes the mobile wrapper people_ids field", Array.isArray(negativeValues.datepick.people_ids));
equal("Datepick strips the upstream Bangkok coordinates while retaining their deployed provenance", negativeValues.datepick.meta.eventLocation, { source: "default_bkk" });
check("Datepick premium entitlement exposes the complete deployed module allowlist", Array.isArray(negativeValues.datepick.meta.entitlement.modules_allowed) && negativeValues.datepick.meta.entitlement.modules_allowed.length === 20);
const expectedDatepickRequestedModules = [
  "ze_ri", "twelve_officers", "twenty_eight", "twelve_spirits", "nine_stars",
  "tai_sui", "qi_men", "he_luo", "hex64",
];
const expectedDatepickScoringModules = expectedDatepickRequestedModules.filter((key) => key !== "qi_men");
equal(
  "Datepick preserves the deployed scoring module projection (Qi Men is a guard, not a weighted score)",
  negativeValues.datepick.candidates[0].scoring.activeModules,
  expectedDatepickScoringModules,
);
equal(
  "Datepick candidate retains every hydrated universal module emitted by the deployed engine",
  Object.keys(negativeValues.datepick.candidates[0].modules).sort(),
  expectedDatepickRequestedModules.filter((key) => key !== "hex64").sort(),
);
check(
  "Datepick universal modules retain the deployed ModuleResult envelope",
  Object.entries(negativeValues.datepick.candidates[0].modules).every(([key, module]) => (
    module.module === key
    && module.status === "ready"
    && Number.isFinite(module.score?.normalized)
    && Array.isArray(module.tags)
    && Array.isArray(module.reasons?.up)
    && Array.isArray(module.reasons?.down)
    && Array.isArray(module.reasons?.warning)
    && module.raw && typeof module.raw === "object"
  )),
);

const expectedQimenPalaces = [
  [4, "SE", "巽", 1, 1], [9, "S", "離", 1, 2], [2, "SW", "坤", 1, 3],
  [3, "E", "震", 2, 1], [5, "C", "中", 2, 2], [7, "W", "兌", 2, 3],
  [8, "NE", "艮", 3, 1], [1, "N", "坎", 3, 2], [6, "NW", "乾", 3, 3],
];
for (const key of ["qimenBasic", "qimenProfessional"]) {
  equal(
    `${key} binds canonical palace IDs to the deployed Lo-Shu grid`,
    negativeValues[key].data.palaces.map((palace) => [palace.palace_id, palace.direction, palace.trigram_zh, palace.grid_row, palace.grid_col]),
    expectedQimenPalaces,
  );
  equal(`${key} uses the deployed dun enum`, negativeValues[key].data.chart.dun_type, "yin");
  equal(`${key} uses the deployed chief-star code`, negativeValues[key].data.chart.chief_star_code, "TIAN_QIN");
  equal(`${key} uses the deployed value-door code`, negativeValues[key].data.chart.zhi_shi_door_code, "SI_MEN");
  equal(`${key} exposes the deployed source`, negativeValues[key].source, "qimen-api");
  check(`${key} exposes deployed upstream input provenance`, negativeValues[key].input && negativeValues[key].input.school === "chaibu");
  check(`${key} does not claim undeployed entitlement revision`, !Object.hasOwn(negativeValues[key], "entitlement") && !Object.hasOwn(negativeValues[key].request_context, "entitlement_revision"));
  equal(
    `${key} retains the exact deployed engine display score sequence`,
    negativeValues[key].data.palaces.map((palace) => palace.display_score),
    [0, 0, 70, 0, 14, 3, 2, 0, 29],
  );
  equal(
    `${key} retains the exact deployed engine display level sequence`,
    negativeValues[key].data.palaces.map((palace) => palace.display_level),
    ["L6", "L6", "L2", "L6", "L5", "L6", "L6", "L6", "L5"],
  );
  equal(
    `${key} retains the exact deployed engine door-quality sequence`,
    negativeValues[key].data.palaces.map((palace) => palace.door_quality),
    ["severe", "inauspicious", "great_auspicious", "auspicious", "contextual", "great_auspicious", "contextual", "inauspicious", "great_auspicious"],
  );
}
check(
  "Qimen professional layers are active for deployed consumers",
  negativeValues.qimenProfessional.data.palaces.every((palace) => palace.advanced_qimen_layers.every((layer) => layer.active === true)),
);
equal("Qimen search datetime matches the deployed timezone-free wire", negativeValues.qimenSearch.top[0].datetime, "2026-07-15T06:00:00");
equal(
  "Qimen search cannot return a 破 row while the deployed Jianchu hard filter is enabled",
  negativeValues.qimenSearch.top.some((row) => row.tongshu?.day_officer === "破") && negativeValues.qimenSearch.filters.useJianchu,
  false,
);

equal("Luopan bootstrap uses only the deployed entitlement keys", Object.keys(negativeValues.luopanBootstrap.entitlement).sort(), ["house_limit", "mode", "multi_profile", "pins", "plan", "sifu", "vision", "vision_limit"]);
check("Luopan bootstrap does not claim undeployed request context", !Object.hasOwn(negativeValues.luopanBootstrap, "request_context"));

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
equal("contract privacy errors use a constant redacted pointer", privateFailure, {
  error: "fixture_contract today /privacy",
  ok: false,
});
const keyLeakPayload = structuredClone(negativeValues.today);
keyLeakPayload.authToken__REAL_SECRET_123456789 = "value";
check("contract privacy errors never echo hostile property keys", !JSON.stringify(validateFixture("today", keyLeakPayload)).includes("REAL_SECRET"));
const extraShapePayload = structuredClone(negativeValues.today);
extraShapePayload.unreviewed = "synthetic-looking-but-unknown";
equal("contract rejects additional fixture properties", validateFixture("today", extraShapePayload), {
  error: "fixture_contract today /shape",
  ok: false,
});
for (const [key, mutate] of [
  ["today", (value) => { value.verdict.score = 999999; }],
  ["qimenBasic", (value) => { value.data.chart.ju_number = 999999; }],
  ["datepick", (value) => { value.candidates[0].scoring.finalScore = 999999; }],
  ["calendar", (value) => { value.year = 999999; }],
  ["qimenProfessional", (value) => { value.data.palaces[0].advanced_qimen_layers[0].active = false; }],
  ["sifuGroup", (value) => { value.balance_after = -999999; }],
]) {
  const mutation = structuredClone(negativeValues[key]);
  mutate(mutation);
  equal(`contract rejects scalar semantic drift in ${key}`, validateFixture(key, mutation), {
    error: `fixture_contract ${key} /shape`,
    ok: false,
  });
}
for (const mutate of [
  (value) => { value.events[1].data.delta = "private medical question"; },
  (value) => { value.events[0].data.payload = { body: "private financial question" }; },
  (value) => { value.events[0].data.source = canaryPersonName; },
]) {
  const mutation = structuredClone(negativeValues.sifuChatStream);
  mutate(mutation);
  check("Sifu SSE contract rejects every unreviewed nested property", !validateFixture("sifuChatStream", mutation).ok);
}
const mismatchedSet = structuredClone(negativeValues);
mismatchedSet.todayGoals.goals.wealth += 1;
equal("cross-fixture goal mismatch is rejected at the set boundary", validateFixtureSet(mismatchedSet), {
  error: "fixture_contract set /goals",
  ok: false,
});
const mismatchedIntentSet = structuredClone(negativeValues);
mismatchedIntentSet.todayGoals.intent_status.start_work = "good";
equal("Today Goals intent status must match the selected Calendar day", validateFixtureSet(mismatchedIntentSet), {
  error: "fixture_contract set /intent-status",
  ok: false,
});

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
[reorderedStream.events[1], reorderedStream.events[2]] = [reorderedStream.events[2], reorderedStream.events[1]];
check("stream contract rejects reordered events", !validateFixture("sifuChatStream", reorderedStream).ok);
for (const mutate of [
  (value) => { [value.events[1].event, value.events[2].event] = [value.events[2].event, value.events[1].event]; },
  (value) => { value.events.splice(2, 1); },
  (value) => { value.events.push(structuredClone(value.events[2])); },
  (value) => { value.events[3].event = "chunk"; },
  (value) => { value.events[1].data.text = "private reply"; },
  (value) => { value.events[3].data.reply = "private reply"; },
]) {
  const mutation = structuredClone(negativeValues.sifuChatStream);
  mutate(mutation);
  const result = validateFixture("sifuChatStream", mutation);
  check("stream contract rejects malformed event sequence", !result.ok);
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
check("Luopan bootstrap excludes the frozen entitlement request context", !Object.hasOwn(negativeValues.luopanBootstrap, "request_context"));
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
equal("Qimen basic uses a coherent deployed free product", negativeValues.qimenBasic.product.plan, "free");
equal("Qimen basic deployed product detail", negativeValues.qimenBasic.product.qimen.detail, "basic");
equal("Qimen professional uses a coherent deployed master product", negativeValues.qimenProfessional.product.plan, "master");
equal("Qimen professional deployed product detail", negativeValues.qimenProfessional.product.qimen.detail, "technical");
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
  equal("manifest binds the immutable deployed r515 source", manifest.sourceProvenance, {
    capturedAt: "2026-07-13T14:27:59.994Z",
    declaredSourceCodeCommit: "f1c849bd74dcfa6998e44553f2591f3789ac3429",
    declaredSourceHead: "cb1fb9e9815d25eccb9f29048f24d0a46a22c310",
    receiptKeysSha256: "6c25c9b74050cf5e6d258b403bbeb741f758d2ea66a8e9a9252be84b80d1e845",
    receiptSha256: "75f618f992db61aae2204ab441ed348b3275f9f80921c27a68d97864f9a97572",
    releaseId: "decode-app-r515-mobile-api",
  });
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
