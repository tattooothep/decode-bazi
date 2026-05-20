import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    value?: unknown;
    reasoning_en?: string | null;
    reasoning_th?: string | null;
    reasoning_zh?: string | null;
    source?: string;
    reason?: string;
  };
  const newValue = body.value;
  const reasoning_en = body.reasoning_en;
  const reasoning_th = body.reasoning_th;
  const reasoning_zh = body.reasoning_zh;
  const source = body.source || "manual";

  // Fetch row + validate
  const row = await q1<Record<string, unknown>>(
    `SELECT * FROM ref_engine_configs WHERE id=$1`,
    [id]
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Validate against min/max if number
  if (newValue !== undefined && row.param_type === "number" && typeof newValue === "number") {
    if (row.min_value != null && newValue < Number(row.min_value)) {
      return NextResponse.json({ error: `value below min (${row.min_value})` }, { status: 400 });
    }
    if (row.max_value != null && newValue > Number(row.max_value)) {
      return NextResponse.json({ error: `value above max (${row.max_value})` }, { status: 400 });
    }
  }

  const oldVal = row.param_value;
  const oldReason_en = (row.reasoning_en as string) || null;
  const oldReason_th = (row.reasoning_th as string) || null;
  const oldReason_zh = (row.reasoning_zh as string) || null;

  const setParts: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  let valueChanged = false;
  let reasoningChanged = false;

  if (newValue !== undefined && JSON.stringify(newValue) !== JSON.stringify(oldVal)) {
    setParts.push(`param_value=$${i++}::jsonb`);
    params.push(JSON.stringify(newValue));
    valueChanged = true;
  }
  if (reasoning_en !== undefined && reasoning_en !== oldReason_en) {
    setParts.push(`reasoning_en=$${i++}`);
    params.push(reasoning_en);
    reasoningChanged = true;
  }
  if (reasoning_th !== undefined && reasoning_th !== oldReason_th) {
    setParts.push(`reasoning_th=$${i++}`);
    params.push(reasoning_th);
    reasoningChanged = true;
  }
  if (reasoning_zh !== undefined && reasoning_zh !== oldReason_zh) {
    setParts.push(`reasoning_zh=$${i++}`);
    params.push(reasoning_zh);
    reasoningChanged = true;
  }
  if (setParts.length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }
  setParts.push(`updated_at=NOW()`);
  setParts.push(`last_changed_by=$${i++}`);
  params.push(admin.email);
  setParts.push(`last_changed_at=NOW()`);
  params.push(id);
  await q(`UPDATE ref_engine_configs SET ${setParts.join(", ")} WHERE id=$${i}`, params);

  // Audit
  await q(
    `INSERT INTO audit_engine_log (config_id, module, group_name, param_key, old_value, new_value, changed_by, source, reason, old_reasoning_th, new_reasoning_th) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)`,
    [
      id,
      row.module,
      row.group_name,
      row.param_key,
      JSON.stringify(oldVal),
      JSON.stringify(valueChanged ? newValue : oldVal),
      admin.email,
      source,
      body.reason || null,
      oldReason_th,
      reasoning_th !== undefined ? reasoning_th : oldReason_th,
    ]
  );

  return NextResponse.json({
    ok: true,
    id,
    value_changed: valueChanged,
    reasoning_changed: reasoningChanged,
    old: oldVal,
    new: valueChanged ? newValue : oldVal,
  });
}

/**
 * POST /api/admin/engine/[id]?action=revert
 * Revert to default_value
 */
export async function POST(req: Request, ctx: Ctx) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  if (action !== "revert") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const row = await q1<Record<string, unknown>>(
    `SELECT * FROM ref_engine_configs WHERE id=$1`,
    [id]
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const oldVal = row.param_value;
  const defVal = row.default_value;
  if (JSON.stringify(oldVal) === JSON.stringify(defVal)) {
    return NextResponse.json({ ok: true, unchanged: true });
  }
  await q(`UPDATE ref_engine_configs SET param_value=default_value, updated_at=NOW() WHERE id=$1`, [id]);
  await q(
    `INSERT INTO audit_engine_log (config_id, module, group_name, param_key, old_value, new_value, changed_by, source, reason) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,'revert','Reverted to default')`,
    [id, row.module, row.group_name, row.param_key, JSON.stringify(oldVal), JSON.stringify(defVal), admin.email]
  );
  return NextResponse.json({ ok: true, reverted: true });
}
