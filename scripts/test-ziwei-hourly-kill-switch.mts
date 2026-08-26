import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import delivery from "../src/lib/mobile-notification-delivery.cjs";
import sourceContract from "../src/lib/ziwei-hourly-source-contract.cjs";

const source = readFileSync(new URL("../src/lib/mobile-notification-delivery.cjs", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/20260826_mobile_hourly_sciences.sql", import.meta.url), "utf8");

const now = new Date("2026-08-26T12:01:00.000Z");
const releaseCommit = "c".repeat(40);
const sourceDigest = sourceContract.SOURCE_DIGEST;
const row = {
  user_id: "00000000-0000-4000-8000-000000000001",
  kind: "ziwei",
  payload: { ziweiHourlyV2: "immutable-envelope" },
  source_facts: {
    accountId: "00000000-0000-4000-8000-000000000001",
    profileId: "00000000-0000-4000-8000-000000000002",
    lineage: "iztro_2_5_8_normal_forward_zi_v1",
    calculationVersion: "ziwei-hourly-notification-v1",
    windowKey: "fixture-window",
    eventEndAt: "2026-08-26T14:00:00.000Z",
    sendDeadline: "2026-08-26T12:10:00.000Z",
    ownerGeneration: 7,
    sourceDigest,
    backendCommit: releaseCommit,
  },
  ziwei_token_payload_schema: 2,
  transactional: false,
  privacy_safe: true,
  created_at: now.toISOString(),
};
const ready = {
  privacy_preview: false,
  account_active: true,
  now_at: now,
  ziwei_hourly_enabled: true,
  ziwei_hourly_profile_id: row.source_facts.profileId,
  ziwei_hourly_timezone: "Asia/Bangkok",
  ziwei_hourly_quiet_start: 22,
  ziwei_hourly_quiet_end: 7,
  ziwei_hourly_lineage: row.source_facts.lineage,
  ziwei_hourly_calculation_version: row.source_facts.calculationVersion,
  ziwei_hourly_window_key: row.source_facts.windowKey,
  ziwei_hourly_expires_at: row.source_facts.eventEndAt,
  ziwei_hourly_send_deadline: row.source_facts.sendDeadline,
  ziwei_hourly_current_owner_generation: 7,
  ziwei_hourly_occurrence_owner_generation: 7,
  ziwei_hourly_producer_enabled: true,
  ziwei_hourly_producer_source_digest: sourceDigest,
  ziwei_hourly_producer_backend_commit: releaseCommit,
  ziwei_hourly_runtime_enabled: true,
  ziwei_hourly_runtime_commit: releaseCommit,
  ziwei_hourly_runtime_source_digest: sourceDigest,
  ziwei_hourly_attempt_attested: true,
};

assert.deepEqual(delivery.currentPolicyDecision(row, ready, 0), { allow: true },
  "a queued Ziwei attempt may send only when DB and runtime producer provenance still match its immutable source facts");
for (const [name, context] of [
  ["database kill switch", { ...ready, ziwei_hourly_producer_enabled: false }],
  ["runtime kill switch", { ...ready, ziwei_hourly_runtime_enabled: false }],
  ["source digest drift", { ...ready, ziwei_hourly_producer_source_digest: "e".repeat(64) }],
  ["runtime source drift", { ...ready, ziwei_hourly_runtime_source_digest: "e".repeat(64) }],
  ["database release drift", { ...ready, ziwei_hourly_producer_backend_commit: "e".repeat(40) }],
  ["runtime release drift", { ...ready, ziwei_hourly_runtime_commit: "e".repeat(40) }],
] as const) {
  assert.deepEqual(delivery.currentPolicyDecision(row, context, 0),
    { allow: false, terminal: true, reason: "policy_producer_disabled" },
    `${name} terminally fences an already-reserved attempt before provider send`);
}

assert.match(source, /FROM mobile_ziwei_hourly_producer_state/u,
  "retry policy must re-read the global Ziwei producer gate before each provider send");
assert.match(source, /ZIWEI_HOURLY_PRODUCER_ENABLED/u,
  "retry policy must re-check the runtime kill switch, not only database consent");
assert.match(source, /HOURKEY_RELEASE_COMMIT/u,
  "retry policy must bind the running release to producer provenance");
assert.match(source, /pg_advisory_lock_shared[\s\S]+mobile-ziwei-hourly-producer-gate:v1/u,
  "a Ziwei provider call must hold the shared producer gate across its external side effect");
assert.match(source, /pg_advisory_unlock_shared[\s\S]+mobile-ziwei-hourly-producer-gate:v1/u,
  "the shared producer gate must be explicitly released after provider completion");
assert.match(migration, /REVOKE UPDATE ON mobile_ziwei_hourly_producer_state FROM hourkey_app/u,
  "the application role cannot re-enable the privileged producer kill switch");
assert.doesNotMatch(migration, /GRANT SELECT\s*,\s*UPDATE ON mobile_ziwei_hourly_producer_state TO hourkey_app/u,
  "the application role receives read-only producer-state access");
assert.match(migration, /backend_commit IS NOT NULL[\s\S]+enabled_by IS NOT NULL/u,
  "producer provenance cannot satisfy PostgreSQL CHECK through NULL truth semantics");
assert.match(migration, /pg_advisory_xact_lock[\s\S]+mobile-ziwei-hourly-producer-gate:v1/u,
  "every producer-state mutation must take the exclusive side of the same gate");
assert.match(migration, /enforce_mobile_ziwei_push_parent_integrity/u,
  "Ziwei parent kind, payload, and source facts must be protected in the database");
assert.match(migration, /enforce_mobile_ziwei_push_attempt_integrity/u,
  "Ziwei terminal attempts must not be resurrectable through generic DML");

const gateQueries: string[] = [];
const fakeClient = {
  async query(sql: string) {
    gateQueries.push(sql.replace(/\s+/gu, " ").trim());
    if (/SELECT l\.kind/u.test(sql)) return { rows: [{ kind: "ziwei" }], rowCount: 1 };
    if (/pg_advisory_lock_shared/u.test(sql)) return { rows: [{ value: null }], rowCount: 1 };
    if (/pg_advisory_unlock_shared/u.test(sql)) return { rows: [{ unlocked: true }], rowCount: 1 };
    throw new Error("unexpected fake query");
  },
};
const gateResult = await delivery.withZiweiProducerGate(
  fakeClient,
  "00000000-0000-4000-8000-000000000004",
  async () => {
    gateQueries.push("provider:started");
    await Promise.resolve();
    gateQueries.push("provider:completed");
    return "sent";
  },
);
assert.equal(gateResult, "sent");
assert.ok(gateQueries.findIndex((item) => /pg_advisory_lock_shared/u.test(item))
  < gateQueries.indexOf("provider:started"), "shared gate is acquired before provider execution");
assert.ok(gateQueries.findIndex((item) => /pg_advisory_unlock_shared/u.test(item))
  > gateQueries.indexOf("provider:completed"), "shared gate is released only after provider completion");

console.log("PASS Ziwei hourly kill switch — queued work and DB privilege remain fail-closed");
