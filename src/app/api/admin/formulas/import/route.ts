import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";

const EDITABLE = new Set([
  "title_en","title_th","title_zh","summary_en","summary_th","summary_zh",
  "steps_en","steps_th","steps_zh","pseudo_code","math_formula",
  "references_en","references_th","references_zh",
  "classical_source","category","inputs","outputs","related_configs","verification_notes",
]);
const JSONB_COLS = new Set(["inputs","outputs","related_configs"]);

export async function POST(req: Request) {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return e instanceof Response ? e : NextResponse.json({error:'auth'},{status:401}); }
  const body = (await req.json().catch(() => ({}))) as { rows?: Array<Record<string, unknown>>; source?: string };
  if (!Array.isArray(body.rows)) return NextResponse.json({ error: "expect { rows: [...] }" }, { status: 400 });
  const source = body.source || "import-json";
  const result = { scanned: 0, updated: 0, fields_changed: 0, errors: [] as string[] };

  for (const row of body.rows) {
    result.scanned++;
    const id = row.id;
    if (!id) { result.errors.push("missing id"); continue; }
    const old = await q1<Record<string, unknown>>(`SELECT * FROM ref_formulas WHERE id=$1`, [id]);
    if (!old) { result.errors.push(`id ${id} not found`); continue; }
    const sets: string[] = []; const params: unknown[] = []; let i = 1;
    const audits: Array<{ k: string; o: unknown; n: unknown }> = [];
    for (const [k, v] of Object.entries(row)) {
      if (!EDITABLE.has(k)) continue;
      if (JSON.stringify(v) === JSON.stringify(old[k])) continue;
      if (JSONB_COLS.has(k)) {
        sets.push(`"${k}"=$${i++}::jsonb`); params.push(JSON.stringify(v));
      } else {
        sets.push(`"${k}"=$${i++}`); params.push(v);
      }
      audits.push({ k, o: old[k], n: v });
    }
    if (sets.length === 0) continue;
    sets.push(`updated_at=NOW()`, `updated_by=$${i++}`);
    params.push(admin.email); params.push(id);
    try {
      await q(`UPDATE ref_formulas SET ${sets.join(", ")} WHERE id=$${i}`, params);
      result.updated++; result.fields_changed += audits.length;
      for (const a of audits) {
        await q(
          `INSERT INTO audit_formula_log (formula_id, field_name, old_value, new_value, changed_by, source) VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, a.k, a.o == null ? null : typeof a.o === "object" ? JSON.stringify(a.o) : String(a.o), a.n == null ? null : typeof a.n === "object" ? JSON.stringify(a.n) : String(a.n), admin.email, source]
        );
      }
    } catch (e) {
      result.errors.push(`id ${id}: ${String(e).slice(0, 100)}`);
    }
  }
  return NextResponse.json({ ok: true, ...result });
}
