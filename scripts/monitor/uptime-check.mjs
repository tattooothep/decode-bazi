#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

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

await mkdir(stateDir, { recursive: true, mode: 0o700 });
let previous = { consecutiveFailures: 0, alerted: false };
try { previous = JSON.parse(await readFile(statePath, "utf8")); } catch {}

const checks = await Promise.all(targets.map(probe));
const failed = checks.filter((check) => !check.ok);
const state = {
  checkedAt: new Date().toISOString(),
  healthy: failed.length === 0,
  consecutiveFailures: failed.length ? Number(previous.consecutiveFailures || 0) + 1 : 0,
  alerted: failed.length ? Boolean(previous.alerted) : false,
  checks,
};

if (state.consecutiveFailures >= 2 && !state.alerted) {
  await notify({ service: "hourkey", event: "unhealthy", checks: failed, checkedAt: state.checkedAt });
  state.alerted = true;
}
if (!failed.length && previous.alerted) {
  await notify({ service: "hourkey", event: "recovered", checks, checkedAt: state.checkedAt });
}

const tempPath = `${statePath}.${process.pid}.tmp`;
await writeFile(tempPath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
await rename(tempPath, statePath);
console.log(JSON.stringify(state));
if (failed.length) process.exitCode = 1;
