"use strict";

// Generated from the canonicalized ZIWEI_HOURLY_LINEAGE_MANIFEST. CJS
// consumers (scheduler and delivery retry policy) import this one contract;
// tests lock it back to the TypeScript manifest and migration literal.
const SOURCE_DIGEST = "1da9d5d7f78e4bcfb3cff35c0764fc502384292f8ab5c5a3da0228f763d7f9db";

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

module.exports = Object.freeze({ SOURCE_DIGEST, canonicalStringify });
