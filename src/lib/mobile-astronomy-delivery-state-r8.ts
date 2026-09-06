/**
 * Provider-free R8 astronomy delivery transitions. Not wired to a scheduler.
 *
 * This is NOT a sender, activation gate, database lock or provider classifier.
 * A future store must serialize transitions for the stable chain + unit across
 * ALL result revisions/aliases, retain acceptance tombstones, and enforce the
 * consent/revocation fence through durable provider completion. Do not create a
 * new ledger for a copy, token, HMAC-key, context or rollout revision.
 *
 * `admission` must come from that store's final fenced policy read. `result`
 * must come from a separately audited provider classifier; evidenceRef points
 * to its durable evidence, never an arbitrary retryable transport exception.
 * The store must deduplicate incoming result events before applying them;
 * not every replay is a legal transition (e.g. a repeated rejected result).
 * Pure tests here cannot prove either external boundary or phone delivery.
 */

export type AstronomyDeliveryFence = Readonly<{
  rolloutEpoch: number;
  consentGeneration: number;
  targetRevision: number;
  contextRevision: number;
}>;
export type AstronomyDeliveryAdmission = Readonly<{
  enabled: boolean;
  checkedAt: number;
  fence: AstronomyDeliveryFence;
}>;
type DeliveryState = "scheduled" | "claimed" | "outboxed" | "provider_submitting"
  | "accepted" | "submit_unknown" | "rejected_retryable" | "acknowledged"
  | "failed" | "expired" | "suppressed";
type Acceptance = "pending" | "authoritative_not_accepted" | "possibly_accepted" | "accepted";
type StopReason = "revoked" | "rollback" | "policy_changed" | "expired";
type Attempt = Readonly<{
  number: number;
  correlationId: string;
  payloadDigest: string;
  startedAt: number;
  acceptance: Acceptance;
  retryable: boolean;
  evidenceRefs: readonly string[];
}>;
export type AstronomyDelivery = Readonly<{
  lane: "astronomy_fact:civil_two_hour:v1";
  chainId: string;
  notificationUnitId: string;
  scheduledFor: number;
  expiresAt: number;
  maxAttempts: number;
  fence: AstronomyDeliveryFence;
  state: DeliveryState;
  attempts: readonly Attempt[];
  updatedAt: number;
  stopReason: StopReason | null;
  acknowledgmentEvidenceRef: string | null;
}>;
export type AstronomyDeliveryEvent = Readonly<{ at: number } & (
  | { type: "claim" | "outbox"; admission: AstronomyDeliveryAdmission }
  | { type: "begin_submission"; admission: AstronomyDeliveryAdmission; correlationId: string; payloadDigest: string }
  | { type: "result"; correlationId: string; outcome: "accepted" | "unknown" | "not_accepted"; retryable: boolean; evidenceRef: string }
  | { type: "acknowledge"; correlationId: string; evidenceRef: string }
  | { type: "suppress"; reason: "revoked" | "rollback" | "policy_changed" }
  | { type: "expire" | "recover_submission" }
)>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA = /^[0-9a-f]{64}$/u;
const FENCE_KEYS = ["rolloutEpoch", "consentGeneration", "targetRevision", "contextRevision"] as const;
function fail(reason: string): never { throw new TypeError(`r8_delivery_${reason}`); }
function validTime(value: number) { return Number.isSafeInteger(value) && Math.abs(value) <= 8_640_000_000_000_000; }
function checkFence(value: AstronomyDeliveryFence) {
  if (!value || FENCE_KEYS.some(key => !Number.isSafeInteger(value[key]) || value[key] < 1)) fail("fence_invalid");
}
function checkEvidence(value: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/u.test(value)) fail("evidence_invalid");
}
function correlation(value: string): string {
  if (typeof value !== "string" || !UUID.test(value)) fail("correlation_invalid");
  return value.toLowerCase();
}
function freeze(state: AstronomyDelivery): AstronomyDelivery {
  return Object.freeze({
    ...state, fence: Object.freeze({
      rolloutEpoch: state.fence.rolloutEpoch, consentGeneration: state.fence.consentGeneration,
      targetRevision: state.fence.targetRevision, contextRevision: state.fence.contextRevision,
    }),
    attempts: Object.freeze(state.attempts.map(attempt => Object.freeze({
      ...attempt, evidenceRefs: Object.freeze([...attempt.evidenceRefs]),
    }))),
  });
}
function update(state: AstronomyDelivery, at: number, patch: Partial<AstronomyDelivery>): AstronomyDelivery {
  return freeze({ ...state, ...patch, updatedAt: at });
}
function lastAttempt(state: AstronomyDelivery, correlationId?: string): Attempt {
  const canonicalId = correlationId === undefined ? undefined : correlation(correlationId);
  const attempt = state.attempts[state.attempts.length - 1];
  if (!attempt || (canonicalId !== undefined && attempt.correlationId !== canonicalId)) fail("attempt_mismatch");
  return attempt;
}
function replaceLast(state: AstronomyDelivery, attempt: Attempt): readonly Attempt[] {
  return [...state.attempts.slice(0, -1), attempt];
}
function addEvidence(attempt: Attempt, evidenceRef: string): readonly string[] {
  return attempt.evidenceRefs.includes(evidenceRef) ? attempt.evidenceRefs : [...attempt.evidenceRefs, evidenceRef];
}

export function createAstronomyDelivery(input: Readonly<{
  chainId: string;
  notificationUnitId: string;
  createdAt: number;
  scheduledFor: number;
  expiresAt: number;
  maxAttempts: number;
  fence: AstronomyDeliveryFence;
}>): AstronomyDelivery {
  if (typeof input.chainId !== "string" || !UUID.test(input.chainId)) fail("chain_invalid");
  if (typeof input.notificationUnitId !== "string" || input.notificationUnitId.trim() !== input.notificationUnitId
    || input.notificationUnitId.length < 1 || input.notificationUnitId.length > 512
    || /[\u0000-\u001f\u007f]/u.test(input.notificationUnitId)) fail("unit_invalid");
  if (!validTime(input.createdAt) || !validTime(input.scheduledFor) || !validTime(input.expiresAt)
    || input.expiresAt <= input.scheduledFor || input.createdAt >= input.expiresAt) fail("window_invalid");
  if (!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1) fail("attempt_limit_invalid");
  checkFence(input.fence);
  return freeze({
    lane: "astronomy_fact:civil_two_hour:v1", chainId: input.chainId.toLowerCase(),
    notificationUnitId: input.notificationUnitId, scheduledFor: input.scheduledFor,
    expiresAt: input.expiresAt, maxAttempts: input.maxAttempts, fence: input.fence,
    state: "scheduled", attempts: [], updatedAt: input.createdAt,
    stopReason: null, acknowledgmentEvidenceRef: null,
  });
}

function stop(state: AstronomyDelivery, at: number, reason: StopReason): AstronomyDelivery {
  if (state.state === "provider_submitting") {
    const attempt = lastAttempt(state);
    return update(state, at, {
      state: "submit_unknown", stopReason: reason,
      attempts: replaceLast(state, { ...attempt, acceptance: "possibly_accepted", retryable: false }),
    });
  }
  // Never rewrite an uncertain/accepted tombstone into an unsent state.
  if (["submit_unknown", "accepted", "acknowledged", "failed", "expired", "suppressed"].includes(state.state)) {
    return update(state, at, { stopReason: state.stopReason ?? reason });
  }
  return update(state, at, { state: reason === "expired" ? "expired" : "suppressed", stopReason: reason });
}
function admissionFailure(state: AstronomyDelivery, event: { at: number; admission: AstronomyDeliveryAdmission }): AstronomyDelivery | null {
  if (event.at < state.scheduledFor) fail("not_due");
  if (event.at >= state.expiresAt) return stop(state, event.at, "expired");
  const admission = event.admission;
  if (!admission || admission.checkedAt !== event.at) fail("admission_stale");
  checkFence(admission.fence);
  if (typeof admission.enabled !== "boolean") fail("admission_invalid");
  if (!admission.enabled) return stop(state, event.at, "revoked");
  if (FENCE_KEYS.some(key => state.fence[key] !== admission.fence[key])) return stop(state, event.at, "policy_changed");
  return null;
}

export function transitionAstronomyDelivery(state: AstronomyDelivery, event: AstronomyDeliveryEvent): AstronomyDelivery {
  if (state.lane !== "astronomy_fact:civil_two_hour:v1") fail("lane_invalid");
  if (!validTime(event.at)) fail("time_invalid");
  if ((event.type === "claim" || event.type === "outbox" || event.type === "begin_submission")
    && event.at < state.scheduledFor) fail("not_due");
  if (event.at < state.updatedAt) fail("time_invalid");

  switch (event.type) {
    case "claim":
    case "outbox":
    case "begin_submission": {
      const allowed = event.type === "claim" ? ["scheduled", "rejected_retryable"]
        : event.type === "outbox" ? ["claimed"] : ["outboxed"];
      if (!allowed.includes(state.state) || state.stopReason !== null) fail("transition_invalid");
      const denied = admissionFailure(state, event);
      if (denied) return denied;
      if (state.attempts.some(attempt => attempt.acceptance !== "authoritative_not_accepted")) fail("acceptance_conflict");
      if (state.attempts.length >= state.maxAttempts) return update(state, event.at, { state: "failed" });
      if (event.type !== "begin_submission") {
        return update(state, event.at, { state: event.type === "claim" ? "claimed" : "outboxed" });
      }
      const correlationId = correlation(event.correlationId);
      if (typeof event.payloadDigest !== "string" || !SHA.test(event.payloadDigest)) fail("payload_digest_invalid");
      if (state.attempts.some(attempt => attempt.correlationId === correlationId)) fail("correlation_reused");
      return update(state, event.at, {
        state: "provider_submitting",
        attempts: [...state.attempts, {
          number: state.attempts.length + 1, correlationId,
          payloadDigest: event.payloadDigest, startedAt: event.at,
          acceptance: "pending", retryable: false, evidenceRefs: [],
        }],
      });
    }
    case "result": {
      checkEvidence(event.evidenceRef);
      if (!["accepted", "unknown", "not_accepted"].includes(event.outcome)) fail("outcome_invalid");
      if (typeof event.retryable !== "boolean" || (event.retryable && event.outcome !== "not_accepted")) fail("retry_class_invalid");
      const attempt = lastAttempt(state, correlation(event.correlationId));
      if ((attempt.acceptance === "accepted" && event.outcome !== "accepted")
        || (attempt.acceptance === "possibly_accepted" && event.outcome === "not_accepted")) fail("acceptance_downgrade");
      if (!["provider_submitting", "submit_unknown", "accepted", "acknowledged"].includes(state.state)) fail("transition_invalid");
      const acceptance: Acceptance = event.outcome === "accepted" ? "accepted"
        : event.outcome === "unknown" ? "possibly_accepted" : "authoritative_not_accepted";
      const attempts = replaceLast(state, { ...attempt, acceptance, retryable: event.retryable, evidenceRefs: addEvidence(attempt, event.evidenceRef) });
      if (event.outcome === "accepted") {
        return update(state, event.at, { state: state.state === "acknowledged" ? "acknowledged" : "accepted", attempts });
      }
      if (event.outcome === "unknown") return update(state, event.at, { state: "submit_unknown", attempts });
      const expired = event.at >= state.expiresAt;
      return update(state, event.at, {
        state: expired ? "expired" : event.retryable && attempts.length < state.maxAttempts ? "rejected_retryable" : "failed",
        stopReason: expired ? "expired" : state.stopReason, attempts,
      });
    }
    case "acknowledge": {
      checkEvidence(event.evidenceRef);
      const attempt = lastAttempt(state, correlation(event.correlationId));
      if (!["provider_submitting", "accepted", "submit_unknown", "acknowledged"].includes(state.state)) fail("transition_invalid");
      return update(state, event.at, {
        state: "acknowledged", acknowledgmentEvidenceRef: state.acknowledgmentEvidenceRef ?? event.evidenceRef,
        attempts: replaceLast(state, { ...attempt, acceptance: "accepted", retryable: false, evidenceRefs: addEvidence(attempt, event.evidenceRef) }),
      });
    }
    case "recover_submission": {
      if (state.state !== "provider_submitting") fail("transition_invalid");
      const attempt = lastAttempt(state);
      return update(state, event.at, { state: "submit_unknown", attempts: replaceLast(state, { ...attempt, acceptance: "possibly_accepted", retryable: false }) });
    }
    case "suppress":
      if (!["revoked", "rollback", "policy_changed"].includes(event.reason)) fail("stop_reason_invalid");
      return stop(state, event.at, event.reason);
    case "expire":
      if (event.at < state.expiresAt) fail("not_expired");
      return stop(state, event.at, "expired");
    default: return fail("event_invalid");
  }
}
