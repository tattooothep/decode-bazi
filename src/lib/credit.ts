/**
 * ระบบเครดิต "ยาม" · 29 มิ.ย. 2026
 * - เริ่มต้น 500 ยาม/org (DEFAULT ใน migration)
 * - หักตามจำนวนตัวอักษร "คำตอบ" ของ AI · ÷30 ตัวอักษร = 1 ยาม (ปรับผ่าน env CREDIT_CHARS_PER_YAM)
 * - หักแบบ atomic ไม่ติดลบ + log ลง credit_ledger
 * helper บริสุทธิ์ · ไม่แตะ engine/auth · import ได้ทุก route
 */
import { q1 } from "@/lib/db";

const CHARS_PER_YAM = Math.max(1, Number(process.env.CREDIT_CHARS_PER_YAM || 30));

/** จำนวนตัวอักษรคำตอบ → ยามที่ต้องหัก (ปัดขึ้น) */
export function charsToYam(chars: number): number {
  const n = Math.max(0, Math.floor(Number(chars) || 0));
  return Math.ceil(n / CHARS_PER_YAM);
}

export async function getCredit(orgId: string | null | undefined): Promise<number> {
  if (!orgId) return 0;
  const row = await q1<{ credit_yam: number }>(
    `SELECT credit_yam FROM organizations WHERE id = $1`,
    [orgId]
  );
  return row ? Number(row.credit_yam) : 0;
}

export async function hasCredit(orgId: string | null | undefined): Promise<boolean> {
  return (await getCredit(orgId)) > 0;
}

/** หักเครดิตตามจำนวนตัวอักษรคำตอบ · atomic · clamp ≥ 0 · คืน { cost, balance } */
export async function chargeForAnswer(
  orgId: string | null | undefined,
  replyChars: number,
  reason: string
): Promise<{ cost: number; balance: number }> {
  const cost = charsToYam(replyChars);
  if (!orgId || cost <= 0) {
    return { cost: 0, balance: await getCredit(orgId) };
  }
  const row = await q1<{ credit_yam: number }>(
    `UPDATE organizations SET credit_yam = GREATEST(0, credit_yam - $2) WHERE id = $1 RETURNING credit_yam`,
    [orgId, cost]
  );
  const balance = row ? Number(row.credit_yam) : 0;
  try {
    await q1(
      `INSERT INTO credit_ledger (org_id, delta, reason, chars, balance_after) VALUES ($1, $2, $3, $4, $5)`,
      [orgId, -cost, reason, Math.max(0, Math.floor(Number(replyChars) || 0)), balance]
    );
  } catch { /* ledger best-effort · ห้ามให้ล้มกระทบ flow */ }
  return { cost, balance };
}

/** เติมเครดิต (admin/topup) · คืนยอดคงเหลือใหม่ */
export async function topUp(
  orgId: string,
  amount: number,
  reason = "topup"
): Promise<number> {
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  if (!orgId || amt <= 0) return getCredit(orgId);
  const row = await q1<{ credit_yam: number }>(
    `UPDATE organizations SET credit_yam = credit_yam + $2 WHERE id = $1 RETURNING credit_yam`,
    [orgId, amt]
  );
  const balance = row ? Number(row.credit_yam) : 0;
  try {
    await q1(
      `INSERT INTO credit_ledger (org_id, delta, reason, chars, balance_after) VALUES ($1, $2, $3, NULL, $4)`,
      [orgId, amt, reason, balance]
    );
  } catch { /* best-effort */ }
  return balance;
}
