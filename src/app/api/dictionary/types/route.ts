import { NextResponse } from "next/server";
import { TYPES } from "@/lib/paraphrase-types";
import { q } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/dictionary-cache";

export async function GET() {
  const k = "dict:types";
  const hit = cacheGet<unknown>(k);
  if (hit) return NextResponse.json(hit);

  const counts = await q<{ table: string; c: string }>(
    `SELECT 'ref_archetypes_25' AS table, COUNT(*)::text AS c FROM ref_archetypes_25
     UNION ALL SELECT 'ref_structures_18', COUNT(*)::text FROM ref_structures_18
     UNION ALL SELECT 'ref_strengths', COUNT(*)::text FROM ref_strengths
     UNION ALL SELECT 'ref_personal_stars', COUNT(*)::text FROM ref_personal_stars
     UNION ALL SELECT 'ref_star_pillar_readings', COUNT(*)::text FROM ref_star_pillar_readings
     UNION ALL SELECT 'ref_yongshen_ranks', COUNT(*)::text FROM ref_yongshen_ranks
     UNION ALL SELECT 'ref_interactions_9', COUNT(*)::text FROM ref_interactions_9
     UNION ALL SELECT 'ref_ten_gods', COUNT(*)::text FROM ref_ten_gods
     UNION ALL SELECT 'ref_qi_phases', COUNT(*)::text FROM ref_qi_phases
     UNION ALL SELECT 'ref_symbolic_stars_62', COUNT(*)::text FROM ref_symbolic_stars_62
     UNION ALL SELECT 'ref_five_structure_types', COUNT(*)::text FROM ref_five_structure_types
     UNION ALL SELECT 'ref_ten_profiles', COUNT(*)::text FROM ref_ten_profiles
     UNION ALL SELECT 'ref_stem_combos', COUNT(*)::text FROM ref_stem_combos
     UNION ALL SELECT 'ref_chart_overview_39', COUNT(*)::text FROM ref_chart_overview_39
     UNION ALL SELECT 'ref_tongshu_terms', COUNT(*)::text FROM ref_tongshu_terms
     UNION ALL SELECT 'ref_jia_zi_60', COUNT(*)::text FROM ref_jia_zi_60
     UNION ALL SELECT 'ref_root_tou_gan', COUNT(*)::text FROM ref_root_tou_gan
     UNION ALL SELECT 'ref_storage_tomb', COUNT(*)::text FROM ref_storage_tomb
     UNION ALL SELECT 'ref_palace_readings', COUNT(*)::text FROM ref_palace_readings
     UNION ALL SELECT 'ref_life_palace_branches', COUNT(*)::text FROM ref_life_palace_branches
     UNION ALL SELECT 'ref_conception_pillars', COUNT(*)::text FROM ref_conception_pillars
     UNION ALL SELECT 'ref_life_star_gua', COUNT(*)::text FROM ref_life_star_gua
     UNION ALL SELECT 'ref_qimen_natal_palaces', COUNT(*)::text FROM ref_qimen_natal_palaces
     UNION ALL SELECT 'ref_qimen_palace_cells', COUNT(*)::text FROM ref_qimen_palace_cells
     UNION ALL SELECT 'ref_qimen_directions', COUNT(*)::text FROM ref_qimen_directions
     UNION ALL SELECT 'ref_annual_star_messages', COUNT(*)::text FROM ref_annual_star_messages
     UNION ALL SELECT 'ref_border_case_templates', COUNT(*)::text FROM ref_border_case_templates`
  );
  const tableCount: Record<string, number> = {};
  for (const r of counts) tableCount[r.table] = Number(r.c);

  const list = Object.values(TYPES).map((t) => ({
    type: t.type,
    section: t.section,
    count: tableCount[t.table] ?? 0,
  }));
  const out = {
    ok: true,
    types: list,
    total: list.reduce((s, x) => s + x.count, 0),
    cached_at: new Date().toISOString(),
  };
  cacheSet(k, out);
  return NextResponse.json(out);
}
