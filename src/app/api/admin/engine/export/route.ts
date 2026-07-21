import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { q } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requirePermission("admin.engine.read");
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const url = new URL(req.url);
  const moduleFilter = url.searchParams.get("module");
  const where = moduleFilter ? `WHERE module=$1` : "";
  const params = moduleFilter ? [moduleFilter] : [];
  const rows = await q(
    `SELECT id, module, group_name, param_key, param_value, param_type, min_value, max_value, default_value,
            description_en, description_th, description_zh,
            reasoning_en, reasoning_th, reasoning_zh
     FROM ref_engine_configs ${where}
     ORDER BY module, group_name, param_key`,
    params
  );
  return NextResponse.json({
    exported_at: new Date().toISOString(),
    module: moduleFilter,
    count: rows.length,
    rows,
  });
}
