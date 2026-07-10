import type { ProductPageEntitlements } from "@/lib/product-page-entitlements";
import type { ProductPlan } from "@/lib/product-entitlement";

type ChartCaps = ProductPageEntitlements["chart"];

const GUIDED_ANALYSIS_KEYS = [
  "ge_ju",
  "useful_god",
  "tiao_hou",
  "strength_yongshen",
  "hs_hhs",
  "matrix_summary",
  "element_counts",
  "ten_gods_map",
  "qi_phases",
  "interactions",
  "punishments",
  "combinations",
  "jishen",
  "today_overlay",
  "nayin",
  "kong_wang",
  "three_phases",
  "special_stars",
  "current_year_pillar",
  "voytek_strength",
  "functional_strength",
  "daymaster_profile",
  "element_distribution",
] as const;

const SUMMARY_ANALYSIS_KEYS = [
  "ge_ju",
  "strength_yongshen",
  "element_counts",
  "jishen",
  "today_overlay",
  "current_year_pillar",
  "daymaster_profile",
  "element_distribution",
] as const;

function pickKeys(source: Record<string, any>, keys: readonly string[]) {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

function publicYongshen(raw: any, detail: ChartCaps["detail"]) {
  if (!raw || detail === "full" || detail === "technical") return raw;
  const base = {
    structure_label: raw.structure_label,
    primary_yongshen: raw.primary_yongshen,
    xishen: raw.xishen,
    jishen: raw.jishen,
    confidence: raw.confidence,
    element_roles: raw.element_roles,
  };
  if (detail === "summary") return base;
  return {
    ...base,
    engine_type: raw.engine_type,
    diseases: raw.diseases,
    medicine: raw.medicine,
    bridges: raw.bridges,
    strategy: raw.strategy,
    tiaohou_required: raw.tiaohou_required,
  };
}

function luckIndexes(analysis: Record<string, any>, mode: ChartCaps["luck_cycles"]): number[] {
  const luck = Array.isArray(analysis.luck_pillars) ? analysis.luck_pillars : [];
  if (!luck.length) return [];
  if (mode === "all" || mode === "technical") return [...luck.keys()];
  const current = Math.max(0, Math.min(luck.length - 1, Number(analysis.current_luck_idx) || 0));
  return mode === "current_next" && current + 1 < luck.length ? [current, current + 1] : [current];
}

/** Keep the calculation engine untouched; only shape what crosses the HTTP boundary. */
export function shapeChartPayload(raw: unknown, plan: ProductPlan, caps: ChartCaps) {
  const payload = raw as Record<string, any>;
  const analysis = (payload.analysis || {}) as Record<string, any>;
  const indexes = luckIndexes(analysis, caps.luck_cycles);
  const allLuck = Array.isArray(analysis.luck_pillars) ? analysis.luck_pillars : [];
  const originalCurrent = Math.max(0, Math.min(Math.max(0, allLuck.length - 1), Number(analysis.current_luck_idx) || 0));
  const selectedLuck = indexes.map((index) => ({ ...allLuck[index], original_index: index }));
  const fullDetail = caps.detail === "full" || caps.detail === "technical";
  const baseAnalysis = fullDetail
    ? { ...analysis }
    : pickKeys(analysis, caps.detail === "guided" ? GUIDED_ANALYSIS_KEYS : SUMMARY_ANALYSIS_KEYS);

  const selectAligned = (value: unknown) => Array.isArray(value) ? indexes.map((index) => value[index]).filter(Boolean) : [];
  const shapedAnalysis = {
    ...baseAnalysis,
    luck_pillars: selectedLuck,
    current_luck_idx: selectedLuck.length ? Math.max(0, indexes.indexOf(originalCurrent)) : -1,
    luck_decade_drilldown: caps.detail === "summary" ? [] : selectAligned(analysis.luck_decade_drilldown),
    lp_natal_interactions: caps.detail === "summary" ? [] : selectAligned(analysis.lp_natal_interactions),
    liu_nian_timeline: fullDetail ? analysis.liu_nian_timeline : [],
  };

  const lockedSections = caps.detail === "summary"
    ? ["guided_chart", "full_chart", "technical_chart"]
    : caps.detail === "guided"
      ? ["full_chart", "technical_chart"]
      : caps.detail === "full"
        ? ["technical_chart"]
        : [];

  return {
    ...payload,
    analysis: shapedAnalysis,
    yongshen_v2: publicYongshen(payload.yongshen_v2, caps.detail),
    heluo_astrology: fullDetail ? payload.heluo_astrology : null,
    solar_terms_birth: fullDetail ? payload.solar_terms_birth : null,
    entitlement: {
      plan,
      ...caps,
      luck_total: allLuck.length,
      luck_visible: selectedLuck.length,
      locked_sections: lockedSections,
      technical_detail: caps.detail === "technical",
    },
  };
}
