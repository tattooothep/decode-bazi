#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const {
  chmodSync, chownSync, closeSync, fsyncSync, openSync, readFileSync,
  lstatSync, renameSync, rmSync, writeFileSync,
} = require("node:fs");
const { dirname, join } = require("node:path");

const SOURCE_PATH = "/etc/hourkey/hourkey.env";
const TARGET_PATH = "/etc/hourkey/hourkey-notification.env";
const ALLOWED_KEYS = Object.freeze([
  "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD",
  "EXPO_PUSH_ACCESS_TOKEN", "ZIWEI_HOURLY_PRODUCER_ENABLED",
  "HOURKEY_RELEASE_COMMIT", "EXPO_IOS_PUSH_READY",
  "NOTIFICATION_SCHEDULER_HEARTBEAT_DIR",
]);
const REQUIRED_KEYS = Object.freeze([
  "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD",
  "ZIWEI_HOURLY_PRODUCER_ENABLED", "HOURKEY_RELEASE_COMMIT",
]);

function selectedEnvironment(source, rejectUnknown) {
  const selected = new Map();
  for (const rawLine of String(source).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) {
      if (rejectUnknown) throw new TypeError("invalid notification environment contract");
      continue;
    }
    if (!ALLOWED_KEYS.includes(match[1])) {
      if (rejectUnknown) throw new TypeError("invalid notification environment contract");
      continue;
    }
    if (selected.has(match[1])) throw new TypeError("duplicate notification environment key");
    selected.set(match[1], match[2]);
  }
  return selected;
}

function scalar(raw) {
  const value = String(raw).trim();
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'")))) return value.slice(1, -1);
  return value;
}

function validSelectedEnvironment(selected) {
  if (!REQUIRED_KEYS.every((key) => selected.has(key))) return false;
  const value = (key) => scalar(selected.get(key));
  if (["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"].some((key) => !value(key) || /[\u0000\r\n]/u.test(value(key)))) return false;
  if (value("PGUSER") !== "hourkey_app") return false;
  const port = Number(value("PGPORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  if (!/^[01]$/u.test(value("ZIWEI_HOURLY_PRODUCER_ENABLED"))) return false;
  if (!/^[0-9a-f]{40}$/u.test(value("HOURKEY_RELEASE_COMMIT"))) return false;
  if (selected.has("EXPO_IOS_PUSH_READY") && !/^(?:true|false)$/u.test(value("EXPO_IOS_PUSH_READY"))) return false;
  for (const key of ["EXPO_PUSH_ACCESS_TOKEN", "NOTIFICATION_SCHEDULER_HEARTBEAT_DIR"]) {
    if (selected.has(key) && (!value(key) || /[\u0000\r\n]/u.test(value(key)))) return false;
  }
  return true;
}

function deriveEnvironmentText(source) {
  const selected = selectedEnvironment(source, false);
  if (!validSelectedEnvironment(selected)) throw new TypeError("invalid notification environment contract");
  const keys = ALLOWED_KEYS.filter((key) => selected.has(key));
  return Object.freeze({ keys, text: `${keys.map((key) => `${key}=${selected.get(key)}`).join("\n")}\n` });
}

function validateInstalledEnvironment(source, metadata) {
  try {
    const selected = selectedEnvironment(source, true);
    return validSelectedEnvironment(selected)
      && metadata?.regularFile === true && metadata.uid === 0
      && metadata.gid === metadata.expectedGid && metadata.mode === 0o640;
  } catch {
    return false;
  }
}

function notificationGroupId() {
  const record = execFileSync("getent", ["group", "hourkey-notify"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const groupId = Number(record.split(":")[2]);
  if (!Number.isInteger(groupId) || groupId < 1) throw new TypeError("notification service group unavailable");
  return groupId;
}

function inspectInstalledEnvironment(path = TARGET_PATH) {
  try {
    const stats = lstatSync(path);
    const expectedGid = notificationGroupId();
    return validateInstalledEnvironment(readFileSync(path, "utf8"), {
      uid: stats.uid, gid: stats.gid, mode: stats.mode & 0o777,
      expectedGid, regularFile: stats.isFile(),
    });
  } catch {
    return false;
  }
}

function readInstalledEnvironment(path = TARGET_PATH) {
  try {
    const stats = lstatSync(path);
    const expectedGid = notificationGroupId();
    const source = readFileSync(path, "utf8");
    if (!validateInstalledEnvironment(source, {
      uid: stats.uid, gid: stats.gid, mode: stats.mode & 0o777,
      expectedGid, regularFile: stats.isFile(),
    })) return null;
    const selected = selectedEnvironment(source, true);
    return Object.freeze(Object.fromEntries(
      ALLOWED_KEYS.filter((key) => selected.has(key)).map((key) => [key, scalar(selected.get(key))]),
    ));
  } catch {
    return null;
  }
}

function install(options = {}) {
  if (process.getuid?.() !== 0) throw new TypeError("notification environment install requires root");
  const sourcePath = options.sourcePath || SOURCE_PATH;
  const targetPath = options.targetPath || TARGET_PATH;
  const groupId = options.groupId === undefined ? notificationGroupId() : options.groupId;
  const derived = deriveEnvironmentText(readFileSync(sourcePath, "utf8"));
  const temporary = join(dirname(targetPath), `.hourkey-notification.env.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, derived.text, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chownSync(temporary, 0, groupId);
    chmodSync(temporary, 0o640);
    renameSync(temporary, targetPath);
    return Object.freeze({ ok: true, keysWritten: derived.keys.length });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
}

if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== "--install") {
    console.error(JSON.stringify({ ok: false, error: "invalid_arguments" }));
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(install())); }
    catch {
      console.error(JSON.stringify({ ok: false, error: "notification_env_install_failed" }));
      process.exitCode = 1;
    }
  }
}

module.exports = Object.freeze({
  ALLOWED_KEYS, REQUIRED_KEYS, deriveEnvironmentText, inspectInstalledEnvironment,
  install, readInstalledEnvironment, validateInstalledEnvironment,
});
