import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { writeAdminAudit } from "@/lib/admin-audit";
import { q, q1 } from "@/lib/db";
import { refundPaidOrder } from "@/lib/payment/credit";
import { clientIp } from "@/lib/rate-limit";
import { enqueueNotification } from "@/lib/notification-outbox";

export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

function decorateOrder<T extends Record<string, any>>(order: T) {
  const status = String(order.status || "pending");
  const subscriptionPackage = /^(premium|master)_/.test(String(order.package_code || ""));
  let link_state = "unpaid";
  if (status === "paid") {
    link_state = order.credit_linked && (!subscriptionPackage || order.subscription_id)
      ? "complete"
      : "broken";
  } else if (status === "refunded") {
    link_state = "refunded";
  } else if (status === "failed") {
    link_state = "failed";
  }
  return {
    ...order,
    payment_state: status === "paid" ? "paid" : status === "refunded" ? "refunded" : status === "failed" ? "failed" : "unpaid",
    subscription_package: subscriptionPackage,
    link_state,
  };
}

/**
 * GET  list/detail orders (admin.orders.read)
 * POST action=refund (admin.orders.refund) → yam clawback + affiliate reverse
 */
export async function GET(req: NextRequest) {
  try { await requirePermission("admin.orders.read"); } catch (e) { return guard(e); }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const order = await q1<Record<string, any>>(
      `SELECT o.*, u.email, u.name, u.tier AS user_tier, u.sub_expires_at,
              EXISTS(
                SELECT 1 FROM hour_transactions ht
                 WHERE ht.user_id=o.user_id AND ht.ref_payment_id='order_'||o.id::text
              ) AS credit_linked,
              (SELECT s.id FROM subscriptions s WHERE s.payment_id=o.pay_ref ORDER BY s.created_at DESC LIMIT 1) AS subscription_id,
              (SELECT s.status FROM subscriptions s WHERE s.payment_id=o.pay_ref ORDER BY s.created_at DESC LIMIT 1) AS subscription_status,
              (SELECT COUNT(*)::int FROM affiliate_rewards ar WHERE ar.order_id=o.id) AS affiliate_reward_count
         FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=$1`, [id]);
    if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const txns = await q(
      `SELECT delta, reason, balance_after, ref_payment_id, note, created_at
         FROM hour_transactions
        WHERE ref_payment_id IN ($1,$2) OR (user_id=$3 AND note ILIKE '%'||$4||'%')
        ORDER BY created_at DESC LIMIT 20`,
      [`order_${id}`, `order_${id}_refund`, order.user_id, id]
    ).catch(() => []);
    return NextResponse.json({ ok: true, order: decorateOrder(order), txns });
  }
  const status = (url.searchParams.get("status") || "").trim();
  const search = (url.searchParams.get("search") || "").trim();
  const where: string[] = [];
  const args: unknown[] = [];
  if (status) { args.push(status); where.push(`o.status=$${args.length}`); }
  if (search) {
    args.push(`%${search.toLowerCase()}%`);
    where.push(`(LOWER(u.email) LIKE $${args.length} OR LOWER(COALESCE(o.pay_ref,'')) LIKE $${args.length} OR LOWER(COALESCE(o.package_code,'')) LIKE $${args.length})`);
  }
  const ws = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await q<Record<string, any>>(
    `SELECT o.id, o.created_at, o.paid_at, o.package_code, o.amount_thb, o.yam_granted,
            o.status, o.pay_method, o.pay_ref, o.coupon_code, u.email, u.id AS user_id,
            u.tier AS user_tier, u.sub_expires_at,
            EXISTS(
              SELECT 1 FROM hour_transactions ht
               WHERE ht.user_id=o.user_id AND ht.ref_payment_id='order_'||o.id::text
            ) AS credit_linked,
            (SELECT s.id FROM subscriptions s WHERE s.payment_id=o.pay_ref ORDER BY s.created_at DESC LIMIT 1) AS subscription_id,
            (SELECT s.status FROM subscriptions s WHERE s.payment_id=o.pay_ref ORDER BY s.created_at DESC LIMIT 1) AS subscription_status,
            (SELECT COUNT(*)::int FROM affiliate_rewards ar WHERE ar.order_id=o.id) AS affiliate_reward_count
       FROM orders o JOIN users u ON u.id=o.user_id
       ${ws}
       ORDER BY o.created_at DESC LIMIT 200`, args);
  return NextResponse.json({ ok: true, rows: rows.map(decorateOrder) });
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requirePermission("admin.orders.refund"); } catch (e) { return guard(e); }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "");
  const orderId = String(body.order_id || body.id || "");
  if (!orderId) return NextResponse.json({ ok: false, error: "order_id required" }, { status: 400 });

  if (action === "refund") {
    const reason = String(body.reason || "admin_refund").slice(0, 200);
    const before = await q1(`SELECT status, yam_granted, user_id, amount_thb FROM orders WHERE id=$1`, [orderId]);
    if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (before.status !== "paid" && before.status !== "refunded") {
      return NextResponse.json({ ok: false, error: `cannot_refund_status_${before.status}` }, { status: 400 });
    }
    const result = await refundPaidOrder(orderId, reason, admin.userId);
    if (!result.ok) {
      await enqueueNotification({
        eventType: "refund_failed", severity: "critical", audienceKind: "admin",
        audienceRoles: ["finance", "superadmin"], requiredPermission: "admin.orders.refund",
        dedupeKey: `refund-failed:${orderId}:${String(result.error || "error")}`,
        targetUrl: `/admin/orders?id=${encodeURIComponent(orderId)}`,
        payload: { order_id: orderId, failure: String(result.error || "refund_failed") },
      }).catch((e) => console.warn("[notify] refund failed", e instanceof Error ? e.message : String(e)));
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    await writeAdminAudit({
      actor: admin,
      action: "admin.orders.refund",
      targetType: "order",
      targetId: orderId,
      payload: {
        before_status: before.status,
        yam_granted: before.yam_granted,
        clawback: result.clawback,
        affiliate_reversed: result.affiliate_reversed,
        user_id: before.user_id,
      },
      reason,
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, result });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
