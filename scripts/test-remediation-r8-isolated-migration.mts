/**
 * Opt-in execution of the ORIGINAL pinned R8 migration test in a new disposable
 * PostgreSQL cluster. Default/--self-test is pure: fake executors, no Docker.
 *
 * Run only after independent review:
 *   node --experimental-strip-types scripts/test-remediation-r8-isolated-migration.mts \
 *     --run --receipt /canonical/private/external/directory/new-receipt.json
 *
 * This is NOT a production migration, deployment, or release-readiness gate.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync as hostExecFileSync } from "node:child_process";
import { readFileSync, realpathSync, lstatSync, statSync, openSync, writeFileSync, fsyncSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Script } from "node:vm";
import ts from "typescript";

type ExecOptions = { encoding: string; input: string; stdio: string[] };
type SqlExecutor = (database: string, sql: string) => string;
type DockerExecutor = (args: string[], input?: string) => string;
const ROOT = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const SELF = "scripts/test-remediation-r8-isolated-migration.mts";
const ORIGINAL = "scripts/test-mobile-science-notifications-r8-migration.mts";
const FORWARD = "migrations/20260904_mobile_science_notifications_r8.sql";
const ROLLBACK = "migrations/20260904_mobile_science_notifications_r8.rollback.sql";
const MODEL = "src/lib/astro/astronomy-fact-model-attestation.ts";
const PINS: Record<string, string> = Object.freeze({
  [ORIGINAL]: "bc4983b1cd5daeffedefa93ffa1a2592c26ee6a622031ebb72ba4ba23cfce558",
  [FORWARD]: "894e1b7b1bef020eb256f65cfbf8e3309c73bd007973921695f66ba6cebdc571",
  [ROLLBACK]: "f05ab1cf1e5ed6404d9ad89d665934e1915e7ac9d7f419a7dae1d5abd048852f",
  [MODEL]: "7496bc1d7ab092dabdd1549854c9be91df4febf4ddf52c60cca3f5be90caecdc",
});
const IMAGE = "sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50";
const LABEL = "org.hourkey.r8-isolated-migration.owner";
const sha256 = (value: string | Buffer): string => crypto.createHash("sha256").update(value).digest("hex");
class Failure extends Error {
  constructor(code: string) { super(code); this.name = "R8IsolatedFailure"; }
}
class SqlFailure extends Failure {
  status: number | null;
  sqlstate: string | null;
  constructor(status: number | null, sqlstate: string | null) {
    super(`sql_execution_failed:${status ?? "none"}:${sqlstate ?? "none"}`);
    this.status = status; this.sqlstate = sqlstate;
  }
}
function requireCondition(value: unknown, code: string): asserts value {
  if (!value) throw new Failure(code);
}
function loadPinned(): Record<string, string> {
  return Object.freeze(Object.fromEntries(Object.entries(PINS).map(([name, digest]) => {
    const bytes = readFileSync(path.join(ROOT, name));
    requireCondition(sha256(bytes) === digest, `source_pin_mismatch:${name}`);
    return [name, bytes.toString("utf8")];
  })));
}
function transpile(source: string, filename: string): string {
  const output = ts.transpileModule(source, {
    // A virtual .cts name is required: TypeScript preserves ESM for .mts even
    // with module=CommonJS. Source text remains the exact pinned original.
    fileName: filename.replace(/\.(?:mts|ts)$/u, ".cts"),
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: false },
    reportDiagnostics: true,
  });
  requireCondition(!output.diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error), "source_transpile_error");
  return output.outputText;
}
function modelDigest(sources: Record<string, string>): string {
  requireCondition(sha256(sources[MODEL]!) === PINS[MODEL], "model_source_pin_mismatch");
  const exports: Record<string, unknown> = {};
  // No module import occurs before the authority check. This exact module is
  // only the two constant exports; it does not import the astronomy runtime.
  new Script(transpile(sources[MODEL]!, MODEL)).runInNewContext({ exports },
    { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } });
  requireCondition(typeof exports.ASTRONOMY_FACT_MODEL_DIGEST === "string" && /^[0-9a-f]{64}$/u.test(exports.ASTRONOMY_FACT_MODEL_DIGEST), "model_constant_invalid");
  return exports.ASTRONOMY_FACT_MODEL_DIGEST;
}
const ORIGINAL_PID = 424242;
const originalDatabase = `mobile_science_r8_${ORIGINAL_PID}`;
const ownedDatabase = "r8_isolated_0123456789abcdef0123456789abcdef";
function originalArgs(db: string): string[] {
  return ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"];
}
function options(input: string): ExecOptions {
  return { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] };
}
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const REJECTS: { id: string; pattern: RegExp; sqlstate: string }[] = [
  { id: "subscription_hard_off", pattern: new RegExp(`^UPDATE mobile_science_notification_subscriptions SET enabled=true WHERE user_id='${UUID}'$`, "u"), sqlstate: "23514" },
  { id: "producer_hard_off", pattern: /^UPDATE mobile_science_notification_producer_state SET provider_send_enabled=true$/u, sqlstate: "23514" },
  { id: "qizheng_schema_zero", pattern: new RegExp(`^UPDATE mobile_push_tokens SET qizheng_payload_schema=1 WHERE user_id='${UUID}'$`, "u"), sqlstate: "23514" },
  { id: "shadow_requires_approval", pattern: new RegExp(`^INSERT INTO mobile_science_notification_shadow_cohort\\(user_id,science_id,submode,enabled\\)\\n     VALUES\\('${UUID}','astronomy_fact','civil_two_hour',true\\)$`, "u"), sqlstate: "23514" },
  { id: "single_primary_endpoint", pattern: new RegExp(`^INSERT INTO mobile_science_notification_endpoints\\(chain_id,token_id,installation_id,audience_binding,primary_endpoint\\)\\n     VALUES\\('${UUID}','${UUID}',gen_random_uuid\\(\\),'B8c7wP4nY2kLm8QrV5sT1u',true\\)$`, "u"), sqlstate: "23505" },
  { id: "immutable_update", pattern: /^UPDATE mobile_science_notification_occurrences SET snapshot='\{"changed":true\}'$/u, sqlstate: "23514" },
  { id: "immutable_delete", pattern: /^DELETE FROM mobile_science_notification_occurrences$/u, sqlstate: "23514" },
];
function createAdapter(execute: SqlExecutor, database: string, pid: number, sources = loadPinned()) {
  requireCondition(/^r8_isolated_[0-9a-f]{32}$/u.test(database), "unsafe_owned_database");
  requireCondition(Number.isSafeInteger(pid) && pid > 0, "unsafe_original_pid");
  const original = `mobile_science_r8_${pid}`;
  let created = false;
  let dropped = false;
  const fatal: string[] = [];
  const statements: { kind: string; sha256: string; outcome: string; sqlstate?: string }[] = [];
  const rejected = new Set<string>();
  const fail = (code: string): never => { fatal.push(code); throw new Failure(code); };
  function invoke(db: string, sql: string, kind: string): string {
    const record: (typeof statements)[number] = { kind, sha256: sha256(sql), outcome: "started" };
    statements.push(record);
    const expected = REJECTS.find((candidate) => candidate.pattern.test(sql));
    try {
      const result = execute(db, sql);
      requireCondition(typeof result === "string", "executor_return_type");
      record.outcome = "success";
      if (expected) fail(`expected_sql_rejection_missing:${expected.id}`);
      return result;
    } catch (error) {
      if (expected && error instanceof SqlFailure && error.status === 3 && error.sqlstate === expected.sqlstate) {
        if (rejected.has(expected.id)) fail(`duplicate_expected_rejection:${expected.id}`);
        rejected.add(expected.id);
        record.outcome = "expected_rejection"; record.sqlstate = error.sqlstate;
        throw new Failure(`expected_sql_rejection:${expected.id}`); // Original rejectsSql catches ONLY this acceptable failure.
      }
      record.outcome = "fatal";
      fail(error instanceof Failure ? error.message : "unclassified_executor_failure");
    }
  }
  return {
    fail,
    execFileSync(command: string, args: string[], config: ExecOptions) {
      if (command !== "docker" || !Array.isArray(args) || args.length !== 12 ||
          JSON.stringify(args) !== JSON.stringify(originalArgs(args[10]!))) fail("unrecognized_original_argv");
      if (!config || JSON.stringify(Object.keys(config).sort()) !== '["encoding","input","stdio"]' ||
          config.encoding !== "utf8" || typeof config.input !== "string" ||
          JSON.stringify(config.stdio) !== '["pipe","pipe","pipe"]') fail("unrecognized_original_exec_options");
      const sql = config.input;
      if (args[10] === "postgres") {
        if (sql === `DROP DATABASE IF EXISTS ${original} WITH (FORCE); CREATE DATABASE ${original};`) {
          if (created || dropped || fatal.length) fail("duplicate_or_failed_create");
          // No preemptive DROP, IF EXISTS, or FORCE. A collision must fail closed.
          const output = invoke("postgres", `CREATE DATABASE ${database};`, "owned_database_create");
          created = true;
          return output;
        }
        if (sql === `DROP DATABASE IF EXISTS ${original} WITH (FORCE);`) {
          if (!created || dropped) fail("drop_without_owned_database");
          const output = invoke("postgres", `DROP DATABASE ${database};`, "owned_database_drop");
          dropped = true;
          return output;
        }
        fail("unrecognized_database_lifecycle");
      }
      if (args[10] !== original || !created || dropped || fatal.length) fail("unrecognized_or_inactive_database_target");
      // SQL fixtures, both forward runs, rollback, and every assertion are byte-identical.
      return invoke(database, sql, sql === sources[FORWARD] ? "forward" : sql === sources[ROLLBACK] ? "rollback" : "original_fixture_or_assertion");
    },
    assertHealthy(complete = false) {
      requireCondition(fatal.length === 0, `latched_adapter_failure:${fatal[0]}`);
      if (complete) {
        requireCondition(created && dropped, "original_lifecycle_incomplete");
        requireCondition(rejected.size === 7, "original_expected_rejections_incomplete");
        requireCondition(statements.filter((entry) => entry.kind === "forward").length === 2, "forward_count_not_two");
        requireCondition(statements.filter((entry) => entry.kind === "rollback").length === 1, "rollback_count_not_one");
      }
    },
    report() {
      return { statements, counts: { totalCalls: statements.length, forwardAttempts: statements.filter((entry) => entry.kind === "forward").length,
        successfulForwards: statements.filter((entry) => entry.kind === "forward" && entry.outcome === "success").length,
        rollbackAttempts: statements.filter((entry) => entry.kind === "rollback").length,
        successfulRollbacks: statements.filter((entry) => entry.kind === "rollback" && entry.outcome === "success").length,
        confirmedExpectedRejections: rejected.size },
        transcriptSha256: sha256(JSON.stringify(statements)), expectedRejects: [...rejected], fatal: [...fatal], created, dropped };
    },
  };
}
function runOriginal(adapter: ReturnType<typeof createAdapter>, pid: number, sources: Record<string, string>): void {
  for (const [name, digest] of Object.entries(PINS)) requireCondition(sha256(sources[name]!) === digest, "execution_source_pin_mismatch");
  const output = transpile(sources[ORIGINAL]!, ORIGINAL);
  const ASTRONOMY_FACT_MODEL_DIGEST = modelDigest(sources);
  const logs: string[] = [];
  const restrictedRequire = (name: string): unknown => {
    switch (name) {
      case "node:assert/strict": return Object.freeze({ default: assert });
      case "node:crypto": return Object.freeze({ default: Object.freeze({ randomUUID: () => crypto.randomUUID() }) });
      case "node:child_process": return Object.freeze({ execFileSync: adapter.execFileSync });
      case "node:fs": return Object.freeze({ readFileSync: (name: string, encoding: string) => {
        if ((name !== FORWARD && name !== ROLLBACK) || encoding !== "utf8") adapter.fail("restricted_fs_rejected");
        return sources[name];
      } });
      case "../src/lib/astro/astronomy-fact-model-attestation": return Object.freeze({ ASTRONOMY_FACT_MODEL_DIGEST });
      default: return adapter.fail("restricted_require_rejected");
    }
  };
  try {
    // The VM is an execution adapter, not an arbitrary-code security boundary.
    // Execution authority is the exact pinned, fully reviewed original source.
    new Script(output, { filename: ORIGINAL }).runInNewContext({
      require: restrictedRequire, exports: {}, process: Object.freeze({ pid }),
      console: Object.freeze({ log: (value: string) => { logs.push(value); } }),
    }, { timeout: 180_000, contextCodeGeneration: { strings: false, wasm: false } });
  } finally {
    adapter.assertHealthy(); // Catches guard/infrastructure failures swallowed by the original's catch blocks.
  }
  adapter.assertHealthy(true);
  requireCondition(JSON.stringify(logs) === '["MOBILE_SCIENCE_NOTIFICATIONS_R8_MIGRATION_OK hard-off immutable"]', "original_success_marker_missing");
}
// Docker inspect is untrusted JSON. Every field below is checked before use.
type Inspection = Record<string, any>;
const TMPFS = Object.freeze({
  "/var/lib/postgresql/data": "rw,nosuid,nodev,size=402653184,uid=70,gid=70,mode=0700",
  "/var/run/postgresql": "rw,nosuid,nodev,size=16777216,uid=70,gid=70,mode=0775",
  "/tmp": "rw,nosuid,nodev,size=16777216,uid=70,gid=70,mode=1777",
});
const FIXED_ENV = Object.freeze([
  "POSTGRES_USER=decode_user", "POSTGRES_DB=postgres", "POSTGRES_HOST_AUTH_METHOD=trust",
  "PGDATA=/var/lib/postgresql/data", "LC_ALL=en_US.utf8", "TZ=UTC",
  "POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=en_US.utf8",
]);
function inspectOne(execute: DockerExecutor, kind: "image" | "container", target: string): Inspection {
  let result: unknown;
  try { result = JSON.parse(execute([kind, "inspect", target])); }
  catch { throw new Failure(`${kind}_inspection_failed`); }
  requireCondition(Array.isArray(result) && result.length === 1 && result[0] && typeof result[0] === "object", "invalid_inspection_shape");
  return result[0];
}
function checkIdentity(inspection: Inspection, id: string, name: string, owner: string): void {
  requireCondition(/^[0-9a-f]{64}$/u.test(id) && /^[0-9a-f]{32}$/u.test(owner) && name === `hourkey-r8-isolated-${owner}`, "invalid_owned_identity");
  requireCondition(inspection.Id === id && inspection.Name === `/${name}` && inspection.Image === IMAGE &&
    inspection.Config?.Image === IMAGE && inspection.Config?.Labels?.[LABEL] === owner, "owned_container_identity_mismatch");
}
function expectedEnvironment(image: Inspection): string[] {
  requireCondition(Array.isArray(image.Config?.Env) && image.Config.Env.every((entry: unknown) => typeof entry === "string"), "image_environment_invalid");
  const values = new Map<string, string>();
  for (const entry of [...image.Config.Env, ...FIXED_ENV]) values.set(entry.split("=", 1)[0], entry);
  return [...values.values()].sort();
}
function checkIsolation(inspection: Inspection, image: Inspection): void {
  const config = inspection.Config;
  const host = inspection.HostConfig;
  requireCondition(config && host && inspection.State, "isolation_metadata_missing");
  const empty = (value: unknown) => value == null || (Array.isArray(value) ? value.length === 0 : typeof value === "object" && Object.keys(value).length === 0);
  requireCondition(host.NetworkMode === "none" && host.ReadonlyRootfs === true && host.Privileged === false &&
    host.PublishAllPorts === false && host.AutoRemove === false && host.RestartPolicy?.Name === "no", "unsafe_container_mode");
  requireCondition(config.User === "70:70" && config.StopSignal === "SIGINT" && config.OpenStdin === false && config.Tty === false &&
    JSON.stringify(config.Entrypoint) === '["docker-entrypoint.sh"]' && JSON.stringify(config.Cmd) === '["postgres"]' &&
    JSON.stringify(config.Healthcheck?.Test) === '["NONE"]', "unsafe_container_process");
  requireCondition(host.Memory === 536870912 && host.MemorySwap === 536870912 && host.NanoCpus === 1_000_000_000 &&
    host.PidsLimit === 128 && host.ShmSize === 16777216, "resource_bounds_mismatch");
  requireCondition(JSON.stringify(host.CapDrop) === '["ALL"]' && empty(host.CapAdd) &&
    JSON.stringify(host.SecurityOpt) === '["no-new-privileges:true"]' && host.LogConfig?.Type === "none", "unsafe_security_options");
  requireCondition([host.Binds, host.VolumesFrom, host.Mounts, host.PortBindings, host.Devices, host.DeviceRequests,
    host.ExtraHosts, host.Links, host.Dns, host.DnsSearch, host.DnsOptions].every(empty), "host_mount_port_device_or_network_injection");
  requireCondition(!host.PidMode && host.IpcMode === "private" && host.CgroupnsMode !== "host" && !host.UTSMode && !host.UsernsMode,
    "host_namespace_injection");
  requireCondition(JSON.stringify(Object.entries(host.Tmpfs ?? {}).sort()) === JSON.stringify(Object.entries(TMPFS).sort()), "tmpfs_bounds_mismatch");
  requireCondition(Array.isArray(inspection.Mounts) && inspection.Mounts.every((mount: Inspection) =>
    mount.Type === "tmpfs" && Object.hasOwn(TMPFS, mount.Destination) && !mount.Source && mount.RW === true), "unexpected_material_mount");
  requireCondition(JSON.stringify(Object.keys(config.Volumes ?? {}).sort()) === '["/var/lib/postgresql/data"]', "unexpected_image_volume");
  requireCondition(Array.isArray(config.Env) && JSON.stringify([...config.Env].sort()) === JSON.stringify(expectedEnvironment(image)), "container_environment_mismatch");
  const exposed = Object.keys(image.Config?.ExposedPorts ?? {}).sort();
  requireCondition(JSON.stringify(Object.keys(config.ExposedPorts ?? {}).sort()) === JSON.stringify(exposed), "unexpected_exposed_port");
  requireCondition(Object.entries(inspection.NetworkSettings?.Ports ?? {}).every(([name, binding]) => exposed.includes(name) && binding === null) &&
    Object.keys(inspection.NetworkSettings?.Networks ?? {}).every((name) => name === "none"), "unexpected_container_network");
}
function createArguments(name: string, owner: string): string[] {
  requireCondition(/^[0-9a-f]{32}$/u.test(owner) && name === `hourkey-r8-isolated-${owner}`, "invalid_create_identity");
  return ["create", "--pull=never", `--name=${name}`, `--label=${LABEL}=${owner}`,
    "--network=none", "--read-only", "--user=70:70", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
    "--cpus=1", "--memory=512m", "--memory-swap=512m", "--pids-limit=128", "--shm-size=16m", "--ipc=private",
    "--restart=no", "--log-driver=none", "--no-healthcheck", "--stop-signal=SIGINT",
    ...Object.entries(TMPFS).map(([destination, value]) => `--tmpfs=${destination}:${value}`),
    ...FIXED_ENV.map((entry) => `--env=${entry}`), IMAGE];
}
function createLifecycle(execute: DockerExecutor, owner: string, database = ownedDatabase) {
  requireCondition(/^r8_isolated_[0-9a-f]{32}$/u.test(database), "unsafe_lifecycle_database");
  const name = `hourkey-r8-isolated-${owner}`;
  let id: string | null = null;
  let image: Inspection | null = null;
  let removed = false;
  let finalPid1Checks = 0;
  let initializationPid1Checks = 0;
  const actions: string[] = [];
  const sqlCalls: { targetScope: string; sha256: string; loginRole?: "hourkey_app" }[] = [];
  function owned(isolation = false): Inspection {
    requireCondition(id && !removed, "container_not_owned_or_removed");
    const inspection = inspectOne(execute, "container", id);
    checkIdentity(inspection, id, name, owner);
    if (isolation) { requireCondition(image, "image_not_verified"); checkIsolation(inspection, image); }
    return inspection;
  }
  function finalPostgresPid1(): boolean {
    // The pinned entrypoint starts a temporary socket-only PostgreSQL child
    // while PID 1 is still bash. That child can pass pg_isready before initdb
    // setup finishes. Only the final exec-to-postgres is ready for fixture SQL.
    requireCondition(owned(true).State.Running === true, "container_not_running");
    const comm = execute(["exec", id!, "cat", "/proc/1/comm"]);
    if (comm === "bash\n" || comm === "docker-entrypoi\n") { initializationPid1Checks += 1; return false; }
    requireCondition(comm === "postgres\n", "unexpected_pid1_process");
    finalPid1Checks += 1;
    return true;
  }
  return {
    createAndStart() {
      requireCondition(!id, "duplicate_container_create");
      image = inspectOne(execute, "image", IMAGE); // Exact local ID. No pull and no tag resolution.
      requireCondition(image.Id === IMAGE && image.Os === "linux" &&
        JSON.stringify(Object.keys(image.Config?.Volumes ?? {})) === '["/var/lib/postgresql/data"]' &&
        JSON.stringify(image.Config?.Entrypoint) === '["docker-entrypoint.sh"]' && JSON.stringify(image.Config?.Cmd) === '["postgres"]', "pinned_image_config_mismatch");
      expectedEnvironment(image);
      const result = execute(createArguments(name, owner)).trim();
      requireCondition(/^[0-9a-f]{64}$/u.test(result), "create_returned_no_exact_id_cleanup_unresolved");
      id = result;
      actions.push("created_exact_id");
      requireCondition(owned(true).State.Running === false, "unexpected_running_before_start");
      execute(["start", id]);
      actions.push("started_exact_id");
    },
    ready(): boolean {
      if (!finalPostgresPid1()) return false;
      try {
        execute(["exec", id!, "pg_isready", "-q", "-h", "/var/run/postgresql", "-U", "decode_user", "-d", "postgres"]);
        return true;
      } catch (error) {
        if (error instanceof SqlFailure && error.status === 1 && error.sqlstate === null) return false;
        if (error instanceof SqlFailure && error.status === 2 && error.sqlstate === null) return false;
        throw error;
      }
    },
    sql(targetDatabase: string, sql: string, loginRole: "decode_user" | "hourkey_app" = "decode_user"): string {
      requireCondition(targetDatabase === "postgres" || targetDatabase === database, "unsafe_psql_target");
      requireCondition(loginRole === "decode_user" || (loginRole === "hourkey_app" && targetDatabase === database), "unsafe_psql_login_role");
      requireCondition(finalPostgresPid1(), "postgres_entrypoint_initialization_in_progress");
      sqlCalls.push({ targetScope: targetDatabase === "postgres" ? "isolated_cluster_catalog" : "owned_fixture_database", sha256: sha256(sql),
        ...(loginRole === "hourkey_app" ? { loginRole } : {}) });
      return execute(["exec", "-i", id!, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", loginRole, "-d", targetDatabase, "-Atq", "--set=VERBOSITY=verbose"], sql);
    },
    cleanup() {
      if (!id) { actions.push("no_exact_id_available_no_cleanup_attempted"); return; }
      requireCondition(!removed, "duplicate_container_cleanup");
      let inspection = owned(); // Identity required even if initial isolation checks failed.
      if (inspection.State?.Running === true) {
        // SIGINT is PostgreSQL fast/graceful shutdown. -1 forbids Docker's timeout SIGKILL escalation.
        // The client itself has a bounded timeout; on failure leave evidence, do not force-remove.
        execute(["stop", "--timeout=-1", id]);
        actions.push("graceful_stop_exact_id");
        inspection = owned();
      }
      requireCondition(inspection.State?.Running === false, "cleanup_still_running");
      owned(); // Fresh identity check immediately before the sole non-force removal.
      requireCondition(execute(["rm", id]).trim() === id, "cleanup_remove_receipt_mismatch");
      removed = true;
      actions.push("nonforce_remove_exact_id");
    },
    report() {
      return { containerId: id, name, ownerLabel: LABEL, owner, imageId: IMAGE, imageConfigSha256: image ? sha256(JSON.stringify(image.Config)) : null,
        createArgumentsSha256: sha256(JSON.stringify(createArguments(name, owner))), actions: [...actions], sqlCalls,
        pid1Checks: { expectedFinalComm: "postgres", finalPid1Checks, initializationPid1Checks }, removed };
    },
  };
}
function absent(filename: string): void {
  try { lstatSync(filename); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw new Failure("path_absence_check_failed"); }
  throw new Failure("path_already_exists");
}
function receiptDestination(filename: string): { filename: string; directory: string; device: number; inode: number } {
  requireCondition(path.isAbsolute(filename) && path.normalize(filename) === filename, "receipt_requires_canonical_absolute_path");
  const directory = path.dirname(filename);
  requireCondition(realpathSync(directory) === directory && !filename.startsWith(`${ROOT}/`) && directory !== ROOT,
    "receipt_requires_external_canonical_directory");
  const metadata = statSync(directory);
  requireCondition(metadata.isDirectory() && metadata.uid === process.getuid?.() && (metadata.mode & 0o077) === 0,
    "receipt_directory_requires_current_owner_private_permissions");
  absent(filename);
  return { filename, directory, device: metadata.dev, inode: metadata.ino };
}
function writeReceipt(destination: ReturnType<typeof receiptDestination>, value: unknown): void {
  const rechecked = receiptDestination(destination.filename);
  requireCondition(rechecked.device === destination.device && rechecked.inode === destination.inode, "receipt_directory_changed");
  const descriptor = openSync(destination.filename, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
}
function runtimeAuthority(sources: Record<string, string>) {
  requireCondition(!process.env.NODE_OPTIONS && !process.env.NODE_PATH && !process.env.LD_PRELOAD && !process.env.LD_LIBRARY_PATH,
    "unattested_runtime_injection_environment");
  requireCondition(process.execArgv.includes("--experimental-strip-types") && process.execArgv.every((value) =>
    value === "--experimental-strip-types" || value === "--no-warnings"), "unattested_runtime_loader_arguments");
  const require = createRequire(import.meta.url);
  const typescriptEntry = realpathSync(require.resolve("typescript"));
  const loadedCommonJs = Object.keys(require.cache).map((filename) => realpathSync(filename)).sort();
  requireCondition(loadedCommonJs.includes(typescriptEntry) && loadedCommonJs.every((filename) =>
    filename.startsWith(`${path.dirname(path.dirname(typescriptEntry))}/`)), "unattested_commonjs_runtime_dependency");
  const files = [SELF, ...Object.keys(PINS), "package.json", "package-lock.json"].map((name) => ({
    path: name, sha256: sha256(readFileSync(path.join(ROOT, name))),
  }));
  const nodeExecutable = realpathSync(process.execPath);
  const dockerExecutable = realpathSync("/usr/bin/docker");
  const head = hostExecFileSync("/usr/bin/git", ["-C", ROOT, "rev-parse", "HEAD"], {
    encoding: "utf8", timeout: 5000, env: { PATH: "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1" }, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  requireCondition(/^[0-9a-f]{40}$/u.test(head), "git_head_invalid");
  return {
    root: ROOT, head, files, modelDigest: modelDigest(sources),
    originalTranspiledSha256: sha256(transpile(sources[ORIGINAL]!, ORIGINAL)), modelTranspiledSha256: sha256(transpile(sources[MODEL]!, MODEL)),
    transpilation: { virtualFilenameExtension: ".cts", target: "ES2022", module: "CommonJS", esModuleInterop: false },
    node: { version: process.version, executable: nodeExecutable, sha256: sha256(readFileSync(nodeExecutable)), execArgv: process.execArgv },
    typescript: { version: ts.version, files: [...loadedCommonJs, require.resolve("typescript/package.json")].map((filename) => ({ path: filename, sha256: sha256(readFileSync(filename)) })) },
    dockerClient: { executable: dockerExecutable, sha256: sha256(readFileSync(dockerExecutable)), socket: "unix:///var/run/docker.sock", timeoutMs: 30_000,
      environmentKeys: ["PATH", "DOCKER_CONFIG"], inheritedEnvironment: false },
    builtins: ["node:assert/strict", "node:crypto", "node:child_process", "node:fs", "node:path", "node:url", "node:module", "node:vm"],
  };
}
function realDocker(executable: string, configDirectory: string): DockerExecutor {
  return (args, input) => {
    try {
      return hostExecFileSync(executable, ["--host=unix:///var/run/docker.sock", `--config=${configDirectory}`, ...args], {
        encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], timeout: 30_000, maxBuffer: 1_048_576,
        env: { PATH: "/usr/bin:/bin", DOCKER_CONFIG: configDirectory },
      });
    } catch (error) {
      // Never forward execFileSync's error: it contains the raw SQL/fixture data.
      const failure = error as { status?: number; stderr?: string | Buffer };
      const stderr = typeof failure.stderr === "string" ? failure.stderr : Buffer.isBuffer(failure.stderr) ? failure.stderr.toString("utf8") : "";
      const sqlstate = /\bERROR:\s+([0-9A-Z]{5}):/u.exec(stderr)?.[1] ?? null;
      throw new SqlFailure(Number.isInteger(failure.status) ? failure.status! : null, sqlstate);
    }
  };
}
const FIDELITY_SQL = `SELECT json_build_object(
  'serverVersionNum',current_setting('server_version_num'),'encoding',current_setting('server_encoding'),
  'timezone',current_setting('TimeZone'),'databaseLocale',(
    SELECT json_agg(json_build_object('name',datname,'encoding',pg_encoding_to_char(encoding),
      'collation',datcollate,'ctype',datctype) ORDER BY datname)
    FROM pg_database WHERE datname IN ('postgres','template1')
  ))::text;`;
function checkFidelity(raw: string): unknown {
  let result: Inspection;
  try { result = JSON.parse(raw); } catch { throw new Failure("database_fidelity_json_invalid"); }
  requireCondition(result && result.serverVersionNum === "160013" && result.encoding === "UTF8" && result.timezone === "UTC" &&
    Array.isArray(result.databaseLocale) && result.databaseLocale.length === 2 &&
    JSON.stringify(result.databaseLocale.map((entry: Inspection) => entry.name)) === '["postgres","template1"]' &&
    result.databaseLocale.every((entry: Inspection) => entry.encoding === "UTF8" && entry.collation === "en_US.utf8" && entry.ctype === "en_US.utf8"),
    "database_fidelity_mismatch");
  return result;
}
// Only the previously missing runtime-login/scoped-function behavior. This mode uses
// the same owned cluster lifecycle; it does not repeat the original double
// migration/rollback suite, impersonate a production connection, or change SQL.
function runRuntimeChecks(lifecycle: ReturnType<typeof createLifecycle>, database: string, forward: string) {
  const admin = (sql: string) => lifecycle.sql(database, sql).trim();
  const runtime = (sql: string) => lifecycle.sql(database,
    `SET statement_timeout='5s'; SET lock_timeout='1s';\n${sql}`, "hourkey_app").trim();
  lifecycle.sql("postgres", `CREATE DATABASE ${database};`);
  admin(`CREATE EXTENSION pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY,deleted_at timestamptz,is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE profiles(id uuid PRIMARY KEY,created_by_user_id uuid NOT NULL REFERENCES users(id));
    CREATE TABLE mobile_notification_prefs(user_id uuid PRIMARY KEY REFERENCES users(id));
    CREATE TABLE mobile_push_tokens(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      installation_id uuid NOT NULL,qizheng_payload_schema smallint NOT NULL DEFAULT 0,
      enabled boolean NOT NULL DEFAULT true,expo_push_token text,device_push_token text);
    CREATE UNIQUE INDEX ux_mobile_push_tokens_active_installation ON mobile_push_tokens(installation_id) WHERE enabled=true;`);
  admin(forward);
  const roleProof = JSON.parse(runtime(`
    DO $check$ DECLARE t text; col text; sql text; denied integer := 0; BEGIN
      IF current_user<>'hourkey_app' OR session_user<>'hourkey_app'
        OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication))
      THEN RAISE EXCEPTION 'runtime_login_not_exact'; END IF;
      FOR t,col IN SELECT * FROM (VALUES
        ('mobile_science_notification_producer_state','science_id'),
        ('mobile_science_notification_subscriptions','user_id'),
        ('mobile_science_notification_shadow_cohort','user_id'),
        ('mobile_science_notification_chains','id'),
        ('mobile_science_notification_endpoints','chain_id'),
        ('mobile_science_notification_occurrences','id')) AS tables(name,first_column)
      LOOP
        EXECUTE format('SELECT count(*) FROM public.%I',t);
        IF NOT has_table_privilege(current_user,'public.'||t,'SELECT')
          OR has_table_privilege(current_user,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
            WHERE c.oid=('public.'||t)::regclass AND a.grantee=0
              AND a.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
        THEN RAISE EXCEPTION 'runtime_or_public_mutation_privilege'; END IF;
        FOREACH sql IN ARRAY ARRAY[format('INSERT INTO public.%I DEFAULT VALUES',t),
          format('UPDATE public.%I SET %I=%I WHERE false',t,col,col),
          format('DELETE FROM public.%I WHERE false',t),format('TRUNCATE public.%I',t)]
        LOOP
          BEGIN EXECUTE sql; RAISE EXCEPTION 'runtime_mutation_was_allowed';
          EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
        END LOOP;
      END LOOP;
      IF denied<>24 THEN RAISE EXCEPTION 'runtime_denial_count'; END IF;
      IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname IN ('hourkey_r8_remove_transferred_bindings','hourkey_r8_rebind_primary_token',
            'hourkey_r8_revoke_delivery_scope','hourkey_r8_record_astronomy_shadow_occurrence','hourkey_r8_mark_astronomy_shadow_run')
            AND p.prosecdef AND pg_get_userbyid(p.proowner)<>current_user
            AND p.proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
            AND has_function_privilege(current_user,p.oid,'EXECUTE')
            AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
              WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))<>5
      THEN RAISE EXCEPTION 'scoped_function_privilege_or_hardening'; END IF;
    END $check$;
    SELECT json_build_object('exactRuntimeLogin',current_user='hourkey_app' AND session_user='hourkey_app',
      'readableTables',6,'deniedDmlOperations',24,'hardenedScopedFunctions',5);`));
  assert.deepEqual(roleProof, { exactRuntimeLogin: true, readableTables: 6, deniedDmlOperations: 24, hardenedScopedFunctions: 5 });
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const cases = ["primary_expo", "primary_installation", "primary_native", "secondary_expo", "secondary_installation", "secondary_native", "same_binding", "no_match"];
  for (const kind of cases) {
    // Synthetic owned-cluster rows only. Parent cascades are the migration's
    // existing transfer policy; never describe them as preserving all history.
    admin(`DELETE FROM users;
      INSERT INTO users(id) VALUES('${id(1)}'),('${id(2)}'),('${id(3)}');
      INSERT INTO mobile_push_tokens(id,user_id,installation_id,expo_push_token,device_push_token) VALUES
        ('${id(10)}','${id(1)}','${id(50)}','expo-0','native-0'),
        ('${id(11)}','${id(1)}','${id(51)}','expo-1','native-1'),
        ('${id(12)}','${id(2)}','${id(52)}','expo-2','native-2'),
        ('${id(13)}','${id(1)}','${id(53)}','expo-3','native-3');
      INSERT INTO mobile_science_notification_chains(id,user_id,org_id,science_id,submode,schema_version,primary_token_id,primary_installation_id) VALUES
        ('${id(20)}','${id(1)}','${id(40)}','astronomy_fact','civil_two_hour',1,'${id(10)}','${id(50)}'),
        ('${id(21)}','${id(1)}','${id(41)}','astronomy_fact','civil_two_hour',1,'${id(11)}','${id(51)}'),
        ('${id(22)}','${id(2)}','${id(42)}','astronomy_fact','civil_two_hour',1,'${id(12)}','${id(52)}');
      INSERT INTO mobile_science_notification_endpoints(chain_id,token_id,installation_id,audience_binding,primary_endpoint)
        SELECT c.id,t.id,t.installation_id,t.astronomy_fact_audience_binding,true
          FROM mobile_science_notification_chains c JOIN mobile_push_tokens t ON t.id=c.primary_token_id;
      INSERT INTO mobile_science_notification_endpoints(chain_id,token_id,installation_id,audience_binding,primary_endpoint)
        SELECT '${id(21)}',t.id,t.installation_id,t.astronomy_fact_audience_binding,false FROM mobile_push_tokens t WHERE t.id='${id(13)}';
      INSERT INTO mobile_science_notification_occurrences(chain_id,science_id,submode,schema_version,notification_unit_id,identity_cbor,
        identity_hash,result_revision_hash,rollout_epoch,state,snapshot,snapshot_digest,scheduled_for,expires_at)
        SELECT c.id,'astronomy_fact','civil_two_hour',1,'fixture-'||c.id,decode('01','hex'),digest(c.id::text,'sha256'),
          digest('revision-'||c.id,'sha256'),1,'shadowed','{"fixture":true}','${"a".repeat(64)}',
          '2026-09-05T00:00:00Z','2026-09-05T02:00:00Z' FROM mobile_science_notification_chains c;`);
    const protectedQuery = `SELECT json_build_object(
      'chains',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM mobile_science_notification_chains c WHERE c.id IN ('${id(21)}','${id(22)}')),
      'occurrences',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM mobile_science_notification_occurrences o WHERE o.chain_id IN ('${id(21)}','${id(22)}')),
      'tokens',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM mobile_push_tokens t));`;
    const before = admin(protectedQuery);
    const target = kind.startsWith("secondary_") ? 3 : 0;
    const user = kind === "same_binding" ? id(1) : id(3);
    const installation = kind.endsWith("_installation") || kind === "same_binding" ? id(50 + target) : id(99);
    const expo = kind.endsWith("_expo") || kind === "same_binding" ? `expo-${target}` : "unmatched-expo";
    const native = kind.endsWith("_native") ? `'native-${target}'` : "NULL";
    runtime(`SELECT hourkey_r8_remove_transferred_bindings('${user}','${installation}','${expo}',${native});`);
    assert.equal(admin(protectedQuery), before, `unrelated chains/occurrences/token rows changed: ${kind}`);
    const removedPrimary = kind.startsWith("primary_");
    assert.deepEqual(JSON.parse(admin(`SELECT json_build_object(
      'chains',(SELECT count(*) FROM mobile_science_notification_chains),
      'occurrences',(SELECT count(*) FROM mobile_science_notification_occurrences),
      'endpoints',(SELECT count(*) FROM mobile_science_notification_endpoints),
      'targetEndpoints',(SELECT count(*) FROM mobile_science_notification_endpoints WHERE token_id='${id(10 + target)}'));`)), {
      chains: removedPrimary ? 2 : 3, occurrences: removedPrimary ? 2 : 3,
      endpoints: kind === "same_binding" || kind === "no_match" ? 4 : 3,
      targetEndpoints: kind === "same_binding" || kind === "no_match" ? 1 : 0,
    }, `transfer scope mismatch: ${kind}`);
  }
  // The final no_match transfer case leaves the complete synthetic fixture in
  // place. Exercise the remaining capabilities using the same genuine login,
  // never SET ROLE and never the shared production cluster.
  const state = (exclude = "") => admin(`SELECT jsonb_object_agg(name,rows ORDER BY name) FROM (
    ${["users", "profiles", "mobile_notification_prefs", "mobile_push_tokens",
      "mobile_science_notification_producer_state", "mobile_science_notification_subscriptions",
      "mobile_science_notification_shadow_cohort", "mobile_science_notification_chains",
      "mobile_science_notification_endpoints", "mobile_science_notification_occurrences"]
      .map((table) => `SELECT '${table}' AS name,COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows
        FROM ${table} t ${table === exclude ? "WHERE false" : ""}`).join(" UNION ALL ")}
    ) fixture;`);
  const rejectedUnchanged = (sql: string) => {
    const before = state();
    assert.throws(() => runtime(sql), (error: unknown) =>
      error instanceof SqlFailure && error.status === 3 && error.sqlstate === "23514");
    assert.equal(state(), before, "rejected scoped call changed fixture state");
  };
  const falseUnchanged = (sql: string) => {
    const before = state();
    assert.equal(runtime(sql), "f");
    assert.equal(state(), before, "ineligible scoped call changed fixture state");
  };
  admin(`UPDATE mobile_push_tokens SET enabled=false WHERE id='${id(10)}';
    INSERT INTO mobile_push_tokens(id,user_id,installation_id,enabled) VALUES
      ('${id(14)}','${id(1)}','${id(50)}',true),
      ('${id(15)}','${id(1)}','${id(50)}',false),
      ('${id(16)}','${id(1)}','${id(54)}',true);
    INSERT INTO mobile_science_notification_chains(id,user_id,org_id,science_id,submode,schema_version,
      primary_token_id,primary_installation_id,lifecycle_state) VALUES
      ('${id(23)}','${id(1)}','${id(43)}','qizheng','electional_window',0,'${id(15)}','${id(50)}','shadow'),
      ('${id(24)}','${id(1)}','${id(44)}','astronomy_fact','civil_two_hour',1,'${id(16)}','${id(54)}','rollback');
    INSERT INTO mobile_science_notification_endpoints(chain_id,token_id,installation_id,audience_binding,primary_endpoint)
      SELECT c.id,t.id,t.installation_id,t.astronomy_fact_audience_binding,true
      FROM mobile_science_notification_chains c JOIN mobile_push_tokens t ON t.id=c.primary_token_id
      WHERE c.id IN ('${id(23)}','${id(24)}');`);
  const audience = admin(`SELECT astronomy_fact_audience_binding FROM mobile_push_tokens WHERE id='${id(14)}';`);
  assert.match(audience, /^[A-Za-z0-9_-]{22,64}$/u);
  const rebind = (user = id(1), installation = id(50), token = id(14), binding = audience) =>
    `SELECT hourkey_r8_rebind_primary_token('${user}','${installation}','${token}','${binding}');`;
  const rebindCases = ["wrong_user", "wrong_installation", "wrong_audience", "disabled_token", "replacement", "repeat_revision_stable"];
  rejectedUnchanged(rebind(id(2)));
  rejectedUnchanged(rebind(id(1), id(51)));
  rejectedUnchanged(rebind(id(1), id(50), id(14), "invalid-audience"));
  const oldAudience = admin(`SELECT astronomy_fact_audience_binding FROM mobile_push_tokens WHERE id='${id(10)}';`);
  rejectedUnchanged(rebind(id(1), id(50), id(10), oldAudience));
  const unrelatedBindingState = () => admin(`SELECT jsonb_build_object(
    'chains',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM mobile_science_notification_chains c WHERE c.id<>'${id(20)}'),
    'endpoints',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.chain_id,e.installation_id) FROM mobile_science_notification_endpoints e WHERE e.chain_id<>'${id(20)}'),
    'occurrences',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM mobile_science_notification_occurrences o),
    'tokens',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM mobile_push_tokens t));`);
  const beforeRebind = unrelatedBindingState();
  for (let repetition = 0; repetition < 2; repetition += 1) {
    assert.equal(runtime(rebind()), "1"); // Endpoint upsert reports 1 on repeat; chain revision remains 2.
    assert.equal(unrelatedBindingState(), beforeRebind);
    assert.deepEqual(JSON.parse(admin(`SELECT jsonb_build_object('token',c.primary_token_id,'revision',c.target_revision,
      'endpointToken',e.token_id,'endpointRevision',e.target_revision,'audience',e.audience_binding,
      'primary',e.primary_endpoint,'active',e.active) FROM mobile_science_notification_chains c
      JOIN mobile_science_notification_endpoints e ON e.chain_id=c.id WHERE c.id='${id(20)}';`)),
    { token: id(14), revision: 2, endpointToken: id(14), endpointRevision: 2, audience, primary: true, active: true });
  }

  const model = modelDigest(loadPinned());
  const mark = (count = 3, digest = model) =>
    `SELECT hourkey_r8_mark_astronomy_shadow_run('2026-09-05T12:00:00Z',${count},'${digest}');`;
  const markCases = ["wrong_model", "incomplete_evidence", "negative_count", "astronomy_only_update"];
  falseUnchanged(mark(3, "0".repeat(64)));
  admin("UPDATE mobile_science_notification_producer_state SET evidence_complete=false WHERE science_id='astronomy_fact';");
  falseUnchanged(mark());
  admin("UPDATE mobile_science_notification_producer_state SET evidence_complete=true WHERE science_id='astronomy_fact';");
  rejectedUnchanged(mark(-1));
  const qizhengProducers = () => admin("SELECT jsonb_agg(to_jsonb(p) ORDER BY p.submode) FROM mobile_science_notification_producer_state p WHERE science_id='qizheng';");
  const producersBefore = qizhengProducers();
  const nonProducerBefore = state("mobile_science_notification_producer_state");
  assert.equal(runtime(mark()), "t");
  assert.equal(qizhengProducers(), producersBefore);
  assert.equal(state("mobile_science_notification_producer_state"), nonProducerBefore);
  assert.equal(admin(`SELECT last_shadow_run_at='2026-09-05T12:00:00Z'::timestamptz
    AND last_shadow_count=3 AND provider_send_enabled=false
    FROM mobile_science_notification_producer_state WHERE science_id='astronomy_fact';`), "t");

  admin(`INSERT INTO mobile_science_notification_subscriptions
      (user_id,org_id,science_id,submode,cadence,local_day_cap,locale,display_timezone,receipt)
    VALUES('${id(1)}','${id(40)}','astronomy_fact','civil_two_hour','two_hour',12,'th','Asia/Bangkok','{}');
    INSERT INTO mobile_science_notification_shadow_cohort(user_id,science_id,submode,enabled,approved_by,approved_at)
    VALUES('${id(1)}','astronomy_fact','civil_two_hour',true,'isolated synthetic fixture','2026-09-05T00:00:00Z');`);
  const shadow = (chain = id(20), digest = model) => `SELECT hourkey_r8_record_astronomy_shadow_occurrence(
    '${chain}','runtime-shadow-unit',decode('0102','hex'),digest('runtime-identity','sha256'),digest('runtime-revision','sha256'),
    1,'shadowed',NULL,'{"fixture":"scoped-runtime","locale":"th"}','${"b".repeat(64)}',
    '2026-09-05T12:00:00Z','2026-09-05T14:00:00Z','${digest}');`;
  const shadowCases = ["missing_chain", "wrong_model"];
  falseUnchanged(shadow(id(99)));
  falseUnchanged(shadow(id(20), "0".repeat(64)));
  const ineligible: [string, string, string][] = [
    ["inactive_user", `UPDATE users SET is_active=false WHERE id='${id(1)}';`, `UPDATE users SET is_active=true WHERE id='${id(1)}';`],
    ["deleted_user", `UPDATE users SET deleted_at='2026-09-05T00:00:00Z' WHERE id='${id(1)}';`, `UPDATE users SET deleted_at=NULL WHERE id='${id(1)}';`],
    ["disabled_cohort", "UPDATE mobile_science_notification_shadow_cohort SET enabled=false;", "UPDATE mobile_science_notification_shadow_cohort SET enabled=true;"],
    ["consent_mismatch", "UPDATE mobile_science_notification_subscriptions SET consent_generation=2;", "UPDATE mobile_science_notification_subscriptions SET consent_generation=1;"],
    ["disabled_token", `UPDATE mobile_push_tokens SET enabled=false WHERE id='${id(14)}';`, `UPDATE mobile_push_tokens SET enabled=true WHERE id='${id(14)}';`],
    ["stale_endpoint_revision", `UPDATE mobile_science_notification_endpoints SET target_revision=1 WHERE chain_id='${id(20)}';`, `UPDATE mobile_science_notification_endpoints SET target_revision=2 WHERE chain_id='${id(20)}';`],
  ];
  for (const [name, invalidate, restore] of ineligible) {
    admin(invalidate); falseUnchanged(shadow()); admin(restore); shadowCases.push(name);
  }
  const existingOccurrences = () => admin("SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM mobile_science_notification_occurrences o WHERE notification_unit_id<>'runtime-shadow-unit';");
  const oldOccurrences = existingOccurrences();
  const beforeInsert = state("mobile_science_notification_occurrences");
  assert.equal(runtime(shadow()), "t");
  assert.equal(state("mobile_science_notification_occurrences"), beforeInsert);
  assert.equal(existingOccurrences(), oldOccurrences);
  assert.equal(admin(`SELECT count(*)=1 AND bool_and(chain_id='${id(20)}' AND science_id='astronomy_fact' AND submode='civil_two_hour'
    AND schema_version=1 AND identity_cbor=decode('0102','hex') AND identity_hash=digest('runtime-identity','sha256')
    AND result_revision_hash=digest('runtime-revision','sha256') AND rollout_epoch=1 AND state='shadowed' AND suppression_reason IS NULL
    AND snapshot='{"fixture":"scoped-runtime","locale":"th"}'::jsonb AND snapshot_digest='${"b".repeat(64)}'
    AND scheduled_for='2026-09-05T12:00:00Z'::timestamptz AND expires_at='2026-09-05T14:00:00Z'::timestamptz)
    FROM mobile_science_notification_occurrences WHERE notification_unit_id='runtime-shadow-unit';`), "t");
  falseUnchanged(shadow());
  shadowCases.push("eligible_exact_fields", "duplicate_does_not_rewrite");

  const revoke = (installation: string | null) => `SELECT hourkey_r8_revoke_delivery_scope('${id(1)}',${installation === null ? "NULL" : `'${installation}'`});`;
  const occurrencesBeforeRevoke = state("mobile_science_notification_chains");
  const immutableBeforeRevoke = admin("SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM mobile_science_notification_occurrences o;");
  const protectedRevoke = (includeSameUser = true) => admin(`SELECT jsonb_build_object(
    'chains',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM mobile_science_notification_chains c
      WHERE c.user_id='${id(2)}' OR c.lifecycle_state='rollback' ${includeSameUser ? `OR c.id='${id(21)}'` : ""}),
    'otherUserEndpoints',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.chain_id,e.installation_id)
      FROM mobile_science_notification_endpoints e JOIN mobile_science_notification_chains c ON c.id=e.chain_id WHERE c.user_id='${id(2)}'));
  `);
  const protectedBeforeInstallation = protectedRevoke();
  assert.equal(runtime(revoke(id(50))), "2"); // Astronomy + Qizheng of this installation; not another science's standalone tables.
  assert.equal(protectedRevoke(), protectedBeforeInstallation);
  assert.equal(admin(`SELECT count(*)=2 AND bool_and(lifecycle_state='revoked' AND active=false
    AND target_revision=CASE WHEN id='${id(20)}' THEN 3 ELSE 2 END)
    FROM mobile_science_notification_chains WHERE id IN ('${id(20)}','${id(23)}');`), "t");
  assert.equal(admin(`SELECT count(*) FROM mobile_science_notification_endpoints WHERE installation_id='${id(50)}';`), "0");
  const protectedBeforeUser = protectedRevoke(false);
  assert.equal(runtime(revoke(null)), "3"); // Previously revoked rows also advance; rollback chain does not.
  assert.equal(protectedRevoke(false), protectedBeforeUser);
  assert.equal(admin(`SELECT count(*)=3 AND bool_and(lifecycle_state='revoked' AND active=false
    AND target_revision=CASE id WHEN '${id(20)}'::uuid THEN 4 WHEN '${id(23)}'::uuid THEN 3 ELSE 2 END)
    FROM mobile_science_notification_chains WHERE user_id='${id(1)}' AND lifecycle_state<>'rollback';`), "t");
  assert.equal(admin(`SELECT count(*) FROM mobile_science_notification_endpoints e
    JOIN mobile_science_notification_chains c ON c.id=e.chain_id WHERE c.user_id='${id(1)}';`), "0");
  assert.equal(admin("SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM mobile_science_notification_occurrences o;"), immutableBeforeRevoke);
  // Compare all non-chain/non-endpoint rows, including subscriptions and tokens.
  const beforeRevokeObject = JSON.parse(occurrencesBeforeRevoke);
  const afterRevokeObject = JSON.parse(state("mobile_science_notification_chains"));
  delete beforeRevokeObject.mobile_science_notification_endpoints;
  delete afterRevokeObject.mobile_science_notification_endpoints;
  assert.deepEqual(afterRevokeObject, beforeRevokeObject);
  assert.equal(admin("SELECT count(*) FROM mobile_science_notification_producer_state WHERE provider_send_enabled;"), "0");
  lifecycle.sql("postgres", `DROP DATABASE ${database};`);
  return { ...roleProof, transferCases: cases,
    scopedFunctionCases: { rebind: rebindCases, markShadow: markCases, recordShadow: shadowCases,
      revoke: ["installation_scope", "whole_user_scope", "rollback_chain_preserved_selected_endpoints_removed", "occurrences_preserved"] },
    policy: "selected transferred primary chain cascades its own occurrence; unrelated chains, occurrences and token rows preserved",
    productionProof: false, originalDoubleApplyRollbackRerun: false };
}

async function runIsolated(filename: string, runtimeOnly = false): Promise<void> {
  const destination = receiptDestination(filename); // Every preflight occurs before Docker.
  const sources = loadPinned();
  const authority = runtimeAuthority(sources);
  const owner = crypto.randomBytes(16).toString("hex");
  const database = `r8_isolated_${crypto.randomBytes(16).toString("hex")}`;
  const configDirectory = path.join(destination.directory, `uncreated-r8-docker-config-${owner}`);
  absent(configDirectory); // Docker only reads this deliberately nonexistent config; no ambient auth/context.
  const lifecycle = createLifecycle(realDocker(authority.dockerClient.executable, configDirectory), owner, database);
  const adapter = createAdapter(lifecycle.sql, database, process.pid, sources);
  const startedAt = new Date().toISOString();
  let runFailure: string | null = null;
  let cleanupFailure: string | null = null;
  let fidelity: unknown = null;
  let runtimeChecks: unknown = null;
  try {
    lifecycle.createAndStart();
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (lifecycle.ready()) { ready = true; break; }
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    }
    requireCondition(ready, "isolated_postgres_readiness_timeout");
    fidelity = checkFidelity(lifecycle.sql("postgres", FIDELITY_SQL));
    // This role exists ONLY inside the newly owned cluster, never on a shared server.
    lifecycle.sql("postgres", `CREATE ROLE hourkey_app ${runtimeOnly ? "LOGIN" : "NOLOGIN"} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;`);
    if (runtimeOnly) runtimeChecks = runRuntimeChecks(lifecycle, database, sources[FORWARD]!);
    else runOriginal(adapter, process.pid, sources);
  } catch (error) {
    runFailure = error instanceof Failure ? error.message : "original_assertion_or_unclassified_run_failure";
  } finally {
    try { lifecycle.cleanup(); }
    catch (error) { cleanupFailure = error instanceof Failure ? error.message : "unclassified_cleanup_failure"; }
  }
  const container = lifecycle.report();
  const success = runFailure === null && cleanupFailure === null && container.removed;
  const receipt = {
    schema: runtimeOnly ? "hourkey-r8-isolated-runtime-checks-v1" : "hourkey-r8-isolated-original-migration-v1", evidenceKind: "actual_isolated_postgresql", success,
    startedAt, finishedAt: new Date().toISOString(), authority, isolation: container, databaseFidelity: fidelity,
    ...(runtimeOnly ? { runtimeChecks } : { originalHarness: adapter.report() }), runFailure, cleanupFailure,
    executionAdaptations: runtimeOnly ? ["Unchanged pinned forward SQL applied once in newly owned isolated cluster",
      "Actual psql login as non-superuser hourkey_app; no SET ROLE impersonation",
      "Synthetic token fixture includes native/Expo fields; existing container ownership, no-network and cleanup guards reused"] : ["Pinned original TypeScript transpiled in memory as CommonJS; original never imported",
      "Restricted require exposes assert, randomUUID, exact SQL buffers, guarded execFileSync, pinned actual model constant",
      "Exact original PID-named create/drop mapped to random owned database; no preemptive DROP, IF EXISTS or FORCE",
      "Exact original psql options plus --set=VERBOSITY=verbose; fixture/migration/assertion SQL bytes unchanged",
      "Owned isolated final postgres PID1 verified before pg_isready and every SQL call; temporary entrypoint server cannot qualify",
      "Original target mapped only to newly created exact container ID; fixed local Docker socket and minimal client environment"],
    coverage: runtimeOnly ? { scope: "isolated runtime privileges and five scoped functions on synthetic fixtures only",
      exclusions: ["Installed production catalog fingerprint and complete legacy Ziwei preflight", "API authentication and concurrent transaction races",
        "Astronomy calculation validity, snapshot/hash recomputation and rollout-epoch equivalence",
        "Production migration, provider credentials, phone receipt and release approval"] } : { requiredForwardRuns: 2, requiredRollbackRuns: 1, requiredSqlRejections: REJECTS.map(({ id, sqlstate }) => ({ id, sqlstate })),
      scope: "Only the original pinned harness assertions on its minimal disposable schema; not full production schema or runtime-role proof",
      exclusions: ["Transferred-binding function execution: original fixture lacks expo_push_token/device_push_token",
        "Broad privilege checks beyond original SELECT and INSERT/UPDATE/DELETE checks",
        "Production migration application, provider credentials, real deliveries, phone receipts and release readiness"] },
  };
  try { writeReceipt(destination, receipt); } // New canonical external private file only, exclusive creation.
  catch {
    console.error(JSON.stringify({ status: "R8_ISOLATED_RECEIPT_WRITE_FAILED", receipt: destination.filename,
      containerId: container.containerId, removed: container.removed, runFailure, cleanupFailure }));
    throw new Failure("private_receipt_write_failed_or_incomplete");
  }
  console.log(JSON.stringify({ status: runtimeOnly ? (success ? "R8_ISOLATED_RUNTIME_CHECKS_OK" : "R8_ISOLATED_RUNTIME_CHECKS_FAILED")
    : (success ? "R8_ISOLATED_ORIGINAL_MIGRATION_OK" : "R8_ISOLATED_ORIGINAL_MIGRATION_FAILED"),
    receipt: destination.filename, containerId: container.containerId, removed: container.removed, runFailure, cleanupFailure }));
  requireCondition(success, "isolated_run_or_cleanup_failed_see_private_receipt");
}
function parseCli(args: string[]): { mode: "self-test" } | { mode: "run" | "runtime"; receipt: string } {
  if (args.length === 0 || JSON.stringify(args) === '["--self-test"]') return { mode: "self-test" };
  if (args.length === 3 && args[0] === "--run" && args[1] === "--receipt" && path.isAbsolute(args[2]!)) return { mode: "run", receipt: args[2]! };
  if (args.length === 3 && args[0] === "--run-runtime" && args[1] === "--receipt" && path.isAbsolute(args[2]!)) return { mode: "runtime", receipt: args[2]! };
  throw new Failure("usage_requires_self_test_or_explicit_run_and_absolute_new_private_receipt");
}
function unitTests(): void {
  const sources = loadPinned();
  let checks = 0;
  function check(name: string, action: () => void) {
    try { action(); checks += 1; }
    catch (error) { throw new Failure(`unit_failed:${name}:${error instanceof Failure ? error.message : (error as Error).name}`); }
  }
  const calls: [string, string][] = [];
  const adapter = createAdapter((db, sql) => { calls.push([db, sql]); return ""; }, ownedDatabase, ORIGINAL_PID);
  adapter.execFileSync("docker", originalArgs("postgres"), options(`DROP DATABASE IF EXISTS ${originalDatabase} WITH (FORCE); CREATE DATABASE ${originalDatabase};`));
  assert.deepEqual(calls, [["postgres", `CREATE DATABASE ${ownedDatabase};`]], "replace only original lifecycle; never execute its preemptive DROP or FORCE");
  assert.throws(() => adapter.execFileSync("docker", originalArgs("production"), options("SELECT 1")));
  assert.throws(() => adapter.assertHealthy(), "swallowed guard failures remain fatal");
  assert.throws(() => checkIdentity({ Id: "existing-production-id" }, "a".repeat(64), "r8-test", "owned-label"),
    "refuse mismatched container identity before start, SQL, stop, or removal");
  checks += 2;
  const createSql = `DROP DATABASE IF EXISTS ${originalDatabase} WITH (FORCE); CREATE DATABASE ${originalDatabase};`;
  const dropSql = `DROP DATABASE IF EXISTS ${originalDatabase} WITH (FORCE);`;
  for (const [name, command, argv, config] of [
    ["wrong_executable", "psql", originalArgs("postgres"), options(createSql)],
    ["wrong_container", "docker", originalArgs("postgres").map((value) => value === "decode-postgres" ? "production" : value), options(createSql)],
    ["wrong_user", "docker", originalArgs("postgres").map((value) => value === "decode_user" ? "postgres" : value), options(createSql)],
    ["extra_argv", "docker", [...originalArgs("postgres"), "--host=production"], options(createSql)],
    ["extra_options", "docker", originalArgs("postgres"), { ...options(createSql), env: {} }],
    ["changed_lifecycle", "docker", originalArgs("postgres"), options(`${createSql} SELECT 1;`)],
    ["drop_before_create", "docker", originalArgs("postgres"), options(dropSql)],
    ["foreign_database", "docker", originalArgs("production"), options("SELECT 1")],
  ] as [string, string, string[], ExecOptions][]) check(name, () => {
    let invoked = 0;
    const target = createAdapter(() => { invoked += 1; return ""; }, ownedDatabase, ORIGINAL_PID, sources);
    assert.throws(() => target.execFileSync(command, argv, config));
    assert.equal(invoked, 0);
    assert.throws(() => target.assertHealthy());
  });
  check("database_collision_never_dropped", () => {
    const sqls: string[] = [];
    const target = createAdapter((_db, sql) => { sqls.push(sql); throw new SqlFailure(3, "42P04"); }, ownedDatabase, ORIGINAL_PID, sources);
    assert.throws(() => target.execFileSync("docker", originalArgs("postgres"), options(createSql)));
    assert.throws(() => target.execFileSync("docker", originalArgs("postgres"), options(dropSql)));
    assert.equal(sqls.length, 1); assert.doesNotMatch(sqls[0]!, /DROP|FORCE/u);
    assert.throws(() => target.assertHealthy());
  });
  for (const [name, error] of [
    ["infrastructure_not_rejection", new SqlFailure(1, null)],
    ["wrong_sqlstate_not_rejection", new SqlFailure(3, "08006")],
    ["wrong_status_not_rejection", new SqlFailure(1, "23514")],
    ["unknown_error_not_rejection", new Error("private fixture must not appear")],
  ] as [string, Error][]) check(name, () => {
    const target = createAdapter((_db, sql) => { if (sql.startsWith("CREATE DATABASE")) return ""; throw error; }, ownedDatabase, ORIGINAL_PID, sources);
    target.execFileSync("docker", originalArgs("postgres"), options(createSql));
    try { target.execFileSync("docker", originalArgs(originalDatabase), options("UPDATE mobile_science_notification_producer_state SET provider_send_enabled=true")); } catch { /* Simulate original rejectsSql. */ }
    assert.throws(() => target.assertHealthy());
    assert.equal(target.report().expectedRejects.length, 0);
    assert.doesNotMatch(JSON.stringify(target.report()), /private fixture/u);
  });
  check("expected_rejection_missing_stays_fatal", () => {
    const target = createAdapter(() => "", ownedDatabase, ORIGINAL_PID, sources);
    target.execFileSync("docker", originalArgs("postgres"), options(createSql));
    assert.throws(() => target.execFileSync("docker", originalArgs(originalDatabase), options("DELETE FROM mobile_science_notification_occurrences")));
    assert.throws(() => target.assertHealthy());
  });
  check("unchanged_complete_original_control_flow", () => {
    // Simulated SQL responses exercise the ORIGINAL JS assertions and adapter.
    // These are not PostgreSQL results, and are never emitted as a receipt.
    const fixtureId = "00000000-0000-4000-8000-000000000001";
    const audience = "A".repeat(32);
    let deleted = false;
    const sqls: string[] = [];
    const target = createAdapter((_db, sql) => {
      sqls.push(sql);
      const reject = REJECTS.find((item) => item.pattern.test(sql));
      if (reject) throw new SqlFailure(3, reject.sqlstate);
      if (sql.startsWith("SELECT source_digest")) return modelDigest(sources);
      if (sql.startsWith("SELECT has_table_privilege")) return sql.endsWith("'SELECT')") ? "t" : "f";
      if (sql.startsWith("SELECT has_function_privilege")) return "t";
      if (sql.includes("RETURNING id") || sql.includes("RETURNING chain_id")) return fixtureId;
      if (sql.startsWith("SELECT astronomy_fact_audience_binding")) return audience;
      if (sql.startsWith("SELECT hourkey_r8_rebind_primary_token")) return "1";
      if (sql.startsWith("SELECT primary_token_id")) return fixtureId;
      if (sql.startsWith("SELECT token_id::text")) return `${fixtureId}:${audience}:2`;
      if (sql.includes("SELECT jsonb_build_object")) return "{\"simulated\":true}";
      if (sql.startsWith("DELETE FROM users")) { deleted = true; return ""; }
      if (sql === "SELECT count(*) FROM mobile_science_notification_occurrences") return deleted ? "0" : "1";
      if (sql.startsWith("SELECT count(*)")) return "0";
      if (sql.startsWith("SELECT lifecycle_state")) return "rollback";
      if (sql.startsWith("SELECT active")) return "f";
      return "";
    }, ownedDatabase, ORIGINAL_PID, sources);
    runOriginal(target, ORIGINAL_PID, sources);
    assert.equal(sqls.filter((sql) => sql === sources[FORWARD]).length, 2);
    assert.equal(sqls.filter((sql) => sql === sources[ROLLBACK]).length, 1);
    assert.equal(target.report().expectedRejects.length, 7);
    assert.equal(sqls[0], `CREATE DATABASE ${ownedDatabase};`);
    assert.equal(sqls.at(-1), `DROP DATABASE ${ownedDatabase};`);
    assert.throws(() => target.execFileSync("docker", originalArgs(originalDatabase), options("SELECT 1")));
  });
  check("pin_before_execution", () => {
    const target = createAdapter(() => { throw new Error("must not execute"); }, ownedDatabase, ORIGINAL_PID, sources);
    assert.throws(() => runOriginal(target, ORIGINAL_PID, { ...sources, [ORIGINAL]: `${sources[ORIGINAL]}\nrequire('node:net')` }), /pin_mismatch/u);
    assert.throws(() => modelDigest({ ...sources, [MODEL]: `${sources[MODEL]}\nthrow new Error('never execute')` }), /pin_mismatch/u);
    assert.equal(target.report().statements.length, 0);
  });
  const owner = "b".repeat(32);
  const name = `hourkey-r8-isolated-${owner}`;
  const id = "a".repeat(64);
  const fakeImage = { Id: IMAGE, Os: "linux", Config: { Volumes: { "/var/lib/postgresql/data": {} }, ExposedPorts: { "5432/tcp": {} }, Env: ["PATH=/usr/local/bin:/usr/bin:/bin"], Entrypoint: ["docker-entrypoint.sh"], Cmd: ["postgres"] } };
  function fakeDocker() {
    let removed = false;
    const processState = { pid1Comm: "postgres\n" };
    const inspection: Inspection = {
      Id: id, Image: IMAGE, Name: `/${name}`, State: { Running: false }, Mounts: [], NetworkSettings: { Ports: { "5432/tcp": null }, Networks: {} },
      Config: { Image: IMAGE, Labels: { [LABEL]: owner }, User: "70:70", StopSignal: "SIGINT", OpenStdin: false, Tty: false,
        Entrypoint: ["docker-entrypoint.sh"], Cmd: ["postgres"], Healthcheck: { Test: ["NONE"] }, Env: expectedEnvironment(fakeImage), Volumes: { "/var/lib/postgresql/data": {} }, ExposedPorts: { "5432/tcp": {} } },
      HostConfig: { NetworkMode: "none", ReadonlyRootfs: true, Privileged: false, PublishAllPorts: false, AutoRemove: false,
        RestartPolicy: { Name: "no" }, Memory: 536870912, MemorySwap: 536870912, NanoCpus: 1_000_000_000, PidsLimit: 128, ShmSize: 16777216,
        CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"], LogConfig: { Type: "none" }, IpcMode: "private", Tmpfs: { ...TMPFS } },
    };
    const calls: string[][] = [];
    const execute: DockerExecutor = (args) => {
      calls.push(args);
      if (args[0] === "image") { assert.equal(args[2], IMAGE); return JSON.stringify([fakeImage]); }
      if (args[0] === "create") { assert.deepEqual(args, createArguments(name, owner)); return id; }
      if (args[0] === "container") { assert.equal(args[2], id); assert.equal(removed, false); return JSON.stringify([inspection]); }
      if (args[0] === "start") { assert.equal(args[1], id); inspection.State.Running = true; return id; }
      if (args[0] === "stop") { assert.deepEqual(args, ["stop", "--timeout=-1", id]); inspection.State.Running = false; return id; }
      if (args[0] === "rm") { assert.deepEqual(args, ["rm", id]); assert.equal(inspection.State.Running, false); removed = true; return id; }
      if (args[0] === "exec") {
        assert.equal(args[1] === "-i" ? args[2] : args[1], id);
        if (args[2] === "cat") { assert.deepEqual(args, ["exec", id, "cat", "/proc/1/comm"]); return processState.pid1Comm; }
        if (args[2] === "pg_isready") return "";
        assert.equal(args[1], "-i"); assert.equal(args[3], "psql"); return "";
      }
      throw new Failure("unexpected_fake_docker_command");
    };
    return { execute, inspection, calls, processState };
  }
  check("temporary_postgres_cannot_satisfy_readiness_or_sql", () => {
    const fake = fakeDocker(); fake.processState.pid1Comm = "bash\n";
    const lifecycle = createLifecycle(fake.execute, owner);
    lifecycle.createAndStart();
    assert.equal(lifecycle.ready(), false, "temporary socket server is not the final PID1 postgres");
    assert.equal(fake.calls.some((argv) => argv[0] === "exec" && argv[2] === "pg_isready"), false);
    assert.throws(() => lifecycle.sql(ownedDatabase, "SELECT 1"));
    assert.equal(fake.calls.some((argv) => argv[0] === "exec" && argv[1] === "-i"), false);
    fake.processState.pid1Comm = "postgres\n";
    assert.equal(lifecycle.ready(), true);
    lifecycle.sql(ownedDatabase, "SELECT 1"); lifecycle.cleanup();
  });
  check("entrypoint_comm_is_not_ready", () => {
    const fake = fakeDocker(); fake.processState.pid1Comm = "docker-entrypoi\n";
    const lifecycle = createLifecycle(fake.execute, owner); lifecycle.createAndStart();
    assert.equal(lifecycle.ready(), false);
    assert.throws(() => lifecycle.sql(ownedDatabase, "SELECT 1"));
    assert.equal(fake.calls.some((argv) => argv[0] === "exec" && (argv[1] === "-i" || argv[2] === "pg_isready")), false);
    lifecycle.cleanup();
  });
  for (const comm of ["", "postgres", "postgres\nextra\n", "sh\n", "unknown\n"]) check(`unexpected_pid1_${JSON.stringify(comm)}`, () => {
    const fake = fakeDocker(); fake.processState.pid1Comm = comm;
    const lifecycle = createLifecycle(fake.execute, owner); lifecycle.createAndStart();
    assert.throws(() => lifecycle.ready(), /unexpected_pid1_process/u);
    assert.throws(() => lifecycle.sql(ownedDatabase, "SELECT 1"), /unexpected_pid1_process/u);
    assert.equal(fake.calls.some((argv) => argv[0] === "exec" && (argv[1] === "-i" || argv[2] === "pg_isready")), false);
    lifecycle.cleanup();
  });
  check("ownership_and_isolation_precede_pid1_inspection", () => {
    for (const corrupt of [(value: Inspection) => { value.Config.Labels[LABEL] = "foreign"; },
      (value: Inspection) => { value.HostConfig.NetworkMode = "host"; }]) {
      const fake = fakeDocker(); const lifecycle = createLifecycle(fake.execute, owner);
      lifecycle.createAndStart(); corrupt(fake.inspection);
      assert.throws(() => lifecycle.ready()); assert.throws(() => lifecycle.sql(ownedDatabase, "SELECT 1"));
      assert.equal(fake.calls.some((argv) => argv[0] === "exec"), false);
    }
  });
  check("owned_lifecycle_and_psql_mapping", () => {
    const fake = fakeDocker();
    const lifecycle = createLifecycle(fake.execute, owner);
    lifecycle.createAndStart(); assert.equal(lifecycle.ready(), true);
    assert.throws(() => lifecycle.sql("r8_isolated_" + "f".repeat(32), "SELECT 1"));
    lifecycle.sql(ownedDatabase, "SELECT 1"); lifecycle.cleanup();
    assert.equal(lifecycle.report().removed, true);
    assert.deepEqual(fake.calls.find((argv) => argv[0] === "exec" && argv[1] === "-i"),
      ["exec", "-i", id, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", ownedDatabase, "-Atq", "--set=VERBOSITY=verbose"]);
    assert.throws(() => lifecycle.sql(ownedDatabase, "SELECT 1"));
    assert.throws(() => lifecycle.cleanup());
  });
  check("runtime_login_is_scoped_to_owned_database", () => {
    const fake = fakeDocker();
    const lifecycle = createLifecycle(fake.execute, owner);
    lifecycle.createAndStart(); assert.equal(lifecycle.ready(), true);
    lifecycle.sql(ownedDatabase, "SELECT current_user,session_user", "hourkey_app");
    assert.deepEqual(fake.calls.find((argv) => argv[0] === "exec" && argv[1] === "-i"),
      ["exec", "-i", id, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "hourkey_app", "-d", ownedDatabase, "-Atq", "--set=VERBOSITY=verbose"]);
    assert.throws(() => lifecycle.sql("postgres", "SELECT 1", "hourkey_app"));
    lifecycle.cleanup();
  });
  const corruptions: [string, (inspection: Inspection) => void][] = [
    ["identity", (value) => { value.Id = "c".repeat(64); }],
    ["owner_label", (value) => { value.Config.Labels[LABEL] = "foreign"; }],
    ["image", (value) => { value.Image = "sha256:" + "c".repeat(64); }],
    ["network", (value) => { value.HostConfig.NetworkMode = "host"; }],
    ["root_writable", (value) => { value.HostConfig.ReadonlyRootfs = false; }],
    ["bind_mount", (value) => { value.HostConfig.Binds = ["/var/run/docker.sock:/socket"]; }],
    ["unbounded_tmpfs", (value) => { value.HostConfig.Tmpfs["/tmp"] = "rw"; }],
    ["wrong_uid", (value) => { value.Config.User = "0:0"; }],
    ["host_environment", (value) => { value.Config.Env.push("PGPASSWORD=forbidden"); }],
    ["published_port", (value) => { value.HostConfig.PortBindings = { "5432/tcp": [{ HostPort: "5432" }] }; }],
    ["actual_port_mapping", (value) => { value.NetworkSettings.Ports["5432/tcp"] = [{ HostIp: "0.0.0.0", HostPort: "5432" }]; }],
    ["extra_exposed_port", (value) => { value.Config.ExposedPorts["8080/tcp"] = {}; }],
    ["extra_null_port", (value) => { value.NetworkSettings.Ports["8080/tcp"] = null; }],
    ["unbounded_memory", (value) => { value.HostConfig.Memory = 0; }],
    ["extra_volume", (value) => { value.Mounts.push({ Type: "volume", Source: "existing", Destination: "/other", RW: true }); }],
  ];
  for (const [name, corrupt] of corruptions) check(`reject_before_start_${name}`, () => {
    const fake = fakeDocker(); corrupt(fake.inspection);
    const lifecycle = createLifecycle(fake.execute, owner);
    assert.throws(() => lifecycle.createAndStart());
    assert.equal(fake.calls.some((argv) => argv[0] === "start" || argv[0] === "exec"), false);
  });
  check("recheck_isolation_before_sql", () => {
    const fake = fakeDocker(); const lifecycle = createLifecycle(fake.execute, owner);
    lifecycle.createAndStart(); fake.inspection.HostConfig.Privileged = true;
    assert.throws(() => lifecycle.sql(ownedDatabase, "SELECT 1"));
    assert.equal(fake.calls.some((argv) => argv[0] === "exec"), false);
    lifecycle.cleanup(); // The exact container remains ours; safe to contain it without starting/SQL.
  });
  check("cleanup_refuses_changed_owner", () => {
    const fake = fakeDocker(); const lifecycle = createLifecycle(fake.execute, owner);
    lifecycle.createAndStart(); fake.inspection.Config.Labels[LABEL] = "foreign";
    assert.throws(() => lifecycle.cleanup());
    assert.equal(fake.calls.some((argv) => argv[0] === "stop" || argv[0] === "rm"), false);
  });
  for (const failure of ["stop_timeout", "stop_still_running", "remove_failure"]) check(failure, () => {
    const fake = fakeDocker();
    const lifecycle = createLifecycle((argv, input) => {
      if (argv[0] === "stop" && failure === "stop_timeout") throw new SqlFailure(null, null);
      if (argv[0] === "stop" && failure === "stop_still_running") return id;
      if (argv[0] === "rm" && failure === "remove_failure") throw new SqlFailure(1, null);
      return fake.execute(argv, input);
    }, owner);
    lifecycle.createAndStart(); assert.throws(() => lifecycle.cleanup());
    assert.equal(lifecycle.report().removed, false);
    if (failure !== "remove_failure") assert.equal(fake.calls.some((argv) => argv[0] === "rm"), false);
  });
  check("identity_rechecked_after_graceful_stop", () => {
    const fake = fakeDocker();
    const lifecycle = createLifecycle((argv, input) => {
      const output = fake.execute(argv, input);
      if (argv[0] === "stop") fake.inspection.Config.Labels[LABEL] = "foreign";
      return output;
    }, owner);
    lifecycle.createAndStart(); assert.throws(() => lifecycle.cleanup());
    assert.equal(fake.calls.some((argv) => argv[0] === "rm"), false);
  });
  check("failed_isolation_cleans_only_unstarted_owned_id", () => {
    const fake = fakeDocker(); fake.inspection.HostConfig.NetworkMode = "host";
    const lifecycle = createLifecycle(fake.execute, owner);
    assert.throws(() => lifecycle.createAndStart()); lifecycle.cleanup();
    assert.equal(lifecycle.report().removed, true);
    assert.equal(fake.calls.some((argv) => ["start", "stop", "exec"].includes(argv[0]!)), false);
  });
  check("missing_create_id_never_resolved_by_generic_name", () => {
    const fake = fakeDocker();
    const lifecycle = createLifecycle((argv, input) => argv[0] === "create" ? "" : fake.execute(argv, input), owner);
    assert.throws(() => lifecycle.createAndStart()); lifecycle.cleanup();
    assert.equal(lifecycle.report().removed, false);
    assert.equal(fake.calls.some((argv) => ["container", "start", "stop", "rm", "exec"].includes(argv[0]!)), false);
  });
  check("encoding_and_locale_fidelity", () => {
    const expected = { serverVersionNum: "160013", encoding: "UTF8", timezone: "UTC", databaseLocale: ["postgres", "template1"].map((name) =>
      ({ name, encoding: "UTF8", collation: "en_US.utf8", ctype: "en_US.utf8" })) };
    assert.deepEqual(checkFidelity(JSON.stringify(expected)), expected);
    assert.throws(() => checkFidelity(JSON.stringify({ ...expected, encoding: "SQL_ASCII" })));
    assert.throws(() => checkFidelity(JSON.stringify({ ...expected, timezone: "Asia/Bangkok" })));
    const wrongLocale = structuredClone(expected); wrongLocale.databaseLocale[1]!.collation = "C";
    assert.throws(() => checkFidelity(JSON.stringify(wrongLocale)));
  });
  check("explicit_cli_only_and_private_new_receipt", () => {
    assert.deepEqual(parseCli([]), { mode: "self-test" });
    assert.deepEqual(parseCli(["--self-test"]), { mode: "self-test" });
    assert.deepEqual(parseCli(["--run", "--receipt", "/private/new.json"]), { mode: "run", receipt: "/private/new.json" });
    assert.deepEqual(parseCli(["--run-runtime", "--receipt", "/private/new.json"]), { mode: "runtime", receipt: "/private/new.json" });
    for (const argv of [["--run"], ["--run", "--receipt", "relative.json"], ["--receipt", "/private/new.json"], ["--self-test", "--run"], ["--run", "--receipt", "/private/new.json", "--force"]]) assert.throws(() => parseCli(argv));
    assert.throws(() => receiptDestination("relative.json"));
    assert.throws(() => receiptDestination(path.join(ROOT, "package.json")));
    assert.throws(() => receiptDestination(`/tmp/r8-isolated-must-not-create-${owner}.json`));
    assert.throws(() => absent(path.join(ROOT, "package.json")));
  });
  console.log(`R8_ISOLATED_ADAPTER_UNIT_OK checks=${checks} (fake executor only; no migration evidence)`);
}
try {
  const mode = parseCli(process.argv.slice(2));
  if (mode.mode === "self-test") unitTests();
  else await runIsolated(mode.receipt, mode.mode === "runtime");
} catch (error) {
  // Failure diagnostics never include raw Docker stderr, SQL, or fixture IDs.
  console.error(error instanceof Failure ? error.message : "unclassified_isolated_harness_failure");
  process.exitCode = 1;
}
