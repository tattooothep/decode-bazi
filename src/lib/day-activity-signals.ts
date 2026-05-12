// Day Activity Signal Aggregator · §11
// อ่าน source: bazi-calc + wrappers/shared.js + sesheta-v6/decode-stars-detector.js
//             + sesheta-v8/decode-interaction-detector.js
// Output: 16 fields ใน JSON เดียวให้ rule engine consume
// Status: staging/debug · ไม่มี wording · ไม่ recommend activity จนกว่าจะมี formula ซินแส

import type { BaziPillars, BirthInput } from "./bazi-calc";

const SIX_CLASH: Record<string, string> = {
  子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅",
  卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳",
};

const SIX_HARM: Record<string, string> = {
  子: "未", 未: "子", 丑: "午", 午: "丑", 寅: "巳", 巳: "寅",
  卯: "辰", 辰: "卯", 申: "亥", 亥: "申", 酉: "戌", 戌: "酉",
};

const STEM_ELEMENT: Record<string, string> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};

const BRANCH_ELEMENT: Record<string, string> = {
  子: "water", 亥: "water", 寅: "wood", 卯: "wood", 巳: "fire", 午: "fire",
  申: "metal", 酉: "metal", 辰: "earth", 戌: "earth", 丑: "earth", 未: "earth",
};

const HIDDEN_STEMS: Record<string, { main: string; middle: string | null; residual: string | null }> = {
  子: { main: "癸", middle: null, residual: null },
  丑: { main: "己", middle: "癸", residual: "辛" },
  寅: { main: "甲", middle: "丙", residual: "戊" },
  卯: { main: "乙", middle: null, residual: null },
  辰: { main: "戊", middle: "乙", residual: "癸" },
  巳: { main: "丙", middle: "戊", residual: "庚" },
  午: { main: "丁", middle: "己", residual: null },
  未: { main: "己", middle: "丁", residual: "乙" },
  申: { main: "庚", middle: "壬", residual: "戊" },
  酉: { main: "辛", middle: null, residual: null },
  戌: { main: "戊", middle: "辛", residual: "丁" },
  亥: { main: "壬", middle: "甲", residual: null },
};

export type DayActivitySignals = {
  day_branch: string;
  hour_branch: string;
  day_master: string;
  qi_phase: string | null;
  wen_chang_active: boolean;
  tian_yi_active: boolean;
  yi_ma_active: boolean;
  wealth_star_visible: boolean;
  wealth_is_yongshen: boolean;
  wealth_is_jishen: boolean;
  bi_jie_or_jie_cai_active: boolean;
  liu_chong_day: boolean;
  xing_day: boolean;
  hai_day: boolean;
  kong_wang_hour: boolean;
  yongshen_status: "present_hour" | "absent_hour";
  jishen_status: "present_hour" | "absent_hour";
};

export type SignalTrace = {
  field: keyof DayActivitySignals;
  source: string;
  detail?: string;
};

export type SignalOutput = {
  signals: DayActivitySignals;
  source_trace: SignalTrace[];
  missing_or_partial: string[];
  confidence: "high" | "medium" | "low";
  blockers: string[];
  meta: {
    pillars: BaziPillars;
    target_hour_branch_override?: string;
    useful_god_elements: string[];
    jishen_elements: string[];
  };
};

type StarsResult = {
  tian_yi_nobleman: string[];
  wen_chang: string[];
  yi_ma: string[];
  kong_wang: string[];
};

function checkUngratefulPunishment(branches: string[]): string[] | null {
  const set = ["寅", "巳", "申"];
  const present = set.filter((b) => branches.includes(b));
  return present.length >= 2 ? present : null;
}

function checkEarthPunishment(branches: string[]): string[] | null {
  const set = ["丑", "戌", "未"];
  const present = set.filter((b) => branches.includes(b));
  return present.length >= 2 ? present : null;
}

function checkSelfPunishment(branches: string[]): string[] | null {
  const selfSet = ["辰", "午", "酉", "亥"];
  const dup = selfSet.filter((b) => branches.filter((x) => x === b).length >= 2);
  return dup.length > 0 ? dup : null;
}

function checkLiMaoPunishment(branches: string[]): boolean {
  return branches.includes("子") && branches.includes("卯");
}

// dayMaster → useful god 5 stems (top-3 = primary yongshen)
const USEFUL_GOD_RANKS: Record<string, string[]> = {
  甲: ["甲", "乙", "庚", "壬", "癸"],
  乙: ["甲", "乙", "辛", "壬", "癸"],
  丙: ["丙", "丁", "甲", "乙", "壬"],
  丁: ["甲", "乙", "丙", "丁", "癸"],
  戊: ["己", "戊", "丙", "丁", "甲"],
  己: ["乙", "戊", "己", "丙", "丁"],
  庚: ["丙", "戊", "己", "辛", "庚"],
  辛: ["庚", "辛", "戊", "己", "丁"],
  壬: ["庚", "辛", "壬", "癸", "戊"],
  癸: ["庚", "辛", "壬", "癸", "己"],
};

const ELEMENT_CONTROLS: Record<string, string> = {
  wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood",
};

function tenGodCategory(dayMaster: string, targetStem: string): "companion" | "wealth" | "officer" | "output" | "resource" | "unknown" {
  const dmEl = STEM_ELEMENT[dayMaster];
  const tEl = STEM_ELEMENT[targetStem];
  if (!dmEl || !tEl) return "unknown";
  if (dmEl === tEl) return "companion";
  if (ELEMENT_CONTROLS[dmEl] === tEl) return "wealth";
  if (ELEMENT_CONTROLS[tEl] === dmEl) return "officer";
  const PRODUCES: Record<string, string> = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };
  if (PRODUCES[dmEl] === tEl) return "output";
  if (PRODUCES[tEl] === dmEl) return "resource";
  return "unknown";
}

export async function computeDayActivitySignals(input: {
  date: string;
  time: string;
  longitude?: number;
  gender?: "M" | "F";
  target_hour_branch?: string;
}): Promise<SignalOutput> {
  const { calcBazi } = await import("./bazi-calc");
  const sharedMod = await import("../../data/library/wrappers/shared.js");
  const starsMod = await import("../../data/sesheta-v6/decode-stars-detector.js");

  const shared = (sharedMod as unknown as { default?: typeof sharedMod }).default ?? sharedMod;
  const stars = (starsMod as unknown as { default?: typeof starsMod }).default ?? starsMod;

  const calc = await calcBazi({
    date: input.date,
    time: input.time,
    longitude: typeof input.longitude === "number" ? input.longitude : 100.5018,
    gmtOffsetHours: 7,
    gender: input.gender,
  } as BirthInput);

  const pillars = calc.pillars;
  const overrideHour = input.target_hour_branch;

  const effectivePillars: BaziPillars = overrideHour
    ? { ...pillars, hour: { stem: pillars.hour.stem, branch: overrideHour } }
    : pillars;

  const day_master = effectivePillars.day.stem;
  const day_branch = effectivePillars.day.branch;
  const hour_branch = effectivePillars.hour.branch;

  const twelvePhase = (shared as { twelvePhase: (stem: string, branch: string) => string | null }).twelvePhase;
  const qi_phase = twelvePhase(day_master, hour_branch);

  const detectAllStars = (stars as { detectAllStars: (p: BaziPillars) => StarsResult }).detectAllStars;
  const starPos: StarsResult = detectAllStars(effectivePillars);
  const wen_chang_active = starPos.wen_chang.includes("hour");
  const tian_yi_active = starPos.tian_yi_nobleman.includes("hour");
  const yi_ma_active = starPos.yi_ma.includes("hour");
  const kong_wang_hour = starPos.kong_wang.includes("hour");

  const allStems: string[] = [
    effectivePillars.year.stem,
    effectivePillars.month.stem,
    effectivePillars.day.stem,
    effectivePillars.hour.stem,
  ];
  const allBranches = [
    effectivePillars.year.branch,
    effectivePillars.month.branch,
    effectivePillars.day.branch,
    effectivePillars.hour.branch,
  ];
  const hiddenStems: string[] = [];
  for (const b of allBranches) {
    const h = HIDDEN_STEMS[b];
    if (!h) continue;
    if (h.main) hiddenStems.push(h.main);
    if (h.middle) hiddenStems.push(h.middle);
    if (h.residual) hiddenStems.push(h.residual);
  }
  const visibleStems = [...allStems, ...hiddenStems];

  const wealth_star_visible = visibleStems.some(
    (s) => s !== day_master && tenGodCategory(day_master, s) === "wealth"
  );
  const bi_jie_or_jie_cai_active = visibleStems.some(
    (s) => s !== day_master && tenGodCategory(day_master, s) === "companion"
  );

  const ugRanks = USEFUL_GOD_RANKS[day_master] || [];
  const usefulGodElements = Array.from(new Set(ugRanks.slice(0, 3).map((s) => STEM_ELEMENT[s])));
  const allElements = ["wood", "fire", "earth", "metal", "water"];
  const jishenElements = allElements.filter((e) => !usefulGodElements.includes(e));

  const wealthElement = ELEMENT_CONTROLS[STEM_ELEMENT[day_master]];
  const wealth_is_yongshen = usefulGodElements.includes(wealthElement);
  const wealth_is_jishen = jishenElements.includes(wealthElement);

  const liu_chong_day = SIX_CLASH[day_branch] === hour_branch;
  const hai_day = SIX_HARM[day_branch] === hour_branch;

  const xing_branches = allBranches;
  const xing_day =
    !!checkUngratefulPunishment(xing_branches) ||
    !!checkEarthPunishment(xing_branches) ||
    !!checkSelfPunishment(xing_branches) ||
    checkLiMaoPunishment(xing_branches);

  const hourElement = BRANCH_ELEMENT[hour_branch];
  const yongshen_status: "present_hour" | "absent_hour" =
    usefulGodElements.includes(hourElement) ? "present_hour" : "absent_hour";
  const jishen_status: "present_hour" | "absent_hour" =
    jishenElements.includes(hourElement) ? "present_hour" : "absent_hour";

  const signals: DayActivitySignals = {
    day_branch,
    hour_branch,
    day_master,
    qi_phase,
    wen_chang_active,
    tian_yi_active,
    yi_ma_active,
    wealth_star_visible,
    wealth_is_yongshen,
    wealth_is_jishen,
    bi_jie_or_jie_cai_active,
    liu_chong_day,
    xing_day,
    hai_day,
    kong_wang_hour,
    yongshen_status,
    jishen_status,
  };

  const source_trace: SignalTrace[] = [
    { field: "day_branch", source: "src/lib/bazi-calc.ts:calcBazi() → pillars.day.branch" },
    { field: "hour_branch", source: "src/lib/bazi-calc.ts:calcBazi() → pillars.hour.branch", detail: overrideHour ? `overridden to ${overrideHour}` : "from chart" },
    { field: "day_master", source: "pillars.day.stem" },
    { field: "qi_phase", source: "data/library/wrappers/shared.js:twelvePhase(day_master, hour_branch)" },
    { field: "wen_chang_active", source: "data/sesheta-v6/decode-stars-detector.js:detectWenChang() · hour pos" },
    { field: "tian_yi_active", source: "data/sesheta-v6/decode-stars-detector.js:detectTianYiNobleman() · hour pos" },
    { field: "yi_ma_active", source: "data/sesheta-v6/decode-stars-detector.js:detectYiMa() · hour pos" },
    { field: "kong_wang_hour", source: "data/sesheta-v6/decode-stars-detector.js:detectKongWang() · hour pos" },
    { field: "wealth_star_visible", source: "tenGod() applied to all 4 pillar stems + hidden stems · category=wealth" },
    { field: "wealth_is_yongshen", source: "wealth element ∈ top-3 USEFUL_GOD_RANKS[day_master]" },
    { field: "wealth_is_jishen", source: "wealth element ∉ top-3 USEFUL_GOD_RANKS[day_master] (jishen set)" },
    { field: "bi_jie_or_jie_cai_active", source: "tenGod() category=companion in 4 pillars + hidden stems" },
    { field: "liu_chong_day", source: "SIX_CLASH[day_branch] === hour_branch" },
    { field: "xing_day", source: "checkUngratefulPunishment + checkEarthPunishment + checkSelfPunishment + checkLiMaoPunishment over 4 branches" },
    { field: "hai_day", source: "SIX_HARM[day_branch] === hour_branch" },
    { field: "yongshen_status", source: "BRANCH_ELEMENT[hour_branch] ∈ usefulGodElements" },
    { field: "jishen_status", source: "BRANCH_ELEMENT[hour_branch] ∈ jishenElements" },
  ];

  const missing_or_partial: string[] = [];
  const blockers: string[] = [
    "missing_sinsae_formula: rule mapping signals → activity (P0-002)",
    "wealth strength score not computed (using top-3 USEFUL_GOD_RANKS approximation)",
    "bi_jie strength threshold not defined (using visibility only)",
  ];
  if (qi_phase === null) {
    missing_or_partial.push("qi_phase null (day_master ไม่อยู่ใน STEM_ANCHOR)");
  }

  return {
    signals,
    source_trace,
    missing_or_partial,
    confidence: missing_or_partial.length === 0 ? "medium" : "low",
    blockers,
    meta: {
      pillars: effectivePillars,
      target_hour_branch_override: overrideHour,
      useful_god_elements: usefulGodElements,
      jishen_elements: jishenElements,
    },
  };
}
