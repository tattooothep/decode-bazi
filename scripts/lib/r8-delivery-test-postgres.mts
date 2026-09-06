import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, chown, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import pg from "pg";

// Importing this module does not inspect Docker, read credentials or start work.
const IMAGE = "sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50";
const OWNER_LABEL = "io.hourkey.r8-delivery-test.owner";
const DATABASE = "r8_delivery_test";
const PASSWORD = "disposable-r8-test-only";
const execute = promisify(execFile);
type Inspection = {
  Id: string; Name: string; Image: string;
  Config: { Labels: Record<string, string> };
  HostConfig: { NetworkMode: string; PortBindings: Record<string, unknown> | null };
  Mounts: { Type: string; Source: string; Destination: string }[];
  State: { Running: boolean; Pid: number };
};

/** Linux/root-only, disposable PostgreSQL 16; never connects to installed PG settings. */
export async function withR8DeliveryTestPostgres(callback: (pool: pg.Pool) => Promise<void>): Promise<void> {
  if (process.platform !== "linux" || process.getuid?.() !== 0) throw new Error("R8 test PostgreSQL requires Linux/root for its UID 70 socket directory");
  if (typeof callback !== "function") throw new TypeError("R8 test PostgreSQL requires a callback");
  if (await realpath("/tmp") !== "/tmp") throw new Error("R8 test PostgreSQL requires canonical /tmp");
  const directory = await mkdtemp("/tmp/hourkey-r8-delivery-pg-");
  const socket = join(directory, "socket");
  const dockerConfig = join(directory, "docker-config");
  const owner = randomUUID();
  const name = `hourkey-r8-delivery-test-${owner}`;
  let containerId: string | null = null;
  let creationAttempted = false;
  let pool: pg.Pool | null = null;
  let primaryFailure: unknown;
  let failed = false;
  const childEnvironment = Object.freeze({ PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" });
  async function docker(args: string[]): Promise<string> {
    const result = await execute("/usr/bin/docker", ["--host", "unix:///var/run/docker.sock", "--config", dockerConfig, ...args], {
      env: childEnvironment, timeout: 15_000, maxBuffer: 1024 * 1024,
    });
    return result.stdout.trim();
  }
  async function inspectOwned(): Promise<Inspection> {
    const rows = JSON.parse(await docker(["inspect", "--type", "container", containerId ?? name])) as Inspection[];
    const info = rows[0];
    const binds = info?.Mounts?.filter(mount => mount.Type === "bind");
    if (rows.length !== 1 || !info || !/^[a-f0-9]{64}$/u.test(info.Id)
      || (containerId !== null && info.Id !== containerId) || info.Name !== `/${name}`
      || info.Image !== IMAGE || info.Config?.Labels?.[OWNER_LABEL] !== owner
      || info.HostConfig?.NetworkMode !== "none" || Object.keys(info.HostConfig.PortBindings ?? {}).length !== 0
      || binds?.length !== 1 || binds[0].Source !== socket || binds[0].Destination !== "/var/run/postgresql") {
      throw new Error("R8 test container identity/isolation mismatch; refusing lifecycle operation");
    }
    containerId = info.Id;
    return info;
  }
  async function isFinalPostgres(info: Inspection): Promise<boolean> {
    if (!info.State.Running || !Number.isSafeInteger(info.State.Pid) || info.State.Pid < 1) return false;
    return (await readFile(`/proc/${info.State.Pid}/comm`, "utf8")).trim() === "postgres";
  }

  try {
    await chmod(directory, 0o700);
    await mkdir(dockerConfig, { mode: 0o700 });
    await mkdir(socket, { mode: 0o700 });
    await chown(socket, 70, 70);
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.uid !== 0 || (metadata.mode & 0o777) !== 0o700
      || await realpath(socket) !== socket || (await readdir(socket)).length !== 0) {
      throw new Error("R8 test socket ownership/path validation failed");
    }
    creationAttempted = true;
    const created = await docker([
      "create", "--pull=never", "--name", name, "--label", `${OWNER_LABEL}=${owner}`,
      "--network=none", "--memory=512m", "--memory-swap=512m", "--cpus=1", "--pids-limit=128",
      "--read-only", "--user=70:70", "--cap-drop=ALL", "--security-opt=no-new-privileges",
      "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,nodev,noexec,size=256m,uid=70,gid=70,mode=0700",
      "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=16m,uid=70,gid=70,mode=0700",
      "--mount", `type=bind,source=${socket},target=/var/run/postgresql`,
      "--env", "PGDATA=/var/lib/postgresql/data", "--env", `POSTGRES_USER=${DATABASE}`,
      "--env", `POSTGRES_DB=${DATABASE}`, "--env", `POSTGRES_PASSWORD=${PASSWORD}`,
      "--env", "POSTGRES_INITDB_ARGS=--auth-local=trust --auth-host=reject",
      IMAGE, "postgres", "-c", "listen_addresses=", "-c", "unix_socket_directories=/var/run/postgresql",
      "-c", "unix_socket_permissions=0700", "-c", "max_connections=12", "-c", "shared_buffers=32MB",
    ]);
    if (!/^[a-f0-9]{64}$/u.test(created)) throw new Error("Docker did not return an exact container ID");
    containerId = created;
    await inspectOwned();
    await docker(["start", containerId]);
    const deadline = Date.now() + 45_000;
    let ready = false;
    while (Date.now() < deadline) {
      const info = await inspectOwned();
      if (!info.State.Running) throw new Error("R8 disposable PostgreSQL exited during initialization");
      if (await isFinalPostgres(info)) {
        try {
          await docker(["exec", containerId!, "pg_isready", "-h", "/var/run/postgresql", "-p", "5432", "-U", DATABASE, "-d", DATABASE]);
          ready = true;
          break;
        } catch { /* Startup readiness only; never redirects to another database. */ }
      }
      await delay(100);
    }
    if (!ready) throw new Error("R8 disposable PostgreSQL did not reach final PID 1 readiness");
    pool = new pg.Pool({
      host: socket, port: 5432, database: DATABASE, user: DATABASE, password: PASSWORD, ssl: false,
      max: 4, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 1_000, allowExitOnIdle: true,
      application_name: "r8-delivery-disposable-test",
      options: "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000 -c client_encoding=UTF8",
    });
    pool.on("error", error => {
      if (!failed) { failed = true; primaryFailure = error; }
    });
    const identity = await pool.query("SELECT current_database() AS db, current_user AS usr, inet_server_addr() AS addr, current_setting('server_version_num')::int AS version");
    const row = identity.rows[0];
    if (identity.rowCount !== 1 || row.db !== DATABASE || row.usr !== DATABASE || row.addr !== null
      || row.version < 160000 || row.version >= 170000 || !await isFinalPostgres(await inspectOwned())) {
      throw new Error("R8 disposable PostgreSQL connection identity mismatch");
    }
    await callback(pool);
  } catch (error) {
    failed = true;
    primaryFailure = error;
  }

  const cleanupFailures: unknown[] = [];
  if (pool) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        pool.end(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("R8 test pool did not drain within 5 seconds")), 5_000); }),
      ]);
    } catch (error) { cleanupFailures.push(error); }
    finally { clearTimeout(timer); }
  }
  if (creationAttempted) {
    try {
      const info = await inspectOwned();
      // -1 waits for orderly PostgreSQL shutdown; no forced kill or forced rm.
      if (info.State.Running) await docker(["stop", "--time=-1", containerId!]);
      if ((await inspectOwned()).State.Running) throw new Error("R8 test container is still running; refusing removal");
      await docker(["rm", containerId!]);
    } catch (error) { cleanupFailures.push(error); }
  }
  if (cleanupFailures.length === 0) {
    try {
      // Only remove empty, exactly-owned temporary directories. Never recurse.
      for (const path of [socket, dockerConfig]) {
        try { await rmdir(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      await rmdir(directory);
    } catch (error) { cleanupFailures.push(error); }
  }
  if (cleanupFailures.length > 0) {
    const evidencePath = join(directory, "cleanup-failure.json");
    try {
      await writeFile(evidencePath, JSON.stringify({
        name, containerId, ownerLabel: OWNER_LABEL, owner, image: IMAGE, directory, socket,
        primaryFailure: failed ? String(primaryFailure) : null,
        cleanupFailures: cleanupFailures.map(String),
      }, null, 2), { mode: 0o600, flag: "wx" });
    } catch (error) { cleanupFailures.push(error); }
    throw new AggregateError(failed ? [primaryFailure, ...cleanupFailures] : cleanupFailures,
      `R8 disposable PostgreSQL cleanup incomplete; preserve and inspect ${evidencePath}`);
  }
  if (failed) throw primaryFailure;
}
