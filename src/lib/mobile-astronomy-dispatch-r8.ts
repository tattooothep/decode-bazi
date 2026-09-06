/**
 * R8 astronomy dispatch orchestrator (integration gap: fence + scheduler · 6 ก.ย. 2569)
 *
 * Walks one shadowed occurrence through the durable ledger and the injected
 * FCM adapter, under the design's fencing rules (§8.1/§8.5):
 *  - a fresh fenced admission read backs EVERY ledger transition (claim,
 *    outbox, begin_submission) — admission.checkedAt equals the event clock,
 *    so a consent/ownership/epoch change between steps stops the unit as
 *    policy_changed/revoked instead of being raced past;
 *  - the ledger key comes from the immutable chain registry, never the
 *    chains row;
 *  - provider payload notificationId/occurrenceId are both the occurrence
 *    UUID (the identity the receipt mapper authorizes against);
 *  - result timing (retryNotBefore) and token disposition ride the dispatch
 *    queue sidecar — the reducer's result event deliberately excludes them;
 *  - unknown/ambiguous outcomes are final for the lineage (no resend), and
 *    tokenDisposition "unregistered" only marks the queue row — endpoint
 *    deactivation stays with the SECURITY DEFINER registry functions.
 *
 * Everything effectful is injected (pool, clock, transport, ticket source):
 * tests drive the full path with mocks and the disposable-PG harness. With
 * production CHECK constraints as deployed (subscriptions.enabled=false,
 * producer_state.provider_send_enabled=false) the admission read returns
 * disabled for every unit — the orchestrator is wired but inert until the
 * activation migration and its five sign-offs.
 */
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import {
  applyAstronomyDeliveryEvent,
  createOrLoadAstronomyDelivery,
  readAstronomyDelivery,
} from "./mobile-astronomy-delivery-store-r8";
import {
  classifyAstronomyFcmR8,
  prepareAstronomyFcmR8,
  submitAstronomyFcmR8Once,
  type AstronomyFcmOutcome,
  type AstronomyFcmTransportRequest,
  type AstronomyFcmTransportResponse,
} from "./mobile-astronomy-fcm-r8";
import { resolveAstronomyChainUuid } from "./mobile-astronomy-chain-registry-r8";

void classifyAstronomyFcmR8; // classification runs inside submitAstronomyFcmR8Once

const MAX_ATTEMPTS = 3;

export type AstronomyDispatchAdmissionRow = Readonly<{
  enabled: boolean;
  reason: string;
  checkedAt: number;
  fence: Readonly<{ rolloutEpoch: number; consentGeneration: number; targetRevision: number; contextRevision: number }>;
  userId: string;
  orgId: string;
  audience: string;
  deviceToken: string | null;
  locale: string;
  scheduledFor: number;
  expiresAt: number;
  notificationUnitId: string;
}>;

export type AstronomyDispatchDeps = Readonly<{
  pool: Pool;
  clock: () => number;
  projectId: string;
  transport: (request: AstronomyFcmTransportRequest) => Promise<AstronomyFcmTransportResponse>;
  /** เช็คของที่ต้องมีก่อนส่ง (เช่น ตั๋ว OAuth) — ล้ม = เลื่อนงาน ไม่เผา attempt */
  preflight?: () => Promise<boolean>;
}>;

export type AstronomyDispatchResult = Readonly<{
  status: "not_admitted" | "skipped" | "accepted" | "not_accepted" | "unknown" | "stopped";
  reason?: string;
  retryNotBefore?: number | null;
  tokenDisposition?: "unchanged" | "unregistered";
}>;

/**
 * Fenced admission read — the full eligibility chain in one statement, per
 * design §8.5: consent + generations, producer gates, cohort approval,
 * ownership (token/installation/audience/endpoint revision), account state.
 * `checkedAt` is caller-supplied so it can equal the ledger event clock.
 */
export async function readAstronomyDispatchAdmission(
  pool: Pool,
  occurrenceId: string,
  checkedAt: number,
): Promise<AstronomyDispatchAdmissionRow | null> {
  const result = await pool.query(
    `SELECT o.notification_unit_id,
            EXTRACT(EPOCH FROM o.scheduled_for) * 1000 AS scheduled_for_ms,
            EXTRACT(EPOCH FROM o.expires_at) * 1000 AS expires_at_ms,
            o.rollout_epoch,
            c.user_id, c.org_id, c.target_revision,
            s.enabled AS consent_enabled, s.consent_generation, s.locale,
            p.provider_send_enabled, p.evidence_complete,
            t.enabled AS token_enabled, t.device_push_token,
            e.audience_binding, e.active AS endpoint_active,
            (e.target_revision = c.target_revision) AS endpoint_current,
            (u.deleted_at IS NULL AND u.is_active IS DISTINCT FROM false) AS account_active,
            (h.enabled = true AND h.approved_by IS NOT NULL) AS cohort_approved,
            (c.lifecycle_state = 'shadow') AS chain_live,
            (o.state = 'shadowed' AND o.expires_at > now()) AS occurrence_live
       FROM mobile_science_notification_occurrences o
       JOIN mobile_science_notification_chains c ON c.id = o.chain_id
       JOIN users u ON u.id = c.user_id
       LEFT JOIN mobile_science_notification_shadow_cohort h
         ON h.user_id = c.user_id AND h.science_id = c.science_id AND h.submode = c.submode
       LEFT JOIN mobile_science_notification_subscriptions s
         ON s.user_id = c.user_id AND s.org_id = c.org_id
        AND s.science_id = c.science_id AND s.submode = c.submode
       LEFT JOIN mobile_science_notification_producer_state p
         ON p.science_id = c.science_id AND p.submode = c.submode AND p.schema_version = c.schema_version
       LEFT JOIN mobile_push_tokens t
         ON t.id = c.primary_token_id AND t.user_id = c.user_id
        AND t.installation_id = c.primary_installation_id
       LEFT JOIN mobile_science_notification_endpoints e
         ON e.chain_id = c.id AND e.token_id = t.id
        AND e.installation_id = c.primary_installation_id
        AND e.audience_binding = t.astronomy_fact_audience_binding
        AND e.primary_endpoint = true
      WHERE o.id = $1::uuid
        AND c.science_id = 'astronomy_fact' AND c.submode = 'civil_two_hour'
      LIMIT 1`,
    [occurrenceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const gates: Array<[string, boolean]> = [
    ["occurrence_live", row.occurrence_live === true],
    ["chain_live", row.chain_live === true],
    ["account_active", row.account_active === true],
    ["cohort_approved", row.cohort_approved === true],
    ["consent_enabled", row.consent_enabled === true],
    ["provider_send_enabled", row.provider_send_enabled === true],
    ["evidence_complete", row.evidence_complete === true],
    ["token_enabled", row.token_enabled === true],
    ["endpoint_active", row.endpoint_active === true],
    ["endpoint_current", row.endpoint_current === true],
    ["device_token_present", typeof row.device_push_token === "string" && row.device_push_token.length > 0],
    // ยิงก่อนกำหนด = reducer โยน not_due หลัง claim — กันตั้งแต่ด่านนี้
    ["occurrence_due", Math.round(Number(row.scheduled_for_ms)) <= checkedAt],
    // งบ TTL ต้องพอหลังหักช่วงเตรียม/ส่ง (adapter จะโยน ttl_exhausted)
    ["ttl_budget", Math.round(Number(row.expires_at_ms)) - checkedAt > 20_000],
  ];
  const failed = gates.find(([, ok]) => !ok);
  return Object.freeze({
    enabled: failed === undefined,
    reason: failed ? failed[0] : "",
    checkedAt,
    fence: Object.freeze({
      rolloutEpoch: Number(row.rollout_epoch) || 1,
      consentGeneration: Number(row.consent_generation) || 1,
      targetRevision: Number(row.target_revision) || 1,
      contextRevision: 1,
    }),
    userId: String(row.user_id),
    orgId: String(row.org_id),
    audience: String(row.audience_binding || ""),
    deviceToken: typeof row.device_push_token === "string" ? row.device_push_token : null,
    locale: typeof row.locale === "string" && row.locale ? row.locale : "en",
    scheduledFor: Math.round(Number(row.scheduled_for_ms)),
    expiresAt: Math.round(Number(row.expires_at_ms)),
    notificationUnitId: String(row.notification_unit_id),
  });
}

function resultEvidenceRef(outcome: AstronomyFcmOutcome): string {
  // providerMessageName contains "/" which the reducer's evidence charset
  // forbids — carry a stable digest of it instead of the raw name.
  const nameDigest = outcome.providerMessageName
    ? createHash("sha256").update(outcome.providerMessageName).digest("hex").slice(0, 24)
    : "none";
  return `fcm.${outcome.outcome}.${outcome.tokenDisposition}.${nameDigest}`.slice(0, 160);
}

async function upsertQueue(
  pool: Pool,
  chainUuid: string,
  unit: string,
  occurrenceId: string,
  patch: Readonly<{ nextAttemptAt: number | null; tokenDisposition: "unchanged" | "unregistered"; lastOutcome: string }>,
): Promise<void> {
  if (patch.nextAttemptAt === null) {
    await pool.query(
      `DELETE FROM mobile_astronomy_dispatch_queue_r8 WHERE chain_uuid=$1 AND notification_unit_id=$2`,
      [chainUuid, unit],
    );
    if (patch.tokenDisposition === "unregistered") {
      await pool.query(
        `INSERT INTO mobile_astronomy_dispatch_queue_r8
           (chain_uuid, notification_unit_id, occurrence_id, next_attempt_at, token_disposition, last_outcome, updated_at)
         VALUES ($1, $2, $3, NULL, 'unregistered', $4, now())
         ON CONFLICT (chain_uuid, notification_unit_id) DO UPDATE SET
           token_disposition='unregistered', last_outcome=EXCLUDED.last_outcome, next_attempt_at=NULL, updated_at=now()`,
        [chainUuid, unit, occurrenceId, patch.lastOutcome],
      );
    }
    return;
  }
  await pool.query(
    `INSERT INTO mobile_astronomy_dispatch_queue_r8
       (chain_uuid, notification_unit_id, occurrence_id, next_attempt_at, token_disposition, last_outcome, updated_at)
     VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, $6, now())
     ON CONFLICT (chain_uuid, notification_unit_id) DO UPDATE SET
       next_attempt_at=EXCLUDED.next_attempt_at, token_disposition=EXCLUDED.token_disposition,
       last_outcome=EXCLUDED.last_outcome, updated_at=now()`,
    [chainUuid, unit, occurrenceId, patch.nextAttemptAt, patch.tokenDisposition, patch.lastOutcome],
  );
}

/**
 * Drive one occurrence through claim → outbox → begin_submission → provider
 * call → result. Safe to call repeatedly: terminal/in-flight ledger states
 * skip, admission failure suppresses (policy) or simply defers (transient).
 */
export async function dispatchAstronomyOccurrenceOnce(
  deps: AstronomyDispatchDeps,
  occurrenceId: string,
): Promise<AstronomyDispatchResult> {
  const { pool, clock } = deps;
  const admission0 = await readAstronomyDispatchAdmission(pool, occurrenceId, clock());
  if (!admission0) return { status: "not_admitted", reason: "occurrence_missing" };
  if (!admission0.enabled) return { status: "not_admitted", reason: admission0.reason };
  // ของที่ต้องมีก่อนส่ง (ตั๋ว OAuth ฯลฯ) เช็คก่อนแตะ ledger — auth สะดุด
  // ชั่วคราวต้องเลื่อนงาน ไม่ใช่เผา attempt เป็น submit_unknown ถาวร
  if (deps.preflight && !(await deps.preflight())) {
    return { status: "not_admitted", reason: "transport_unavailable" };
  }

  const chainUuid = await resolveAstronomyChainUuid(pool, {
    userId: admission0.userId, orgId: admission0.orgId,
  });
  const unit = admission0.notificationUnitId;
  const key = { chainId: chainUuid, notificationUnitId: unit };

  // เคารพ backoff จากรอบก่อน (ค่าที่ reducer จงใจไม่เก็บ — อยู่ในคิวข้างเคียง)
  try {
    const due = await pool.query(
      `SELECT EXTRACT(EPOCH FROM next_attempt_at) * 1000 AS next_ms
         FROM mobile_astronomy_dispatch_queue_r8
        WHERE chain_uuid=$1 AND notification_unit_id=$2 AND next_attempt_at IS NOT NULL`,
      [chainUuid, unit],
    );
    const nextMs = due.rows[0] ? Math.round(Number(due.rows[0].next_ms)) : null;
    if (nextMs !== null && nextMs > clock()) return { status: "skipped", reason: "retry_not_due" };
  } catch (error) {
    if ((error as { code?: string })?.code !== "42P01") throw error;
  }

  const stored = await createOrLoadAstronomyDelivery(pool, {
    chainId: chainUuid, notificationUnitId: unit,
    createdAt: admission0.checkedAt,
    scheduledFor: admission0.scheduledFor, expiresAt: admission0.expiresAt,
    maxAttempts: MAX_ATTEMPTS, fence: admission0.fence,
  });
  // เริ่มได้จาก scheduled/rejected_retryable และไล่ต่อจาก claimed/outboxed
  // (ด่านแอดมิชชันเคยสะดุดชั่วคราวแล้วกลับมา — งานต้องเดินต่อได้ ไม่ค้างถาวร)
  const RESUMABLE = ["scheduled", "rejected_retryable", "claimed", "outboxed"];
  if (!RESUMABLE.includes(stored.state.state)) {
    return { status: "skipped", reason: `state_${stored.state.state}` };
  }

  /**
   * ทุก transition อ่านรั้วสดใหม่ ณ วินาทีของ event เอง และหลัง apply ต้อง
   * เช็คว่า state ไปถึงเป้าจริง — reducer "รับ" event ที่รั้วเปลี่ยนโดยแปลงเป็น
   * stop(policy_changed) ได้ (applied=true แต่ state=suppressed) ถ้าไม่เช็ค
   * เป้าปลายทาง ตัวส่งจะยิง provider ทั้งที่ ledger สั่งหยุดไปแล้ว
   */
  let revision = stored.revision;
  let stoppedByReducer = false;
  const step = async (
    expectState: string,
    build: (admission: AstronomyDispatchAdmissionRow, at: number) => Parameters<typeof applyAstronomyDeliveryEvent>[1]["event"],
  ) => {
    const at = clock();
    const admission = await readAstronomyDispatchAdmission(pool, occurrenceId, at);
    if (!admission || !admission.enabled) return null;
    const applied = await applyAstronomyDeliveryEvent(pool, {
      ...key, expectedRevision: revision, eventId: randomUUID(), event: build(admission, at),
    });
    if (!applied.applied) return null;
    revision = applied.revision;
    if (applied.state.state !== expectState) { stoppedByReducer = true; return null; }
    return admission;
  };

  let current = stored.state.state;
  if (current === "scheduled" || current === "rejected_retryable") {
    const claimed = await step("claimed", (admission, at) => ({ type: "claim", at, admission: { enabled: true, checkedAt: at, fence: admission.fence } }));
    if (!claimed) return stoppedByReducer ? { status: "stopped", reason: "claim_suppressed" } : { status: "not_admitted", reason: "claim_fence" };
    current = "claimed";
  }
  let outboxAdmission: AstronomyDispatchAdmissionRow | null = null;
  if (current === "claimed") {
    outboxAdmission = await step("outboxed", (admission, at) => ({ type: "outbox", at, admission: { enabled: true, checkedAt: at, fence: admission.fence } }));
    if (!outboxAdmission) return stoppedByReducer ? { status: "stopped", reason: "outbox_suppressed" } : { status: "stopped", reason: "outbox_fence" };
  } else {
    // ไล่ต่อจาก outboxed เดิม — อ่านรั้วสดเพื่อใช้ค่า locale/audience ปัจจุบัน
    outboxAdmission = await readAstronomyDispatchAdmission(pool, occurrenceId, clock());
    if (!outboxAdmission || !outboxAdmission.enabled) return { status: "stopped", reason: "resume_fence" };
  }

  let prepared;
  try {
    prepared = prepareAstronomyFcmR8({
      projectId: deps.projectId,
      locale: outboxAdmission.locale,
      payload: {
        v: 1, kind: "astronomy_fact",
        notificationId: occurrenceId, occurrenceId,
        audience: outboxAdmission.audience, mode: "civil_two_hour", url: "/astronomy-facts/detail",
      },
      expectedAudience: outboxAdmission.audience,
      scheduledFor: outboxAdmission.scheduledFor, preparedAt: clock(), expiresAt: outboxAdmission.expiresAt,
    });
  } catch (error) {
    // เตรียมไม่ผ่าน = ยังไม่มีอะไรออกจากเครื่อง — คงสถานะ outboxed ไว้ให้รอบหน้า
    return { status: "stopped", reason: `prepare_${error instanceof Error ? error.message.slice(0, 60) : "failed"}` };
  }
  const correlationId = randomUUID();
  const begun = await step("provider_submitting", (admission, at) => ({
    type: "begin_submission", at,
    admission: { enabled: true, checkedAt: at, fence: admission.fence },
    correlationId, payloadDigest: prepared.payloadDigest,
  }));
  if (!begun) return stoppedByReducer ? { status: "stopped", reason: "submission_suppressed" } : { status: "stopped", reason: "submission_fence" };
  if (!begun.deviceToken) return { status: "stopped", reason: "device_token_lost" };

  const outcome = await submitAstronomyFcmR8Once(prepared, begun.deviceToken, clock, deps.transport);

  // ผลจาก provider ต้องพยายามบันทึกเสมอ — race กับ acknowledge จากมือถือ
  // (app_received มาก่อน HTTP ตอบ) แพ้ CAS ได้ 1 ครั้ง อ่านใหม่แล้วลองซ้ำ
  let resultRecorded = false;
  for (let attempt = 0; attempt < 2 && !resultRecorded; attempt += 1) {
    try {
      const applied = await applyAstronomyDeliveryEvent(pool, {
        ...key, expectedRevision: revision, eventId: randomUUID(),
        event: {
          type: "result", at: clock(), correlationId,
          outcome: outcome.outcome === "accepted" ? "accepted" : outcome.outcome === "unknown" ? "unknown" : "not_accepted",
          retryable: outcome.retryable,
          evidenceRef: resultEvidenceRef(outcome),
        },
      });
      if (applied.applied || applied.duplicate) { resultRecorded = true; break; }
      if (applied.conflict) {
        const fresh = await readAstronomyDelivery(pool, key);
        if (!fresh) break;
        revision = fresh.revision;
        // acknowledge แซงไปแล้ว = หลักฐานแรงกว่าอยู่ใน ledger แล้ว พอ
        if (fresh.state.state === "acknowledged") { resultRecorded = true; break; }
        continue;
      }
      break;
    } catch {
      // attempt_mismatch/acceptance_downgrade — หลักฐานที่มีอยู่แรงกว่า ไม่ทับ
      resultRecorded = true;
      break;
    }
  }
  await upsertQueue(pool, chainUuid, unit, occurrenceId, {
    nextAttemptAt: outcome.retryable ? outcome.retryNotBefore : null,
    tokenDisposition: outcome.tokenDisposition,
    lastOutcome: resultRecorded ? outcome.outcome : `${outcome.outcome}_unrecorded`,
  });
  return {
    status: outcome.outcome === "accepted" ? "accepted" : outcome.outcome === "unknown" ? "unknown" : "not_accepted",
    retryNotBefore: outcome.retryable ? outcome.retryNotBefore : null,
    tokenDisposition: outcome.tokenDisposition,
  };
}

/** Transport จริง: FCM HTTP v1 ครั้งเดียวต่อคำขอ ไม่ retry ไม่ refresh ตั๋วในตัว */
export function createAstronomyFcmTransport(
  getTicket: () => Promise<{ token: string; projectId: string } | null>,
): (request: AstronomyFcmTransportRequest) => Promise<AstronomyFcmTransportResponse> {
  return async (request) => {
    const ticket = await getTicket();
    if (!ticket || ticket.projectId !== request.projectId) {
      throw new Error("r8_dispatch_ticket_unavailable");
    }
    const timeoutMs = Math.max(1_000, request.deadlineAt - Date.now());
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${request.projectId}/messages:send`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ticket.token}` },
        body: request.body,
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    // ตัดด้วยไบต์ ไม่ใช่ code unit — เพดานเดียวกับตัวจำแนกฝั่ง adapter
    const body = Buffer.from(await response.text(), "utf8").subarray(0, 16_384).toString("utf8");
    const retryAfter = response.headers.get("retry-after");
    return retryAfter === null
      ? { status: response.status, body }
      : { status: response.status, body, retryAfter };
  };
}
