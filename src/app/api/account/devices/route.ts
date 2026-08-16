/**
 * /api/account/devices · Account Phase 1 (r378 · 3 ก.ค. 2026)
 * GET    → รายการอุปกรณ์ (จาก user_devices best-effort log) · ?device=<deviceId> ไว้ mark เครื่องปัจจุบัน
 * DELETE → ลบรายการอุปกรณ์ ?id=<uuid>; ถ้าจับคู่ installation ได้จะปิด push/ลบตำแหน่ง
 *          (การเพิกถอน JWT ทุกเครื่องยังใช้ sign_out_others)
 * POST   → revoke session เก่าทุกเครื่องด้วย session_version แล้วออก token ใหม่ให้เครื่องปัจจุบัน
 */
import { NextResponse } from "next/server";
import { pool, q } from "@/lib/db";
import { getAccountUser, deviceHash } from "@/lib/account-utils";
import { setAuthCookie, signSession } from "@/lib/auth";
import { mobileBearerToken } from "@/lib/mobile-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const acc = await getAccountUser(req);
  if (!acc) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const url = new URL(req.url);
  const deviceId = String(url.searchParams.get("device") || "").slice(0, 64);
  const ua = (req.headers.get("user-agent") || "").slice(0, 400);
  const currentHash = deviceId ? deviceHash(deviceId, ua) : "";

  const rows = await q<{ id: string; device_hash: string; ua: string | null; ip_hash: string | null; first_seen: string; last_seen: string }>(
    `SELECT id, device_hash, ua, ip_hash, first_seen, last_seen
       FROM user_devices WHERE user_id=$1
      ORDER BY last_seen DESC LIMIT 50`,
    [acc.u.id]
  );
  return NextResponse.json(
    {
      devices: rows.map((r) => ({
        id: r.id,
        ua: r.ua,
        ip_hash: r.ip_hash,
        first_seen: r.first_seen,
        last_seen: r.last_seen,
        current: !!currentHash && r.device_hash === currentHash,
      })),
      note: "บันทึกแบบ best-effort จากการเปิดใช้งาน · ถ้าจับคู่กับ installation ของแอพได้ การลบจะปิด push และลบตำแหน่งจื่อไป๋ของ installation นั้น แต่ JWT อื่นยังใช้ sign-out-others เพื่อเพิกถอน",
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function DELETE(req: Request) {
  const acc = await getAccountUser(req);
  if (!acc) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const url = new URL(req.url);
  const id = String(url.searchParams.get("id") || "");
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||$1::text,0))`, [acc.u.id]);
    const matched = await client.query<{ id: string; device_hash: string; ua: string | null }>(
      `SELECT id,device_hash,ua FROM user_devices
        WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [id, acc.u.id],
    );
    const row = matched.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const candidates = await client.query<{ installation_id: string }>(
      `SELECT DISTINCT installation_id::text FROM mobile_push_tokens
        WHERE user_id=$1 ORDER BY installation_id::text`,
      [acc.u.id],
    );
    const installationId = candidates.rows.find(
      (candidate) => deviceHash(candidate.installation_id, row.ua || "") === row.device_hash,
    )?.installation_id || null;
    if (installationId) {
      await client.query(
        `UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now()
          WHERE user_id=$1 AND installation_id=$2::uuid AND enabled=true`,
        [acc.u.id, installationId],
      );
      await client.query(
        `DELETE FROM mobile_zibai_installations WHERE user_id=$1 AND installation_id=$2::uuid`,
        [acc.u.id, installationId],
      );
    }
    await client.query(`DELETE FROM user_devices WHERE id=$1 AND user_id=$2`, [id, acc.u.id]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, revoked_notification_installation: installationId !== null });
  } catch {
    await client.query("ROLLBACK").catch(() => null);
    return NextResponse.json({ ok: false, error: "device_remove_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req:Request) {
  const acc=await getAccountUser(req);
  if(!acc) return NextResponse.json({error:"not logged in"},{status:401});
  const body=await req.json().catch(()=>({}));
  if(body.action!=="sign_out_others") return NextResponse.json({error:"unknown action"},{status:400});
  const installationId=String(body.installation_id||"").trim();
  if(installationId&&!UUID_RE.test(installationId)) return NextResponse.json({error:"invalid installation"},{status:400});
  const client=await pool.connect();
  let sv=0;
  let signingUser: { email: string; current_org_id: string | null } | undefined;
  let token="";
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||$1::text,0))`,[acc.u.id]);
    const locked=await client.query<{email:string;current_org_id:string|null}>(`SELECT email,current_org_id FROM users
      WHERE id=$1 AND deleted_at IS NULL AND is_active IS DISTINCT FROM false FOR UPDATE`,[acc.u.id]);
    signingUser=locked.rows[0];
    if(!signingUser){await client.query("ROLLBACK");return NextResponse.json({ok:false,error:"account_not_available"},{status:409});}
    const bumped=await client.query<{session_version:number}>(`UPDATE users SET session_version=COALESCE(session_version,0)+1 WHERE id=$1 RETURNING session_version`,[acc.u.id]);
    sv=Number(bumped.rows[0]?.session_version||0);
    await client.query(`UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now()
      WHERE user_id=$1 AND enabled=true AND ($2::uuid IS NULL OR installation_id<>$2::uuid)`,[acc.u.id,installationId||null]);
    await client.query(`DELETE FROM mobile_zibai_installations
      WHERE user_id=$1 AND ($2::uuid IS NULL OR installation_id<>$2::uuid)`,[acc.u.id,installationId||null]);
    token=await signSession({userId:acc.u.id,email:signingUser.email,orgId:signingUser.current_org_id,sv});
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(()=>null);
    return NextResponse.json({ok:false,error:"session_revocation_failed"},{status:500});
  } finally { client.release(); }
  if(!signingUser||!token) return NextResponse.json({ok:false,error:"account_not_available"},{status:409});
  await setAuthCookie(token);
  return NextResponse.json({ok:true,revoked_other_sessions:true,...(mobileBearerToken(req)?{access_token:token,token_type:"Bearer"}:{})});
}
