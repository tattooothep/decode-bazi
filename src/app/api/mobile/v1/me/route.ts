import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { userHasProfile } from "@/lib/profile-status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const user = await q1<{
    id: string;
    email: string;
    name: string | null;
    locale: string | null;
    theme: string | null;
    avatar_url: string | null;
    tier: string | null;
    hour_balance: number | null;
    sub_expires_at: string | null;
  }>(
    `SELECT id, email, name, locale, theme, avatar_url, tier, hour_balance, sub_expires_at
       FROM users
      WHERE id=$1`,
    [session.userId]
  );
  if (!user) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });

  const subActive = user.sub_expires_at ? new Date(user.sub_expires_at).getTime() > Date.now() : false;
  const hasProfile = await userHasProfile(session.userId);

  return NextResponse.json(
    {
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
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
