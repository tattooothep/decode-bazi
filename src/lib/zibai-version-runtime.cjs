const V2 = "zibai-zaoming-true-solar-v2";
const V3 = "zibai-zaoming-true-solar-v3";
const LEGACY_CALCULATION_VERSION = V2;
const ACTIVE_CALCULATION_VERSION = V2;
const READABLE_CALCULATION_VERSIONS = Object.freeze([V2, V3]);
const READABLE_SET = new Set(READABLE_CALCULATION_VERSIONS);
const REFERENCE_PATTERN = /^zibai\|(\d{4}-\d{2}-\d{2})\|(daily|zi|chou|yin|mao|chen|si|wu|wei|shen|you|xu|hai)\|(zibai-zaoming-true-solar-v[23])$/u;

function isReadableCalculationVersion(value) {
  return typeof value === "string" && READABLE_SET.has(value);
}

function parseReferenceId(value) {
  if (typeof value !== "string") return null;
  const match = REFERENCE_PATTERN.exec(value);
  if (!match || !isReadableCalculationVersion(match[3])) return null;
  return Object.freeze({ apparentSolarDate: match[1], slot: match[2], calculationVersion: match[3] });
}

function isMatchedReference(referenceId, calculationVersion) {
  const parsed = parseReferenceId(referenceId);
  return parsed !== null && parsed.calculationVersion === calculationVersion;
}

// Capability V3 is cumulative: the V224 parser reads both V2 and V3.  V2
// clients must never receive V3.
function supportsCalculationVersion(capability, calculationVersion) {
  if (!isReadableCalculationVersion(capability) || !isReadableCalculationVersion(calculationVersion)) return false;
  return calculationVersion === V2 || capability === V3;
}

module.exports = Object.freeze({
  ACTIVE_CALCULATION_VERSION,
  LEGACY_CALCULATION_VERSION,
  READABLE_CALCULATION_VERSIONS,
  isMatchedReference,
  isReadableCalculationVersion,
  parseReferenceId,
  supportsCalculationVersion,
});
