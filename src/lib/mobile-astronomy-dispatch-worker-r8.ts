/**
 * R8 dispatch sweep (worker logic · 6 ก.ย. 2569)
 *
 * Enumerates work then delegates every decision to the fenced orchestrator:
 *  1. live shadowed occurrences whose window has opened (new units);
 *  2. queue rows whose next_attempt_at has passed (authoritative retries);
 *  3. ledgers stuck in provider_submitting beyond the stale window (crashed
 *     mid-flight) → recover_submission → submit_unknown, never resent.
 *
 * The sweep itself holds no policy: with production hard-off CHECKs every
 * candidate returns not_admitted and nothing is written. Deps are injected —
 * the cron entry passes the real pool/clock/transport, tests pass mocks.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  applyAstronomyDeliveryEvent,
  readAstronomyDelivery,
} from "./mobile-astronomy-delivery-store-r8";
import {
  dispatchAstronomyOccurrenceOnce,
  type AstronomyDispatchDeps,
  type AstronomyDispatchResult,
} from "./mobile-astronomy-dispatch-r8";

const STALE_SUBMISSION_MS = 10 * 60_000;

export type AstronomyDispatchSweepReport = Readonly<{
  scanned: number;
  dispatched: number;
  notAdmitted: number;
  skipped: number;
  stopped: number;
  recovered: number;
  failures: number;
}>;

async function candidateOccurrences(pool: Pool, limit: number): Promise<string[]> {
  const fresh = await pool.query<{ id: string }>(
    `SELECT o.id
       FROM mobile_science_notification_occurrences o
      WHERE o.science_id = 'astronomy_fact' AND o.state = 'shadowed'
        AND o.scheduled_for <= now() AND o.expires_at > now()
      ORDER BY o.scheduled_for ASC
      LIMIT $1`,
    [limit],
  );
  let due: { rows: Array<{ occurrence_id: string }> } = { rows: [] };
  try {
    due = await pool.query<{ occurrence_id: string }>(
      `SELECT occurrence_id FROM mobile_astronomy_dispatch_queue_r8
        WHERE next_attempt_at IS NOT NULL AND next_attempt_at <= now()
        ORDER BY next_attempt_at ASC
        LIMIT $1`,
      [limit],
    );
  } catch (error) {
    if ((error as { code?: string })?.code !== "42P01") throw error;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of [...fresh.rows, ...due.rows]) {
    const id = "id" in row ? row.id : row.occurrence_id;
    if (!seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out.slice(0, limit);
}

/** ledger ค้าง provider_submitting นานผิดปกติ = ตายกลางทาง → ปิดเป็น submit_unknown */
async function recoverStaleSubmissions(pool: Pool, now: number, limit: number): Promise<number> {
  let stale: { rows: Array<{ chain_uuid: string; notification_unit_id: string }> };
  try {
    // เวลาอยู่ใน state jsonb (ตาราง ledger จงใจไม่มี updated_at แยก)
    stale = await pool.query(
      `SELECT chain_uuid, notification_unit_id
         FROM mobile_astronomy_delivery_ledgers_r8
        WHERE current_state->>'state' = 'provider_submitting'
          AND (current_state->>'updatedAt')::numeric < ($1::numeric - $2::numeric)
        LIMIT $3`,
      [now, STALE_SUBMISSION_MS, limit],
    );
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") return 0;
    throw error;
  }
  let recovered = 0;
  for (const row of stale.rows) {
    const key = { chainId: row.chain_uuid, notificationUnitId: row.notification_unit_id };
    try {
      const stored = await readAstronomyDelivery(pool, key);
      if (!stored || stored.state.state !== "provider_submitting") continue;
      const result = await applyAstronomyDeliveryEvent(pool, {
        ...key, expectedRevision: stored.revision, eventId: randomUUID(),
        event: { type: "recover_submission", at: Math.max(now, Number(stored.state.updatedAt) || 0) },
      });
      if (result.applied) recovered += 1;
    } catch {
      // แข่งกับ worker อื่น/ผลจริงเพิ่งมาถึง — ปล่อยรอบหน้าตัดสิน
    }
  }
  return recovered;
}

export async function runAstronomyDispatchSweep(
  deps: AstronomyDispatchDeps,
  options: Readonly<{ limit?: number }> = {},
): Promise<AstronomyDispatchSweepReport> {
  const limit = Number.isInteger(options.limit) && (options.limit as number) > 0 ? (options.limit as number) : 50;
  const candidates = await candidateOccurrences(deps.pool, limit);
  let dispatched = 0, notAdmitted = 0, skipped = 0, stopped = 0, failures = 0;
  for (const occurrenceId of candidates) {
    let result: AstronomyDispatchResult;
    try {
      result = await dispatchAstronomyOccurrenceOnce(deps, occurrenceId);
    } catch {
      failures += 1;
      continue;
    }
    if (result.status === "accepted" || result.status === "not_accepted" || result.status === "unknown") dispatched += 1;
    else if (result.status === "not_admitted") notAdmitted += 1;
    else if (result.status === "skipped") skipped += 1;
    else stopped += 1;
  }
  const recovered = await recoverStaleSubmissions(deps.pool, deps.clock(), limit);
  return Object.freeze({
    scanned: candidates.length, dispatched, notAdmitted, skipped, stopped, recovered, failures,
  });
}
