import { NextResponse } from "next/server";
import { clearAuthCookie, verifyPassword } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type DeletionAccount = {
  id: string;
  password_hash: string | null;
};

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const rl = await rateLimit(`mobile-account-delete:${session.userId}:${clientIp(req)}`, 5, 3_600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "too_many_attempts" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const confirm = String(body.confirm || "").trim();
  const password = String(body.password || "");
  if (confirm !== "DELETE" && confirm !== "ลบบัญชี") {
    return NextResponse.json({ ok: false, error: "delete_confirmation_invalid" }, { status: 400 });
  }

  const client = await pool.connect();
  let deleted: { deleted_at: string } | undefined;
  try {
    await client.query("BEGIN");
    // Serialize with push registration. No installation may be re-enabled
    // after the user row is marked deleted and its Zi Bai location is erased.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||$1::text,0))`, [session.userId]);
    const locked = await client.query<DeletionAccount>(
      `SELECT id,password_hash FROM users
        WHERE id=$1 AND deleted_at IS NULL AND is_active IS DISTINCT FROM false
        FOR UPDATE`,
      [session.userId],
    );
    const account = locked.rows[0];
    if (!account) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "account_not_available" }, { status: 404 });
    }
    if (account.password_hash) {
      if (!password) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "password_required" }, { status: 400 });
      }
      if (!(await verifyPassword(password, account.password_hash))) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "password_invalid" }, { status: 401 });
      }
    }
    const updated = await client.query<{ deleted_at: string }>(
      `UPDATE users SET
        deleted_at=now(),
        is_active=false,
        session_version=COALESCE(session_version,0)+1,
        deleted_snapshot=jsonb_build_object(
          'email',email,
          'password_hash',password_hash,
          'google_user_id',google_user_id,
          'line_user_id',line_user_id,
          'phone',phone,
          'phone_verified',phone_verified,
          'avatar_url',avatar_url,
          'deleted_by','self_mobile',
          'deleted_at',now()
        ),
        email='deleted+' || extract(epoch from now())::bigint || '+' || email,
        password_hash=NULL,
        google_user_id=NULL,
        line_user_id=NULL,
        phone=NULL,
        phone_verified=false,
        avatar=NULL,
        avatar_url=NULL,
        last_active_at=now()
      WHERE id=$1 AND deleted_at IS NULL
      RETURNING deleted_at::text`,
      [session.userId]
    );
    deleted = updated.rows[0];
    if (!deleted) throw new Error("account_delete_conflict");
    await client.query(
      `UPDATE profiles SET is_archived=true,updated_at=now()
        WHERE (created_by_user_id=$1
           OR org_id IN (SELECT id FROM organizations WHERE owner_user_id=$1))
          AND is_archived=false`,
      [session.userId],
    );
    await client.query(
      `UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now()
        WHERE user_id=$1 AND enabled=true`,
      [session.userId],
    );
    await client.query(`DELETE FROM mobile_zibai_installations WHERE user_id=$1`, [session.userId]);
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => null);
    return NextResponse.json({ ok: false, error: "account_delete_failed" }, { status: 500 });
  } finally {
    client.release();
  }
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "account_not_available" }, { status: 409 });
  }
  await clearAuthCookie();

  return NextResponse.json(
    {
      ok: true,
      deleted_at: deleted.deleted_at,
      recover_before: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      local_action: "purge_all_app_data",
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
