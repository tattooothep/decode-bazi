#!/usr/bin/env node
import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fchmodSync, fchownSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

const CONFIRM_APPLY = "DISABLE_LEGACY_QIMEN_PUSH";
const CONFIRM_ROLLBACK = "ROLLBACK_LEGACY_QIMEN_PUSH";
const SAFE_FAILURE_CODES = new Set([
  "absolute_paths_required", "apply_compensation_failed", "apply_failed_rolled_back",
  "apply_failed_safe_selective", "apply_requires_three_approvals",
  "backup_dir_creation_failed", "backup_dir_must_not_be_preexisting", "backup_dir_required",
  "duplicate_patch_path", "hardcoded_vapid_private_key", "invalid_approvals", "invalid_backup_dir",
  "invalid_environment_key", "invalid_inventory", "invalid_inventory_json", "invalid_inventory_shape",
  "invalid_mode", "invalid_patch", "invalid_patch_list", "invalid_replacement", "invalid_root",
  "invalid_rollback_manifest", "inventory_root_mismatch", "legacy_push_cron_enabled",
  "legacy_route_not_denied", "legacy_route_present", "missing_argument", "patch_path_not_allowlisted",
  "path_component_not_directory", "path_component_symlink", "path_realpath_escape",
  "patches_required_for_apply", "replacement_not_exact", "required_file_missing", "required_file_not_regular",
  "rollback_checksum_mismatch", "rollback_compensation_failed", "rollback_confirmation_required",
  "rollback_failed_compensated", "rollback_manifest_missing",
  "root_and_inventory_required", "unexpected_target_checksum", "unknown_argument", "unsafe_inventory_path",
  "vapid_environment_unavailable", "invalid_target_encoding", "target_state_changed_before_write",
  "target_metadata_not_preserved",
]);

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
  if (typeof value !== "string" || !value || isAbsolute(value) || value.split(/[\\/]/u).some((part) => !part || part === "." || part === "..")) fail("unsafe_inventory_path");
  return value;
}

function secureAbsoluteDirectory(path, failureCode) {
  const resolved = resolve(path);
  const root = parse(resolved).root;
  let current = root;
  for (const component of relative(root, resolved).split(sep).filter(Boolean)) {
    current = join(current, component);
    if (!existsSync(current)) fail(failureCode);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) fail("path_component_symlink");
    if (!stat.isDirectory()) fail("path_component_not_directory");
    if (realpathSync(current) !== current) fail("path_realpath_escape");
  }
  return resolved;
}

function secureAbsoluteFile(path, failureCode) {
  const resolved = resolve(path);
  secureAbsoluteDirectory(dirname(resolved), failureCode);
  if (!existsSync(resolved)) fail(failureCode);
  const stat = lstatSync(resolved);
  if (stat.isSymbolicLink()) fail("path_component_symlink");
  if (!stat.isFile()) fail(failureCode);
  if (realpathSync(resolved) !== resolved) fail("path_realpath_escape");
  return resolved;
}

function regularFile(root, relativePath) {
  secureAbsoluteDirectory(root, "invalid_root");
  let current = root;
  const components = safeRelativePath(relativePath).split(/[\\/]/u);
  for (let index = 0; index < components.length; index += 1) {
    current = join(current, components[index]);
    if (!isContained(root, current) || !existsSync(current)) fail("required_file_missing");
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) fail("path_component_symlink");
    if (index < components.length - 1 && !stat.isDirectory()) fail("path_component_not_directory");
    if (index === components.length - 1 && !stat.isFile()) fail("required_file_not_regular");
    const actual = realpathSync(current);
    if (!isContained(root, actual) || actual !== current) fail("path_realpath_escape");
  }
  return current;
}

function loadInventory(options) {
  const root = secureAbsoluteDirectory(options.root, "invalid_root");
  const inventoryPath = secureAbsoluteFile(options.inventory, "invalid_inventory");
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

function stripNginxComments(text) {
  let output = "";
  let quote = null;
  let escaped = false;
  let inComment = false;
  for (const character of text) {
    if (inComment) {
      if (character === "\n") { inComment = false; output += character; }
      continue;
    }
    if (quote) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "#") { inComment = true; continue; }
    if (character === "\"" || character === "'") quote = character;
    output += character;
  }
  return output;
}

function exactLocationBodies(text, route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const config = stripNginxComments(text);
  const header = new RegExp(`\\blocation\\s*=\\s*${escaped}\\s*\\{`, "giu");
  const bodies = [];
  for (const match of config.matchAll(header)) {
    let depth = 1;
    for (let index = match.index + match[0].length; index < config.length; index += 1) {
      if (config[index] === "{") depth += 1;
      else if (config[index] === "}" && --depth === 0) {
        bodies.push(config.slice(match.index + match[0].length, index));
        break;
      }
    }
  }
  return bodies;
}

function containsDeniedRoute(text, route) {
  const bodies = exactLocationBodies(text, route);
  return bodies.length === 1 && bodies[0].trim() === "return 404;";
}

function hasOnlyCanonicalVapidDataflow(text) {
  const canonicalBindings = new Set([
    "constVAPID_PUBLIC_KEY=process.env.VAPID_PUBLIC_KEY;",
    "constVAPID_PRIVATE_KEY=process.env.VAPID_PRIVATE_KEY;",
    "constVAPID_SUBJECT=process.env.VAPID_SUBJECT;",
  ]);
  const canonicalCall = "webPush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);";
  const bindings = new Set();
  let calls = 0;
  let seen = false;
  for (const line of text.split(/\r?\n/u)) {
    const compact = line.replace(/\s+/gu, "");
    if (!/(?:VAPID|[Vv]apid|setVapidDetails)/u.test(compact)) continue;
    seen = true;
    if (canonicalBindings.has(compact)) {
      if (bindings.has(compact)) return false;
      bindings.add(compact);
      continue;
    }
    if (compact === canonicalCall) { calls += 1; continue; }
    return false;
  }
  return !seen || (calls === 1 && bindings.size === canonicalBindings.size);
}

function containsVapidSignal(text) {
  return /(?:vapid|setVapidDetails)/iu.test(text);
}

function rollbackPolicyForTransition(original, applied) {
  return containsVapidSignal(original) || containsVapidSignal(applied)
    ? "retain_applied"
    : "restore_original";
}

function targetSnapshot(root, relativePath) {
  const target = regularFile(root, relativePath);
  const stat = lstatSync(target);
  const bytes = readFileSync(target);
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) fail("invalid_target_encoding");
  return {
    target,
    bytes,
    text,
    sha256: sha256(bytes),
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  };
}

function verifyTargetSnapshot(root, relativePath, before) {
  const current = targetSnapshot(root, relativePath);
  if (current.target !== before.target || current.sha256 !== before.sha256 || current.dev !== before.dev || current.ino !== before.ino || current.mode !== before.mode || current.uid !== before.uid || current.gid !== before.gid || current.size !== before.size || current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs) {
    fail("target_state_changed_before_write");
  }
  return current;
}

function verifyAllTargetSnapshots(root, changes) {
  for (const [path, change] of changes) verifyTargetSnapshot(root, path, change.before);
}

function auditRecoveryBoundary(root, inventory, overrides) {
  const routeConfig = inventory.routeFiles.map((path) => fileText(root, path, overrides)).join("\n");
  for (const route of ["/push/test", "/push/unsubscribe"]) {
    if (!containsDeniedRoute(routeConfig, route)) fail("legacy_route_not_denied");
  }
  const sourceControlledFiles = [...inventory.routeFiles, ...inventory.sourceFiles, ...inventory.cronFiles];
  for (const path of sourceControlledFiles) {
    const text = fileText(root, path, overrides);
    if (!hasOnlyCanonicalVapidDataflow(text)) fail("hardcoded_vapid_private_key");
  }
  const environment = inventory.environmentFiles.map((path) => fileText(root, path, overrides)).join("\n");
  for (const key of inventory.requiredEnvironmentKeys) {
    if (!new RegExp(`^${key}=\\S+`, "mu").test(environment)) fail("vapid_environment_unavailable");
  }
}

function audit(root, inventory, overrides) {
  auditRecoveryBoundary(root, inventory, overrides);
  for (const path of [...inventory.sourceFiles, ...inventory.cronFiles]) {
    if (/["'`]\/push\/(?:test|unsubscribe)["'`]/u.test(fileText(root, path, overrides))) fail("legacy_route_present");
  }
  for (const path of inventory.cronFiles) {
    for (const line of fileText(root, path, overrides).split(/\r?\n/u)) {
      const trimmed = line.trimStart();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const activeEntry = trimmed.replace(/\s+#.*$/u, "").toLowerCase();
      if (activeEntry.includes("qimen") && activeEntry.includes("push")) fail("legacy_push_cron_enabled");
    }
  }
}

function approvalCount(path) {
  const reviewers = new Set();
  let contents;
  try { contents = readFileSync(secureAbsoluteFile(path, "invalid_approvals"), "utf8"); } catch { fail("invalid_approvals"); }
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^([a-z0-9_-]{3,80})\s+APPROVE$/iu);
    if (match) reviewers.add(match[1].toLowerCase());
  }
  return reviewers.size;
}

function metadataFromSnapshot(snapshot) {
  return { mode: snapshot.mode & 0o7777, uid: snapshot.uid, gid: snapshot.gid };
}

function validMetadata(value, failureCode) {
  if (!value || typeof value !== "object" || !Number.isSafeInteger(value.mode) || value.mode < 0 || value.mode > 0o7777 || !Number.isSafeInteger(value.uid) || value.uid < 0 || !Number.isSafeInteger(value.gid) || value.gid < 0) fail(failureCode);
  return value;
}

function writeNewTemporary(path, text, metadata) {
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    writeFileSync(descriptor, text, "utf8");
    if (metadata) {
      const expected = validMetadata(metadata, "target_metadata_not_preserved");
      fchownSync(descriptor, expected.uid, expected.gid);
      fchmodSync(descriptor, expected.mode);
    }
  }
  finally { closeSync(descriptor); }
}

function atomicWriteBackup(backupDir, name, text) {
  const parent = name === "manifest.json" ? backupDir : join(backupDir, "files");
  if (name !== "manifest.json" && !/^[a-f0-9]{64}$/u.test(name)) fail("invalid_rollback_manifest");
  secureAbsoluteDirectory(parent, "backup_dir_creation_failed");
  const target = join(parent, name);
  if (existsSync(target)) fail("backup_dir_must_not_be_preexisting");
  const temporary = `${target}.legacy-containment-${process.pid}-${Date.now()}`;
  try {
    secureAbsoluteDirectory(parent, "backup_dir_creation_failed");
    writeNewTemporary(temporary, text);
    secureAbsoluteDirectory(parent, "backup_dir_creation_failed");
    renameSync(temporary, target);
  } catch (error) {
    if (existsSync(temporary) && !lstatSync(temporary).isSymbolicLink()) unlinkSync(temporary);
    throw error;
  }
}

function backupFile(backupDir, name) {
  if (!/^[a-f0-9]{64}$/u.test(name)) fail("invalid_rollback_manifest");
  return secureAbsoluteFile(join(backupDir, "files", name), "invalid_rollback_manifest");
}

function verifyWrittenTarget(root, relativePath, text, metadata) {
  const current = targetSnapshot(root, relativePath);
  const expected = validMetadata(metadata, "target_metadata_not_preserved");
  if (current.sha256 !== sha256(text) || (current.mode & 0o7777) !== expected.mode || current.uid !== expected.uid || current.gid !== expected.gid) fail("target_metadata_not_preserved");
  return current;
}

function hasSnapshotContentAndMetadata(current, expected) {
  return current.sha256 === expected.sha256
    && (current.mode & 0o7777) === (expected.mode & 0o7777)
    && current.uid === expected.uid
    && current.gid === expected.gid;
}

function writeTargetOnce(root, relativePath, text, before, metadata) {
  const target = verifyTargetSnapshot(root, relativePath, before).target;
  const temporary = `${target}.legacy-containment-${process.pid}-${Date.now()}`;
  try {
    verifyTargetSnapshot(root, relativePath, before);
    writeNewTemporary(temporary, text, metadata);
    verifyTargetSnapshot(root, relativePath, before);
    renameSync(temporary, target);
  } catch (error) {
    if (existsSync(temporary) && !lstatSync(temporary).isSymbolicLink()) unlinkSync(temporary);
    throw error;
  }
  return target;
}

function atomicWriteTarget(root, relativePath, text, before, metadata = metadataFromSnapshot(before)) {
  let renamed = false;
  try {
    writeTargetOnce(root, relativePath, text, before, metadata);
    renamed = true;
    verifyWrittenTarget(root, relativePath, text, metadata);
  } catch (error) {
    if (renamed) {
      try {
        const current = targetSnapshot(root, relativePath);
        if (current.sha256 !== sha256(text)) fail("target_state_changed_before_write");
        writeTargetOnce(root, relativePath, before.text, current, metadataFromSnapshot(before));
        verifyWrittenTarget(root, relativePath, before.text, metadataFromSnapshot(before));
      } catch {
        fail("target_metadata_not_preserved");
      }
    }
    throw error;
  }
}

function preparePatches(root, inventory) {
  if (!Array.isArray(inventory.patches) || inventory.patches.length === 0) fail("patches_required_for_apply");
  const approvedPaths = new Set([...inventory.routeFiles, ...inventory.sourceFiles, ...inventory.cronFiles]);
  const changes = new Map();
  for (const patch of inventory.patches) {
    if (!patch || typeof patch !== "object" || typeof patch.path !== "string" || !/^[a-f0-9]{64}$/u.test(patch.expectedSha256 || "") || !Array.isArray(patch.replacements) || patch.replacements.length === 0) fail("invalid_patch");
    if (!approvedPaths.has(patch.path)) fail("patch_path_not_allowlisted");
    if (changes.has(patch.path)) fail("duplicate_patch_path");
    const before = targetSnapshot(root, patch.path);
    if (before.sha256 !== patch.expectedSha256) fail("unexpected_target_checksum");
    let replacement = before.text;
    for (const edit of patch.replacements) {
      if (!edit || typeof edit.find !== "string" || !edit.find || typeof edit.replace !== "string") fail("invalid_replacement");
      if (replacement.split(edit.find).length - 1 !== 1) fail("replacement_not_exact");
      replacement = replacement.replace(edit.find, edit.replace);
    }
    changes.set(patch.path, { before, replacement });
  }
  audit(root, inventory, new Map([...changes].map(([path, change]) => [path, change.replacement])));
  return changes;
}

function backupDirPath(root, backupDir) {
  const resolved = resolve(backupDir);
  if (resolved === root || isContained(resolved, root)) fail("invalid_backup_dir");
  return resolved;
}

function createExclusiveBackupDir(root, backupDir) {
  const resolved = backupDirPath(root, backupDir);
  secureAbsoluteDirectory(dirname(resolved), "invalid_backup_dir");
  try { mkdirSync(resolved, { recursive: false, mode: 0o700 }); }
  catch { fail("backup_dir_must_not_be_preexisting"); }
  return secureAbsoluteDirectory(resolved, "backup_dir_creation_failed");
}

function existingBackupDir(root, backupDir) {
  const resolved = backupDirPath(root, backupDir);
  return secureAbsoluteDirectory(resolved, "invalid_backup_dir");
}

function apply(options, root, inventory) {
  if (options.confirm !== CONFIRM_APPLY || !options.approvals || approvalCount(options.approvals) !== 3) fail("apply_requires_three_approvals");
  const changes = preparePatches(root, inventory);
  const backupDir = createExclusiveBackupDir(root, options.backupDir);
  mkdirSync(joinPath(backupDir, "files"), { recursive: false, mode: 0o700 });
  const manifest = { version: 2, root, files: [] };
  verifyAllTargetSnapshots(root, changes);
  for (const [path, change] of changes) {
    const backupName = sha256(path);
    atomicWriteBackup(backupDir, backupName, change.before.text);
    manifest.files.push({
      path,
      backupName,
      originalSha256: change.before.sha256,
      appliedSha256: sha256(change.replacement),
      originalMetadata: metadataFromSnapshot(change.before),
      rollbackPolicy: rollbackPolicyForTransition(change.before.text, change.replacement),
    });
  }
  atomicWriteBackup(backupDir, "manifest.json", `${JSON.stringify(manifest)}\n`);
  verifyAllTargetSnapshots(root, changes);
  const written = [];
  try {
    for (const [path, change] of changes) {
      atomicWriteTarget(root, path, change.replacement, change.before);
      written.push({ path, change });
    }
    audit(root, inventory);
  } catch {
    let compensationFailed = false;
    for (const { path, change } of written.slice().reverse()) {
      if (rollbackPolicyForTransition(change.before.text, change.replacement) === "retain_applied") continue;
      try {
        const current = targetSnapshot(root, path);
        if (current.sha256 !== sha256(change.replacement)) fail("apply_compensation_failed");
        atomicWriteTarget(root, path, change.before.text, current, metadataFromSnapshot(change.before));
      } catch {
        compensationFailed = true;
      }
    }
    const writtenPaths = new Set(written.map(({ path }) => path));
    let retainedApplied = false;
    for (const [path, change] of changes) {
      try {
        const retainApplied = writtenPaths.has(path)
          && rollbackPolicyForTransition(change.before.text, change.replacement) === "retain_applied";
        retainedApplied ||= retainApplied;
        const expectedSha256 = retainApplied ? sha256(change.replacement) : change.before.sha256;
        const current = targetSnapshot(root, path);
        if (current.sha256 !== expectedSha256) compensationFailed = true;
        const expected = metadataFromSnapshot(change.before);
        if ((current.mode & 0o7777) !== expected.mode || current.uid !== expected.uid || current.gid !== expected.gid) compensationFailed = true;
      } catch {
        compensationFailed = true;
      }
    }
    if (compensationFailed) fail("apply_compensation_failed");
    if (retainedApplied) fail("apply_failed_safe_selective");
    fail("apply_failed_rolled_back");
  }
  process.stdout.write("LEGACY_QIMEN_CONTAINMENT_APPLY_OK\n");
}

function joinPath(...parts) {
  return resolve(...parts);
}

function rollback(options, root, inventory) {
  if (options.confirm !== CONFIRM_ROLLBACK) fail("rollback_confirmation_required");
  const backupDir = existingBackupDir(root, options.backupDir);
  const manifestPath = secureAbsoluteFile(joinPath(backupDir, "manifest.json"), "rollback_manifest_missing");
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { fail("invalid_rollback_manifest"); }
  if (!manifest || ![1, 2].includes(manifest.version) || manifest.root !== root || !Array.isArray(manifest.files) || manifest.files.length === 0) fail("invalid_rollback_manifest");
  const approvedPaths = new Set([...inventory.routeFiles, ...inventory.sourceFiles, ...inventory.cronFiles]);
  const seenPaths = new Set();
  const changes = [];
  let fullyApplied = true;
  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string" || !/^[a-f0-9]{64}$/u.test(file.backupName || "") || !/^[a-f0-9]{64}$/u.test(file.originalSha256 || "") || !/^[a-f0-9]{64}$/u.test(file.appliedSha256 || "")) fail("invalid_rollback_manifest");
    if (!approvedPaths.has(file.path)) fail("patch_path_not_allowlisted");
    if (seenPaths.has(file.path)) fail("invalid_rollback_manifest");
    seenPaths.add(file.path);
    validMetadata(file.originalMetadata, "invalid_rollback_manifest");
    const original = readFileSync(backupFile(backupDir, file.backupName), "utf8");
    const target = targetSnapshot(root, file.path);
    if (sha256(original) !== file.originalSha256) fail("rollback_checksum_mismatch");
    const rollbackPolicy = rollbackPolicyForTransition(original, target.text);
    if (manifest.version === 2 && file.rollbackPolicy !== rollbackPolicy) fail("invalid_rollback_manifest");
    const targetState = target.sha256 === file.appliedSha256
      ? "applied"
      : rollbackPolicy === "restore_original" && target.sha256 === file.originalSha256
        ? "original"
        : fail("rollback_checksum_mismatch");
    const expectedMetadata = validMetadata(file.originalMetadata, "invalid_rollback_manifest");
    if ((target.mode & 0o7777) !== expectedMetadata.mode || target.uid !== expectedMetadata.uid || target.gid !== expectedMetadata.gid) fail("rollback_checksum_mismatch");
    fullyApplied &&= targetState === "applied";
    changes.push({ file, original, target, targetState, rollbackPolicy });
  }
  if (fullyApplied) audit(root, inventory);
  else auditRecoveryBoundary(root, inventory);
  for (const change of changes) verifyTargetSnapshot(root, change.file.path, change.target);
  const written = [];
  try {
    for (const change of changes) {
      if (change.rollbackPolicy === "retain_applied" || change.targetState === "original") continue;
      atomicWriteTarget(root, change.file.path, change.original, change.target, change.file.originalMetadata);
      written.push(change);
    }
    for (const change of changes) {
      const current = targetSnapshot(root, change.file.path);
      const expectedMetadata = change.rollbackPolicy === "retain_applied"
        ? metadataFromSnapshot(change.target)
        : change.file.originalMetadata;
      const expectedSha256 = change.rollbackPolicy === "retain_applied"
        ? change.target.sha256
        : change.file.originalSha256;
      if (current.sha256 !== expectedSha256
        || (current.mode & 0o7777) !== expectedMetadata.mode
        || current.uid !== expectedMetadata.uid
        || current.gid !== expectedMetadata.gid) fail("rollback_compensation_failed");
    }
  } catch {
    let compensationFailed = false;
    for (const change of written.reverse()) {
      try {
        const current = targetSnapshot(root, change.file.path);
        if (current.sha256 !== change.file.originalSha256) fail("rollback_compensation_failed");
        atomicWriteTarget(root, change.file.path, change.target.text, current, metadataFromSnapshot(change.target));
      } catch {
        compensationFailed = true;
      }
    }
    for (const change of changes) {
      try {
        if (!hasSnapshotContentAndMetadata(targetSnapshot(root, change.file.path), change.target)) compensationFailed = true;
      } catch {
        compensationFailed = true;
      }
    }
    if (compensationFailed) fail("rollback_compensation_failed");
    fail("rollback_failed_compensated");
  }
  const selective = changes.some((change) => change.rollbackPolicy === "retain_applied");
  process.stdout.write(selective
    ? "LEGACY_QIMEN_CONTAINMENT_ROLLBACK_SAFE_SELECTIVE_OK\n"
    : "LEGACY_QIMEN_CONTAINMENT_ROLLBACK_OK\n");
}

try {
  const options = parseArgs(process.argv.slice(2));
  const { root, inventory } = loadInventory(options);
  if (options.mode === "audit") {
    audit(root, inventory);
    process.stdout.write("LEGACY_QIMEN_CONTAINMENT_AUDIT_OK\n");
  } else if (options.mode === "apply") apply(options, root, inventory);
  else rollback(options, root, inventory);
} catch (error) {
  const code = error instanceof Error && SAFE_FAILURE_CODES.has(error.message) ? error.message : "unexpected_failure";
  process.stderr.write(`LEGACY_QIMEN_CONTAINMENT_FAILED:${code}\n`);
  process.exitCode = 1;
}
