/**
 * formula_code → output extractor from load-profile.ts result
 * ใช้ใน /api/formulas/[code]/test
 */
export const FORMULA_OUTPUT_MAP: Record<string, (real: Record<string, unknown>) => unknown> = {
  // ─────── DM Strength ───────
  compute_dm_strength: (r) => ({
    percent: (r.DM as Record<string, unknown>)?.strengthPercent,
    level: (r.DM as Record<string, unknown>)?.level,
    detail: r.DM_STRENGTH_DETAIL,
  }),
  level_from_percent: (r) => ({
    percent: (r.DM as Record<string, unknown>)?.strengthPercent,
    level: (r.DM as Record<string, unknown>)?.level,
  }),

  // ─────── Yongshen ───────
  derive_yongshen: (r) => ({ yongshen: r.YONGSHEN, ji: r.JI }),
  bridge_yongshen: (r) => ({ yongshen: r.YONGSHEN }),

  // ─────── Ten Gods ───────
  derive_ten_gods: (r) => r.TEN_GODS_REAL,

  // ─────── Luck pillars ───────
  calc_luck_pillars: (r) => ({
    pillars: r.LUCK_PILLARS,
    current: r.CURRENT_LP,
    age: r.CURRENT_AGE,
    start: r.LUCK_START,
  }),

  // ─────── Solar BaZi ───────
  calc_year_pillar: (r) => ((r.PILLARS as Record<string, Record<string, string>>)?.year),
  calc_month_pillar: (r) => ((r.PILLARS as Record<string, Record<string, string>>)?.month),
  calc_day_pillar: (r) => ((r.PILLARS as Record<string, Record<string, string>>)?.day),
  calc_hour_pillar: (r) => ((r.PILLARS as Record<string, Record<string, string>>)?.hour),
  true_solar_time_correction: (r) => r.TST_INFO,

  // ─────── Element / Climate ───────
  detect_climate: (r) => ({ climate: r.CLIMATE, elements: r.ELEMENTS_DIST }),

  // ─────── Ge Ju ───────
  infer_ge_ju: (r) => r.GE_JU,

  // ─────── Interactions ───────
  detect_san_he: (r) => {
    const arr = (r.INTERACTIONS_REAL as Array<{ type: string; pattern?: string }> | undefined) || [];
    return arr.filter((x) => x.type === "sanHe" || x.pattern?.includes?.("三合"));
  },
  detect_six_destructions: (r) => r.SIX_DEST_FOUND || r.SIX_DEST,
  detect_clash_liu_chong: (r) => {
    const arr = (r.INTERACTIONS_REAL as Array<{ type: string; pattern?: string }> | undefined) || [];
    return arr.filter((x) => x.type === "clash" || x.pattern?.includes?.("沖"));
  },

  // ─────── Void ───────
  detect_kong_wang: (r) => ({ kong_wang: r.KONG_WANG, yang_pillar: r.KONG_WANG_YP }),

  // ─────── 12 phases ───────
  compute_12_qi_phases: (r) => r.QI_PHASES,

  // ─────── Na Yin ───────
  calc_na_yin: (r) => r.NA_YIN,

  // ─────── Palaces ───────
  compute_life_palace: (r) => r.LIFE_PALACE,
  compute_conception_palace: (r) => r.CONCEPTION_PALACE,
  compute_life_star_gua: (r) => r.LIFE_STAR_GUA,
  compute_8_directions_gua: (r) => r.EIGHT_DIRECTIONS_GUA,

  // ─────── Stem combos ───────
  is_stem_he: (r) => r.STEM_COMBOS_REAL,

  // ─────── Personal stars ───────
  detect_personal_stars: (r) => r.PERSONAL_STARS_READING,

  // ─────── Star activation ───────
  activate_annual_stars_by_transit: (r) => r.ANNUAL_STARS_REAL,

  // ─────── Symbolic stars ───────
  star_tian_yi_nobleman: (r) => {
    const arr = (r.SHEN_SHA_FULL as Array<{ code: string }> | undefined) || [];
    return arr.filter((x) => x.code === "tianYi" || x.code === "noble");
  },
  star_peach_blossom: (r) => {
    const arr = (r.SHEN_SHA_FULL as Array<{ code: string }> | undefined) || [];
    return arr.filter((x) => x.code === "taoHua" || x.code === "peach");
  },
  star_sky_horse: (r) => {
    const arr = (r.SHEN_SHA_FULL as Array<{ code: string }> | undefined) || [];
    return arr.filter((x) => x.code === "yiMa");
  },
  star_wen_chang: (r) => {
    const arr = (r.SHEN_SHA_FULL as Array<{ code: string }> | undefined) || [];
    return arr.filter((x) => x.code === "wenChang");
  },
  star_general: (r) => {
    const arr = (r.SHEN_SHA_FULL as Array<{ code: string }> | undefined) || [];
    return arr.filter((x) => x.code === "jiangXing");
  },
  star_yang_ren: (r) => {
    const arr = (r.SHEN_SHA_FULL as Array<{ code: string }> | undefined) || [];
    return arr.filter((x) => x.code === "yangRen");
  },

  // ─────── Fan Yin / Fu Yin ───────
  detect_fan_yin_fu_yin: (r) => r.FAN_YIN_FU_YIN,

  // ─────── Border case ───────
  border_case_check: (r) => r.BORDER_CASE,

  // ─────── Today verdict ───────
  compute_today_verdict: (r) => r.TODAY,

  // ─────── Tongshu ───────
  tongshu_yi_ji: (r) => r.TONGSHU_TODAY,

  // ─────── QiMen ───────
  qimen_chart_cast: (r) => r.QIMEN_DATA,
  qimen_get_ju_yang_yin: (r) => {
    const data = r.QIMEN_DATA as Record<string, unknown> | undefined;
    return data ? { dun: data.dun, ju: data.ju } : null;
  },
  qimen_place_earth_plate: (r) => {
    const data = r.QIMEN_DATA as Record<string, unknown> | undefined;
    return data?.chart || data?.palaces;
  },

  // ─────── Storage ───────
  detect_storage_tomb: (r) => r.STORAGE_DATA,

  // ─────── Archetype ───────
  detect_archetype_25: (r) => r.ARCHETYPE,
};

export const PRESET_PROFILES = [
  { id: "d6b43c87-3b7d-44a3-aa01-ed144c224caa", name: "Aeaw / ไนท์", born: "1984-12-31 06:15" },
  { id: "a86f0991-ccd0-4cb5-8842-0edd9a861b58", name: "ใหม่ / Mai", born: "1986-04-07 17:04" },
];
