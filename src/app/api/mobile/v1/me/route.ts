import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { userHasProfile } from "@/lib/profile-status";
import {
  getProductAccess,
  FREE_SIGNUP_YAM,
  TRIAL_DAYS,
  productAccessToCaps,
} from "@/lib/product-entitlement";

export const dynamic = "force-dynamic";

type MobileAccountRow = {
  id: string;
  email: string;
  name: string | null;
  locale: string | null;
  theme: string | null;
  avatar_url: string | null;
  tier: string | null;
  hour_balance: number | null;
  sub_expires_at: string | null;
  trial_ends_at: string | null;
};

async function loadAccountPayload(session: { userId: string }) {
  const user = await q1<MobileAccountRow>(
    `SELECT id, email, name, locale, theme, avatar_url, tier, hour_balance, sub_expires_at, trial_ends_at
       FROM users
      WHERE id=$1`,
    [session.userId]
  );
  if (!user) return null;

  const subActive = user.sub_expires_at ? new Date(user.sub_expires_at).getTime() > Date.now() : false;
  const hasProfile = await userHasProfile(session.userId);
  const access = await getProductAccess(session.userId);

  return {
    ok: true,
    has_profile: hasProfile,
    session,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale || "th",
      theme: user.theme || "light",
      avatar_url: user.avatar_url,
      tier: user.tier || "free",
      hour_balance: user.hour_balance ?? 0,
      sub_expires_at: user.sub_expires_at,
      sub_active: subActive,
      trial_ends_at: user.trial_ends_at,
      in_trial: !!access?.in_trial,
      plan: access?.plan || "free",
      caps: access ? productAccessToCaps(access) : null,
      product: { free_signup_yam: FREE_SIGNUP_YAM, trial_days: TRIAL_DAYS },
    },
  };
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const payload = await loadAccountPayload(session);
  if (!payload) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });

  return NextResponse.json(
    payload,
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function PUT(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "กรุณากรอกชื่อบัญชี" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ ok: false, error: "ชื่อบัญชียาวเกินไป" }, { status: 400 });
  }

  const updated = await q1<{ id: string }>(
    `UPDATE users
        SET name=$2, last_active_at=now()
      WHERE id=$1
      RETURNING id`,
    [session.userId, name]
  );
  if (!updated) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });

  const payload = await loadAccountPayload(session);
  if (!payload) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });

  return NextResponse.json(
    payload,
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
