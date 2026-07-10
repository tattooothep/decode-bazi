// POST /api/auth/reset-password — ตั้งรหัสใหม่ด้วย token
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { consumeToken } from "@/lib/auth-tokens";
import { hashPassword, signSession, setAuthCookie, bumpSessionVersion } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (!token || !password || password.length < 6) {
    return NextResponse.json({ error: "ลิงก์ไม่ครบหรือรหัสผ่านสั้นเกินไป · ต้องมีอย่างน้อย 6 ตัวอักษร" }, { status: 400 });
  }
  const r = await consumeToken(token, "password_reset");
  if (!r) return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 400 });
  const hash = await hashPassword(password);
  await q1(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, r.userId]);
  // ไล่ session เก่าทั้งเครื่อง (มาตรฐานหลังเปลี่ยน credential)
  const sv = await bumpSessionVersion(r.userId);
  // invalidate reset tokens อื่นของ user นี้ที่ยังค้าง
  await q1(
    `UPDATE auth_tokens SET used=true WHERE user_id=$1 AND kind='password_reset' AND used=false`,
    [r.userId]
  ).catch(() => null);
  const u = await q1<{ id: string; email: string; current_org_id: string | null }>(
    `SELECT id, email, current_org_id FROM users WHERE id=$1`,
    [r.userId]
  );
  if (u) {
    const sess = await signSession({ userId: u.id, email: u.email, orgId: u.current_org_id, sv });
    await setAuthCookie(sess);
  }
  return NextResponse.json({ ok: true });
}
