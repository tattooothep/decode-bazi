"use strict";

const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { SOURCE_DIGEST: ZIWEI_HOURLY_SOURCE_DIGEST } = require("./ziwei-hourly-source-contract.cjs");

const RUNTIME_SOURCES = Object.freeze([
  Object.freeze({ path: "src/lib/astro/ziwei/engine.ts", sha256: "d861f4baabce4c6547d7d6b92ebce6324d3fa8c66254bb6213b7b2e2fd4835bc" }),
  Object.freeze({ path: "src/lib/astro/ziwei/tables.ts", sha256: "b77d14dea17ac91b646c5711515dcff4a72179540f3162098d3ebb8b8e4e4c8c" }),
  Object.freeze({ path: "src/lib/astro/ziwei/hourly-preview.ts", sha256: "6e8f11f27f75442d06419e4111aa5269a1dd1fd82183cdadd903ea014dfba60a" }),
  Object.freeze({ path: "src/lib/birth-timezone.ts", sha256: "fbe1ac54f179a575c088d1d9e6722dda4b414b7fdf85b842c681f296474398c1" }),
]);

function verifyZiweiRuntimeSources(options = {}) {
  const readFile = options.readFile || readFileSync;
  const repositoryRoot = options.repositoryRoot || process.cwd();
  return RUNTIME_SOURCES.every((source) => {
    try {
      return createHash("sha256")
        .update(readFile(join(/* turbopackIgnore: true */ repositoryRoot, source.path)))
        .digest("hex") === source.sha256;
    } catch {
      return false;
    }
  });
}

function readZiweiRuntimeContext(env = process.env, options = {}) {
  const verifySources = options.verifySources || verifyZiweiRuntimeSources;
  return Object.freeze({
    producerEnabled: env.ZIWEI_HOURLY_PRODUCER_ENABLED === "1",
    backendCommit: String(env.HOURKEY_RELEASE_COMMIT || "").trim(),
    sourceReady: verifySources(options) === true,
    sourceDigest: ZIWEI_HOURLY_SOURCE_DIGEST,
  });
}

module.exports = Object.freeze({
  ZIWEI_HOURLY_SOURCE_DIGEST,
  readZiweiRuntimeContext,
  verifyZiweiRuntimeSources,
});
