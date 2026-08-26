import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cli = require("./notification-retention.cjs");

assert.deepEqual(cli.parseArgs([]), {
  ok: true, sourceFactsDays: 30, attemptDays: 90, engagementDays: 90, historyDays: 180,
  securityHistoryDays: 365, ziweiOccurrenceDays: 30, batchSize: 500, maxBatches: 20,
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
const ziweiRetentionMigration = "migrations/20260826_mobile_ziwei_occurrence_retention.sql";
for (const file of [service, timer, rotation, runbook]) {
  const source = await readFile(file, "utf8");
  assert.doesNotMatch(source, /(?:systemctl\s+(?:enable|start|restart)|PGPASSWORD=|ExponentPushToken|authorization:)/iu, `${file} remains source-only and contains no live operation or credential material`);
}
const serviceSource = await readFile(service, "utf8");
assert.match(serviceSource, /^User=hourkey-notify$/mu, "retention runs as the dedicated unprivileged notification account");
assert.match(serviceSource, /^Group=hourkey-notify$/mu, "retention receives only the notification runtime group");
assert.match(serviceSource, /^UMask=0027$/mu, "retention service creates no world-readable files");
assert.match(serviceSource, /^LogsDirectory=hourkey$/mu, "systemd owns retention's bounded log directory lifecycle");
assert.match(serviceSource, /^LogsDirectoryMode=0750$/mu, "retention log directory is restrictive");
assert.match(serviceSource, /notification-retention\.cjs/u, "retention service runs only the reviewed bounded runner");
assert.match(serviceSource, /--attempt-days 90 --engagement-days 90/u,
  "installed policy retains installation ownership throughout late engagement acceptance");
assert.match(serviceSource, /--ziwei-occurrence-days 30/u,
  "installed policy makes the personal Ziwei snapshot window explicit");
assert.match(serviceSource, /^EnvironmentFile=\/etc\/hourkey\/hourkey-notification\.env$/mu,
  "retention uses the same least-secret PostgreSQL environment");
const runbookSource = await readFile(runbook, "utf8");
assert.match(runbookSource, /Ziwei[\s\S]+30 days[\s\S]+claimed[\s\S]+skipped/iu,
  "the runbook records the bounded unlinked Ziwei snapshot policy");
assert.match(runbookSource, /hourkey_app[\s\S]+no direct `DELETE`[\s\S]+SECURITY DEFINER/iu,
  "the runbook records the database-enforced least-privilege boundary");
const ziweiRetentionMigrationSource = await readFile(ziweiRetentionMigration, "utf8");
assert.doesNotMatch(ziweiRetentionMigrationSource, /GRANT DELETE ON (?:TABLE )?mobile_ziwei_hourly_occurrences TO hourkey_app/u,
  "the shared runtime role never receives unbounded occurrence DELETE");
assert.match(ziweiRetentionMigrationSource, /REVOKE DELETE ON (?:TABLE )?mobile_ziwei_hourly_occurrences FROM PUBLIC\s*,\s*hourkey_app/u,
  "the migration repairs any prior direct-delete grant before enabling bounded retention");
assert.match(ziweiRetentionMigrationSource, /REVOKE DELETE ON (?:TABLE )?mobile_ziwei_hourly_installations FROM PUBLIC\s*,\s*hourkey_app/u,
  "the repair also closes the installation cascade path into occurrence deletion");
assert.match(ziweiRetentionMigrationSource, /SECURITY DEFINER/u,
  "Ziwei occurrence retention crosses the privilege boundary only through a reviewed definer function");
assert.match(ziweiRetentionMigrationSource, /SET search_path\s*=\s*pg_catalog\s*,\s*public/u,
  "the definer function pins trusted relation resolution");
assert.match(ziweiRetentionMigrationSource, /GRANT EXECUTE ON FUNCTION public\.purge_mobile_ziwei_hourly_occurrences\(integer,integer\) TO hourkey_app/u,
  "the runtime role receives only the bounded purge capability");
assert.doesNotMatch(ziweiRetentionMigrationSource, /mobile_ziwei_hourly_producer_state/u,
  "the retention migration does not broaden producer-control privileges");
const rotationSource = await readFile(rotation, "utf8");
assert.match(rotationSource, /rotate 14/u, "retention logs have explicit bounded rotation");
assert.match(rotationSource, /create 0640 hourkey-notify hourkey-notify/u, "rotated aggregate logs remain restrictive and writable only by the dedicated runtime");
execFileSync("systemd-analyze", ["verify", service, timer], { stdio: "pipe" });
console.log("NOTIFICATION_RETENTION_CLI_OK");
