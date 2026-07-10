/**
 * GET /api/admin/user-stats — สถิติผู้ใช้หลังบ้าน (ข้อมูลจริงทั้งหมด · ไม่มี mockup)
 * guard: admin.users.read (แบบเดียวกับ /api/admin/members)
 * SQL รวม 2 query ใน src/lib/admin-user-stats.ts (ใช้ร่วมกับหน้า /admin)
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { loadUserStats } from "@/lib/admin-user-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

export async function GET() {
  try {
    await requirePermission("admin.users.read");
  } catch (e) {
    return guard(e);
  }
  const stats = await loadUserStats();
  return NextResponse.json(
    { ok: true, stats },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
