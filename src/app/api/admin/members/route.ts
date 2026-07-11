import { NextRequest, NextResponse } from "next/server";
import { requirePermission, adminHas } from "@/lib/admin-guard";
import { writeAdminAudit } from "@/lib/admin-audit";
import { q, q1 } from "@/lib/db";
import { isProductTier } from "@/lib/admin-permissions";
import { clientIp } from "@/lib/rate-limit";
import {
  adminAdjustCredit,
  adminSetActive,
  adminSetTier,
} from "@/lib/admin-member-actions";
import {
  deriveProductAccess,
  FREE_SIGNUP_YAM,
  TRIAL_DAYS,
  type ProductUserRow,
} from "@/lib/product-entitlement";

/**
 * หลังบ้าน · สมาชิก
 * GET  list / detail (admin.users.read) · รวม product plan/trial/caps (SoT product-entitlement)
 * POST adjust_credit | set_tier | set_active | extend_sub | extend_trial | add_note
 * ⚠️ ไม่เขียน affiliate_* (ดู AFFILIATE_ISOLATION_CONTRACT)
 */
export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

function productAccessFromUserRow(u: {
  tier?: unknown;
  hour_balance?: unknown;
  sub_expires_at?: unknown;
  trial_ends_at?: unknown;
}) {
  return deriveProductAccess({
    tier: u.tier != null ? String(u.tier) : "free",
    hour_balance: Number(u.hour_balance) || 0,
    sub_expires_at: u.sub_expires_at != null ? String(u.sub_expires_at) : null,
    trial_ends_at: u.trial_ends_at != null ? String(u.trial_ends_at) : null,
  } as ProductUserRow);
}

export async function GET(req: NextRequest) {
  let admin;
  try { admin = await requirePermission("admin.users.read"); } catch (e) { return guard(e); }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const u = await q1<Record<string, unknown>>(
      `SELECT id, email, name, phone, tier, hour_balance, sub_expires_at, trial_ends_at, is_active,
              email_verified, phone_verified, locale, created_at, last_active_at,
              line_user_id, google_user_id, deleted_at,
              signup_ip_hash, signup_device_hash, signup_ua
         FROM users WHERE id=$1`, [id]);
    if (!u) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const product_access = productAccessFromUserRow(u);
    // peers: บัญชีอื่นที่ hash เครื่อง/IP ตอนสมัครตรงกัน (ให้ admin เห็นซ้ำ · ไม่บล็อก)
    const signup_peers = {
      same_device: [] as { id: string; email: string; created_at: string }[],
      same_ip: [] as { id: string; email: string; created_at: string }[],
      same_device_count: 0,
      same_ip_count: 0,
    };
    try {
      const devH = u.signup_device_hash ? String(u.signup_device_hash) : "";
      const ipH = u.signup_ip_hash ? String(u.signup_ip_hash) : "";
      if (devH) {
        const rows = await q<{ id: string; email: string; created_at: string }>(
          `SELECT id, email, created_at::text FROM users
            WHERE signup_device_hash=$1 AND id<>$2 AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 20`,
          [devH, id]
        );
        signup_peers.same_device = rows;
        signup_peers.same_device_count = rows.length;
      }
      if (ipH) {
        const rows = await q<{ id: string; email: string; created_at: string }>(
          `SELECT id, email, created_at::text FROM users
            WHERE signup_ip_hash=$1 AND id<>$2 AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 20`,
          [ipH, id]
        );
        signup_peers.same_ip = rows;
        signup_peers.same_ip_count = rows.length;
      }
    } catch { /* columns missing on old deploy */ }
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
      `SELECT o.id, o.package_code, o.amount_thb, o.yam_granted, o.status, o.pay_method, o.pay_ref,
              o.coupon_code, o.created_at, o.paid_at, o.note,
              CASE WHEN o.status='paid' THEN 'paid'
                   WHEN o.status='refunded' THEN 'refunded'
                   WHEN o.status='failed' THEN 'failed'
                   ELSE 'unpaid' END AS payment_state,
              EXISTS(
                SELECT 1 FROM hour_transactions ht
                 WHERE ht.user_id=o.user_id AND ht.ref_payment_id='order_'||o.id::text
              ) AS credit_linked,
              (SELECT s.id FROM subscriptions s WHERE s.payment_id=o.pay_ref ORDER BY s.created_at DESC LIMIT 1) AS subscription_id,
              (SELECT s.status FROM subscriptions s WHERE s.payment_id=o.pay_ref ORDER BY s.created_at DESC LIMIT 1) AS subscription_status
         FROM orders o WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 50`, [id]);
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
      product_access,
      product_constants: { free_signup_yam: FREE_SIGNUP_YAM, trial_days: TRIAL_DAYS },
      profiles,
      profile_count: profileCount?.n ?? profiles.length,
      chats: chats?.n ?? 0,
      txns,
      orders,
      notes,
      affiliate, // read-only snapshot · จัดการที่ /admin/affiliate
      signup_peers,
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
  const plan = (url.searchParams.get("plan") || "").trim().toLowerCase();
  const active = (url.searchParams.get("active") || "").trim();
  const sort = (url.searchParams.get("sort") || "created").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "30", 10) || 30));
  const off = (page - 1) * limit;

  const where: string[] = ["u.deleted_at IS NULL"];
  const args: unknown[] = [];
  if (search) {
    args.push(`%${search.toLowerCase()}%`);
    where.push(
      `(LOWER(u.email) LIKE $${args.length} OR LOWER(COALESCE(u.name,'')) LIKE $${args.length} OR COALESCE(u.phone,'') LIKE $${args.length})`
    );
  }
  if (tier) {
    if (!isProductTier(tier)) {
      return NextResponse.json({ ok: false, error: "bad tier filter — use free|premium|master" }, { status: 400 });
    }
    args.push(tier);
    where.push(`u.tier=$${args.length}`);
  }
  // product plan filter (effective access · ตรง deriveProductAccess)
  if (plan === "trial") {
    where.push(
      `u.trial_ends_at IS NOT NULL AND u.trial_ends_at > now()
       AND NOT (LOWER(COALESCE(u.tier,'free')) IN ('premium','master') AND u.sub_expires_at IS NOT NULL AND u.sub_expires_at > now())`
    );
  } else if (plan === "premium") {
    where.push(`LOWER(COALESCE(u.tier,''))='premium' AND u.sub_expires_at IS NOT NULL AND u.sub_expires_at > now()`);
  } else if (plan === "master") {
    where.push(`LOWER(COALESCE(u.tier,''))='master' AND u.sub_expires_at IS NOT NULL AND u.sub_expires_at > now()`);
  } else if (plan === "free") {
    where.push(
      `NOT (LOWER(COALESCE(u.tier,'free')) IN ('premium','master') AND u.sub_expires_at IS NOT NULL AND u.sub_expires_at > now())
       AND NOT (u.trial_ends_at IS NOT NULL AND u.trial_ends_at > now())`
    );
  } else if (plan) {
    return NextResponse.json({ ok: false, error: "bad plan filter — use trial|free|premium|master" }, { status: 400 });
  }
  if (active === "1") where.push(`u.is_active=true`);
  if (active === "0") where.push(`u.is_active=false`);
  const ws = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderBy =
    sort === "balance"
      ? "u.hour_balance DESC"
      : sort === "active"
        ? "u.last_active_at DESC NULLS LAST"
        : "u.created_at DESC";

  const total = await q1<{ n: number }>(`SELECT COUNT(*)::int AS n FROM users u ${ws}`, args);
  args.push(limit, off);
  const rows = await q(
    `SELECT u.id, u.email, u.name, u.tier, u.hour_balance, u.sub_expires_at, u.trial_ends_at, u.is_active,
            u.created_at, u.last_active_at, u.email_verified, u.phone, u.phone_verified,
            u.signup_ip_hash, u.signup_device_hash,
            EXISTS (
              SELECT 1 FROM profiles p
               WHERE p.created_by_user_id = u.id
                 AND COALESCE(p.is_archived,false)=false
                 AND (p.relationship_type IS NULL OR btrim(p.relationship_type)='')
            ) AS has_self_profile,
            CASE WHEN u.signup_device_hash IS NULL OR u.signup_device_hash = '' THEN 0
                 ELSE (SELECT COUNT(*)::int FROM users x
                        WHERE x.signup_device_hash = u.signup_device_hash
                          AND x.id <> u.id AND x.deleted_at IS NULL)
            END AS signup_device_peers,
            CASE WHEN u.signup_ip_hash IS NULL OR u.signup_ip_hash = '' THEN 0
                 ELSE (SELECT COUNT(*)::int FROM users x
                        WHERE x.signup_ip_hash = u.signup_ip_hash
                          AND x.id <> u.id AND x.deleted_at IS NULL)
            END AS signup_ip_peers
       FROM users u
       ${ws}
      ORDER BY ${orderBy}
      LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args
  );
  const enriched = (rows as Record<string, unknown>[]).map((r) => {
    const access = productAccessFromUserRow(r);
    return {
      ...r,
      product_plan: access.plan,
      in_trial: access.in_trial,
    };
  });
  return NextResponse.json({
    ok: true,
    total: total?.n ?? 0,
    page,
    limit,
    rows: enriched,
    product_constants: { free_signup_yam: FREE_SIGNUP_YAM, trial_days: TRIAL_DAYS },
    _admin: admin.email,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id || "");
  const action = String(body.action || "");
  const permission =
    action === "adjust_credit" ? "admin.users.credit.adjust" :
    action === "set_tier" ? "admin.users.tier.set" :
    action === "set_active" ? (body.active === true || body.active === "true" || body.active === 1 ? "admin.users.restore" : "admin.users.suspend") :
    action === "extend_sub" || action === "extend_trial" ? "admin.users.sub.extend" :
    action === "add_note" ? "admin.users.notes.write" :
    null;
  if (!permission) {
    try { await requirePermission("admin.dashboard.read"); } catch (e) { return guard(e); }
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  }
  let admin;
  try { admin = await requirePermission(permission); } catch (e) { return guard(e); }
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

  // ต่อ/ตั้งช่วงทดลอง (trial_ends_at) · ใช้สิทธิ์เดียวกับ extend sub · ไม่แตะ affiliate
  if (action === "extend_trial") {
    try { admin = await requirePermission("admin.users.sub.extend"); } catch (e) { return guard(e); }
    const days = Math.trunc(Number(body.days) || 0);
    if (!days || days < -3650 || days > 3650) {
      return NextResponse.json({ ok: false, error: "days required (−3650…3650)" }, { status: 400 });
    }
    const beforeRow = await q1<{ trial_ends_at: string | null }>(
      `SELECT trial_ends_at FROM users WHERE id=$1`, [id]
    );
    const before = beforeRow?.trial_ends_at ?? null;
    const row = await q1<{ trial_ends_at: string }>(
      days > 0
        ? `UPDATE users SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + ($2 || ' days')::interval
             WHERE id=$1 RETURNING trial_ends_at`
        : `UPDATE users SET trial_ends_at = GREATEST(now(), COALESCE(trial_ends_at, now()) + ($2 || ' days')::interval)
             WHERE id=$1 RETURNING trial_ends_at`,
      [id, String(days)]
    );
    await writeAdminAudit({
      actor: admin,
      action: "admin.users.trial.extend",
      targetType: "user",
      targetId: id,
      payload: { before, after: row?.trial_ends_at, days },
      ip,
      userAgent: ua,
    });
    const access = productAccessFromUserRow({
      ...exist,
      trial_ends_at: row?.trial_ends_at ?? null,
    });
    return NextResponse.json({ ok: true, trial_ends_at: row?.trial_ends_at, product_access: access });
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
