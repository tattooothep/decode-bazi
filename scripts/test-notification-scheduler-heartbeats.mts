import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const heartbeat = require("../src/lib/notification-scheduler-heartbeat.cjs");
const names = require("../src/lib/notification-science.cjs").SCHEDULER_NAMES as string[];
const directory = await mkdtemp(join(tmpdir(), "notification-scheduler-heartbeats-"));

try {
  for (const name of names) {
    await heartbeat.writeSchedulerHeartbeat(name, {
      directory,
      at: new Date("2026-08-16T00:00:00.000Z"),
    });
    const file = join(directory, `${name}.heartbeat`);
    assert.equal(await readFile(file, "utf8"), "2026-08-16T00:00:00.000Z\n", `${name} heartbeat contains only a timestamp`);
    assert.equal((await stat(file)).mode & 0o777, 0o640, `${name} heartbeat is not world-readable`);
  }
  assert.equal((await stat(directory)).mode & 0o777, 0o750, "scheduler heartbeat directory is restrictive");
  const observed = heartbeat.readSchedulerHeartbeats(directory);
  assert.deepEqual(Object.keys(observed), names, "health reads one deterministic heartbeat slot for every scheduler");

  const files = {
    yam: "scripts/mobile-yam-push-cron.cjs",
    "daily-fortune": "scripts/mobile-daily-fortune-push-cron.cjs",
    auspicious: "scripts/mobile-auspicious-push-cron.cjs",
    "personal-reminders": "scripts/mobile-personal-reminders-cron.cjs",
    "monthly-report": "scripts/mobile-monthly-report-push-cron.cjs",
    "network-morning": "scripts/mobile-network-morning-push-cron.cjs",
    zibai: "scripts/mobile-zibai-push-cron.cjs",
    qimen: "scripts/mobile-qimen-push-cron.cjs",
    "ziwei-hourly": "scripts/mobile-ziwei-hourly-push-cron.mts",
  };
  for (const [name, file] of Object.entries(files)) {
    const source = readFileSync(file, "utf8");
    assert.match(source, new RegExp(`writeSchedulerHeartbeat\\(["']${name}["']`), `${name} writes its own heartbeat only after a successful source scheduler run`);
  }
  console.log("NOTIFICATION_SCHEDULER_HEARTBEATS_OK");
} finally {
  await rm(directory, { recursive: true, force: true });
}
