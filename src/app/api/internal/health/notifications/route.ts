import { timingSafeEqual } from "crypto";
import { readFileSync, statSync } from "fs";
import { Client } from "pg";
import { NextResponse } from "next/server";

const { collectHealth: collectNotificationHealth } = require("../../../../../lib/notification-observability.cjs") as {
  collectHealth: (db: unknown, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};
const { readSchedulerHeartbeats } = require("../../../../../lib/notification-scheduler-heartbeat.cjs") as {
  readSchedulerHeartbeats: (directory?: string) => Record<string, string | null>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteDependencies = {
  db?: { connect?: () => Promise<void>; end?: () => Promise<void> };
  createDb?: () => { connect?: () => Promise<void>; end?: () => Promise<void> };
  collectHealth?: (db: unknown, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  env?: NodeJS.ProcessEnv;
};

function authorized(req: Request, env: NodeJS.ProcessEnv): boolean {
  const expected = env.HOURKEY_INTERNAL_JOB_TOKEN || "";
  const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readHeartbeat(file: string | undefined): string | null {
  if (!file) return null;
  try { return statSync(file).mtime.toISOString(); } catch { return null; }
}

function providerReadiness(env: NodeJS.ProcessEnv): { fcm: boolean; expo: boolean } {
  const keyPath = env.FCM_SERVICE_ACCOUNT_PATH || "/root/secrets/hourkey-fcm-service-account.json";
  try {
    const credential = JSON.parse(readFileSync(keyPath, "utf8"));
    const fcm = ["private_key", "client_email", "project_id", "token_uri"]
      .every((key) => typeof credential?.[key] === "string" && credential[key].trim());
    return { fcm, expo: true };
  } catch {
    return { fcm: false, expo: true };
  }
}

function createDb(env: NodeJS.ProcessEnv) {
  return new Client({
    host: env.PGHOST || "127.0.0.1", port: Number(env.PGPORT || 5433),
    database: env.PGDATABASE || "decode_db", user: env.PGUSER || "decode_user", password: env.PGPASSWORD,
  });
}

export async function POST(req: Request, dependencies: RouteDependencies = {}) {
  const env = dependencies.env || process.env;
  if (!authorized(req, env)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const db = dependencies.db || (dependencies.createDb || (() => createDb(env)))();
  const ownsDb = !dependencies.db;
  try {
    if (ownsDb) await db.connect?.();
    const report = await (dependencies.collectHealth || collectNotificationHealth)(db, {
      heartbeat: {
        workerAt: readHeartbeat(env.NOTIFICATION_WORKER_HEARTBEAT_FILE || "/var/lib/hourkey-notification/retry-receipt.heartbeat"),
        schedulers: readSchedulerHeartbeats(env.NOTIFICATION_SCHEDULER_HEARTBEAT_DIR),
      },
      providerReady: providerReadiness(env),
    });
    return NextResponse.json(report, { status: report.ok === true ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false, error: "notification_health_unavailable" }, { status: 503 });
  } finally {
    if (ownsDb) await db.end?.().catch(() => null);
  }
}

export { authorized, providerReadiness, readHeartbeat };
