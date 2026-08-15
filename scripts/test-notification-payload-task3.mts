import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolveNotificationPayload } from "../../hourkey-v197-mobile/src/navigation/notificationPayload.ts";
import { buildNotificationPayload } from "../src/lib/notification-payload.ts";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/notification-payload.cjs");
const sender = require("../src/lib/push-send.cjs");
const fixtures = JSON.parse(readFileSync("test-fixtures/notifications/task3-replay.sanitized.json", "utf8"));

assert.equal(fixtures.version, 1);
assert.equal(fixtures.cases.length, 8);
for (const fixture of fixtures.cases) {
  const typed = buildNotificationPayload(fixture.kind, fixture.accountId, fixture.facts);
  const cjs = runtime.buildNotificationPayload(fixture.kind, fixture.accountId, fixture.facts);
  assert.deepEqual(cjs, typed, `${fixture.kind}: TS/CJS builders diverged`);
  assert.deepEqual(typed, fixture.storedPayload, `${fixture.kind}: stored payload differs from source facts`);
  assert.deepEqual(
    resolveNotificationPayload(typed, fixture.kind, fixture.accountId),
    fixture.storedPayload,
    `${fixture.kind}: mobile parser rejected backend payload`,
  );
  assert.deepEqual(fixture.providerMessage.data, fixture.storedPayload, `${fixture.kind}: provider data changed facts`);
  const prepared = sender.prepareMessage({
    category: fixture.kind,
    title: fixture.providerMessage.title,
    body: fixture.providerMessage.body,
    url: fixture.storedPayload.url,
    data: fixture.storedPayload,
  }, "expo");
  assert.deepEqual(prepared.data, fixture.storedPayload, `${fixture.kind}: provider adapter changed typed facts`);
  const fcm = sender.prepareMessage({
    category: fixture.kind,
    title: fixture.providerMessage.title,
    body: fixture.providerMessage.body,
    url: fixture.storedPayload.url,
    data: fixture.storedPayload,
  }, "fcm");
  assert.deepEqual(JSON.parse(fcm.data.body), fixture.storedPayload, `${fixture.kind}: FCM bridge changed typed facts`);
  assert.equal(JSON.stringify(fixture).match(/token|credential|secret|password/iu), null, `${fixture.kind}: raw credential-shaped key`);
}

for (const kind of ["security", "saved_date", "daily", "yam", "qimen", "shrine", "goal", "service"]) {
  const fixture = fixtures.cases.find((item: any) => item.kind === kind);
  assert.deepEqual(runtime.previewCopy(kind, false, fixture.fullCopy, fixture.locale), fixture.redactedCopy);
  assert.deepEqual(runtime.previewCopy(kind, true, fixture.fullCopy, fixture.locale), fixture.fullCopy);
}

assert.deepEqual(runtime.buildNotificationPayload("service", "acct-synthetic-001", {
  event: "monthly_report_ready", referenceId: "monthly|2026-08", url: "/calendar",
}), {
  v: 1, kind: "service", accountId: "acct-synthetic-001",
  event: "monthly_report_ready", referenceId: "monthly|2026-08", url: "/calendar",
});
assert.deepEqual(runtime.buildNotificationPayload("service", "acct-synthetic-001", {
  event: "network_morning", referenceId: "network|2026-08-15|profile-1", url: "/network",
}), {
  v: 1, kind: "service", accountId: "acct-synthetic-001",
  event: "network_morning", referenceId: "network|2026-08-15|profile-1", url: "/network",
});

console.log("NOTIFICATION_PAYLOAD_TASK3_OK cases=8");
