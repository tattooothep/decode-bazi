import { NextResponse } from "next/server";
import { clearAuthCookie, setAuthCookie, signSession, verifyPassword } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { userHasProfile } from "@/lib/profile-status";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type MobileUserRow = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  current_org_id: string | null;
  tier: string | null;
  hour_balance: number | null;
};

async function loadMobileUser(userId: string): Promise<MobileUserRow | null> {
  return q1<MobileUserRow>(
    `SELECT id, email, name, avatar_url, current_org_id, tier, hour_balance
       FROM users
      WHERE id=$1`,
    [userId]
  );
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json(
      { ok: true, authenticated: false, user: null, session: null },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const user = await loadMobileUser(session.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
  }

  const hasProfile = await userHasProfile(session.userId);
  return NextResponse.json(
    {
      ok: true,
      authenticated: true,
      has_profile: hasProfile,
      session,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        tier: user.tier || "free",
        hour_balance: user.hour_balance ?? 0,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "กรอกอีเมลและรหัสผ่าน" }, { status: 400 });
  }

  const rl = rateLimit(`mobile-login:${clientIp(req)}:${email}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "ลองเข้าสู่ระบบบ่อยเกินไป · กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const user = await q1<MobileUserRow & { password_hash: string | null }>(
    `SELECT id, email, password_hash, name, avatar_url, current_org_id, tier, hour_balance
       FROM users
      WHERE lower(email)=lower($1)`,
    [email]
  );
  if (!user?.password_hash) {
    return NextResponse.json({ ok: false, error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  const token = await signSession({
    userId: user.id,
    email: user.email,
    orgId: user.current_org_id,
  });

  await setAuthCookie(token);
  await q1("UPDATE users SET last_active_at=now() WHERE id=$1 RETURNING id", [user.id]);

  const hasProfile = await userHasProfile(user.id);
  return NextResponse.json(
    {
      ok: true,
      token_type: "Bearer",
      access_token: token,
      has_profile: hasProfile,
      intro_url: "/master?intro=1&next=%2Ftoday",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        tier: user.tier || "free",
        hour_balance: user.hour_balance ?? 0,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function DELETE() {
  await clearAuthCookie();
  return NextResponse.json(
    { ok: true, revoked_server_session: false, client_action: "discard_bearer_token" },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
