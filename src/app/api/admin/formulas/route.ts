import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q } from "@/lib/db";

export async function GET(req: Request) {
  try { await requireAdmin(); } catch (e) { return e instanceof Response ? e : NextResponse.json({error:'auth'},{status:401}); }
  const url = new URL(req.url);
  const moduleFilter = url.searchParams.get("module");
  const where = moduleFilter ? `WHERE module=$1` : "";
  const params = moduleFilter ? [moduleFilter] : [];
  const rows = await q(
    `SELECT id, code, module, category, classical_source,
            title_en, title_th, title_zh, status, verified_by, verified_at, updated_at
     FROM ref_formulas ${where} ORDER BY module, code`,
    params
  );
  const modCounts = await q(
    `SELECT module, COUNT(*)::int AS c FROM ref_formulas GROUP BY module ORDER BY module`
  );
  return NextResponse.json({ ok: true, count: rows.length, modules: modCounts, rows });
}
