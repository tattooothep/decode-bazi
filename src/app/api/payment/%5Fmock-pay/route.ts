/**
 * POST /api/payment/_mock-pay · จำลอง webhook สำเร็จ (dev/sandbox เท่านั้น)
 * r408 · 5 ก.ค. 2026
 *
 * ⚠️ GUARD: ทำงานเฉพาะ PAYMENT_MODE=sandbox — โหมด live ถูกปิดตาย (กันเติมยามฟรีในเงินจริง)
 * ใช้ทดสอบ flow ครบวงจร: create → mock-pay → เติมยาม (idempotent · atomic)
 *
 * รับ: { orderId, amountThb? }  (amountThb ใส่เพื่อทดสอบ amount mismatch)
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { fulfillOrder } from "@/lib/payment/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mockAllowed(): boolean {
  // live = ปิดตาย · sandbox (default) = เปิด · production ต้องตั้ง PAYMENT_MODE=sandbox ชัดเจนเท่านั้น
  const mode = (process.env.PAYMENT_MODE || "sandbox").toLowerCase();
  if (mode === "live") return false;
  return mode === "sandbox";
}

export async function POST(req: Request) {
  if (!mockAllowed()) {
    return NextResponse.json({ error: "mock_pay_disabled", note: "PAYMENT_MODE is not sandbox" }, { status: 403 });
  }
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; amountThb?: number };
  const orderId = String(body.orderId || "");
  if (!orderId) return NextResponse.json({ error: "no_order_id" }, { status: 400 });

  // ตรวจว่า order เป็นของ user นี้ (กัน mock-pay ให้คนอื่น)
  const order = await q1<{ user_id: string; amount_thb: number }>(
    `SELECT user_id, amount_thb FROM orders WHERE id=$1`,
    [orderId]
  );
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (order.user_id !== s.userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // amountThb: default = ยอดจริงของ order (จ่ายตรง) · ระบุเองเพื่อทดสอบ mismatch
  const paidAmount = body.amountThb != null ? Number(body.amountThb) : Number(order.amount_thb);

  const result = await fulfillOrder(orderId, `mock:${Date.now()}`, "mock", paidAmount);
  return NextResponse.json({ ok: result.ok, result });
}
