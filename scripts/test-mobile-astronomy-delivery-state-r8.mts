import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createAstronomyDelivery,
  transitionAstronomyDelivery,
  type AstronomyDelivery,
  type AstronomyDeliveryEvent,
} from "../src/lib/mobile-astronomy-delivery-state-r8";

// Pure state transitions only: no database, credentials, network or scheduler.
const start = Date.parse("2026-09-06T11:00:00.000Z");
const fence = Object.freeze({ rolloutEpoch: 1, consentGeneration: 1, targetRevision: 1, contextRevision: 1 });
const admission = Object.freeze({ enabled: true, checkedAt: start, fence });
const correlationId = "00000000-0000-4000-8000-000000000011";
const nextCorrelationId = "00000000-0000-4000-8000-000000000012";
const payloadDigest = "a".repeat(64);
let checks = 0;
function check(condition: unknown, message: string) { assert.ok(condition, message); checks += 1; }
function fresh(maxAttempts = 2): AstronomyDelivery {
  return createAstronomyDelivery({
    chainId: "00000000-0000-4000-8000-000000000001",
    notificationUnitId: "civil:2026-09-06T18:00:00+07:00:fold0",
    createdAt: start - 60_000, scheduledFor: start, expiresAt: start + 7_200_000, maxAttempts, fence,
  });
}
function step(state: AstronomyDelivery, event: AstronomyDeliveryEvent) {
  const original = JSON.stringify(state);
  const result = transitionAstronomyDelivery(state, event);
  assert.equal(JSON.stringify(state), original, "input ledger must be immutable");
  check(Object.isFrozen(result) && Object.isFrozen(result.attempts), "returned ledger is frozen");
  return result;
}
function submitting(maxAttempts = 2) {
  let state = fresh(maxAttempts);
  state = step(state, { type: "claim", at: start, admission });
  state = step(state, { type: "outbox", at: start, admission });
  return step(state, { type: "begin_submission", at: start, admission, correlationId, payloadDigest });
}
function result(state: AstronomyDelivery, outcome: "accepted" | "unknown" | "not_accepted", retryable = false) {
  return step(state, { type: "result", at: start + 1, correlationId, outcome, retryable, evidenceRef: "test-evidence-1" });
}

const initial = fresh();
check(initial.lane === "astronomy_fact:civil_two_hour:v1", "only the astronomy snapshot lane is admitted");
check(initial.state === "scheduled" && initial.attempts.length === 0, "initial state cannot imply sending");
assert.throws(() => step(initial, { type: "outbox", at: start, admission }), /transition_invalid/);
assert.throws(() => step(initial, { type: "claim", at: start - 1, admission: { ...admission, checkedAt: start - 1 } }), /not_due/);
checks += 2;

const pending = submitting();
check(pending.state === "provider_submitting" && pending.attempts[0].acceptance === "pending", "submission is not acceptance");
const accepted = result(pending, "accepted");
check(accepted.state === "accepted", "provider acceptance is distinct from device acknowledgment");
check(accepted.attempts.length === 1 && accepted.attempts[0].acceptance === "accepted", "one accepted attempt");
const acknowledged = step(accepted, { type: "acknowledge", at: start + 2, correlationId, evidenceRef: "device-event-1" });
check(acknowledged.state === "acknowledged" && acknowledged.acknowledgmentEvidenceRef === "device-event-1", "ack needs separate evidence");
assert.throws(() => step(accepted, { type: "acknowledge", at: start + 2, correlationId, evidenceRef: "" }), /evidence_invalid/);
checks += 1;
const earlyAck = step(pending, { type: "acknowledge", at: start + 1, correlationId, evidenceRef: "device-before-provider-result" });
check(earlyAck.state === "acknowledged" && earlyAck.attempts.length === 1, "verified device receipt may precede durable provider result");
const lateProvider = step(earlyAck, { type: "result", at: start + 2, correlationId, outcome: "accepted", retryable: false, evidenceRef: "provider-after-device" });
check(lateProvider.state === "acknowledged" && lateProvider.attempts[0].correlationId === correlationId, "late provider receipt preserves prior acknowledgment");
assert.throws(() => step(earlyAck, { type: "claim", at: start + 1, admission: { ...admission, checkedAt: start + 1 } }), /transition_invalid/);
checks += 1;

for (const uncertain of [
  result(pending, "unknown"),
  step(pending, { type: "recover_submission", at: start + 1 }),
  step(pending, { type: "suppress", at: start + 1, reason: "revoked" }),
  step(pending, { type: "expire", at: start + 7_200_000 }),
]) {
  check(uncertain.state === "submit_unknown", "uncertain in-flight send cannot become a retryable rejection");
  check(uncertain.attempts[0].acceptance === "possibly_accepted", "uncertainty preserves the lineage tombstone");
  assert.throws(() => step(uncertain, { type: "claim", at: uncertain.updatedAt, admission: { ...admission, checkedAt: uncertain.updatedAt } }), /transition_invalid/);
  checks += 1;
  const late = step(uncertain, { type: "result", at: uncertain.updatedAt + 1, correlationId, outcome: "accepted", retryable: false, evidenceRef: "late-receipt" });
  check(late.state === "accepted" && late.attempts.length === 1, "late acceptance upgrades the original attempt only");
  check(late.attempts[0].correlationId === correlationId && late.attempts[0].payloadDigest === payloadDigest, "late receipt preserves correlation and payload");
  assert.throws(() => step(uncertain, { type: "result", at: uncertain.updatedAt + 1, correlationId, outcome: "not_accepted", retryable: true, evidenceRef: "late-rejection" }), /acceptance_downgrade/);
  checks += 1;
}

const rejected = result(pending, "not_accepted", true);
check(rejected.state === "rejected_retryable", "only explicit authoritative rejection can retry");
check(rejected.attempts[0].acceptance === "authoritative_not_accepted", "retry classification retained");
const laterAdmission = { ...admission, checkedAt: start + 2 };
let retry = step(rejected, { type: "claim", at: start + 2, admission: laterAdmission });
retry = step(retry, { type: "outbox", at: start + 2, admission: laterAdmission });
assert.throws(() => step(retry, { type: "begin_submission", at: start + 2, admission: laterAdmission, correlationId, payloadDigest }), /correlation_reused/);
checks += 1;
retry = step(retry, { type: "begin_submission", at: start + 2, admission: laterAdmission, correlationId: nextCorrelationId, payloadDigest });
check(retry.attempts[1].number === 2 && retry.expiresAt === initial.expiresAt, "retry increments attempt but never extends deadline");
const exhausted = step(retry, { type: "result", at: start + 3, correlationId: nextCorrelationId, outcome: "not_accepted", retryable: true, evidenceRef: "test-evidence-2" });
check(exhausted.state === "failed", "attempt limit is terminal");
check(result(submitting(1), "not_accepted", true).state === "failed", "one-attempt policy cannot retry");
check(result(pending, "not_accepted", false).state === "failed", "permanent rejection is terminal");
check(step(rejected, { type: "claim", at: initial.expiresAt, admission: { ...admission, checkedAt: initial.expiresAt } }).state === "expired", "retry cannot cross original deadline");
assert.throws(() => step(pending, { type: "result", at: start + 1, correlationId, outcome: "not_accepted", retryable: true, evidenceRef: "" }), /evidence_invalid/);
assert.throws(() => step(pending, { type: "result", at: start + 1, correlationId, outcome: "unknown", retryable: true, evidenceRef: "test-evidence-1" }), /retry_class_invalid/);
checks += 2;

// Consent/owner/endpoint/context/epoch decisions are supplied by a future fenced
// store. The reducer requires a read for this event, not a cached prior approval.
for (const name of Object.keys(fence) as (keyof typeof fence)[]) {
  for (const before of [fresh(), step(fresh(), { type: "claim", at: start, admission })]) {
    const denied = step(before, {
      type: before.state === "scheduled" ? "claim" : "outbox", at: start,
      admission: { ...admission, fence: { ...fence, [name]: 2 } },
    });
    check(denied.state === "suppressed" && denied.attempts.length === 0, `changed ${name} fences new work`);
  }
}
let outboxed = step(fresh(), { type: "claim", at: start, admission });
outboxed = step(outboxed, { type: "outbox", at: start, admission });
for (const changedAdmission of [
  { ...admission, enabled: false },
  ...Object.keys(fence).map(name => ({ ...admission, fence: { ...fence, [name]: 2 } })),
]) {
  const denied = step(outboxed, { type: "begin_submission", at: start, admission: changedAdmission, correlationId, payloadDigest });
  check(denied.state === "suppressed" && denied.attempts.length === 0, "final admission checked before submission");
}
assert.throws(() => step(outboxed, { type: "begin_submission", at: start + 1, admission, correlationId, payloadDigest }), /admission_stale/);
assert.throws(() => step(outboxed, { type: "begin_submission", at: start, admission, correlationId, payloadDigest: "bad" }), /payload_digest_invalid/);
assert.throws(() => step(outboxed, { type: "begin_submission", at: start, admission, correlationId: "bad", payloadDigest }), /correlation_invalid/);
checks += 3;

const suppressed = step(rejected, { type: "suppress", at: start + 2, reason: "rollback" });
check(step(initial, { type: "suppress", at: start - 30_000, reason: "revoked" }).state === "suppressed", "future scheduled item can be revoked before it becomes due");
check(suppressed.state === "suppressed" && suppressed.attempts.length === 1, "suppression retains historical attempts");
check(step(accepted, { type: "suppress", at: start + 2, reason: "revoked" }).attempts[0].acceptance === "accepted", "revoke cannot erase acceptance");
check(step(accepted, { type: "expire", at: initial.expiresAt }).state === "accepted", "expiry cannot erase acceptance");
assert.throws(() => step(initial, { type: "expire", at: start + 1 }), /not_expired/);
assert.throws(() => step(accepted, { type: "result", at: start + 2, correlationId: nextCorrelationId, outcome: "accepted", retryable: false, evidenceRef: "other-attempt" }), /attempt_mismatch/);
assert.throws(() => step(accepted, { type: "result", at: start, correlationId, outcome: "accepted", retryable: false, evidenceRef: "old-result" }), /time_invalid/);
checks += 3;

for (const patch of [
  { expiresAt: start }, { maxAttempts: 0 }, { maxAttempts: 1.5 },
  { chainId: "bad" }, { notificationUnitId: "" }, { scheduledFor: Number.NaN },
  { fence: { ...fence, consentGeneration: 0 } },
]) {
  assert.throws(() => createAstronomyDelivery({
    chainId: initial.chainId, notificationUnitId: initial.notificationUnitId,
    createdAt: start - 60_000, scheduledFor: start, expiresAt: start + 7_200_000, maxAttempts: 2, fence, ...patch,
  }));
  checks += 1;
}
const moduleSource = readFileSync("src/lib/mobile-astronomy-delivery-state-r8.ts", "utf8");
assert.doesNotMatch(moduleSource, /^\s*import\s/mu, "the new reducer has no production, provider or database dependencies");
checks += 1;

const mixedCorrelation = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const mixedChain = "aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff";
const mixedInitial = createAstronomyDelivery({ ...initial, chainId: mixedChain.toUpperCase(), createdAt: start - 60_000 });
check(mixedInitial.chainId === mixedChain, "stable UUID identity is canonical regardless of input case");
let mixed = step(outboxed, { type: "begin_submission", at: start, admission, correlationId: mixedCorrelation.toUpperCase(), payloadDigest });
check(mixed.attempts[0].correlationId === mixedCorrelation, "stored correlation UUID is canonical");
mixed = step(mixed, { type: "result", at: start + 1, correlationId: mixedCorrelation, outcome: "not_accepted", retryable: true, evidenceRef: "mixed-case-rejection" });
mixed = step(mixed, { type: "claim", at: start + 2, admission: laterAdmission });
mixed = step(mixed, { type: "outbox", at: start + 2, admission: laterAdmission });
assert.throws(() => step(mixed, { type: "begin_submission", at: start + 2, admission: laterAdmission, correlationId: mixedCorrelation.toUpperCase(), payloadDigest }), /correlation_reused/);
checks += 1;
for (const field of ["correlationId", "payloadDigest"] as const) {
  const mutable = { text: field === "correlationId" ? correlationId : payloadDigest, toString() { return this.text; } };
  assert.throws(() => step(outboxed, {
    type: "begin_submission", at: start, admission, correlationId, payloadDigest,
    [field]: mutable,
  } as unknown as AstronomyDeliveryEvent), /(?:correlation|payload_digest)_invalid/);
  checks += 1;
}
for (const type of ["result", "acknowledge"] as const) {
  assert.throws(() => step(accepted, {
    type, at: start + 2, correlationId: { toString() { return correlationId; } },
    outcome: "accepted", retryable: false, evidenceRef: "invalid-id",
  } as unknown as AstronomyDeliveryEvent), /correlation_invalid/);
  checks += 1;
  assert.throws(() => step(pending, {
    type, at: start + 2, outcome: "accepted", retryable: false, evidenceRef: "missing-id",
  } as unknown as AstronomyDeliveryEvent), /correlation_invalid/);
  checks += 1;
}
console.log(`ASTRONOMY_DELIVERY_STATE_R8_OK checks=${checks} providerCalls=0 databaseCalls=0 activation=false`);
