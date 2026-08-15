import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

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
const commentedRouteConfig = [
  "location = /push/test { # return 404",
  "  proxy_pass http://127.0.0.1:4090;",
  "}",
  "location = /push/unsubscribe { # deny all",
  "  proxy_pass http://127.0.0.1:4090;",
  "}",
  "",
].join("\n");
const unsafeRoutes = "app.post('/push/test', sendTest);\napp.post('/push/unsubscribe', unsubscribe);\n";
const safeRoutes = "// Legacy browser-push endpoints removed; Qimen calculation routes remain available.\n";
const unsafeCron = "*/5 * * * * node scripts/legacy-qimen-web-push.js\n";
const safeCron = "# legacy qimen web push cron disabled\n";
const safeVapid = "const privateKey = process.env.VAPID_PRIVATE_KEY;\n";
const unsafeVapid = "const VAPID_" + "PRIVATE_KEY = 'opaque_test_material';\n";
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
];
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
  write("src/vapid-fallbacks.js", "const a = process.env.VAPID_PRIVATE_KEY;\nconst b = process.env.VAPID_PUBLIC_KEY;\n");
  const fallbackSafeAudit = invoke("--root", temp, "--inventory", inventoryPath);
  check(fallbackSafeAudit.status === 0, "audit accepts direct environment-only VAPID values without literal fallbacks");

  write("src/push-routes.js", unsafeRoutes);
  write("cron/qimen.cron", unsafeCron);
  inventory.sourceFiles = ["src/push-routes.js"];
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

  const apply = invoke(
    "--apply", "--confirm=DISABLE_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--approvals", join(temp, "approvals.txt"), "--backup-dir", backupDir,
  );
  check(apply.status === 0, "approved apply atomically disables the reviewed legacy source and cron entries");
  check(readFileSync(join(temp, "src/push-routes.js"), "utf8") === safeRoutes, "apply removes legacy route definitions");
  check(readFileSync(join(temp, "cron/qimen.cron"), "utf8") === safeCron, "apply disables the legacy cron");
  check(existsSync(join(backupDir, "manifest.json")), "apply records a rollback manifest with no secret values");

  const rollback = invoke(
    "--rollback", "--confirm=ROLLBACK_LEGACY_QIMEN_PUSH", "--root", temp,
    "--inventory", inventoryPath, "--backup-dir", backupDir,
  );
  check(rollback.status === 0, "explicit rollback restores only checksum-verified backups");
  check(readFileSync(join(temp, "src/push-routes.js"), "utf8") === unsafeRoutes, "rollback restores the exact prior route source");

  write("unrelated/sentinel.txt", "do-not-change\n");
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

  console.log(`LEGACY_QIMEN_CONTAINMENT_OK ${checks}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}
