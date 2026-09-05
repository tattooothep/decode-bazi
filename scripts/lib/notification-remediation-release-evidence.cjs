"use strict";

// Source identity preflight only. Actual execution/authority proof validators
// are deliberately NOT implemented here; no result can authorize a release.
// This source-only dossier is NOT the installed migration preflight schema:
// runtime/build/installed-source digests and their validators are still absent.
// Run from a separately reviewed TOOL checkout against explicit APPLICATION
// checkouts. Frozen candidate pins identify the application, not this verifier's
// own future commit (which would create an impossible commit self-reference).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const POLICY_PATH = path.join(__dirname, "notification-remediation-release-policy.json");
const POLICY_SHA256 = "4ffa03550dc1456ced6ae913b49bd2a66d43d45e70442d65c81b4b2ef3b548af";
const HEX40 = /^[0-9a-f]{40}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/u;
const MAX_DOSSIER_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 128 * 1024 * 1024;

function fail(code) { throw new Error(code); }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function exactKeys(value, keys) {
  return record(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!record(value)) fail("non_json_value");
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
function canonicalDigest(value) { return sha256(canonicalJson(value)); }
function equal(left, right) { return canonicalJson(left) === canonicalJson(right); }
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function canonicalExisting(input, directory) {
  if (typeof input !== "string" || !path.isAbsolute(input) || path.resolve(input) !== input || input.includes("\0")) fail("path_not_canonical");
  if (fs.realpathSync(input) !== input) fail("path_not_canonical");
  const stat = fs.lstatSync(input);
  if (directory ? !stat.isDirectory() : !stat.isFile()) fail("path_wrong_type");
  return input;
}
function identity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.mode, stat.nlink].map(String).join(":");
}
function streamRegularStable(input, maximum, consume) {
  canonicalExisting(input, false);
  const before = fs.lstatSync(input, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(maximum)) fail("file_not_single_regular_bounded_input");
  const fd = fs.openSync(input, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || identity(opened) !== identity(before)) fail("input_changed_before_read");
    // Limit reads to the sampled length plus one byte, even if the file grows
    // continuously. Never ask readFileSync to allocate from an unstable size.
    const length = Number(opened.size);
    const chunk = Buffer.alloc(Math.min(64 * 1024, length + 1));
    let offset = 0;
    while (offset < length) {
      const count = fs.readSync(fd, chunk, 0, Math.min(chunk.length, length - offset), offset);
      if (count === 0) fail("input_changed_during_read");
      consume(chunk.subarray(0, count));
      offset += count;
    }
    if (fs.readSync(fd, chunk, 0, 1, offset) !== 0
      || identity(opened) !== identity(fs.fstatSync(fd, { bigint: true }))
      || identity(opened) !== identity(fs.lstatSync(input, { bigint: true }))
      || fs.realpathSync(input) !== input) fail("input_changed_during_read");
    return opened;
  } finally { fs.closeSync(fd); }
}
function readRegularStable(input, maximum) {
  const chunks = [];
  streamRegularStable(input, maximum, chunk => chunks.push(Buffer.from(chunk)));
  return Buffer.concat(chunks);
}
function loadPolicy() {
  const bytes = readRegularStable(POLICY_PATH, MAX_DOSSIER_BYTES);
  if (sha256(bytes) !== POLICY_SHA256) fail("frozen_policy_bytes_changed");
  const policy = JSON.parse(bytes.toString("utf8"));
  if (policy.schema !== "hourkey-remediation-source-policy/v1") fail("frozen_policy_schema_invalid");
  return freeze(policy);
}
function policyDigest() { return canonicalDigest(loadPolicy()); }

function git(root, args) {
  // Only object/index/path reads: no status/diff, which can run clean filters.
  // Forbid partial-clone lazy fetch and every transport, including helpers.
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (key.startsWith("GIT_")) delete environment[key];
  Object.assign(environment, {
    GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0", GIT_NO_REPLACE_OBJECTS: "1",
    GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "",
  });
  return execFileSync("/usr/bin/git", ["--no-replace-objects", "--no-pager", "-c", "core.fsmonitor=false",
    "-c", "core.excludesFile=/dev/null", ...args], {
    cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 128 * 1024 * 1024,
  });
}
function safeSourcePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1024
    && !/[\0\r\n\\]/u.test(value) && !path.isAbsolute(value)
    && !value.split("/").some(part => part === "" || part === "." || part === "..");
}
function readTree(root, commit) {
  if (!HEX40.test(commit)) fail("commit_must_be_exact_sha");
  const raw = git(root, ["ls-tree", "-r", "-z", commit]);
  const decoded = raw.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(raw)) fail("non_utf8_source_path");
  const entries = new Map();
  for (const item of decoded.split("\0").filter(Boolean)) {
    const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/u.exec(item);
    if (!match || !safeSourcePath(match[3]) || entries.has(match[3])) fail("unsupported_or_duplicate_tree_entry");
    entries.set(match[3], { mode: match[1], gitOid: match[2] });
  }
  return entries;
}
function sorted(values) { return [...values].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))); }
function objectPart(root, item, cache) {
  if (!item) return null;
  if (!cache.has(item.gitOid)) {
    const bytes = git(root, ["cat-file", "blob", item.gitOid]);
    cache.set(item.gitOid, { sha256: sha256(bytes), bytes: bytes.length });
  }
  return { mode: item.mode, gitOid: item.gitOid, ...cache.get(item.gitOid) };
}
function diffTreeEntries(beforeEntries, afterEntries) {
  const indexed = entries => {
    const out = new Map();
    for (const entry of entries) {
      if (!safeSourcePath(entry.path) || out.has(entry.path)
        || !/^(100644|100755)$/u.test(entry.mode) || !HEX40.test(entry.gitOid)
        || !HEX64.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) fail("invalid_tree_record");
      out.set(entry.path, { mode: entry.mode, gitOid: entry.gitOid, sha256: entry.sha256, bytes: entry.bytes });
    }
    return out;
  };
  const before = indexed(beforeEntries), after = indexed(afterEntries);
  return sorted(new Set([...before.keys(), ...after.keys()])).flatMap(sourcePath => {
    const old = before.get(sourcePath) || null, next = after.get(sourcePath) || null;
    return equal(old, next) ? [] : [{ path: sourcePath, change: !old ? "add" : !next ? "delete" : "modify", old, new: next }];
  });
}
function workspace(root) {
  return {
    head: git(root, ["rev-parse", "HEAD"]).toString("ascii").trim(),
    index: git(root, ["ls-files", "--stage", "-z"]),
    untracked: git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
  };
}
function indexMatchesTree(raw, entries) {
  const decoded = raw.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(raw)) return false;
  const seen = new Set();
  for (const item of decoded.split("\0").filter(Boolean)) {
    const match = /^(100644|100755) ([0-9a-f]{40}) 0\t(.+)$/u.exec(item);
    if (!match || seen.has(match[3])) return false;
    const expected = entries.get(match[3]);
    if (!expected || expected.mode !== match[1] || expected.gitOid !== match[2]) return false;
    seen.add(match[3]);
  }
  return seen.size === entries.size;
}
function verifyWorkingTreeEntries(rootInput, entries) {
  try {
    const root = canonicalExisting(rootInput, true);
    const seen = new Set(), samples = [];
    for (const entry of entries) {
      if (!safeSourcePath(entry.path) || seen.has(entry.path)
        || !/^(100644|100755)$/u.test(entry.mode) || !HEX40.test(entry.gitOid)) return false;
      seen.add(entry.path);
      const current = path.join(root, entry.path);
      const sampled = fs.lstatSync(current, { bigint: true });
      const hash = crypto.createHash("sha1").update(`blob ${sampled.size}\0`);
      const opened = streamRegularStable(current, MAX_SOURCE_BYTES, chunk => hash.update(chunk));
      // Git tree modes normalize the owner's execute bit, not group/other.
      const mode = (opened.mode & 0o100n) !== 0n ? "100755" : "100644";
      if (identity(sampled) !== identity(opened) || mode !== entry.mode || hash.digest("hex") !== entry.gitOid) return false;
      samples.push([current, identity(opened)]);
    }
    // Re-sample earlier files after the whole set; detect changes during a long
    // capture without relying on assume-unchanged/skip-worktree/core.filemode.
    return samples.every(([current, expected]) => fs.realpathSync(current) === current
      && identity(fs.lstatSync(current, { bigint: true })) === expected);
  } catch { return false; }
}
function captureCommittedSource(rootInput, side, applicationCommit) {
  const policy = loadPolicy();
  if (!Object.hasOwn(policy.references, side) || !HEX40.test(applicationCommit)) fail("source_selector_invalid");
  const root = canonicalExisting(rootInput, true);
  if (git(root, ["rev-parse", "--show-toplevel"]).toString("utf8").trim() !== root) fail("source_root_not_repository_root");
  const reference = policy.references[side];
  const start = workspace(root);
  const before = readTree(root, reference.baselineCommit), after = readTree(root, applicationCommit);
  const currentEntries = [...after].map(([sourcePath, item]) => ({ path: sourcePath, ...item }));
  const filesAtStart = verifyWorkingTreeEntries(root, currentEntries);
  const cache = new Map();
  const changedBefore = [], changedAfter = [];
  for (const sourcePath of sorted(new Set([...before.keys(), ...after.keys()]))) {
    const old = before.get(sourcePath), next = after.get(sourcePath);
    if (old?.mode === next?.mode && old?.gitOid === next?.gitOid) continue;
    if (old) changedBefore.push({ path: sourcePath, ...objectPart(root, old, cache) });
    if (next) changedAfter.push({ path: sourcePath, ...objectPart(root, next, cache) });
  }
  const classification = new Map(reference.deltaRecords.map(row => [row.path, row]));
  const deltaRecords = diffTreeEntries(changedBefore, changedAfter).map(row => ({ ...row,
    classification: classification.get(row.path)?.classification || "unclassified",
    authority: classification.get(row.path)?.authority || "unclassified",
  }));
  const controlFailures = [];
  for (const control of policy.unchangedControls.filter(item => item.side === side)) {
    const expected = { mode: control.mode, gitOid: control.gitOid, sha256: control.sha256, bytes: control.bytes };
    const actual = objectPart(root, after.get(control.path), cache);
    const anchor = readTree(root, control.anchorCommit);
    if (!equal(actual, expected) || !equal(objectPart(root, anchor.get(control.path), cache), expected)) controlFailures.push(control.path);
  }
  const applicationTree = git(root, ["rev-parse", `${applicationCommit}^{tree}`]).toString("ascii").trim();
  const filesAtEnd = verifyWorkingTreeEntries(root, currentEntries);
  const end = workspace(root);
  return freeze({ baselineCommit: reference.baselineCommit, applicationCommit, applicationTree, deltaRecords,
    controlsValid: controlFailures.length === 0, controlFailures,
    workspaceFilesVerified: filesAtStart && filesAtEnd,
    workspaceClean: start.untracked.length === 0 && end.untracked.length === 0
      && indexMatchesTree(start.index, after) && indexMatchesTree(end.index, after) && filesAtStart && filesAtEnd,
    workspaceStable: start.head === end.head && start.index.equals(end.index) && start.untracked.equals(end.untracked),
    workspaceHeadMatches: start.head === applicationCommit && end.head === applicationCommit,
  });
}

function baseReport(policy) {
  return { schema: "hourkey-remediation-source-preflight-result/v1", scope: "source_identity_only_not_release_approval",
    installedPreflightDossierCompatible: false,
    verifierCheckoutRole: "separate_tool_checkout_pins_frozen_application_checkouts_not_its_own_commit",
    workspaceValidationScope: "tracked_raw_bytes_modes_index_and_nonignored_untracked_not_installed_source_digest",
    signatureValidationScope: "structural_only_unverified_identity_authorship_reviews_and_execution",
    policyId: policy.id, committedSourceBindingValid: false, sourceBindingValid: false,
    signatureMetadataValid: false, signaturesValid: false, artifactProofComplete: false, releaseReady: false,
    missingVerifierCoverage: policy.requiredProofs.map(proof => proof.id),
    requiredProofClasses: policy.requiredProofs.map(({ id, scope }) => ({ id, scope })),
    conditionalActivation: policy.conditionalActivation,
    missingProofs: [], invalidProofs: [], workspaceIssues: [], sourceErrors: [], signatureErrors: [],
  };
}
function normalizedId(value) { return typeof value === "string" ? value.normalize("NFKC").toLowerCase() : ""; }
function signatureMetadata(document, policy, errors) {
  const signatures = document.signatures, bundle = document.bundle;
  if (!Array.isArray(signatures) || signatures.length !== 5) { errors.push("exactly_five_review_metadata_records_required"); return false; }
  const authors = new Set((Array.isArray(bundle.authors) ? bundle.authors : []).map(normalizedId));
  const reviewers = new Set(), dimensions = new Set();
  for (const signature of signatures) {
    if (!exactKeys(signature, ["reviewerId", "dimension", "verdict", "bundleDigest", "backendCommit", "mobileCommit", "findings", "testEvidence", "reviewedAt"])) {
      errors.push("signature_shape_invalid"); continue;
    }
    const reviewer = normalizedId(signature.reviewerId);
    if (typeof signature.reviewerId !== "string" || !ID.test(signature.reviewerId) || reviewers.has(reviewer)) errors.push("signature_reviewer_invalid_or_duplicate");
    if (authors.has(reviewer)) errors.push("signature_self_author");
    reviewers.add(reviewer);
    if (!policy.signatureDimensions.includes(signature.dimension) || dimensions.has(signature.dimension)) errors.push("signature_dimension_invalid_or_duplicate");
    dimensions.add(signature.dimension);
    if (signature.verdict !== "PASS" || signature.bundleDigest !== document.bundleDigest
      || signature.backendCommit !== bundle.backend?.applicationCommit
      || signature.mobileCommit !== bundle.mobile?.applicationCommit) errors.push("signature_verdict_or_binding_invalid");
    if (!exactKeys(signature.findings, ["critical", "important", "minor"])
      || !Array.isArray(signature.findings.critical) || signature.findings.critical.length !== 0
      || !Array.isArray(signature.findings.important) || signature.findings.important.length !== 0
      || !Array.isArray(signature.findings.minor)) errors.push("signature_findings_invalid_or_blocking");
    if (!Array.isArray(signature.testEvidence) || signature.testEvidence.length === 0
      || !signature.testEvidence.every(value => typeof value === "string" && value.trim().length > 0)) errors.push("signature_test_evidence_missing");
    const at = signature.reviewedAt;
    if (typeof at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(at)
      || !Number.isFinite(Date.parse(at)) || Date.parse(at) < Date.parse("2026-09-05T00:00:00Z")
      || new Date(at).toISOString() !== (at.includes(".") ? at : at.replace("Z", ".000Z"))) errors.push("signature_date_invalid_or_historical");
  }
  return errors.length === 0;
}
function evaluateEvidenceDocument(document, snapshots) {
  const policy = loadPolicy(), result = baseReport(policy);
  if (!exactKeys(document, ["schema", "bundle", "bundleDigest", "signatures"]) || document.schema !== 1 || !record(document.bundle)) {
    result.invalidProofs.push("dossier_shape_invalid");
    result.missingProofs = [...result.missingVerifierCoverage];
    return result;
  }
  const bundle = document.bundle;
  if (!exactKeys(bundle, ["releaseMode", "policyDigest", "backend", "mobile", "authors", "science", "providerAttempts", "activationBoundary", "proofClaims"])) result.invalidProofs.push("bundle_shape_invalid");
  if (document.bundleDigest !== canonicalDigest(bundle)) result.invalidProofs.push("bundle_digest_mismatch");
  if (bundle.policyDigest !== canonicalDigest(policy)) result.invalidProofs.push("policy_digest_mismatch");
  if (bundle.releaseMode !== "hard_off") result.invalidProofs.push("release_mode_not_hard_off");
  if (!equal(bundle.science ?? null, policy.science)) result.invalidProofs.push("science_boundary_mismatch");
  if (bundle.providerAttempts !== 0) result.invalidProofs.push("provider_attempts_not_zero");
  if (!equal(bundle.activationBoundary ?? null, policy.activationBoundary)) result.invalidProofs.push("activation_boundary_mismatch");
  if (!Array.isArray(bundle.authors) || bundle.authors.length === 0 || bundle.authors.length > 100
    || !bundle.authors.every(author => typeof author === "string" && ID.test(author))
    || new Set(bundle.authors.map(normalizedId)).size !== bundle.authors.length) result.invalidProofs.push("author_roster_invalid");
  for (const side of ["backend", "mobile"]) {
    const declared = bundle[side], actual = snapshots?.[side], reference = policy.references[side];
    if (!exactKeys(declared, ["baselineCommit", "applicationCommit", "applicationTree", "deltaRecords"]) || !actual) {
      result.sourceErrors.push(`${side}:source_shape_or_capture_missing`); continue;
    }
    for (const [key, expected] of [["baselineCommit", reference.baselineCommit], ["applicationCommit", reference.candidateCommit], ["applicationTree", reference.candidateTree]]) {
      if (declared[key] !== expected || actual[key] !== expected) result.sourceErrors.push(`${side}:${key}_mismatch`);
    }
    if (!equal(declared.deltaRecords ?? null, actual.deltaRecords)
      || !equal(actual.deltaRecords, reference.deltaRecords)) result.sourceErrors.push(`${side}:delta_records_not_exact_exhaustive_policy`);
    if (actual.controlsValid !== true) result.sourceErrors.push(`${side}:unchanged_control_violation`);
    if (actual.workspaceClean !== true) result.workspaceIssues.push(`${side}:workspace_dirty`);
    if (actual.workspaceStable !== true) result.workspaceIssues.push(`${side}:workspace_changed_during_capture`);
    if (actual.workspaceHeadMatches !== true) result.workspaceIssues.push(`${side}:workspace_head_not_candidate`);
    if (actual.workspaceFilesVerified !== true) result.workspaceIssues.push(`${side}:workspace_raw_file_verification_failed`);
  }
  if (result.invalidProofs.some(reason => ["dossier_shape_invalid", "bundle_shape_invalid", "bundle_digest_mismatch", "policy_digest_mismatch"].includes(reason))) result.sourceErrors.push("source_binding_envelope_invalid");
  result.committedSourceBindingValid = result.sourceErrors.length === 0;
  result.sourceBindingValid = result.committedSourceBindingValid && result.workspaceIssues.length === 0;
  result.invalidProofs.push(...result.sourceErrors.map(reason => `source_binding:${reason}`));
  result.signatureMetadataValid = signatureMetadata(document, policy, result.signatureErrors)
    && !result.invalidProofs.includes("author_roster_invalid") && result.committedSourceBindingValid;
  if (Array.isArray(document.signatures) && document.signatures.length > 0) result.invalidProofs.push(...result.signatureErrors);
  const claims = record(bundle.proofClaims) ? bundle.proofClaims : {};
  if (!record(bundle.proofClaims)) result.invalidProofs.push("proof_claims_shape_invalid");
  if (Object.keys(claims).some(id => !result.missingVerifierCoverage.includes(id))) result.invalidProofs.push("unknown_proof_class");
  for (const proof of policy.requiredProofs) {
    if (Object.hasOwn(claims, proof.id)) result.invalidProofs.push(`proof_validator_not_implemented:${proof.id}`);
    else result.missingProofs.push(proof.id);
  }
  // Never infer actual proof from declared PASS, a filename/hash, or metadata.
  // These remain constants until separately implemented/reviewed validators
  // cover *all* required execution, authority, rollout and acceptance proofs.
  return result;
}
function failureReport(reason) {
  let policy;
  try { policy = loadPolicy(); } catch {
    return { schema: "hourkey-remediation-source-preflight-result/v1", releaseReady: false,
      committedSourceBindingValid: false, sourceBindingValid: false, artifactProofComplete: false,
      signaturesValid: false, signatureMetadataValid: false, invalidProofs: ["frozen_policy_unavailable"],
      missingVerifierCoverage: ["frozen_policy_and_all_execution_authority_validators"], missingProofs: [] };
  }
  const result = baseReport(policy);
  result.invalidProofs.push(reason);
  result.missingProofs = [...result.missingVerifierCoverage];
  return result;
}
function inspectRemediationEvidence({ evidencePath, backendRoot, mobileRoot } = {}) {
  try {
    const roots = [canonicalExisting(backendRoot, true), canonicalExisting(mobileRoot, true)];
    if (typeof evidencePath !== "string") fail("external_dossier_path_required");
    const within = (root, target) => target === root || target.startsWith(`${root}${path.sep}`);
    if (roots.some(root => within(root, evidencePath)) || within("/root/releases", evidencePath)) fail("dossier_must_be_external_to_sources_and_releases");
    const bytes = readRegularStable(evidencePath, MAX_DOSSIER_BYTES);
    const document = JSON.parse(bytes.toString("utf8"));
    if (!record(document?.bundle) || !HEX40.test(document.bundle.backend?.applicationCommit || "")
      || !HEX40.test(document.bundle.mobile?.applicationCommit || "")) fail("dossier_source_selector_invalid");
    const snapshots = {
      backend: captureCommittedSource(roots[0], "backend", document.bundle.backend.applicationCommit),
      mobile: captureCommittedSource(roots[1], "mobile", document.bundle.mobile.applicationCommit),
    };
    if (!readRegularStable(evidencePath, MAX_DOSSIER_BYTES).equals(bytes)) fail("dossier_changed_during_inspection");
    return { ...evaluateEvidenceDocument(document, snapshots), dossierSha256: sha256(bytes), dossierBytes: bytes.length };
  } catch (error) {
    // Do not echo file contents, subprocess stderr, credential paths or tokens.
    const safe = /^[a-z][a-z0-9_]+$/u.test(error?.message || "") ? error.message : "dossier_or_source_read_failed";
    return failureReport(safe);
  }
}

module.exports = Object.freeze({ loadPolicy, policyDigest, canonicalDigest, diffTreeEntries,
  verifyWorkingTreeEntries, captureCommittedSource, evaluateEvidenceDocument, inspectRemediationEvidence, failureReport });
