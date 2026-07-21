/**
 * GET /api/houses/:id    · ดึง house · บันทึก last_used_at
 * PATCH /api/houses/:id  · update (partial)
 * DELETE /api/houses/:id · ลบ
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { entitlementDenied, getProductAccess } from "@/lib/product-entitlement";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { id } = await params;
  const row = await q1(
    `SELECT * FROM ka_houses WHERE id=$1 AND user_id=$2`,
    [id, s.userId]
  );
  if (!row) return NextResponse.json({ error: 'House not found' }, { status: 404 });
  await q(`UPDATE ka_houses SET last_used_at = NOW() WHERE id = $1`, [id]);
  return NextResponse.json({ house: row });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => ({} as any));
  if (Array.isArray(b.family_members)) {
    const access = await getProductAccess(s.userId);
    const familyLimit = access?.pages.fengshui.multi_profile ? 30 : 1;
    if (b.family_members.length > familyLimit) {
      return NextResponse.json(
        entitlementDenied("fengshui_multi_profile_locked", {
          plan: access?.plan || "free",
          requested: b.family_members.length,
          max: familyLimit,
        }),
        { status: 403 }
      );
    }
  }
  // allowed fields
  const allow = ['name','note','is_primary','lat','lng','address','face_angle','sit_angle',
                 'facing_mountain','facing_direction','method','floor_plan_url','family_members'];
  const sets: string[] = []; const values: any[] = [];
  for (const k of allow) {
    if (b[k] !== undefined) {
      values.push(k === 'family_members' ? JSON.stringify(b[k]) : b[k]);
      sets.push(`${k} = $${values.length}${k === 'family_members' ? '::jsonb' : ''}`);
    }
  }
  if (!sets.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  if (b.is_primary === true) {
    await q(`UPDATE ka_houses SET is_primary = false WHERE user_id = $1`, [s.userId]);
  }
  values.push(id, s.userId);
  const sql = `UPDATE ka_houses SET ${sets.join(', ')} WHERE id = $${values.length-1} AND user_id = $${values.length} RETURNING *`;
  const row = await q1(sql, values);
  if (!row) return NextResponse.json({ error: 'House not found' }, { status: 404 });
  return NextResponse.json({ house: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { id } = await params;
  const row = await q1<{ id: number }>(
    `DELETE FROM ka_houses WHERE id=$1 AND user_id=$2 RETURNING id`,
    [id, s.userId]
  );
  if (!row) return NextResponse.json({ error: 'House not found' }, { status: 404 });
  return NextResponse.json({ ok: true, id: row.id });
}
