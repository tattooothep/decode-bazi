/**
 * POST /api/account/delete · Account Phase 1 (r378 · 3 ก.ค. 2026) · PDPA soft-delete 30 วัน
 * body: { confirm, password? } · confirm ต้องพิมพ์ "ลบบัญชี" หรือ "DELETE" เป๊ะ
 * บัญชีมีรหัสผ่าน → ต้องยืนยันรหัสผ่านถูก (401 ถ้าผิด · rate limit 5/ชม.)
 * บัญชี Google/LINE-only → ใช้คำยืนยันอย่างเดียว
 *
 * สิ่งที่ทำ (ไม่แตะ route login ที่ LOCKED · ใช้กลไกข้อมูลแทน):
 *  1. users.deleted_at=now() + is_active=false
 *  2. เก็บ email/password_hash/google/line/avatar_url เดิมลง deleted_snapshot (admin กู้คืนได้ใน 30 วัน)
 *  3. เปลี่ยน email เป็น "deleted+<epoch>+<เดิม>" + ล้าง password_hash/google_user_id/line_user_id
 *     → login ด้วยอีเมล/รหัสผ่านเดิม = 401 ทันที · Google login = ไม่ match บัญชีเดิม (กลายเป็นสมัครใหม่)
 *  4. archive โปรไฟล์ทั้งหมดที่สร้างเอง + ใน org ตัวเอง
 *  5. เคลียร์ cookie (logout เครื่องนี้)
 * trade-off (JWT stateless · แก้ auth.ts ไม่ได้): token เครื่องอื่นที่ยังไม่หมดอายุจะยังผ่าน getSession
 * ได้จนหมด TTL — endpoint /api/account/* ปิดกั้นด้วย deleted_at แล้ว · ปิดทั้งระบบ = เฟสถัดไป (token_version)
 */
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { verifyPassword, clearAuthCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getAccountUser, clientIpFrom } from "@/lib/account-utils";

const CONFIRM_WORDS = ["ลบบัญชี", "DELETE"];

export async function POST(req: Request) {
  const acc = await getAccountUser();
  if (!acc) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { u } = acc;

  const rl = rateLimit(`acct-del:${u.id}:${clientIpFrom(req)}`, 5, 3600_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "ลองยืนยันบ่อยเกินไป กรุณารอ 1 ชั่วโมง" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const confirm = String(body.confirm ?? "").trim();
  const password = String(body.password ?? "");

  if (!CONFIRM_WORDS.includes(confirm)) {
    return NextResponse.json(
      { error: 'กรุณาพิมพ์คำยืนยัน "ลบบัญชี" หรือ "DELETE" ให้ตรง' },
      { status: 400 }
    );
  }
  if (u.password_hash) {
    if (!password) {
      return NextResponse.json({ error: "กรุณากรอกรหัสผ่านเพื่อยืนยัน" }, { status: 400 });
    }
    const ok = await verifyPassword(password, u.password_hash);
    if (!ok) return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  // 1-3) soft-delete + snapshot + ตัดช่องทาง login เดิม (atomic ใน statement เดียว)
  await q1(
    `UPDATE users SET
        deleted_at = now(),
        is_active = false,
        deleted_snapshot = jsonb_build_object(
          'email', email,
          'password_hash', password_hash,
          'google_user_id', google_user_id,
          'line_user_id', line_user_id,
          'avatar_url', avatar_url,
          'deleted_by', 'self',
          'deleted_at', now()
        ),
        email = 'deleted+' || extract(epoch from now())::bigint || '+' || email,
        password_hash = NULL,
        google_user_id = NULL,
        line_user_id = NULL,
        avatar = NULL,
        avatar_url = NULL,
        last_active_at = now()
      WHERE id=$1 AND deleted_at IS NULL`,
    [u.id]
  );

  // 4) archive โปรไฟล์ (soft · กู้คืนพร้อมบัญชีได้ใน 30 วัน)
  await q1(
    `UPDATE profiles SET is_archived=true, updated_at=now()
      WHERE (created_by_user_id = $1
         OR org_id IN (SELECT id FROM organizations WHERE owner_user_id = $1))
        AND is_archived = false`,
    [u.id]
  );

  // 5) logout เครื่องนี้
  await clearAuthCookie();

  return NextResponse.json({
    ok: true,
    message: "ลบบัญชีแล้ว (พักไว้ 30 วัน) · หากต้องการกู้คืน ติดต่อทีมงานภายใน 30 วัน",
    recover_before: new Date(Date.now() + 30 * 86400_000).toISOString(),
  });
}
