import { NextResponse } from "next/server";
import { TYPES, expandFields } from "@/lib/paraphrase-types";
import { q1 } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/dictionary-cache";

export async function GET(_req: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await ctx.params;
  const def = TYPES[type];
  if (!def) return NextResponse.json({ error: "unknown type" }, { status: 404 });

  const k = `dict:entry:${type}:${id}`;
  const hit = cacheGet<unknown>(k);
  if (hit) return NextResponse.json(hit);

  const cols = Array.from(
    new Set([def.pkColumn, ...(def.fixedColumns?.map((f) => f.key) || []), ...expandFields(def.fields)])
  ).map((c) => `"${c}"`).join(",");

  let where = `"${def.pkColumn}"=$1`;
  let params: unknown[] = [id];
  if (def.type === "star_reading") {
    const m = id.split("__");
    if (m.length === 2) {
      where = `"star_id"=$1 AND "pillar_position"=$2`;
      params = [m[0], m[1]];
    }
  }

  const row = await q1(`SELECT ${cols} FROM ${def.table} WHERE ${where} LIMIT 1`, params);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const out = {
    ok: true,
    type,
    section: def.section,
    id,
    fields: def.fields,
    fixedColumns: def.fixedColumns || [],
    row,
  };
  cacheSet(k, out);
  return NextResponse.json(out);
}
