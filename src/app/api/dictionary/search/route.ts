import { NextResponse } from "next/server";
import { TYPES } from "@/lib/paraphrase-types";
import { q } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/dictionary-cache";

/**
 * GET /api/dictionary/search?q=...&lang=th&limit=30
 * Cross-table search ทุก trilingual title fields
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q_ = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") || 30) || 30, 100);
  if (q_.length < 2) {
    return NextResponse.json({ ok: true, query: q_, results: [], note: "min 2 chars" });
  }

  const key = `dict:search:${q_}:${limit}`;
  const hit = cacheGet<unknown>(key);
  if (hit) return NextResponse.json(hit);

  const tableSpecs: Array<{ type: string; table: string; pk: string; titleCols: string[]; section: string }> = [
    { type: "archetype", table: "ref_archetypes_25", pk: "id", titleCols: ["title_en", "title_th", "title_zh"], section: "§15" },
    { type: "structure", table: "ref_structures_18", pk: "id", titleCols: ["title_en", "title_th", "title_zh", "title_chinese"], section: "§16" },
    { type: "strength", table: "ref_strengths", pk: "id", titleCols: ["label_en", "label_th", "label_zh"], section: "§1" },
    { type: "star", table: "ref_personal_stars", pk: "id", titleCols: ["name_en", "name_th", "name_chinese"], section: "§37" },
    { type: "ten_god", table: "ref_ten_gods", pk: "id", titleCols: ["decode_name_en", "decode_name_th", "decode_name_zh", "zh"], section: "§9" },
    { type: "qi_phase", table: "ref_qi_phases", pk: "id", titleCols: ["title_en", "title_th", "title_zh", "zh"], section: "§18" },
    { type: "symbolic_star", table: "ref_symbolic_stars_62", pk: "id", titleCols: ["title_en", "title_th", "title_zh", "zh"], section: "§20" },
    { type: "five_structure", table: "ref_five_structure_types", pk: "id", titleCols: ["title_en", "title_th", "title_zh"], section: "§28" },
    { type: "ten_profile", table: "ref_ten_profiles", pk: "id", titleCols: ["title_en", "title_th", "title_zh"], section: "§29" },
    { type: "chart_overview", table: "ref_chart_overview_39", pk: "id", titleCols: ["title_en", "title_th", "title_zh"], section: "§39" },
    { type: "tongshu", table: "ref_tongshu_terms", pk: "id", titleCols: ["title_en", "title_th", "title_zh", "zh"], section: "§14" },
    { type: "na_yin", table: "ref_jia_zi_60", pk: "id", titleCols: ["na_yin_chinese", "na_yin_english", "pillar"], section: "§17" },
    { type: "storage_tomb", table: "ref_storage_tomb", pk: "id", titleCols: ["title_en", "title_th", "title_zh"], section: "§22" },
    { type: "palace", table: "ref_palace_readings", pk: "id", titleCols: ["title_en", "title_th", "title_zh"], section: "§23" },
    { type: "life_palace", table: "ref_life_palace_branches", pk: "id", titleCols: ["title_en", "title_th", "title_zh"], section: "§24" },
    { type: "life_star_gua", table: "ref_life_star_gua", pk: "id", titleCols: ["title_en", "title_th", "title_zh", "gua_zh", "gua_en"], section: "§26" },
    { type: "qimen_palace", table: "ref_qimen_palace_cells", pk: "id", titleCols: ["title_en", "title_th", "title_zh"], section: "§31" },
    { type: "qimen_direction", table: "ref_qimen_directions", pk: "id", titleCols: ["title_en", "title_th", "title_zh"], section: "§32" },
    { type: "border_case", table: "ref_border_case_templates", pk: "id", titleCols: ["title_en", "title_th", "title_zh"], section: "§38" },
  ];

  const results: Array<{
    type: string;
    section: string;
    id: number | string;
    title: string;
    matched_col: string;
  }> = [];

  for (const spec of tableSpecs) {
    if (results.length >= limit) break;
    try {
      const where = spec.titleCols
        .map((c) => `COALESCE("${c}",'') ILIKE $1`)
        .join(" OR ");
      const cols = [spec.pk, ...spec.titleCols].map((c) => `"${c}"`).join(",");
      const rows = await q<Record<string, unknown>>(
        `SELECT ${cols} FROM ${spec.table} WHERE ${where} LIMIT ${Math.min(limit - results.length, 20)}`,
        [`%${q_}%`]
      );
      for (const r of rows) {
        // Pick the column that matched
        let matchedCol = spec.titleCols[0];
        let title = "";
        for (const c of spec.titleCols) {
          const v = String(r[c] ?? "");
          if (v.toLowerCase().includes(q_.toLowerCase())) {
            matchedCol = c;
            title = v;
            break;
          }
        }
        if (!title) title = String(r[spec.titleCols[0]] ?? "") || "—";
        results.push({
          type: spec.type,
          section: spec.section,
          id: r[spec.pk] as number,
          title,
          matched_col: matchedCol,
        });
      }
    } catch {
      // Skip table if column missing
    }
  }

  const out = { ok: true, query: q_, count: results.length, results };
  cacheSet(key, out);
  return NextResponse.json(out);
}
