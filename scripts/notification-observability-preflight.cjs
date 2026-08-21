#!/usr/bin/env node
"use strict";

const { constants, accessSync, readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");

function canAccess(access, target, mode) {
  try { access(target, mode); return true; } catch { return false; }
}

function rootExists(lookupUser) {
  try { return lookupUser("root") === true; } catch { return false; }
}

function hasStateDirectoryContract(readUnit) {
  try {
    const source = readUnit("/root/releases/current/ops/systemd/hourkey-mobile-push-retry-receipts.service", "utf8");
    return /^User=root$/m.test(source) && /^Group=root$/m.test(source) && /^StateDirectory=hourkey-notification$/m.test(source);
  } catch {
    return false;
  }
}

function inspect(options = {}) {
  const env = options.env || process.env;
  const access = options.access || accessSync;
  const uid = options.uid || (() => process.getuid?.());
  const lookupUser = options.lookupUser || ((name) => {
    try { execFileSync("getent", ["passwd", name], { stdio: "ignore" }); return true; } catch { return false; }
  });
  const readUnit = options.readUnit || readFileSync;
  const runtimeRoot = uid() === 0 && rootExists(lookupUser);
  const nodeExecutable = canAccess(access, "/usr/bin/node", constants.X_OK);
  const releasePaths = [
    "/root/releases/current/scripts/notification-health.cjs",
    "/root/releases/current/scripts/notification-retry-receipt-runner.cjs",
    "/root/releases/current/src/lib/notification-scheduler-heartbeat.cjs",
    "/root/releases/current/scripts/mobile-yam-push-cron.cjs",
    "/root/releases/current/scripts/mobile-daily-fortune-push-cron.cjs",
    "/root/releases/current/scripts/mobile-auspicious-push-cron.cjs",
    "/root/releases/current/scripts/mobile-personal-reminders-cron.cjs",
    "/root/releases/current/scripts/mobile-monthly-report-push-cron.cjs",
    "/root/releases/current/scripts/mobile-network-morning-push-cron.cjs",
    "/root/releases/current/scripts/mobile-zibai-push-cron.cjs",
    "/root/releases/current/scripts/mobile-qimen-push-cron.cjs",
    "/root/releases/current/ops/systemd/hourkey-mobile-qimen-push.service",
  ];
  const releaseReadable = releasePaths.every((target) => canAccess(access, target, constants.R_OK));
  const environmentReadable = canAccess(access, "/etc/hourkey/hourkey.env", constants.R_OK);
  const credentialReadable = canAccess(access, env.FCM_SERVICE_ACCOUNT_PATH || "/root/secrets/hourkey-fcm-service-account.json", constants.R_OK);
  const stateReady = canAccess(access, "/var/lib/hourkey-notification", constants.W_OK);
  const stateCreatable = !stateReady && runtimeRoot
    && canAccess(access, "/var/lib", constants.W_OK) && hasStateDirectoryContract(readUnit);
  return {
    ok: runtimeRoot && nodeExecutable && releaseReadable && environmentReadable && credentialReadable
      && (stateReady || stateCreatable),
    runtimeRoot, nodeExecutable, releaseReadable, environmentReadable, credentialReadable, stateReady, stateCreatable,
  };
}

if (require.main === module) {
  const report = inspect();
  console.log(JSON.stringify(report));
  if (!report.ok) process.exitCode = 1;
}

module.exports = { hasStateDirectoryContract, inspect };
