/**
 * GET /api/account/me · tier + 時 + trial + entitlement caps
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import {
  getProductAccess,
  FREE_SIGNUP_YAM,
  TRIAL_DAYS,
  productAccessToCaps,
} from "@/lib/product-entitlement";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const row = await q1<{
    tier: string;
    hour_balance: number;
    sub_expires_at: string | null;
    trial_ends_at: string | null;
    email: string;
    name: string | null;
    avatar_url: string | null;
  }>(
    `SELECT tier, hour_balance, sub_expires_at, trial_ends_at, email, name, avatar_url FROM users WHERE id=$1`,
    [s.userId]
  );
  if (!row) return NextResponse.json({ error: "user not found" }, { status: 404 });
  const now = Date.now();
  const subActive = row.sub_expires_at && new Date(row.sub_expires_at).getTime() > now;
  const access = await getProductAccess(s.userId);
  return NextResponse.json({
    id: s.userId,
    email: row.email,
    name: row.name,
    avatar_url: row.avatar_url,
    tier: row.tier || "free",
    sub_expires_at: row.sub_expires_at,
    sub_active: !!subActive,
    hour_balance: row.hour_balance ?? 0,
    trial_ends_at: row.trial_ends_at,
    in_trial: !!access?.in_trial,
    plan: access?.plan || "free",
    caps: access ? productAccessToCaps(access) : null,
    product: {
      free_signup_yam: FREE_SIGNUP_YAM,
      trial_days: TRIAL_DAYS,
    },
  });
}
