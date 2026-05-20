/**
 * GET /api/account/me · current user tier + 時 balance + sub status
 * 15 พ.ค. 2026 · อากง
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const row = await q1<{ tier: string; hour_balance: number; sub_expires_at: string | null; email: string; name: string | null; avatar_url: string | null }>(
    `SELECT tier, hour_balance, sub_expires_at, email, name, avatar_url FROM users WHERE id=$1`,
    [s.userId]
  );
  if (!row) return NextResponse.json({ error: "user not found" }, { status: 404 });
  const now = Date.now();
  const subActive = row.sub_expires_at && new Date(row.sub_expires_at).getTime() > now;
  return NextResponse.json({
    id: s.userId,
    email: row.email,
    name: row.name,
    avatar_url: row.avatar_url,
    tier: row.tier || "free",
    sub_expires_at: row.sub_expires_at,
    sub_active: !!subActive,
    hour_balance: row.hour_balance ?? 0,
  });
}
