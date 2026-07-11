import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";

/**
 * POST /api/admin/engine/import
 * body: { rows: [{ id, param_value?, reasoning_en?, reasoning_th?, reasoning_zh? }, ...], source? }
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requirePermission("admin.engine.write");
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    rows?: Array<Record<string, unknown>>;
    source?: string;
  };
  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "expect { rows: [...] }" }, { status: 400 });
  }
  const source = body.source || "import-json";
  const result = { scanned: 0, updated: 0, fields_changed: 0, errors: [] as string[] };

  for (const row of body.rows) {
    result.scanned++;
    const id = row.id;
    if (id == null) {
      result.errors.push("row missing id");
      continue;
    }
    const old = await q1<Record<string, unknown>>(
      `SELECT * FROM ref_engine_configs WHERE id=$1`,
      [id]
    );
    if (!old) {
      result.errors.push(`id ${id} not found`);
      continue;
    }
    // Validate value
    if (row.param_value !== undefined && old.param_type === "number" && typeof row.param_value === "number") {
      if (old.min_value != null && row.param_value < Number(old.min_value)) {
        result.errors.push(`id ${id}: value below min (${old.min_value})`);
        continue;
      }
      if (old.max_value != null && row.param_value > Number(old.max_value)) {
        result.errors.push(`id ${id}: value above max (${old.max_value})`);
        continue;
      }
    }

    const setParts: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    let valueChanged = false;
    let reasoningChanged = false;
    const oldVal = old.param_value;
    const oldR_th = (old.reasoning_th as string) || null;

    if (row.param_value !== undefined && JSON.stringify(row.param_value) !== JSON.stringify(oldVal)) {
      setParts.push(`param_value=$${i++}::jsonb`);
      params.push(JSON.stringify(row.param_value));
      valueChanged = true;
    }
    for (const k of ["reasoning_en", "reasoning_th", "reasoning_zh"]) {
      if (row[k] !== undefined && row[k] !== (old as Record<string, unknown>)[k]) {
        setParts.push(`${k}=$${i++}`);
        params.push(row[k]);
        reasoningChanged = true;
      }
    }
    if (setParts.length === 0) continue;
    setParts.push(`updated_at=NOW()`, `last_changed_by=$${i++}`, `last_changed_at=NOW()`);
    params.push(admin.email);
    params.push(id);
    try {
      await q(`UPDATE ref_engine_configs SET ${setParts.join(", ")} WHERE id=$${i}`, params);
      result.updated++;
      result.fields_changed += (valueChanged ? 1 : 0) + (reasoningChanged ? 1 : 0);
      await q(
        `INSERT INTO audit_engine_log (config_id, module, group_name, param_key, old_value, new_value, changed_by, source, reason, old_reasoning_th, new_reasoning_th) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)`,
        [
          id,
          old.module,
          old.group_name,
          old.param_key,
          JSON.stringify(oldVal),
          JSON.stringify(valueChanged ? row.param_value : oldVal),
          admin.email,
          source,
          "import-json",
          oldR_th,
          (row.reasoning_th as string | null) ?? oldR_th,
        ]
      );
    } catch (err) {
      result.errors.push(`id ${id}: ${String(err).slice(0, 150)}`);
    }
  }
  return NextResponse.json({ ok: true, ...result });
}
