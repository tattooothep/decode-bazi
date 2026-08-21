"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE_DIGEST = "987997fa7ee6cbd148c337272975ac14c3b7e720f392d7671f93549b9315a460";
const SOURCE_BYTE_SIZE = 10629;
const DEFAULT_EVIDENCE_PATH = path.resolve(
  __dirname,
  "../../data/library/qmdj/qimen-faqiao-c4-source-excerpts.md",
);

const LAYERS = Object.freeze({
  month: Object.freeze({
    calculationVersion: "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1",
    sourceFamily: "QIMEN_FAQIAO_FEIPAN",
    method: "yuejia",
    decisionRole: "raw_context_only",
  }),
  day: Object.freeze({
    calculationVersion: "QIMEN_FAQIAO_FEIPAN_RIJIA_CHAIBU_V1",
    sourceFamily: "QIMEN_FAQIAO_FEIPAN",
    method: "rijia_chai_bu",
    decisionRole: "raw_context_only",
  }),
  hour: Object.freeze({
    calculationVersion: "EXISTING_ALLOWLISTED_ZHUANPAN_SHIJIA_CHAIBU",
    sourceFamily: "SOURCE_VERIFIED_ZHUANPAN_SHIJIA",
    method: "chai_bu_true_solar_time",
    decisionRole: "sole_action_authority",
  }),
});

const MANIFEST = Object.freeze({
  schemaVersion: 1,
  producerEnabled: false,
  source: Object.freeze({
    digest: SOURCE_DIGEST,
    byteSize: SOURCE_BYTE_SIZE,
    editionStatus: "pinned_ctext_transcription_base_edition_unknown",
  }),
  layers: LAYERS,
});

function canonicalError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function loadCanonicalSourceManifest() {
  return MANIFEST;
}

function assertAllowedContextVersion(layer, calculationVersion) {
  if (layer !== "month" && layer !== "day") {
    throw canonicalError("QIMEN_CANONICAL_VERSION_NOT_ALLOWED");
  }
  if (calculationVersion !== LAYERS[layer].calculationVersion) {
    throw canonicalError("QIMEN_CANONICAL_VERSION_NOT_ALLOWED");
  }
  return calculationVersion;
}

function verifyCanonicalSourceEvidence(evidencePath = DEFAULT_EVIDENCE_PATH) {
  let bytes;
  try {
    bytes = fs.readFileSync(evidencePath);
  } catch {
    throw canonicalError("QIMEN_CANONICAL_SOURCE_DIGEST_MISMATCH");
  }
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== SOURCE_BYTE_SIZE || digest !== SOURCE_DIGEST) {
    throw canonicalError("QIMEN_CANONICAL_SOURCE_DIGEST_MISMATCH");
  }
  return Object.freeze({ digest, byteSize: bytes.byteLength });
}

module.exports = Object.freeze({
  assertAllowedContextVersion,
  loadCanonicalSourceManifest,
  verifyCanonicalSourceEvidence,
});
