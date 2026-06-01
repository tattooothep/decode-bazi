import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { verifyPassword, signSession, setAuthCookie } from "@/lib/auth";
import { userHasProfile } from "@/lib/profile-status";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "กรอกอีเมลและรหัสผ่าน" }, { status: 400 });
  }
  /* 1 มิ.ย. · กัน brute-force เดารหัส · 5 ครั้ง/นาที ต่อ (IP + อีเมล) */
  const rl = rateLimit(`login:${clientIp(req)}:${String(email).toLowerCase()}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "ลองเข้าสู่ระบบบ่อยเกินไป · กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }
  const user = await q1<{
    id: string;
    email: string;
    password_hash: string;
    current_org_id: string;
  }>(
    "SELECT id, email, password_hash, current_org_id FROM users WHERE email=$1",
    [email]
  );
  if (!user || !user.password_hash) {
    return NextResponse.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  const token = await signSession({
    userId: user.id,
    email: user.email,
    orgId: user.current_org_id,
  });
  await setAuthCookie(token);
  await q1("UPDATE users SET last_active_at=now() WHERE id=$1", [user.id]);
  const has_profile = await userHasProfile(user.id);
  return NextResponse.json({
    ok: true,
    has_profile,
    intro_url: "/master?intro=1&next=%2Ftoday",
    user: { id: user.id, email: user.email },
  });
}
