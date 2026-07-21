/**
 * POST /api/payment/webhook/stripe · รับ event จาก Stripe → ยืนยัน → เติมยาม (atomic·idempotent)
 * r408 · 5 ก.ค. 2026
 *
 * ความปลอดภัย:
 *  - verify ลายเซ็นด้วย STRIPE_WEBHOOK_SECRET (constructStripeEvent) ก่อนเชื่อทุกอย่าง
 *  - เติมยามผ่าน fulfillOrder (ตรวจยอดตรง + idempotent + atomic)
 *  - ยิงซ้ำ = เติมครั้งเดียว
 */
import { NextResponse } from "next/server";
import { constructStripeEvent, retrieveStripeSession } from "@/lib/payment/stripe";
import { clawbackYamForOrder, fulfillOrder } from "@/lib/payment/credit";
import { q } from "@/lib/db";
import { enqueueNotification } from "@/lib/notification-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text(); // ต้องเป็น raw body (ห้าม parse ก่อน verify)
  const sig = req.headers.get("stripe-signature");

  const event = constructStripeEvent(raw, sig);
  if (!event) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const type = String(event.type || "");
  // refund / dispute → clawback yam (platform) · affiliate reverse optional if module present
  if (type === "charge.refunded" || type === "charge.dispute.created" || type === "refund.created") {
    const dataObj = (event.data as { object?: Record<string, unknown> } | undefined)?.object || {};
    const paymentIntent = String(dataObj.payment_intent || "");
    const charge = String(dataObj.charge || dataObj.id || "");
    const refs = [paymentIntent, charge, paymentIntent && `stripe:${paymentIntent}`, charge && `stripe:${charge}`].filter(Boolean) as string[];
    const orders = await q<{ id: string }>(
      `SELECT id FROM orders WHERE pay_ref = ANY($1::varchar[])`,
      [refs]
    ).catch(() => [] as { id: string }[]);
    const clawbacks = [];
    for (const o of orders) clawbacks.push(await clawbackYamForOrder(o.id, `stripe:${type}`));
    let affiliate_reversed = 0;
    try {
      const mod = await import("@/lib/affiliate").catch(() => null as any);
      if (mod?.reverseAffiliateRewardsForPaymentRefs) {
        const r = await mod.reverseAffiliateRewardsForPaymentRefs(refs, `stripe:${type}`);
        affiliate_reversed = Number(r?.reversed || 0);
      }
    } catch { /* affiliate module optional on this release */ }
    return NextResponse.json({ received: true, type, clawbacks, affiliate_reversed });
  }
  // สนใจเฉพาะเหตุการณ์ "จ่ายสำเร็จ"
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true, ignored: type });
  }

  const dataObj = (event.data as { object?: Record<string, unknown> } | undefined)?.object || {};
  const session = dataObj as {
    id?: string;
    payment_status?: string;
    amount_total?: number;
    payment_intent?: string;
    metadata?: Record<string, string>;
  };

  const paymentPaid = session.payment_status === "paid";
  if (!paymentPaid) {
    return NextResponse.json({ received: true, note: "not paid yet", status: session.payment_status });
  }

  // orderId + ยอด: ใช้จาก event · แต่ re-verify กับ Stripe API เพื่อกัน event ปลอม/แก้ยอด
  let orderId = session.metadata?.order_id || "";
  let amountThb = session.amount_total ? Math.round(session.amount_total / 100) : 0;
  let payRef = session.payment_intent || session.id || "";

  if (session.id) {
    const live = await retrieveStripeSession(session.id);
    if (live) {
      if (live.payment_status !== "paid") {
        return NextResponse.json({ received: true, note: "live not paid", status: live.payment_status });
      }
      orderId = live.metadata?.order_id || orderId;
      if (live.amount_total) amountThb = Math.round(live.amount_total / 100);
      payRef = live.payment_intent || payRef;
    }
  }

  if (!orderId) return NextResponse.json({ error: "no_order_id" }, { status: 400 });

  const result = await fulfillOrder(orderId, `stripe:${payRef}`, "stripe", amountThb);
  if (!result.ok) {
    await enqueueNotification({
      eventType: "payment_exception", severity: "critical", audienceKind: "admin",
      audienceRoles: ["finance", "superadmin"], requiredPermission: "admin.finance.read",
      dedupeKey: `payment-exception:stripe:${orderId}:${result.status}`,
      targetUrl: `/admin/orders?id=${encodeURIComponent(orderId)}`,
      payload: { order_id: orderId, gateway: "stripe", failure: result.status },
    }).catch((e) => console.warn("[notify] stripe payment exception", e instanceof Error ? e.message : String(e)));
    // Stripe retries non-2xx. Never acknowledge a paid event that was not credited.
    return NextResponse.json({ error: "fulfillment_failed", result }, { status: 500 });
  }
  return NextResponse.json({ received: true, result });
}
