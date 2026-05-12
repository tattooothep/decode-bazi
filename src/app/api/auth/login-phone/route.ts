// POST /api/auth/login-phone — เข้าสู่ระบบด้วยเบอร์โทร + รหัสผ่าน
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { verifyPassword, signSession, setAuthCookie } from "@/lib/auth";
import { normalizePhone, isValidThaiMobile } from "@/lib/phone-otp";
import { userHasProfile } from "@/lib/profile-status";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(body.phone || "");
  const password = String(body.password || "");

  if (!isValidThaiMobile(phone) || !password) {
    return NextResponse.json({ error: "ระบุเบอร์โทรและรหัสผ่าน" }, { status: 400 });
  }

  const user = await q1<{
    id: string;
    email: string;
    password_hash: string;
    current_org_id: string | null;
    phone_verified: boolean;
  }>(
    `SELECT id, email, password_hash, current_org_id, phone_verified FROM users WHERE phone=$1`,
    [phone]
  );
  if (!user || !user.password_hash) {
    return NextResponse.json({ error: "เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  if (!user.phone_verified) {
    return NextResponse.json({ error: "เบอร์ยังไม่ยืนยัน · กรุณายืนยัน OTP ก่อน", need_verify: true }, { status: 403 });
  }

  const token = await signSession({
    userId: user.id,
    email: user.email,
    orgId: user.current_org_id,
  });
  await setAuthCookie(token);
  await q1(`UPDATE users SET last_active_at=now() WHERE id=$1`, [user.id]);

  const has_profile = await userHasProfile(user.id);
  return NextResponse.json({ ok: true, has_profile });
}
