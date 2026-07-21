// POST /api/auth/send-email-verify — ส่งอีเมลยืนยัน
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { createToken } from "@/lib/auth-tokens";
import { sendVerifyEmail, isEmailReady } from "@/lib/email-service";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const APP_URL = process.env.APP_URL || "https://hourkey.io";

export async function POST(req: Request) {
  if (!isEmailReady()) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
  }
  /* 1 มิ.ย. · กันยิงอีเมลยืนยันเปลืองเงิน · 3 ครั้ง/10 นาที ต่อ IP */
  const rl = await rateLimit(`emailverify:${clientIp(req)}`, 3, 600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "ขอบ่อยเกินไป · กรุณารอสักครู่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }
  // รับ email จาก session หรือ body
  let email: string | null = null;
  let userId: string | null = null;
  let name: string | null = null;

  const s = await getSession();
  if (s) {
    userId = s.userId;
    email = s.email;
    const u = await q1<{ name: string | null; email_verified: boolean }>(
      `SELECT name, email_verified FROM users WHERE id=$1`,
      [userId]
    );
    if (u && u.email_verified) {
      return NextResponse.json({ ok: true, already_verified: true });
    }
    name = u?.name || null;
  } else {
    const body = await req.json().catch(() => ({}));
    email = String(body.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
    const u = await q1<{ id: string; name: string | null; email_verified: boolean }>(
      `SELECT id, name, email_verified FROM users WHERE email=$1`,
      [email]
    );
    if (!u) return NextResponse.json({ ok: true });
    if (u.email_verified) return NextResponse.json({ ok: true, already_verified: true });
    userId = u.id;
    name = u.name;
  }

  if (!userId || !email) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const token = await createToken(userId, "email_verify", 24 * 60);
  const link = `${APP_URL}/verify-email/${token}`;
  try {
    await sendVerifyEmail({ to: email, name: name || undefined, link });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "send failed" }, { status: 500 });
  }
}
