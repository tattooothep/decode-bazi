"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE_DIGEST = "987997fa7ee6cbd148c337272975ac14c3b7e720f392d7671f93549b9315a460";
const SOURCE_BYTE_SIZE = 10629;
const HOUR_ENGINE_CONTRACT_VERSION = "QIMEN_HOUR_ENGINE_CANONICAL_CLOCKS_V3";
const HOUR_ENGINE_SOURCE_SHA256 = "8b7bc051f9532cde59cf578af1034ef6626a8350c1d43b5549f9fe92098d1ed1";
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
    calculationVersion: "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1",
    sourceFamily: "QIMEN_FAQIAO_FEIPAN",
    method: "rijia_four_qi_term_boundary",
    boundaryPolicy: "ASTRONOMICAL_TERM_INSTANT_HALF_OPEN_NO_CARRY_V1",
    sourceLimitation: "nominal_four_qi_transition_profile_not_chai_bu_fu_head",
    decisionRole: "raw_context_only",
  }),
  hour: Object.freeze({
    calculationVersion: "QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_V1",
    sourceFamily: "SOURCE_VERIFIED_ZHUANPAN_SHIJIA",
    method: "chai_bu_true_solar_time",
    engineContractVersion: HOUR_ENGINE_CONTRACT_VERSION,
    engineSourceDigest: HOUR_ENGINE_SOURCE_SHA256,
    engineProfileId: 1,
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

function assertAllowedHourEngineContract(value) {
  if (!value || typeof value !== "object"
    || value.version !== HOUR_ENGINE_CONTRACT_VERSION
    || value.source_sha256 !== HOUR_ENGINE_SOURCE_SHA256
    || value.profile_id !== 1
    || value.apparent_timeline !== "UTC_PLUS_LONGITUDE_EOT_MONOTONIC_V1"
    || value.equation_of_time !== "NOAA_CONTINUOUS_TROPICAL_PHASE_V1"
    || value.year_month_clock !== "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1"
    || value.day_boundary_policy !== "TRUE_SOLAR_MIDNIGHT_ZI_HOUR_23_V1") {
    throw canonicalError("QIMEN_HOUR_ENGINE_CONTRACT_NOT_ALLOWED");
  }
  return true;
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
  assertAllowedHourEngineContract,
  loadCanonicalSourceManifest,
  verifyCanonicalSourceEvidence,
});
