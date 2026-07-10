// POST /api/auth/resend-otp — ส่ง OTP ใหม่
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { normalizePhone, isValidThaiMobile, createOtp } from "@/lib/phone-otp";
import { sendOtpSms, isSmsReady } from "@/lib/thaibulksms-sms";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(body.phone || "");

  if (!isValidThaiMobile(phone)) {
    return NextResponse.json({ error: "เบอร์โทรไม่ถูกต้อง" }, { status: 400 });
  }
  /* 1 มิ.ย. · กันยิง SMS เปลืองเงิน · 3 ครั้ง/10 นาที ต่อ (IP + เบอร์) */
  const rl = await rateLimit(`otp:${clientIp(req)}:${phone}`, 3, 600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "ขอ OTP บ่อยเกินไป · กรุณารอสักครู่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
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
