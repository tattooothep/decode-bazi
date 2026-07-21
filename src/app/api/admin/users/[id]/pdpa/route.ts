import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { writeAdminAudit } from "@/lib/admin-audit";
import { q, q1 } from "@/lib/db";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

const CLIP = 2000;
const clip = (s: unknown) => {
  const t = String(s ?? "");
  return t.length > CLIP ? t.slice(0, CLIP) + `…` : t;
};

/** Admin PDPA: export | soft_delete | restore */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let admin;
  try { admin = await requirePermission("admin.users.export"); } catch (e) { return guard(e); }
  const { id } = await ctx.params;
  const u = await q1(
    `SELECT id, email, name, phone, locale, timezone, theme, tier, hour_balance,
            sub_expires_at, is_active, deleted_at, created_at, last_active_at,
            email_verified, phone_verified, line_user_id IS NOT NULL AS has_line,
            google_user_id IS NOT NULL AS has_google
       FROM users WHERE id=$1`,
    [id]
  );
  if (!u) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const [profiles, sifuHistory, transactions, devices, orders] = await Promise.all([
    q(`SELECT id, name, nickname, gender, relationship_type, birth_datetime, day_master, is_archived, created_at
         FROM profiles WHERE created_by_user_id=$1 ORDER BY created_at`, [id]),
    q(`SELECT id, lang, left(question,2000) AS question, left(answer,2000) AS answer, created_at
         FROM chart_sifu_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200`, [id]),
    q(`SELECT id, delta, reason, balance_after, ref_feature, note, created_at
         FROM hour_transactions WHERE user_id=$1 ORDER BY created_at`, [id]),
    q(`SELECT id, ua, ip_hash, first_seen, last_seen FROM user_devices WHERE user_id=$1`, [id]),
    q(`SELECT id, package_code, amount_thb, yam_granted, status, pay_method, coupon_code, created_at, paid_at
         FROM orders WHERE user_id=$1 ORDER BY created_at`, [id]),
  ]);

  await writeAdminAudit({
    actor: admin,
    action: "admin.users.export",
    targetType: "user",
    targetId: id,
    payload: { profiles: profiles.length, orders: orders.length },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    ok: true,
    format: "hourkey-admin-pdpa-export",
    version: 1,
    exported_at: new Date().toISOString(),
    exported_by: admin.email,
    user: u,
    profiles,
    sifu_history: sifuHistory.map((r: Record<string, unknown>) => ({
      ...r,
      question: clip(r.question),
      answer: clip(r.answer),
    })),
    transactions,
    devices,
    orders,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let admin;
  try { admin = await requirePermission("admin.users.restore"); } catch (e) {
    try { admin = await requirePermission("admin.users.suspend"); } catch (e2) { return guard(e2); }
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "");

  if (action === "soft_delete") {
    try { admin = await requirePermission("admin.users.suspend"); } catch (e) { return guard(e); }
    await q1(
      `UPDATE users SET
          deleted_at = now(),
          is_active = false,
          deleted_snapshot = jsonb_build_object(
            'email', email, 'password_hash', password_hash,
            'google_user_id', google_user_id, 'line_user_id', line_user_id,
            'avatar_url', avatar_url, 'deleted_by', 'admin', 'admin_id', $2::text,
            'deleted_at', now()
          ),
          email = 'deleted+' || extract(epoch from now())::bigint || '+' || email,
          password_hash = NULL, google_user_id = NULL, line_user_id = NULL
        WHERE id=$1 AND deleted_at IS NULL`,
      [id, admin.userId]
    );
    await q1(
      `UPDATE profiles SET is_archived=true, updated_at=now()
        WHERE created_by_user_id=$1 AND is_archived=false`,
      [id]
    );
    await writeAdminAudit({
      actor: admin,
      action: "admin.users.pdpa.soft_delete",
      targetType: "user",
      targetId: id,
      reason: String(body.reason || "").slice(0, 300) || null,
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "restore") {
    try { admin = await requirePermission("admin.users.restore"); } catch (e) { return guard(e); }
    const u = await q1<{ deleted_snapshot: Record<string, unknown> | null; deleted_at: string | null }>(
      `SELECT deleted_snapshot, deleted_at FROM users WHERE id=$1`,
      [id]
    );
    if (!u?.deleted_at) return NextResponse.json({ ok: false, error: "not_deleted" }, { status: 400 });
    const snap = u.deleted_snapshot || {};
    const email = String(snap.email || "").trim();
    if (!email) return NextResponse.json({ ok: false, error: "no_snapshot_email" }, { status: 400 });
    // within 30 days optional check
    const age = await q1<{ days: number }>(
      `SELECT EXTRACT(epoch FROM (now() - deleted_at))/86400.0 AS days FROM users WHERE id=$1`,
      [id]
    );
    if (age && Number(age.days) > 30 && body.force !== true) {
      return NextResponse.json({ ok: false, error: "restore_window_expired", days: age.days }, { status: 400 });
    }
    await q1(
      `UPDATE users SET
          deleted_at = NULL,
          is_active = true,
          email = $2,
          password_hash = $3,
          google_user_id = $4,
          line_user_id = $5,
          avatar_url = $6,
          deleted_snapshot = NULL
        WHERE id=$1`,
      [
        id,
        email,
        snap.password_hash || null,
        snap.google_user_id || null,
        snap.line_user_id || null,
        snap.avatar_url || null,
      ]
    );
    await q1(
      `UPDATE profiles SET is_archived=false, updated_at=now()
        WHERE created_by_user_id=$1 AND is_archived=true`,
      [id]
    );
    await writeAdminAudit({
      actor: admin,
      action: "admin.users.pdpa.restore",
      targetType: "user",
      targetId: id,
      payload: { email },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, email });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
