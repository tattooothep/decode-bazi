import { createHash, randomUUID } from "crypto";
import { pool } from "@/lib/db";
import { charsToHours, type SpendResult } from "@/lib/spend-hours";

const LEGACY_TRIAL_SPEND = [
  "spend_sifu_network_pair_pre",
  "spend_sifu_compare_pre",
  "use_sifu_compare_cached_trial",
] as const;
const LEGACY_TRIAL_REFUND = [
  "refund_sifu_network_pair_pre",
  "refund_sifu_compare_pre",
] as const;

type BillingFeature = "sifu_network_pair" | "sifu_network_team";
type ReplayPayload = { reply: string };
type Reservation = SpendResult & { operationId: string; existing?: boolean; replay?: ReplayPayload };
const MAX_REPLAY_BYTES = 64 * 1024;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function networkBillingRequestFingerprint(scope: string, payload: unknown): string {
  return createHash("sha256").update(`${scope}:${canonicalJson(payload)}`).digest("hex");
}

function reservationFingerprint(note: string | null): string {
  try {
    const parsed = JSON.parse(note || "{}");
    return typeof parsed.requestFingerprint === "string" ? parsed.requestFingerprint : "";
  } catch {
    return "";
  }
}

function settlementPayload(note: string | null): { charged: number } {
  try {
    const parsed = JSON.parse(note || "{}");
    return { charged: Math.max(1, Number(parsed?.charged) || 1) };
  } catch {
    return { charged: 1 };
  }
}

function replayForStorage(replay?: ReplayPayload): ReplayPayload | undefined {
  if (!replay || typeof replay.reply !== "string") return undefined;
  const bytes = Buffer.byteLength(replay.reply, "utf8");
  return bytes > 0 && bytes <= MAX_REPLAY_BYTES ? replay : undefined;
}

function safeOperationSeed(req: Request): string {
  const supplied = (req.headers.get("x-hourkey-billing-operation") || req.headers.get("idempotency-key") || "").trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(supplied) ? supplied : randomUUID();
}

export function networkBillingOperationId(req: Request, userId: string, feature: BillingFeature): string {
  return createHash("sha256").update(`${userId}:${feature}:${safeOperationSeed(req)}`).digest("hex").slice(0, 40);
}

function refs(feature: BillingFeature, operationId: string) {
  const base = `ai:${feature}:${operationId}`;
  return { reserve: `${base}:reserve`, settle: `${base}:settle`, refund: `${base}:refund` };
}

function reserveReason(feature: BillingFeature, trial: boolean) {
  return `spend_${feature}_${trial ? "trial" : "full"}_pre`;
}

function refundReason(feature: BillingFeature, trial: boolean) {
  return `refund_${feature}_${trial ? "trial" : "full"}_pre`;
}

export async function reserveNetworkAiOperation(input: {
  feature: BillingFeature;
  operationId: string;
  requestFingerprint: string;
  trial: boolean;
  userId: string;
}): Promise<Reservation> {
  const client = await pool.connect();
  const opRefs = refs(input.feature, input.operationId);
  try {
    await client.query("BEGIN");
    const user = await client.query<{ hour_balance: number }>(
      `SELECT hour_balance FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
      [input.userId]
    );
    if (!user.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, error: "user_not_found", status: 404, operationId: input.operationId };
    }
    const existing = await client.query<{ balance_after: number; note: string | null; reason: string }>(
      `SELECT balance_after,note,reason FROM hour_transactions
        WHERE user_id=$1 AND ref_payment_id=$2 LIMIT 1`,
      [input.userId, opRefs.reserve]
    );
    if (existing.rows[0]) {
      if (reservationFingerprint(existing.rows[0].note) !== input.requestFingerprint) {
        await client.query("ROLLBACK");
        return { ok: false, error: "billing_operation_mismatch", status: 409, operationId: input.operationId };
      }
      const finalized = await client.query<{ balance_after: number; note: string | null; phase: string }>(
        `SELECT balance_after,note,CASE WHEN ref_payment_id=$2 THEN 'settled' ELSE 'refunded' END AS phase
           FROM hour_transactions WHERE user_id=$1 AND ref_payment_id IN ($2,$3) LIMIT 1`,
        [input.userId, opRefs.settle, opRefs.refund]
      );
      if (finalized.rows[0]?.phase === "refunded") {
        await client.query("ROLLBACK");
        return { ok: false, error: "billing_operation_refunded", status: 409, operationId: input.operationId };
      }
      if (finalized.rows[0]?.phase === "settled") {
        const payload = settlementPayload(finalized.rows[0].note);
        const replay = await client.query<{ reply: string }>(
          `SELECT reply FROM network_ai_operation_replays
            WHERE user_id=$1 AND feature=$2 AND operation_id=$3
              AND request_fingerprint=$4 AND expires_at>now()
            LIMIT 1`,
          [input.userId, input.feature, input.operationId, input.requestFingerprint]
        );
        if (replay.rows[0]?.reply) {
          await client.query("COMMIT");
          return {
            ok: true,
            spent: payload.charged,
            balance_after: Number(finalized.rows[0].balance_after),
            operationId: input.operationId,
            existing: true,
            replay: { reply: replay.rows[0].reply },
          };
        }
      }
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: finalized.rows[0]?.phase === "settled" ? "billing_operation_settled" : "billing_operation_in_progress",
        status: 409,
        operationId: input.operationId,
      };
    }

    if (input.trial) {
      const used = await client.query<{ n: number }>(
        `SELECT GREATEST(0,
           COUNT(*) FILTER (WHERE reason = ANY($2::text[]) OR reason='spend_sifu_network_pair_trial_pre') -
           COUNT(*) FILTER (WHERE reason = ANY($3::text[]) OR reason='refund_sifu_network_pair_trial_pre')
         )::int AS n FROM hour_transactions WHERE user_id=$1`,
        [input.userId, [...LEGACY_TRIAL_SPEND], [...LEGACY_TRIAL_REFUND]]
      );
      if ((Number(used.rows[0]?.n) || 0) >= 1) {
        await client.query("ROLLBACK");
        return { ok: false, error: "network_pair_ai_trial_used", status: 403, operationId: input.operationId };
      }
    }

    const balance = Number(user.rows[0].hour_balance) || 0;
    if (balance < 1) {
      await client.query("ROLLBACK");
      return { ok: false, error: "insufficient_hours", status: 402, required: 1, balance, operationId: input.operationId };
    }
    const updated = await client.query<{ hour_balance: number }>(
      `UPDATE users SET hour_balance=hour_balance-1 WHERE id=$1 RETURNING hour_balance`,
      [input.userId]
    );
    const balanceAfter = Number(updated.rows[0].hour_balance);
    await client.query(
      `INSERT INTO hour_transactions
       (user_id,delta,reason,balance_after,ref_feature,ref_payment_id,note)
       VALUES ($1,-1,$2,$3,$4,$5,$6)`,
      [input.userId, reserveReason(input.feature, input.trial), balanceAfter, input.feature, opRefs.reserve, JSON.stringify({ requestFingerprint: input.requestFingerprint, trial: input.trial })]
    );
    await client.query("COMMIT");
    return { ok: true, spent: 1, balance_after: balanceAfter, operationId: input.operationId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function reserveNetworkPairTrialOnce(userId: string, operationId = randomUUID(), requestFingerprint = operationId) {
  return reserveNetworkAiOperation({ feature: "sifu_network_pair", operationId, requestFingerprint, trial: true, userId });
}

export async function settleNetworkAiOperation(input: {
  chars: number;
  feature: BillingFeature;
  operationId: string;
  replay?: ReplayPayload;
  userId: string;
}) {
  const client = await pool.connect();
  const opRefs = refs(input.feature, input.operationId);
  try {
    await client.query("BEGIN");
    const user = await client.query<{ hour_balance: number }>(
      `SELECT hour_balance FROM users WHERE id=$1 FOR UPDATE`,
      [input.userId]
    );
    if (!user.rows[0]) throw new Error("billing_user_missing");
    const reserve = await client.query<{ note: string | null; reason: string }>(
      `SELECT note,reason FROM hour_transactions WHERE user_id=$1 AND ref_payment_id=$2 LIMIT 1`,
      [input.userId, opRefs.reserve]
    );
    if (!reserve.rows[0]) throw new Error("billing_reservation_missing");
    const refunded = await client.query<{ balance_after: number }>(
      `SELECT balance_after FROM hour_transactions WHERE user_id=$1 AND ref_payment_id=$2 LIMIT 1`,
      [input.userId, opRefs.refund]
    );
    if (refunded.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false as const, status: "refunded", spent: 0, balance_after: Number(refunded.rows[0].balance_after) };
    }
    const settled = await client.query<{ balance_after: number; note: string | null }>(
      `SELECT balance_after,note FROM hour_transactions WHERE user_id=$1 AND ref_payment_id=$2 LIMIT 1`,
      [input.userId, opRefs.settle]
    );
    if (settled.rows[0]) {
      await client.query("COMMIT");
      const charged = settlementPayload(settled.rows[0].note).charged;
      return { ok: true as const, existing: true, spent: charged, balance_after: Number(settled.rows[0].balance_after) };
    }
    const wanted = charsToHours(input.chars);
    const extraWanted = Math.max(0, wanted - 1);
    let extraSpent = 0;
    let balanceAfter = Number(user.rows[0].hour_balance);
    if (extraWanted > 0) {
      const updated = await client.query<{ old_bal: number; new_bal: number }>(
        `WITH cur AS (SELECT hour_balance AS old_bal FROM users WHERE id=$1 FOR UPDATE)
         UPDATE users SET hour_balance=GREATEST(0,hour_balance-$2)
         FROM cur WHERE users.id=$1 RETURNING cur.old_bal,users.hour_balance AS new_bal`,
        [input.userId, extraWanted]
      );
      extraSpent = Math.max(0, Number(updated.rows[0].old_bal) - Number(updated.rows[0].new_bal));
      balanceAfter = Number(updated.rows[0].new_bal);
    }
    const charged = 1 + extraSpent;
    const requestFingerprint = reservationFingerprint(reserve.rows[0].note);
    const replay = requestFingerprint ? replayForStorage(input.replay) : undefined;
    await client.query(
      `INSERT INTO hour_transactions
       (user_id,delta,reason,balance_after,ref_feature,ref_payment_id,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.userId, -extraSpent, `settle_${input.feature}`, balanceAfter, input.feature, opRefs.settle, JSON.stringify({ charged, replayStored: Boolean(replay) })]
    );
    await client.query(`DELETE FROM network_ai_operation_replays WHERE user_id=$1 AND expires_at<=now()`, [input.userId]);
    if (replay) {
      await client.query(
        `INSERT INTO network_ai_operation_replays(user_id,feature,operation_id,request_fingerprint,reply,expires_at)
         VALUES($1,$2,$3,$4,$5,now()+interval '24 hours')
         ON CONFLICT(user_id,feature,operation_id) DO UPDATE SET
           request_fingerprint=EXCLUDED.request_fingerprint,reply=EXCLUDED.reply,
           created_at=now(),expires_at=EXCLUDED.expires_at`,
        [input.userId, input.feature, input.operationId, requestFingerprint, replay.reply]
      );
    }
    await client.query("COMMIT");
    return { ok: true as const, spent: charged, balance_after: balanceAfter };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function refundNetworkAiOperation(input: {
  feature: BillingFeature;
  operationId: string;
  reason?: string;
  userId: string;
}) {
  const client = await pool.connect();
  const opRefs = refs(input.feature, input.operationId);
  try {
    await client.query("BEGIN");
    const user = await client.query<{ hour_balance: number }>(
      `SELECT hour_balance FROM users WHERE id=$1 FOR UPDATE`,
      [input.userId]
    );
    if (!user.rows[0]) throw new Error("billing_user_missing");
    const reserve = await client.query<{ reason: string }>(
      `SELECT reason FROM hour_transactions WHERE user_id=$1 AND ref_payment_id=$2 LIMIT 1`,
      [input.userId, opRefs.reserve]
    );
    if (!reserve.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false as const, status: "missing" };
    }
    const finalized = await client.query<{ balance_after: number; phase: string }>(
      `SELECT balance_after,CASE WHEN ref_payment_id=$2 THEN 'settled' ELSE 'refunded' END AS phase
         FROM hour_transactions WHERE user_id=$1 AND ref_payment_id IN ($2,$3) LIMIT 1`,
      [input.userId, opRefs.settle, opRefs.refund]
    );
    if (finalized.rows[0]) {
      await client.query("COMMIT");
      return { ok: finalized.rows[0].phase === "refunded", existing: true, status: finalized.rows[0].phase, balance_after: Number(finalized.rows[0].balance_after) };
    }
    const trial = reserve.rows[0].reason.includes("_trial_");
    const updated = await client.query<{ hour_balance: number }>(
      `UPDATE users SET hour_balance=hour_balance+1 WHERE id=$1 RETURNING hour_balance`,
      [input.userId]
    );
    const balanceAfter = Number(updated.rows[0].hour_balance);
    await client.query(
      `INSERT INTO hour_transactions
       (user_id,delta,reason,balance_after,ref_feature,ref_payment_id,note)
       VALUES ($1,1,$2,$3,$4,$5,$6)`,
      [input.userId, refundReason(input.feature, trial), balanceAfter, input.feature, opRefs.refund, (input.reason || "failed").slice(0, 160)]
    );
    await client.query("COMMIT");
    return { ok: true as const, refunded: 1, balance_after: balanceAfter };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function claimCachedNetworkPairTrial(userId: string, operationId: string, requestFingerprint: string) {
  const client = await pool.connect();
  const ref = `ai:sifu_network_pair:${operationId}:cached-trial`;
  try {
    await client.query("BEGIN");
    const user = await client.query<{ hour_balance: number }>(`SELECT hour_balance FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    if (!user.rows[0]) throw new Error("billing_user_missing");
    const existing = await client.query<{ note: string | null }>(`SELECT note FROM hour_transactions WHERE user_id=$1 AND ref_payment_id=$2`, [userId, ref]);
    if (existing.rows[0]) {
      await client.query("COMMIT");
      if (reservationFingerprint(existing.rows[0].note) !== requestFingerprint) {
        return { ok: false as const, error: "billing_operation_mismatch", status: 409 };
      }
      return { ok: false as const, error: "billing_operation_settled", status: 409 };
    }
    const used = await client.query<{ n: number }>(
      `SELECT GREATEST(0,
         COUNT(*) FILTER (WHERE reason = ANY($2::text[]) OR reason='spend_sifu_network_pair_trial_pre') -
         COUNT(*) FILTER (WHERE reason = ANY($3::text[]) OR reason='refund_sifu_network_pair_trial_pre')
       )::int AS n FROM hour_transactions WHERE user_id=$1`,
      [userId, [...LEGACY_TRIAL_SPEND], [...LEGACY_TRIAL_REFUND]]
    );
    if ((Number(used.rows[0]?.n) || 0) >= 1) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "network_pair_ai_trial_used", status: 403 };
    }
    await client.query(
      `INSERT INTO hour_transactions(user_id,delta,reason,balance_after,ref_feature,ref_payment_id,note)
       VALUES ($1,0,'use_sifu_compare_cached_trial',$2,'sifu_network_pair',$3,$4)`,
      [userId, user.rows[0].hour_balance, ref, JSON.stringify({ requestFingerprint, trial: true })]
    );
    await client.query("COMMIT");
    return { ok: true as const };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
