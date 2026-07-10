// POST /api/auth/forgot-password — ส่งลิงก์รีเซ็ตรหัส
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { createToken } from "@/lib/auth-tokens";
import { sendResetEmail, isEmailReady } from "@/lib/email-service";
import { sendSms, isSmsReady } from "@/lib/thaibulksms-sms";
import { normalizePhone, isValidThaiMobile } from "@/lib/phone-otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const APP_URL = process.env.APP_URL || "https://hourkey.io";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const raw = String(body.identifier || body.email || body.phone || "").trim();
  if (!raw) return NextResponse.json({ error: "กรอกอีเมลหรือเบอร์โทร" }, { status: 400 });
  /* 1 มิ.ย. · กันยิง email/SMS รีเซ็ตเปลืองเงิน · 3 ครั้ง/10 นาที ต่อ (IP + identifier) */
  const rl = await rateLimit(`forgot:${clientIp(req)}:${raw.toLowerCase()}`, 3, 600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "ขอรีเซ็ตบ่อยเกินไป · กรุณารอสักครู่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const isEmail = raw.includes("@");
  const email = isEmail ? raw.toLowerCase() : "";
  const phone = isEmail ? "" : normalizePhone(raw);

  if (!isEmail && !isValidThaiMobile(phone)) {
    return NextResponse.json({ error: "กรอกอีเมลหรือเบอร์โทรที่ถูกต้อง" }, { status: 400 });
  }
  if (isEmail && !isEmailReady()) {
    return NextResponse.json({ error: "ระบบส่งอีเมลยังไม่พร้อม" }, { status: 503 });
  }
  if (!isEmail && !isSmsReady()) {
    return NextResponse.json({ error: "ระบบส่งข้อความยังไม่พร้อม" }, { status: 503 });
  }

  // กันเลี่ยงไม่บอกว่า email มีอยู่หรือไม่ — return ok เสมอ
  const user = isEmail
    ? await q1<{ id: string; name: string | null }>(
        `SELECT id, name FROM users WHERE email=$1`,
        [email]
      )
    : await q1<{ id: string; name: string | null }>(
        `SELECT id, name FROM users WHERE phone=$1`,
        [phone]
      );
  if (!user) return NextResponse.json({ ok: true });

  const token = await createToken(user.id, "password_reset", 60);
  const link = `${APP_URL}/reset-password/${token}`;
  try {
    if (isEmail) {
      const r = await sendResetEmail({ to: email, name: user.name || undefined, link });
      if (r.error) throw new Error(r.error.message || "send failed");
    } else {
      const r = await sendSms({
        to: phone,
        message: `รีเซ็ตรหัส hourkey: ${link} ใช้ได้ 1 ชม.`,
      });
      if (!r.ok) throw new Error(r.error || "send failed");
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
