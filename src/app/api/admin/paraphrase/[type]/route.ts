import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { TYPES } from "@/lib/paraphrase-types";
import { q } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ type: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const { type } = await ctx.params;
  const def = TYPES[type];
  if (!def) return NextResponse.json({ error: "unknown type" }, { status: 404 });

  const cols = def.listColumns.map((c) => `"${c}"`).join(",");
  const sql = `SELECT ${cols} FROM ${def.table} ORDER BY ${def.pkColumn}`;
  const rows = await q(sql);
  return NextResponse.json({ ok: true, type, table: def.table, section: def.section, rows });
}
