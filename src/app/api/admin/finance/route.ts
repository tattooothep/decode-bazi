import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";

/**
 * หลังบ้าน · การเงิน (admin only)
 * GET /api/admin/finance                 → dashboard สรุป
 * GET /api/admin/finance?view=txns       → ledger ยาม (?reason= &user= &page= &limit=)
 * GET /api/admin/finance?view=orders     → ออเดอร์ (?status=)
 */
export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch (e) { return guard(e); }
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "dashboard";

  if (view === "txns") {
    const reason = (url.searchParams.get("reason") || "").trim();
    const user = (url.searchParams.get("user") || "").trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const off = (page - 1) * limit;
    const where: string[] = [];
    const args: unknown[] = [];
    if (reason) { args.push(reason); where.push(`t.reason=$${args.length}`); }
    if (user) { args.push(`%${user.toLowerCase()}%`); where.push(`LOWER(u.email) LIKE $${args.length}`); }
    const ws = where.length ? `WHERE ${where.join(" AND ")}` : "";
    args.push(limit, off);
    const rows = await q(
      `SELECT t.created_at, u.email, t.delta, t.reason, t.balance_after, t.ref_feature, t.note
         FROM hour_transactions t JOIN users u ON u.id=t.user_id
         ${ws} ORDER BY t.created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args);
    return NextResponse.json({ ok: true, rows, page, limit });
  }

  if (view === "orders") {
    const status = (url.searchParams.get("status") || "").trim();
    const where: string[] = [];
    const args: unknown[] = [];
    if (status) { args.push(status); where.push(`o.status=$${args.length}`); }
    const ws = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await q(
      `SELECT o.created_at, o.paid_at, u.email, o.package_code, o.amount_thb, o.yam_granted,
              o.status, o.pay_method, o.coupon_code
         FROM orders o JOIN users u ON u.id=o.user_id ${ws}
         ORDER BY o.created_at DESC LIMIT 200`, args);
    return NextResponse.json({ ok: true, rows });
  }

  // dashboard
  const rev = await q1<{ paid_orders: number; revenue_thb: number; yam_sold: number }>(
    `SELECT COUNT(*)::int AS paid_orders, COALESCE(SUM(amount_thb),0)::int AS revenue_thb,
            COALESCE(SUM(yam_granted),0)::int AS yam_sold
       FROM orders WHERE status='paid'`);
  const rev30 = await q1<{ revenue_thb: number }>(
    `SELECT COALESCE(SUM(amount_thb),0)::int AS revenue_thb FROM orders
       WHERE status='paid' AND paid_at >= now() - interval '30 days'`);
  const yamSpent = await q1<{ spent: number }>(
    `SELECT COALESCE(SUM(-delta),0)::int AS spent FROM hour_transactions WHERE delta < 0`);
  const yamGiven = await q1<{ given: number }>(
    `SELECT COALESCE(SUM(delta),0)::int AS given FROM hour_transactions WHERE delta > 0`);
  const aiCost = await q1<{ cost_cents: number; tokens: number }>(
    `SELECT COALESCE(SUM(cost_cents),0)::int AS cost_cents, COALESCE(SUM(tokens_used),0)::int AS tokens FROM ai_usage`);
  const aiCost30 = await q1<{ cost_cents: number }>(
    `SELECT COALESCE(SUM(cost_cents),0)::int AS cost_cents FROM ai_usage WHERE date >= (now() - interval '30 days')::date`);
  const users = await q1<{ total: number; paying: number; balance_outstanding: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE tier <> 'free')::int AS paying,
            COALESCE(SUM(hour_balance),0)::int AS balance_outstanding FROM users`);
  // รายได้รายวัน 14 วัน
  const daily = await q(
    `SELECT to_char(date_trunc('day', paid_at),'MM-DD') AS day, COALESCE(SUM(amount_thb),0)::int AS thb
       FROM orders WHERE status='paid' AND paid_at >= now() - interval '14 days'
       GROUP BY 1 ORDER BY 1`);
  // ใช้ยามแยกฟีเจอร์ (top 8)
  const byFeature = await q(
    `SELECT COALESCE(ref_feature,'?') AS feature, COUNT(*)::int AS n, COALESCE(SUM(-delta),0)::int AS yam
       FROM hour_transactions WHERE delta < 0
       GROUP BY 1 ORDER BY yam DESC LIMIT 8`);

  return NextResponse.json({
    ok: true,
    revenue: { paid_orders: rev?.paid_orders ?? 0, total_thb: rev?.revenue_thb ?? 0, thb_30d: rev30?.revenue_thb ?? 0, yam_sold: rev?.yam_sold ?? 0 },
    yam: { spent: yamSpent?.spent ?? 0, given: yamGiven?.given ?? 0, outstanding: users?.balance_outstanding ?? 0 },
    ai_cost: { total_thb: Math.round((aiCost?.cost_cents ?? 0) / 100), thb_30d: Math.round((aiCost30?.cost_cents ?? 0) / 100), tokens: aiCost?.tokens ?? 0 },
    users: { total: users?.total ?? 0, paying: users?.paying ?? 0 },
    daily, byFeature,
  });
}
