#!/usr/bin/env node
"use strict";

const { randomBytes } = require("node:crypto");
const { chmod, mkdir, open, rename, rm } = require("node:fs/promises");
const { dirname } = require("node:path");
const worker = require("./mobile-push-retry-worker.cjs");

function heartbeatFile(args = process.argv.slice(2)) {
  const index = args.indexOf("--heartbeat-file");
  return index >= 0 ? args[index + 1] : process.env.NOTIFICATION_WORKER_HEARTBEAT_FILE;
}

async function writeHeartbeat(file, at = new Date()) {
  if (!file) throw new Error("heartbeat_file_required");
  if (!(at instanceof Date) || !Number.isFinite(at.valueOf())) throw new Error("heartbeat_time_invalid");
  await mkdir(dirname(file), { recursive: true, mode: 0o750 });
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o640);
    await handle.writeFile(`${at.toISOString()}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, file);
    await chmod(file, 0o640);
  } finally {
    await handle?.close().catch(() => null);
    await rm(temporary, { force: true }).catch(() => null);
  }
}

async function main(options = {}) {
  const file = options.heartbeatFile || heartbeatFile(options.args);
  await worker.main({
    ...options,
    log: options.workerLog || (() => {}),
  });
  await writeHeartbeat(file, options.now instanceof Date ? options.now : new Date());
  (options.log || console.log)("[notification-retry-receipt] completed");
}

if (require.main === module) {
  main().catch(() => { console.error("[notification-retry-receipt] failed"); process.exitCode = 1; });
}

module.exports = { heartbeatFile, main, writeHeartbeat };
