import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { verifyPassword, signSession, setAuthCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "email + password required" }, { status: 400 });
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
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  const token = await signSession({
    userId: user.id,
    email: user.email,
    orgId: user.current_org_id,
  });
  await setAuthCookie(token);
  await q1("UPDATE users SET last_active_at=now() WHERE id=$1", [user.id]);
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
}
