import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { q } from "@/lib/db";

export async function GET(req: Request) {
  try { await requirePermission("admin.formulas.read"); } catch (e) { return e instanceof Response ? e : NextResponse.json({error:'auth'},{status:401}); }
  const url = new URL(req.url);
  const moduleFilter = url.searchParams.get("module");
  const where = moduleFilter ? `WHERE module=$1` : "";
  const params = moduleFilter ? [moduleFilter] : [];
  const rows = await q(
    `SELECT * FROM ref_formulas ${where} ORDER BY module, code`,
    params
  );
  return NextResponse.json({ exported_at: new Date().toISOString(), count: rows.length, rows });
}
