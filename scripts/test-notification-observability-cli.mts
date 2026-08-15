import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), "notification-observability-"));

try {
  const health = require("./notification-health.cjs");
  const runner = require("./notification-retry-receipt-runner.cjs");
  const heartbeat = join(directory, "retry.heartbeat");
  assert.equal(health.providerReadiness({ FCM_SERVICE_ACCOUNT_PATH: join(directory, "missing-service-account.json") }).fcm, false, "a routed FCM provider without a readable credential is unhealthy without printing its path");
  await runner.writeHeartbeat(heartbeat, new Date("2026-08-16T00:00:00.000Z"));
  assert.equal(await readFile(heartbeat, "utf8"), "2026-08-16T00:00:00.000Z\n", "retry runner heartbeat contains only a timestamp");
  await utimes(heartbeat, new Date("2026-08-16T00:00:00.000Z"), new Date("2026-08-16T00:00:00.000Z"));
  assert.equal(health.readHeartbeat(heartbeat), "2026-08-16T00:00:00.000Z", "health reads heartbeat freshness from file metadata rather than contents");
  assert.equal(health.readHeartbeat(join(directory, "missing")), null, "missing heartbeat remains unhealthy rather than being treated as fresh");

  const retryUnit = "ops/systemd/hourkey-mobile-push-retry-receipts.service";
  const receiptTimer = "ops/systemd/hourkey-mobile-push-retry-receipts.timer";
  const healthUnit = "ops/systemd/hourkey-mobile-push-health.service";
  const healthTimer = "ops/systemd/hourkey-mobile-push-health.timer";
  for (const file of [retryUnit, receiptTimer, healthUnit, healthTimer, "docs/runbooks/notification-observability.md"]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /(?:systemctl\s+(?:enable|start|restart|reload)|curl\s+.*push|ExponentPushToken|authorization:|PGPASSWORD=)/iu, `${file} is source-only and contains no live operation or credential material`);
  }
  assert.match(await readFile(retryUnit, "utf8"), /notification-retry-receipt-runner\.cjs.*--heartbeat-file/u, "retry unit routes work through the heartbeat runner");
  assert.match(await readFile(receiptTimer, "utf8"), /OnUnitActiveSec=1min/u, "retry/receipt timer has a bounded cadence");
  assert.match(await readFile(healthUnit, "utf8"), /notification-health\.cjs.*--worker-heartbeat-file/u, "health unit fails closed on the retry heartbeat input");
  assert.match(await readFile(healthTimer, "utf8"), /OnUnitActiveSec=1min/u, "health timer has a bounded cadence");
  console.log("NOTIFICATION_OBSERVABILITY_CLI_OK");
} finally {
  await rm(directory, { recursive: true, force: true });
}
