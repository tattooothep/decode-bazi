/**
 * GET /api/payment/status?orderId=... · poll สถานะ order (client รอ PromptPay จ่ายเสร็จ)
 * r408 · 5 ก.ค. 2026
 *
 * ความปลอดภัย:
 *  - auth + ตรวจ order เป็นของ user นี้เท่านั้น (กัน IDOR)
 *  - ถ้ายัง pending และมี gateway key จริง → re-verify สด (server-side confirm) แล้ว fulfill
 *    (ทำให้ poll จบได้แม้ webhook มาช้า · ยังคง idempotent)
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { retrieveStripeSession, stripeReady } from "@/lib/payment/stripe";
import { verifyOmiseCharge, omiseReady } from "@/lib/payment/omise";
import { fulfillOrder } from "@/lib/payment/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId") || "";
  if (!orderId) return NextResponse.json({ error: "no_order_id" }, { status: 400 });

  let order = await q1<{
    id: string;
    user_id: string;
    status: string;
    package_code: string;
    amount_thb: number;
    yam_granted: number;
    pay_ref: string | null;
    pay_method: string | null;
  }>(
    `SELECT id, user_id, status, package_code, amount_thb, yam_granted, pay_ref, pay_method
       FROM orders WHERE id=$1`,
    [orderId]
  );
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (order.user_id !== s.userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // pending → พยายาม re-verify สดกับ gateway (ถ้ามี key จริง)
  if (order.status === "pending" && order.pay_ref) {
    const isStripe = (order.pay_method || "").startsWith("stripe") && stripeReady() && order.pay_ref.startsWith("cs_");
    const isOmise = (order.pay_method || "").startsWith("omise") && omiseReady() && order.pay_ref.startsWith("chrg");
    if (isStripe) {
      const live = await retrieveStripeSession(order.pay_ref);
      if (live?.payment_status === "paid") {
        await fulfillOrder(orderId, `stripe:${live.payment_intent || order.pay_ref}`, "stripe", live.amount_total ? Math.round(live.amount_total / 100) : order.amount_thb);
      }
    } else if (isOmise) {
      const v = await verifyOmiseCharge(order.pay_ref);
      if (v?.paid) {
        await fulfillOrder(orderId, `omise:${order.pay_ref}`, "promptpay", v.amountThb);
      }
    }
    // reload หลัง fulfill
    order = await q1(
      `SELECT id, user_id, status, package_code, amount_thb, yam_granted, pay_ref, pay_method
         FROM orders WHERE id=$1`,
      [orderId]
    ) as typeof order;
  }

  // ถ้า paid → คืนยอด/สถานะสมาชิกล่าสุด
  let balance_after: number | null = null;
  let tier: string | null = null;
  let sub_expires_at: string | null = null;
  if (order && order.status === "paid") {
    const u = await q1<{ hour_balance: number; tier: string; sub_expires_at: string | null }>(
      `SELECT hour_balance, tier, sub_expires_at FROM users WHERE id=$1`,
      [s.userId]
    );
    balance_after = u?.hour_balance ?? null;
    tier = u?.tier ?? null;
    sub_expires_at = u?.sub_expires_at ?? null;
  }

  return NextResponse.json({
    orderId,
    status: order?.status || "unknown",
    package_code: order?.package_code,
    amount_thb: order?.amount_thb,
    yam_granted: order?.yam_granted,
    balance_after,
    tier,
    sub_expires_at,
  });
}
