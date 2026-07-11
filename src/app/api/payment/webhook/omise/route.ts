/**
 * POST /api/payment/webhook/omise · รับ event จาก Omise → re-fetch charge ยืนยัน → เติมยาม
 * r408 · 5 ก.ค. 2026
 *
 * ความปลอดภัย:
 *  - Omise ไม่มีลายเซ็น HMAC มาตรฐาน → ยืนยันด้วยการ re-fetch charge จาก API (server-side confirm)
 *    ห้ามเชื่อ payload จำนวนเงิน/สถานะตรง ๆ
 *  - บังคับ OMISE_WEBHOOK_SECRET เป็น shared token ใน query (?t=) หรือ header
 *  - เติมยามผ่าน fulfillOrder (ตรวจยอดตรง + idempotent + atomic)
 *  - ถ้า secret หรือ Omise key ไม่ครบ → fail closed ด้วย 503
 */
import { NextResponse } from "next/server";
import { verifyOmiseCharge, omiseReady } from "@/lib/payment/omise";
import { clawbackYamForOrder, fulfillOrder } from "@/lib/payment/credit";
import { q } from "@/lib/db";
import { timingSafeEqual } from "crypto";
import { enqueueNotification } from "@/lib/notification-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Omise has no standard HMAC signature. The shared token and server-side API
  // verification are both mandatory; a missing configuration must fail closed.
  const wantSecret = process.env.OMISE_WEBHOOK_SECRET || "";
  if (!wantSecret || !omiseReady()) {
    return NextResponse.json({ error: "omise_webhook_not_configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  const got = url.searchParams.get("t") || req.headers.get("x-webhook-token") || "";
  const gotBuf = Buffer.from(got);
  const wantBuf = Buffer.from(wantSecret);
  if (gotBuf.length !== wantBuf.length || !timingSafeEqual(gotBuf, wantBuf)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    key?: string;
    data?: { id?: string; object?: string; metadata?: { order_id?: string } };
  };

  // สนใจเฉพาะ event ที่เกี่ยวกับ charge
  const chargeId = body.data?.id || "";
  if (!chargeId) return NextResponse.json({ received: true, note: "no charge id" });
  const eventKey = String(body.key || "");
  if (/refund|reversed|charge\.reverse|dispute/i.test(eventKey)) {
    const refs = [chargeId, `omise:${chargeId}`, `promptpay:${chargeId}`];
    const orders = await q<{ id: string }>(
      `SELECT id FROM orders WHERE pay_ref = ANY($1::varchar[])`,
      [refs]
    ).catch(() => [] as { id: string }[]);
    const clawbacks = [];
    for (const o of orders) clawbacks.push(await clawbackYamForOrder(o.id, `omise:${eventKey || "refund"}`));
    let affiliate_reversed = 0;
    try {
      const mod = await import("@/lib/affiliate").catch(() => null as any);
      if (mod?.reverseAffiliateRewardsForPaymentRefs) {
        const r = await mod.reverseAffiliateRewardsForPaymentRefs(refs, `omise:${eventKey || "refund"}`);
        affiliate_reversed = Number(r?.reversed || 0);
      }
    } catch { /* optional */ }
    return NextResponse.json({ received: true, clawbacks, affiliate_reversed, key: eventKey });
  }

  // re-fetch charge (server-side confirm)
  const verified = await verifyOmiseCharge(chargeId);
  if (!verified) return NextResponse.json({ received: true, note: "verify failed" });
  if (!verified.paid) return NextResponse.json({ received: true, note: "not paid", chargeId });

  const orderId = verified.orderId || body.data?.metadata?.order_id || "";
  if (!orderId) return NextResponse.json({ error: "no_order_id" }, { status: 400 });

  const result = await fulfillOrder(orderId, `omise:${chargeId}`, "promptpay", verified.amountThb);
  if (!result.ok) {
    await enqueueNotification({
      eventType: "payment_exception", severity: "critical", audienceKind: "admin",
      audienceRoles: ["finance", "superadmin"], requiredPermission: "admin.finance.read",
      dedupeKey: `payment-exception:omise:${orderId}:${result.status}`,
      targetUrl: `/admin/orders?id=${encodeURIComponent(orderId)}`,
      payload: { order_id: orderId, gateway: "omise", failure: result.status },
    }).catch((e) => console.warn("[notify] omise payment exception", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ error: "fulfillment_failed", result }, { status: 500 });
  }
  return NextResponse.json({ received: true, result });
}
