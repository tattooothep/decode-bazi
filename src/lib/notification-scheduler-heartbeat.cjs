"use strict";

const { randomBytes } = require("node:crypto");
const { statSync } = require("node:fs");
const { chmod, mkdir, open, rename, rm } = require("node:fs/promises");
const { join } = require("node:path");
const { SCHEDULER_NAMES } = require("./notification-science.cjs");

const DEFAULT_DIRECTORY = "/var/lib/hourkey-notification/schedulers";

function heartbeatDirectory(value) {
  return String(value || process.env.NOTIFICATION_SCHEDULER_HEARTBEAT_DIR || DEFAULT_DIRECTORY);
}

function assertSchedulerName(name) {
  if (!SCHEDULER_NAMES.includes(name)) throw new TypeError("unknown notification scheduler heartbeat");
}

function heartbeatPath(name, directory) {
  assertSchedulerName(name);
  return join(heartbeatDirectory(directory), `${name}.heartbeat`);
}

function readSchedulerHeartbeats(directory) {
  return Object.fromEntries(SCHEDULER_NAMES.map((name) => {
    try {
      return [name, statSync(heartbeatPath(name, directory)).mtime.toISOString()];
    } catch {
      return [name, null];
    }
  }));
}

async function writeSchedulerHeartbeat(name, options = {}) {
  assertSchedulerName(name);
  const directory = heartbeatDirectory(options.directory);
  const at = options.at instanceof Date ? options.at : new Date();
  if (!Number.isFinite(at.valueOf())) throw new TypeError("invalid scheduler heartbeat timestamp");
  await mkdir(directory, { recursive: true, mode: 0o750 });
  await chmod(directory, 0o750);
  const target = heartbeatPath(name, directory);
  const temporary = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o640);
    await handle.writeFile(`${at.toISOString()}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
    await chmod(target, 0o640);
  } finally {
    await handle?.close().catch(() => null);
    await rm(temporary, { force: true }).catch(() => null);
  }
  return target;
}

module.exports = {
  DEFAULT_DIRECTORY,heartbeatDirectory,heartbeatPath,readSchedulerHeartbeats,writeSchedulerHeartbeat,
};
