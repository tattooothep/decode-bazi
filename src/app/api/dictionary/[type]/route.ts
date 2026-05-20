import { NextResponse } from "next/server";
import { TYPES } from "@/lib/paraphrase-types";
import { q } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/dictionary-cache";

export async function GET(req: Request, ctx: { params: Promise<{ type: string }> }) {
  const { type } = await ctx.params;
  const def = TYPES[type];
  if (!def) return NextResponse.json({ error: "unknown type" }, { status: 404 });

  const url = new URL(req.url);
  const lang = (url.searchParams.get("lang") || "th").toLowerCase();
  const q_ = (url.searchParams.get("q") || "").trim();

  const cacheKey = `dict:list:${type}:${lang}:${q_}`;
  const hit = cacheGet<unknown>(cacheKey);
  if (hit) return NextResponse.json(hit);

  const titleField = `title_${lang}`;
  const altLangs = ["th", "en", "zh"].filter((l) => l !== lang);
  const selectCols = [
    def.pkColumn,
    ...(def.fixedColumns?.map((f) => f.key) || []),
    ...["title_en", "title_th", "title_zh"].filter((c, i, arr) => arr.indexOf(c) === i),
  ];
  // Some tables don't have title_en/th/zh (e.g. star uses name_en/th/chinese)
  // Best effort: include columns that actually exist in the listColumns or fields
  const validCols = Array.from(
    new Set([
      def.pkColumn,
      ...(def.fixedColumns?.map((f) => f.key) || []),
      ...def.listColumns,
      "title_en",
      "title_th",
      "title_zh",
    ])
  );
  // Filter out columns that don't exist in table schema by querying once
  // To keep it simple: try all, ignore non-existing via try/catch fallback
  let rows: Array<Record<string, unknown>> = [];
  try {
    const colList = validCols.map((c) => `"${c}"`).join(",");
    if (q_) {
      // ILIKE search on any title_* or list columns that are text-like
      rows = await q<Record<string, unknown>>(
        `SELECT ${colList} FROM ${def.table}
         WHERE (
           ${["title_en", "title_th", "title_zh"]
             .map((c) => `COALESCE("${c}",'') ILIKE $1`)
             .join(" OR ")}
         )
         ORDER BY ${def.pkColumn}
         LIMIT 500`,
        [`%${q_}%`]
      );
    } else {
      rows = await q<Record<string, unknown>>(
        `SELECT ${colList} FROM ${def.table} ORDER BY ${def.pkColumn} LIMIT 1000`
      );
    }
  } catch {
    // Retry with only known-safe columns
    const safe = [def.pkColumn, ...(def.fixedColumns?.map((f) => f.key) || [])];
    const colList = safe.map((c) => `"${c}"`).join(",");
    rows = await q<Record<string, unknown>>(
      `SELECT ${colList} FROM ${def.table} ORDER BY ${def.pkColumn} LIMIT 1000`
    );
  }

  void titleField; void altLangs; void selectCols;
  const out = {
    ok: true,
    type,
    section: def.section,
    lang,
    query: q_ || null,
    rows,
    count: rows.length,
  };
  cacheSet(cacheKey, out);
  return NextResponse.json(out);
}
