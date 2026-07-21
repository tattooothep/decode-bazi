import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { requirePermission, envAdminEmails, ensureAdminRbacSeeded } from "@/lib/admin-guard";
import { writeAdminAudit } from "@/lib/admin-audit";
import { q, q1 } from "@/lib/db";
import { clientIp } from "@/lib/rate-limit";
import { enqueueNotification } from "@/lib/notification-outbox";

export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function GET(req: NextRequest) {
  try {
    await ensureAdminRbacSeeded();
    await requirePermission("admin.iam.read");
  } catch (e) { return guard(e); }

  const roles = await q(
    `SELECT id, key, name_th, name_en, description, is_super, sort FROM admin_roles ORDER BY sort, key`
  ).catch(() => []);
  const staff = await q(
    `SELECT ur.id AS grant_id, ur.granted_at, ur.expires_at, ur.note,
            u.id AS user_id, u.email, u.name,
            r.key AS role_key, r.name_th AS role_name
       FROM admin_user_roles ur
       JOIN users u ON u.id=ur.user_id
       JOIN admin_roles r ON r.id=ur.role_id
      WHERE ur.revoked_at IS NULL
      ORDER BY ur.granted_at DESC
      LIMIT 200`
  ).catch(() => []);
  const invites = await q(
    `SELECT i.id, i.email, i.status, i.expires_at, i.created_at, r.key AS role_key, inv.email AS invited_by_email
       FROM admin_invitations i
       JOIN admin_roles r ON r.id=i.role_id
       JOIN users inv ON inv.id=i.invited_by
      WHERE i.status='pending' AND i.expires_at > now()
      ORDER BY i.created_at DESC LIMIT 50`
  ).catch(() => []);

  return NextResponse.json({
    ok: true,
    roles,
    staff,
    invites,
    break_glass_emails: envAdminEmails().map((e) => e.replace(/(.{2}).+(@.+)/, "$1***$2")),
  });
}

export async function POST(req: NextRequest) {
  await ensureAdminRbacSeeded().catch(() => null);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "");
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent");

  // accept_invite: any logged-in user matching invite email (must NOT require grant perm first)
  if (action === "accept_invite") {
    const { getSession } = await import("@/lib/auth");
    const s = await getSession();
    if (!s) return NextResponse.json({ ok: false, error: "login_required" }, { status: 401 });
    const raw = String(body.token || "").trim();
    if (!raw) return NextResponse.json({ ok: false, error: "token required" }, { status: 400 });
    const inv = await q1<{ id: string; email: string; role_id: string; status: string }>(
      `SELECT id, email, role_id, status FROM admin_invitations
        WHERE token_hash=$1 AND status='pending' AND expires_at > now()`,
      [hashToken(raw)]
    );
    if (!inv) return NextResponse.json({ ok: false, error: "invalid_or_expired" }, { status: 400 });
    if (inv.email.toLowerCase() !== s.email.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "email_mismatch", expected: inv.email }, { status: 403 });
    }
    await q1(
      `INSERT INTO admin_user_roles(user_id, role_id, granted_by, note)
       SELECT $1,$2,$1,'accepted_invite'
       WHERE NOT EXISTS (
         SELECT 1 FROM admin_user_roles WHERE user_id=$1 AND role_id=$2 AND revoked_at IS NULL
       )`,
      [s.userId, inv.role_id]
    );
    await q1(
      `UPDATE admin_invitations SET status='accepted', accepted_at=now(), accepted_user_id=$2 WHERE id=$1`,
      [inv.id, s.userId]
    );
    return NextResponse.json({ ok: true });
  }

  let admin;
  try {
    admin = await requirePermission(
      action === "invite" ? "admin.iam.invite"
        : action === "revoke" ? "admin.iam.roles.revoke"
        : "admin.iam.roles.grant"
    );
  } catch (e) { return guard(e); }

  if (action === "grant") {
    const email = String(body.email || "").trim().toLowerCase();
    const roleKey = String(body.role_key || body.role || "").trim();
    if (!email || !roleKey) return NextResponse.json({ ok: false, error: "email and role_key required" }, { status: 400 });
    if (roleKey === "superadmin" && !admin.isSuper && admin.source !== "env") {
      return NextResponse.json({ ok: false, error: "only_superadmin_grants_superadmin" }, { status: 403 });
    }
    const user = await q1<{ id: string }>(`SELECT id FROM users WHERE lower(email)=lower($1)`, [email]);
    if (!user) return NextResponse.json({ ok: false, error: "user_not_found_must_signup_first" }, { status: 404 });
    const role = await q1<{ id: string; key: string }>(`SELECT id, key FROM admin_roles WHERE key=$1`, [roleKey]);
    if (!role) return NextResponse.json({ ok: false, error: "role_not_found" }, { status: 404 });
    // revoke prior same role then re-grant clean
    await q1(
      `UPDATE admin_user_roles SET revoked_at=now(), revoked_by=$3
        WHERE user_id=$1 AND role_id=$2 AND revoked_at IS NULL`,
      [user.id, role.id, admin.userId]
    ).catch(() => null);
    const grant = await q1<{ id: string }>(
      `INSERT INTO admin_user_roles(user_id, role_id, granted_by, note)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [user.id, role.id, admin.userId, String(body.note || "").slice(0, 300) || null]
    );
    await writeAdminAudit({
      actor: admin,
      action: "admin.iam.roles.grant",
      targetType: "user",
      targetId: user.id,
      payload: { email, role_key: roleKey },
      ip,
      userAgent: ua,
    });
    await enqueueNotification({
      eventType: "admin_role_changed", severity: roleKey === "superadmin" ? "critical" : "warning",
      audienceKind: "admin", audienceRoles: ["superadmin"], requiredPermission: "admin.iam.roles.grant",
      dedupeKey: `admin-role-grant:${grant?.id || `${user.id}:${roleKey}`}`,
      targetUrl: "/admin/iam", payload: { change: "grant", target_user_id: user.id, role_key: roleKey },
    }).catch((e) => console.warn("[notify] admin role grant", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, user_id: user.id, role_key: roleKey });
  }

  if (action === "revoke") {
    const grantId = String(body.grant_id || "");
    const userId = String(body.user_id || "");
    const roleKey = String(body.role_key || "");
    let revokedIds: string[] = [];
    if (grantId) {
      const revoked = await q<{ id: string }>(
        `UPDATE admin_user_roles SET revoked_at=now(), revoked_by=$2 WHERE id=$1 AND revoked_at IS NULL RETURNING id`,
        [grantId, admin.userId]
      );
      revokedIds = revoked.map((row) => row.id);
    } else if (userId && roleKey) {
      const revoked = await q<{ id: string }>(
        `UPDATE admin_user_roles ur SET revoked_at=now(), revoked_by=$3
           FROM admin_roles r
          WHERE ur.role_id=r.id AND ur.user_id=$1 AND r.key=$2 AND ur.revoked_at IS NULL
          RETURNING ur.id`,
        [userId, roleKey, admin.userId]
      );
      revokedIds = revoked.map((row) => row.id);
    } else {
      return NextResponse.json({ ok: false, error: "grant_id or user_id+role_key required" }, { status: 400 });
    }
    await writeAdminAudit({
      actor: admin,
      action: "admin.iam.roles.revoke",
      targetType: "user",
      targetId: userId || null,
      payload: { grant_id: grantId || null, role_key: roleKey || null },
      ip,
      userAgent: ua,
    });
    if (revokedIds.length) await enqueueNotification({
      eventType: "admin_role_changed", severity: "critical", audienceKind: "admin",
      audienceRoles: ["superadmin"], requiredPermission: "admin.iam.roles.revoke",
      dedupeKey: `admin-role-revoke:${revokedIds.sort().join(",")}`,
      targetUrl: "/admin/iam", payload: { change: "revoke", target_user_id: userId || null, role_key: roleKey || null, grant_id: grantId || null },
    }).catch((e) => console.warn("[notify] admin role revoke", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true });
  }

  if (action === "invite") {
    const email = String(body.email || "").trim().toLowerCase();
    const roleKey = String(body.role_key || "support").trim();
    if (!email) return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });
    const role = await q1<{ id: string }>(`SELECT id FROM admin_roles WHERE key=$1`, [roleKey]);
    if (!role) return NextResponse.json({ ok: false, error: "role_not_found" }, { status: 404 });
    const raw = randomBytes(24).toString("hex");
    const token_hash = hashToken(raw);
    await q1(
      `INSERT INTO admin_invitations(email, role_id, token_hash, invited_by, expires_at)
       VALUES ($1,$2,$3,$4, now() + interval '72 hours')`,
      [email, role.id, token_hash, admin.userId]
    );
    await writeAdminAudit({
      actor: admin,
      action: "admin.iam.invite",
      targetType: "invitation",
      payload: { email, role_key: roleKey },
      ip,
      userAgent: ua,
    });
    return NextResponse.json({
      ok: true,
      email,
      role_key: roleKey,
      accept_path: `/admin/iam?accept=${raw}`,
      token: raw,
      expires_hours: 72,
    });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
