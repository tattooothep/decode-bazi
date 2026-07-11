import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { TYPES, expandFields } from "@/lib/paraphrase-types";
import { q } from "@/lib/db";

/**
 * GET /api/admin/paraphrase/export?type=archetype
 * Export full DB rows as JSON (เก็บ backup)
 */
export async function GET(req: Request) {
  try {
    await requirePermission("admin.paraphrase.read");
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  if (!type) {
    // Export all
    const all: Record<string, unknown[]> = {};
    for (const def of Object.values(TYPES)) {
      const cols = [def.pkColumn, ...(def.fixedColumns?.map((f) => f.key) || []), ...expandFields(def.fields)];
      const colList = Array.from(new Set(cols)).map((c) => `"${c}"`).join(",");
      all[def.type] = await q(`SELECT ${colList} FROM ${def.table} ORDER BY ${def.pkColumn}`);
    }
    return NextResponse.json({
      exported_at: new Date().toISOString(),
      types: all,
    });
  }
  const def = TYPES[type];
  if (!def) return NextResponse.json({ error: "unknown type" }, { status: 404 });
  const cols = [def.pkColumn, ...(def.fixedColumns?.map((f) => f.key) || []), ...expandFields(def.fields)];
  const colList = Array.from(new Set(cols)).map((c) => `"${c}"`).join(",");
  const rows = await q(`SELECT ${colList} FROM ${def.table} ORDER BY ${def.pkColumn}`);
  return NextResponse.json({ exported_at: new Date().toISOString(), type, rows });
}
