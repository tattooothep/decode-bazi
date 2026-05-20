/**
 * POST /api/account/spend · deduct 時 + log transaction
 * รับ: { amount, feature, note? }
 * คืน: { ok, balance_after } หรือ 402 ถ้า insufficient
 * 15 พ.ค. 2026
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const amount = Math.max(1, Math.floor(Number(body.amount) || 1));
  const feature = String(body.feature || "unknown").slice(0, 60);
  const note = body.note ? String(body.note).slice(0, 200) : null;

  /* atomic deduct */
  const row = await q1<{ hour_balance: number }>(
    `UPDATE users SET hour_balance = hour_balance - $2 WHERE id=$1 AND hour_balance >= $2 RETURNING hour_balance`,
    [s.userId, amount]
  );
  if (!row) {
    const cur = await q1<{ hour_balance: number }>(`SELECT hour_balance FROM users WHERE id=$1`, [s.userId]);
    return NextResponse.json({ error: "insufficient 時 balance", balance: cur?.hour_balance ?? 0, required: amount }, { status: 402 });
  }
  await q(
    `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_feature, note) VALUES ($1, $2, $3, $4, $5, $6)`,
    [s.userId, -amount, `spend_${feature}`, row.hour_balance, feature, note]
  );
  return NextResponse.json({ ok: true, balance_after: row.hour_balance, spent: amount, feature });
}
