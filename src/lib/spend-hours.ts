/**
 * spend-hours · helper สำหรับ AI endpoints
 * เรียกก่อน Claude · ตรวจ balance + deduct
 * 15 พ.ค. 2026
 */
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

export type SpendResult =
  | { ok: true; balance_after: number; spent: number }
  | { ok: false; error: string; status: number; required?: number; balance?: number };

export async function spendHours(amount: number, feature: string): Promise<SpendResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "not logged in", status: 401 };
  const amt = Math.max(1, Math.floor(amount));
  const row = await q1<{ hour_balance: number; tier: string }>(
    `UPDATE users SET hour_balance = hour_balance - $2 WHERE id=$1 AND hour_balance >= $2 RETURNING hour_balance, tier`,
    [s.userId, amt]
  );
  if (!row) {
    const cur = await q1<{ hour_balance: number }>(`SELECT hour_balance FROM users WHERE id=$1`, [s.userId]);
    return { ok: false, error: "insufficient_hours", status: 402, required: amt, balance: cur?.hour_balance ?? 0 };
  }
  await q(
    `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_feature) VALUES ($1, $2, $3, $4, $5)`,
    [s.userId, -amt, `spend_${feature}`, row.hour_balance, feature]
  );
  return { ok: true, balance_after: row.hour_balance, spent: amt };
}
