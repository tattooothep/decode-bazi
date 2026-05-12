// POST /api/auth/resend-otp — ส่ง OTP ใหม่
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { normalizePhone, isValidThaiMobile, createOtp } from "@/lib/phone-otp";
import { sendOtpSms, isSmsReady } from "@/lib/thaibulksms-sms";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(body.phone || "");

  if (!isValidThaiMobile(phone)) {
    return NextResponse.json({ error: "เบอร์โทรไม่ถูกต้อง" }, { status: 400 });
  }
  // เช็คว่ามี user
  const user = await q1<{ id: string }>(`SELECT id FROM users WHERE phone=$1`, [phone]);
  if (!user) {
    return NextResponse.json({ ok: true }); // กัน enumerate
  }

  const code = await createOtp(phone);
  if (!isSmsReady()) {
    return NextResponse.json({ ok: true, dev_otp: code });
  }
  const r = await sendOtpSms(phone, code);
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
