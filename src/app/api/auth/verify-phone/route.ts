// POST /api/auth/verify-phone — ยืนยัน OTP · set session
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { signSession, setAuthCookie } from "@/lib/auth";
import { normalizePhone, verifyOtp } from "@/lib/phone-otp";
import { userHasProfile } from "@/lib/profile-status";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(body.phone || "");
  const code = String(body.code || "");

  if (!phone || !code) {
    return NextResponse.json({ error: "ระบุเบอร์และรหัส OTP" }, { status: 400 });
  }

  const r = await verifyOtp(phone, code);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  const user = await q1<{ id: string; email: string; current_org_id: string | null }>(
    `SELECT id, email, current_org_id FROM users WHERE phone=$1`,
    [phone]
  );
  if (!user) return NextResponse.json({ error: "ไม่พบบัญชี" }, { status: 404 });

  await q1(
    `UPDATE users SET phone_verified=true, last_active_at=now() WHERE id=$1`,
    [user.id]
  );

  const token = await signSession({
    userId: user.id,
    email: user.email,
    orgId: user.current_org_id,
  });
  await setAuthCookie(token);

  const has_profile = await userHasProfile(user.id);
  return NextResponse.json({ ok: true, has_profile });
}
