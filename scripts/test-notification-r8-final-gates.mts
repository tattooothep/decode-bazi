import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  readlinkSync, realpathSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import {
  QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS,
  QIZHENG_ELECTIONAL_SOURCE_DIGEST,
} from "../src/lib/astro/qizheng/electional-source-manifest";
import {
  R8_ASTRONOMY_SCHEMA,
  R8_QIZHENG_SCHEMA,
  r8ProductionCapability,
} from "../src/lib/astro/notification-r8-contract";
import {
  ASTRONOMY_FACT_MODEL_VERSION,
  ASTRONOMY_FACT_TZDB_VERSION,
  buildCivilSkySnapshot,
} from "../src/lib/astro/astronomy-fact-r8";
import {
  ASTRONOMY_FACT_MODEL_DIGEST,
  ASTRONOMY_FACT_MODEL_FILES,
} from "../src/lib/astro/astronomy-fact-model-attestation";
import { runAcceleratedProviderFreeSoak } from "./lib/notification-r8-soak.mts";

const require = createRequire(import.meta.url);
const payload = require("../src/lib/notification-payload.cjs");
const preflight = require("./notification-observability-preflight.cjs");
const backendRoot = process.cwd();
const mobileRoot = process.env.HOURKEY_MOBILE_ROOT || "/root/worktrees/hourkey-mobile-zibai-v3-p0";
const mobileObservedReceipt = await import(pathToFileURL(
  join(mobileRoot,"scripts/lib/observed-internal-preview-receipt.mts"),
).href);
const evidencePath = join(backendRoot, "docs/notification-science/qizheng-r8-release-evidence.json");
const allowUnsigned = process.argv.includes("--allow-unsigned");
const skipBuilds = allowUnsigned && process.argv.includes("--skip-builds");
const HEX64 = /^[0-9a-f]{64}$/u;
const R8_EVIDENCE_FILE = "docs/notification-science/qizheng-r8-release-evidence.json";
const R8_SCHEMA_DEFINITION_DIGEST = "fb8f54d63c6e693d7cf8f35befcf322b79519f718a6517d0b41c38c01b27dff8";
const QIMEN_GOLDEN_ROOT = "/root/worktrees/qimen-notification-truth-backend";
const QIMEN_GOLDEN_COMMIT = "5428ab01bb45d045849cb5c8d5faee74c6f94845";

const BACKEND_RUNTIME_FILES = Object.freeze([
  "migrations/20260904_mobile_science_notifications_r8.rollback.sql",
  "migrations/20260904_mobile_science_notifications_r8.sql",
  "scripts/mobile-astronomy-fact-shadow-cron.mts",
  "scripts/lib/notification-r8-soak.mts",
  "scripts/notification-health.cjs",
  "scripts/notification-observability-preflight.cjs",
  "src/app/api/account/delete/route.ts",
  "src/app/api/mobile/v1/account/delete/route.ts",
  "src/app/api/mobile/v1/astronomy-facts/[occurrenceId]/route.ts",
  "src/app/api/mobile/v1/astronomy-facts/route.ts",
  "src/app/api/mobile/v1/notifications/route.ts",
  "src/app/api/mobile/v1/push/route.ts",
  "src/app/api/mobile/v1/qizheng/notification-detail/[occurrenceId]/route.ts",
  "src/lib/astro/astronomy-fact-r8.ts",
  "src/lib/astro/astronomy-fact-model-attestation.ts",
  "src/lib/astro/notification-r8-contract.ts",
  "src/lib/astro/qizheng/electional-source-manifest.ts",
  "src/lib/mobile-push-registration-readiness.cjs",
  "src/lib/mobile-science-notification-detail-r8.ts",
  "src/lib/mobile-science-shadow-r8.ts",
  "src/lib/notification-payload.cjs",
]);

const MOBILE_RUNTIME_FILES = Object.freeze([
  "App.tsx",
  "src/components/design/NotificationCenterScreen.tsx",
  "src/components/design/astronomy/AstronomyFactDetailScreen.tsx",
  "src/components/design/qizheng/QizhengNotificationDetailScreen.tsx",
  "src/greenfield/client.ts",
  "src/greenfield/endpoints.ts",
  "src/i18n/scienceNotificationsR8.ts",
  "src/native/notificationPreferencePolicy.ts",
  "src/native/push.ts",
  "src/navigation/notificationPayload.ts",
  "src/navigation/notificationRouteDispatcher.ts",
  "src/types/mobile.ts",
]);

const LEGACY_PRODUCERS = Object.freeze([
  "scripts/mobile-yam-push-cron.cjs",
  "scripts/mobile-daily-fortune-push-cron.cjs",
  "scripts/mobile-auspicious-push-cron.cjs",
  "scripts/mobile-personal-reminders-cron.cjs",
  "scripts/mobile-monthly-report-push-cron.cjs",
  "scripts/mobile-network-morning-push-cron.cjs",
  "scripts/mobile-zibai-push-cron.cjs",
  "scripts/mobile-qimen-push-cron.cjs",
  "scripts/mobile-ziwei-hourly-push-cron.mts",
]);

const NETWORK_RECOVERY_FILES = Object.freeze([
  "scripts/mobile-network-morning-push-cron.cjs",
  "scripts/test-mobile-push-retry-worker.mts",
  "scripts/test-notification-live-producers-task3.mts",
  "scripts/test-push-guard.mts",
  "src/lib/mobile-notification-delivery.cjs",
]);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: root, encoding: "utf8" }).trim();
}

function blob(root: string, commit: string, path: string): Buffer {
  return execFileSync("git", ["show", `${commit}:${path}`], {
    cwd: root,
    maxBuffer: 1024 * 1024 * 1024,
  });
}

function committedFilesDigest(root: string, commit: string, files: readonly string[]): string {
  const records = files.map((path) => `${path}\0${sha(blob(root, commit, path))}\n`).join("");
  return sha(records);
}

function committedApplicationSourceDigest(root: string, commit: string): string {
  const raw = execFileSync("/usr/bin/git",["ls-tree","-r","-z",commit],{ cwd: root });
  const entries = Buffer.from(raw).toString("utf8").split("\0").filter(Boolean).map((record) => {
    const match = /^(100644|100755) blob [0-9a-f]{40}\t(.+)$/u.exec(record);
    assert.ok(match,`unsupported application source entry: ${record}`);
    return { mode: match![1], path: match![2] };
  }).filter(({ path }) => path !== R8_EVIDENCE_FILE)
    .sort((left,right) => Buffer.compare(Buffer.from(left.path),Buffer.from(right.path)));
  return sha(entries.map(({ mode,path }) => `${mode}\0${path}\0${sha(blob(root,commit,path))}\n`).join(""));
}

function assertCurrentBackendMatchesApplication(commit: string): void {
  assert.equal(git(backendRoot,["status","--porcelain=v1","--untracked-files=all"]),"");
  const current = git(backendRoot,["rev-parse","HEAD"]);
  const changed = git(backendRoot,["diff","--name-only",commit,current]).split("\n").filter(Boolean);
  assert.deepEqual(changed,current === commit ? [] : [R8_EVIDENCE_FILE],
    "the signed evidence file is the sole allowed post-application commit change");
}

function filesTreeDigest(root: string, normalizeNext = false): string {
  assert.equal(realpathSync(root),root);
  assert.equal(lstatSync(root).isDirectory(),true);
  const buildId = normalizeNext ? readFileSync(join(root,"BUILD_ID"),"utf8").trim() : "";
  if (normalizeNext) assert.match(buildId,/^[A-Za-z0-9_-]{16,64}$/u);
  const artifactAppRoot = normalizeNext
    ? String(JSON.parse(readFileSync(join(root,"required-server-files.json"),"utf8")).appDir)
    : "";
  if (normalizeNext) assert.ok(artifactAppRoot.startsWith("/"));
  const nextSecrets = normalizeNext ? [
    [buildId,"<BUILD_ID>"],
    [artifactAppRoot,"<APP_ROOT>"],
    [realpathSync(join(root,"..")),"<APP_ROOT>"],
    ...Object.entries(JSON.parse(readFileSync(join(root,"prerender-manifest.json"),"utf8")).preview)
      .map(([key,value]) => [String(value),`<${key}>`]),
    [
      String(JSON.parse(readFileSync(join(root,"server/server-reference-manifest.json"),"utf8")).encryptionKey),
      "<SERVER_ACTION_ENCRYPTION_KEY>",
    ],
  ] as const : [];
  for (const [secret,replacement] of nextSecrets) {
    assert.ok(secret.length > 0);
    assert.ok(replacement.length > 0);
  }
  const normalizeBytes = (value: Buffer): Buffer => {
    if (!normalizeNext) return value;
    let normalized = value;
    for (const [secret,replacement] of nextSecrets) {
      const secretBytes = Buffer.from(secret);
      const replacementBytes = Buffer.from(replacement);
      const chunks: Buffer[] = [];
      let offset = 0;
      let found: number;
      while ((found = normalized.indexOf(secretBytes,offset)) >= 0) {
        chunks.push(normalized.subarray(offset,found),replacementBytes);
        offset = found + secretBytes.length;
      }
      chunks.push(normalized.subarray(offset));
      normalized = Buffer.concat(chunks);
    }
    return normalized;
  };
  const records: string[] = [];
  const releaseRoot = join(root,"..");
  const visit = (directory: string, prefix = ""): void => {
    for (const name of readdirSync(directory).sort((left,right) => Buffer.compare(Buffer.from(left),Buffer.from(right)))) {
      const path = join(directory,name);
      const relativePath = prefix ? join(prefix,name) : name;
      if (normalizeNext && (
        relativePath === "cache" || relativePath === "trace" || relativePath === "trace-build"
      )) continue;
      const normalizedPath = normalizeNext ? relativePath.replaceAll(buildId,"<BUILD_ID>") : relativePath;
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) {
        const target = readlinkSync(path);
        const match = /^\.\.\/\.\.\/node_modules\/(pg|sharp)$/u.exec(target);
        assert.ok(match,`unexpected artifact symlink: ${relativePath}`);
        const resolved = realpathSync(path);
        assert.equal(resolved,realpathSync(join(releaseRoot,"node_modules",match![1])));
        assert.equal(statSync(resolved).isDirectory(),true);
        records.push(`${normalizedPath}\0link\0${normalizeNext ? target.replaceAll(buildId,"<BUILD_ID>") : target}\n`);
      } else if (stats.isDirectory()) visit(path,relativePath);
      else {
        assert.equal(stats.isFile(),true,`artifact special file is forbidden: ${relativePath}`);
        const digest = sha(normalizeBytes(readFileSync(path)));
        records.push(normalizeNext ? `${normalizedPath}\0file\0${digest}\n` : `${normalizedPath}\0${digest}\n`);
      }
    }
  };
  visit(root);
  records.sort((left,right) => Buffer.compare(Buffer.from(left),Buffer.from(right)));
  return sha(records.join(""));
}

function mobileExportArtifactDigest(root: string, hermesc: string): string {
  assert.equal(realpathSync(root),root);
  assert.equal(lstatSync(root).isDirectory(),true);
  assert.equal(lstatSync(hermesc).isFile(),true);
  const records: string[] = [];
  let fileCount = 0;
  let bytecodeCount = 0;
  let webBundleCount = 0;
  const visit = (directory: string, prefix = ""): void => {
    for (const name of readdirSync(directory).sort((left,right) => Buffer.compare(Buffer.from(left),Buffer.from(right)))) {
      const path = join(directory,name);
      const relativePath = prefix ? join(prefix,name) : name;
      const stats = lstatSync(path);
      assert.equal(stats.isSymbolicLink(),false,`mobile export symlinks are forbidden: ${relativePath}`);
      if (stats.isDirectory()) { visit(path,relativePath); continue; }
      assert.equal(stats.isFile(),true,`mobile export special file is forbidden: ${relativePath}`);
      fileCount += 1;
      if (relativePath === "metadata.json") {
        const metadata = JSON.parse(readFileSync(path,"utf8"));
        assert.equal(metadata.version,0);
        assert.equal(metadata.bundler,"metro");
        assert.deepEqual(Object.keys(metadata.fileMetadata).sort(),["android","ios"]);
        for (const platform of ["android","ios"] as const) {
          assert.match(metadata.fileMetadata[platform].bundle,
            new RegExp(`^_expo/static/js/${platform}/index-[0-9a-f]{32}\\.hbc$`,"u"));
          assert.ok(metadata.fileMetadata[platform].assets.length > 0);
        }
        records.push(`${relativePath}\0canonical-json\0${sha(canonicalJson(metadata))}\n`);
        continue;
      }
      if (/^_expo\/static\/js\/(?:android|ios)\/index-[0-9a-f]{32}\.hbc$/u.test(relativePath)) {
        bytecodeCount += 1;
        const disassembly = execFileSync(hermesc,["-b","-dump-bytecode",path],{
          maxBuffer: 512 * 1024 * 1024,
        }).toString("utf8");
        const temporaryInput = /\/[^\0\n ]*\/expo-bundler-0\.[0-9]+-[0-9]+\/index\.js/gu;
        const occurrences = disassembly.match(temporaryInput) || [];
        assert.equal(occurrences.length,1,"Hermes output must expose exactly one ephemeral compiler input path");
        const normalized = disassembly.replace(temporaryInput,"/<EXPO_HERMES_INPUT>/index.js");
        records.push(`${relativePath}\0hermes-disassembly\0${sha(normalized)}\n`);
        continue;
      }
      if (/^_expo\/static\/js\/web\/.+\.js$/u.test(relativePath)) webBundleCount += 1;
      records.push(`${relativePath}\0file\0${sha(readFileSync(path))}\n`);
    }
  };
  visit(root);
  assert.equal(fileCount,255);
  assert.equal(bytecodeCount,2);
  assert.ok(webBundleCount >= 1);
  return sha(records.join(""));
}

function apkUnsignedContentSha256(bytes: Buffer): string {
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

function verifyPinnedInternalApk(bundle: any, configuredPath: string, exactFile: boolean): void {
  const apkPath = realpathSync(configuredPath);
  assert.equal(apkPath,configuredPath);
  assert.equal(lstatSync(apkPath).isFile(),true);
  const bytes = readFileSync(apkPath);
  const expected = bundle.buildEvidence.apk;
  assert.deepEqual(expected,{
    sha256: "c8954bda70e84ff24aa82d8d7a3ac2722c4b78da19e6e7e8c17a8647f3d3b118",
    unsignedContentSha256: "7b7c09679017b67da84be4bfb4b7539a64d1223c49978ed433f20af72fea9984",
    bytes: 165348100,
    packageName: "io.hourkey.app",
    versionCode: "233",
    versionName: "1.0.233",
    signerSha256: "fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c",
    distribution: "internal_qa",
    playProduction: false,
    storeUpload: false,
  });
  if (exactFile) {
    assert.equal(sha(bytes),expected.sha256);
    assert.equal(apkUnsignedContentSha256(bytes),expected.unsignedContentSha256);
    assert.equal(bytes.length,expected.bytes);
  }
  const badging = execFileSync("/usr/lib/android-sdk/build-tools/36.0.0/aapt",["dump","badging",apkPath],{ encoding: "utf8" });
  const packageMatch = /^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/mu.exec(badging);
  assert.ok(packageMatch);
  assert.deepEqual(packageMatch!.slice(1),[expected.packageName,expected.versionCode,expected.versionName]);
  const signer = execFileSync("/usr/lib/android-sdk/build-tools/36.0.0/apksigner",[
    "verify","--verbose","--print-certs",apkPath,
  ],{ encoding: "utf8" });
  assert.match(signer,/^Verified using v1 scheme \(JAR signing\): false$/mu);
  assert.match(signer,/^Verified using v2 scheme \(APK Signature Scheme v2\): true$/mu);
  assert.match(signer,/^Verified using v3 scheme \(APK Signature Scheme v3\): false$/mu);
  assert.match(signer,/^Verified using v3\.1 scheme \(APK Signature Scheme v3\.1\): false$/mu);
  assert.match(signer,/^Verified using v4 scheme \(APK Signature Scheme v4\): false$/mu);
  assert.match(signer,/^Verified for SourceStamp: false$/mu);
  assert.match(signer,/^Number of signers: 1$/mu);
  const signerRows = signer.match(/^Signer #1 certificate SHA-256 digest: ([0-9a-f]{64})$/gimu) || [];
  assert.equal(signerRows.length,1);
  assert.equal(signerRows[0].split(": ")[1].toLowerCase(),expected.signerSha256);
  const apkEntries = execFileSync("/usr/bin/unzip",["-Z1",apkPath],{ encoding: "utf8" });
  const packagedAbis = [...new Set(
    apkEntries.split(/\r?\n/u).flatMap((entry) => /^lib\/([^/]+)\//u.exec(entry)?.slice(1) ?? []),
  )].sort();
  assert.deepEqual(packagedAbis,["arm64-v8a"]);
}

function assertExactCleanCommit(root: string, commit: string): void {
  assert.equal(git(root,["rev-parse","HEAD"]),commit);
  assert.equal(git(root,["status","--porcelain=v1","--untracked-files=all"]),"");
}

function runFreshBackendBuild(bundle: any): void {
  assert.equal(process.version,"v22.22.1");
  assert.equal(execFileSync("/usr/bin/npm",["--version"],{ encoding: "utf8" }).trim(),"10.9.4");
  const scratch = mkdtempSync(join(tmpdir(),"hourkey-r8-backend-build-"));
  const checkout = join(scratch,"source");
  let worktreeAdded = false;
  try {
    const npmHome = join(scratch,"npm-home");
    const npmLogs = join(scratch,"npm-logs");
    const npmUserConfig = join(scratch,"npm-user.conf");
    const npmGlobalConfig = join(scratch,"npm-global.conf");
    mkdirSync(npmHome,{ mode: 0o700 });
    mkdirSync(npmLogs,{ mode: 0o700 });
    writeFileSync(npmUserConfig,"",{ flag: "wx",mode: 0o600 });
    writeFileSync(npmGlobalConfig,"",{ flag: "wx",mode: 0o600 });
    execFileSync("/usr/bin/git",["worktree","add","--detach",checkout,bundle.backend.applicationCommit],{
      cwd: backendRoot,stdio: "ignore",
    });
    worktreeAdded = true;
    assertExactCleanCommit(checkout,bundle.backend.applicationCommit);
    assert.equal(existsSync(join(checkout,"node_modules")),false);
    assert.equal(existsSync(join(checkout,".next")),false);
    const environment = {
      CI: "1", HOME: npmHome, LANG: "C.UTF-8", LC_ALL: "C.UTF-8", NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "production", PATH: "/usr/bin:/bin", TZ: "UTC",
      NPM_CONFIG_CACHE: "/root/.npm", NPM_CONFIG_GLOBALCONFIG: npmGlobalConfig,
      NPM_CONFIG_IGNORE_SCRIPTS: "true", NPM_CONFIG_INCLUDE: "dev", NPM_CONFIG_LOGS_DIR: npmLogs,
      NPM_CONFIG_SCRIPT_SHELL: "/bin/sh", NPM_CONFIG_USERCONFIG: npmUserConfig,
      AUTH_SECRET: "r8-build-only-auth-secret-00000000000000000000000000000000",
      RESEND_API_KEY: "re_r8_build_only_placeholder_not_for_delivery",
    };
    execFileSync("/usr/bin/npm",[
      "ci","--offline","--ignore-scripts","--include=dev","--no-audit","--no-fund",
      "--cache=/root/.npm",`--userconfig=${npmUserConfig}`,`--globalconfig=${npmGlobalConfig}`,
      `--logs-dir=${npmLogs}`,
    ],{
      cwd: checkout,env: environment,stdio: "ignore",
    });
    assert.equal(existsSync(join(checkout,".next")),false);
    execFileSync("/usr/bin/npm",["run","build"],{ cwd: checkout,env: environment,stdio: "ignore" });
    assert.ok(readFileSync(join(checkout,".next/BUILD_ID"),"utf8").trim().length > 8);
    assert.ok(readdirSync(join(checkout,".next/server")).length > 0);
    const digest = filesTreeDigest(join(checkout,".next"),true);
    assert.match(digest,HEX64);
    assert.equal(digest,bundle.backend.buildArtifactDigest,
      "fresh detached backend output must equal the signed deploy artifact digest");
    assertExactCleanCommit(checkout,bundle.backend.applicationCommit);
  } finally {
    if (worktreeAdded) {
      execFileSync("/usr/bin/git",["worktree","remove","--force",checkout],{ cwd: backendRoot,stdio: "ignore" });
    }
    rmSync(scratch,{ recursive: true,force: true });
  }
}

function runFreshMobileExport(bundle: any): void {
  const scratch = mkdtempSync(join(tmpdir(),"hourkey-r8-mobile-export-"));
  const checkout = join(scratch,"source");
  const output = join(scratch,"dist");
  let worktreeAdded = false;
  try {
    const npmHome = join(scratch,"npm-home");
    const npmLogs = join(scratch,"npm-logs");
    const expoTmp = join(scratch,"expo-tmp");
    const npmUserConfig = join(scratch,"npm-user.conf");
    const npmGlobalConfig = join(scratch,"npm-global.conf");
    mkdirSync(npmHome,{ mode: 0o700 });
    mkdirSync(npmLogs,{ mode: 0o700 });
    mkdirSync(expoTmp,{ mode: 0o700 });
    writeFileSync(npmUserConfig,"",{ flag: "wx",mode: 0o600 });
    writeFileSync(npmGlobalConfig,"",{ flag: "wx",mode: 0o600 });
    execFileSync("/usr/bin/git",["worktree","add","--detach",checkout,bundle.mobile.applicationCommit],{
      cwd: mobileRoot,stdio: "ignore",
    });
    worktreeAdded = true;
    assertExactCleanCommit(checkout,bundle.mobile.applicationCommit);
    assert.equal(existsSync(join(checkout,"node_modules")),false);
    assert.equal(existsSync(output),false);
    const environment = {
      CI: "1", EXPO_NO_TELEMETRY: "1", EXPO_PUBLIC_HOURKEY_API_BASE_URL: "https://hourkey.io",
      EXPO_USE_METRO_REQUIRE: "1",
      HOME: npmHome, LANG: "C.UTF-8", LC_ALL: "C.UTF-8", NODE_ENV: "production", PATH: "/usr/bin:/bin", TZ: "UTC",
      TMPDIR: expoTmp,
      NPM_CONFIG_CACHE: "/root/.npm", NPM_CONFIG_GLOBALCONFIG: npmGlobalConfig,
      NPM_CONFIG_IGNORE_SCRIPTS: "true", NPM_CONFIG_INCLUDE: "dev", NPM_CONFIG_LOGS_DIR: npmLogs,
      NPM_CONFIG_SCRIPT_SHELL: "/bin/sh", NPM_CONFIG_USERCONFIG: npmUserConfig,
    };
    execFileSync("/usr/bin/npm",[
      "ci","--offline","--ignore-scripts","--include=dev","--no-audit","--no-fund",
      "--cache=/root/.npm",`--userconfig=${npmUserConfig}`,`--globalconfig=${npmGlobalConfig}`,
      `--logs-dir=${npmLogs}`,
    ],{ cwd: checkout,env: environment,stdio: "ignore" });
    execFileSync("/usr/bin/npx",[
      "--no-install","expo","export","--platform","all","--output-dir",output,
    ],{ cwd: checkout,env: environment,stdio: "ignore" });
    assert.equal(mobileExportArtifactDigest(
      output,join(checkout,"node_modules/hermes-compiler/hermesc/linux64-bin/hermesc"),
    ),bundle.mobile.buildArtifactDigest,
    "fresh isolated Android/iOS/web export must equal the signed semantic artifact digest");
    assertExactCleanCommit(checkout,bundle.mobile.applicationCommit);
  } finally {
    if (worktreeAdded) {
      execFileSync("/usr/bin/git",["worktree","remove","--force",checkout],{ cwd: mobileRoot,stdio: "ignore" });
    }
    rmSync(scratch,{ recursive: true,force: true });
  }
}

function runFreshMobileApkBuild(bundle: any): void {
  assertExactCleanCommit(mobileRoot,bundle.mobile.applicationCommit);
  const fullSuite = blob(mobileRoot,bundle.mobile.applicationCommit,"scripts/mobile-full-suite.mjs").toString("utf8");
  assert.match(fullSuite,/CANONICAL_MOBILE_COMMAND_COUNT = 301/u);
  assert.match(fullSuite,/CANONICAL_MOBILE_COMMAND_SHA256 = "eb5fe76fe502deb5e5616d494d2f5241f678ffc43e9c59d113aa2d73eeb70169"/u);
  const requiredSigning = [
    "HOURKEY_ANDROID_RELEASE_STORE_FILE","HOURKEY_ANDROID_RELEASE_STORE_PASSWORD",
    "HOURKEY_ANDROID_RELEASE_KEY_ALIAS","HOURKEY_ANDROID_RELEASE_KEY_PASSWORD",
  ] as const;
  for (const key of requiredSigning) assert.ok(process.env[key],`${key} is required for the final direct APK build`);
  const scratch = mkdtempSync(join(tmpdir(),"hourkey-r8-mobile-build-"));
  const artifactDir = join(scratch,"observed");
  try {
    const dependencyHome = join(scratch,"npm-home");
    const npmLogs = join(scratch,"npm-logs");
    const npmUserConfig = join(scratch,"npm-user.conf");
    const npmGlobalConfig = join(scratch,"npm-global.conf");
    mkdirSync(dependencyHome,{ mode: 0o700 });
    mkdirSync(npmLogs,{ mode: 0o700 });
    writeFileSync(npmUserConfig,"",{ flag: "wx",mode: 0o600 });
    writeFileSync(npmGlobalConfig,"",{ flag: "wx",mode: 0o600 });
    const npmEnvironment: NodeJS.ProcessEnv = {
      CI: "1", HOME: dependencyHome, LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
      NPM_CONFIG_CACHE: "/root/.npm", NPM_CONFIG_GLOBALCONFIG: npmGlobalConfig,
      NPM_CONFIG_IGNORE_SCRIPTS: "true", NPM_CONFIG_INCLUDE: "dev", NPM_CONFIG_LOGS_DIR: npmLogs,
      NPM_CONFIG_SCRIPT_SHELL: "/bin/sh", NPM_CONFIG_USERCONFIG: npmUserConfig,
      PATH: "/usr/bin:/bin", TZ: "UTC",
    };
    execFileSync("/usr/bin/npm",[
      "ci","--offline","--ignore-scripts","--include=dev","--no-audit","--no-fund",
      "--cache=/root/.npm",`--userconfig=${npmUserConfig}`,`--globalconfig=${npmGlobalConfig}`,`--logs-dir=${npmLogs}`,
    ],{ cwd: mobileRoot,env: npmEnvironment,stdio: "ignore" });
    assertExactCleanCommit(mobileRoot,bundle.mobile.applicationCommit);

    assertExactCleanCommit(QIMEN_GOLDEN_ROOT,QIMEN_GOLDEN_COMMIT);
    const qimenBefore = mobileObservedReceipt.captureStableSourceManifest(QIMEN_GOLDEN_ROOT);
    assert.equal(qimenBefore.manifest.status.bytes,0);

    const parentEnvironment: NodeJS.ProcessEnv = {
      JAVA_HOME: "/opt/unity/editors/6000.3.15f1/Editor/Data/PlaybackEngines/AndroidPlayer/OpenJDK",
      LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: "/usr/bin:/bin", TZ: "UTC",
      ...Object.fromEntries(requiredSigning.map((key) => [key,process.env[key]!])),
    };
    const output = execFileSync("/usr/bin/node",[
      "--no-warnings","--experimental-strip-types",
      join(mobileRoot,"scripts/run-observed-internal-preview-build.mts"),
      "--artifact-dir",artifactDir,
    ],{
      cwd: mobileRoot,env: parentEnvironment,encoding: "utf8",maxBuffer: 64 * 1024 * 1024,
    });
    assert.match(output,/^OBSERVED_INTERNAL_PREVIEW_RECEIPT_OK$/mu);

    const publicReceipt = JSON.parse(readFileSync(join(artifactDir,"observed-internal-preview-receipt.public.json"),"utf8"));
    const privateReceipt = JSON.parse(readFileSync(join(artifactDir,"observed-internal-preview-receipt.private.json"),"utf8"));
    assert.equal(publicReceipt.schema,"hourkey-observed-internal-preview-receipt-public/v1");
    assert.equal(privateReceipt.schema,"hourkey-observed-internal-preview-receipt-private/v1");
    assert.equal(publicReceipt.source.headCommit,bundle.mobile.applicationCommit);
    assert.equal(publicReceipt.source.statusSha256,sha(Buffer.alloc(0)));
    assert.equal(publicReceipt.inputs.dependenciesSha256,bundle.buildEvidence.mobileDependencyInputManifestSha256);
    assert.equal(publicReceipt.inputs.toolchainSha256,bundle.buildEvidence.mobileToolchainInputManifestSha256);
    assert.equal(publicReceipt.inputs.nativeSourceManifestSha256,bundle.buildEvidence.mobileNativeInputManifestSha256);
    assert.equal(privateReceipt.inputs.dependencies.before.sha256,publicReceipt.inputs.dependenciesSha256);
    assert.equal(privateReceipt.inputs.dependencies.after.sha256,publicReceipt.inputs.dependenciesSha256);
    assert.equal(privateReceipt.inputs.toolchain.before.sha256,publicReceipt.inputs.toolchainSha256);
    assert.equal(privateReceipt.inputs.toolchain.after.sha256,publicReceipt.inputs.toolchainSha256);
    assert.equal(privateReceipt.inputs.nativeSourceManifest.before.sha256,publicReceipt.inputs.nativeSourceManifestSha256);
    assert.equal(privateReceipt.inputs.nativeSourceManifest.after.sha256,publicReceipt.inputs.nativeSourceManifestSha256);
    assert.equal(privateReceipt.inputs.nativeSourceManifest.final.sha256,publicReceipt.inputs.nativeSourceManifestSha256);
    assert.equal(publicReceipt.sourceGates.exitCode,0);
    assert.equal(publicReceipt.sourceGates.qimenGoldenCommit,QIMEN_GOLDEN_COMMIT);
    assert.equal(privateReceipt.sourceGates.commandRecord.sha256,publicReceipt.sourceGates.commandRecordSha256);
    assert.equal(privateReceipt.sourceGates.stdout.sha256,publicReceipt.sourceGates.stdout.sha256);
    assert.equal(privateReceipt.sourceGates.stderr.sha256,publicReceipt.sourceGates.stderr.sha256);
    assert.equal(privateReceipt.sourceGates.qimenGoldenSource.before.sha256,
      privateReceipt.sourceGates.qimenGoldenSource.after.sha256);
    assert.equal(privateReceipt.sourceGates.qimenGoldenSource.before.sha256,
      privateReceipt.sourceGates.qimenGoldenSource.final.sha256);
    assert.equal(privateReceipt.build.stdout.sha256,publicReceipt.build.stdout.sha256);
    assert.equal(publicReceipt.build.exitCode,0);
    assert.equal(privateReceipt.sandbox.policy,"hourkey-fixed-bwrap-offline-internal-preview/v2");
    assert.equal(publicReceipt.build.fixedPolicy,privateReceipt.sandbox.policy);
    assert.equal(privateReceipt.sandbox.rootReadOnly,true);
    assert.equal(privateReceipt.sandbox.networkNamespace,"unshared");
    assert.ok(privateReceipt.sandbox.nodeModulesBuildOverlay.entryCount > 0);
    assert.ok(privateReceipt.sandbox.nodeModulesBuildOverlay.outputRoots.every(
      (path: string) => /(?:^|\/)(?:build|\.gradle|\.kotlin|\.cxx)$/u.test(path),
    ));
    const il2cppMetadata = [...privateReceipt.sandbox.il2cppSourceBuildOverlay.outputFiles].sort();
    assert.ok(il2cppMetadata.length >= 1 && il2cppMetadata.length <= 2);
    assert.equal(privateReceipt.sandbox.il2cppSourceBuildOverlay.entryCount,il2cppMetadata.length);
    assert.ok(il2cppMetadata.includes("compile-data.json"));
    assert.ok(il2cppMetadata.every((leaf: string) =>
      leaf === "compile-data.json" || leaf === "Il2CppToEditorData.json"));

    const sourceGateLog = readFileSync(privateReceipt.sourceGates.stdout.path,"utf8");
    assert.equal(Buffer.byteLength(sourceGateLog),privateReceipt.sourceGates.stdout.bytes);
    assert.equal(sha(sourceGateLog),privateReceipt.sourceGates.stdout.sha256);
    assert.match(sourceGateLog,/mobile full suite: PASS \(301 commands\)/u);
    const buildLog = readFileSync(privateReceipt.build.stdout.path,"utf8");
    assert.equal(Buffer.byteLength(buildLog),privateReceipt.build.stdout.bytes);
    assert.equal(sha(buildLog),privateReceipt.build.stdout.sha256);
    assert.match(buildLog,/MOBILE_SOURCE_GATES_PREVERIFIED [0-9a-f]{64}/u);
    const actionable = buildLog.match(/(\d+) actionable tasks: (\d+) executed/u);
    assert.ok(actionable,"Gradle summary must report executed actionable tasks");
    assert.equal(actionable[2],actionable[1],"every actionable Gradle task must execute");
    assert.equal(Number(actionable[1]),bundle.buildEvidence.mobileFullSuite.gradleExecutedTasks);
    const childResult = JSON.parse(readFileSync(privateReceipt.build.childResult.path,"utf8"));
    assert.deepEqual(childResult.fixedCommands.sourceGates,{
      mode: "preverified-by-observed-parent",
      commandRecordSha256: publicReceipt.sourceGates.commandRecordSha256,
    });
    assert.ok(childResult.fixedCommands.gradle.includes("-PreactNativeArchitectures=arm64-v8a"));
    assert.deepEqual(publicReceipt.apk,{
      sha256: privateReceipt.apk.sha256, bytes: privateReceipt.apk.bytes,
      packageName: privateReceipt.apk.packageName, versionCode: privateReceipt.apk.versionCode,
      versionName: privateReceipt.apk.versionName, signerSha256: privateReceipt.apk.signerSha256,
      signerPolicy: "external-release-certificate-fingerprint-only",
    });
    verifyPinnedInternalApk(bundle,realpathSync(privateReceipt.apk.path),false);

    const qimenAfter = mobileObservedReceipt.captureStableSourceManifest(QIMEN_GOLDEN_ROOT);
    mobileObservedReceipt.assertSameSource(qimenBefore,qimenAfter);
    assertExactCleanCommit(QIMEN_GOLDEN_ROOT,QIMEN_GOLDEN_COMMIT);
    assertExactCleanCommit(mobileRoot,bundle.mobile.applicationCommit);
  } finally {
    rmSync(scratch,{ recursive: true,force: true });
  }
}

function verifyCommand(
  root: string,
  executable: string,
  args: readonly string[],
  extraEnv: Readonly<Record<string, string>> = {},
): void {
  execFileSync(executable, [...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
assert.equal(evidence.schema, 1);
assert.ok(evidence.bundle && typeof evidence.bundle === "object");
const bundleDigest = sha(canonicalJson(evidence.bundle));
assert.equal(evidence.bundleDigest, bundleDigest, "the signed bundle digest must match canonical bundle bytes");
const bundle = evidence.bundle;

assert.equal(bundle.releaseMode, "hard_off");
assert.equal(bundle.backend.baselineCommit, "6ebeb3b9be2c95156959717ca2e24d66119fc0ec");
assert.equal(bundle.mobile.baselineCommit, "5af5f20687f40e55c23c52a15a6b620c700848b6");
for (const record of [bundle.backend,bundle.mobile]) {
  assert.match(record.applicationCommit, /^[0-9a-f]{40}$/u);
  assert.match(record.applicationTree, /^[0-9a-f]{40}$/u);
  assert.match(record.lockfileSha256, HEX64);
  assert.match(record.runtimeDigest, HEX64);
  assert.match(record.buildArtifactDigest, HEX64);
}
assert.equal(git(backendRoot, ["rev-parse", `${bundle.backend.applicationCommit}^{tree}`]), bundle.backend.applicationTree);
assert.equal(git(mobileRoot, ["rev-parse", `${bundle.mobile.applicationCommit}^{tree}`]), bundle.mobile.applicationTree);
assert.equal(bundle.backend.integrationMode, "patch_equivalent_cherry_pick");
assert.deepEqual(bundle.backend.recoveryPatchCommits, [
  "51559ea5644966775890f9ad2f29fcbcf0e7e6e1",
  "7909d8e421f26786ce91c81e6808beedbb6febc3",
  "ac63fcc9805e8e8387138837c4c8bd5650686e26",
]);
const cherry = git(backendRoot, ["cherry", bundle.backend.baselineCommit, bundle.backend.applicationCommit]);
for (const commit of bundle.backend.recoveryPatchCommits) {
  assert.match(cherry, new RegExp(`^- ${commit}(?:\\s|$)`, "mu"), `${commit} must be patch-equivalent to the installed recovery baseline`);
}
for (const path of NETWORK_RECOVERY_FILES) {
  assert.equal(sha(blob(backendRoot, bundle.backend.baselineCommit, path)),
    sha(blob(backendRoot, bundle.backend.applicationCommit, path)),
    `${path} must match the installed network-morning recovery baseline byte-for-byte`);
}
execFileSync("git", ["merge-base", "--is-ancestor", bundle.mobile.baselineCommit, bundle.mobile.applicationCommit], { cwd: mobileRoot });
assert.equal(sha(blob(backendRoot, bundle.backend.applicationCommit, "package-lock.json")), bundle.backend.lockfileSha256);
assert.equal(sha(blob(mobileRoot, bundle.mobile.applicationCommit, "package-lock.json")), bundle.mobile.lockfileSha256);
assert.equal(committedFilesDigest(backendRoot, bundle.backend.applicationCommit, BACKEND_RUNTIME_FILES), bundle.backend.runtimeDigest);
assert.equal(committedFilesDigest(mobileRoot, bundle.mobile.applicationCommit, MOBILE_RUNTIME_FILES), bundle.mobile.runtimeDigest);
assert.match(bundle.backend.sourceDigest,HEX64);
assert.equal(bundle.backend.sourceDigest,
  committedApplicationSourceDigest(backendRoot,bundle.backend.applicationCommit));
assert.equal(preflight.R8_POST_APPLICATION_EVIDENCE_FILE,R8_EVIDENCE_FILE);
assertCurrentBackendMatchesApplication(bundle.backend.applicationCommit);
assert.match(bundle.science.databaseSchemaDigest,HEX64);
assert.equal(bundle.science.databaseSchemaDigest,R8_SCHEMA_DEFINITION_DIGEST);
assert.deepEqual(bundle.buildEvidence.policy,{
  verifier: "committed_direct_execution_v3",
  backend: "fresh_detached_worktree_npm_ci_offline",
  mobile: "isolated_stable_module_export_then_observed_sandboxed_native_full_suite_signed_gradle",
});
assert.deepEqual(bundle.buildEvidence.toolchain,{
  node: "v22.22.1", npm: "10.9.4", gradle: "9.3.1", androidBuildTools: "36.0.0",
});
assert.deepEqual(bundle.buildEvidence.mobileFullSuite,{
  commandCount: 301,
  commandManifestSha256: "eb5fe76fe502deb5e5616d494d2f5241f678ffc43e9c59d113aa2d73eeb70169",
  gradleExecutedTasks: 652,
});
assert.match(bundle.buildEvidence.mobileNativeInputManifestSha256,HEX64);
assert.match(bundle.buildEvidence.mobileDependencyInputManifestSha256,HEX64);
assert.match(bundle.buildEvidence.mobileToolchainInputManifestSha256,HEX64);
assert.match(bundle.buildEvidence.observedBuildReceiptSha256,HEX64);
const pinnedApkPath = "/root/artifacts/r8-final/Hourkey-v233-r8-observed-hard-off-20260904T2013.apk";
const pinnedObservedReceiptPath =
  "/root/artifacts/r8-final/Hourkey-v233-r8-observed-hard-off-20260904T2013.receipt.public.json";
verifyPinnedInternalApk(bundle,pinnedApkPath,true);
const pinnedObservedReceiptBytes = readFileSync(pinnedObservedReceiptPath);
assert.equal(sha(pinnedObservedReceiptBytes),bundle.buildEvidence.observedBuildReceiptSha256);
const pinnedObservedReceipt = JSON.parse(pinnedObservedReceiptBytes.toString("utf8"));
assert.equal(pinnedObservedReceipt.source.headCommit,bundle.mobile.applicationCommit);
assert.equal(pinnedObservedReceipt.inputs.dependenciesSha256,
  bundle.buildEvidence.mobileDependencyInputManifestSha256);
assert.equal(pinnedObservedReceipt.inputs.toolchainSha256,
  bundle.buildEvidence.mobileToolchainInputManifestSha256);
assert.equal(pinnedObservedReceipt.inputs.nativeSourceManifestSha256,
  bundle.buildEvidence.mobileNativeInputManifestSha256);
assert.equal(pinnedObservedReceipt.sourceGates.exitCode,0);
assert.equal(pinnedObservedReceipt.sourceGates.qimenGoldenCommit,QIMEN_GOLDEN_COMMIT);
assert.equal(pinnedObservedReceipt.build.exitCode,0);
assert.deepEqual(pinnedObservedReceipt.apk,{
  sha256: bundle.buildEvidence.apk.sha256,
  bytes: bundle.buildEvidence.apk.bytes,
  packageName: bundle.buildEvidence.apk.packageName,
  versionCode: bundle.buildEvidence.apk.versionCode,
  versionName: bundle.buildEvidence.apk.versionName,
  signerSha256: bundle.buildEvidence.apk.signerSha256,
  signerPolicy: "external-release-certificate-fingerprint-only",
});
assert.equal(filesTreeDigest(join(backendRoot,".next"),true),bundle.backend.buildArtifactDigest);
if (!skipBuilds) {
  runFreshBackendBuild(bundle);
  runFreshMobileExport(bundle);
  runFreshMobileApkBuild(bundle);
}

assert.deepEqual(r8ProductionCapability(), {
  astronomyFact: "pull_only",
  qizheng: "blocked_source_incomplete",
  providerSend: false,
});
assert.equal(R8_ASTRONOMY_SCHEMA, 1);
assert.equal(R8_QIZHENG_SCHEMA, 0);
assert.equal(bundle.science.sourceDigest, QIZHENG_ELECTIONAL_SOURCE_DIGEST);
assert.equal(bundle.science.qizheng.payloadSchema, 0);
assert.equal(bundle.science.qizheng.providerSendEnabled, false);
assert.equal(bundle.science.qizheng.sourceStatus, "pending_double_verification");
assert.equal(bundle.science.qizheng.verdictGeneration, false);
assert.equal(bundle.science.astronomyFact.payloadSchema, 1);
assert.equal(bundle.science.astronomyFact.providerSendEnabled, false);
assert.equal(bundle.science.astronomyFact.mode, "civil_two_hour");
assert.equal(bundle.science.astronomyFact.prediction, false);
assert.equal(bundle.providerAttempts, 0);
assert.equal(QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS.length, 10);
assert.equal(QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS.every(
  (artifact) => artifact.transcriptionStatus === "pending_double_verification"), true);

assert.deepEqual(bundle.runtime, {
  node: process.versions.node,
  icu: process.versions.icu,
  hostTzdb: process.versions.tz,
  embeddedTzdb: ASTRONOMY_FACT_TZDB_VERSION,
  astronomyEngine: "2.1.19",
  astronomyModel: ASTRONOMY_FACT_MODEL_VERSION,
});
assert.match(bundle.science.modelDigest, HEX64);
assert.deepEqual(ASTRONOMY_FACT_MODEL_FILES, [
  "package.json",
  "package-lock.json",
  "scripts/fixtures/astronomy-fact-r8-jpl-horizons-goldens.json",
  "src/lib/astro/astronomy-fact-r8.ts",
  "src/lib/tianxing/ephemeris.ts",
]);
assert.equal(bundle.science.modelDigest,
  committedFilesDigest(backendRoot, bundle.backend.applicationCommit, ASTRONOMY_FACT_MODEL_FILES));
assert.equal(bundle.science.modelDigest, ASTRONOMY_FACT_MODEL_DIGEST);
const jplGoldens = JSON.parse(blob(
  backendRoot,
  bundle.backend.applicationCommit,
  "scripts/fixtures/astronomy-fact-r8-jpl-horizons-goldens.json",
).toString("utf8"));
assert.equal(jplGoldens.source.name, "NASA/JPL Horizons");
assert.equal(jplGoldens.source.observer, "500@399");
assert.equal(jplGoldens.source.quantity, 31);
assert.equal(jplGoldens.bodies.length, 7);
assert.match(bundle.science.copyDigest, HEX64);
assert.equal(bundle.science.copyDigest,
  sha(blob(mobileRoot, bundle.mobile.applicationCommit, "src/i18n/scienceNotificationsR8.ts")));

const sql = blob(backendRoot, bundle.backend.applicationCommit,
  "migrations/20260904_mobile_science_notifications_r8.sql").toString("utf8");
const rollback = blob(backendRoot, bundle.backend.applicationCommit,
  "migrations/20260904_mobile_science_notifications_r8.rollback.sql").toString("utf8");
const shadow = blob(backendRoot, bundle.backend.applicationCommit,
  "scripts/mobile-astronomy-fact-shadow-cron.mts").toString("utf8");
assert.match(sql, /CHECK \(provider_send_enabled=false\)/u);
assert.match(sql, /CHECK \(qizheng_payload_schema=0\)/u);
assert.match(sql, new RegExp(`\\('astronomy_fact','civil_two_hour',1,'${ASTRONOMY_FACT_MODEL_DIGEST}'`, "u"));
assert.match(shadow, /s\.enabled=false AND p\.provider_send_enabled=false/u);
assert.match(shadow, /p\.source_digest=\$2/u);
assert.doesNotMatch(shadow, /firebase|expo-server-sdk|apns2|sendMulticast|sendEachForMulticast/iu,
  "provider-free shadow code must not import a delivery provider");
for (const lane of ["yam","daily","auspicious","personal","monthly","network","zibai","qimen","ziwei"]) {
  assert.doesNotMatch(rollback, new RegExp(`mobile_(?:${lane})`, "iu"),
    `R8 rollback must not mutate the ${lane} lane`);
}
for (const path of LEGACY_PRODUCERS) {
  assert.equal(sha(blob(backendRoot, bundle.backend.baselineCommit, path)), sha(blob(backendRoot, bundle.backend.applicationCommit, path)),
    `${path} must remain byte-identical to the production-recovery baseline`);
}

const snapshot = buildCivilSkySnapshot({
  instant: new Date("2026-09-04T05:00:00.000Z"),
  timezone: "Asia/Bangkok",
  observation: { frame: "geocentric", location: null },
});
assert.equal(snapshot.prediction, false);
assert.equal(snapshot.judgment, null);
assert.doesNotMatch(JSON.stringify(snapshot), /good|bad|lucky|unlucky|score|advice|ดี|ร้าย|มงคล|吉|凶/iu);

const astronomyPayload = Object.freeze({
  v: 1,
  kind: "astronomy_fact",
  notificationId: "00000000-0000-4000-8000-000000000001",
  occurrenceId: "00000000-0000-4000-8000-000000000002",
  audience: "A9c7wP4nY2kLm8QrV5sT1u",
  mode: "civil_two_hour",
  url: "/astronomy-facts/detail",
});
assert.deepEqual(payload.parseR8ScienceProviderPayload(astronomyPayload, astronomyPayload.audience), astronomyPayload);
for (const forbidden of [
  { accountId: "account" }, { profileId: "profile" }, { orgId: "org" },
  { birthDate: "1990-01-01" }, { latitude: 13.75 }, { longitude: 100.5 },
  { judgment: "good" }, { body: "private text" },
]) {
  assert.equal(payload.parseR8ScienceProviderPayload({ ...astronomyPayload, ...forbidden }, astronomyPayload.audience), null);
}
assert.equal(payload.parseR8ScienceProviderPayload({
  ...astronomyPayload, v: 0, kind: "qizheng", mode: "electional_window", url: "/qizheng/notification-detail",
}, astronomyPayload.audience), null);

const locales = ["th","en","zh","cn","vi","ja","ru","ko","es"];
assert.deepEqual(bundle.localeReviews.map((review: any) => review.locale), locales);
assert.equal(bundle.localeReviews.every((review: any) => review.status === "PASS"
  && review.scope === "hard_off_copy_contract" && typeof review.note === "string" && review.note.length > 10), true);
const mobileCopy = blob(mobileRoot, bundle.mobile.applicationCommit, "src/i18n/scienceNotificationsR8.ts").toString("utf8");
for (const locale of locales) assert.match(mobileCopy, new RegExp(`(?:^|\\n)\\s*${locale}:\\s*Object\\.freeze\\(\\{`, "u"));

const observedSoak = runAcceleratedProviderFreeSoak();
assert.deepEqual(bundle.soak, observedSoak, "the signed soak metrics must match a fresh provider-free replay");
assert.equal(bundle.soak.mode, "accelerated_provider_free_72h_simulation");
assert.equal(bundle.soak.observedWindowHours, 72);
assert.equal(bundle.soak.accounts, 10_000);
assert.equal(bundle.soak.boundariesPerDay, 120_000);
assert.equal(bundle.soak.boundaries, 360_000);
assert.ok(bundle.soak.p95Minutes <= 5);
assert.ok(bundle.soak.p99Minutes <= 10);
assert.ok(bundle.soak.maxBacklogMinutes < 10);
assert.ok(bundle.soak.poolPercent < 70 && bundle.soak.quotaPercent < 70);
assert.ok(bundle.soak.headroomMultiplier >= 2);
assert.ok(bundle.soak.legacyP95RegressionPercent < 5);
assert.equal(bundle.soak.duplicateLineages, 0);
assert.equal(bundle.soak.providerCalls, 0);
assert.equal(bundle.soak.qizhengSuppressionReasons.every((reason: string) => reason === "source_incomplete"), true);
const crossRepoEnvironment = {
  HOURKEY_MOBILE_ROOT: mobileRoot,
  HOURKEY_MOBILE_SHA: bundle.mobile.applicationCommit,
};
verifyCommand(backendRoot, "npx", ["tsc", "--noEmit"]);
verifyCommand(backendRoot, "npx", ["tsx", "scripts/test-astronomy-fact-r8.mts"]);
verifyCommand(backendRoot, "npx", ["tsx", "scripts/test-mobile-science-notifications-r8-migration.mts"]);
verifyCommand(backendRoot, "npx", ["tsx", "scripts/test-mobile-science-notification-detail-r8.mts"]);
verifyCommand(backendRoot, "npx", ["tsx", "scripts/test-mobile-science-shadow-r8.mts"]);
verifyCommand(backendRoot, "npx", ["tsx", "scripts/test-mobile-science-payload-r8.mts"], crossRepoEnvironment);
verifyCommand(backendRoot, "npx", ["tsx", "scripts/test-notification-source-replay-task3.mts"], crossRepoEnvironment);
verifyCommand(backendRoot, "npx", ["tsx", "scripts/test-mobile-push-retry-worker.mts"]);
verifyCommand(backendRoot, "npx", ["tsx", "scripts/test-notification-science-final-blockers.mts"]);
verifyCommand(backendRoot, "npx", ["tsx", "scripts/test-notification-observability-cli.mts"]);
verifyCommand(mobileRoot, "npx", ["tsc", "--noEmit"]);
verifyCommand(mobileRoot, "npx", ["tsx", "scripts/testNotificationScienceR8.mts"]);
verifyCommand(mobileRoot, process.execPath, [
  "--no-warnings", "--experimental-strip-types", "scripts/test-account-store-clients.mts",
]);
assert.deepEqual(bundle.activationBoundary, {
  astronomyProviderActivationRequiresNewSignedMigration: true,
  qizhengRequiresDoubleVerifiedSourcesAndNewSignedActivation: true,
  productionMigrationApplied: false,
  requiredProductionRolloutOrder: "migration_then_application",
});

const signatures = Array.isArray(evidence.signatures) ? evidence.signatures : [];
if (!allowUnsigned) {
  assert.equal(signatures.length, 5, "exactly five fresh review signatures are required");
  assert.equal(new Set(signatures.map((signature: any) => signature.reviewerId)).size, 5);
  assert.deepEqual(new Set(signatures.map((signature: any) => signature.dimension)), new Set([
    "science_source_integrity",
    "mobile_lifecycle_locale_privacy",
    "backend_migration_delivery",
    "scale_observability_rollback",
    "red_team_cross_science",
  ]));
  for (const signature of signatures) {
    assert.equal(signature.verdict, "PASS");
    assert.equal(signature.bundleDigest, bundleDigest);
    assert.equal(signature.backendCommit, bundle.backend.applicationCommit);
    assert.equal(signature.mobileCommit, bundle.mobile.applicationCommit);
    assert.deepEqual(signature.findings.critical, []);
    assert.deepEqual(signature.findings.important, []);
    assert.ok(Array.isArray(signature.findings.minor));
    assert.ok(Array.isArray(signature.testEvidence) && signature.testEvidence.length > 0);
    assert.match(signature.reviewedAt, /^2026-09-04T/u);
  }
}

assert.deepEqual(preflight.inspectR8HardOffEvidence(evidencePath, { requireSignatures: !allowUnsigned }), {
  ok: true,
  bundleDigestValid: true,
  hardOff: true,
  signaturesValid: true,
});

console.log(JSON.stringify({
  status: "R8_FINAL_GATES_OK",
  releaseMode: "hard_off",
  bundleDigest,
  signatures: signatures.length,
  boundaries: bundle.soak.boundaries,
  providerCalls: 0,
}));
