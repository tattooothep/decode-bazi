/**
 * /api/account/devices · Account Phase 1 (r378 · 3 ก.ค. 2026)
 * GET    → รายการอุปกรณ์ (จาก user_devices best-effort log) · ?device=<deviceId> ไว้ mark เครื่องปัจจุบัน
 * DELETE → ลบรายการอุปกรณ์ ?id=<uuid> (ลบแค่บันทึก — ไม่ revoke JWT ของเครื่องนั้น
 * POST   → revoke session เก่าทุกเครื่องด้วย session_version แล้วออก token ใหม่ให้เครื่องปัจจุบัน
 */
import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getAccountUser, deviceHash } from "@/lib/account-utils";
import { bumpSessionVersion, setAuthCookie, signSession } from "@/lib/auth";
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
      note: "บันทึกแบบ best-effort จากการเปิดใช้งาน · การลบรายการไม่ตัด session ของเครื่องนั้น",
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
  const row = await q1<{ id: string }>(
    `DELETE FROM user_devices WHERE id=$1 AND user_id=$2 RETURNING id`,
    [id, acc.u.id]
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(req:Request) {
  const acc=await getAccountUser(req);
  if(!acc) return NextResponse.json({error:"not logged in"},{status:401});
  const body=await req.json().catch(()=>({}));
  if(body.action!=="sign_out_others") return NextResponse.json({error:"unknown action"},{status:400});
  const installationId=String(body.installation_id||"").trim();
  if(installationId&&!UUID_RE.test(installationId)) return NextResponse.json({error:"invalid installation"},{status:400});
  const sv=await bumpSessionVersion(acc.u.id);
  const token=await signSession({userId:acc.u.id,email:acc.u.email,orgId:acc.u.current_org_id,sv});
  await setAuthCookie(token);
  await q(`UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now() WHERE user_id=$1 AND enabled=true AND ($2::uuid IS NULL OR installation_id<>$2::uuid)`,[acc.u.id,installationId||null]).catch(()=>null);
  return NextResponse.json({ok:true,revoked_other_sessions:true,...(mobileBearerToken(req)?{access_token:token,token_type:"Bearer"}:{})});
}
