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

export type RefundResult =
  | { ok: true; balance_after: number; refunded: number }
  | { ok: false; error: string; status: number };

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

/* ── เครดิตตามจำนวนตัวอักษรคำตอบ ── 29 มิ.ย. · ÷30 ตัวอักษร = 1 ยาม (ปรับผ่าน env CREDIT_CHARS_PER_YAM) */
const CHARS_PER_YAM = Math.max(1, Number(process.env.CREDIT_CHARS_PER_YAM || 30));
export function charsToHours(chars: number): number {
  return Math.max(1, Math.ceil((Math.max(0, Math.floor(Number(chars) || 0))) / CHARS_PER_YAM));
}
/** หักยามตามจำนวนตัวอักษรคำตอบ AI */
export async function spendHoursByChars(chars: number, feature: string): Promise<SpendResult> {
  return spendHours(charsToHours(chars), feature);
}
/** ยอดยามคงเหลือของ user ที่ล็อกอิน (สำหรับ pre-check) · -1 = ไม่ล็อกอิน */
export async function getHourBalance(): Promise<number> {
  const s = await getSession();
  if (!s) return -1;
  const row = await q1<{ hour_balance: number }>(`SELECT hour_balance FROM users WHERE id=$1`, [s.userId]);
  return row ? Number(row.hour_balance) : 0;
}

/* ── variant รับ userId ตรง · ปลอดภัยใน stream callback (ที่ getSession/cookies ใช้ไม่ได้) ── */
export async function spendHoursForUser(userId: string, amount: number, feature: string): Promise<SpendResult> {
  if (!userId) return { ok: false, error: "no_user", status: 401 };
  const amt = Math.max(1, Math.floor(amount));
  const row = await q1<{ hour_balance: number }>(
    `UPDATE users SET hour_balance = hour_balance - $2 WHERE id=$1 AND hour_balance >= $2 RETURNING hour_balance`,
    [userId, amt]
  );
  if (!row) {
    const cur = await q1<{ hour_balance: number }>(`SELECT hour_balance FROM users WHERE id=$1`, [userId]);
    return { ok: false, error: "insufficient_hours", status: 402, required: amt, balance: cur?.hour_balance ?? 0 };
  }
  await q(
    `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_feature) VALUES ($1, $2, $3, $4, $5)`,
    [userId, -amt, `spend_${feature}`, row.hour_balance, feature]
  );
  return { ok: true, balance_after: row.hour_balance, spent: amt };
}
export async function spendHoursByCharsForUser(userId: string, chars: number, feature: string): Promise<SpendResult> {
  return spendHoursForUser(userId, charsToHours(chars), feature);
}
export async function getHourBalanceForUser(userId: string): Promise<number> {
  if (!userId) return -1;
  const row = await q1<{ hour_balance: number }>(`SELECT hour_balance FROM users WHERE id=$1`, [userId]);
  return row ? Number(row.hour_balance) : 0;
}

export async function refundHours(amount: number, feature: string): Promise<RefundResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "not logged in", status: 401 };
  const amt = Math.max(1, Math.floor(amount));
  const row = await q1<{ hour_balance: number }>(
    `UPDATE users SET hour_balance = hour_balance + $2 WHERE id=$1 RETURNING hour_balance`,
    [s.userId, amt]
  );
  if (!row) return { ok: false, error: "refund_user_not_found", status: 404 };
  await q(
    `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_feature) VALUES ($1, $2, $3, $4, $5)`,
    [s.userId, amt, `refund_${feature}`, row.hour_balance, feature]
  );
  return { ok: true, balance_after: row.hour_balance, refunded: amt };
}
