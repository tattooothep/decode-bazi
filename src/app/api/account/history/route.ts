/**
 * GET /api/account/history · 50 transactions ล่าสุด
 * 15 พ.ค. 2026
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q } from "@/lib/db";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const rows = await q(
    `SELECT id, delta, reason, balance_after, ref_feature, note, created_at
     FROM hour_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [s.userId]
  );
  return NextResponse.json({ transactions: rows });
}
