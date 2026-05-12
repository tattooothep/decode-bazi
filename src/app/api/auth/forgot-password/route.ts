// POST /api/auth/forgot-password — ส่งลิงก์รีเซ็ตรหัส
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { createToken } from "@/lib/auth-tokens";
import { sendResetEmailTbs, isEmailTbsReady } from "@/lib/thaibulksms-email";
import { sendSms, isSmsReady } from "@/lib/thaibulksms-sms";
import { normalizePhone, isValidThaiMobile } from "@/lib/phone-otp";

const APP_URL = process.env.APP_URL || "https://hourkey.io";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const raw = String(body.identifier || body.email || body.phone || "").trim();
  if (!raw) return NextResponse.json({ error: "กรอกอีเมลหรือเบอร์โทร" }, { status: 400 });

  const isEmail = raw.includes("@");
  const email = isEmail ? raw.toLowerCase() : "";
  const phone = isEmail ? "" : normalizePhone(raw);

  if (!isEmail && !isValidThaiMobile(phone)) {
    return NextResponse.json({ error: "กรอกอีเมลหรือเบอร์โทรที่ถูกต้อง" }, { status: 400 });
  }
  if (isEmail && !isEmailTbsReady()) {
    return NextResponse.json({ error: "ระบบส่งอีเมลยังไม่พร้อม" }, { status: 503 });
  }
  if (isEmail && !process.env.TBS_TPL_RESET) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าแม่แบบอีเมลรีเซ็ตรหัส" }, { status: 503 });
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
      const r = await sendResetEmailTbs({ to: email, name: user.name || undefined, link });
      if (!r.ok) throw new Error(r.error || "send failed");
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
    if (message === "template UUID not set") {
      return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าแม่แบบอีเมลรีเซ็ตรหัส" }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
