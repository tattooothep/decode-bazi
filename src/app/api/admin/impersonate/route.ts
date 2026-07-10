import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { writeAdminAudit } from "@/lib/admin-audit";
import { q1 } from "@/lib/db";
import { signSession, setAuthCookie, readSessionVersion, getSession } from "@/lib/auth";
import { checkAccountUsable } from "@/lib/account-status";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

const MAX_MINUTES = 30;

/**
 * POST start { user_id, reason, minutes? } · end { }
 * Time-boxed view-as · stores impActorId in JWT · cannot impersonate admins.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "start");

  if (action === "end") {
    const s = await getSession();
    if (!s?.impActorId) return NextResponse.json({ ok: false, error: "not_impersonating" }, { status: 400 });
    const actor = await q1<{ id: string; email: string; current_org_id: string | null }>(
      `SELECT id, email, current_org_id FROM users WHERE id=$1`,
      [s.impActorId]
    );
    if (!actor) return NextResponse.json({ ok: false, error: "actor_missing" }, { status: 400 });
    const sv = await readSessionVersion(actor.id);
    const token = await signSession({
      userId: actor.id,
      email: actor.email,
      orgId: actor.current_org_id,
      sv,
    });
    await setAuthCookie(token);
    return NextResponse.json({ ok: true, restored: actor.email });
  }

  let admin;
  try { admin = await requirePermission("admin.users.impersonate"); } catch (e) { return guard(e); }

  const targetId = String(body.user_id || body.id || "");
  const reason = String(body.reason || "").trim().slice(0, 300);
  if (!targetId || !reason) {
    return NextResponse.json({ ok: false, error: "user_id and reason required" }, { status: 400 });
  }
  if (targetId === admin.userId) {
    return NextResponse.json({ ok: false, error: "cannot_impersonate_self" }, { status: 400 });
  }

  const gate = await checkAccountUsable(targetId);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.reason }, { status: 400 });

  // block impersonating platform admins
  const minutes = Math.min(MAX_MINUTES, Math.max(5, Math.trunc(Number(body.minutes) || 15)));
  const target = await q1<{ id: string; email: string; current_org_id: string | null }>(
    `SELECT id, email, current_org_id FROM users WHERE id=$1`,
    [targetId]
  );
  if (!target) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const targetAdmin = await q1(
    `SELECT 1 FROM admin_user_roles ur
      WHERE ur.user_id=$1 AND ur.revoked_at IS NULL LIMIT 1`,
    [targetId]
  );
  const envEmails = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map((e) => e.trim()).filter(Boolean);
  if (targetAdmin || envEmails.includes(target.email.toLowerCase())) {
    return NextResponse.json({ ok: false, error: "cannot_impersonate_admin" }, { status: 403 });
  }

  const sv = await readSessionVersion(target.id);
  const token = await signSession({
    userId: target.id,
    email: target.email,
    orgId: target.current_org_id,
    sv,
    impActorId: admin.userId,
  });
  await setAuthCookie(token);

  await writeAdminAudit({
    actor: admin,
    action: "admin.users.impersonate",
    targetType: "user",
    targetId,
    payload: { minutes, reason, ends_approx: new Date(Date.now() + minutes * 60_000).toISOString() },
    reason,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  // Best-effort session table if exists
  await q1(
    `INSERT INTO admin_impersonation_sessions(actor_user_id, target_user_id, reason, ends_at, ip_address, user_agent)
     VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval, $5, $6)`,
    [admin.userId, targetId, reason, String(minutes), clientIp(req), req.headers.get("user-agent")]
  ).catch(() => null);

  return NextResponse.json({
    ok: true,
    as: target.email,
    minutes,
    note: "Call POST action=end to restore admin session. Banner should show on product UI.",
  });
}
