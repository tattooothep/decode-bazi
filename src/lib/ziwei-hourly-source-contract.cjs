"use strict";

// Generated from the canonicalized ZIWEI_HOURLY_LINEAGE_MANIFEST. CJS
// consumers (scheduler and delivery retry policy) import this one contract;
// tests lock it back to the TypeScript manifest and migration literal.
const SOURCE_DIGEST = "b311fc6a4ff531c7b97ac80ae9d586c95008b929151b2b5115aabd0b49486b0a";

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

module.exports = Object.freeze({ SOURCE_DIGEST, canonicalStringify });
