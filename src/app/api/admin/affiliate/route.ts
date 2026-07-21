import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import {
  approveAffiliateMember,
  approveAffiliateReward,
  getAffiliateAdminDashboard,
  markAffiliateRewardPaid,
  reverseAffiliateRewardsForOrder,
  setAffiliateAttributionStatus,
  setAffiliateMemberStatus,
} from "@/lib/affiliate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  return `"${raw.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  try { await requirePermission("admin.affiliate.members.read"); } catch (e) { return guard(e); }
  const url = new URL(req.url);
  const data = await getAffiliateAdminDashboard();
  if (url.searchParams.get("format") === "csv") {
    const rows = [
      ["created_at", "status", "referrer", "referred", "order_id", "package", "amount_thb", "rate_bps", "commission_thb", "hold_until", "paid_at", "reversal_reason"],
      ...((data.rewards || []) as Record<string, unknown>[]).map((r) => [
        r.created_at,
        r.status,
        r.referrer_email,
        r.referred_email,
        r.order_id,
        r.package_code,
        r.amount_thb,
        r.commission_rate_bps,
        r.commission_thb,
        r.hold_until,
        r.paid_at,
        r.reversal_reason,
      ]),
    ];
    return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="hourkey-affiliate-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.json({ ok: true, ...data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "");
  const permission =
    action === "approve_member" ? "admin.affiliate.members.approve" :
    ["suspend_member", "reject_member", "reactivate_member"].includes(action) ? "admin.affiliate.members.suspend" :
    action === "approve_reward" ? "admin.affiliate.rewards.approve" :
    action === "mark_paid" ? "admin.affiliate.rewards.pay" :
    action === "reverse_order" ? "admin.affiliate.rewards.reverse" :
    ["approve_signup", "block_signup", "cancel_signup"].includes(action) ? "admin.affiliate.attributions.review" :
    null;
  if (!permission) {
    try { await requirePermission("admin.dashboard.read"); } catch (e) { return guard(e); }
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }
  let admin;
  try { admin = await requirePermission(permission); } catch (e) { return guard(e); }
  try {
    if (action === "approve_member") {
      const member = await approveAffiliateMember({
        actorUserId: admin.userId,
        userId: String(body.userId || ""),
        email: String(body.email || ""),
        note: String(body.note || "").slice(0, 500),
      });
      return NextResponse.json({ ok: true, member });
    }
    if (action === "suspend_member" || action === "reject_member" || action === "reactivate_member") {
      const status = action === "suspend_member" ? "suspended" : action === "reject_member" ? "rejected" : "active";
      const member = await setAffiliateMemberStatus(
        admin.userId,
        String(body.userId || ""),
        status,
        String(body.note || "").slice(0, 500)
      );
      return NextResponse.json({ ok: true, member });
    }
    if (action === "approve_reward") {
      const reward = await approveAffiliateReward({
        rewardId: String(body.rewardId || ""),
        actorUserId: admin.userId,
        overrideHold: body.overrideHold === true,
        note: String(body.note || "").slice(0, 500),
      });
      return NextResponse.json({ ok: true, reward });
    }
    if (action === "mark_paid") {
      const reward = await markAffiliateRewardPaid({
        rewardId: String(body.rewardId || ""),
        actorUserId: admin.userId,
        payoutRef: String(body.payoutRef || "").slice(0, 200),
        note: String(body.note || "").slice(0, 500),
      });
      return NextResponse.json({ ok: true, reward });
    }
    if (action === "reverse_order") {
      const reversal = await reverseAffiliateRewardsForOrder(
        String(body.orderId || ""),
        String(body.reason || "admin_reverse").slice(0, 300),
        admin.userId
      );
      return NextResponse.json({ ok: true, reversal });
    }
    if (action === "approve_signup" || action === "block_signup" || action === "cancel_signup") {
      const status = action === "approve_signup" ? "active" : action === "block_signup" ? "rejected" : "cancelled";
      const attribution = await setAffiliateAttributionStatus({
        actorUserId: admin.userId,
        attributionId: String(body.attributionId || ""),
        status,
        reason: String(body.reason || action).slice(0, 300),
      });
      return NextResponse.json({ ok: true, attribution });
    }
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
