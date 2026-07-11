/**
 * POST /api/admin/notify-test — ยิงแจ้งเตือนทดสอบถึงเครื่องของแอดมินคนที่กดเอง (r497)
 * guard: requireAdmin · ใช้ push-sender เดิม (skipPrefCheck — ปุ่มทดสอบต้องมาถึงเสมอ)
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { sendToUser } from "@/lib/push-sender";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return guard(e);
  }
  const r = await rateLimit("admin-notify-test:" + clientIp(req), 10, 60_000);
  if (!r.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const report = await sendToUser(
    admin.userId,
    {
      title: "ทดสอบแจ้งเตือนหลังบ้าน",
      body: "ถ้าเห็นข้อความนี้ = เครื่องนี้พร้อมรับแจ้งเตือนสมัครใหม่/ชำระเงินแล้ว",
      url: "/admin",
      tag: "test",
    },
    { skipPrefCheck: true }
  );
  return NextResponse.json(
    { ok: true, report },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
