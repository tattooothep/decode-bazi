import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requirePermission, adminHas } from "@/lib/admin-guard";
import { writeAdminAudit } from "@/lib/admin-audit";
import { q, q1 } from "@/lib/db";
import { isProductTier } from "@/lib/admin-permissions";
import { clientIp } from "@/lib/rate-limit";
import {
  adminAdjustCredit,
  adminSetActive,
  adminSetTier,
} from "@/lib/admin-member-actions";

/**
 * หลังบ้าน · สมาชิก
 * GET  list / detail (admin.users.read)
 * POST adjust_credit | set_tier | set_active | extend_sub | add_note
 */
export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  let admin;
  try { admin = await requirePermission("admin.users.read"); } catch (e) { return guard(e); }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const u = await q1<Record<string, unknown>>(
      `SELECT id, email, name, phone, tier, hour_balance, sub_expires_at, is_active,
              email_verified, phone_verified, locale, created_at, last_active_at,
              line_user_id, google_user_id, deleted_at
         FROM users WHERE id=$1`, [id]);
    if (!u) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const profiles = await q(
      `SELECT id, name, nickname, relationship_type, day_master, is_archived, created_at
         FROM profiles WHERE created_by_user_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]
    ).catch(() => []);
    const profileCount = await q1<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM profiles WHERE created_by_user_id=$1 AND COALESCE(is_archived,false)=false`, [id]
    ).catch(() => ({ n: 0 }));
    const chats = await q1<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM chart_sifu_history WHERE user_id=$1`, [id]
    ).catch(() => ({ n: 0 }));
    const txns = await q(
      `SELECT delta, reason, balance_after, ref_feature, note, created_at, ref_payment_id
         FROM hour_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [id]);
    const orders = await q(
      `SELECT id, package_code, amount_thb, yam_granted, status, pay_method, pay_ref, coupon_code, created_at, paid_at, note
         FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]);
    const notes = await q(
      `SELECT n.id, n.body, n.pinned, n.created_at, u.email AS admin_email
         FROM user_admin_notes n JOIN users u ON u.id=n.admin_id
        WHERE n.user_id=$1 ORDER BY n.pinned DESC, n.created_at DESC LIMIT 50`, [id]
    ).catch(() => []);
    let affiliate: Record<string, unknown> | null = null;
    try {
      const asMember = await q1(
        `SELECT code, status, payout_kind, requested_at, approved_at FROM affiliate_members WHERE user_id=$1`, [id]);
      const asReferred = await q1(
        `SELECT a.code, a.status, a.referrer_user_id, u.email AS referrer_email
           FROM affiliate_attributions a JOIN users u ON u.id=a.referrer_user_id
          WHERE a.referred_user_id=$1`, [id]);
      const rewardStats = await q1<{ pending: number; paid: number; n: number }>(
        `SELECT COUNT(*)::int AS n,
                COALESCE(SUM(commission_thb) FILTER (WHERE status='pending'),0)::int AS pending,
                COALESCE(SUM(commission_thb) FILTER (WHERE status='paid'),0)::int AS paid
           FROM affiliate_rewards WHERE referrer_user_id=$1 OR referred_user_id=$1`, [id]);
      affiliate = {
        member: asMember,
        referred_by: asReferred,
        rewards: rewardStats,
        admin_path: "/admin/affiliate",
      };
    } catch {
      affiliate = null;
    }
    return NextResponse.json({
      ok: true,
      user: u,
      profiles,
      profile_count: profileCount?.n ?? profiles.length,
      chats: chats?.n ?? 0,
      txns,
      orders,
      notes,
      affiliate,
      caps: {
        can_credit: adminHas(admin, "admin.users.credit.adjust"),
        can_tier: adminHas(admin, "admin.users.tier.set"),
        can_suspend: adminHas(admin, "admin.users.suspend"),
        can_extend: adminHas(admin, "admin.users.sub.extend"),
        can_refund: adminHas(admin, "admin.orders.refund"),
        can_notes: adminHas(admin, "admin.users.notes.write"),
      },
    });
  }

  const search = (url.searchParams.get("search") || "").trim();
  const tier = (url.searchParams.get("tier") || "").trim();
  const active = (url.searchParams.get("active") || "").trim();
  const sort = (url.searchParams.get("sort") || "created").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "30", 10) || 30));
  const off = (page - 1) * limit;

  const where: string[] = ["deleted_at IS NULL"];
  const args: unknown[] = [];
  if (search) {
    args.push(`%${search.toLowerCase()}%`);
    where.push(`(LOWER(email) LIKE $${args.length} OR LOWER(COALESCE(name,'')) LIKE $${args.length} OR COALESCE(phone,'') LIKE $${args.length})`);
  }
  if (tier) {
    if (!isProductTier(tier)) {
      return NextResponse.json({ ok: false, error: "bad tier filter — use free|premium|master" }, { status: 400 });
    }
    args.push(tier);
    where.push(`tier=$${args.length}`);
  }
  if (active === "1") where.push(`is_active=true`);
  if (active === "0") where.push(`is_active=false`);
  const ws = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderBy = sort === "balance" ? "hour_balance DESC"
    : sort === "active" ? "last_active_at DESC NULLS LAST"
    : "created_at DESC";

  const total = await q1<{ n: number }>(`SELECT COUNT(*)::int AS n FROM users ${ws}`, args);
  args.push(limit, off);
  const rows = await q(
    `SELECT id, email, name, tier, hour_balance, sub_expires_at, is_active, created_at, last_active_at, email_verified, phone
       FROM users ${ws} ORDER BY ${orderBy} LIMIT $${args.length - 1} OFFSET $${args.length}`, args);
  return NextResponse.json({ ok: true, total: total?.n ?? 0, page, limit, rows, _admin: admin.email });
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return guard(e); }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const exist = await q1<{ id: string; hour_balance: number; tier: string; is_active: boolean; sub_expires_at: string | null }>(
    `SELECT id, hour_balance, tier, is_active, sub_expires_at FROM users WHERE id=$1`, [id]);
  if (!exist) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent");

  if (action === "adjust_credit") {
    const r = await adminAdjustCredit({
      admin,
      userId: id,
      delta: Number(body.delta) || 0,
      note: String(body.note || ""),
      ip,
      userAgent: ua,
    });
    if (!r.ok) return NextResponse.json(r, { status: r.status || 400 });
    return NextResponse.json(r);
  }

  if (action === "set_tier") {
    const r = await adminSetTier({
      admin,
      userId: id,
      tier: String(body.tier || ""),
      ip,
      userAgent: ua,
    });
    if (!r.ok) return NextResponse.json(r, { status: r.status || 400 });
    return NextResponse.json(r);
  }

  if (action === "set_active") {
    const active = body.active === true || body.active === "true" || body.active === 1;
    const r = await adminSetActive({
      admin,
      userId: id,
      active: !!active,
      note: String(body.note || ""),
      ip,
      userAgent: ua,
    });
    if (!r.ok) return NextResponse.json(r, { status: r.status || 400 });
    return NextResponse.json(r);
  }

  if (action === "extend_sub") {
    try { admin = await requirePermission("admin.users.sub.extend"); } catch (e) { return guard(e); }
    const days = Math.trunc(Number(body.days) || 0);
    if (!days) return NextResponse.json({ ok: false, error: "days required" }, { status: 400 });
    const before = exist.sub_expires_at;
    const row = await q1<{ sub_expires_at: string }>(
      `UPDATE users SET sub_expires_at = GREATEST(COALESCE(sub_expires_at, now()), now()) + ($2 || ' days')::interval
         WHERE id=$1 RETURNING sub_expires_at`, [id, String(days)]);
    await writeAdminAudit({
      actor: admin,
      action: "admin.users.sub.extend",
      targetType: "user",
      targetId: id,
      payload: { before, after: row?.sub_expires_at, days },
      ip,
      userAgent: ua,
    });
    return NextResponse.json({ ok: true, sub_expires_at: row?.sub_expires_at });
  }

  if (action === "add_note") {
    try { admin = await requirePermission("admin.users.notes.write"); } catch (e) { return guard(e); }
    const bodyText = String(body.body || body.note || "").trim().slice(0, 4000);
    if (!bodyText) return NextResponse.json({ ok: false, error: "body required" }, { status: 400 });
    const pinned = body.pinned === true;
    const row = await q1<{ id: string }>(
      `INSERT INTO user_admin_notes(user_id, admin_id, body, pinned)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [id, admin.userId, bodyText, pinned]
    ).catch((e) => {
      console.warn("[members] notes table?", e.message);
      return null;
    });
    if (!row) return NextResponse.json({ ok: false, error: "notes_unavailable_run_migration" }, { status: 500 });
    await writeAdminAudit({
      actor: admin,
      action: "admin.users.notes.write",
      targetType: "user",
      targetId: id,
      payload: { note_id: row.id, pinned },
      reason: bodyText.slice(0, 200),
      ip,
      userAgent: ua,
    });
    return NextResponse.json({ ok: true, id: row.id });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
