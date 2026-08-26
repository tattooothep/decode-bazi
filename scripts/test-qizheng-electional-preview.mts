import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildQizhengElectionalPreview } from "../src/lib/astro/qizheng/electional-preview";
import {
  QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS,
  QIZHENG_ELECTIONAL_SOURCE_DIGEST,
  QIZHENG_ELECTIONAL_SOURCE_VERSION,
} from "../src/lib/astro/qizheng/electional-source-manifest";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

assert.equal(createHash("sha256").update(canonical({
  sourceEvidenceVersion: QIZHENG_ELECTIONAL_SOURCE_VERSION,
  artifacts: QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS,
})).digest("hex"), QIZHENG_ELECTIONAL_SOURCE_DIGEST);

const input = {
  candidateInstant: new Date("2026-09-01T12:30:00.000Z"),
  candidateTimezone: "Asia/Bangkok",
  candidateLocation: { lat: 13.7563, lng: 100.5018 },
  activity: "directional_repair" as const,
  directionDeg: 315,
  sourceEvidenceVersion: "yangzhai-dacheng-xuanshi-xiufang-v7-v16-artifacts-v4" as const,
};

const first = buildQizhengElectionalPreview(input);
const second = buildQizhengElectionalPreview(input);
assert.deepEqual(first, second);
assert.equal(first.discipline, "qizheng");
assert.equal(first.mode, "electional-preview");
assert.equal(first.scope, "candidate_local_sky");
assert.equal(first.personalization, "none_profile_access_control_only");
assert.equal(first.decisionSupported, false);
assert.equal(first.verdict, null);
assert.deepEqual(first.ranking, []);
assert.equal(first.notificationEligible, false);
assert.equal(first.astronomy.sevenPhysicalBodies.length, 7);
assert.equal(first.astronomy.calculatedPoints.every((point) => point.kind === "calculated_point"), true);
assert.equal(first.astronomy.calculatedPoints.every((point) => !("altitudeDeg" in point) && !("azimuthDeg" in point)), true);
assert.deepEqual(first.astronomy.sevenPhysicalBodies.map((point) => point.key), ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]);
assert.deepEqual(first.astronomy.calculatedPoints.map((point) => point.key), ["Rahu", "Ketu", "Yuebo"]);
assert.equal("location" in first.candidate, false);
assert.deepEqual(first.sourceCoverage.presentVolumes, [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
assert.deepEqual(first.sourceCoverage.missingVolumes, []);
assert.equal(first.sourceCoverage.artifacts.length, 10);
assert.deepEqual(first.sourceCoverage.artifacts.map((artifact) => artifact.volume), [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
assert.equal(first.sourceCoverage.artifacts.every((artifact) => artifact.license === "Public domain"), true);
assert.equal(first.sourceCoverage.artifacts.every((artifact) => /^[0-9a-f]{64}$/u.test(artifact.pdfSha256)), true);
assert.equal(first.sourceCoverage.artifacts.find((artifact) => artifact.volume === 13)?.title,
  "陽宅大成·青江修方案證", "volume 13 provenance must reproduce the scanned cover title exactly");
assert.equal(first.sourceCoverage.sourceDigest, QIZHENG_ELECTIONAL_SOURCE_DIGEST);
assert.deepEqual(first.sourceCoverage.references.map((reference) => reference.volume), [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
assert.equal(first.sourceCoverage.rulesTranscribed, false,
  "acquiring every scan must not silently promote unverified OCR to an electional rule pack");
assert.equal(first.missingEvidence.includes("source_volumes_8_9_11"), false);
assert.equal(first.notificationEligible, false);
for (const forbidden of ["score", "quality", "best", "lucky", "auspicious"]) {
  assert.equal(forbidden in first, false);
}

assert.throws(() => buildQizhengElectionalPreview({ ...input, candidateTimezone: "" }), /qizheng_preview_invalid_timezone/);
assert.throws(() => buildQizhengElectionalPreview({ ...input, candidateInstant: new Date(Number.NaN) }), /qizheng_preview_invalid_instant/);
assert.throws(() => buildQizhengElectionalPreview({ ...input, directionDeg: Number.NaN }), /qizheng_preview_invalid_direction/);
assert.throws(() => buildQizhengElectionalPreview({ ...input, sourceEvidenceVersion: "wrong" as never }), /qizheng_preview_invalid_source_version/);

console.log("PASS qizheng electional preview — factual sky only, no verdict/ranking/push");
