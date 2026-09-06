"use strict";

// Retained-byte consistency only. This module never executes commands, imports
// a producer, opens manifested host inputs, or changes existing release gates.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const ASSURANCE = "observed-not-bound-not-immutable-not-acceptance";
const POLICY = "hourkey-fixed-bwrap-offline-internal-preview/v3";
const CANONICAL_POLICY = "hourkey-fixed-bwrap-offline-internal-preview/v4";
const BOUNDED_POLICY = "hourkey-fixed-bwrap-offline-internal-preview/v5";
const CANONICAL_UNITY_BUILD_ROOT = "/root/worktrees/hourkey-v197-runtime-fix/android/unityLibrary/build";
const DISCLAIMERS = Object.freeze(["Records one internal preview build observed on this host only.",
  "Does not prove reproducibility, immutability, provenance, or acceptance readiness.",
  "Does not authorize deploy, distribution, production signing, or release.",
  "External signer secrets, store path, and store hash are not recorded; only the APK certificate SHA-256 is retained.",
  "Source may change after the final observed boundary; consumers must re-verify current state."]);
const HASH = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const DIGITS = /^(?:0|[1-9][0-9]*)$/u;
const NET = /^[0-9]+:[0-9]+$/u;
const LIMITS = Object.freeze({ maxFiles: 96, maxJsonBytes: 64 * 1024 * 1024,
  maxFileBytes: 512 * 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024 * 1024, maxEntries: 300000 });
const MISSING = Object.freeze(["EXECUTION_AUTHORITY", "CONTINUOUS_JOURNAL_LIFECYCLE",
  "ACTUAL_NAMESPACE_AND_MOUNT_OBSERVATION", "RECORDED_SANDBOX_POLICY_EQUIVALENCE", "CURRENT_SOURCE_STATE", "APK_CRYPTOGRAPHIC_SIGNATURES",
  "APK_ABI_AND_UNSIGNED_CONTENT", "FRESH_GRADLE_EXECUTION", "REPRODUCIBILITY", "DEVICE_DELIVERY", "OTHER_GOAL_PROOFS"]);
const sha = value => createHash("sha256").update(value).digest("hex");
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
class Invalid extends Error { constructor(code) { super(code); this.code = code; } }
const need = (condition, code = "CHAIN_INVALID") => { if (!condition) throw new Invalid(code); };
const equal = (a, b, code = "CHAIN_LINK_MISMATCH") => need(isDeepStrictEqual(a, b), code);
const object = value => need(value !== null && typeof value === "object" && !Array.isArray(value));
function keys(value, names) { object(value); equal(Object.keys(value).sort(), [...names].sort(), "CHAIN_SCHEMA_INVALID"); }
function abs(value) {
  need(typeof value === "string" && value.length > 1 && value.length <= 4096 && !value.includes("\0") &&
    path.isAbsolute(value) && path.resolve(value) === value, "CHAIN_PATH_INVALID");
  return value;
}
const within = (root, target) => target === root || target.startsWith(`${root}/`);
const count = value => need(Number.isSafeInteger(value) && value >= 0, "CHAIN_SCHEMA_INVALID");
const digest = value => need(typeof value === "string" && HASH.test(value), "CHAIN_SCHEMA_INVALID");
const strings = value => need(Array.isArray(value) && value.length <= 4096 && value.every(x => typeof x === "string" && !x.includes("\0")), "CHAIN_SCHEMA_INVALID");
function sorted(values) {
  strings(values);
  need(values.every((x, i) => i === 0 || Buffer.compare(Buffer.from(values[i - 1]), Buffer.from(x)) < 0), "CHAIN_SCHEMA_INVALID");
}
function descriptor(value) {
  keys(value, ["path", "bytes", "sha256"]); abs(value.path); count(value.bytes); digest(value.sha256); return value;
}
const plainDescriptor = value => ({ path: value.path, bytes: value.bytes, sha256: value.sha256 });
const redacted = value => ({ bytes: value.bytes, sha256: value.sha256 });
function identity(stat, directory = false) {
  return (directory ? ["dev", "ino", "mode", "uid", "gid"] :
    ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"]).map(key => String(stat[key]));
}

// openat-equivalent traversal through pinned Linux procfs FDs. O_NOFOLLOW on
// just the last filename would not protect ancestor replacement/symlinks.
class Reader {
  constructor(root, limits) {
    this.root = abs(root); this.limits = { ...LIMITS }; this.directories = new Map(); this.files = new Map(); this.total = 0;
    if (limits !== undefined) {
      object(limits);
      for (const [key, value] of Object.entries(limits)) {
        need(Object.hasOwn(LIMITS, key) && Number.isSafeInteger(value) && value > 0 && value <= LIMITS[key], "CHAIN_LIMIT_INVALID");
        this.limits[key] = value;
      }
    }
  }
  directory(target) {
    if (this.directories.has(target)) return this.directories.get(target);
    need(this.directories.size < 256, "CHAIN_BOUNDS");
    const parent = target === "/" ? null : this.directory(path.dirname(target));
    // Parent recursion can populate the map before this frame opens its FD.
    need(this.directories.size < 256, "CHAIN_BOUNDS");
    const visible = parent ? `/proc/self/fd/${parent.fd}/${path.basename(target)}` : "/";
    const fd = fs.openSync(visible, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd, { bigint: true });
      need(stat.isDirectory(), "CHAIN_FILE_UNSAFE");
      const item = { fd, visible, identity: identity(stat, true) };
      equal(identity(fs.lstatSync(visible, { bigint: true }), true), item.identity, "CHAIN_FILE_CHANGED");
      this.directories.set(target, item);
      return item;
    } catch (error) { fs.closeSync(fd); throw error; }
  }
  read(input, asJson = false, asText = false, markers = undefined, binaryArtifact = false) {
    const d = descriptor(input);
    need(d.path !== this.root && within(this.root, d.path), "CHAIN_PATH_ESCAPE");
    need(d.bytes <= this.limits.maxFileBytes && (!asJson || d.bytes <= this.limits.maxJsonBytes) &&
      (!asText || d.bytes <= 1024 * 1024), "CHAIN_BOUNDS");
    need(!this.files.has(d.path), "CHAIN_DESCRIPTOR_REUSED");
    need(this.files.size < this.limits.maxFiles && this.total + d.bytes <= this.limits.maxTotalBytes, "CHAIN_BOUNDS");
    const root = this.directory(this.root);
    const rootStat = fs.fstatSync(root.fd, { bigint: true });
    need((rootStat.mode & 0o7777n) === 0o700n && rootStat.uid === BigInt(process.getuid()), "CHAIN_PRIVATE_STORAGE_UNSAFE");
    const parent = this.directory(path.dirname(d.path));
    const visible = `/proc/self/fd/${parent.fd}/${path.basename(d.path)}`;
    // NONBLOCK makes an attacker-supplied FIFO rejectable without hanging.
    const fd = fs.openSync(visible, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const stat = fs.fstatSync(fd, { bigint: true });
      need(stat.isFile() && stat.nlink === 1n, "CHAIN_FILE_UNSAFE");
      need(stat.uid === BigInt(process.getuid()) && (binaryArtifact ? (stat.mode & 0o7022n) === 0n :
        (stat.mode & 0o7777n) === 0o600n), "CHAIN_PRIVATE_STORAGE_UNSAFE");
      need(stat.size === BigInt(d.bytes), "CHAIN_FILE_SIZE_MISMATCH");
      const item = { fd, visible, identity: identity(stat), descriptor: { ...d } };
      equal(identity(fs.lstatSync(visible, { bigint: true })), item.identity, "CHAIN_FILE_CHANGED");
      this.files.set(d.path, item); this.total += d.bytes;
      const hash = createHash("sha256"); const chunks = []; let pending = ""; const matched = [];
      const line = value => {
        const normalized = value.replace(/\r$/u, "");
        if (markers.includes(normalized)) matched.push(normalized);
        need(matched.length <= markers.length, "CHAIN_LOG_MARKERS");
      };
      const scan = value => {
        // Markers are short ASCII complete lines. Limit incomplete-line memory
        // even when a log contains a very large unrelated line or binary data.
        const rows = (pending + value.toString("latin1")).split("\n");
        pending = rows.pop(); rows.forEach(line);
        if (pending.length > 4096) pending = `\0${pending.slice(-4096)}`;
      };
      const buffer = Buffer.allocUnsafe(256 * 1024); let offset = 0;
      while (offset < d.bytes) {
        const n = fs.readSync(fd, buffer, 0, Math.min(buffer.length, d.bytes - offset), offset);
        need(n > 0, "CHAIN_FILE_CHANGED"); hash.update(buffer.subarray(0, n));
        if (asJson || asText) chunks.push(Buffer.from(buffer.subarray(0, n)));
        if (markers) scan(buffer.subarray(0, n));
        offset += n;
      }
      need(fs.readSync(fd, buffer, 0, 1, offset) === 0, "CHAIN_FILE_CHANGED");
      equal(identity(fs.fstatSync(fd, { bigint: true })), item.identity, "CHAIN_FILE_CHANGED");
      equal(identity(fs.lstatSync(visible, { bigint: true })), item.identity, "CHAIN_FILE_CHANGED");
      equal(hash.digest("hex"), d.sha256, "CHAIN_FILE_HASH_MISMATCH");
      if (markers) { line(pending); equal(matched, markers, "CHAIN_LOG_MARKERS"); }
      if (asJson || asText) {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
        if (asText) return text;
        try { return JSON.parse(text); } catch { throw new Invalid("CHAIN_JSON_INVALID"); }
      }
    } catch (error) {
      if (!this.files.has(d.path)) fs.closeSync(fd);
      throw error;
    }
  }
  finish() {
    // Check every previously hashed FD AND its visible path again; otherwise
    // replacing an earlier file while later files are read could go unnoticed.
    for (const item of this.files.values()) {
      equal(identity(fs.fstatSync(item.fd, { bigint: true })), item.identity, "CHAIN_FILE_CHANGED");
      equal(identity(fs.lstatSync(item.visible, { bigint: true })), item.identity, "CHAIN_FILE_CHANGED");
    }
    for (const item of this.directories.values()) {
      equal(identity(fs.fstatSync(item.fd, { bigint: true }), true), item.identity, "CHAIN_FILE_CHANGED");
      equal(identity(fs.lstatSync(item.visible, { bigint: true }), true), item.identity, "CHAIN_FILE_CHANGED");
    }
  }
  close() {
    for (const item of [...this.files.values(), ...this.directories.values()]) { try { fs.closeSync(item.fd); } catch { /* no authority claim */ } }
  }
}

function sourceManifest(reader, group, expected, root) {
  const before = reader.read(group.before, true);
  for (const name of ["after", "final"]) { reader.read(group[name]); equal(redacted(group[name]), redacted(group.before)); }
  keys(before, ["schema", "sourceRoot", "headCommit", "status", "enumeration", "fileCount", "totalBytes", "sourceFingerprint", "files"]);
  equal(before.schema, "hourkey-observed-source-manifest/v1"); equal(before.sourceRoot, root);
  equal(before.headCommit, expected.commit); need(COMMIT.test(before.headCommit)); equal(before.sourceFingerprint, expected.fingerprint);
  equal(before.status, { format: "git-status-porcelain-v2-z", bytes: 0, sha256: sha(""), porcelainV2ZBase64: "" });
  keys(before.enumeration, ["trackedBytes", "trackedSha256", "untrackedBytes", "untrackedSha256"]);
  count(before.enumeration.trackedBytes); count(before.enumeration.untrackedBytes);
  digest(before.enumeration.trackedSha256); digest(before.enumeration.untrackedSha256);
  need(Array.isArray(before.files) && before.files.length <= reader.limits.maxEntries, "CHAIN_BOUNDS");
  let previous = null; let total = 0;
  const files = before.files.map(x => {
    keys(x, ["path", "origin", "type", "worktreeMode", "posixMode", "indexMode", "indexObjectId", "bytes", "sha256"]);
    need(typeof x.path === "string" && !path.isAbsolute(x.path) && x.path !== "." && path.normalize(x.path) === x.path &&
      within(root, path.resolve(root, x.path)), "CHAIN_PATH_ESCAPE");
    need(previous === null || Buffer.compare(Buffer.from(previous), Buffer.from(x.path)) < 0); previous = x.path;
    need(["tracked", "untracked"].includes(x.origin) && ["regular", "symlink"].includes(x.type));
    need(/^[0-7]{5,6}$/u.test(x.posixMode) && ["100644", "100755", "120000"].includes(x.worktreeMode));
    need(x.indexMode === null || ["100644", "100755", "120000"].includes(x.indexMode));
    need(x.indexObjectId === null || COMMIT.test(x.indexObjectId)); count(x.bytes); digest(x.sha256); total += x.bytes;
    return { path: x.path, origin: x.origin, type: x.type, worktreeMode: x.worktreeMode, posixMode: x.posixMode,
      indexMode: x.indexMode, indexObjectId: x.indexObjectId, bytes: x.bytes, sha256: x.sha256 };
  });
  count(total); equal(before.fileCount, files.length); equal(before.totalBytes, total);
  equal(before.sourceFingerprint, sha(jsonBytes({ schema: "hourkey-observed-source-fingerprint/v1", headCommit: before.headCommit,
    statusSha256: before.status.sha256, trackedEnumerationSha256: before.enumeration.trackedSha256,
    untrackedEnumerationSha256: before.enumeration.untrackedSha256, files })), "CHAIN_MANIFEST_FINGERPRINT");
  return before;
}

function inputManifest(reader, group, label, fingerprint, final = false) {
  const before = reader.read(group.before, true);
  for (const name of final ? ["after", "final"] : ["after"]) { reader.read(group[name]); equal(redacted(group[name]), redacted(group.before)); }
  keys(before, ["schema", "label", "roots", "entryCount", "totalBytes", "inputFingerprint", "entries"]);
  equal(before.schema, "hourkey-observed-input-manifest/v1"); equal(before.label, label);
  equal(before.inputFingerprint, fingerprint); digest(fingerprint); sorted(before.roots); before.roots.forEach(abs);
  need(before.roots.length > 0 && Array.isArray(before.entries) && before.entries.length <= reader.limits.maxEntries, "CHAIN_BOUNDS");
  // Entry lists may exceed the small generic string-list bound.
  let last = null; let total = 0;
  const entries = before.entries.map(x => {
    keys(x, ["path", "type", "posixMode", "bytes", "sha256"]); abs(x.path);
    need(last === null || Buffer.compare(Buffer.from(last), Buffer.from(x.path)) < 0); last = x.path;
    need(before.roots.some(root => within(root, x.path)) && ["directory", "regular", "symlink"].includes(x.type));
    need(/^[0-7]{5,6}$/u.test(x.posixMode)); count(x.bytes); digest(x.sha256); total += x.bytes;
    if (x.type === "directory") { equal(x.bytes, 0); equal(x.sha256, sha("")); }
    return { path: x.path, type: x.type, posixMode: x.posixMode, bytes: x.bytes, sha256: x.sha256 };
  });
  count(total); equal(before.entryCount, entries.length); equal(before.totalBytes, total);
  equal(before.inputFingerprint, sha(jsonBytes({ schema: "hourkey-observed-input-fingerprint/v1", label, roots: before.roots, entries })), "CHAIN_MANIFEST_FINGERPRINT");
  return before;
}

function homePolicy(reader, sandbox, expected) {
  const home = reader.read(sandbox.homePolicy, true);
  keys(home, ["schema", "inheritedHome", "artifactDir", "namespaceHome", "privateHomeStorage", "storageIdentity", "sentinel"]);
  equal(home.schema, "hourkey-observed-home-policy/v1"); equal(home.artifactDir, reader.root);
  const h = home.inheritedHome; keys(h, ["schema", "present", "value", "osHome"]);
  equal(h.schema, "hourkey-inherited-home/v1"); abs(h.osHome);
  need(typeof h.present === "boolean" && (h.present ? h.value === h.osHome : h.value === null));
  equal(home.namespaceHome, h.osHome); equal(home.privateHomeStorage, path.join(reader.root, "private-home-storage"));
  need(!within(home.privateHomeStorage, home.namespaceHome));
  const s = home.storageIdentity, i = home.sentinel.identity;
  keys(s, ["dev", "ino", "uid", "gid", "mode"]); keys(i, ["dev", "ino", "uid", "gid", "mode", "nlink", "mtimeNs", "ctimeNs"]);
  for (const item of [s, i]) for (const key of ["dev", "ino", "uid", "gid"]) need(typeof item[key] === "string" && DIGITS.test(item[key]));
  equal(s.mode, "40700"); equal(i.mode, "100600"); equal(i.nlink, "1"); equal(i.uid, s.uid); equal(i.gid, s.gid);
  need(DIGITS.test(i.mtimeNs) && DIGITS.test(i.ctimeNs));
  keys(home.sentinel, ["leaf", "bytes", "sha256", "identity"]); equal(home.sentinel.leaf, ".hourkey-observed-home-v1");
  count(home.sentinel.bytes); need(home.sentinel.bytes > 0 && home.sentinel.bytes <= 4096); digest(home.sentinel.sha256);
  const normalized = { schema: home.schema, inheritedHome: { schema: h.schema, present: h.present, value: h.value, osHome: h.osHome },
    artifactDir: home.artifactDir, namespaceHome: home.namespaceHome, privateHomeStorage: home.privateHomeStorage,
    storageIdentity: { dev: s.dev, ino: s.ino, uid: s.uid, gid: s.gid, mode: s.mode },
    sentinel: { leaf: home.sentinel.leaf, bytes: home.sentinel.bytes, sha256: home.sentinel.sha256,
      identity: { dev: i.dev, ino: i.ino, uid: i.uid, gid: i.gid, mode: i.mode, nlink: i.nlink, mtimeNs: i.mtimeNs, ctimeNs: i.ctimeNs } } };
  equal(sha(jsonBytes(normalized)), expected.homePolicyDigest); equal(sandbox.homePolicyDigest, expected.homePolicyDigest);
  equal(sandbox.homePolicy.sha256, expected.homePolicySha256); equal(sandbox.preservedHome, h); equal(sandbox.privateHomeStorage, home.privateHomeStorage);
  return home;
}

function command(reader, group, trusted, captureText = false, markers = undefined) {
  object(trusted); strings(trusted.argv); need(trusted.argv.length > 0); abs(trusted.argv[0]); abs(trusted.cwd); sorted(trusted.environmentKeys);
  const record = reader.read(group.commandRecord, true);
  keys(record, ["schema", "argv", "cwd", "startedAt", "endedAt", "durationMs", "exitCode", "signal", "spawnError", "environmentKeys", "stdout", "stderr"]);
  equal(record.schema, "hourkey-observed-command/v1"); equal(record.argv, trusted.argv); equal(record.cwd, trusted.cwd);
  equal(record.environmentKeys, trusted.environmentKeys); equal(record.exitCode, 0); equal(record.signal, null); equal(record.spawnError, null);
  need(typeof record.startedAt === "string" && typeof record.endedAt === "string" && Number.isFinite(Date.parse(record.startedAt)) &&
    Date.parse(record.endedAt) >= Date.parse(record.startedAt));
  need(typeof record.durationMs === "number" && Number.isFinite(record.durationMs) && record.durationMs >= 0);
  equal(record.stdout, group.stdout); equal(record.stderr, group.stderr);
  const stdout = reader.read(group.stdout, false, captureText, markers); reader.read(group.stderr);
  return { record, stdout };
}

function validate(reader, request) {
  const e = request.expected; object(e); abs(e.sourceRoot); abs(e.goldenRoot); need(e.sourceRoot !== e.goldenRoot);
  for (const key of ["sourceCommit", "qimenGoldenCommit"]) need(typeof e[key] === "string" && COMMIT.test(e[key]));
  for (const key of ["sourceFingerprint", "qimenGoldenSourceFingerprint", "homePolicySha256", "homePolicyDigest"]) digest(e[key]);
  equal(e.statusSha256, sha("")); need(typeof e.parentNetworkNamespace === "string" && NET.test(e.parentNetworkNamespace));
  equal(request.privateReceipt.path, path.join(reader.root, "observed-internal-preview-receipt.private.json"));
  equal(request.publicReceipt.path, path.join(reader.root, "observed-internal-preview-receipt.public.json"));
  const p = reader.read(request.privateReceipt, true), pub = reader.read(request.publicReceipt, true);
  keys(p, ["schema", "assurance", "limitations", "sourceRoot", "artifactDir", "source", "sourceGates", "inputs", "sandbox", "build", "inspections", "apk", "publicReceipt"]);
  keys(pub, ["schema", "assurance", "privacy", "limitations", "source", "inputs", "sourceGates", "build", "apk"]);
  equal(p.schema, "hourkey-observed-internal-preview-receipt-private/v2"); equal(pub.schema, "hourkey-observed-internal-preview-receipt-public/v2");
  equal(p.assurance, ASSURANCE); equal(pub.assurance, ASSURANCE); equal(pub.privacy, "paths-argv-and-log-content-redacted");
  equal(p.limitations, DISCLAIMERS); equal(pub.limitations, p.limitations);
  equal(p.sourceRoot, e.sourceRoot); equal(p.artifactDir, reader.root); equal(p.publicReceipt, request.publicReceipt);
  keys(p.source, ["headCommit", "statusSha256", "sourceFingerprint", "before", "after", "final", "mutationJournal", "mutationJournalStderr"]);
  keys(p.sourceGates, ["commandRecord", "stdout", "stderr", "childResult", "inputManifest", "sandbox", "qimenGoldenSource"]);
  keys(p.build, ["commandRecord", "stdout", "stderr", "childResult"]);
  keys(p.inputs, ["dependencies", "toolchain", "nativeSourceManifest"]);
  for (const group of [p.inputs.dependencies, p.inputs.toolchain, p.sourceGates.inputManifest]) keys(group, ["before", "after"]);
  keys(p.sourceGates.qimenGoldenSource, ["before", "after", "final"]);
  keys(p.inputs.nativeSourceManifest, ["before", "after", "final", "continuousObservation"]);
  keys(p.inspections, ["il2cppApkEntry", "aapt", "apksigner"]);
  keys(p.inspections.il2cppApkEntry, ["generated", "commandRecord", "stdout", "stderr"]);
  for (const group of [p.inspections.aapt, p.inspections.apksigner]) keys(group, ["commandRecord", "stdout", "stderr"]);
  keys(p.apk, ["path", "sha256", "bytes", "packageName", "versionCode", "versionName", "signerSha256"]);
  keys(p.sandbox, ["policy", "rootReadOnly", "networkNamespace", "pidNamespace", "writableBinds", "homePolicy", "homePolicyDigest", "preservedHome",
    "privateHomeStorage", "readOnlyHomeInputs", "dedicatedGradleUserHome", "dedicatedNpmCache", "gradleReadOnlyDependencyCache",
    "nodeModulesBuildOverlay", "il2cppSourceBuildOverlay", "environmentKeys"]);
  need([POLICY, CANONICAL_POLICY, BOUNDED_POLICY].includes(p.sandbox.policy), "CHAIN_POLICY_UNSUPPORTED");
  equal(pub.build.fixedPolicy, p.sandbox.policy, "CHAIN_POLICY_MISMATCH");
  const boundedRecipe = p.sandbox.policy === BOUNDED_POLICY;
  const canonicalRecipe = p.sandbox.policy === CANONICAL_POLICY || boundedRecipe;
  keys(p.sourceGates.sandbox, ["network", "parentNetworkNamespace", "pidNamespace", "readOnlyHomeInputs", "symlinks", "writableBinds"]);
  const mobile = sourceManifest(reader, p.source, { commit: e.sourceCommit, fingerprint: e.sourceFingerprint }, e.sourceRoot);
  equal(p.source.headCommit, e.sourceCommit); equal(p.source.statusSha256, e.statusSha256); equal(p.source.sourceFingerprint, e.sourceFingerprint);
  object(e.fullSuite); equal(e.fullSuite.path, "scripts/mobile-full-suite.mjs"); count(e.fullSuite.bytes); digest(e.fullSuite.sha256);
  const suite = mobile.files.find(x => x.path === e.fullSuite.path);
  need(suite && suite.type === "regular"); equal(plainDescriptor(suite), e.fullSuite);
  reader.read(p.source.mutationJournal); reader.read(p.source.mutationJournalStderr);
  const sg = p.sourceGates;
  sourceManifest(reader, sg.qimenGoldenSource, { commit: e.qimenGoldenCommit, fingerprint: e.qimenGoldenSourceFingerprint }, e.goldenRoot);
  const fingerprints = e.inputFingerprints; object(fingerprints);
  inputManifest(reader, p.inputs.dependencies, "dependencies-before", fingerprints.dependencies);
  const toolchain = inputManifest(reader, p.inputs.toolchain, "toolchain-before", fingerprints.toolchain);
  inputManifest(reader, p.inputs.nativeSourceManifest, "native-build-inputs", fingerprints.nativeSource, true);
  inputManifest(reader, sg.inputManifest, "source-gate-inputs", fingerprints.sourceGateInputs);
  const observation = p.inputs.nativeSourceManifest.continuousObservation;
  keys(observation, ["protectedInputRoots", "permittedInputMutationRoots"]);
  for (const name of Object.keys(observation)) { strings(observation[name]); observation[name].forEach(abs); }
  need(observation.permittedInputMutationRoots.every(x => observation.protectedInputRoots.some(root => within(root, x))));
  const home = homePolicy(reader, p.sandbox, e);
  for (const bindings of [sg.sandbox.readOnlyHomeInputs, p.sandbox.readOnlyHomeInputs]) {
    need(Array.isArray(bindings) && bindings.length <= 4096);
    for (const binding of bindings) { keys(binding, ["source", "destination"]); abs(binding.source); abs(binding.destination); }
  }
  need(Array.isArray(sg.sandbox.symlinks) && sg.sandbox.symlinks.length <= 4096);
  for (const link of sg.sandbox.symlinks) { keys(link, ["path", "target"]); abs(link.path); abs(link.target); }
  const canonicalGradleHome = path.join(home.namespaceHome, ".gradle");
  if (canonicalRecipe) equal(p.sandbox.dedicatedGradleUserHome, canonicalGradleHome);
  else need(within(reader.root, abs(p.sandbox.dedicatedGradleUserHome)));
  need(within(reader.root, abs(p.sandbox.dedicatedNpmCache)));
  abs(p.sandbox.gradleReadOnlyDependencyCache);
  for (const [name, outputs] of [["nodeModulesBuildOverlay", "outputRoots"], ["il2cppSourceBuildOverlay", "outputFiles"]]) {
    const overlay = p.sandbox[name]; keys(overlay, ["upperRoot", "entryCount", outputs]);
    need(within(reader.root, abs(overlay.upperRoot))); count(overlay.entryCount); strings(overlay[outputs]);
  }
  equal(p.sandbox.rootReadOnly, true); equal(p.sandbox.networkNamespace, "unshared"); equal(p.sandbox.pidNamespace, "unshared");
  equal(sg.sandbox.network, "inherited"); equal(sg.sandbox.pidNamespace, "unshared"); equal(sg.sandbox.parentNetworkNamespace, e.parentNetworkNamespace);
  const requiredBinds = [home.namespaceHome, ...(canonicalRecipe ? [canonicalGradleHome] : []), e.sourceRoot, reader.root];
  equal(sg.sandbox.writableBinds, requiredBinds);
  strings(p.sandbox.writableBinds); p.sandbox.writableBinds.forEach(abs);
  for (const required of requiredBinds) need(p.sandbox.writableBinds.includes(required));
  if (!canonicalRecipe) need(!p.sandbox.writableBinds.includes(canonicalGradleHome), "CHAIN_POLICY_MISMATCH");
  sorted(p.sandbox.environmentKeys);
  const src = command(reader, sg, e.commands.source, false, ["mobile full suite: PASS (311 commands)", "OBSERVED_SOURCE_GATES_CHILD_OK"]);
  const build = command(reader, p.build, e.commands.build, false,
    [`MOBILE_SOURCE_GATES_PREVERIFIED ${sg.commandRecord.sha256}`, "OBSERVED_INTERNAL_PREVIEW_CHILD_OK"]);
  need(Date.parse(src.record.endedAt) <= Date.parse(build.record.startedAt), "CHAIN_STAGE_ORDER");
  equal(p.sandbox.environmentKeys, build.record.environmentKeys);
  const sc = reader.read(sg.childResult, true), nc = reader.read(p.build.childResult, true);
  keys(sc, ["schema", "assurance", "sourceRoot", "artifactDir", "homePolicySha256", "homePolicyDigest", "homeNamespaceVerified", "networkNamespace", "command", "exitCode"]);
  keys(nc, ["schema", "assurance", "sourceRoot", "artifactDir", "homePolicySha256", "homePolicyDigest", "homeNamespaceVerified", "apk", "generatedApk",
    "generatedApkBytes", "generatedApkMtimeNs", "generatedApkCtimeNs", "generatedIl2cppPrecondition", "generatedIl2cpp", "buildStartedAt", "buildEndedAt", "network", "fixedCommands"]);
  equal(sc.schema, "hourkey-observed-source-gates-child/v1"); equal(nc.schema, "hourkey-observed-internal-preview-build-child/v2");
  for (const child of [sc, nc]) {
    equal(child.assurance, ASSURANCE); equal(child.sourceRoot, e.sourceRoot); equal(child.artifactDir, reader.root);
    equal(child.homePolicySha256, e.homePolicySha256); equal(child.homePolicyDigest, e.homePolicyDigest); equal(child.homeNamespaceVerified, true);
  }
  equal(sc.command, ["/usr/bin/node", "scripts/mobile-full-suite.mjs"]); equal(sc.exitCode, 0); equal(sc.networkNamespace, e.parentNetworkNamespace);
  equal(nc.network.parentNetNamespace, e.parentNetworkNamespace);
  keys(nc.network, ["ownNetNamespace", "parentNetNamespace"]);
  keys(nc.fixedCommands, ["shrineUnityExportGate", "sourceGateSelfTest", "sourceGates", "gradle"]);
  need(typeof nc.network.ownNetNamespace === "string" && NET.test(nc.network.ownNetNamespace) && nc.network.ownNetNamespace !== e.parentNetworkNamespace);
  equal(nc.fixedCommands.sourceGates, { mode: "preverified-by-observed-parent", commandRecordSha256: sg.commandRecord.sha256 });
  for (const key of ["shrineUnityExportGate", "sourceGateSelfTest", "gradle"]) { strings(e.nativeCommands[key]); equal(nc.fixedCommands[key], e.nativeCommands[key]); }
  equal(nc.fixedCommands.sourceGateSelfTest, ["/usr/bin/node", "scripts/mobile-full-suite.mjs", "--self-test"]);
  equal(nc.fixedCommands.shrineUnityExportGate, ["/usr/bin/node", "scripts/test-shrine-unity-android-export.mts"]);
  equal(nc.fixedCommands.gradle.slice(1), ["--project-dir", `${e.sourceRoot}/android`, `-Duser.home=${home.privateHomeStorage}`,
    ...(canonicalRecipe ? ["--init-script", `${e.sourceRoot}/scripts/observed-native-clean.init.gradle`,
      `-Dhourkey.observed.clean.unityBuildRoot=${CANONICAL_UNITY_BUILD_ROOT}`,
      `-Dhourkey.observed.clean.privateUnityBuildRoot=${reader.root}/unity-build-owned-view/build`] : []),
    "-PreactNativeArchitectures=arm64-v8a", ...(canonicalRecipe ? ["-PreactNativeDevServerIp=172.18.0.1", "clean"] : []),
    ":unityLibrary:buildIl2Cpp", ":app:createBundleReleaseJsAndAssets", ":app:assembleRelease",
    "--offline", "--no-daemon", "--no-build-cache", "--rerun-tasks",
    ...(boundedRecipe ? ["--max-workers=2", "--no-parallel"] : []), "--stacktrace"]);
  const toolPaths = new Set(["/usr/bin/node", e.nativeCommands.gradle[0], ...Object.values(e.commands).map(x => x.argv[0])]);
  need(Array.isArray(e.tools) && e.tools.length > 0 && e.tools.length <= 256);
  const seen = new Set();
  for (const tool of e.tools) {
    descriptor(tool); need(!seen.has(tool.path)); seen.add(tool.path);
    const manifested = toolchain.entries.find(x => x.path === tool.path && x.type === "regular");
    need(manifested); equal(plainDescriptor(manifested), tool);
  }
  for (const tool of toolPaths) need(seen.has(tool), "CHAIN_TRUSTED_TOOL_MISSING");
  const apk = p.apk; descriptor(plainDescriptor(apk)); need(apk.bytes > 0);
  equal(apk.path, path.join(reader.root, "Hourkey-Android-observed-internal-preview.apk")); equal(nc.apk, apk.path);
  // generatedApk is historical mutable scratch. Crosslink metadata only; never
  // reopen it or any source/input path named inside a retained manifest.
  equal(nc.generatedApk, `${e.sourceRoot}/android/app/build/outputs/apk/release/app-release.apk`); equal(nc.generatedApkBytes, apk.bytes);
  equal(nc.generatedIl2cppPrecondition, "absent");
  const generated = nc.generatedIl2cpp; keys(generated, ["path", "bytes", "sha256", "mtimeNs", "ctimeNs"]);
  equal(generated.path, path.join(reader.root, "unity-build-owned-view/jniLibs/arm64-v8a/libil2cpp.so")); need(generated.bytes > 0);
  const start = Date.parse(nc.buildStartedAt), end = Date.parse(nc.buildEndedAt); need(Number.isFinite(start) && Number.isFinite(end) && end >= start);
  need(start >= Date.parse(build.record.startedAt) && end <= Date.parse(build.record.endedAt), "CHAIN_STAGE_ORDER");
  for (const time of [generated.mtimeNs, generated.ctimeNs, nc.generatedApkMtimeNs, nc.generatedApkCtimeNs]) {
    need(typeof time === "string" && DIGITS.test(time) && time.length <= 30);
    need(BigInt(time) >= BigInt(start - 2000) * 1000000n);
  }
  reader.read(plainDescriptor(apk), false, false, undefined, true);
  reader.read(plainDescriptor(generated), false, false, undefined, true);
  const il = p.inspections.il2cppApkEntry; equal(il.generated, generated);
  equal(e.commands.il2cppApkEntry.argv.slice(1), ["-p", "/proc/self/fd/3", "lib/arm64-v8a/libil2cpp.so"]);
  equal(e.commands.aapt.argv.slice(1), ["dump", "badging", "/proc/self/fd/3"]);
  equal(e.commands.apksigner.argv.slice(1), ["verify", "--print-certs", "/proc/self/fd/3"]);
  const ilCommand = command(reader, il, e.commands.il2cppApkEntry); equal(redacted(il.stdout), redacted(generated));
  const aaptCommand = command(reader, p.inspections.aapt, e.commands.aapt, true);
  const signerCommand = command(reader, p.inspections.apksigner, e.commands.apksigner, true);
  let previousEnd = Date.parse(build.record.endedAt);
  for (const item of [ilCommand, aaptCommand, signerCommand]) {
    need(Date.parse(item.record.startedAt) >= previousEnd, "CHAIN_STAGE_ORDER"); previousEnd = Date.parse(item.record.endedAt);
  }
  const aapt = aaptCommand.stdout, signer = signerCommand.stdout;
  const packageRows = aapt.split(/\r?\n/u).filter(x => x.startsWith("package:")); need(packageRows.length === 1);
  const match = packageRows[0].match(/^package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']*)'(?:\s+.*)?$/u); need(match);
  equal(match.slice(1), [apk.packageName, apk.versionCode, apk.versionName]); equal(apk.packageName, "io.hourkey.app");
  need(/^[1-9][0-9]{0,9}$/u.test(apk.versionCode) && Number(apk.versionCode) <= 2100000000 && typeof apk.versionName === "string");
  const certificates = signer.split(/\r?\n/u).map(x => x.match(/^Signer #(\d+) certificate SHA-256 digest:\s*(\S+)\s*$/u)).filter(Boolean);
  need(certificates.length === 1 && certificates[0][1] === "1"); digest(apk.signerSha256);
  equal(certificates[0][2].replaceAll(":", "").toLowerCase(), apk.signerSha256);
  const apkMetadata = { sha256: apk.sha256, bytes: apk.bytes, packageName: apk.packageName, versionCode: apk.versionCode,
    versionName: apk.versionName, signerSha256: apk.signerSha256 };
  equal(apkMetadata, e.apk);
  equal(pub.source, { headCommit: e.sourceCommit, statusSha256: e.statusSha256, sourceFingerprint: e.sourceFingerprint,
    manifestSha256: p.source.before.sha256, mutationJournalSha256: p.source.mutationJournal.sha256 });
  equal(pub.inputs, { dependenciesSha256: p.inputs.dependencies.before.sha256, toolchainSha256: p.inputs.toolchain.before.sha256,
    nativeSourceManifestSha256: p.inputs.nativeSourceManifest.before.sha256, homePolicySha256: e.homePolicySha256,
    sourceGateInputsSha256: sg.inputManifest.before.sha256 });
  equal(pub.sourceGates, { commandRecordSha256: sg.commandRecord.sha256, stdout: redacted(sg.stdout), stderr: redacted(sg.stderr),
    exitCode: src.record.exitCode, childResultSha256: sg.childResult.sha256, homeNamespaceVerified: true,
    networkPolicy: "inherited-for-existing-local-engine-checks", qimenGoldenCommit: e.qimenGoldenCommit,
    qimenGoldenSourceFingerprint: e.qimenGoldenSourceFingerprint });
  equal(pub.build, { fixedPolicy: p.sandbox.policy, commandRecordSha256: p.build.commandRecord.sha256,
    stdout: redacted(p.build.stdout), stderr: redacted(p.build.stderr), exitCode: build.record.exitCode });
  equal(pub.apk, { ...apkMetadata, signerPolicy: "external-release-certificate-fingerprint-only" });
}

/**
 * Caller supplies both root receipt descriptors plus independent expected
 * commits/fingerprints/HOME digests, source full-suite identity, APK metadata,
 * command argv/cwd/environmentKeys, nativeCommands and tool descriptors.
 * Limits may only tighten the documented hard ceilings. No receipt-selected
 * command is run and no manifested host input is opened. A valid result means
 * selected retained bytes crosslink, not that any described event occurred.
 * Recognizes only paired v3 legacy, v4 canonical-path/clean, or v5 canonical
 * recipes with exact --max-workers=2 --no-parallel before --stacktrace;
 * recognition does not prove either recipe actually executed or was isolated.
 * This subset must not replace or bypass existing mandatory release gates.
 */
function verifyObservedMobileChain(request) {
  let reader; let valid = false; const errors = [];
  try {
    object(request); descriptor(request.privateReceipt); descriptor(request.publicReceipt);
    reader = new Reader(request.artifactRoot, request.limits);
    validate(reader, request); reader.finish(); valid = true;
  } catch (error) {
    errors.push(error instanceof Invalid ? error.code :
      error && error.code === "ENOENT" ? "CHAIN_FILE_MISSING" : "CHAIN_READ_OR_SCHEMA_FAILED");
  } finally { if (reader) reader.close(); }
  return Object.freeze({ schema: "hourkey-remediation-observed-mobile-chain/v1", chainIntegrityValid: valid,
    validationScope: "retained-byte integrity and selected crosslinks; not complete producer-policy equivalence or release approval",
    executionAuthorityVerified: false, releaseReady: false, errors: Object.freeze(errors), missingProofs: MISSING,
    verifiedFileCount: valid ? reader.files.size : 0, verifiedBytes: valid ? reader.total : 0 });
}
module.exports = Object.freeze({ verifyObservedMobileChain });
