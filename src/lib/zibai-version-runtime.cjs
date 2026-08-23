const V2 = "zibai-zaoming-true-solar-v2";
const V3 = "zibai-zaoming-true-solar-v3";
const ACTIVE_CALCULATION_VERSION = V3;
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

module.exports = Object.freeze({
  ACTIVE_CALCULATION_VERSION,
  READABLE_CALCULATION_VERSIONS,
  isMatchedReference,
  isReadableCalculationVersion,
  parseReferenceId,
});
