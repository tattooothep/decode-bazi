import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ZIWEI_HOURLY_LINEAGE_MANIFEST } from "../src/lib/astro/ziwei/hourly-lineage";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sourceContract = require("../src/lib/ziwei-hourly-source-contract.cjs");

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const expected = [ZIWEI_HOURLY_LINEAGE_MANIFEST.artifact, ...ZIWEI_HOURLY_LINEAGE_MANIFEST.dependencySnapshot];
expected.push(ZIWEI_HOURLY_LINEAGE_MANIFEST.calculationRuntime);
for (const item of expected) {
  const locked = lock.packages[`node_modules/${item.package}`];
  assert.equal(locked?.version, item.version, `${item.package} version drift`);
  assert.equal(locked?.integrity, item.integrity, `${item.package} integrity drift`);
}
for (const source of ZIWEI_HOURLY_LINEAGE_MANIFEST.calculationRuntime.sources) {
  const actual = createHash("sha256").update(readFileSync(source.path)).digest("hex");
  assert.equal(actual, source.sha256, `${source.path} source drift`);
}
assert.equal(ZIWEI_HOURLY_LINEAGE_MANIFEST.config.dayDivide, "forward");
assert.equal(ZIWEI_HOURLY_LINEAGE_MANIFEST.timeBoundary.policy, "forward_zi");
assert.equal(ZIWEI_HOURLY_LINEAGE_MANIFEST.timeBoundary.civilBoundaryResolution,
  "earliest exact instant on folds; transition instant for gaps");
assert.equal(ZIWEI_HOURLY_LINEAGE_MANIFEST.timeBoundary.realizedWindow,
  "one half-open interval from exact civil boundaries; elapsed duration follows timezone transitions");
assert.equal(ZIWEI_HOURLY_LINEAGE_MANIFEST.timeBoundary.admissionEnvelope,
  "exact boundary recomputation; no arbitrary elapsed-duration cap");
assert.deepEqual(ZIWEI_HOURLY_LINEAGE_MANIFEST.natalInputPolicy, {
  persistedWallClock: "birth_datetime anchored at Asia/Bangkok; birth_tz supplies actual interpretation",
  timezoneResolution: "exact fixed offset deterministic; IANA/UTC domain with gap/fold and historical sub-minute offsets rejected",
  lateZi: "23:00-23:59 unsupported for natal input",
  calendarRange: "1900-01-31..2100-12-31 inclusive",
});
const manifestDigest = createHash("sha256")
  .update(sourceContract.canonicalStringify(ZIWEI_HOURLY_LINEAGE_MANIFEST))
  .digest("hex");
assert.equal(sourceContract.SOURCE_DIGEST, manifestDigest,
  "the CJS delivery/scheduler contract must expose the exact locked lineage digest");
assert.equal(ZIWEI_HOURLY_LINEAGE_MANIFEST.claim, "named_software_lineage_not_classical_consensus");
console.log("PASS ziwei hourly lineage manifest — oracle graph, calculation runtime and source hashes pinned");
