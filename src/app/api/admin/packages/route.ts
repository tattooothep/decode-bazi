import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";
import { listPackagesPublic } from "@/lib/payment/packages";
import { writeAdminAudit } from "@/lib/admin-audit";
import { clientIp } from "@/lib/rate-limit";

/**
 * หลังบ้าน · แพ็คเกจ + คูปอง (admin only)
 * GET  /api/admin/packages              → { packages, coupons }
 * POST { action, ... }
 *   action=save_package   {id?, code, name_th, name_en?, name_zh?, kind, price_thb, yam, bonus_yam, duration_days?, grants_tier?, sort, badge?, active}
 *   action=delete_package {id}
 *   action=save_coupon    {id?, code, kind, value, max_uses?, expires_at?, active}
 *   action=delete_coupon  {id}
 */
export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

export async function GET() {
  try { await requirePermission("admin.packages.read"); } catch (e) { return guard(e); }
  const packages = listPackagesPublic().map((p, sort) => ({
    code: p.code,
    name_th: p.name.th,
    name_en: p.name.en,
    name_zh: p.name.zh,
    kind: p.kind,
    price_thb: p.price_thb,
    yam: p.hours,
    bonus_yam: 0,
    duration_days: p.days,
    grants_tier: p.tier,
    sort,
    badge: null,
    active: true,
  }));
  const coupons = await q(`SELECT * FROM coupons ORDER BY created_at DESC`);
  return NextResponse.json({ ok: true, packages, coupons, packageSource: "server_config" });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(b.action || "");

  if (action === "save_package" || action === "delete_package") {
    try { await requirePermission("admin.packages.write"); } catch (e) { return guard(e); }
    return NextResponse.json({ ok: false, error: "packages_are_managed_in_server_config" }, { status: 409 });
  }

  if (action === "save_coupon") {
    let admin;
    try { admin = await requirePermission("admin.coupons.write"); } catch (e) { return guard(e); }
    const code = String(b.code || "").trim().toUpperCase();
    if (!code) return NextResponse.json({ ok: false, error: "code required" }, { status: 400 });
    const kind = ["bonus_yam", "percent_off", "fixed_off"].includes(String(b.kind)) ? String(b.kind) : "bonus_yam";
    const value = Math.max(0, Math.trunc(Number(b.value) || 0));
    const max_uses = b.max_uses ? Math.trunc(Number(b.max_uses)) : null;
    const expires_at = b.expires_at ? String(b.expires_at) : null;
    const active = b.active !== false;
    if (b.id) {
      await q1(`UPDATE coupons SET code=$2,kind=$3,value=$4,max_uses=$5,expires_at=$6,active=$7 WHERE id=$1`,
        [b.id, code, kind, value, max_uses, expires_at, active]);
      await writeAdminAudit({ actor: admin, action: "admin.coupons.write", targetType: "coupon", targetId: String(b.id), payload: { code, kind, value, max_uses, expires_at, active }, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
      return NextResponse.json({ ok: true, id: b.id });
    }
    const row = await q1<{ id: string }>(
      `INSERT INTO coupons(code,kind,value,max_uses,expires_at,active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [code, kind, value, max_uses, expires_at, active]);
    await writeAdminAudit({ actor: admin, action: "admin.coupons.write", targetType: "coupon", targetId: row?.id || null, payload: { code, kind, value, max_uses, expires_at, active }, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
    return NextResponse.json({ ok: true, id: row?.id });
  }

  if (action === "delete_coupon") {
    let admin;
    try { admin = await requirePermission("admin.coupons.write"); } catch (e) { return guard(e); }
    if (!b.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    await q1(`DELETE FROM coupons WHERE id=$1`, [b.id]);
    await writeAdminAudit({ actor: admin, action: "admin.coupons.write", targetType: "coupon", targetId: String(b.id), payload: { deleted: true }, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
    return NextResponse.json({ ok: true });
  }

  try { await requirePermission("admin.dashboard.read"); } catch (e) { return guard(e); }
  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
