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
 *  6. เพิ่ม session_version ใน transaction เดียวกัน → token เครื่องอื่นใช้ต่อไม่ได้
 * ทุก mutation ใช้ connection/transaction เดียวและ serialize กับ push lifecycle ด้วย user lock
 */
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyPassword, clearAuthCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getAccountUser, clientIpFrom } from "@/lib/account-utils";

const CONFIRM_WORDS = ["ลบบัญชี", "DELETE"];

type DeletionAccount = {
  id: string;
  password_hash: string | null;
};

export async function POST(req: Request) {
  const acc = await getAccountUser();
  if (!acc) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { u } = acc;

  const rl = await rateLimit(`acct-del:${u.id}:${clientIpFrom(req)}`, 5, 3600_000);
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
  const client = await pool.connect();
  let deletedAt: string | undefined;
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||$1::text,0))`,
      [u.id],
    );
    const locked = await client.query<DeletionAccount>(
      `SELECT id,password_hash FROM users
        WHERE id=$1 AND deleted_at IS NULL AND is_active IS DISTINCT FROM false
        FOR UPDATE`,
      [u.id],
    );
    const account = locked.rows[0];
    if (!account) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "account not available" }, { status: 404 });
    }
    if (account.password_hash) {
      if (!password) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "กรุณากรอกรหัสผ่านเพื่อยืนยัน" }, { status: 400 });
      }
      if (!(await verifyPassword(password, account.password_hash))) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
      }
    }

    const updated = await client.query<{ deleted_at: string }>(
      `UPDATE users SET
        deleted_at = now(),
        is_active = false,
        session_version = COALESCE(session_version,0)+1,
        deleted_snapshot = jsonb_build_object(
          'email', email,
          'password_hash', password_hash,
          'google_user_id', google_user_id,
          'line_user_id', line_user_id,
          'phone', phone,
          'phone_verified', phone_verified,
          'avatar_url', avatar_url,
          'deleted_by', 'self',
          'deleted_at', now()
        ),
        email = 'deleted+' || extract(epoch from now())::bigint || '+' || email,
        password_hash = NULL,
        google_user_id = NULL,
        line_user_id = NULL,
        phone = NULL,
        phone_verified = false,
        avatar = NULL,
        avatar_url = NULL,
        last_active_at = now()
      WHERE id=$1 AND deleted_at IS NULL
      RETURNING deleted_at::text`,
    [u.id]
    );
    deletedAt = updated.rows[0]?.deleted_at;
    if (!deletedAt) throw new Error("account_delete_conflict");

    await client.query(
      `UPDATE profiles SET is_archived=true, updated_at=now()
      WHERE (created_by_user_id = $1
         OR org_id IN (SELECT id FROM organizations WHERE owner_user_id = $1))
        AND is_archived = false`,
      [u.id]
    );

    await client.query(
      `SELECT hourkey_r8_revoke_delivery_scope($1::uuid,NULL::uuid)`,
      [u.id]
    );
    await client.query(
      `UPDATE mobile_push_tokens
        SET enabled=false,disabled_at=now(),updated_at=now(),
            astronomy_fact_audience_binding=
              translate(rtrim(encode(gen_random_bytes(24),'base64'),'='),'+/','-_')
      WHERE user_id=$1 AND enabled=true`,
      [u.id]
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => null);
    return NextResponse.json({ error: "account delete failed" }, { status: 500 });
  } finally {
    client.release();
  }

  await clearAuthCookie();

  return NextResponse.json({
    ok: true,
    message: "ลบบัญชีแล้ว (พักไว้ 30 วัน) · หากต้องการกู้คืน ติดต่อทีมงานภายใน 30 วัน",
    recover_before: new Date(Date.now() + 30 * 86400_000).toISOString(),
  });
}
