#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd(), false, console);

const stateDir = process.env.HOURKEY_MONITOR_STATE_DIR || "/var/lib/hourkey-monitor";
const statePath = `${stateDir}/state.json`;
const targets = [3349, 3350, 3351, 3352].map((port) => ({
  name: `web-${port}`,
  url: `http://127.0.0.1:${port}/api/health`,
}));
targets.push({ name: "public", url: "https://hourkey.io/api/health" });

async function probe(target) {
  const started = Date.now();
  try {
    const response = await fetch(target.url, { signal: AbortSignal.timeout(5_000), cache: "no-store" });
    return { ...target, ok: response.ok, status: response.status, ms: Date.now() - started };
  } catch (error) {
    return { ...target, ok: false, status: 0, ms: Date.now() - started, error: String(error?.message || error).slice(0, 160) };
  }
}

async function notify(payload) {
  const url = process.env.HOURKEY_ALERT_WEBHOOK;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5_000),
  }).catch((error) => console.error("monitor_notify_failed", error.message));
}

async function enqueueSystemEvent(eventType, incidentId, failedChecks) {
  const db = new pg.Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || "decode_db",
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  try {
    await db.connect();
    const recovered = eventType === "service_recovered";
    await db.query(
      `INSERT INTO notification_events
        (event_type,severity,audience_kind,audience_roles,required_permission,dedupe_key,target_url,payload)
       VALUES ($1,$2,'admin',$3::text[],'admin.dashboard.read',$4,'/admin',$5::jsonb)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [eventType, recovered ? "info" : "critical", ["ops", "superadmin"], `${eventType}:${incidentId}`,
       JSON.stringify({ incident_id: incidentId, services: failedChecks.map((x) => x.name).slice(0, 10) })]
    );
  } catch (error) {
    console.error("monitor_outbox_failed", String(error?.message || error));
  } finally {
    await db.end().catch(() => {});
  }
}

await mkdir(stateDir, { recursive: true, mode: 0o700 });
let previous = { consecutiveFailures: 0, alerted: false };
try { previous = JSON.parse(await readFile(statePath, "utf8")); } catch {}

const checks = await Promise.all(targets.map(probe));
const failed = checks.filter((check) => !check.ok);
const incidentId = failed.length
  ? (previous.incidentId || new Date().toISOString().slice(0, 16))
  : (previous.incidentId || null);
const state = {
  checkedAt: new Date().toISOString(),
  healthy: failed.length === 0,
  consecutiveFailures: failed.length ? Number(previous.consecutiveFailures || 0) + 1 : 0,
  alerted: failed.length ? Boolean(previous.alerted) : false,
  incidentId: failed.length ? incidentId : null,
  checks,
};

if (state.consecutiveFailures >= 2 && !state.alerted) {
  await notify({ service: "hourkey", event: "unhealthy", checks: failed, checkedAt: state.checkedAt });
  await enqueueSystemEvent("service_unhealthy", incidentId, failed);
  state.alerted = true;
}
if (!failed.length && previous.alerted) {
  await notify({ service: "hourkey", event: "recovered", checks, checkedAt: state.checkedAt });
  await enqueueSystemEvent("service_recovered", incidentId || state.checkedAt, []);
}

const tempPath = `${statePath}.${process.pid}.tmp`;
await writeFile(tempPath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
await rename(tempPath, statePath);
console.log(JSON.stringify(state));
if (failed.length) process.exitCode = 1;
