// Read-only APK/export stage of current remediation acceptance. No build,
// cleanup, migration, credential operation, send, or release authorization.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE = "/root/worktrees/hourkey-mobile-zibai-v3-p0";
// Build/test-only correction; the selected APK and historical export pins stay unchanged.
const MOBILE_COMMIT = "3a7e182e44bf8aeb2556a311d03ca99a35aecfd6";
const BUILD_TOOLS = "/usr/lib/android-sdk/build-tools/36.0.0";
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
export const V234 = Object.freeze({
  bytes: 165371940,
  sha256: "7d4f11b5c78d952c0f246f2f52047a8c5c896fa737044d84494808d48e7f802e",
  unsignedContentSha256: "d94528b7e630b7e2341fea1de64e9faee6007748a5fc1be439f948e312a098ce",
  signerSha256: "fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c",
  path: "/root/artifacts/hourkey-v234-notification-build-46H3ru/Hourkey-v234-mainhall-20260809-046-internal-qa-20260905T031402Z.apk",
  sourceCommit: "6f5fb40fd022a702a5e2a17e2934c6c2f12d3cde",
});

// Verbatim historical comparator; its exact body is checked by the regression.
export function apkUnsignedContentSha256(bytes: Buffer): string {
  let endOfCentralDirectory = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0,bytes.length - 65_557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { endOfCentralDirectory = offset; break; }
  }
  assert.ok(endOfCentralDirectory >= 0,"APK end-of-central-directory record is missing");
  const centralDirectory = bytes.readUInt32LE(endOfCentralDirectory + 16);
  assert.equal(bytes.subarray(centralDirectory - 16,centralDirectory).toString("ascii"),"APK Sig Block 42");
  const signingBlockSize = Number(bytes.readBigUInt64LE(centralDirectory - 24));
  assert.ok(Number.isSafeInteger(signingBlockSize) && signingBlockSize >= 24);
  const signingBlockStart = centralDirectory - signingBlockSize - 8;
  assert.ok(signingBlockStart >= 0);
  assert.equal(Number(bytes.readBigUInt64LE(signingBlockStart)),signingBlockSize);
  return createHash("sha256").update(bytes.subarray(0,signingBlockStart))
    .update(bytes.subarray(centralDirectory)).digest("hex");
}

export function assertApkInspection(outputs: {
  badging: string; signature: string; inventory: string; permissions: string; manifest: string;
}, expectedChannel: string): void {
  const packageMatch = /^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/mu.exec(outputs.badging);
  assert.ok(packageMatch);
  assert.deepEqual(packageMatch.slice(1), ["io.hourkey.app", "234", "1.0.234"]);
  for (const line of [
    "Verified using v1 scheme (JAR signing): false",
    "Verified using v2 scheme (APK Signature Scheme v2): true",
    "Verified using v3 scheme (APK Signature Scheme v3): false",
    "Verified using v3.1 scheme (APK Signature Scheme v3.1): false",
    "Verified using v4 scheme (APK Signature Scheme v4): false",
    "Verified for SourceStamp: false", "Number of signers: 1",
  ]) assert.ok(outputs.signature.split(/\r?\n/u).includes(line));
  const certificates = [...outputs.signature.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([0-9a-f]{64})$/gimu)];
  assert.equal(certificates.length, 1);
  assert.equal(certificates[0][1].toLowerCase(), V234.signerSha256);
  const abis = [...new Set(outputs.inventory.split(/\r?\n/u)
    .flatMap(entry => /^lib\/([^/]+)\//u.exec(entry)?.slice(1) ?? []))].sort();
  assert.deepEqual(abis, ["arm64-v8a"]);
  for (const name of ["POST_NOTIFICATIONS", "ACCESS_BACKGROUND_LOCATION", "FOREGROUND_SERVICE_LOCATION"])
    assert.ok(outputs.permissions.includes(`uses-permission: name='android.permission.${name}'`));
  const lines = outputs.manifest.split(/\r?\n/u);
  const channelRows = lines.flatMap((line, index) =>
    /A: android:name.*com\.google\.firebase\.messaging\.default_notification_channel_id/u.test(line) ? [index] : []);
  assert.equal(channelRows.length, 1);
  assert.ok(lines[channelRows[0] + 1]?.includes(`="${expectedChannel}"`));
}

function readStable(path: string, maxBytes: number) {
  assert.equal(realpathSync(path), path);
  const before = lstatSync(path, { bigint: true });
  assert.ok(before.isFile() && before.size <= BigInt(maxBytes));
  const bytes = readFileSync(path);
  const unchanged = () => {
    assert.equal(realpathSync(path), path);
    const after = lstatSync(path, { bigint: true });
    for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"] as const) assert.equal(after[key], before[key]);
  };
  unchanged(); return { bytes, unchanged };
}

export function readOnlyEnvironment(executable: string, inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC" };
  if (Object.hasOwn(inherited, "HOME")) env.HOME = inherited.HOME;
  if (executable === "/usr/bin/git") Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "",
  });
  return env;
}

function run(argv: string[], cwd = MOBILE): Buffer {
  const child = spawnSync(argv[0], argv.slice(1), {
    cwd, env: readOnlyEnvironment(argv[0], process.env), stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000, maxBuffer: 128 * 1024 * 1024,
  });
  // Never surface ambient environment or raw child errors/output in failures.
  assert.ok(!child.error && child.status === 0 && child.signal === null, "APK_READ_ONLY_COMMAND_FAILED");
  return child.stdout;
}

function sourceIsCurrent() {
  const git = ["/usr/bin/git", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false"];
  assert.equal(run([...git, "rev-parse", "HEAD"]).toString().trim(), MOBILE_COMMIT);
  assert.equal(run([...git, "status", "--porcelain=v1", "--untracked-files=all"]).length, 0);
}

function bindCompletedExportEvidence() {
  // Bind completed, independently reviewed execution: do not rerun export or
  // infer a fresh native build from these receipts. Literal pins predate it.
  const records = [
    ["/root/artifacts/hourkey-all-platform-export-ulPjKX/result.private.json", "095c7a2eb92ce1d340cff3fcb8d325c60499379304fb76f1f7c71e9a98ca4d02"],
    ["/root/artifacts/hourkey-all-platform-export-compare-rVBN7C/result.private.json", "9a8b5a31b493566d2fb112bdb85643e3fdba591d1098974283cfe04ed6145db6"],
    ["/root/artifacts/hourkey-all-platform-export-compare-rVBN7C/export-comparison-review.private.md", "9fab30fe0ad811525d61b4725b042da058f7322a02ef9b57d377890e71c42f67"],
    ["/root/artifacts/hourkey-v234-notification-build-46H3ru/v234-native-comparison-baseline.private.json", "10a6b5f6da130733fa0833041e8e23984c69ae4ab1bd120ac2793c867bb77dfc"],
  ];
  for (const [path, hash] of records) assert.equal(sha(readStable(path, 1024 * 1024).bytes), hash);
  return records.map(([path, sha256]) => ({ path, sha256 }));
}

export function verifyRemediationMobileApk(apkPath: string, mapPath: string, bundlePath: string) {
  sourceIsCurrent();
  const retainedEvidence = bindCompletedExportEvidence();
  const baseline = readStable(V234.path, V234.bytes);
  assert.equal(baseline.bytes.length, V234.bytes);
  assert.equal(sha(baseline.bytes), V234.sha256);
  assert.equal(apkUnsignedContentSha256(baseline.bytes), V234.unsignedContentSha256);
  const candidate = readStable(apkPath, V234.bytes);
  assert.equal(candidate.bytes.length, V234.bytes);
  assert.equal(apkUnsignedContentSha256(candidate.bytes), V234.unsignedContentSha256,
    "Unsigned/size reproduction mismatch; do not replace the selected baseline with the new output");
  const config = JSON.parse(readFileSync(join(MOBILE, "app.json"), "utf8"));
  const plugins = config.expo.plugins.filter((item: unknown) => Array.isArray(item) && item[0] === "expo-notifications");
  assert.equal(plugins.length, 1);
  const channel = plugins[0][1].defaultChannel;
  assert.ok(typeof channel === "string" && /^[a-z0-9][a-z0-9._-]{0,99}$/u.test(channel));
  assert.equal(config.expo.android.versionCode, 234);
  assertApkInspection({
    badging: run([join(BUILD_TOOLS, "aapt"), "dump", "badging", apkPath]).toString(),
    signature: run([join(BUILD_TOOLS, "apksigner"), "verify", "--verbose", "--print-certs", apkPath]).toString(),
    inventory: run(["/usr/bin/unzip", "-Z1", apkPath]).toString(),
    permissions: run([join(BUILD_TOOLS, "aapt"), "dump", "permissions", apkPath]).toString(),
    manifest: run([join(BUILD_TOOLS, "aapt"), "dump", "xmltree", apkPath, "AndroidManifest.xml"]).toString(),
  }, channel);
  const map = readStable(mapPath, 64 * 1024 * 1024);
  run(["/usr/bin/node", "scripts/assert-current-release-sourcemap.mjs", "--root", MOBILE, "--map", mapPath]);
  const parsed = JSON.parse(map.bytes.toString());
  const firstParty = parsed.sources.flatMap((name: string, index: number) =>
    /^\/(?:src\/.*\.(?:[cm]?js|tsx?)|App\.tsx|index\.ts)$/u.test(name) ? [{ name, index }] : []);
  assert.equal(firstParty.length, 410);
  assert.equal(new Set(firstParty.map((row: { name: string }) => row.name)).size, 410);
  for (const { name, index } of firstParty) {
    const sourcePath = resolve(MOBILE, `.${name}`);
    assert.ok(sourcePath.startsWith(`${MOBILE}/`));
    assert.equal(parsed.sourcesContent[index], readFileSync(sourcePath, "utf8"));
  }
  const bundle = readStable(bundlePath, 64 * 1024 * 1024);
  assert.equal(sha(run(["/usr/bin/unzip", "-p", apkPath, "assets/index.android.bundle"])), sha(bundle.bytes));
  run(["/usr/bin/node", "--no-warnings", "--experimental-strip-types",
    "scripts/test-shrine-apk-v194-runtime-parity.mts",
    "/root/artifacts/Hourkey-v194-mainhall-20260809-046-internal-qa-20260809T143905Z.apk", apkPath]);
  for (const file of [baseline, candidate, map, bundle]) file.unchanged();
  sourceIsCurrent();
  return {
    schema: "hourkey-remediation-mobile-apk-checks/v1", apkChecksPassed: true,
    apk: { path: apkPath, bytes: candidate.bytes.length, sha256: sha(candidate.bytes), unsignedContentSha256: V234.unsignedContentSha256 },
    selectedBaselineSource: V234.sourceCommit, comparedSourceCommit: MOBILE_COMMIT,
    firstPartySources: 410, retainedEvidence,
    nativeExecutionVerified: false, releaseReady: false, playStoreRelease: false,
    remaining: ["observed full-source-to-native execution and preservation", "backend/schema rollout",
      "Expo credential repair", "physical receipt/detail opening", "five independent final reviews"],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    assert.equal(args.length, 6, "usage: --apk <path> --map <path> --bundle <path>");
    assert.deepEqual([args[0], args[2], args[4]], ["--apk", "--map", "--bundle"]);
    console.log(JSON.stringify(verifyRemediationMobileApk(args[1], args[3], args[5])));
  } catch {
    console.error("REMEDIATION_MOBILE_APK_CHECKS_FAILED"); process.exitCode = 1;
  }
}
