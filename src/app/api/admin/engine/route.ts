import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q } from "@/lib/db";

/**
 * GET /api/admin/engine
 *   ?module=dm_strength · filter by module
 * Returns rows grouped by module + group_name
 */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const url = new URL(req.url);
  const moduleFilter = url.searchParams.get("module");
  const where = moduleFilter ? `WHERE module = $1` : "";
  const params = moduleFilter ? [moduleFilter] : [];

  const rows = await q<Record<string, unknown>>(
    `SELECT id, module, group_name, param_key, param_value, param_type,
            min_value, max_value, default_value,
            description_en, description_th, description_zh,
            is_active, version, updated_at
     FROM ref_engine_configs ${where}
     ORDER BY module, group_name, param_key`,
    params
  );

  // Group
  const grouped: Record<string, Record<string, Record<string, unknown>[]>> = {};
  for (const r of rows) {
    const m = String(r.module);
    const g = String(r.group_name);
    grouped[m] ??= {};
    grouped[m][g] ??= [];
    grouped[m][g].push(r);
  }

  const modules = await q<{ module: string; c: number }>(
    `SELECT module, COUNT(*)::int AS c FROM ref_engine_configs GROUP BY module ORDER BY module`
  );

  return NextResponse.json({ ok: true, modules, grouped, total: rows.length });
}
