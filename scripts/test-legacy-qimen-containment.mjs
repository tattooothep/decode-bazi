import assert from "node:assert/strict";
import { chownSync, chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const tool = join(root, "scripts/ops/contain-legacy-qimen-push.mjs");
const runbook = join(root, "docs/runbooks/legacy-qimen-push-containment.md");
const temp = mkdtempSync(join(tmpdir(), "legacy-qimen-containment-"));
const outside = mkdtempSync(join(tmpdir(), "legacy-qimen-containment-outside-"));
let checks = 0;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function write(relative, value) {
  const target = join(temp, relative);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, value, "utf8");
  return target;
}

function invoke(...args) {
  return spawnSync(process.execPath, [tool, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

async function invokeWithExternalPostBackupPause(args, target) {
  const ready = join(temp, "race-ready");
  const release = join(temp, "race-release");
  const manifest = join(temp, "concurrent-backups", "manifest.json");
  const wrapper = join(temp, "external-race-pause.cjs");
  writeFileSync(wrapper, [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const { syncBuiltinESMExports } = require('node:module');",
    "const originalRename = fs.renameSync;",
    "let paused = false;",
    "fs.renameSync = function legacyContainmentRacePause(from, to) {",
    "  originalRename(from, to);",
    "  if (!paused && path.resolve(to) === path.resolve(process.env.CONTAINMENT_RACE_MANIFEST)) {",
    "    paused = true;",
    "    fs.writeFileSync(process.env.CONTAINMENT_RACE_READY, 'ready', { flag: 'wx' });",
    "    const wait = new Int32Array(new SharedArrayBuffer(4));",
    "    const deadline = Date.now() + 5000;",
    "    while (!fs.existsSync(process.env.CONTAINMENT_RACE_RELEASE)) {",
    "      if (Date.now() > deadline) throw new Error('race_pause_timeout');",
    "      Atomics.wait(wait, 0, 0, 10);",
    "    }",
    "  }",
    "};",
    "syncBuiltinESMExports();",
    "",
  ].join("\n"), "utf8");

  const child = spawn(process.execPath, ["--require", wrapper, tool, ...args], {
    cwd: root,
    env: {
      ...process.env,
      NO_COLOR: "1",
      CONTAINMENT_RACE_MANIFEST: manifest,
      CONTAINMENT_RACE_READY: ready,
      CONTAINMENT_RACE_RELEASE: release,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const completion = new Promise((resolveChild, rejectChild) => {
    child.once("error", rejectChild);
    child.once("close", (status) => resolveChild({ status, stdout, stderr }));
  });

  let paused = false;
  try {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      if (existsSync(ready)) {
        paused = true;
        break;
      }
      await delay(10);
    }
    if (!paused) throw new Error("external race pause was not reached");
    writeFileSync(target, concurrentMutation, "utf8");
  } finally {
    if (!existsSync(release)) writeFileSync(release, "release", { flag: "wx" });
  }
  return completion;
}

function invokeWithExternalTargetWriteFailure(args, target) {
  const wrapper = join(temp, "external-target-write-failure.cjs");
  writeFileSync(wrapper, [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const { syncBuiltinESMExports } = require('node:module');",
    "const originalRename = fs.renameSync;",
    "let failed = false;",
    "fs.renameSync = function legacyContainmentTargetFailure(from, to) {",
    "  if (!failed && path.resolve(to) === path.resolve(process.env.CONTAINMENT_FAIL_TARGET)) {",
    "    failed = true;",
    "    throw new Error('external_target_write_failure');",
    "  }",
    "  return originalRename(from, to);",
    "};",
    "syncBuiltinESMExports();",
    "",
  ].join("\n"), "utf8");
  return spawnSync(process.execPath, ["--require", wrapper, tool, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      CONTAINMENT_FAIL_TARGET: target,
    },
  });
}

function invokeWithExternalPostRenameMetadataMutation(args, target) {
  const wrapper = join(temp, "external-post-rename-metadata-mutation.cjs");
  writeFileSync(wrapper, [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const { syncBuiltinESMExports } = require('node:module');",
    "const originalRename = fs.renameSync;",
    "let mutated = false;",
    "fs.renameSync = function legacyContainmentMetadataMutation(from, to) {",
    "  originalRename(from, to);",
    "  if (!mutated && path.resolve(to) === path.resolve(process.env.CONTAINMENT_METADATA_TARGET)) {",
    "    mutated = true;",
    "    fs.chmodSync(to, 0o777);",
    "  }",
    "};",
    "syncBuiltinESMExports();",
    "",
  ].join("\n"), "utf8");
  return spawnSync(process.execPath, ["--require", wrapper, tool, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      CONTAINMENT_METADATA_TARGET: target,
    },
  });
}

function check(condition, message) {
  assert.equal(condition, true, message);
  checks += 1;
}

const routeConfig = [
  "location = /push/test { return 404; }",
  "location = /push/unsubscribe { return 404; }",
  "location / { proxy_pass http://127.0.0.1:4090; }",
  "",
].join("\n");
const unsafeRouteConfig = [
  "location / { proxy_pass http://127.0.0.1:4090; }",
  "",
].join("\n");
const commentedRouteConfig = [
  "location = /push/test { # return 404",
  "  proxy_pass http://127.0.0.1:4090;",
  "}",
  "location = /push/unsubscribe { # deny all",
  "  proxy_pass http://127.0.0.1:4090;",
  "}",
  "",
].join("\n");
const conditionalRouteConfig = [
  "location = /push/test {",
  "  if ($arg_probe) { return 404; }",
  "}",
  "location = /push/unsubscribe { return 404; }",
  "",
].join("\n");
const unsafeRoutes = "app.post('/push/test', sendTest);\napp.post('/push/unsubscribe', unsubscribe);\n";
const safeRoutes = "// Legacy browser-push endpoints removed; Qimen calculation routes remain available.\n";
const unsafeCron = "*/5 * * * * node scripts/legacy-qimen-web-push.js\n";
const safeCron = "# legacy qimen web push cron disabled\n";
const safeVapid = [
  "const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;",
  "const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;",
  "const VAPID_SUBJECT = process.env.VAPID_SUBJECT;",
  "webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);",
  "",
].join("\n");
const unsafeVapid = "const VAPID_" + "PRIVATE_KEY = 'opaque_test_material';\n";
const exposedVapidMarker = "opaque_exposed_rollback_material";
const exposedVapidOriginal = [
  "const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;",
  `const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '${exposedVapidMarker}';`,
  "const VAPID_SUBJECT = process.env.VAPID_SUBJECT;",
  "webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);",
  "",
].join("\n");
const activeCronWithTrailingComment = "*/5 * * * * node scripts/legacy-qimen-web-push.js # disabled\n";
const vapidFallbackCases = [
  { marker: "opaque_private_fallback", source: "const a = process.env.VAPID_PRIVATE_KEY || 'opaque_private_fallback';\n" },
  { marker: "opaque_private_bracket", source: 'const b = process.env["VAPID_PRIVATE_KEY"] ?? "opaque_private_bracket";\n' },
  { marker: "opaque_public_fallback", source: "const c = process.env.VAPID_PUBLIC_KEY || `opaque_public_fallback`;\n" },
  { marker: "opaque_public_bracket", source: 'const d = process.env["VAPID_PUBLIC_KEY"] ?? "opaque_public_bracket";\n' },
  { marker: "opaque_private_optional", source: "const e = process.env?.VAPID_PRIVATE_KEY ?? 'opaque_private_optional';\n" },
  { marker: "opaque_private_optional_bracket", source: 'const f = process.env?.["VAPID_PRIVATE_KEY"] || "opaque_private_optional_bracket";\n' },
  { marker: "opaque_public_parenthesized", source: 'const g = (( process . env ? . [ "VAPID_PUBLIC_KEY" ] )) ?? "opaque_public_parenthesized";\n' },
  { marker: "opaque_embedded_vapid", source: "const config = { vapid: 'opaque_embedded_vapid' };\n" },
  { marker: "opaque_bracket_env", source: 'const VAPID_PRIVATE_KEY = process?.["env"].VAPID_PRIVATE_KEY;\n' },
  { marker: "opaque_indirect_literal", source: 'const raw = "opaque_indirect_literal";\nconst VAPID_PRIVATE_KEY = raw;\n' },
];
const concurrentMutation = "// concurrent target changed after backup\n";
const approvals = "security-reviewer APPROVE\nbackend-reviewer APPROVE\nmobile-reviewer APPROVE\n";

try {
  write("nginx/qimen.conf", routeConfig);
  write("src/push-routes.js", unsafeRoutes);
  write("cron/qimen.cron", unsafeCron);
  write("config/runtime.env", "VAPID_PUBLIC_KEY=managed\nVAPID_PRIVATE_KEY=managed\nVAPID_SUBJECT=managed\n");
  write("approvals.txt", approvals);

  const inventory = {
    version: 1,
    root: temp,
    routeFiles: ["nginx/qimen.conf"],
    sourceFiles: ["src/push-routes.js"],
    cronFiles: ["cron/qimen.cron"],
    environmentFiles: ["config/runtime.env"],
    requiredEnvironmentKeys: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    patches: [
      {
        path: "src/push-routes.js",
        expectedSha256: sha256(unsafeRoutes),
        replacements: [{ find: unsafeRoutes, replace: safeRoutes }],
      },
      {
        path: "cron/qimen.cron",
        expectedSha256: sha256(unsafeCron),
        replacements: [{ find: unsafeCron, replace: safeCron }],
      },
    ],
  };
  write("legacy-qimen-inventory.json", `${JSON.stringify(inventory, null, 2)}\n`);
  const inventoryPath = join(temp, "legacy-qimen-inventory.json");
  const backupDir = join(temp, "backups");

  const audit = invoke("--root", temp, "--inventory", inventoryPath);
  check(audit.status !== 0, "default audit fails closed while a legacy route and cron remain enabled");
  check(!`${audit.stdout}${audit.stderr}`.includes("opaque_test_material"), "audit never prints potential key material");
  check(readFileSync(join(temp, "src/push-routes.js"), "utf8") === unsafeRoutes, "default audit is read-only");

  write("src/push-routes.js", safeRoutes);
  write("cron/qimen.cron", safeCron);
  write("src/vapid.js", unsafeVapid);
  inventory.sourceFiles.push("src/vapid.js");
  write("legacy-qimen-inventory.json", `${JSON.stringify(inventory, null, 2)}\n`);
  const keyAudit = invoke("--root", temp, "--inventory", inventoryPath);
  check(keyAudit.status !== 0, "audit rejects hard-coded VAPID private material");
  check(!`${keyAudit.stdout}${keyAudit.stderr}`.includes("opaque_test_material"), "hard-coded-key failure is redacted");

  write("src/vapid.js", safeVapid);
  const safeAudit = invoke("--root", temp, "--inventory", inventoryPath);
  check(safeAudit.status === 0, "audit accepts removed routes, disabled cron, and environment-only VAPID setup");

  write("nginx/qimen.conf", commentedRouteConfig);
  const commentedDenialAudit = invoke("--root", temp, "--inventory", inventoryPath);
  check(commentedDenialAudit.status !== 0, "commented proxy denial directives never satisfy endpoint containment");
  write("nginx/qimen.conf", routeConfig);

  write("nginx/qimen.conf", conditionalRouteConfig);
  const conditionalDenialAudit = invoke("--root", temp, "--inventory", inventoryPath);
  check(conditionalDenialAudit.status !== 0, "conditional proxy denial directives never satisfy canonical endpoint containment");
  write("nginx/qimen.conf", routeConfig);

  const outsideRoute = join(outside, "push-routes.js");
  const outsideOriginal = "// outside root must remain unchanged\n";
  writeFileSync(outsideRoute, outsideOriginal, "utf8");
  symlinkSync(outside, join(temp, "src", "linked-source"), "dir");
  const savedSourceFiles = inventory.sourceFiles;
  const savedPatches = inventory.patches;
  inventory.sourceFiles = ["src/linked-source/push-routes.js"];
  inventory.patches = [{
    path: "src/linked-source/push-routes.js",
    expectedSha256: sha256(outsideOriginal),
    replacements: [{ find: outsideOriginal, replace: "// changed through symlink\n" }],
  }];
  write("legacy-qimen-inventory.json", `${JSON.stringify(inventory, null, 2)}\n`);
  const symlinkAudit = invoke("--root", temp, "--inventory", inventoryPath);
  check(symlinkAudit.status !== 0, "audit rejects an intermediate source-directory symlink that escapes root");
  const symlinkApply = invoke(
    "--apply", "--confirm=DISABLE_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--approvals", join(temp, "approvals.txt"), "--backup-dir", join(temp, "symlink-backups"),
  );
  check(symlinkApply.status !== 0, "apply rejects an intermediate source-directory symlink that escapes root");
  check(readFileSync(outsideRoute, "utf8") === outsideOriginal, "rejected symlink target outside root remains unchanged");
  unlinkSync(join(temp, "src", "linked-source"));
  inventory.sourceFiles = savedSourceFiles;
  inventory.patches = savedPatches;
  write("legacy-qimen-inventory.json", `${JSON.stringify(inventory, null, 2)}\n`);

  write("cron/qimen.cron", activeCronWithTrailingComment);
  const trailingCommentAudit = invoke("--root", temp, "--inventory", inventoryPath);
  check(trailingCommentAudit.status !== 0, "an active legacy cron remains enabled despite a trailing disabled comment");
  write("cron/qimen.cron", safeCron);

  inventory.sourceFiles.push("src/vapid-fallbacks.js");
  write("legacy-qimen-inventory.json", `${JSON.stringify(inventory, null, 2)}\n`);
  for (const fallback of vapidFallbackCases) {
    write("src/vapid-fallbacks.js", fallback.source);
    const fallbackAudit = invoke("--root", temp, "--inventory", inventoryPath);
    check(fallbackAudit.status !== 0, "audit rejects each literal or fallback VAPID pattern");
    check(!`${fallbackAudit.stdout}${fallbackAudit.stderr}`.includes(fallback.marker), "fallback failure is redacted");
  }
  write("src/vapid-fallbacks.js", safeVapid);
  const fallbackSafeAudit = invoke("--root", temp, "--inventory", inventoryPath);
  check(fallbackSafeAudit.status === 0, "audit accepts direct environment-only VAPID values without literal fallbacks");

  write("src/push-routes.js", unsafeRoutes);
  write("cron/qimen.cron", unsafeCron);
  write("src/vapid.js", exposedVapidOriginal);
  write("nginx/qimen.conf", unsafeRouteConfig);
  inventory.sourceFiles = ["src/push-routes.js", "src/vapid.js"];
  const vapidPatch = {
    path: "src/vapid.js",
    expectedSha256: sha256(exposedVapidOriginal),
    replacements: [{ find: exposedVapidOriginal, replace: safeVapid }],
  };
  const nginxPatch = {
    path: "nginx/qimen.conf",
    expectedSha256: sha256(unsafeRouteConfig),
    replacements: [{ find: unsafeRouteConfig, replace: routeConfig }],
  };
  inventory.patches = [vapidPatch, nginxPatch, ...inventory.patches];
  write("legacy-qimen-inventory.json", `${JSON.stringify(inventory, null, 2)}\n`);
  const piiPath = join(temp, "reviewer@example.test");
  mkdirSync(piiPath);
  const piiFailure = invoke(
    "--apply", "--confirm=DISABLE_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--approvals", piiPath, "--backup-dir", join(temp, "pii-backups"),
  );
  check(piiFailure.status !== 0, "an invalid approvals target is rejected");
  check(!`${piiFailure.stdout}${piiFailure.stderr}`.includes("reviewer@example.test"), "failures never echo a PII-bearing filesystem path");

  const occupiedBackupDir = join(temp, "occupied-backups");
  mkdirSync(occupiedBackupDir);
  write("occupied-backups/sentinel", "preserve");
  const occupiedBackup = invoke(
    "--apply", "--confirm=DISABLE_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--approvals", join(temp, "approvals.txt"), "--backup-dir", occupiedBackupDir,
  );
  check(occupiedBackup.status !== 0, "apply rejects every pre-existing backup directory");
  check(readFileSync(join(occupiedBackupDir, "sentinel"), "utf8") === "preserve", "refused apply never clobbers a backup sentinel");

  const deniedApply = invoke("--apply", "--root", temp, "--inventory", inventoryPath, "--backup-dir", backupDir);
  check(deniedApply.status !== 0, "apply requires an explicit confirmation and approvals");
  check(readFileSync(join(temp, "cron/qimen.cron"), "utf8") === unsafeCron, "refused apply changes nothing");

  const concurrentBackupDir = join(temp, "concurrent-backups");
  const concurrentApply = await invokeWithExternalPostBackupPause([
    "--apply", "--confirm=DISABLE_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--approvals", join(temp, "approvals.txt"), "--backup-dir", concurrentBackupDir,
  ], join(temp, "src/push-routes.js"));
  check(concurrentApply.status !== 0, "post-backup target mutation aborts apply before any replacement");
  check(readFileSync(join(temp, "src/push-routes.js"), "utf8") === concurrentMutation, "concurrent target bytes remain untouched by refused apply");
  check(readFileSync(join(temp, "cron/qimen.cron"), "utf8") === unsafeCron, "no later target is written after concurrent mutation");
  check(readFileSync(join(concurrentBackupDir, "files", sha256("src/push-routes.js")), "utf8") === unsafeRoutes, "backup preserves exact approved-before bytes");
  write("src/push-routes.js", unsafeRoutes);

  const metadataTarget = join(temp, "src/push-routes.js");
  const vapidMetadataTarget = join(temp, "src/vapid.js");
  const originalMetadata = lstatSync(metadataTarget);
  const originalVapidMetadata = lstatSync(vapidMetadataTarget);
  chmodSync(metadataTarget, 0o640);
  chmodSync(vapidMetadataTarget, 0o600);
  chownSync(metadataTarget, originalMetadata.uid, originalMetadata.gid);
  chownSync(vapidMetadataTarget, originalVapidMetadata.uid, originalVapidMetadata.gid);
  const expectedMetadata = {
    mode: lstatSync(metadataTarget).mode & 0o7777,
    uid: lstatSync(metadataTarget).uid,
    gid: lstatSync(metadataTarget).gid,
  };
  const expectedVapidMetadata = {
    mode: lstatSync(vapidMetadataTarget).mode & 0o7777,
    uid: lstatSync(vapidMetadataTarget).uid,
    gid: lstatSync(vapidMetadataTarget).gid,
  };

  const metadataRecoveryBackupDir = join(temp, "metadata-recovery-backups");
  const metadataRecoveryApply = invokeWithExternalPostRenameMetadataMutation([
    "--apply", "--confirm=DISABLE_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--approvals", join(temp, "approvals.txt"),
    "--backup-dir", metadataRecoveryBackupDir,
  ], vapidMetadataTarget);
  check(metadataRecoveryApply.status === 0, "post-rename VAPID metadata failure is safely repaired without restoring exposed bytes");
  check(readFileSync(vapidMetadataTarget, "utf8") === safeVapid, "inner atomic recovery retains environment-only VAPID bytes");
  check(!readFileSync(vapidMetadataTarget, "utf8").includes(exposedVapidMarker), "inner atomic recovery never reintroduces exposed VAPID material");
  const recoveredVapidMetadata = lstatSync(vapidMetadataTarget);
  check((recoveredVapidMetadata.mode & 0o7777) === expectedVapidMetadata.mode && recoveredVapidMetadata.uid === expectedVapidMetadata.uid && recoveredVapidMetadata.gid === expectedVapidMetadata.gid, "inner atomic recovery restores reviewed VAPID mode and ownership");
  write("src/vapid.js", exposedVapidOriginal);
  write("nginx/qimen.conf", unsafeRouteConfig);
  write("src/push-routes.js", unsafeRoutes);
  write("cron/qimen.cron", unsafeCron);

  const selectiveApplyBackupDir = join(temp, "selective-apply-backups");
  const selectiveApplyFailure = invokeWithExternalTargetWriteFailure([
    "--apply", "--confirm=DISABLE_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--approvals", join(temp, "approvals.txt"),
    "--backup-dir", selectiveApplyBackupDir,
  ], join(temp, "cron/qimen.cron"));
  check(selectiveApplyFailure.status !== 0, "a later apply target write failure aborts after the VAPID replacement");
  check(`${selectiveApplyFailure.stdout}${selectiveApplyFailure.stderr}`.includes("apply_failed_safe_selective"), "partial apply reports a fixed safe-selective result code");
  check(!`${selectiveApplyFailure.stdout}${selectiveApplyFailure.stderr}`.includes(exposedVapidMarker), "partial apply failure output never exposes VAPID material");
  check(readFileSync(join(temp, "src/vapid.js"), "utf8") === safeVapid, "apply compensation never reintroduces an exposed VAPID original");
  const selectiveVapidMetadata = lstatSync(vapidMetadataTarget);
  check((selectiveVapidMetadata.mode & 0o7777) === expectedVapidMetadata.mode && selectiveVapidMetadata.uid === expectedVapidMetadata.uid && selectiveVapidMetadata.gid === expectedVapidMetadata.gid, "safe-selective apply failure retains VAPID target mode and ownership");
  check(readFileSync(join(temp, "src/push-routes.js"), "utf8") === unsafeRoutes, "apply compensation restores a written non-sensitive route source to original bytes");
  check(readFileSync(join(temp, "nginx/qimen.conf"), "utf8") === unsafeRouteConfig, "apply compensation restores the written non-sensitive proxy route to original bytes");
  check(readFileSync(join(temp, "cron/qimen.cron"), "utf8") === unsafeCron, "failed later apply target remains at original bytes");
  const selectiveApplyMetadata = lstatSync(metadataTarget);
  check((selectiveApplyMetadata.mode & 0o7777) === expectedMetadata.mode && selectiveApplyMetadata.uid === expectedMetadata.uid && selectiveApplyMetadata.gid === expectedMetadata.gid, "apply compensation restores non-sensitive target mode and ownership");
  const selectiveApplyManifestText = readFileSync(join(selectiveApplyBackupDir, "manifest.json"), "utf8");
  check(!selectiveApplyManifestText.includes(exposedVapidMarker), "recoverable partial-apply manifest contains no VAPID material");
  const selectiveApplyManifest = JSON.parse(selectiveApplyManifestText);
  check(selectiveApplyManifest.files.find((file) => file.path === "src/vapid.js")?.rollbackPolicy === "retain_applied", "partial-apply manifest truthfully records retained VAPID state");

  write("nginx/qimen.conf", "# arbitrary partial-state drift\n");
  const driftedRecovery = invoke(
    "--rollback", "--confirm=ROLLBACK_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--backup-dir", selectiveApplyBackupDir,
  );
  check(driftedRecovery.status !== 0, "partial-apply recovery rejects arbitrary target drift");
  check(readFileSync(vapidMetadataTarget, "utf8") === safeVapid, "rejected arbitrary drift never changes retained VAPID bytes");
  write("nginx/qimen.conf", unsafeRouteConfig);

  write("src/vapid.js", exposedVapidOriginal);
  const credentialDriftRecovery = invoke(
    "--rollback", "--confirm=ROLLBACK_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--backup-dir", selectiveApplyBackupDir,
  );
  check(credentialDriftRecovery.status !== 0, "partial-apply recovery rejects credential-bearing target drift");
  check(!`${credentialDriftRecovery.stdout}${credentialDriftRecovery.stderr}`.includes(exposedVapidMarker), "credential-drift recovery failure remains redacted");
  write("src/vapid.js", safeVapid);

  const nginxMetadata = lstatSync(join(temp, "nginx/qimen.conf"));
  unlinkSync(join(temp, "nginx/qimen.conf"));
  symlinkSync(outsideRoute, join(temp, "nginx/qimen.conf"), "file");
  const symlinkedRecovery = invoke(
    "--rollback", "--confirm=ROLLBACK_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--backup-dir", selectiveApplyBackupDir,
  );
  check(symlinkedRecovery.status !== 0, "partial-apply recovery rejects a symlinked manifest target");
  check(readFileSync(outsideRoute, "utf8") === outsideOriginal, "rejected partial-recovery symlink leaves its external target unchanged");
  unlinkSync(join(temp, "nginx/qimen.conf"));
  write("nginx/qimen.conf", unsafeRouteConfig);
  chmodSync(join(temp, "nginx/qimen.conf"), nginxMetadata.mode & 0o7777);
  chownSync(join(temp, "nginx/qimen.conf"), nginxMetadata.uid, nginxMetadata.gid);

  const selectiveRecovery = invoke(
    "--rollback", "--confirm=ROLLBACK_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--backup-dir", selectiveApplyBackupDir,
  );
  check(selectiveRecovery.status === 0, "safe-selective partial apply remains recoverable through the guarded rollback command");
  check(selectiveRecovery.stdout.includes("LEGACY_QIMEN_CONTAINMENT_ROLLBACK_SAFE_SELECTIVE_OK"), "partial-apply recovery truthfully reports retained VAPID state");
  check(readFileSync(join(temp, "src/vapid.js"), "utf8") === safeVapid && readFileSync(join(temp, "nginx/qimen.conf"), "utf8") === unsafeRouteConfig && readFileSync(join(temp, "src/push-routes.js"), "utf8") === unsafeRoutes && readFileSync(join(temp, "cron/qimen.cron"), "utf8") === unsafeCron, "partial-apply recovery accepts only the manifest-defined safe-selective state, including an original proxy route");
  write("src/vapid.js", exposedVapidOriginal);

  const apply = invoke(
    "--apply", "--confirm=DISABLE_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--approvals", join(temp, "approvals.txt"), "--backup-dir", backupDir,
  );
  check(apply.status === 0, "approved apply atomically disables the reviewed legacy source and cron entries");
  check(readFileSync(join(temp, "src/push-routes.js"), "utf8") === safeRoutes, "apply removes legacy route definitions");
  check(readFileSync(join(temp, "cron/qimen.cron"), "utf8") === safeCron, "apply disables the legacy cron");
  check(existsSync(join(backupDir, "manifest.json")), "apply records a rollback manifest with no secret values");
  const appliedMetadata = lstatSync(metadataTarget);
  check((appliedMetadata.mode & 0o7777) === expectedMetadata.mode && appliedMetadata.uid === expectedMetadata.uid && appliedMetadata.gid === expectedMetadata.gid, "apply preserves reviewed target mode and ownership");
  const backupManifest = JSON.parse(readFileSync(join(backupDir, "manifest.json"), "utf8"));
  const routeManifest = backupManifest.files.find((file) => file.path === "src/push-routes.js");
  check(routeManifest && routeManifest.originalMetadata.mode === expectedMetadata.mode && routeManifest.originalMetadata.uid === expectedMetadata.uid && routeManifest.originalMetadata.gid === expectedMetadata.gid, "backup manifest records reviewed target mode and ownership");
  const vapidManifest = backupManifest.files.find((file) => file.path === "src/vapid.js");
  check(vapidManifest?.rollbackPolicy === "retain_applied", "manifest machine-marks an exposed VAPID original as non-restorable");
  check(readFileSync(join(backupDir, "files", vapidManifest.backupName), "utf8") === exposedVapidOriginal, "VAPID rollback policy covers the actual checksum-verified exposed original backup");
  check(!readFileSync(join(backupDir, "manifest.json"), "utf8").includes(exposedVapidMarker), "rollback manifest never contains exposed VAPID material");

  const rollbackFailure = invokeWithExternalTargetWriteFailure([
    "--rollback", "--confirm=ROLLBACK_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--backup-dir", backupDir,
  ], join(temp, "cron/qimen.cron"));
  check(rollbackFailure.status !== 0, "a later rollback target write failure aborts the multi-file rollback");
  check(`${rollbackFailure.stdout}${rollbackFailure.stderr}`.includes("rollback_failed_compensated"), "rollback reports a fixed compensated-failure result code");
  check(!`${rollbackFailure.stdout}${rollbackFailure.stderr}`.includes(exposedVapidMarker), "failed rollback output never exposes VAPID material");
  check(readFileSync(join(temp, "src/push-routes.js"), "utf8") === safeRoutes, "compensation restores an already-rolled-back route to exact contained bytes");
  check(readFileSync(join(temp, "cron/qimen.cron"), "utf8") === safeCron, "the failed later cron target remains in its contained state");
  check(readFileSync(join(temp, "src/vapid.js"), "utf8") === safeVapid, "failed rollback leaves VAPID source environment-only");
  const compensatedMetadata = lstatSync(metadataTarget);
  check((compensatedMetadata.mode & 0o7777) === expectedMetadata.mode && compensatedMetadata.uid === expectedMetadata.uid && compensatedMetadata.gid === expectedMetadata.gid, "compensation restores contained target mode and ownership");
  check(JSON.stringify(JSON.parse(readFileSync(join(backupDir, "manifest.json"), "utf8"))) === JSON.stringify(backupManifest), "failed rollback leaves the manifest intact and recoverable");

  const versionOneManifest = {
    ...backupManifest,
    version: 1,
    files: backupManifest.files.map(({ rollbackPolicy: _rollbackPolicy, ...file }) => file),
  };
  writeFileSync(join(backupDir, "manifest.json"), `${JSON.stringify(versionOneManifest)}\n`, "utf8");

  const rollback = invoke(
    "--rollback", "--confirm=ROLLBACK_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--backup-dir", backupDir,
  );
  check(rollback.status === 0, "explicit rollback restores only checksum-verified backups");
  check(readFileSync(join(temp, "src/push-routes.js"), "utf8") === unsafeRoutes, "rollback restores the exact prior route source");
  check(readFileSync(join(temp, "src/vapid.js"), "utf8") === safeVapid, "rollback never restores an exposed VAPID credential from a checksum-valid backup");
  check(!readFileSync(join(temp, "src/vapid.js"), "utf8").includes(exposedVapidMarker), "version 1 manifest rollback also retains environment-only VAPID source");
  check(rollback.stdout.includes("LEGACY_QIMEN_CONTAINMENT_ROLLBACK_SAFE_SELECTIVE_OK"), "rollback reports that unsafe credential-bearing originals stayed contained");
  const rolledBackMetadata = lstatSync(metadataTarget);
  check((rolledBackMetadata.mode & 0o7777) === expectedMetadata.mode && rolledBackMetadata.uid === expectedMetadata.uid && rolledBackMetadata.gid === expectedMetadata.gid, "rollback restores manifest-recorded target mode and ownership");

  write("unrelated/sentinel.txt", "do-not-change\n");
  write("src/vapid.js", exposedVapidOriginal);
  inventory.patches.push({
    path: "unrelated/sentinel.txt",
    expectedSha256: sha256("do-not-change\n"),
    replacements: [{ find: "do-not-change", replace: "changed" }],
  });
  write("legacy-qimen-inventory.json", `${JSON.stringify(inventory, null, 2)}\n`);
  const arbitraryPatch = invoke(
    "--apply", "--confirm=DISABLE_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--approvals", join(temp, "approvals.txt"), "--backup-dir", join(temp, "arbitrary-backups"),
  );
  check(arbitraryPatch.status !== 0, "apply rejects patches outside reviewed route, source, and cron files");
  check(readFileSync(join(temp, "unrelated/sentinel.txt"), "utf8") === "do-not-change\n", "rejected arbitrary patch leaves unrelated content unchanged");

  const runbookText = readFileSync(runbook, "utf8");
  check(runbookText.includes("--confirm=DISABLE_LEGACY_QIMEN_PUSH"), "runbook requires explicit apply confirmation");
  check(runbookText.includes("--confirm=ROLLBACK_LEGACY_QIMEN_PUSH"), "runbook records explicit rollback confirmation");
  check(runbookText.includes("never print"), "runbook prohibits secret output");
  check(runbookText.includes("retain_applied"), "runbook documents machine-enforced selective rollback for unsafe originals");
  check(runbookText.includes("compensat"), "runbook documents all-target rollback compensation");
  check(runbookText.includes("apply_failed_safe_selective"), "runbook distinguishes a safe-selective apply recovery state from success");
  check(runbookText.includes("apply_compensation_failed"), "runbook makes uncertain apply compensation an operational stop condition");
  const operationalTool = readFileSync(tool, "utf8");
  check(!/TEST_AFTER_BACKUP_MUTATION|LEGACY_CONTAINMENT_TEST_HOOK|runTestAfterBackupHook|NODE_ENV\s*!==?\s*["']test/u.test(operationalTool), "operational tool contains no mutation test hook or test-environment branch");

  console.log(`LEGACY_QIMEN_CONTAINMENT_OK ${checks}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}
