import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), "notification-observability-"));

try {
  const health = require("./notification-health.cjs");
  const reconciliation = require("./notification-reconcile.cjs");
  const preflight = require("./notification-observability-preflight.cjs");
  const sourceRoot = join(directory,"source-release");
  await mkdir(join(sourceRoot,"docs/notification-science"),{ recursive: true });
  await mkdir(join(sourceRoot,"scripts"),{ recursive: true });
  await writeFile(join(sourceRoot,"app.txt"),"immutable application bytes\n");
  await writeFile(join(sourceRoot,"scripts/tool.sh"),"#!/bin/sh\nexit 0\n");
  await chmod(join(sourceRoot,"scripts/tool.sh"),0o755);
  await writeFile(join(sourceRoot,"docs/notification-science/qizheng-r8-release-evidence.json"),"unsigned\n");
  execFileSync("git",["init","-q"],{ cwd: sourceRoot });
  execFileSync("git",["add","."],{ cwd: sourceRoot });
  execFileSync("git",["-c","user.name=R8 Test","-c","user.email=r8@example.invalid","commit","-qm","fixture"],{ cwd: sourceRoot });
  const sourceCommit = execFileSync("git",["rev-parse","HEAD"],{ cwd: sourceRoot,encoding: "utf8" }).trim();
  const sourceDigest = preflight.computeInstalledSourceDigest(sourceRoot,sourceCommit,sourceRoot);
  assert.match(sourceDigest,/^[0-9a-f]{64}$/u);
  await writeFile(join(sourceRoot,"docs/notification-science/qizheng-r8-release-evidence.json"),"signed later\n");
  assert.equal(preflight.computeInstalledSourceDigest(sourceRoot,sourceCommit,sourceRoot),sourceDigest,
    "the exact post-application evidence path is the sole digest exception");
  await writeFile(join(sourceRoot,"scripts/untracked-runtime.cjs"),"throw new Error('unexpected')\n");
  assert.equal(preflight.computeInstalledSourceDigest(sourceRoot,sourceCommit,sourceRoot),null,
    "unexpected runtime-reachable source fails closed");
  await rm(join(sourceRoot,"scripts/untracked-runtime.cjs"));
  await rm(join(sourceRoot,"app.txt"));
  await symlink("scripts/tool.sh",join(sourceRoot,"app.txt"));
  assert.equal(preflight.computeInstalledSourceDigest(sourceRoot,sourceCommit,sourceRoot),null,
    "a tracked source path replaced by a symlink fails closed");
  await rm(join(sourceRoot,"app.txt"));
  await writeFile(join(sourceRoot,"app.txt"),"immutable application bytes\n");
  await chmod(join(sourceRoot,"scripts/tool.sh"),0o644);
  assert.equal(preflight.computeInstalledSourceDigest(sourceRoot,sourceCommit,sourceRoot),null,
    "tracked executable mode drift fails closed");

  const artifactRelease = join(directory,"artifact-release");
  const firstBuildId = "abcdefghijklmnopqrst";
  await mkdir(join(artifactRelease,".next/static",firstBuildId),{ recursive: true });
  await mkdir(join(artifactRelease,".next/node_modules"),{ recursive: true });
  await mkdir(join(artifactRelease,"node_modules/pg"),{ recursive: true });
  await mkdir(join(artifactRelease,"node_modules/sharp"),{ recursive: true });
  await writeFile(join(artifactRelease,".next/BUILD_ID"),firstBuildId);
  await writeFile(join(artifactRelease,".next/trace"),"nondeterministic trace A");
  await writeFile(join(artifactRelease,".next/trace-build"),"nondeterministic trace build A");
  await writeFile(join(artifactRelease,".next/static",firstBuildId,"manifest.txt"),`id=${firstBuildId}`);
  await writeFile(join(artifactRelease,"node_modules/pg/index.js"),"module.exports='pg';\n");
  await writeFile(join(artifactRelease,"node_modules/sharp/index.js"),"module.exports='sharp';\n");
  await symlink("../../node_modules/pg",join(artifactRelease,".next/node_modules/pg-fixture"));
  await symlink("../../node_modules/sharp",join(artifactRelease,".next/node_modules/sharp-fixture"));
  const firstArtifactDigest = preflight.computeBuildArtifactDigest(artifactRelease);
  const secondBuildId = "zyxwvutsrqponmlkjihg";
  await rename(join(artifactRelease,".next/static",firstBuildId),join(artifactRelease,".next/static",secondBuildId));
  await writeFile(join(artifactRelease,".next/BUILD_ID"),secondBuildId);
  await writeFile(join(artifactRelease,".next/trace"),"nondeterministic trace B");
  await writeFile(join(artifactRelease,".next/trace-build"),"nondeterministic trace build B");
  await writeFile(join(artifactRelease,".next/static",secondBuildId,"manifest.txt"),`id=${secondBuildId}`);
  assert.equal(preflight.computeBuildArtifactDigest(artifactRelease),firstArtifactDigest,
    "Next build ID and trace-only nondeterminism are normalized");
  await writeFile(join(artifactRelease,".next/static",secondBuildId,"manifest.txt"),"changed application output");
  assert.notEqual(preflight.computeBuildArtifactDigest(artifactRelease),firstArtifactDigest,
    "application output drift changes the signed build digest");
  await symlink("/etc",join(artifactRelease,".next/unsafe-link"));
  assert.throws(() => preflight.computeBuildArtifactDigest(artifactRelease),/unexpected build artifact symlink/u,
    "an arbitrary build artifact symlink fails closed");
  const legacyReleaseRoot = join(directory,"legacy-release");
  await mkdir(legacyReleaseRoot);
  const inspectLegacy = (options: Record<string, unknown>) => preflight.inspect({
    ...options, releaseRoot: legacyReleaseRoot,
  });
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
  const fixedNow = new Date("2026-09-04T08:00:00.000Z");
  const r8Db = (relation: string | null, row?: Record<string, unknown>) => ({
    calls: 0,
    async query() {
      this.calls += 1;
      return this.calls === 1 ? { rows: [{ relation }] } : { rows: row ? [row] : [] };
    },
  });
  assert.deepEqual(await health.readR8ShadowHealth(r8Db(null), { now: fixedNow }), {
    phase: "migration_not_applied", migrationApplied: false, available: false, ok: true, reasons: [],
    lastRunAt: null, lastCount: 0, providerSendEnabled: false, fresh: false,
    ageSeconds: null, future: false, futureSkewSeconds: 0,
  }, "R8 is neutral only before its migration exists");
  assert.deepEqual((await health.readR8ShadowHealth(r8Db("mobile_science_notification_producer_state"), { now: fixedNow })).reasons,
    ["r8_shadow_state_missing"], "an applied migration without the exact producer row fails closed");
  const freshR8 = await health.readR8ShadowHealth(r8Db("mobile_science_notification_producer_state", {
    last_shadow_run_at: new Date("2026-09-04T07:57:00.000Z"), last_shadow_count: 10000,
    provider_send_enabled: false,
  }), { now: fixedNow });
  assert.equal(freshR8.ok, true, "a fresh provider-free shadow heartbeat is healthy");
  assert.equal(freshR8.ageSeconds, 180);
  assert.deepEqual((await health.readR8ShadowHealth(r8Db("mobile_science_notification_producer_state", {
    last_shadow_run_at: null, provider_send_enabled: false,
  }), { now: fixedNow })).reasons, ["r8_shadow_heartbeat_missing"]);
  assert.deepEqual((await health.readR8ShadowHealth(r8Db("mobile_science_notification_producer_state", {
    last_shadow_run_at: new Date("2026-09-04T07:54:59.000Z"), provider_send_enabled: false,
  }), { now: fixedNow })).reasons, ["r8_shadow_heartbeat_stale"]);
  assert.deepEqual((await health.readR8ShadowHealth(r8Db("mobile_science_notification_producer_state", {
    last_shadow_run_at: new Date("2026-09-04T08:01:01.000Z"), provider_send_enabled: false,
  }), { now: fixedNow })).reasons, ["r8_shadow_heartbeat_future"]);
  assert.deepEqual((await health.readR8ShadowHealth(r8Db("mobile_science_notification_producer_state", {
    last_shadow_run_at: new Date("2026-09-04T07:59:00.000Z"), provider_send_enabled: true,
  }), { now: fixedNow })).reasons, ["r8_provider_send_enabled"]);
  assert.deepEqual((await health.readR8ShadowHealth({ async query() { throw new Error("private"); } }, { now: fixedNow })).reasons,
    ["r8_shadow_health_query_failed"], "an R8 health query error is never treated as migration-absent");
  const mergedHealth = await health.main({
    db: {}, args: [], env: {}, log: () => {},
    collectHealth: async () => ({ ok: false, reasons: ["ziwei_existing_failure"], metrics: { legacy: true } }),
    readR8ShadowHealth: async () => ({ ok: false, reasons: ["r8_shadow_heartbeat_stale"] }),
  });
  assert.equal(mergedHealth.ok, false);
  assert.deepEqual(mergedHealth.reasons, ["ziwei_existing_failure", "r8_shadow_heartbeat_stale"],
    "R8 health reasons merge with and never erase existing science failures");
  assert.equal(mergedHealth.metrics.legacy, true);
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
  const tmpfilesUnit = "ops/tmpfiles.d/hourkey-notification.conf";
  for (const file of [retryUnit, receiptTimer, healthUnit, healthTimer, "docs/runbooks/notification-observability.md"]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /(?:systemctl\s+(?:enable|start|restart|reload)|curl\s+.*push|ExponentPushToken|authorization:|PGPASSWORD=)/iu, `${file} is source-only and contains no live operation or credential material`);
  }
  assert.match(await readFile(retryUnit, "utf8"), /notification-retry-receipt-runner\.cjs.*--heartbeat-file/u, "retry unit routes work through the heartbeat runner");
  const retryRunnerSource = await readFile("scripts/notification-retry-receipt-runner.cjs", "utf8");
  assert.match(retryRunnerSource, /open\(temporary, "wx", 0o640\)[\s\S]*handle\.sync\(\)[\s\S]*rename\(temporary, file\)/u,
    "retry heartbeat uses a durable atomic inode replacement so a legacy root-owned file cannot stop the non-root worker");
  assert.doesNotMatch(retryRunnerSource, /writeFile\(file,/u,
    "retry heartbeat never truncates a pre-upgrade inode in place");
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
  const tmpfilesSource = await readFile(tmpfilesUnit, "utf8");
  assert.match(tmpfilesSource,
    /^d \/var\/lib\/hourkey-notification\/schedulers 0750 hourkey-notify hourkey-notify -$/mu,
    "tmpfiles migrates the shared scheduler-heartbeat directory to the effective health/producer account without rewriting heartbeat files");
  assert.match(tmpfilesSource,
    /^d \/var\/lib\/hourkey-notification 0750 hourkey-notify hourkey-notify -$/mu,
    "tmpfiles gives the retry worker atomic-replacement access to the shared state directory");
  assert.doesNotMatch(tmpfilesSource, /^Z\s+\/var\/lib\/hourkey-notification\b/mu,
    "tmpfiles never recursively changes ownership or mode of other notification heartbeat state");

  if (typeof process.getuid === "function" && process.getuid() === 0) {
    const upgradeDirectory = join(directory, "tmpfiles-upgrade");
    const schedulerDirectory = join(upgradeDirectory, "schedulers");
    const legacyRetryHeartbeat = join(upgradeDirectory, "retry-receipt.heartbeat");
    const upgradeConfig = join(directory, "hourkey-notification-upgrade.conf");
    const nobodyUid = Number(execFileSync("id", ["-u", "nobody"], { encoding: "utf8" }).trim());
    const nobodyGid = Number(execFileSync("id", ["-g", "nobody"], { encoding: "utf8" }).trim());
    await chmod(directory, 0o755);
    await mkdir(schedulerDirectory, { recursive: true });
    await writeFile(legacyRetryHeartbeat, "2026-08-16T00:00:00.000Z\n", { mode: 0o640 });
    await writeFile(upgradeConfig, [
      `d ${upgradeDirectory} 0750 ${nobodyUid} ${nobodyGid} -`,
      `d ${schedulerDirectory} 0750 ${nobodyUid} ${nobodyGid} -`,
      "",
    ].join("\n"), { mode: 0o600 });
    execFileSync("systemd-tmpfiles", ["--create", upgradeConfig], { stdio: "pipe" });
    const untouchedHeartbeat = await stat(legacyRetryHeartbeat);
    assert.equal(untouchedHeartbeat.uid, 0, "directory migration does not recursively mutate legacy heartbeat ownership");
    assert.equal(untouchedHeartbeat.gid, 0, "directory migration does not recursively mutate legacy heartbeat group");
    const child = [
      `const runner=require(${JSON.stringify(resolve("scripts/notification-retry-receipt-runner.cjs"))});`,
      `process.setgroups([${nobodyGid}]);process.setgid(${nobodyGid});process.setuid(${nobodyUid});`,
      `runner.writeHeartbeat(${JSON.stringify(legacyRetryHeartbeat)},new Date("2026-08-16T01:00:00.000Z"))`,
      `.catch(()=>{process.exitCode=1;});`,
    ].join("");
    execFileSync(process.execPath, ["-e", child], { stdio: "pipe" });
    const replacedHeartbeat = await stat(legacyRetryHeartbeat);
    assert.equal(replacedHeartbeat.uid, nobodyUid, "effective worker atomically replaces the pre-existing root-owned heartbeat inode");
    assert.equal(replacedHeartbeat.gid, nobodyGid, "replacement heartbeat belongs to the effective worker group");
    assert.equal(replacedHeartbeat.mode & 0o777, 0o640, "atomic replacement keeps the retry heartbeat restrictive");
    assert.equal(await readFile(legacyRetryHeartbeat, "utf8"), "2026-08-16T01:00:00.000Z\n");
    execFileSync("runuser", ["-u", "nobody", "--", "/usr/bin/test", "-x", schedulerDirectory], { stdio: "pipe" });
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
  const preflightReport = inspectLegacy({
    access: (target: string) => { if (target === stateDirectory) throw new Error("state-absent"); },
    lookupUser: () => true, uid: () => 0,
    serviceUserAccess: () => true,
    notificationEnvironmentContract: () => true,
    readUnit: () => [
      "d /var/lib/hourkey-notification 0750 hourkey-notify hourkey-notify -",
      "d /var/lib/hourkey-notification/schedulers 0750 hourkey-notify hourkey-notify -",
      "",
    ].join("\n"),
  });
  assert.deepEqual(preflightReport, { ok: true, runtimeRoot: true, nodeExecutable: true, releaseReadable: true, environmentReadable: true, notificationEnvironmentReadable: true, notificationEnvironmentValid: true, credentialReadable: true, stateReady: false, stateCreatable: true, ziweiServiceUser: true, ziweiEnvironmentReadable: true, retryHeartbeatAccess: true, schedulerHeartbeatAccess: true, ziweiServiceAccess: true }, "absent state tree passes first-start preflight only through the single-owner tmpfiles contract and effective Ziwei service-user access");
  const unsafeStatePreflight = inspectLegacy({
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
          ziwei_attempt_update: true, ziwei_parent_delete_guarded: true,
          ziwei_occurrence_delete_denied: true,
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
    ziweiParentUpdate: true, ziweiAttemptUpdate: true, ziweiParentDeleteGuarded: true,
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
  assert.match(databaseSql.join("\n"), /mobile_push_log[\s\S]+?DELETE[\s\S]+?mobile_ziwei_push_parent_integrity[\s\S]+?180 days/u,
    "preflight proves production's inherited parent DELETE remains behind the hardened Ziwei trigger");
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
  const incompleteSchedulerPreflight = inspectLegacy({
    access: (target: string) => { if (target.endsWith("mobile-monthly-report-push-cron.cjs")) throw new Error("missing-source"); },
    lookupUser: () => true, uid: () => 0, serviceUserAccess: () => true,
    notificationEnvironmentContract: () => true,
  });
  assert.equal(incompleteSchedulerPreflight.ok, false, "preflight fails closed when any named scheduler heartbeat producer is absent from the release");
  const blockedZiweiServiceUser = inspectLegacy({
    access: () => {}, lookupUser: () => true, uid: () => 0,
    serviceUserAccess: () => false, notificationEnvironmentContract: () => true,
  });
  assert.equal(blockedZiweiServiceUser.ok, false,
    "preflight fails closed when the effective non-root Ziwei worker cannot traverse/read/write its runtime paths");
  assert.equal(blockedZiweiServiceUser.ziweiEnvironmentReadable, false,
    "preflight separately reports that the effective Ziwei worker cannot read its dedicated environment");
  const blockedLegacyRetryHeartbeat = inspectLegacy({
    access: () => {}, lookupUser: () => true, uid: () => 0,
    serviceUserAccess: (_name: string, target: string, mode: number) =>
      !(target === "/var/lib/hourkey-notification" && mode === constants.X_OK),
    notificationEnvironmentContract: () => true,
  });
  assert.equal(blockedLegacyRetryHeartbeat.ok, false,
    "preflight blocks deployment when the effective retry worker cannot advance a pre-existing root-owned heartbeat");
  assert.equal(blockedLegacyRetryHeartbeat.retryHeartbeatAccess, false);
  const blockedSchedulerHeartbeats = inspectLegacy({
    access: () => {}, lookupUser: () => true, uid: () => 0,
    serviceUserAccess: (_name: string, target: string, mode: number) =>
      !(target === "/var/lib/hourkey-notification/schedulers" && mode === constants.X_OK),
    notificationEnvironmentContract: () => true,
  });
  assert.equal(blockedSchedulerHeartbeats.ok, false,
    "preflight blocks deployment when the effective health worker cannot stat legacy scheduler heartbeats");
  assert.equal(blockedSchedulerHeartbeats.schedulerHeartbeatAccess, false);
  const invalidDedicatedEnvironment = inspectLegacy({
    access: () => {}, lookupUser: () => true, uid: () => 0, serviceUserAccess: () => true,
    notificationEnvironmentContract: () => false,
  });
  assert.equal(invalidDedicatedEnvironment.ok, false,
    "preflight fails closed on a dedicated environment owner/mode/key/value contract mismatch");
  assert.equal(invalidDedicatedEnvironment.notificationEnvironmentValid, false);
  const blockedPreflight = inspectLegacy({
    access: () => { throw new Error("private-path"); }, lookupUser: () => false, uid: () => 99,
  });
  assert.equal(blockedPreflight.ok, false, "preflight fails closed when executable or credential access is unavailable");
  assert.equal(JSON.stringify(blockedPreflight).includes("private-path"), false, "preflight never serializes filesystem exception content");
  assert.equal(inspectLegacy({ access: () => {}, uid: () => 0 }).runtimeRoot, true, "preflight independently verifies the template root account exists on this host");

  const r8ReleaseRoot = join(directory,"r8-release");
  await mkdir(join(r8ReleaseRoot,"migrations"), { recursive: true });
  await mkdir(join(r8ReleaseRoot,"docs/notification-science"), { recursive: true });
  await writeFile(join(r8ReleaseRoot,"migrations/20260904_mobile_science_notifications_r8.sql"), "-- candidate\n");
  const canonical = (value: any): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  };
  const r8Bundle = {
    releaseMode: "hard_off",
    backend: {
      applicationCommit: "a".repeat(40), applicationTree: "b".repeat(40),
      sourceDigest: "1".repeat(64), runtimeDigest: "c".repeat(64), buildArtifactDigest: "d".repeat(64),
    },
    science: {
      modelDigest: "e".repeat(64), sourceDigest: "f".repeat(64),
      databaseSchemaDigest: createHash("sha256").update("[]").digest("hex"),
      astronomyFact: { providerSendEnabled: false },
      qizheng: { providerSendEnabled: false, payloadSchema: 0, sourceStatus: "pending_double_verification" },
    },
    providerAttempts: 0,
    activationBoundary: { requiredProductionRolloutOrder: "migration_then_application" },
  };
  const r8Evidence = {
    schema: 1, bundle: r8Bundle,
    bundleDigest: createHash("sha256").update(canonical(r8Bundle)).digest("hex"), signatures: [],
  };
  const r8EvidencePath = join(r8ReleaseRoot,"docs/notification-science/qizheng-r8-release-evidence.json");
  await writeFile(r8EvidencePath, `${JSON.stringify(r8Evidence)}\n`);
  await writeFile(join(r8ReleaseRoot,".release-commit"), `${r8Bundle.backend.applicationCommit}\n`);
  const r8FsOptions = {
    releaseRoot: r8ReleaseRoot, r8EvidencePath,
    r8EvidenceOptions: { requireSignatures: false },
    access: () => {}, lookupUser: () => true, uid: () => 0, serviceUserAccess: () => true,
    notificationEnvironmentContract: () => true,
    resolveCommitTree: () => r8Bundle.backend.applicationTree,
    computeInstalledSourceDigest: () => r8Bundle.backend.sourceDigest,
    computeRuntimeDigest: () => r8Bundle.backend.runtimeDigest,
    computeBuildArtifactDigest: () => r8Bundle.backend.buildArtifactDigest,
  };
  const r8Candidate = preflight.inspect(r8FsOptions);
  assert.equal(r8Candidate.ok, true);
  assert.equal(r8Candidate.r8Phase, "migration_required",
    "a matching candidate still declares migration-before-application until live database proof runs");
  assert.equal(r8Candidate.r8ReleaseCommitMatches, true);
  assert.equal(preflight.inspect({ ...r8FsOptions, resolveCommitTree: () => "0".repeat(40) }).r8Phase,
    "release_mismatch", "a wrong application tree fails closed");
  assert.deepEqual(preflight.inspect({
    ...r8FsOptions, computeBuildArtifactDigest: () => "0".repeat(64),
  }).r8Reasons, ["r8_build_artifact_digest_mismatch"]);
  const missingMigrationArtifact = preflight.inspect({
    ...r8FsOptions,
    pathExists: (target: string) => !target.endsWith("20260904_mobile_science_notifications_r8.sql")
      && (target === r8EvidencePath || target.endsWith("mobile-astronomy-fact-shadow-cron.mts")),
  });
  assert.equal(missingMigrationArtifact.r8Required,true,
    "R8 evidence or runtime code still activates preflight when the migration artifact is missing");
  assert.deepEqual(missingMigrationArtifact.r8Reasons,["r8_migration_artifact_missing"]);
  const alternateR8RuntimeSignal = preflight.inspect({
    ...r8FsOptions,
    pathExists: (target: string) => target.endsWith("src/app/api/mobile/v1/astronomy-facts/route.ts"),
  });
  assert.equal(alternateR8RuntimeSignal.r8Required,true,
    "any R8-exclusive runtime artifact activates fail-closed release and database proof");
  assert.equal(alternateR8RuntimeSignal.r8Phase,"release_mismatch");
  assert.ok(alternateR8RuntimeSignal.r8Reasons.includes("r8_migration_artifact_missing"));

  const legacyRow = {
    exact_runtime_role: true, producer_read_only: true, ziwei_parent_update: true,
    ziwei_attempt_update: true, ziwei_parent_delete_guarded: true,
    ziwei_occurrence_delete_denied: true, ziwei_installation_delete_denied: true,
    ziwei_user_delete_denied: true, ziwei_profile_delete_denied: true,
    ziwei_purge_executable: true, ziwei_purge_hardened: true, ziwei_integrity_triggers: true,
  };
  const validR8Row = {
    r8_schema_complete: true, r8_producer_rows_exact: true, r8_source_digests_match: true,
    r8_hard_off: true, r8_runtime_tables_read_only: true, r8_public_mutation_denied: true,
    r8_scoped_functions_executable: true, r8_scoped_functions_hardened: true,
  };
  const r8Database = (r8Row: Record<string, boolean>, relations = true, legacy = legacyRow) => ({
    environment: { PGHOST: "db", PGPORT: "5432", PGDATABASE: "hourkey", PGUSER: "hourkey_app", PGPASSWORD: "private" },
    connect: async () => ({
      async query(sql: string) {
        if (/^(?:BEGIN|COMMIT|ROLLBACK)/u.test(sql)) return { rows: [] };
        if (sql.includes("current_user='hourkey_app'")) return { rows: [legacy] };
        if (sql.includes("unnest($1::text[])")) return { rows: relations
          ? Array.from({ length: 6 }, (_, index) => ({ name: `r8-${index}`, relation: `r8-${index}` })) : [] };
        if (sql.includes("WITH required_columns")) return { rows: [r8Row] };
        if (sql.includes("SELECT 'column'::text AS kind")) return { rows: [] };
        throw new Error("unexpected preflight SQL");
      },
      async end() {},
    }),
  });
  const readyR8 = await preflight.runPreflight({ ...r8FsOptions, database: r8Database(validR8Row) });
  assert.equal(readyR8.ok, true);
  assert.equal(readyR8.r8Phase, "application_ready");
  assert.deepEqual(readyR8.r8Reasons, []);
  const missingMigrationR8 = await preflight.runPreflight({
    ...r8FsOptions, database: r8Database(validR8Row,false),
  });
  assert.equal(missingMigrationR8.ok, false);
  assert.deepEqual(missingMigrationR8.r8Reasons, ["r8_migration_not_applied_before_application"]);
  const invalidSchemaR8 = await preflight.runPreflight({
    ...r8FsOptions, database: r8Database({ ...validR8Row, r8_schema_complete: false }),
  });
  assert.deepEqual(invalidSchemaR8.r8Reasons, ["r8_schema_incomplete"]);
  const invalidSourceR8 = await preflight.runPreflight({
    ...r8FsOptions, database: r8Database({ ...validR8Row, r8_source_digests_match: false }),
  });
  assert.deepEqual(invalidSourceR8.r8Reasons, ["r8_source_digest_mismatch"]);
  const unsafeR8 = await preflight.runPreflight({
    ...r8FsOptions, database: r8Database({
      ...validR8Row, r8_hard_off: false, r8_public_mutation_denied: false,
    }),
  });
  assert.deepEqual(unsafeR8.r8Reasons, ["r8_hard_off_violation","r8_least_privilege_violation"]);
  const brokenLegacyR8 = await preflight.runPreflight({
    ...r8FsOptions, database: r8Database(validR8Row,true,{ ...legacyRow, ziwei_integrity_triggers: false }),
  });
  assert.equal(brokenLegacyR8.ok, false,
    "complete R8 proof never overrides an existing Ziwei preflight failure");
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
