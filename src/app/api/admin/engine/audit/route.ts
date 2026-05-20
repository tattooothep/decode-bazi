import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const url = new URL(req.url);
  const moduleFilter = url.searchParams.get("module");
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (moduleFilter) { conditions.push(`module=$${i++}`); params.push(moduleFilter); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await q(
    `SELECT id, config_id, module, group_name, param_key, old_value, new_value, changed_by, changed_at, source, reason
     FROM audit_engine_log ${where} ORDER BY changed_at DESC LIMIT 200`,
    params
  );
  return NextResponse.json({ ok: true, count: rows.length, entries: rows });
}
