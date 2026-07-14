#!/usr/bin/env node

import {
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  FIXTURE_SPECS,
  buildFixtureSet,
  canonicalJson,
  sha256,
} from "./lib/mobile-r515-fixture-contract.mjs";

const README = `# Mobile r515 sanitized fixtures

This directory contains deterministic synthetic response contracts for the mobile r515 surfaces.

- They are generated from code and never captured from production.
- Personal identity, contact, account, credential, private conversation, image, and exact-location values are absent.
- Scientific labels, entitlement states, response status, and display-safe synthetic values are retained for contract testing.
- Entitlement variants use coherent free-post-trial, premium-active, and master-active scenarios; their hashes are deterministic synthetic projections, never production hashes.
- Run \`node scripts/test-mobile-r515-fixtures.mjs\` from the repository root before adoption.
- Jarvis must update the mobile fixture allowlist separately; this backend handoff does not modify the mobile worktree.
`;

function approvedNames() {
  return new Set([
    ...FIXTURE_SPECS.map((spec) => spec.filename),
    "README.md",
    "manifest.json",
  ]);
}

function ensureOutputDirectory(outputDir) {
  mkdirSync(outputDir, { recursive: true, mode: 0o755 });
  const stat = lstatSync(outputDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("fixture_output_not_directory");
  const approved = approvedNames();
  const approvedTemporary = new Set([...approved].map((name) => `.${name}.tmp`));
  for (const name of readdirSync(outputDir)) {
    const child = lstatSync(path.join(outputDir, name));
    if (approvedTemporary.has(name)) {
      if (!child.isFile() || child.isSymbolicLink()) throw new Error("fixture_output_temp_unsafe");
      rmSync(path.join(outputDir, name), { force: true });
      continue;
    }
    if (!approved.has(name)) throw new Error("fixture_output_unknown");
    if (!child.isFile() || child.isSymbolicLink()) throw new Error("fixture_output_unsafe");
  }
}

function writeAtomic(outputDir, filename, bytes) {
  const temporary = path.join(outputDir, `.${filename}.tmp`);
  const destination = path.join(outputDir, filename);
  rmSync(temporary, { force: true });
  writeFileSync(temporary, bytes, { encoding: "utf8", flag: "wx", mode: 0o644 });
  renameSync(temporary, destination);
}

export function buildMobileR515Fixtures(outputDir) {
  if (typeof outputDir !== "string" || !outputDir.trim()) throw new Error("fixture_output_required");
  const resolved = path.resolve(outputDir);
  ensureOutputDirectory(resolved);

  const values = buildFixtureSet();
  const manifestEntries = [];

  for (const spec of FIXTURE_SPECS) {
    const bytes = canonicalJson(values[spec.key]);
    writeAtomic(resolved, spec.filename, bytes);
    manifestEntries.push({
      aliases: [...spec.aliases],
      bytes: Buffer.byteLength(bytes),
      cacheControl: spec.cacheControl,
      contentType: spec.contentType,
      endpoint: spec.endpoint,
      family: spec.family,
      filename: spec.filename,
      key: spec.key,
      method: spec.method,
      removedClasses: [...spec.removedClasses],
      retainedClasses: [...spec.retainedClasses],
      sha256: sha256(bytes),
      status: spec.status,
      syntheticPlan: spec.syntheticPlan,
      variant: spec.variant,
    });
  }

  const manifest = {
    fixtureCount: FIXTURE_SPECS.length,
    fixtures: manifestEntries,
    generatedAt: "2026-07-14T00:00:00.000Z",
    rawStoredInGit: false,
    schema: "hourkey-mobile-r515-fixtures/v1",
    sourceClass: "deterministic-synthetic-contract",
    sourceRelease: "r515",
  };
  const manifestBytes = canonicalJson(manifest);
  writeAtomic(resolved, "manifest.json", manifestBytes);
  writeAtomic(resolved, "README.md", README);

  return {
    count: FIXTURE_SPECS.length,
    manifestSha256: sha256(manifestBytes),
    outputDir: resolved,
  };
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--output-dir" || !argv[1]) {
    throw new Error("usage: node scripts/build-mobile-r515-fixtures.mjs --output-dir <directory>");
  }
  return argv[1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = buildMobileR515Fixtures(parseArguments(process.argv.slice(2)));
    console.log(`MOBILE_R515_FIXTURES_BUILT count=${result.count} manifest_sha256=${result.manifestSha256}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "fixture_build_failed");
    process.exitCode = 1;
  }
}
