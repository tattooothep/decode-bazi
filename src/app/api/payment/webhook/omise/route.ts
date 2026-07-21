/**
 * POST /api/payment/webhook/omise · รับ event จาก Omise → re-fetch charge ยืนยัน → เติมยาม
 * r408 · 5 ก.ค. 2026
 *
 * ความปลอดภัย:
 *  - Omise ไม่มีลายเซ็น HMAC มาตรฐาน → ยืนยันด้วยการ re-fetch charge จาก API (server-side confirm)
 *    ห้ามเชื่อ payload จำนวนเงิน/สถานะตรง ๆ
 *  - option: ตั้ง OMISE_WEBHOOK_SECRET เป็น shared token ใน query (?t=) เพิ่มชั้นกัน spam
 *  - เติมยามผ่าน fulfillOrder (ตรวจยอดตรง + idempotent + atomic)
 *  - ยังไม่มี OMISE key → ตอบ 200 note pending (verify ไม่ได้ = ไม่เติม)
 */
import { NextResponse } from "next/server";
import { verifyOmiseCharge, omiseReady } from "@/lib/payment/omise";
import { clawbackYamForOrder, fulfillOrder } from "@/lib/payment/credit";
import { reverseAffiliateRewardsForPaymentRefs } from "@/lib/affiliate";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // optional shared-secret guard
  const wantSecret = process.env.OMISE_WEBHOOK_SECRET || "";
  if (wantSecret) {
    const url = new URL(req.url);
    const got = url.searchParams.get("t") || req.headers.get("x-webhook-token") || "";
    if (got !== wantSecret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    key?: string;
    data?: { id?: string; object?: string; charge?: string; charge_id?: string; metadata?: { order_id?: string } };
  };

  // สนใจเฉพาะ event ที่เกี่ยวกับ charge
  const chargeId = body.data?.id || "";
  if (!chargeId) return NextResponse.json({ received: true, note: "no charge id" });
  const eventKey = String(body.key || "");
  if (/refund|reversed|charge\\.reverse|dispute/i.test(eventKey)) {
    const ref = body.data?.charge || body.data?.charge_id || chargeId;
    const refs = [ref, `omise:${ref}`, `promptpay:${ref}`].filter(Boolean);
    const orders = await q<{ id: string }>(
      `SELECT id FROM orders WHERE pay_ref = ANY($1::varchar[])`,
      [refs]
    ).catch(() => [] as { id: string }[]);
    const clawbacks = [];
    for (const o of orders) {
      clawbacks.push(await clawbackYamForOrder(o.id, `omise:${eventKey || "refund"}`));
    }
    const reversal = await reverseAffiliateRewardsForPaymentRefs(refs, `omise:${eventKey || "refund"}`);
    return NextResponse.json({ received: true, reversal, clawbacks, key: eventKey });
  }

  if (!omiseReady()) {
    // ยังไม่มี key = ยืนยันไม่ได้ → ไม่เติม (fail-closed)
    return NextResponse.json({ received: true, note: "omise not configured — cannot verify, skipped" });
  }

  // re-fetch charge (server-side confirm)
  const verified = await verifyOmiseCharge(chargeId);
  if (!verified) return NextResponse.json({ received: true, note: "verify failed" });
  if (!verified.paid) return NextResponse.json({ received: true, note: "not paid", chargeId });

  const orderId = verified.orderId || body.data?.metadata?.order_id || "";
  if (!orderId) return NextResponse.json({ error: "no_order_id" }, { status: 400 });

  const result = await fulfillOrder(orderId, `omise:${chargeId}`, "promptpay", verified.amountThb);
  return NextResponse.json({ received: true, result });
}
