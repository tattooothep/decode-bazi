import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const fs = require("node:fs");
const { verifyObservedMobileChain } = require("./lib/remediation-observed-mobile-chain.cjs");
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const clone = (value: any) => JSON.parse(JSON.stringify(value));
const assurance = "observed-not-bound-not-immutable-not-acceptance";
const policy = "hourkey-fixed-bwrap-offline-internal-preview/v3";
const limitations = ["Records one internal preview build observed on this host only.",
  "Does not prove reproducibility, immutability, provenance, or acceptance readiness.",
  "Does not authorize deploy, distribution, production signing, or release.",
  "External signer secrets, store path, and store hash are not recorded; only the APK certificate SHA-256 is retained.",
  "Source may change after the final observed boundary; consumers must re-verify current state."];
const scratch = fs.mkdtempSync(join(tmpdir(), "hourkey-observed-chain-synthetic-"));
let sequence = 0;

// Deliberately fabricated bytes, never a build or a signature. Positive tests
// prove only the reader's consistency checks, not execution/release authority.
function fixture() {
  const root = join(scratch, String(++sequence));
  fs.mkdirSync(root, { mode: 0o700 });
  const sourceRoot = "/synthetic/mobile";
  const goldenRoot = "/synthetic/golden";
  const write = (leaf: string, value: unknown, opaque = false) => {
    const path = join(root, leaf);
    fs.mkdirSync(join(path, ".."), { recursive: true });
    const bytes = opaque ? Buffer.from(value as string) : json(value);
    fs.writeFileSync(path, bytes, { mode: 0o600 });
    return { path, bytes: bytes.length, sha256: sha(bytes) };
  };
  const source = (sourceRoot: string, headCommit: string) => {
    const files = [{ path: "scripts/mobile-full-suite.mjs", origin: "tracked", type: "regular",
      worktreeMode: "100644", posixMode: "100644", indexMode: "100644", indexObjectId: "3".repeat(40), bytes: 5, sha256: sha("suite") }];
    const status = { format: "git-status-porcelain-v2-z", bytes: 0, sha256: sha(""), porcelainV2ZBase64: "" };
    const enumeration = { trackedBytes: 1, trackedSha256: sha("t"), untrackedBytes: 0, untrackedSha256: sha("") };
    return { schema: "hourkey-observed-source-manifest/v1", sourceRoot, headCommit, status, enumeration,
      fileCount: files.length, totalBytes: 5,
      sourceFingerprint: sha(json({ schema: "hourkey-observed-source-fingerprint/v1", headCommit, statusSha256: status.sha256,
        trackedEnumerationSha256: enumeration.trackedSha256, untrackedEnumerationSha256: enumeration.untrackedSha256, files })), files };
  };
  const mobile = source(sourceRoot, "1".repeat(40));
  const golden = source(goldenRoot, "2".repeat(40));
  const copies = (prefix: string, object: unknown, final = false) => ({ before: write(`${prefix}-before.json`, object),
    after: write(`${prefix}-after.json`, object), ...(final ? { final: write(`${prefix}-final.json`, object) } : {}) });
  const tools = ["/usr/bin/bwrap", "/usr/bin/node", "/usr/bin/unzip", "/synthetic/aapt", "/synthetic/apksigner", "/synthetic/gradle"]
    .map(path => ({ path, bytes: 4, sha256: sha("tool") }));
  const input = (label: string, tool = false) => {
    const entries = (tool ? tools : [{ path: "/synthetic/input", bytes: 5, sha256: sha("input") }])
      .map(x => ({ path: x.path, type: "regular", posixMode: "100755", bytes: x.bytes, sha256: x.sha256 }))
      .sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
    const roots = entries.map(x => x.path);
    return { schema: "hourkey-observed-input-manifest/v1", label, roots, entryCount: entries.length,
      totalBytes: entries.reduce((n, x) => n + x.bytes, 0),
      inputFingerprint: sha(json({ schema: "hourkey-observed-input-fingerprint/v1", label, roots, entries })), entries };
  };
  const manifests = { dependencies: input("dependencies-before"), toolchain: input("toolchain-before", true),
    nativeSource: input("native-build-inputs"), sourceGateInputs: input("source-gate-inputs") };
  const inheritedHome = { schema: "hourkey-inherited-home/v1", present: true, value: "/synthetic/home", osHome: "/synthetic/home" };
  const home = { schema: "hourkey-observed-home-policy/v1", inheritedHome, artifactDir: root,
    namespaceHome: inheritedHome.osHome, privateHomeStorage: join(root, "private-home-storage"),
    storageIdentity: { dev: "1", ino: "2", uid: "0", gid: "0", mode: "40700" },
    sentinel: { leaf: ".hourkey-observed-home-v1", bytes: 1, sha256: sha("x"),
      identity: { dev: "1", ino: "3", uid: "0", gid: "0", mode: "100600", nlink: "1", mtimeNs: "1", ctimeNs: "1" } } };
  const homeFile = write("observed-home-policy.private.json", home);
  const homeDigest = sha(json(home));
  const environmentKeys = ["HOME", "PATH"];
  const commands: any = {
    source: { argv: ["/usr/bin/bwrap", "--synthetic-full-source", root], cwd: sourceRoot, environmentKeys },
    build: { argv: ["/usr/bin/bwrap", "--synthetic-native", root], cwd: sourceRoot, environmentKeys },
    il2cppApkEntry: { argv: ["/usr/bin/unzip", "-p", "/proc/self/fd/3", "lib/arm64-v8a/libil2cpp.so"], cwd: sourceRoot, environmentKeys },
    aapt: { argv: ["/synthetic/aapt", "dump", "badging", "/proc/self/fd/3"], cwd: sourceRoot, environmentKeys },
    apksigner: { argv: ["/synthetic/apksigner", "verify", "--print-certs", "/proc/self/fd/3"], cwd: sourceRoot, environmentKeys },
  };
  const signerSha256 = sha("not-a-certificate");
  const apk = { ...write("Hourkey-Android-observed-internal-preview.apk", "not-an-apk", true),
    packageName: "io.hourkey.app", versionCode: "234", versionName: "2.3.4", signerSha256 };
  const records: any = {};
  const recorded = (name: string, stdout = "") => {
    const output = write(`${name}.stdout`, stdout, true);
    const error = write(`${name}.stderr`, "", true);
    const stage = Object.keys(commands).indexOf(name) * 2;
    const object = { schema: "hourkey-observed-command/v1", ...commands[name],
      startedAt: `2026-09-05T00:00:0${stage}.000Z`, endedAt: `2026-09-05T00:00:0${stage + 1}.000Z`, durationMs: 999.75,
      exitCode: 0, signal: null, spawnError: null, stdout: output, stderr: error };
    records[name] = object;
    return { commandRecord: write(`${name}.command.json`, object), stdout: output, stderr: error };
  };
  const sourceGates: any = { ...recorded("source", "mobile full suite: PASS (311 commands)\nOBSERVED_SOURCE_GATES_CHILD_OK\n"),
    inputManifest: copies("source-input", manifests.sourceGateInputs),
    sandbox: { network: "inherited", parentNetworkNamespace: "4:5", pidNamespace: "unshared", readOnlyHomeInputs: [], symlinks: [],
      writableBinds: [home.namespaceHome, sourceRoot, root] },
    qimenGoldenSource: copies("golden", golden, true) };
  const sourceChild: any = { schema: "hourkey-observed-source-gates-child/v1", assurance, sourceRoot, artifactDir: root,
    homePolicySha256: homeFile.sha256, homePolicyDigest: homeDigest, homeNamespaceVerified: true, networkNamespace: "4:5",
    command: ["/usr/bin/node", "scripts/mobile-full-suite.mjs"], exitCode: 0 };
  sourceGates.childResult = write("observed-source-gates-result.private.json", sourceChild);
  const generated = { ...write("unity-build-owned-view/jniLibs/arm64-v8a/libil2cpp.so", "synthetic-il2cpp", true),
    mtimeNs: "1788566400000000000", ctimeNs: "1788566400000000000" };
  const nativeCommands = { shrineUnityExportGate: ["/usr/bin/node", "scripts/test-shrine-unity-android-export.mts"],
    sourceGateSelfTest: ["/usr/bin/node", "scripts/mobile-full-suite.mjs", "--self-test"],
    gradle: ["/synthetic/gradle", "--project-dir", `${sourceRoot}/android`, `-Duser.home=${home.privateHomeStorage}`,
      "-PreactNativeArchitectures=arm64-v8a", ":unityLibrary:buildIl2Cpp", ":app:createBundleReleaseJsAndAssets", ":app:assembleRelease",
      "--offline", "--no-daemon", "--no-build-cache", "--rerun-tasks", "--stacktrace"] };
  const nativeChild: any = { schema: "hourkey-observed-internal-preview-build-child/v2", assurance, sourceRoot, artifactDir: root,
    homePolicySha256: homeFile.sha256, homePolicyDigest: homeDigest, homeNamespaceVerified: true,
    apk: apk.path, generatedApk: `${sourceRoot}/android/app/build/outputs/apk/release/app-release.apk`, generatedApkBytes: apk.bytes,
    generatedApkMtimeNs: generated.mtimeNs, generatedApkCtimeNs: generated.ctimeNs, generatedIl2cppPrecondition: "absent",
    generatedIl2cpp: generated, buildStartedAt: "2026-09-05T00:00:02.000Z", buildEndedAt: "2026-09-05T00:00:03.000Z",
    network: { ownNetNamespace: "4:6", parentNetNamespace: "4:5" }, fixedCommands: { ...nativeCommands,
      sourceGates: { mode: "preverified-by-observed-parent", commandRecordSha256: sourceGates.commandRecord.sha256 } } };
  const build: any = { ...recorded("build", `MOBILE_SOURCE_GATES_PREVERIFIED ${sourceGates.commandRecord.sha256}\nOBSERVED_INTERNAL_PREVIEW_CHILD_OK\n`),
    childResult: write("observed-build-child-result.private.json", nativeChild) };
  const inspections = { il2cppApkEntry: { generated, ...recorded("il2cppApkEntry", "synthetic-il2cpp") },
    aapt: recorded("aapt", "package: name='io.hourkey.app' versionCode='234' versionName='2.3.4'\n"),
    apksigner: recorded("apksigner", `Signer #1 certificate SHA-256 digest: ${signerSha256}\n`) };
  const receipt: any = { schema: "hourkey-observed-internal-preview-receipt-private/v2", assurance,
    limitations, sourceRoot, artifactDir: root,
    source: { headCommit: mobile.headCommit, statusSha256: mobile.status.sha256, sourceFingerprint: mobile.sourceFingerprint,
      ...copies("source", mobile, true), mutationJournal: write("journal.log", "", true), mutationJournalStderr: write("journal.stderr", "", true) },
    sourceGates, inputs: { dependencies: copies("dependencies", manifests.dependencies), toolchain: copies("toolchain", manifests.toolchain),
      nativeSourceManifest: { ...copies("native", manifests.nativeSource, true), continuousObservation: {
        protectedInputRoots: ["/synthetic/input"], permittedInputMutationRoots: [] } } },
    sandbox: { policy, rootReadOnly: true, networkNamespace: "unshared", pidNamespace: "unshared",
      writableBinds: [home.namespaceHome, sourceRoot, root], homePolicy: homeFile, homePolicyDigest: homeDigest,
      preservedHome: inheritedHome, privateHomeStorage: home.privateHomeStorage, readOnlyHomeInputs: [],
      dedicatedGradleUserHome: join(root, "gradle-user-home"), dedicatedNpmCache: join(root, "npm-cache"),
      gradleReadOnlyDependencyCache: "/synthetic/gradle-cache",
      nodeModulesBuildOverlay: { upperRoot: join(root, "node-upper"), entryCount: 0, outputRoots: [] },
      il2cppSourceBuildOverlay: { upperRoot: join(root, "il2cpp-upper"), entryCount: 0, outputFiles: [] }, environmentKeys }, build, inspections, apk };
  const redacted = (d: any) => ({ bytes: d.bytes, sha256: d.sha256 });
  const publicReceipt: any = { schema: "hourkey-observed-internal-preview-receipt-public/v2", assurance,
    privacy: "paths-argv-and-log-content-redacted", limitations: receipt.limitations,
    source: { headCommit: mobile.headCommit, statusSha256: mobile.status.sha256, sourceFingerprint: mobile.sourceFingerprint,
      manifestSha256: receipt.source.before.sha256, mutationJournalSha256: receipt.source.mutationJournal.sha256 },
    inputs: { dependenciesSha256: receipt.inputs.dependencies.before.sha256, toolchainSha256: receipt.inputs.toolchain.before.sha256,
      nativeSourceManifestSha256: receipt.inputs.nativeSourceManifest.before.sha256, homePolicySha256: homeFile.sha256,
      sourceGateInputsSha256: sourceGates.inputManifest.before.sha256 },
    sourceGates: { commandRecordSha256: sourceGates.commandRecord.sha256, stdout: redacted(sourceGates.stdout), stderr: redacted(sourceGates.stderr),
      exitCode: 0, childResultSha256: sourceGates.childResult.sha256, homeNamespaceVerified: true,
      networkPolicy: "inherited-for-existing-local-engine-checks", qimenGoldenCommit: golden.headCommit,
      qimenGoldenSourceFingerprint: golden.sourceFingerprint },
    build: { fixedPolicy: policy, commandRecordSha256: build.commandRecord.sha256, stdout: redacted(build.stdout), stderr: redacted(build.stderr), exitCode: 0 },
    apk: { ...redacted(apk), packageName: apk.packageName, versionCode: apk.versionCode, versionName: apk.versionName, signerSha256,
      signerPolicy: "external-release-certificate-fingerprint-only" } };
  const expected: any = { sourceRoot, sourceCommit: mobile.headCommit, sourceFingerprint: mobile.sourceFingerprint, statusSha256: sha(""),
    goldenRoot, qimenGoldenCommit: golden.headCommit, qimenGoldenSourceFingerprint: golden.sourceFingerprint,
    homePolicySha256: homeFile.sha256, homePolicyDigest: homeDigest, parentNetworkNamespace: "4:5",
    fullSuite: { path: "scripts/mobile-full-suite.mjs", bytes: 5, sha256: sha("suite") },
    apk: { ...redacted(apk), packageName: apk.packageName, versionCode: apk.versionCode, versionName: apk.versionName, signerSha256 },
    commands: clone(commands), nativeCommands: clone(nativeCommands), tools,
    inputFingerprints: Object.fromEntries(Object.entries(manifests).map(([k, v]) => [k, v.inputFingerprint])) };
  const seal = () => {
    receipt.publicReceipt = write("observed-internal-preview-receipt.public.json", publicReceipt);
    return { artifactRoot: root, privateReceipt: write("observed-internal-preview-receipt.private.json", receipt),
      publicReceipt: receipt.publicReceipt, expected: clone(expected) };
  };
  return { root, write, receipt, publicReceipt, expected, sourceChild, nativeChild, records, manifests, mobile, home, seal };
}

let checked = 0;
function rejected(name: string, mutate: (f: ReturnType<typeof fixture>) => void, after?: (request: any, f: ReturnType<typeof fixture>) => void) {
  const f = fixture();
  mutate(f);
  const request = f.seal();
  after?.(request, f);
  const result = verifyObservedMobileChain(request);
  assert.equal(result.chainIntegrityValid, false, name);
  assert.equal(result.executionAuthorityVerified, false, name);
  assert.equal(result.releaseReady, false, name);
  assert.ok(result.errors.length > 0, name);
  assert.ok(result.errors.every((x: string) => /^[A-Z0-9_]+$/.test(x)), "errors must not disclose untrusted data");
  checked++;
}

try {
  const valid = fixture();
  const result = verifyObservedMobileChain(valid.seal());
  assert.equal(result.chainIntegrityValid, true, JSON.stringify(result));
  assert.equal(result.executionAuthorityVerified, false);
  assert.equal(result.releaseReady, false);
  for (const proof of ["EXECUTION_AUTHORITY", "CONTINUOUS_JOURNAL_LIFECYCLE", "RECORDED_SANDBOX_POLICY_EQUIVALENCE", "APK_CRYPTOGRAPHIC_SIGNATURES", "FRESH_GRADLE_EXECUTION", "OTHER_GOAL_PROOFS"]) {
    assert.ok(result.missingProofs.includes(proof), proof);
  }
  assert.match(result.validationScope, /not complete producer-policy equivalence or release approval/);
  assert.equal(fs.existsSync(valid.nativeChild.generatedApk), false, "reader must not require mutable generated APK");
  checked++;
  // This standalone slice intentionally does not interpret all bwrap mount or
  // overlay policies. Even pinned, consistent receipt bytes must report that
  // separate policy proof missing; an adapter may not waive the existing gate.
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.receipt.sandbox.writableBinds.push("/synthetic/extra-host-write"); },
    (f: ReturnType<typeof fixture>) => { f.receipt.sandbox.readOnlyHomeInputs.push({ source: "/synthetic/host-home", destination: "/synthetic/home" }); },
    (f: ReturnType<typeof fixture>) => { f.receipt.sandbox.nodeModulesBuildOverlay.entryCount = 999; f.receipt.sandbox.nodeModulesBuildOverlay.outputRoots = ["../../outside"]; },
  ]) {
    const partial = fixture(); mutate(partial);
    const report = verifyObservedMobileChain(partial.seal());
    assert.equal(report.chainIntegrityValid, true, "selected byte crosslinks remain valid, not complete sandbox policy");
    assert.ok(report.missingProofs.includes("RECORDED_SANDBOX_POLICY_EQUIVALENCE"));
    assert.match(report.validationScope, /not complete producer-policy equivalence/);
    assert.equal(report.executionAuthorityVerified, false); assert.equal(report.releaseReady, false); checked++;
  }
  rejected("unanchored public", () => {}, request => { delete request.publicReceipt; });
  rejected("unanchored private", () => {}, request => { delete request.privateReceipt; });
  rejected("source missing", f => { delete f.receipt.source.final; });
  rejected("journal missing", f => { delete f.receipt.source.mutationJournal; });
  rejected("journal stderr missing", f => { delete f.receipt.source.mutationJournalStderr; });
  rejected("aliased source roles", f => { f.receipt.source.after = f.receipt.source.before; f.receipt.source.final = f.receipt.source.before; });
  rejected("aliased journal roles", f => { f.receipt.source.mutationJournalStderr = f.receipt.source.mutationJournal; });
  rejected("extra private authority", f => { f.receipt.releaseReady = true; });
  rejected("extra public authority", f => { f.publicReceipt.releaseReady = true; });
  rejected("extra private group authority", f => { f.receipt.source.executionAuthorityVerified = true; });
  rejected("publicly readable private metadata", () => {}, (_request, f) => { fs.chmodSync(f.receipt.source.before.path, 0o644); });
  rejected("publicly readable private directory", () => {}, (_request, f) => { fs.chmodSync(f.root, 0o755); });
  for (const [name, value] of [["source", ""], ["source", "mobile full suite self-test: PASS\nOBSERVED_SOURCE_GATES_CHILD_OK\n"],
    ["source", "mobile full suite: PASS (310 commands)\nOBSERVED_SOURCE_GATES_CHILD_OK\n"],
    ["source", "mobile full suite: PASS (311 commands)\nOBSERVED_SOURCE_GATES_CHILD_OK\nOBSERVED_SOURCE_GATES_CHILD_OK\n"],
    ["build", ""], ["build", "MOBILE_SOURCE_GATES_PREVERIFIED wrong\nOBSERVED_INTERNAL_PREVIEW_CHILD_OK\n"]]) {
    rejected(`rehashed ${name} markers`, f => {
      const group = name === "source" ? f.receipt.sourceGates : f.receipt.build;
      group.stdout = f.write(`${name}.stdout`, value, true);
      f.records[name].stdout = group.stdout;
      group.commandRecord = f.write(`${name}.command.json`, f.records[name]);
      const pub = name === "source" ? f.publicReceipt.sourceGates : f.publicReceipt.build;
      pub.stdout = { bytes: group.stdout.bytes, sha256: group.stdout.sha256 }; pub.commandRecordSha256 = group.commandRecord.sha256;
      if (name === "source") {
        f.nativeChild.fixedCommands.sourceGates.commandRecordSha256 = group.commandRecord.sha256;
        f.receipt.build.childResult = f.write("observed-build-child-result.private.json", f.nativeChild);
      }
    });
  }
  rejected("source after native", f => {
    f.records.source.startedAt = "2026-09-05T01:00:00.000Z"; f.records.source.endedAt = "2026-09-05T01:00:01.000Z";
    f.receipt.sourceGates.commandRecord = f.write("source.command.json", f.records.source);
    const sourceHash = f.receipt.sourceGates.commandRecord.sha256;
    f.publicReceipt.sourceGates.commandRecordSha256 = sourceHash;
    f.nativeChild.fixedCommands.sourceGates.commandRecordSha256 = sourceHash;
    f.receipt.build.childResult = f.write("observed-build-child-result.private.json", f.nativeChild);
    f.receipt.build.stdout = f.write("build.stdout", `MOBILE_SOURCE_GATES_PREVERIFIED ${sourceHash}\nOBSERVED_INTERNAL_PREVIEW_CHILD_OK\n`, true);
    f.records.build.stdout = f.receipt.build.stdout;
    f.receipt.build.commandRecord = f.write("build.command.json", f.records.build);
    f.publicReceipt.build.commandRecordSha256 = f.receipt.build.commandRecord.sha256;
    f.publicReceipt.build.stdout = { bytes: f.receipt.build.stdout.bytes, sha256: f.receipt.build.stdout.sha256 };
  });
  rejected("native descriptor missing", f => { delete f.receipt.inputs.nativeSourceManifest.final; });
  rejected("manifest fingerprint", f => { f.expected.sourceFingerprint = sha("wrong"); });
  rejected("tool digest", f => { f.expected.tools[0].sha256 = sha("wrong"); });
  rejected("suite identity", f => { f.expected.fullSuite.sha256 = sha("wrong"); });
  rejected("HOME digest", f => { f.expected.homePolicyDigest = sha("wrong"); });
  rejected("HOME namespace", f => { f.receipt.sandbox.preservedHome.value = "/another-home"; });
  rejected("APK identity", f => { f.expected.apk.sha256 = sha("another-apk"); });
  rejected("public APK mismatch", f => { f.publicReceipt.apk.versionCode = "235"; });
  rejected("public log mismatch", f => { f.publicReceipt.sourceGates.stdout.sha256 = sha("wrong"); });
  rejected("public journal mismatch", f => { f.publicReceipt.source.mutationJournalSha256 = sha("wrong"); });
  rejected("source network", f => { f.sourceChild.networkNamespace = "4:6"; f.receipt.sourceGates.childResult = f.write("observed-source-gates-result.private.json", f.sourceChild); });
  rejected("native inherited network", f => { f.nativeChild.network.ownNetNamespace = "4:5"; f.receipt.build.childResult = f.write("observed-build-child-result.private.json", f.nativeChild); });
  rejected("malformed network", f => { f.nativeChild.network.ownNetNamespace = "invalid"; f.receipt.build.childResult = f.write("observed-build-child-result.private.json", f.nativeChild); });
  rejected("self-test substitution", f => { f.sourceChild.command.push("--self-test"); f.receipt.sourceGates.childResult = f.write("observed-source-gates-result.private.json", f.sourceChild); });
  rejected("child source-root splice", f => { f.nativeChild.sourceRoot = "/synthetic/another"; f.receipt.build.childResult = f.write("observed-build-child-result.private.json", f.nativeChild); });
  rejected("child source record splice", f => { f.nativeChild.fixedCommands.sourceGates.commandRecordSha256 = sha("wrong"); f.receipt.build.childResult = f.write("observed-build-child-result.private.json", f.nativeChild); });
  rejected("generated IL2CPP mismatch", f => { f.receipt.inspections.il2cppApkEntry.generated = { ...f.nativeChild.generatedIl2cpp, sha256: sha("wrong") }; });
  for (const [name, value] of [["exitCode", 1], ["signal", "SIGTERM"], ["spawnError", { code: "EFAIL", message: "secret-value" }],
    ["argv", ["/usr/bin/node", "--self-test"]], ["environmentKeys", ["AWS_SECRET_ACCESS_KEY"]]] as const) {
    rejected(`command ${name}`, f => { f.records.build[name] = value; f.receipt.build.commandRecord = f.write("build.command.json", f.records.build); });
  }
  rejected("cross-run child", f => { const other = fixture(); f.receipt.build.childResult = f.write("observed-build-child-result.private.json", other.nativeChild); });
  rejected("descriptor traversal", f => { f.receipt.source.mutationJournal.path = `${f.root}/../outside`; });
  rejected("descriptor escape", f => { f.receipt.source.mutationJournal.path = "/etc/passwd"; });
  rejected("missing file", () => {}, (_request, f) => { fs.unlinkSync(f.receipt.source.after.path); });
  rejected("replaced bytes", () => {}, (_request, f) => { fs.writeFileSync(f.receipt.source.after.path, "replaced"); });
  rejected("leaf symlink", () => {}, (_request, f) => { const path = f.receipt.source.after.path; fs.unlinkSync(path); fs.symlinkSync(f.receipt.source.before.path, path); });
  rejected("hardlink", () => {}, (_request, f) => { fs.linkSync(f.receipt.source.before.path, join(f.root, "hardlink")); });
  rejected("ancestor symlink", f => { const old = f.receipt.source.mutationJournal; fs.mkdirSync(join(f.root, "actual")); fs.renameSync(old.path, join(f.root, "actual", "journal"));
    fs.symlinkSync(join(f.root, "actual"), join(f.root, "alias")); old.path = join(f.root, "alias", "journal"); });
  rejected("oversize JSON", () => {}, request => { request.limits = { maxJsonBytes: 100 }; });
  rejected("oversize total", () => {}, request => { request.limits = { maxTotalBytes: 100 }; });
  rejected("oversize count", () => {}, request => { request.limits = { maxFiles: 2 }; });
  rejected("nonregular directory", () => {}, (_request, f) => { const path = f.receipt.source.after.path; fs.unlinkSync(path); fs.mkdirSync(path); });
  rejected("directory FD ceiling after recursive open", f => {
    // Last dereferenced file: no later directory open can accidentally mask
    // overflow in the current recursive ancestor traversal.
    const deep = join(f.root, ...Array(260).fill("d")); fs.mkdirSync(deep, { recursive: true });
    const last = f.receipt.inspections.apksigner.stderr;
    fs.renameSync(last.path, join(deep, "last.stderr")); last.path = join(deep, "last.stderr");
    f.records.apksigner.stderr = last;
    f.receipt.inspections.apksigner.commandRecord = f.write("apksigner.command.json", f.records.apksigner);
  });
  rejected("artifact root symlink", () => {}, (_request, f) => {
    fs.renameSync(f.root, `${f.root}-real`); fs.symlinkSync(`${f.root}-real`, f.root);
  });
  rejected("FIFO never blocks", () => {}, (_request, f) => {
    const file = f.receipt.source.after.path; fs.unlinkSync(file);
    // Fixed helper creates a FIFO only in this owned scratch. The reader itself
    // has no process execution dependency and must reject before reading it.
    const made = require("node:child_process").spawnSync("/usr/bin/mkfifo", ["--mode=600", "--", file],
      { env: { PATH: "/usr/bin:/bin" }, stdio: "ignore", timeout: 1000 });
    assert.equal(made.status, 0, "synthetic FIFO creation");
  });
  const binaryModes = fixture();
  const binaryRequest = binaryModes.seal();
  fs.chmodSync(binaryModes.receipt.apk.path, 0o644); fs.chmodSync(binaryModes.nativeChild.generatedIl2cpp.path, 0o755);
  assert.equal(verifyObservedMobileChain(binaryRequest).chainIntegrityValid, true, "APK and ELF need not use private JSON mode");
  checked++;

  // Inter-file mutation after the earlier source FD was hashed. Hook only
  // built-in readSync for this one fresh fixture; the verifier has no test hook.
  const raced = fixture();
  const request = raced.seal();
  const originalRead = fs.readSync;
  let armed = true;
  fs.readSync = (...args: any[]) => {
    const count = originalRead(...args);
    if (armed && count === 0 && fs.fstatSync(args[0]).ino === fs.statSync(raced.receipt.source.mutationJournal.path).ino) {
      armed = false;
      fs.renameSync(raced.receipt.source.before.path, join(raced.root, "old-source"));
      fs.copyFileSync(join(raced.root, "old-source"), raced.receipt.source.before.path);
      fs.chmodSync(raced.receipt.source.before.path, 0o600);
    }
    return count;
  };
  try { assert.equal(verifyObservedMobileChain(request).chainIntegrityValid, false, "replacement after hash must be rejected"); }
  finally { fs.readSync = originalRead; }
  assert.equal(armed, false, "race hook must actually execute");
  checked++;
  console.log(`REMEDIATION_OBSERVED_MOBILE_CHAIN_SYNTHETIC_OK cases=${checked} executionAuthorityVerified=false releaseReady=false`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
