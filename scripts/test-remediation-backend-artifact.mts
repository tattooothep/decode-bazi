import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const preflight = require("./notification-observability-preflight.cjs");
const ts = require("typescript");
const originalInstalledDigest = preflight.computeBuildArtifactDigest;
let mutateAfterInstalledRead: (() => void) | undefined;
// Test-only race injection: the real preflight algorithm still computes every
// value; mutate only a synthetic local fixture after one complete hash read.
preflight.computeBuildArtifactDigest = (root: string) => {
  const result = originalInstalledDigest(root);
  if (mutateAfterInstalledRead) {
    const mutate = mutateAfterInstalledRead;
    mutateAfterInstalledRead = undefined;
    mutate();
  }
  return result;
};
const { measureRemediationBackendArtifact } = await import("./lib/remediation-backend-artifact.mts");
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
// Invoke only the historical pure function, never the historical script's
// top-level build, cleanup, database, signature or deployment workflow.
const historicalSource = fs.readFileSync(new URL("./test-notification-r8-final-gates.mts", import.meta.url), "utf8");
const historicalFunction = historicalSource.slice(
  historicalSource.indexOf("function filesTreeDigest("),
  historicalSource.indexOf("function mobileExportArtifactDigest("),
);
assert.ok(historicalFunction.startsWith("function filesTreeDigest("));
const historicalFsNames = ["realpathSync", "lstatSync", "readFileSync", "readdirSync", "readlinkSync", "statSync"] as const;
const legacyDigest = new Function("assert", "sha", "join", ...historicalFsNames,
  `${ts.transpileModule(historicalFunction, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText}; return filesTreeDigest;`
)(assert, sha, join, ...historicalFsNames.map((name) => fs[name]));

const scratch = fs.mkdtempSync(join(tmpdir(), "hourkey-remediation-artifact-test-"));
const put = (root: string, path: string, data: string) => {
  fs.mkdirSync(join(root, ".next", path, ".."), { recursive: true });
  fs.writeFileSync(join(root, ".next", path), data);
};
function fixture(leaf: string, suffix: string) {
  const root = join(scratch, leaf);
  const buildId = `build_identifier_${suffix}`;
  const appDir = `/synthetic-build-root/${suffix}`;
  const preview = { previewModeId: `preview-id-${suffix}`, previewModeSigningKey: `signing-${suffix}`,
    previewModeEncryptionKey: `encryption-${suffix}` };
  const encryptionKey = `action-key-${suffix}`;
  put(root, "BUILD_ID", buildId);
  put(root, "required-server-files.json", JSON.stringify({ appDir }));
  put(root, "prerender-manifest.json", JSON.stringify({ preview }));
  put(root, "server/server-reference-manifest.json", JSON.stringify({ encryptionKey }));
  put(root, `server/${buildId}/page.js`, JSON.stringify({ buildId, appDir, outputRoot: root, preview, encryptionKey, code: "original" }));
  return { root, buildId };
}

try {
  const a = fixture("a", "one");
  const b = fixture("b", "two");
  const measure = (root: string) => {
    const result = measureRemediationBackendArtifact(root);
    assert.equal(result.assurance, "artifact_identity_only_not_release_approval");
    assert.equal(result.installed.algorithm, "hourkey-preflight-build-artifact-v1");
    assert.equal(result.reproducible.algorithm, "hourkey-r8-normalized-next-tree-v1");
    assert.equal(result.installed.sha256, preflight.computeBuildArtifactDigest(root));
    assert.equal(result.reproducible.sha256, legacyDigest(join(root, ".next"), true));
    assert.match(result.installed.sha256, /^[a-f0-9]{64}$/u);
    assert.match(result.reproducible.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(Object.hasOwn(result, "releaseReady"), false);
    assert.equal(Object.hasOwn(result, "archiveSha256"), false, "a tree hash cannot claim an unexamined archive binding");
    return result;
  };
  const first = measure(a.root);
  const second = measure(b.root);
  assert.notEqual(first.installed.sha256, second.installed.sha256,
    "installed identity preserves build-root/random-output differences");
  assert.equal(first.reproducible.sha256, second.reproducible.sha256,
    "historical reproducibility normalizes the exact historical volatile fields");
  const newBuildId = "build_identifier_changed";
  const page = `server/${b.buildId}/page.js`;
  put(b.root, page, fs.readFileSync(join(b.root, ".next", page), "utf8").replaceAll(b.buildId, newBuildId));
  fs.renameSync(join(b.root, ".next/server", b.buildId), join(b.root, ".next/server", newBuildId));
  put(b.root, "BUILD_ID", newBuildId);
  const idOnly = measure(b.root);
  assert.deepEqual(idOnly.installed, second.installed, "installed policy ALSO normalizes BUILD_ID");
  assert.deepEqual(idOnly.reproducible, second.reproducible);
  assert.notDeepEqual(idOnly.observedInputs, second.observedInputs);

  put(a.root, "cache/test.bin", "cache matters for installed preflight");
  const cached = measure(a.root);
  assert.notEqual(cached.installed.sha256, first.installed.sha256);
  assert.equal(cached.reproducible.sha256, first.reproducible.sha256);
  put(a.root, "trace", "trace is excluded by both historical policies");
  put(a.root, "trace-build", "trace-build is excluded too");
  const traced = measure(a.root);
  assert.deepEqual(traced.installed, cached.installed);
  assert.deepEqual(traced.reproducible, cached.reproducible);
  assert.notDeepEqual(traced.observedInputs, cached.observedInputs);

  put(a.root, `server/${a.buildId}/page.js`, "a real changed application output");
  const changed = measure(a.root);
  assert.notEqual(changed.installed.sha256, cached.installed.sha256);
  assert.notEqual(changed.reproducible.sha256, cached.reproducible.sha256);

  fs.mkdirSync(join(a.root, "node_modules/pg"), { recursive: true });
  fs.writeFileSync(join(a.root, "node_modules/pg/index.js"), "dependency-v1");
  fs.mkdirSync(join(a.root, ".next/node_modules"), { recursive: true });
  fs.symlinkSync("../../node_modules/pg", join(a.root, ".next/node_modules/pg"));
  const dependency = measure(a.root);
  fs.writeFileSync(join(a.root, "node_modules/pg/index.js"), "dependency-v2");
  const dependencyChanged = measure(a.root);
  assert.notEqual(dependency.installed.sha256, dependencyChanged.installed.sha256,
    "installed preflight includes the allowed resolved dependency bytes");
  assert.equal(dependency.reproducible.sha256, dependencyChanged.reproducible.sha256,
    "historical normalized hash records the link only; it is not a dependency proof");
  fs.mkdirSync(join(a.root, "node_modules/sharp"), { recursive: true });
  fs.writeFileSync(join(a.root, "node_modules/sharp/index.js"), "sharp-dependency");
  fs.symlinkSync("../../node_modules/sharp", join(a.root, ".next/node_modules/sharp"));
  measure(a.root);
  fs.symlinkSync("../../node_modules/pg", join(a.root, "node_modules/pg/loop"));
  assert.throws(() => measureRemediationBackendArtifact(a.root), /cycle/u,
    "reject a resolved allowed-package cycle before the unchanged preflight can recurse");
  fs.unlinkSync(join(a.root, "node_modules/pg/loop"));

  fs.symlinkSync(a.root, join(scratch, "aliased-release"));
  assert.throws(() => measureRemediationBackendArtifact(join(scratch, "aliased-release")), /canonical/u);
  assert.throws(() => measureRemediationBackendArtifact("."), /canonical/u);
  const malformed = fixture("malformed", "three");
  put(malformed.root, "BUILD_ID", "invalid");
  assert.throws(() => measureRemediationBackendArtifact(malformed.root));
  const escaped = fixture("escaped", "four");
  fs.symlinkSync("/etc/passwd", join(escaped.root, ".next/escape"));
  assert.throws(() => measureRemediationBackendArtifact(escaped.root), /symlink/u);

  const racing = fixture("racing", "five");
  const beforeRace = measure(racing.root);
  mutateAfterInstalledRead = () => put(racing.root, "trace", "mutation normalized away by BOTH historical hashes");
  assert.throws(() => measureRemediationBackendArtifact(racing.root), /raw artifact inputs changed/u);
  const afterRace = measure(racing.root);
  assert.deepEqual(afterRace.installed, beforeRace.installed);
  assert.deepEqual(afterRace.reproducible, beforeRace.reproducible);
  assert.notDeepEqual(afterRace.observedInputs, beforeRace.observedInputs);
  mutateAfterInstalledRead = () => put(racing.root, `server/${racing.buildId}/page.js`, "mutated while measuring");
  assert.throws(() => measureRemediationBackendArtifact(racing.root), /artifact changed during measurement/u);
  console.log("PASS remediation backend artifact: two distinct historical policies, mutation and dependency counterexamples, no release claim");
} finally {
  preflight.computeBuildArtifactDigest = originalInstalledDigest;
  // Only this freshly allocated synthetic fixture directory is disposable.
  fs.rmSync(scratch, { recursive: true, force: true });
}
