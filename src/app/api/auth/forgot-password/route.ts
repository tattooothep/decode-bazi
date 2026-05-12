// POST /api/auth/forgot-password — ส่งลิงก์รีเซ็ตรหัส
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { createToken } from "@/lib/auth-tokens";
import { sendResetEmail, isEmailReady } from "@/lib/email-service";

const APP_URL = process.env.APP_URL || "https://hourkey.io";

export async function POST(req: Request) {
  if (!isEmailReady()) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  // กันเลี่ยงไม่บอกว่า email มีอยู่หรือไม่ — return ok เสมอ
  const user = await q1<{ id: string; name: string | null }>(
    `SELECT id, name FROM users WHERE email=$1`,
    [email]
  );
  if (!user) return NextResponse.json({ ok: true });
  const token = await createToken(user.id, "password_reset", 60);
  const link = `${APP_URL}/reset-password/${token}`;
  try {
    await sendResetEmail({ to: email, name: user.name || undefined, link });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "send failed" }, { status: 500 });
  }
}
