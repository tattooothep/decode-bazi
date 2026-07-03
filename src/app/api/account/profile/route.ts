/**
 * /api/account/profile · Account Phase 1 (r378 · 3 ก.ค. 2026)
 * GET   → ข้อมูลบัญชีสำหรับหน้า /account (มีรหัสผ่านไหม · ผูก Google/LINE ไหม)
 * PATCH → เปลี่ยนชื่อที่แสดง { displayName } (ใช้คอลัมน์ users.name ที่มีอยู่แล้ว)
 */
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getAccountUser } from "@/lib/account-utils";

export async function GET() {
  const acc = await getAccountUser();
  if (!acc) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { u } = acc;
  return NextResponse.json(
    {
      id: u.id,
      email: u.email,
      displayName: u.name,
      avatar_url: u.avatar_url,
      has_password: !!u.password_hash,
      google_linked: !!u.google_user_id,
      line_linked: !!u.line_user_id,
      tier: u.tier || "free",
      created_at: u.created_at,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function PATCH(req: Request) {
  const acc = await getAccountUser();
  if (!acc) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const displayName = String(body.displayName ?? "").trim();
  if (!displayName) {
    return NextResponse.json({ error: "กรุณากรอกชื่อที่แสดง" }, { status: 400 });
  }
  if (displayName.length > 80) {
    return NextResponse.json({ error: "ชื่อยาวเกินไป (สูงสุด 80 ตัวอักษร)" }, { status: 400 });
  }
  const row = await q1<{ id: string; name: string }>(
    `UPDATE users SET name=$2, last_active_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id, name`,
    [acc.u.id, displayName]
  );
  if (!row) return NextResponse.json({ error: "user not found" }, { status: 404 });
  return NextResponse.json({ ok: true, displayName: row.name });
}
