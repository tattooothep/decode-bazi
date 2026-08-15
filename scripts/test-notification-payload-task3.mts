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
for (const [index, fixture] of fixtures.cases.entries()) {
  const typed = buildNotificationPayload(fixture.kind, fixture.accountId, fixture.facts);
  const cjs = runtime.buildNotificationPayload(fixture.kind, fixture.accountId, fixture.facts);
  const notificationId = `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  const providerPayload = { ...typed, notificationId };
  assert.deepEqual(cjs, typed, `${fixture.kind}: TS/CJS builders diverged`);
  assert.deepEqual(typed, fixture.storedPayload, `${fixture.kind}: stored payload differs from source facts`);
  assert.deepEqual(
    resolveNotificationPayload(providerPayload, fixture.kind, fixture.accountId),
    providerPayload,
    `${fixture.kind}: mobile parser rejected backend payload`,
  );
  assert.deepEqual(fixture.providerMessage.data, fixture.storedPayload, `${fixture.kind}: pre-reservation fixture changed producer facts`);
  const prepared = sender.prepareMessage({
    category: fixture.kind,
    transactional: fixture.kind === "security",
    title: fixture.providerMessage.title,
    body: fixture.providerMessage.body,
    url: fixture.storedPayload.url,
    data: providerPayload,
  }, "expo");
  assert.deepEqual(prepared.data, providerPayload, `${fixture.kind}: provider adapter changed typed facts`);
  const actionable = fixture.kind !== "security";
  assert.equal(
    prepared.categoryId,
    actionable ? "hourkey_daily" : undefined,
    `${fixture.kind}: Expo action category must be present only when MUTE applies`,
  );
  const fcm = sender.prepareMessage({
    category: fixture.kind,
    transactional: fixture.kind === "security",
    title: fixture.providerMessage.title,
    body: fixture.providerMessage.body,
    url: fixture.storedPayload.url,
    data: providerPayload,
  }, "fcm");
  assert.deepEqual(JSON.parse(fcm.data.body), providerPayload, `${fixture.kind}: FCM bridge changed typed facts`);
  assert.equal(
    fcm.data.categoryId,
    actionable ? "hourkey_daily" : undefined,
    `${fixture.kind}: Android action category must stay outside the strict JSON payload`,
  );
  assert.equal(JSON.stringify(fixture).match(/token|credential|secret|password/iu), null, `${fixture.kind}: raw credential-shaped key`);
}

for (const transactional of [false, true]) {
  const prepared = sender.prepareMessage({
    category: "service", transactional, title: "Service update",
    body: "A useful service update is ready", url: "/calendar", data: { service: true },
  }, "expo");
  assert.equal(
    prepared.categoryId,
    transactional ? undefined : "hourkey_daily",
    "routine service notices expose MUTE while transactional service notices never do",
  );
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
assert.throws(() => runtime.buildNotificationPayload("service", "acct-synthetic-001", {
  event: "fusion_ready", referenceId: "fusion|job|95000000-0000-4000-8000-000000000001", url: "/calendar",
}), /invalid service destination/u, "service event/reference/url combinations cannot cross destinations");
assert.deepEqual(runtime.buildNotificationPayload("service", "acct-synthetic-001", {
  event: "network_morning", referenceId: "network|2026-08-15|profile-1", url: "/network",
}), {
  v: 1, kind: "service", accountId: "acct-synthetic-001",
  event: "network_morning", referenceId: "network|2026-08-15|profile-1", url: "/network",
});
assert.deepEqual(runtime.buildNotificationPayload("service", "acct-synthetic-001", {
  event: "fusion_ready", referenceId: "fusion|job|95000000-0000-4000-8000-000000000001", url: "/fusion",
}), {
  v: 1, kind: "service", accountId: "acct-synthetic-001",
  event: "fusion_ready", referenceId: "fusion|job|95000000-0000-4000-8000-000000000001", url: "/fusion",
});

console.log("NOTIFICATION_PAYLOAD_TASK3_OK cases=8");
