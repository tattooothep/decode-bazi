/**
 * GET /api/admin/whoami — เช็คเบา ๆ ว่า session ปัจจุบันเป็นแอดมินไหม (r497)
 * ใช้โดย hk-pwa.js (ปุ่ม "หลังบ้าน" ในโหมดแอป PWA) — คนทั่วไปได้ 401/403 ปุ่มไม่โชว์
 * additive ล้วน · ไม่แตะ /api/auth/me (LOCKED) · guard แบบเดียวกับ /api/admin/user-stats
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  try {
    const admin = await requireAdmin();
    return NextResponse.json(
      { ok: true, email: admin.email, roles: admin.roles, isSuper: admin.isSuper },
      { headers: NO_STORE }
    );
  } catch (e) {
    if (e instanceof Response) {
      return new NextResponse(JSON.stringify({ ok: false }), {
        status: e.status,
        headers: { "Content-Type": "application/json", ...NO_STORE },
      });
    }
    return NextResponse.json({ ok: false, error: "error" }, { status: 500, headers: NO_STORE });
  }
}
