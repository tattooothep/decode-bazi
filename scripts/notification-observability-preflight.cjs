#!/usr/bin/env node
"use strict";

const { constants, accessSync } = require("node:fs");
const { execFileSync } = require("node:child_process");

function canAccess(access, target, mode) {
  try { access(target, mode); return true; } catch { return false; }
}

function rootExists(lookupUser) {
  try { return lookupUser("root") === true; } catch { return false; }
}

function inspect(options = {}) {
  const env = options.env || process.env;
  const access = options.access || accessSync;
  const uid = options.uid || (() => process.getuid?.());
  const lookupUser = options.lookupUser || ((name) => {
    try { execFileSync("getent", ["passwd", name], { stdio: "ignore" }); return true; } catch { return false; }
  });
  const runtimeRoot = uid() === 0 && rootExists(lookupUser);
  const nodeExecutable = canAccess(access, "/usr/bin/node", constants.X_OK);
  const releaseReadable = canAccess(access, "/root/releases/current/scripts/notification-health.cjs", constants.R_OK)
    && canAccess(access, "/root/releases/current/scripts/notification-retry-receipt-runner.cjs", constants.R_OK);
  const environmentReadable = canAccess(access, "/etc/hourkey/hourkey.env", constants.R_OK);
  const credentialReadable = canAccess(access, env.FCM_SERVICE_ACCOUNT_PATH || "/root/secrets/hourkey-fcm-service-account.json", constants.R_OK);
  const stateWritable = canAccess(access, "/var/lib/hourkey-notification", constants.W_OK);
  return {
    ok: runtimeRoot && nodeExecutable && releaseReadable && environmentReadable && credentialReadable && stateWritable,
    runtimeRoot, nodeExecutable, releaseReadable, environmentReadable, credentialReadable, stateWritable,
  };
}

if (require.main === module) {
  const report = inspect();
  console.log(JSON.stringify(report));
  if (!report.ok) process.exitCode = 1;
}

module.exports = { inspect };
