#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIXTURE_SPECS,
  SYNTHETIC_REPLY,
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

function parseFixtureDirectory(root) {
  return Object.fromEntries(FIXTURE_SPECS.map((spec) => [
    spec.key,
    JSON.parse(readFileSync(path.join(root, spec.filename), "utf8")),
  ]));
}

function runPrivacyAcceptance(root) {
  const values = parseFixtureDirectory(root);
  for (const spec of FIXTURE_SPECS) {
    const result = scanFixturePrivacy(spec.key, values[spec.key]);
    check(`privacy ${spec.filename}`, result.ok);
  }

  const allBytes = FIXTURE_SPECS
    .map((spec) => readFileSync(path.join(root, spec.filename), "utf8"))
    .join("\n");
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
  check("fixture bytes contain no email address", !emailPattern.test(allBytes));
  check("fixture bytes contain no UUID", !uuidPattern.test(allBytes));
}

if (PRIVACY_ONLY) {
  runPrivacyAcceptance(COMMITTED_ROOT);
  console.log(`MOBILE_R515_FIXTURE_PRIVACY_OK checks=${passed}`);
  process.exit(0);
}

const expectedFilenames = [
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

equal("catalog has the exact 30 basenames", FIXTURE_SPECS.map((spec) => spec.filename), expectedFilenames);
equal(
  "catalog covers every required family",
  [...new Set(FIXTURE_SPECS.map((spec) => spec.family))].sort(),
  ["calendar", "chart", "datepick", "directions", "goals", "hours", "luopan", "network", "qimen", "sifu", "today"],
);
check("every fixture is committed JSON", FIXTURE_SPECS.every((spec) => spec.filename.endsWith(".sanitized.json")));

const routePaths = new Set();
for (const spec of FIXTURE_SPECS) {
  routePaths.add(spec.endpoint.replace(/\?.*$/, ""));
  for (const alias of spec.aliases || []) routePaths.add(alias.replace(/\?.*$/, ""));
}
equal("catalog covers 27 route paths", routePaths.size, 27);

const byKey = Object.fromEntries(FIXTURE_SPECS.map((spec) => [spec.key, spec]));
equal("saved-date creation status is 201", byKey.datepickSave.status, 201);
equal("Luopan measurement creation status is 201", byKey.luopanMeasurementsPost.status, 201);
equal("Sifu stream content type is SSE", byKey.sifuChatStream.contentType, "text/event-stream");
equal("Sifu stream cache policy is no-cache", byKey.sifuChatStream.cacheControl, "no-cache");

equal("canonical JSON sorts keys and ends in LF", canonicalJson({ z: 1, a: { y: 2, b: 3 } }), '{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}\n');
assert.throws(() => canonicalJson({ value: Number.NaN }), /fixture_non_finite/);
assert.throws(() => canonicalJson(Object.create({ inherited: true })), /fixture_non_plain_object/);
passed += 2;
console.log("PASS canonical JSON rejects unsafe values");

const emailCanary = ["fixture.person", "invalid.test"].join(String.fromCharCode(64));
const opaqueId = ["11111111", "1111", "4111", "8111", "111111111111"].join("-");
check("privacy rejects email values", !scanFixturePrivacy("canary", { contact: emailCanary }).ok);
check("privacy rejects opaque profile identifiers", !scanFixturePrivacy("canary", { profile_id: opaqueId }).ok);
check("privacy rejects authorization material", !scanFixturePrivacy("canary", { authorization: "private-value" }).ok);
check("privacy rejects arbitrary reply text", !scanFixturePrivacy("canary", { reply: "private reply" }).ok);
check("privacy permits the fixed synthetic reply", scanFixturePrivacy("canary", { reply: SYNTHETIC_REPLY }).ok);
check(
  "privacy permits scientific names",
  scanFixturePrivacy("canary", { star_name_th: "ดาวตัวอย่าง", mountain: { name: "子" } }).ok,
);

const first = mkdtempSync(path.join(tmpdir(), "hourkey-r515-fixtures-a-"));
const second = mkdtempSync(path.join(tmpdir(), "hourkey-r515-fixtures-b-"));

try {
  const firstResult = buildMobileR515Fixtures(first);
  const secondResult = buildMobileR515Fixtures(second);
  equal("builder reports 30 fixtures", firstResult.count, 30);
  equal("two builds report the same manifest hash", firstResult.manifestSha256, secondResult.manifestSha256);

  const expectedEntries = [...expectedFilenames, "README.md", "manifest.json"].sort();
  equal("builder emits only the approved files", readdirSync(first).sort(), expectedEntries);
  equal("second build emits the same file set", readdirSync(second).sort(), expectedEntries);

  for (const filename of expectedEntries) {
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

runPrivacyAcceptance(COMMITTED_ROOT);
console.log(`MOBILE_R515_FIXTURES_OK checks=${passed} count=${FIXTURE_SPECS.length}`);
