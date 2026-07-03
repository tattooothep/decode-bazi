/**
 * /api/account/devices · Account Phase 1 (r378 · 3 ก.ค. 2026)
 * GET    → รายการอุปกรณ์ (จาก user_devices best-effort log) · ?device=<deviceId> ไว้ mark เครื่องปัจจุบัน
 * DELETE → ลบรายการอุปกรณ์ ?id=<uuid> (ลบแค่บันทึก — ไม่ revoke JWT ของเครื่องนั้น
 *          เพราะ token stateless + verifySession อยู่ใน src/lib/auth.ts ที่ LOCKED · แจ้งตรงๆ ใน UI)
 */
import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getAccountUser, deviceHash } from "@/lib/account-utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const acc = await getAccountUser();
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
  const acc = await getAccountUser();
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
