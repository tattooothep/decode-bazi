/**
 * POST /api/account/password · Account Phase 1 (r378 · 3 ก.ค. 2026)
 * เปลี่ยนรหัสผ่าน { current, next } · bcrypt เทียบ hash เดิม (lib เดียวกับ signup/login)
 * บัญชี Google/LINE-only (ไม่มี password_hash) = "ตั้งรหัสผ่าน" ครั้งแรก ไม่ต้องส่ง current
 * rate limit 5 ครั้ง/ชม. ต่อ (user+IP) · กัน brute-force รหัสเดิม
 */
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getAccountUser, clientIpFrom } from "@/lib/account-utils";

export async function POST(req: Request) {
  const acc = await getAccountUser();
  if (!acc) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const rl = rateLimit(`acct-pw:${acc.u.id}:${clientIpFrom(req)}`, 5, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "ลองเปลี่ยนรหัสผ่านบ่อยเกินไป กรุณารอ 1 ชั่วโมง" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const current = String(body.current ?? "");
  const next = String(body.next ?? "");

  if (next.length < 8) {
    return NextResponse.json({ error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร" }, { status: 400 });
  }
  if (next.length > 72) {
    return NextResponse.json({ error: "รหัสผ่านใหม่ยาวเกินไป (สูงสุด 72 ตัวอักษร)" }, { status: 400 });
  }

  const hasPassword = !!acc.u.password_hash;
  if (hasPassword) {
    if (!current) {
      return NextResponse.json({ error: "กรุณากรอกรหัสผ่านปัจจุบัน" }, { status: 400 });
    }
    const ok = await verifyPassword(current, acc.u.password_hash as string);
    if (!ok) {
      return NextResponse.json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }, { status: 401 });
    }
    if (current === next) {
      return NextResponse.json({ error: "รหัสผ่านใหม่ต้องต่างจากรหัสเดิม" }, { status: 400 });
    }
  }

  const hash = await hashPassword(next);
  await q1(
    `UPDATE users SET password_hash=$2, last_active_at=now() WHERE id=$1 AND deleted_at IS NULL`,
    [acc.u.id, hash]
  );
  return NextResponse.json({ ok: true, mode: hasPassword ? "changed" : "set" });
}
