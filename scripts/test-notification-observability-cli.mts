import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, readFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), "notification-observability-"));

try {
  const health = require("./notification-health.cjs");
  const reconciliation = require("./notification-reconcile.cjs");
  const preflight = require("./notification-observability-preflight.cjs");
  const runner = require("./notification-retry-receipt-runner.cjs");
  const heartbeat = join(directory, "retry.heartbeat");
  assert.equal(health.providerReadiness({ FCM_SERVICE_ACCOUNT_PATH: join(directory, "missing-service-account.json") }).fcm, false, "a routed FCM provider without a readable credential is unhealthy without printing its path");
  assert.equal(health.providerReadiness({}).expo, false,
    "CLI health reports Expo unready unless iOS delivery readiness is explicit");
  assert.equal(health.providerReadiness({ EXPO_IOS_PUSH_READY: "true" }).expo, true,
    "CLI health reflects the exact reviewed Expo iOS readiness flag");
  let healthInput: Record<string, any> | undefined;
  await health.main({
    db: {}, args: [], env: {}, log: () => {},
    collectHealth: async (_db: unknown, input: Record<string, any>) => {
      healthInput = input;
      return { ok: true, reasons: [], metrics: {} };
    },
  });
  assert.equal(healthInput?.ziweiRuntime?.producerEnabled, false,
    "CLI health passes the fail-closed Ziwei runtime producer gate");
  assert.equal(typeof healthInput?.ziweiRuntime?.sourceReady, "boolean",
    "CLI health passes verified Ziwei source readiness");
  await runner.writeHeartbeat(heartbeat, new Date("2026-08-16T00:00:00.000Z"));
  assert.equal(await readFile(heartbeat, "utf8"), "2026-08-16T00:00:00.000Z\n", "retry runner heartbeat contains only a timestamp");
  await utimes(heartbeat, new Date("2026-08-16T00:00:00.000Z"), new Date("2026-08-16T00:00:00.000Z"));
  assert.equal(health.readHeartbeat(heartbeat), "2026-08-16T00:00:00.000Z", "health reads heartbeat freshness from file metadata rather than contents");
  assert.equal(health.readHeartbeat(join(directory, "missing")), null, "missing heartbeat remains unhealthy rather than being treated as fresh");
  const failingProcess: { exitCode?: number } = {};
  await reconciliation.runCli({ execute: async () => ({ ok: false, counts: { parentTruthMismatch: 1 } }), processRef: failingProcess });
  assert.equal(failingProcess.exitCode, 1, "reconciliation CLI exits nonzero when any invariant remains unresolved");
  const passingProcess: { exitCode?: number } = {};
  await reconciliation.runCli({ execute: async () => ({ ok: true, counts: {} }), processRef: passingProcess });
  assert.equal(passingProcess.exitCode, 0, "reconciliation CLI exits zero only when every invariant count is zero");
  assert.deepEqual(reconciliation.parseArgs(["--lookback-hours", "private-window-value"]), { ok: false, error: "invalid_arguments" }, "reconciliation rejects the obsolete no-op lookback argument without echoing it");
  const argumentLogs: string[] = [];
  const argumentReport = await reconciliation.main({ args: ["--unrecognized", "private-window-value"], log: (line: string) => argumentLogs.push(line) });
  assert.deepEqual(argumentReport, { ok: false, error: "invalid_arguments" }, "reconciliation CLI fails closed before opening a database for unknown arguments");
  assert.equal(argumentLogs.join("\n").includes("private-window-value"), false, "reconciliation CLI never echoes rejected arguments");

  const retryUnit = "ops/systemd/hourkey-mobile-push-retry-receipts.service";
  const receiptTimer = "ops/systemd/hourkey-mobile-push-retry-receipts.timer";
  const healthUnit = "ops/systemd/hourkey-mobile-push-health.service";
  const healthTimer = "ops/systemd/hourkey-mobile-push-health.timer";
  const retentionUnit = "ops/systemd/hourkey-mobile-notification-retention.service";
  for (const file of [retryUnit, receiptTimer, healthUnit, healthTimer, "docs/runbooks/notification-observability.md"]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /(?:systemctl\s+(?:enable|start|restart|reload)|curl\s+.*push|ExponentPushToken|authorization:|PGPASSWORD=)/iu, `${file} is source-only and contains no live operation or credential material`);
  }
  assert.match(await readFile(retryUnit, "utf8"), /notification-retry-receipt-runner\.cjs.*--heartbeat-file/u, "retry unit routes work through the heartbeat runner");
  assert.match(await readFile(receiptTimer, "utf8"), /OnUnitActiveSec=1min/u, "retry/receipt timer has a bounded cadence");
  assert.match(await readFile(healthUnit, "utf8"), /notification-health\.cjs.*--worker-heartbeat-file/u, "health unit fails closed on the retry heartbeat input");
  assert.match(await readFile(healthUnit, "utf8"), /--scheduler-heartbeat-dir \/var\/lib\/hourkey-notification\/schedulers/u, "health unit reads every source-produced scheduler heartbeat file");
  assert.match(await readFile(healthTimer, "utf8"), /OnUnitActiveSec=1min/u, "health timer has a bounded cadence");
  for (const file of [retryUnit, healthUnit, retentionUnit]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /^EnvironmentFile=\/etc\/hourkey\/hourkey-notification\.env$/mu,
      `${file} loads the required dedicated notification environment`);
    assert.doesNotMatch(source, /^EnvironmentFile=-?\/etc\/hourkey\/hourkey\.env$/mu,
      `${file} does not receive the shared application environment`);
  }
  for (const file of [retryUnit, healthUnit]) {
    assert.match(await readFile(file, "utf8"), /^ExecStart=\/usr\/bin\/env FCM_SERVICE_ACCOUNT_PATH=\/etc\/hourkey\/credentials\/fcm-service-account\.json /mu,
      `${file} forces the reviewed FCM credential path`);
  }
  for (const file of [retryUnit, healthUnit]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /^User=hourkey-notify$/mu, `${file} uses the dedicated notification account`);
    assert.match(source, /^Group=hourkey-notify$/mu, `${file} uses the dedicated notification group`);
    assert.doesNotMatch(source, /^(?:User|Group)=root$/mu, `${file} has no root provider runtime`);
    assert.match(source, /^CapabilityBoundingSet=$/mu, `${file} receives no Linux capabilities`);
    assert.match(source, /^ProtectProc=invisible$/mu, `${file} cannot inspect unrelated process metadata`);
    assert.doesNotMatch(source, /^StateDirectory=/mu,
      `${file} must not recursively change ownership of the shared tmpfiles-owned state tree`);
  }
  assert.match(execFileSync("getent", ["passwd", "root"], { encoding: "utf8" }), /^root:/mu, "template runtime account exists on the reviewed host");
  accessSync("/usr/bin/node", constants.X_OK);
  const stateDirectory = "/var/lib/hourkey-notification";
  const preflightReport = preflight.inspect({
    access: (target: string) => { if (target === stateDirectory) throw new Error("state-absent"); },
    lookupUser: () => true, uid: () => 0,
    serviceUserAccess: () => true,
    notificationEnvironmentContract: () => true,
    readUnit: () => "d /var/lib/hourkey-notification 0750 hourkey-notify hourkey-notify -\n",
  });
  assert.deepEqual(preflightReport, { ok: true, runtimeRoot: true, nodeExecutable: true, releaseReadable: true, environmentReadable: true, notificationEnvironmentReadable: true, notificationEnvironmentValid: true, credentialReadable: true, stateReady: false, stateCreatable: true, ziweiServiceUser: true, ziweiEnvironmentReadable: true, ziweiServiceAccess: true }, "absent state tree passes first-start preflight only through the single-owner tmpfiles contract and effective Ziwei service-user access");
  const unsafeStatePreflight = preflight.inspect({
    access: (target: string) => { if (target === stateDirectory) throw new Error("state-absent"); },
    lookupUser: () => true, uid: () => 0, serviceUserAccess: () => true,
    notificationEnvironmentContract: () => true, readUnit: () => "d /var/lib/hourkey-notification 0750 root root -\n",
  });
  assert.equal(unsafeStatePreflight.ok, false, "absent state tree fails closed without the reviewed single-owner tmpfiles contract");

  const databaseProof = await preflight.inspectDatabaseAccess({
    environment: { PGHOST: "db", PGPORT: "5432", PGDATABASE: "hourkey", PGUSER: "hourkey_app", PGPASSWORD: "private" },
    connect: async () => ({
      async query() {
        return { rows: [{
          exact_runtime_role: true, producer_read_only: true, ziwei_parent_update: true,
          ziwei_attempt_update: true, ziwei_occurrence_delete_denied: true,
          ziwei_installation_delete_denied: true, ziwei_user_delete_denied: true,
          ziwei_profile_delete_denied: true, ziwei_purge_executable: true,
          ziwei_purge_hardened: true, ziwei_integrity_triggers: true,
        }] };
      },
      async end() {},
    }),
  });
  assert.deepEqual(databaseProof, {
    databaseConnected: true, exactRuntimeRole: true, producerReadOnly: true,
    ziweiParentUpdate: true, ziweiAttemptUpdate: true,
    ziweiOccurrenceDeleteDenied: true, ziweiInstallationDeleteDenied: true,
    ziweiUserDeleteDenied: true, ziweiProfileDeleteDenied: true,
    ziweiPurgeExecutable: true, ziweiPurgeHardened: true,
    ziweiIntegrityTriggers: true,
  }, "preflight proves current_user and effective Ziwei privileges through the dedicated connection");
  const databaseSql: string[] = [];
  await preflight.inspectDatabaseAccess({
    environment: { PGHOST: "db", PGPORT: "5432", PGDATABASE: "hourkey", PGUSER: "hourkey_app", PGPASSWORD: "private" },
    connect: async () => ({
      async query(sql: string) {
        databaseSql.push(sql);
        return { rows: [{}] };
      },
      async end() {},
    }),
  });
  assert.match(databaseSql.join("\n"), /mobile_ziwei_hourly_occurrences[\s\S]+?DELETE/u,
    "preflight queries effective occurrence DELETE denial");
  assert.match(databaseSql.join("\n"), /mobile_ziwei_hourly_installations[\s\S]+?DELETE/u,
    "preflight queries the installation cascade boundary");
  assert.match(databaseSql.join("\n"), /public\.users[\s\S]+?DELETE/u,
    "preflight queries the user parent cascade boundary");
  assert.match(databaseSql.join("\n"), /public\.profiles[\s\S]+?DELETE/u,
    "preflight queries the profile parent cascade boundary");
  assert.match(databaseSql.join("\n"), /purge_mobile_ziwei_hourly_occurrences[\s\S]+?prosecdef[\s\S]+?proowner[\s\S]+?proconfig/u,
    "preflight verifies executable definer ownership and pinned search path from pg_catalog");
  assert.match(databaseSql.join("\n"), /mobile_ziwei_hourly_occurrence_immutable/u,
    "preflight requires the occurrence immutability trigger in addition to parent and attempt gates");
  const wrongDatabaseRole = await preflight.inspectDatabaseAccess({
    environment: { PGHOST: "db", PGPORT: "5432", PGDATABASE: "hourkey", PGUSER: "decode_user", PGPASSWORD: "private" },
    connect: async () => { throw new Error("must not connect"); },
  });
  assert.equal(wrongDatabaseRole.databaseConnected, false,
    "preflight rejects a non-hourkey_app PGUSER before attempting a database connection");
  const incompleteSchedulerPreflight = preflight.inspect({
    access: (target: string) => { if (target.endsWith("mobile-monthly-report-push-cron.cjs")) throw new Error("missing-source"); },
    lookupUser: () => true, uid: () => 0, serviceUserAccess: () => true,
    notificationEnvironmentContract: () => true,
  });
  assert.equal(incompleteSchedulerPreflight.ok, false, "preflight fails closed when any named scheduler heartbeat producer is absent from the release");
  const blockedZiweiServiceUser = preflight.inspect({
    access: () => {}, lookupUser: () => true, uid: () => 0,
    serviceUserAccess: () => false, notificationEnvironmentContract: () => true,
  });
  assert.equal(blockedZiweiServiceUser.ok, false,
    "preflight fails closed when the effective non-root Ziwei worker cannot traverse/read/write its runtime paths");
  assert.equal(blockedZiweiServiceUser.ziweiEnvironmentReadable, false,
    "preflight separately reports that the effective Ziwei worker cannot read its dedicated environment");
  const invalidDedicatedEnvironment = preflight.inspect({
    access: () => {}, lookupUser: () => true, uid: () => 0, serviceUserAccess: () => true,
    notificationEnvironmentContract: () => false,
  });
  assert.equal(invalidDedicatedEnvironment.ok, false,
    "preflight fails closed on a dedicated environment owner/mode/key/value contract mismatch");
  assert.equal(invalidDedicatedEnvironment.notificationEnvironmentValid, false);
  const blockedPreflight = preflight.inspect({
    access: () => { throw new Error("private-path"); }, lookupUser: () => false, uid: () => 99,
  });
  assert.equal(blockedPreflight.ok, false, "preflight fails closed when executable or credential access is unavailable");
  assert.equal(JSON.stringify(blockedPreflight).includes("private-path"), false, "preflight never serializes filesystem exception content");
  assert.equal(preflight.inspect({ access: () => {}, uid: () => 0 }).runtimeRoot, true, "preflight independently verifies the template root account exists on this host");
  execFileSync("systemd-analyze", ["verify", retryUnit, receiptTimer, healthUnit, healthTimer], { stdio: "pipe" });
  const runbook = await readFile("docs/runbooks/notification-observability.md", "utf8");
  assert.match(runbook, /retry.*health[\s\S]+hourkey-notify/isu,
    "runbook records the dedicated retry and health runtime boundary");
  assert.match(runbook, /notification-observability-preflight\.cjs/u, "runbook requires source-only executable and credential-access preflight");
  assert.match(runbook, /\/api\/internal\/health\/notifications/u, "runbook documents the authenticated internal health endpoint");
  assert.match(runbook, /notification-reconcile\.cjs.*rejects.*--lookback-hours/isu, "runbook documents that reconciliation rejects its obsolete no-op lookback argument");
  assert.match(runbook, /source file or template is not evidence.*installed or live/isu, "runbook does not claim scheduler liveness merely because source wiring exists");
  console.log("NOTIFICATION_OBSERVABILITY_CLI_OK");
} finally {
  await rm(directory, { recursive: true, force: true });
}
