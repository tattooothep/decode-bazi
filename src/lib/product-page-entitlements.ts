/**
 * Hourkey entitlement contract v3.
 *
 * This file is intentionally pure: API routes and browser payloads both consume
 * the same plan matrix through product-entitlement.ts.
 */
export type ProductPlan = "free" | "trial" | "premium" | "master";

export const PRODUCT_CONTRACT_VERSION = "entitlements-v3-20260711";
export const FREE_SIGNUP_YAM = 1000;
export const TRIAL_DAYS = 14;

export type ProductPageEntitlements = {
  chart: { detail: "summary" | "guided" | "full" | "technical"; luck_cycles: "current" | "current_next" | "all" | "technical"; ai_summary_pdf: boolean };
  today: { day_window: number; detailed_hours: number; directions: number; goals: "one" | "all" | "technical"; multi_profile: boolean };
  calendar: { month_window: number; intents: "one" | "all"; ranked_days: number; full_hours_directions: boolean; multi_profile: boolean; pdf: boolean };
  network: { saved_profiles: number; visualization_profiles: number; groups: number; group_people: number; pair_compare: "locked" | "once" | "full"; team_analysis: boolean; team_people: number; pair_ai: "locked" | "once" | "full"; team_ai: boolean; bulk_ai: boolean };
  fusion: { enabled: boolean; max_sciences: number; max_profiles: number };
  book: { max_sciences: number; synthesis: boolean };
  qimen: { time_window_days: number; hours_per_day: number; detail: "basic" | "beginner" | "pro" | "technical"; search_days: number; search_results: number; compare_locations: boolean; sifu: boolean };
  forecast: { methods: 3; full_result: true; history: true; evidence: true; ai_uses_yam: true };
  sifu: { answer: "full"; other_profile_contexts: number; pair_context: boolean; group_context_people: number; model_choice: boolean; ai_uses_yam: true };
  datepick: { modules: number; range_days: number; results: number; people: number; sifu: boolean };
  fengshui: { houses: number; layers: "basic" | "trial" | "full" | "professional"; multi_profile: boolean };
  luopan: { mode: "core" | "pro" | "full"; pins: "basic" | "full"; vision: boolean; vision_limit: number; vision_period: "none" | "trial_total" | "day"; sifu: boolean };
  palmistry: { full_analysis: true; history: true; pdf: true; ai_uses_yam: true };
};

const sameForecast = { methods: 3, full_result: true, history: true, evidence: true, ai_uses_yam: true } as const;
const samePalmistry = { full_analysis: true, history: true, pdf: true, ai_uses_yam: true } as const;

export const PRODUCT_PAGE_ENTITLEMENTS: Record<ProductPlan, ProductPageEntitlements> = {
  free: {
    chart: { detail: "summary", luck_cycles: "current", ai_summary_pdf: false },
    today: { day_window: 0, detailed_hours: 12, directions: 8, goals: "all", multi_profile: false },
    calendar: { month_window: 0, intents: "one", ranked_days: 1, full_hours_directions: false, multi_profile: false, pdf: false },
    network: { saved_profiles: 1, visualization_profiles: 1, groups: 0, group_people: 0, pair_compare: "locked", team_analysis: false, team_people: 0, pair_ai: "locked", team_ai: false, bulk_ai: false },
    fusion: { enabled: true, max_sciences: 2, max_profiles: 1 },
    book: { max_sciences: 0, synthesis: false },
    qimen: { time_window_days: 0, hours_per_day: 1, detail: "basic", search_days: 0, search_results: 0, compare_locations: false, sifu: false },
    forecast: sameForecast,
    sifu: { answer: "full", other_profile_contexts: 1, pair_context: false, group_context_people: 0, model_choice: false, ai_uses_yam: true },
    datepick: { modules: 3, range_days: 30, results: 10, people: 1, sifu: false },
    fengshui: { houses: 0, layers: "basic", multi_profile: false },
    luopan: { mode: "core", pins: "basic", vision: false, vision_limit: 0, vision_period: "none", sifu: false },
    palmistry: samePalmistry,
  },
  trial: {
    chart: { detail: "guided", luck_cycles: "current_next", ai_summary_pdf: true },
    today: { day_window: 1, detailed_hours: 12, directions: 8, goals: "all", multi_profile: false },
    calendar: { month_window: 2, intents: "all", ranked_days: 3, full_hours_directions: false, multi_profile: false, pdf: true },
    network: { saved_profiles: 3, visualization_profiles: 3, groups: 1, group_people: 3, pair_compare: "once", team_analysis: false, team_people: 0, pair_ai: "once", team_ai: false, bulk_ai: false },
    fusion: { enabled: true, max_sciences: 3, max_profiles: 1 },
    book: { max_sciences: 2, synthesis: false },
    qimen: { time_window_days: 0, hours_per_day: 12, detail: "beginner", search_days: 0, search_results: 0, compare_locations: false, sifu: false },
    forecast: sameForecast,
    sifu: { answer: "full", other_profile_contexts: 3, pair_context: false, group_context_people: 0, model_choice: false, ai_uses_yam: true },
    datepick: { modules: 6, range_days: 45, results: 20, people: 1, sifu: false },
    fengshui: { houses: 3, layers: "trial", multi_profile: false },
    luopan: { mode: "core", pins: "basic", vision: true, vision_limit: 1, vision_period: "trial_total", sifu: false },
    palmistry: samePalmistry,
  },
  premium: {
    chart: { detail: "full", luck_cycles: "all", ai_summary_pdf: true },
    today: { day_window: 30, detailed_hours: 12, directions: 8, goals: "all", multi_profile: false },
    calendar: { month_window: 12, intents: "all", ranked_days: 50, full_hours_directions: true, multi_profile: false, pdf: true },
    network: { saved_profiles: 10, visualization_profiles: 10, groups: 4, group_people: 10, pair_compare: "full", team_analysis: false, team_people: 0, pair_ai: "full", team_ai: false, bulk_ai: false },
    fusion: { enabled: true, max_sciences: 4, max_profiles: 1 },
    book: { max_sciences: 3, synthesis: false },
    qimen: { time_window_days: 90, hours_per_day: 12, detail: "pro", search_days: 7, search_results: 10, compare_locations: false, sifu: true },
    forecast: sameForecast,
    sifu: { answer: "full", other_profile_contexts: 10, pair_context: true, group_context_people: 0, model_choice: false, ai_uses_yam: true },
    datepick: { modules: 20, range_days: 90, results: 50, people: 3, sifu: true },
    fengshui: { houses: 50, layers: "full", multi_profile: false },
    luopan: { mode: "pro", pins: "full", vision: true, vision_limit: 10, vision_period: "day", sifu: true },
    palmistry: samePalmistry,
  },
  master: {
    chart: { detail: "technical", luck_cycles: "technical", ai_summary_pdf: true },
    today: { day_window: 365, detailed_hours: 12, directions: 8, goals: "technical", multi_profile: true },
    calendar: { month_window: 60, intents: "all", ranked_days: 100, full_hours_directions: true, multi_profile: true, pdf: true },
    network: { saved_profiles: 100, visualization_profiles: 30, groups: 20, group_people: 30, pair_compare: "full", team_analysis: true, team_people: 12, pair_ai: "full", team_ai: true, bulk_ai: true },
    fusion: { enabled: true, max_sciences: 6, max_profiles: 8 },
    book: { max_sciences: 6, synthesis: true },
    qimen: { time_window_days: 365, hours_per_day: 12, detail: "technical", search_days: 30, search_results: 30, compare_locations: true, sifu: true },
    forecast: sameForecast,
    sifu: { answer: "full", other_profile_contexts: 100, pair_context: true, group_context_people: 12, model_choice: true, ai_uses_yam: true },
    datepick: { modules: 20, range_days: 365, results: 100, people: 10, sifu: true },
    fengshui: { houses: 999, layers: "professional", multi_profile: true },
    luopan: { mode: "full", pins: "full", vision: true, vision_limit: 10, vision_period: "day", sifu: true },
    palmistry: samePalmistry,
  },
};
