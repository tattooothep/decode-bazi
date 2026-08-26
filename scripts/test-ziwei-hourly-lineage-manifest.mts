import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ZIWEI_HOURLY_LINEAGE_MANIFEST } from "../src/lib/astro/ziwei/hourly-lineage";

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
assert.equal(ZIWEI_HOURLY_LINEAGE_MANIFEST.claim, "named_software_lineage_not_classical_consensus");
console.log("PASS ziwei hourly lineage manifest — oracle graph, calculation runtime and source hashes pinned");
