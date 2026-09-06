/**
 * R8 astronomy engagement receipt mapping (integration gap #1 · 6 ก.ย. 2569)
 *
 * The legacy engagement recorder resolves notificationId strictly as a
 * mobile_push_log row, so astronomy_fact receipts always fell through to
 * not_found. This module resolves the same HTTP body against the R8 world
 * instead — occurrence ownership first (identical predicate family to the
 * detail route: user, org, installation, primary active endpoint whose
 * audience binding still matches the enabled token), then maps
 * occurrence → (registry chain UUID, notification_unit_id) → the durable
 * delivery ledger, and records the verified device evidence as an
 * `acknowledge` event on the last attempt. The ledger key always comes from
 * the immutable registry resolver — never from the chains row directly, which
 * is deleted and re-minted on device transfer.
 *
 * Contract notes:
 *  - Dispatch (not yet wired) must mint provider payload `notificationId`
 *    equal to the occurrence UUID; this resolver depends on that identity.
 *  - The legacy path and its tables are untouched; callers branch here first
 *    and fall through on "not_astronomy".
 *  - No ledger row / no attempt / not-yet-submitted states are not errors:
 *    the device did nothing wrong, so the report is absorbed without record
 *    ("accepted_no_dispatch") rather than surfaced as a retryable failure.
 *  - Event ids are deterministic per (chain, unit, event, action,
 *    installation), so device replays deduplicate on the ledger's unique
 *    event id instead of appending noise.
 */
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import {
  applyAstronomyDeliveryEvent,
  readAstronomyDelivery,
} from "./mobile-astronomy-delivery-store-r8";
import { resolveAstronomyChainUuid } from "./mobile-astronomy-chain-registry-r8";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type AstronomyEngagementInput = Readonly<{
  userId: string;
  orgId: string;
  notificationId: string;
  installationId: string;
  event: "app_received" | "opened" | "action";
  actionId: string;
}>;

export type AstronomyEngagementOutcome =
  | "recorded"
  | "duplicate"
  | "accepted_no_dispatch"
  | "conflict"
  | "not_astronomy";

/** UUID เชิงกำหนดจากเนื้อ engagement — replay เดิมชน unique event_id เสมอ */
export function astronomyEngagementEventId(parts: readonly string[]): string {
  const hex = createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function recordAstronomyEngagementR8(
  pool: Pool,
  input: AstronomyEngagementInput,
): Promise<AstronomyEngagementOutcome> {
  // orgId ต้องเป็น UUID จริงเสมอ — session ไม่มี org = ไม่เข้าเส้นนี้
  // (predicate เดียวกับ detail route ซึ่งปฏิเสธ session ไร้ org)
  if (!UUID_RE.test(input.notificationId) || !UUID_RE.test(input.installationId)
    || !UUID_RE.test(input.userId) || !UUID_RE.test(input.orgId)) {
    return "not_astronomy";
  }
  const owned = await pool.query<{ org_id: string; notification_unit_id: string }>(
    `SELECT c.org_id, o.notification_unit_id
       FROM mobile_science_notification_occurrences o
       JOIN mobile_science_notification_chains c ON c.id = o.chain_id
       JOIN mobile_science_notification_endpoints e ON e.chain_id = c.id
       JOIN mobile_push_tokens t ON t.id = e.token_id
      WHERE o.id = $1::uuid AND c.user_id = $2::uuid AND c.org_id = $3::uuid
        AND e.installation_id = $4::uuid
        AND e.primary_endpoint = true AND e.active = true
        AND e.audience_binding = t.astronomy_fact_audience_binding
        AND t.enabled = true AND t.user_id = c.user_id
        AND c.science_id = 'astronomy_fact' AND o.science_id = 'astronomy_fact'
      LIMIT 1`,
    [input.notificationId, input.userId, input.orgId, input.installationId],
  );
  const target = owned.rows[0];
  if (!target) return "not_astronomy";

  /**
   * กุญแจ ledger ต้องมาจาก registry เสมอ ไม่ใช่ chains.account_delivery_chain_uuid
   * ตรงๆ — แถว chains ถูกลบ-สร้างใหม่ได้ตอนย้ายเครื่อง แต่ ledger เขียนใต้
   * UUID ถาวรจาก registry (resolver adopt UUID ยุคก่อน registry ให้เอง)
   * ตาราง registry/ledger ยังไม่ apply = ยังไม่เคยส่งอะไรจริง → ซับรายงานทิ้ง
   */
  let chainUuid: string;
  try {
    chainUuid = await resolveAstronomyChainUuid(pool, { userId: input.userId, orgId: target.org_id });
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") return "accepted_no_dispatch";
    throw error;
  }
  const key = { chainId: chainUuid, notificationUnitId: target.notification_unit_id };
  const evidenceRef = `engagement.${input.event}.${input.actionId || "none"}:${input.installationId}`.slice(0, 160);
  const eventId = astronomyEngagementEventId([
    "astro-engagement", chainUuid, target.notification_unit_id,
    input.event, input.actionId, input.installationId,
  ]);

  // conflict = concurrent ledger writer moved the revision — one fresh re-read
  // is enough (the dedupe event id makes the retry idempotent anyway).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let stored;
    try {
      stored = await readAstronomyDelivery(pool, key);
    } catch (error) {
      // ตาราง ledger ยังไม่ apply (deploy ก่อน migration) = ยังไม่เคยส่งจริง
      if ((error as { code?: string })?.code === "42P01") return "accepted_no_dispatch";
      throw error;
    }
    if (!stored) return "accepted_no_dispatch";
    const attempts = Array.isArray(stored.state?.attempts) ? stored.state.attempts : [];
    const last = attempts[attempts.length - 1];
    if (!last || typeof last.correlationId !== "string") return "accepted_no_dispatch";
    try {
      const result = await applyAstronomyDeliveryEvent(pool, {
        ...key,
        expectedRevision: stored.revision,
        eventId,
        event: {
          type: "acknowledge",
          // The store refuses time running backwards relative to the ledger.
          at: Math.max(Date.now(), Number(stored.state?.updatedAt) || 0),
          correlationId: last.correlationId,
          evidenceRef,
        },
      });
      if (result.duplicate) return "duplicate";
      if (result.applied) return "recorded";
      if (!result.conflict) return "duplicate";
    } catch (error) {
      // A unit that never reached provider submission cannot be acknowledged —
      // absorb rather than fail the device (nothing was actually delivered).
      const text = error instanceof Error ? error.message : "";
      if (text.includes("transition_invalid") || text.includes("attempt_mismatch")) {
        return "accepted_no_dispatch";
      }
      // Same deterministic id, different timestamp bytes: the first report of
      // this exact engagement already stands — that is a device replay.
      if (text.includes("event_id_conflict")) return "duplicate";
      throw error;
    }
  }
  // CAS แพ้ 2 รอบติด = ยังไม่ได้บันทึกจริง — บอกตรงให้เครื่องลองใหม่ ไม่โกหกว่าซ้ำ
  return "conflict";
}
