import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cli = require("./notification-retention.cjs");

assert.deepEqual(cli.parseArgs([]), {
  ok: true, sourceFactsDays: 30, attemptDays: 90, engagementDays: 90, historyDays: 180,
  securityHistoryDays: 365, batchSize: 500, maxBatches: 20,
}, "retention CLI has explicit conservative bounded defaults");
assert.equal(cli.parseArgs(["--history-days", "0"]).ok, false, "retention CLI rejects an unbounded/destructive zero-day history window");
assert.equal(cli.parseArgs(["--batch-size", "5001"]).ok, false, "retention CLI bounds each database batch");
assert.equal(cli.parseArgs(["--attempt-days", "30", "--engagement-days", "90"]).ok, false,
  "retention CLI cannot delete installation ownership before the engagement acceptance window ends");
assert.equal(cli.parseArgs(["--unknown", "private-value"]).ok, false, "retention CLI rejects unknown inputs before opening the database");

const logs: string[] = [];
const failed = await cli.main({
  args: ["--unknown", "private-value"],
  log: (line: string) => logs.push(line),
});
assert.deepEqual(failed, { ok: false, error: "invalid_arguments" });
assert.equal(logs.join("\n").includes("private-value"), false, "retention CLI never echoes rejected inputs");

const service = "ops/systemd/hourkey-mobile-notification-retention.service";
const timer = "ops/systemd/hourkey-mobile-notification-retention.timer";
const rotation = "ops/logrotate/hourkey-mobile-notification-retention";
const runbook = "docs/runbooks/notification-retention.md";
for (const file of [service, timer, rotation, runbook]) {
  const source = await readFile(file, "utf8");
  assert.doesNotMatch(source, /(?:systemctl\s+(?:enable|start|restart)|PGPASSWORD=|ExponentPushToken|authorization:)/iu, `${file} remains source-only and contains no live operation or credential material`);
}
const serviceSource = await readFile(service, "utf8");
assert.match(serviceSource, /^UMask=0027$/mu, "retention service creates no world-readable files");
assert.match(serviceSource, /^LogsDirectoryMode=0750$/mu, "retention log directory is restrictive");
assert.match(serviceSource, /notification-retention\.cjs/u, "retention service runs only the reviewed bounded runner");
assert.match(serviceSource, /--attempt-days 90 --engagement-days 90/u,
  "installed policy retains installation ownership throughout late engagement acceptance");
const rotationSource = await readFile(rotation, "utf8");
assert.match(rotationSource, /rotate 14/u, "retention logs have explicit bounded rotation");
assert.match(rotationSource, /create 0640 root root/u, "rotated aggregate logs remain restrictive");
execFileSync("systemd-analyze", ["verify", service, timer], { stdio: "pipe" });
console.log("NOTIFICATION_RETENTION_CLI_OK");
