#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const CONFIRM_APPLY = "DISABLE_LEGACY_QIMEN_PUSH";
const CONFIRM_ROLLBACK = "ROLLBACK_LEGACY_QIMEN_PUSH";

function fail(code) {
  throw new Error(code);
}

function parseArgs(argv) {
  const parsed = { mode: "audit" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") parsed.mode = parsed.mode === "audit" ? "apply" : fail("invalid_mode");
    else if (arg === "--rollback") parsed.mode = parsed.mode === "audit" ? "rollback" : fail("invalid_mode");
    else if (arg.startsWith("--confirm=")) parsed.confirm = arg.slice("--confirm=".length);
    else if (["--root", "--inventory", "--approvals", "--backup-dir"].includes(arg)) {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) fail("missing_argument");
      parsed[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = argv[++index];
    } else fail("unknown_argument");
  }
  if (!parsed.root || !parsed.inventory) fail("root_and_inventory_required");
  if (!isAbsolute(parsed.root) || !isAbsolute(parsed.inventory)) fail("absolute_paths_required");
  if ((parsed.mode === "apply" || parsed.mode === "rollback") && !parsed.backupDir) fail("backup_dir_required");
  if (parsed.backupDir && !isAbsolute(parsed.backupDir)) fail("absolute_paths_required");
  if (parsed.approvals && !isAbsolute(parsed.approvals)) fail("absolute_paths_required");
  return parsed;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isContained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function safeRelativePath(value) {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.split(/[\\/]/u).includes("..")) fail("unsafe_inventory_path");
  return value;
}

function regularFile(root, relativePath) {
  const target = resolve(root, safeRelativePath(relativePath));
  if (!isContained(root, target) || !existsSync(target)) fail("required_file_missing");
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("required_file_not_regular");
  return target;
}

function loadInventory(options) {
  const root = resolve(options.root);
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) fail("invalid_root");
  const inventoryPath = resolve(options.inventory);
  if (!existsSync(inventoryPath) || !lstatSync(inventoryPath).isFile() || lstatSync(inventoryPath).isSymbolicLink()) fail("invalid_inventory");
  let inventory;
  try { inventory = JSON.parse(readFileSync(inventoryPath, "utf8")); } catch { fail("invalid_inventory_json"); }
  if (!inventory || inventory.version !== 1 || inventory.root !== root) fail("inventory_root_mismatch");
  for (const key of ["routeFiles", "sourceFiles", "cronFiles", "environmentFiles", "requiredEnvironmentKeys"]) {
    if (!Array.isArray(inventory[key]) || inventory[key].length === 0) fail("invalid_inventory_shape");
  }
  for (const key of ["routeFiles", "sourceFiles", "cronFiles", "environmentFiles"]) {
    for (const path of inventory[key]) regularFile(root, path);
  }
  if (!inventory.requiredEnvironmentKeys.every((key) => typeof key === "string" && /^VAPID_[A-Z_]+$/u.test(key))) fail("invalid_environment_key");
  if (inventory.patches !== undefined && !Array.isArray(inventory.patches)) fail("invalid_patch_list");
  return { root, inventory };
}

function fileText(root, relativePath, overrides) {
  return overrides?.get(relativePath) ?? readFileSync(regularFile(root, relativePath), "utf8");
}

function containsDeniedRoute(text, route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`location\\s*=\\s*${escaped}\\s*\\{[^}]*\\b(?:return\\s+(?:403|404|410)|deny\\s+all)`, "iu").test(text);
}

function audit(root, inventory, overrides) {
  const routeConfig = inventory.routeFiles.map((path) => fileText(root, path, overrides)).join("\n");
  for (const route of ["/push/test", "/push/unsubscribe"]) {
    if (!containsDeniedRoute(routeConfig, route)) fail("legacy_route_not_denied");
  }
  const sourceControlledFiles = [...inventory.routeFiles, ...inventory.sourceFiles, ...inventory.cronFiles];
  for (const path of sourceControlledFiles) {
    const text = fileText(root, path, overrides);
    if (/VAPID_PRIVATE_KEY\s*(?:=|:)\s*["'`][^"'`\r\n]+["'`]/u.test(text)) fail("hardcoded_vapid_private_key");
    if (/setVapidDetails\s*\([^,]+,[^,]+,\s*["'`]/u.test(text)) fail("hardcoded_vapid_private_key");
  }
  for (const path of [...inventory.sourceFiles, ...inventory.cronFiles]) {
    if (/["'`]\/push\/(?:test|unsubscribe)["'`]/u.test(fileText(root, path, overrides))) fail("legacy_route_present");
  }
  for (const path of inventory.cronFiles) {
    for (const line of fileText(root, path, overrides).split(/\r?\n/u)) {
      const normalized = line.trim().toLowerCase();
      if (!normalized || normalized.startsWith("#")) continue;
      if (normalized.includes("qimen") && normalized.includes("push") && !normalized.includes("disabled")) fail("legacy_push_cron_enabled");
    }
  }
  const environment = inventory.environmentFiles.map((path) => fileText(root, path, overrides)).join("\n");
  for (const key of inventory.requiredEnvironmentKeys) {
    if (!new RegExp(`^${key}=\\S+`, "mu").test(environment)) fail("vapid_environment_unavailable");
  }
}

function approvalCount(path) {
  const reviewers = new Set();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^([a-z0-9_-]{3,80})\s+APPROVE$/iu);
    if (match) reviewers.add(match[1].toLowerCase());
  }
  return reviewers.size;
}

function atomicWrite(path, text) {
  const temporary = `${path}.legacy-containment-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, text, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

function preparePatches(root, inventory) {
  if (!Array.isArray(inventory.patches) || inventory.patches.length === 0) fail("patches_required_for_apply");
  const changes = new Map();
  for (const patch of inventory.patches) {
    if (!patch || typeof patch !== "object" || typeof patch.path !== "string" || !/^[a-f0-9]{64}$/u.test(patch.expectedSha256 || "") || !Array.isArray(patch.replacements) || patch.replacements.length === 0) fail("invalid_patch");
    if (changes.has(patch.path)) fail("duplicate_patch_path");
    const original = fileText(root, patch.path);
    if (sha256(original) !== patch.expectedSha256) fail("unexpected_target_checksum");
    let replacement = original;
    for (const edit of patch.replacements) {
      if (!edit || typeof edit.find !== "string" || !edit.find || typeof edit.replace !== "string") fail("invalid_replacement");
      if (replacement.split(edit.find).length - 1 !== 1) fail("replacement_not_exact");
      replacement = replacement.replace(edit.find, edit.replace);
    }
    changes.set(patch.path, { original, replacement });
  }
  audit(root, inventory, new Map([...changes].map(([path, change]) => [path, change.replacement])));
  return changes;
}

function validateBackupDir(root, backupDir) {
  const resolved = resolve(backupDir);
  if (resolved === root || !isContained(resolve(dirname(resolved)), resolved)) fail("invalid_backup_dir");
  if (existsSync(resolved) && (!lstatSync(resolved).isDirectory() || lstatSync(resolved).isSymbolicLink())) fail("invalid_backup_dir");
  return resolved;
}

function apply(options, root, inventory) {
  if (options.confirm !== CONFIRM_APPLY || !options.approvals || !existsSync(options.approvals) || approvalCount(options.approvals) !== 3) fail("apply_requires_three_approvals");
  const changes = preparePatches(root, inventory);
  const backupDir = validateBackupDir(root, options.backupDir);
  if (existsSync(joinPath(backupDir, "manifest.json"))) fail("backup_dir_not_empty");
  mkdirSync(joinPath(backupDir, "files"), { recursive: true, mode: 0o700 });
  const manifest = { version: 1, root, files: [] };
  for (const [path, change] of changes) {
    const backupName = sha256(path);
    atomicWrite(joinPath(backupDir, "files", backupName), change.original);
    manifest.files.push({ path, backupName, originalSha256: sha256(change.original), appliedSha256: sha256(change.replacement) });
  }
  atomicWrite(joinPath(backupDir, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const written = [];
  try {
    for (const [path, change] of changes) {
      atomicWrite(regularFile(root, path), change.replacement);
      written.push(path);
    }
    audit(root, inventory);
  } catch {
    for (const path of written.reverse()) atomicWrite(regularFile(root, path), changes.get(path).original);
    fail("apply_failed_rolled_back");
  }
  process.stdout.write("LEGACY_QIMEN_CONTAINMENT_APPLY_OK\n");
}

function joinPath(...parts) {
  return resolve(...parts);
}

function rollback(options, root) {
  if (options.confirm !== CONFIRM_ROLLBACK) fail("rollback_confirmation_required");
  const backupDir = validateBackupDir(root, options.backupDir);
  const manifestPath = joinPath(backupDir, "manifest.json");
  if (!existsSync(manifestPath)) fail("rollback_manifest_missing");
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { fail("invalid_rollback_manifest"); }
  if (!manifest || manifest.version !== 1 || manifest.root !== root || !Array.isArray(manifest.files) || manifest.files.length === 0) fail("invalid_rollback_manifest");
  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string" || !/^[a-f0-9]{64}$/u.test(file.backupName || "")) fail("invalid_rollback_manifest");
    const original = readFileSync(joinPath(backupDir, "files", file.backupName), "utf8");
    if (sha256(original) !== file.originalSha256 || sha256(fileText(root, file.path)) !== file.appliedSha256) fail("rollback_checksum_mismatch");
  }
  for (const file of manifest.files) atomicWrite(regularFile(root, file.path), readFileSync(joinPath(backupDir, "files", file.backupName), "utf8"));
  process.stdout.write("LEGACY_QIMEN_CONTAINMENT_ROLLBACK_OK\n");
}

try {
  const options = parseArgs(process.argv.slice(2));
  const { root, inventory } = loadInventory(options);
  if (options.mode === "audit") {
    audit(root, inventory);
    process.stdout.write("LEGACY_QIMEN_CONTAINMENT_AUDIT_OK\n");
  } else if (options.mode === "apply") apply(options, root, inventory);
  else rollback(options, root);
} catch (error) {
  process.stderr.write(`LEGACY_QIMEN_CONTAINMENT_FAILED:${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
}
