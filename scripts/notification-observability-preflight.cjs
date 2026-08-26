#!/usr/bin/env node
"use strict";

const { constants, accessSync, readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const pg = require("pg");
const {
  inspectInstalledEnvironment, readInstalledEnvironment,
} = require("./derive-hourkey-notification-env.cjs");

function canAccess(access, target, mode) {
  try { access(target, mode); return true; } catch { return false; }
}

function rootExists(lookupUser) {
  try { return lookupUser("root") === true; } catch { return false; }
}

function defaultServiceUserAccess(name, target, mode) {
  const flag = mode === constants.X_OK ? "-x" : mode === constants.W_OK ? "-w" : "-r";
  try {
    execFileSync("runuser", ["-u", name, "--", "/usr/bin/test", flag, target], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasStateDirectoryContract(readUnit) {
  try {
    const source = readUnit("/root/releases/current/ops/tmpfiles.d/hourkey-notification.conf", "utf8");
    return /^d \/var\/lib\/hourkey-notification 0750 hourkey-notify hourkey-notify -$/m.test(source);
  } catch {
    return false;
  }
}

function emptyDatabaseProof() {
  return {
    databaseConnected: false, exactRuntimeRole: false, producerReadOnly: false,
    ziweiParentUpdate: false, ziweiAttemptUpdate: false,
    ziweiOccurrenceDeleteDenied: false, ziweiInstallationDeleteDenied: false,
    ziweiUserDeleteDenied: false, ziweiProfileDeleteDenied: false,
    ziweiPurgeExecutable: false, ziweiPurgeHardened: false,
    ziweiIntegrityTriggers: false,
  };
}

async function inspectDatabaseAccess(options = {}) {
  const environment = options.environment || readInstalledEnvironment();
  if (!environment || environment.PGUSER !== "hourkey_app") return emptyDatabaseProof();
  let client;
  try {
    if (options.connect) client = await options.connect(environment);
    else {
      client = new pg.Client({
        host: environment.PGHOST, port: Number(environment.PGPORT),
        database: environment.PGDATABASE, user: environment.PGUSER,
        password: environment.PGPASSWORD,
      });
      await client.connect();
    }
    const result = await client.query(
      `SELECT current_user='hourkey_app' AND session_user='hourkey_app' AS exact_runtime_role,
              has_table_privilege(current_user,'mobile_ziwei_hourly_producer_state','SELECT')
                AND NOT has_table_privilege(current_user,'mobile_ziwei_hourly_producer_state','UPDATE')
                AND NOT has_table_privilege(current_user,'mobile_ziwei_hourly_producer_state','INSERT')
                AND NOT has_table_privilege(current_user,'mobile_ziwei_hourly_producer_state','DELETE') AS producer_read_only,
              has_table_privilege(current_user,'mobile_push_log','UPDATE') AS ziwei_parent_update,
              has_table_privilege(current_user,'mobile_push_attempts','UPDATE') AS ziwei_attempt_update,
              NOT has_table_privilege(current_user,'mobile_ziwei_hourly_occurrences','DELETE')
                AS ziwei_occurrence_delete_denied,
              NOT has_table_privilege(current_user,'mobile_ziwei_hourly_installations','DELETE')
                AS ziwei_installation_delete_denied,
              NOT has_table_privilege(current_user,'public.users','DELETE')
                AS ziwei_user_delete_denied,
              NOT has_table_privilege(current_user,'public.profiles','DELETE')
                AS ziwei_profile_delete_denied,
              EXISTS(
                SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid=pg_catalog.to_regprocedure(
                   'public.purge_mobile_ziwei_hourly_occurrences(integer,integer)'
                 ) AND has_function_privilege(current_user,p.oid,'EXECUTE')
              ) AS ziwei_purge_executable,
              EXISTS(
                SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid=pg_catalog.to_regprocedure(
                   'public.purge_mobile_ziwei_hourly_occurrences(integer,integer)'
                 )
                   AND p.prosecdef=true
                   AND pg_catalog.pg_get_userbyid(p.proowner)<>current_user
                   AND p.proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
                   AND NOT EXISTS(
                     SELECT 1
                       FROM pg_catalog.aclexplode(
                         COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))
                       ) acl
                      WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
                   )
              ) AS ziwei_purge_hardened,
              (SELECT count(*)=4 FROM pg_catalog.pg_trigger t
                JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
               WHERE t.tgenabled='O' AND NOT t.tgisinternal AND (
                 (c.oid='mobile_ziwei_hourly_producer_state'::regclass
                   AND t.tgname='mobile_ziwei_hourly_producer_mutation_gate')
                 OR (c.oid='mobile_push_log'::regclass
                   AND t.tgname='mobile_ziwei_push_parent_integrity')
                 OR (c.oid='mobile_push_attempts'::regclass
                   AND t.tgname='mobile_ziwei_push_attempt_integrity')
                 OR (c.oid='mobile_ziwei_hourly_occurrences'::regclass
                   AND t.tgname='mobile_ziwei_hourly_occurrence_immutable')
               )) AS ziwei_integrity_triggers`,
    );
    const row = result.rows[0] || {};
    return {
      databaseConnected: true,
      exactRuntimeRole: row.exact_runtime_role === true,
      producerReadOnly: row.producer_read_only === true,
      ziweiParentUpdate: row.ziwei_parent_update === true,
      ziweiAttemptUpdate: row.ziwei_attempt_update === true,
      ziweiOccurrenceDeleteDenied: row.ziwei_occurrence_delete_denied === true,
      ziweiInstallationDeleteDenied: row.ziwei_installation_delete_denied === true,
      ziweiUserDeleteDenied: row.ziwei_user_delete_denied === true,
      ziweiProfileDeleteDenied: row.ziwei_profile_delete_denied === true,
      ziweiPurgeExecutable: row.ziwei_purge_executable === true,
      ziweiPurgeHardened: row.ziwei_purge_hardened === true,
      ziweiIntegrityTriggers: row.ziwei_integrity_triggers === true,
    };
  } catch {
    return emptyDatabaseProof();
  } finally {
    if (client?.end) await client.end().catch(() => undefined);
  }
}

function inspect(options = {}) {
  const env = options.env || process.env;
  const access = options.access || accessSync;
  const uid = options.uid || (() => process.getuid?.());
  const lookupUser = options.lookupUser || ((name) => {
    try { execFileSync("getent", ["passwd", name], { stdio: "ignore" }); return true; } catch { return false; }
  });
  const serviceUserAccess = options.serviceUserAccess || defaultServiceUserAccess;
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
    "/root/releases/current/scripts/mobile-ziwei-hourly-push-cron.mts",
    "/root/releases/current/scripts/derive-hourkey-notification-env.cjs",
    "/root/releases/current/ops/tmpfiles.d/hourkey-notification.conf",
    "/root/releases/current/ops/systemd/hourkey-mobile-qimen-push.service",
    "/root/releases/current/ops/systemd/hourkey-mobile-ziwei-hourly-push.service",
  ];
  const releaseReadable = releasePaths.every((target) => canAccess(access, target, constants.R_OK));
  const environmentReadable = canAccess(access, "/etc/hourkey/hourkey.env", constants.R_OK);
  const notificationEnvironmentReadable = canAccess(access, "/etc/hourkey/hourkey-notification.env", constants.R_OK);
  const notificationEnvironmentContract = options.notificationEnvironmentContract || inspectInstalledEnvironment;
  const notificationEnvironmentValid = notificationEnvironmentReadable
    && (() => { try { return notificationEnvironmentContract("/etc/hourkey/hourkey-notification.env") === true; } catch { return false; } })();
  const credentialReadable = canAccess(access, "/etc/hourkey/credentials/fcm-service-account.json", constants.R_OK);
  const stateReady = canAccess(access, "/var/lib/hourkey-notification", constants.W_OK);
  const stateCreatable = !stateReady && runtimeRoot
    && canAccess(access, "/var/lib", constants.W_OK) && hasStateDirectoryContract(readUnit);
  const ziweiServiceUser = rootExists((name) => name === "root" ? true : lookupUser(name))
    && (() => { try { return lookupUser("hourkey-notify") === true; } catch { return false; } })();
  const ziweiServicePaths = [
    ["/usr/bin/env", constants.X_OK],
    ["/usr/bin/node", constants.X_OK],
    ["/root/releases/current", constants.X_OK],
    ["/root/releases/current/scripts/mobile-ziwei-hourly-push-cron.mts", constants.R_OK],
    ["/root/releases/current/scripts/notification-retry-receipt-runner.cjs", constants.R_OK],
    ["/root/releases/current/scripts/notification-health.cjs", constants.R_OK],
    ["/etc/hourkey/credentials/fcm-service-account.json", constants.R_OK],
    ["/var/lib/hourkey-notification", constants.W_OK],
    ["/var/log/hourkey", constants.W_OK],
  ];
  const ziweiEnvironmentReadable = ziweiServiceUser && (() => {
    try { return serviceUserAccess("hourkey-notify", "/etc/hourkey/hourkey-notification.env", constants.R_OK) === true; }
    catch { return false; }
  })();
  const ziweiServiceAccess = ziweiEnvironmentReadable && ziweiServicePaths.every(([target, mode]) => {
    try { return serviceUserAccess("hourkey-notify", target, mode) === true; } catch { return false; }
  });
  return {
    ok: runtimeRoot && nodeExecutable && releaseReadable && environmentReadable
      && notificationEnvironmentReadable && notificationEnvironmentValid && credentialReadable
      && (stateReady || stateCreatable) && ziweiServiceUser && ziweiEnvironmentReadable && ziweiServiceAccess,
    runtimeRoot, nodeExecutable, releaseReadable, environmentReadable, notificationEnvironmentReadable,
    notificationEnvironmentValid, credentialReadable, stateReady, stateCreatable,
    ziweiServiceUser, ziweiEnvironmentReadable, ziweiServiceAccess,
  };
}

async function runPreflight(options = {}) {
  const filesystem = inspect(options);
  const database = await inspectDatabaseAccess(options.database || {});
  return {
    ...filesystem, ...database,
    ok: filesystem.ok && database.databaseConnected && database.exactRuntimeRole
      && database.producerReadOnly && database.ziweiParentUpdate && database.ziweiAttemptUpdate
      && database.ziweiOccurrenceDeleteDenied && database.ziweiInstallationDeleteDenied
      && database.ziweiUserDeleteDenied && database.ziweiProfileDeleteDenied
      && database.ziweiPurgeExecutable && database.ziweiPurgeHardened
      && database.ziweiIntegrityTriggers,
  };
}

if (require.main === module) {
  runPreflight().then((report) => {
    console.log(JSON.stringify(report));
    if (!report.ok) process.exitCode = 1;
  }).catch(() => {
    console.log(JSON.stringify({ ...inspect(), ...emptyDatabaseProof(), ok: false }));
    process.exitCode = 1;
  });
}

module.exports = { hasStateDirectoryContract, inspect, inspectDatabaseAccess, runPreflight };
