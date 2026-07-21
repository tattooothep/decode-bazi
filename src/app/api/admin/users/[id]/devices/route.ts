import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { writeAdminAudit } from "@/lib/admin-audit";
import { q, q1 } from "@/lib/db";
import { bumpSessionVersion } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

/** GET devices for user · POST revoke_device | revoke_all_sessions */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { await requirePermission("admin.users.read"); } catch (e) { return guard(e); }
  const { id } = await ctx.params;
  const devices = await q(
    `SELECT id, device_hash, ua, ip_hash, first_seen, last_seen
       FROM user_devices WHERE user_id=$1 ORDER BY last_seen DESC LIMIT 50`,
    [id]
  );
  const sv = await q1<{ session_version: number }>(`SELECT session_version FROM users WHERE id=$1`, [id]);
  return NextResponse.json({
    ok: true,
    devices,
    session_version: sv?.session_version ?? 0,
    note: "revoke_all_sessions bumps session_version · JWT with old sv stop working",
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let admin;
  try { admin = await requirePermission("admin.users.suspend"); } catch (e) { return guard(e); }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "");

  if (action === "revoke_device") {
    const deviceId = String(body.device_id || "");
    if (!deviceId) return NextResponse.json({ ok: false, error: "device_id required" }, { status: 400 });
    await q1(`DELETE FROM user_devices WHERE id=$1 AND user_id=$2`, [deviceId, id]);
    await writeAdminAudit({
      actor: admin,
      action: "admin.users.device.revoke",
      targetType: "user",
      targetId: id,
      payload: { device_id: deviceId },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "revoke_all_sessions") {
    const sv = await bumpSessionVersion(id);
    await writeAdminAudit({
      actor: admin,
      action: "admin.users.sessions.revoke_all",
      targetType: "user",
      targetId: id,
      payload: { session_version: sv },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, session_version: sv });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
