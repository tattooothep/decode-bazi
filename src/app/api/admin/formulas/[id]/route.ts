import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const EDITABLE = new Set([
  "title_en","title_th","title_zh",
  "summary_en","summary_th","summary_zh",
  "steps_en","steps_th","steps_zh",
  "pseudo_code","math_formula",
  "references_en","references_th","references_zh",
  "classical_source","category","module",
  "inputs","outputs","related_configs",
  "verification_notes","status",
]);

export async function GET(_req: Request, ctx: Ctx) {
  try { await requirePermission("admin.formulas.read"); } catch (e) { return e instanceof Response ? e : NextResponse.json({error:'auth'},{status:401}); }
  const { id } = await ctx.params;
  const row = await q1(`SELECT * FROM ref_formulas WHERE id=$1`, [id]);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, row });
}

export async function PUT(req: Request, ctx: Ctx) {
  let admin;
  try { admin = await requirePermission("admin.formulas.write"); } catch (e) { return e instanceof Response ? e : NextResponse.json({error:'auth'},{status:401}); }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> & { source?: string };
  const source = body.source || "manual";
  const old = await q1<Record<string, unknown>>(`SELECT * FROM ref_formulas WHERE id=$1`, [id]);
  if (!old) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sets: string[] = [];
  const params: unknown[] = [];
  const audits: Array<{ field: string; oldV: unknown; newV: unknown }> = [];
  let i = 1;
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE.has(k)) continue;
    if (JSON.stringify(v) === JSON.stringify(old[k])) continue;
    const jsonbCols = new Set(["inputs", "outputs", "related_configs"]);
    if (jsonbCols.has(k)) {
      sets.push(`"${k}"=$${i++}::jsonb`);
      params.push(JSON.stringify(v));
    } else {
      sets.push(`"${k}"=$${i++}`);
      params.push(v);
    }
    audits.push({ field: k, oldV: old[k], newV: v });
  }
  if (sets.length === 0) return NextResponse.json({ ok: true, unchanged: true });
  sets.push(`updated_at=NOW()`, `updated_by=$${i++}`);
  params.push(admin.email);
  params.push(id);
  await q(`UPDATE ref_formulas SET ${sets.join(", ")} WHERE id=$${i}`, params);
  for (const a of audits) {
    await q(
      `INSERT INTO audit_formula_log (formula_id, field_name, old_value, new_value, changed_by, source) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, a.field, a.oldV == null ? null : typeof a.oldV === "object" ? JSON.stringify(a.oldV) : String(a.oldV), a.newV == null ? null : typeof a.newV === "object" ? JSON.stringify(a.newV) : String(a.newV), admin.email, source]
    );
  }
  return NextResponse.json({ ok: true, fields: audits.map(a => a.field) });
}

/** POST ?action=verify | dispute */
export async function POST(req: Request, ctx: Ctx) {
  let admin;
  try { admin = await requirePermission("admin.formulas.write"); } catch (e) { return e instanceof Response ? e : NextResponse.json({error:'auth'},{status:401}); }
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const body = await req.json().catch(() => ({}));
  const notes = (body as { notes?: string }).notes || null;

  if (!["verify","dispute","draft"].includes(action || "")) {
    return NextResponse.json({ error: "action ต้องเป็น verify/dispute/draft" }, { status: 400 });
  }
  const newStatus = action === "verify" ? "verified" : action === "dispute" ? "disputed" : "draft";
  const old = await q1<Record<string, unknown>>(`SELECT status, verified_by, verification_notes FROM ref_formulas WHERE id=$1`, [id]);
  if (!old) return NextResponse.json({ error: "not found" }, { status: 404 });

  await q(
    `UPDATE ref_formulas SET status=$1, verified_by=$2, verified_at=NOW(), verification_notes=$3, updated_at=NOW() WHERE id=$4`,
    [newStatus, admin.email, notes, id]
  );
  await q(
    `INSERT INTO audit_formula_log (formula_id, field_name, old_value, new_value, changed_by, source) VALUES ($1,'status',$2,$3,$4,$5)`,
    [id, String(old.status || ""), newStatus, admin.email, `action:${action}`]
  );
  return NextResponse.json({ ok: true, status: newStatus });
}
