import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { METADATA_ORDER_POLICY, normalizeKnownNextMetadata } from "./remediation-next-metadata-order.mts";

const require = createRequire(import.meta.url);
const { computeBuildArtifactDigest } = require("../notification-observability-preflight.cjs") as {
  computeBuildArtifactDigest: (releaseRoot: string) => string;
};
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

// Unlike either historical normalized policy this records raw bytes, modes,
// traces, cache and resolved allowed dependency files. It is only a bounded
// before/after continuity check, not a continuous mutation journal or archive.
function rawInputDigest(releaseRoot: string): string {
  const records: string[] = [];
  const ancestors = new Set<string>();
  const visit = (path: string, relative: string): void => {
    const stats = lstatSync(path);
    const mode = (stats.mode & 0o7777).toString(8);
    if (stats.isSymbolicLink()) {
      const target = readlinkSync(path);
      const match = /^\.\.\/\.\.\/node_modules\/(pg|sharp)$/u.exec(target);
      assert.ok(match, `unexpected artifact symlink: ${relative}`);
      const resolved = realpathSync(path);
      assert.equal(resolved, realpathSync(join(releaseRoot, "node_modules", match[1])));
      assert.equal(statSync(resolved).isDirectory(), true);
      records.push(`${relative}\0link\0${mode}\0${target}\n`);
      visit(resolved, `${relative}/@resolved`);
    } else if (stats.isDirectory()) {
      const canonical = realpathSync(path);
      assert.ok(!ancestors.has(canonical), `artifact dependency cycle: ${relative}`);
      ancestors.add(canonical);
      try {
        records.push(`${relative}\0directory\0${mode}\n`);
        for (const name of readdirSync(path).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
          visit(join(path, name), `${relative}/${name}`);
        }
      } finally {
        ancestors.delete(canonical);
      }
    } else {
      assert.equal(stats.isFile(), true, `artifact special file is forbidden: ${relative}`);
      records.push(`${relative}\0file\0${mode}\0${sha(readFileSync(path))}\n`);
    }
  };
  visit(join(releaseRoot, ".next"), ".next");
  return sha(records.join(""));
}

// The normalized-Next branch of the historical R8 filesTreeDigest policy.
// Keep the original verifier/evidence untouched. Tests execute that historical
// pure function independently to prevent silent policy changes in this copy.
function historicalReproducibleNextDigest(root: string, metadataOrder = false): string {
  assert.equal(realpathSync(root), root);
  assert.equal(lstatSync(root).isDirectory(), true);
  const buildId = readFileSync(join(root, "BUILD_ID"), "utf8").trim();
  assert.match(buildId, /^[A-Za-z0-9_-]{16,64}$/u);
  const artifactAppRoot = String(JSON.parse(readFileSync(join(root, "required-server-files.json"), "utf8")).appDir);
  assert.ok(artifactAppRoot.startsWith("/"));
  const replacements = [
    [buildId, "<BUILD_ID>"],
    [artifactAppRoot, "<APP_ROOT>"],
    [realpathSync(join(root, "..")), "<APP_ROOT>"],
    ...Object.entries(JSON.parse(readFileSync(join(root, "prerender-manifest.json"), "utf8")).preview)
      .map(([key, value]) => [String(value), `<${key}>`]),
    [String(JSON.parse(readFileSync(join(root, "server/server-reference-manifest.json"), "utf8")).encryptionKey),
      "<SERVER_ACTION_ENCRYPTION_KEY>"],
  ] as const;
  for (const [value, replacement] of replacements) {
    assert.ok(value.length > 0);
    assert.ok(replacement.length > 0);
  }
  const normalize = (bytes: Buffer): Buffer => {
    let normalized = bytes;
    for (const [value, replacement] of replacements) {
      const from = Buffer.from(value);
      const to = Buffer.from(replacement);
      const chunks: Buffer[] = [];
      let offset = 0;
      let found: number;
      while ((found = normalized.indexOf(from, offset)) >= 0) {
        chunks.push(normalized.subarray(offset, found), to);
        offset = found + from.length;
      }
      chunks.push(normalized.subarray(offset));
      normalized = Buffer.concat(chunks);
    }
    return normalized;
  };
  const records: string[] = [];
  const releaseRoot = join(root, "..");
  const visit = (directory: string, prefix = ""): void => {
    for (const name of readdirSync(directory).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
      const path = join(directory, name);
      const relativePath = prefix ? join(prefix, name) : name;
      if (["cache", "trace", "trace-build"].includes(relativePath)) continue;
      const normalizedPath = relativePath.replaceAll(buildId, "<BUILD_ID>");
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) {
        const target = readlinkSync(path);
        const match = /^\.\.\/\.\.\/node_modules\/(pg|sharp)$/u.exec(target);
        assert.ok(match, `unexpected artifact symlink: ${relativePath}`);
        const resolved = realpathSync(path);
        assert.equal(resolved, realpathSync(join(releaseRoot, "node_modules", match[1])));
        assert.equal(statSync(resolved).isDirectory(), true);
        records.push(`${normalizedPath}\0link\0${target.replaceAll(buildId, "<BUILD_ID>")}\n`);
      } else if (stats.isDirectory()) visit(path, relativePath);
      else {
        assert.equal(stats.isFile(), true, `artifact special file is forbidden: ${relativePath}`);
        const historicalBytes = normalize(readFileSync(path));
        const measuredBytes = metadataOrder ? normalizeKnownNextMetadata(relativePath, historicalBytes) : historicalBytes;
        records.push(`${normalizedPath}\0file\0${sha(measuredBytes)}\n`);
      }
    }
  };
  visit(root);
  records.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return sha(records.join(""));
}

/** Read-only artifact measurement, not a build, archive binding or release gate.
 * The existing installed preflight includes cache and linked dependency bytes;
 * historical reproducibility excludes cache, normalizes volatile Next output,
 * and records allowed dependency links without following them. Never substitute
 * one result for the other, or use either as proof that the phone received push.
 * Callers still need sealed build/source/dependency/archive and review evidence.
 */
export function measureRemediationBackendArtifact(releaseRoot: string, options: Readonly<{
  reproduciblePolicy?: "hourkey-r8-normalized-next-tree-v1" | typeof METADATA_ORDER_POLICY;
}> = {}) {
  const policy = options.reproduciblePolicy ?? "hourkey-r8-normalized-next-tree-v1";
  assert.ok(policy === "hourkey-r8-normalized-next-tree-v1" || policy === METADATA_ORDER_POLICY,
    "unsupported reproducibility policy");
  const metadataOrder = policy === METADATA_ORDER_POLICY;
  assert.ok(isAbsolute(releaseRoot) && resolve(releaseRoot) === releaseRoot
    && realpathSync(releaseRoot) === releaseRoot && lstatSync(releaseRoot).isDirectory(),
  "release root must be a canonical absolute directory");
  const nextRoot = join(releaseRoot, ".next");
  assert.ok(realpathSync(nextRoot) === nextRoot && lstatSync(nextRoot).isDirectory(),
    "Next output must be a canonical directory");
  const rawBefore = rawInputDigest(releaseRoot);
  const installedBefore = computeBuildArtifactDigest(releaseRoot);
  const historical = historicalReproducibleNextDigest(nextRoot);
  const reproducible = metadataOrder ? historicalReproducibleNextDigest(nextRoot, true) : historical;
  const installedAfter = computeBuildArtifactDigest(releaseRoot);
  assert.equal(installedAfter, installedBefore, "installed artifact changed during measurement");
  assert.equal(rawInputDigest(releaseRoot), rawBefore, "raw artifact inputs changed during measurement");
  return Object.freeze({
    schema: metadataOrder ? "hourkey-remediation-backend-artifact/v2" : "hourkey-remediation-backend-artifact/v1",
    assurance: "artifact_identity_only_not_release_approval",
    observedInputs: Object.freeze({ algorithm: "hourkey-next-raw-inputs-with-resolved-dependencies-v1", sha256: rawBefore }),
    installed: Object.freeze({ algorithm: "hourkey-preflight-build-artifact-v1", sha256: installedBefore }),
    reproducible: Object.freeze({ algorithm: policy, sha256: reproducible }),
    ...(metadataOrder ? { historicalReproducible: Object.freeze({
      algorithm: "hourkey-r8-normalized-next-tree-v1", sha256: historical,
    }) } : {}),
  });
}
