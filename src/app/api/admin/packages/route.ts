import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";

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
  try { await requireAdmin(); } catch (e) { return guard(e); }
  const packages = await q(`SELECT * FROM packages ORDER BY sort, price_thb`);
  const coupons = await q(`SELECT * FROM coupons ORDER BY created_at DESC`);
  return NextResponse.json({ ok: true, packages, coupons });
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e) { return guard(e); }
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(b.action || "");

  if (action === "save_package") {
    const code = String(b.code || "").trim();
    const name_th = String(b.name_th || "").trim();
    if (!code || !name_th) return NextResponse.json({ ok: false, error: "code+name_th required" }, { status: 400 });
    const vals = {
      code, name_th,
      name_en: String(b.name_en || "") || null,
      name_zh: String(b.name_zh || "") || null,
      kind: ["topup", "subscription"].includes(String(b.kind)) ? String(b.kind) : "topup",
      price_thb: Math.max(0, Math.trunc(Number(b.price_thb) || 0)),
      yam: Math.max(0, Math.trunc(Number(b.yam) || 0)),
      bonus_yam: Math.max(0, Math.trunc(Number(b.bonus_yam) || 0)),
      duration_days: b.duration_days ? Math.trunc(Number(b.duration_days)) : null,
      grants_tier: String(b.grants_tier || "") || null,
      sort: Math.trunc(Number(b.sort) || 0),
      badge: String(b.badge || "") || null,
      active: b.active !== false,
    };
    if (b.id) {
      const row = await q1<{ id: string }>(
        `UPDATE packages SET code=$2,name_th=$3,name_en=$4,name_zh=$5,kind=$6,price_thb=$7,yam=$8,
           bonus_yam=$9,duration_days=$10,grants_tier=$11,sort=$12,badge=$13,active=$14,updated_at=now()
         WHERE id=$1 RETURNING id`,
        [b.id, vals.code, vals.name_th, vals.name_en, vals.name_zh, vals.kind, vals.price_thb, vals.yam, vals.bonus_yam, vals.duration_days, vals.grants_tier, vals.sort, vals.badge, vals.active]);
      return NextResponse.json({ ok: true, id: row?.id });
    }
    const row = await q1<{ id: string }>(
      `INSERT INTO packages(code,name_th,name_en,name_zh,kind,price_thb,yam,bonus_yam,duration_days,grants_tier,sort,badge,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [vals.code, vals.name_th, vals.name_en, vals.name_zh, vals.kind, vals.price_thb, vals.yam, vals.bonus_yam, vals.duration_days, vals.grants_tier, vals.sort, vals.badge, vals.active]).catch((e) => { throw e; });
    return NextResponse.json({ ok: true, id: row?.id });
  }

  if (action === "delete_package") {
    if (!b.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    await q1(`DELETE FROM packages WHERE id=$1`, [b.id]);
    return NextResponse.json({ ok: true });
  }

  if (action === "save_coupon") {
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
      return NextResponse.json({ ok: true, id: b.id });
    }
    const row = await q1<{ id: string }>(
      `INSERT INTO coupons(code,kind,value,max_uses,expires_at,active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [code, kind, value, max_uses, expires_at, active]);
    return NextResponse.json({ ok: true, id: row?.id });
  }

  if (action === "delete_coupon") {
    if (!b.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    await q1(`DELETE FROM coupons WHERE id=$1`, [b.id]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
