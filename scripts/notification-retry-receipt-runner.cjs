#!/usr/bin/env node
"use strict";

const { mkdir, writeFile } = require("node:fs/promises");
const { dirname } = require("node:path");
const worker = require("./mobile-push-retry-worker.cjs");

function heartbeatFile(args = process.argv.slice(2)) {
  const index = args.indexOf("--heartbeat-file");
  return index >= 0 ? args[index + 1] : process.env.NOTIFICATION_WORKER_HEARTBEAT_FILE;
}

async function writeHeartbeat(file, at = new Date()) {
  if (!file) throw new Error("heartbeat_file_required");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${at.toISOString()}\n`, { encoding: "utf8", mode: 0o640 });
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
