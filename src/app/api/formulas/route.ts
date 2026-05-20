import { NextResponse } from "next/server";
import { q } from "@/lib/db";

/** Public · GET /api/formulas?module=... · ดูสูตรทั้งหมด */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const moduleFilter = url.searchParams.get("module");
  const status = url.searchParams.get("status");
  const conditions: string[] = ["is_active = TRUE"];
  const params: unknown[] = [];
  let i = 1;
  if (moduleFilter) { conditions.push(`module=$${i++}`); params.push(moduleFilter); }
  if (status) { conditions.push(`status=$${i++}`); params.push(status); }
  const rows = await q(
    `SELECT id, code, module, category, classical_source,
            title_en, title_th, title_zh,
            summary_en, summary_th, summary_zh,
            status, verified_by, verified_at
     FROM ref_formulas WHERE ${conditions.join(" AND ")}
     ORDER BY module, code`,
    params
  );
  const modCounts = await q<{ module: string; c: number }>(
    `SELECT module, COUNT(*)::int AS c FROM ref_formulas WHERE is_active=TRUE GROUP BY module ORDER BY module`
  );
  return NextResponse.json({ ok: true, count: rows.length, modules: modCounts, rows });
}
