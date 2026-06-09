/**
 * element-distribution-functional.ts · Phase 17g · 20 พ.ค. 2026
 *
 * Plan C v6 strict · sifu-corrected · Codex APPROVED
 *
 * ─── สูตร (numeric model = engine calibration · ไม่ใช่ตำราตัวเลขตรง) ───
 *
 * source_principles: 子平真詮 · 滴天髓 · 命理約言
 *
 * Visible stem (HS):
 *   contribution = STEM_BASE × STEM_POS[pos] × ROOT_CLS[class]
 *   STEM_BASE = 0.30
 *   STEM_POS: year 0.8 · month 1.1 · day 1.0 · hour 0.9
 *   ROOT_CLS (strict · ตำราเข้ม):
 *     same_main      1.00 (通根透干 เต็มไม่เกิน 1.0)
 *     same_middle    0.80 (半通根)
 *     same_residual  0.50 (微根)
 *     same_element   0.40 (同氣)
 *     floating       0.30 (虛浮)
 *
 * Hidden stems (VHS):
 *   contribution = QI_WEIGHT[qi] × pos_factor × branch_stability
 *   QI_WEIGHT: main 1.0 · middle 0.5 · residual 0.25 (本氣 > 中氣 > 餘氣 qualitative; 4:2:1 = engine calibration)
 *   pos_factor:
 *     month main      ×1.5 (司令 boost · 命理約言 月令旺氣)
 *     month middle    ×1.2 (餘氣 boost)
 *     month residual  ×1.0
 *     year   ×0.8 · day ×1.0 · hour ×0.9
 *
 * Branch stability (เดิม contest):
 *   六沖 → ×0.90 (light penalty · raw distribution)
 *   六害/三刑/破 → Phase 18 usable_score
 *
 * NO_GLOBAL_SEASON_ELEMENT_PENALTY_IN_DISTRIBUTION: true
 *   旺相休囚死 + 寒暖 → Phase 18 usable_score
 *
 * DM_STRENGTH:
 *   mode: "preliminary_distribution_based"
 *   ⚠ ห้ามใช้ตัดสิน 從格 / 化格 / 假從 — Phase 18 ทำ rule-based format detector แยก
 *
 * ─── ห้าม ───
 * - distribution_score ห้าม feed wrapper-7 yongshen decisions
 * - ห้าม tune scale บังคับ special structure เป็น strong/extreme
 */

export type Element = "wood" | "fire" | "earth" | "metal" | "water";
export type Pos = "year" | "month" | "day" | "hour";
export type Qi = "main" | "middle" | "residual";
export type RootClass = "same_main" | "same_middle" | "same_residual" | "same_element" | "floating";

export interface NatalPillar {
  stem: string;
  branch: string;
}
export interface Natal {
  year?: NatalPillar | null;
  month: NatalPillar;
  day: NatalPillar;
  hour?: NatalPillar | null;
}

const STEM_ELEMENT: Record<string, Element> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth",
  己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};

const HIDDEN: Record<string, Partial<Record<Qi, string>>> = {
  子: { main: "癸" },
  丑: { main: "己", middle: "癸", residual: "辛" },
  寅: { main: "甲", middle: "丙", residual: "戊" },
  卯: { main: "乙" },
  辰: { main: "戊", middle: "乙", residual: "癸" },
  巳: { main: "丙", middle: "庚", residual: "戊" },
  午: { main: "丁", middle: "己" },
  未: { main: "己", middle: "丁", residual: "乙" },
  申: { main: "庚", middle: "壬", residual: "戊" },
  酉: { main: "辛" },
  戌: { main: "戊", middle: "辛", residual: "丁" },
  亥: { main: "壬", middle: "甲" },
};

const QI_WEIGHT: Record<Qi, number> = { main: 1.0, middle: 0.5, residual: 0.25 };

const CLASH: Record<string, string> = {
  子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅",
  卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳",
};

const STEM_BASE = 0.30;
const STEM_POS: Record<Pos, number> = { year: 0.8, month: 1.1, day: 1.0, hour: 0.9 };
const VHS_POS_NON_MONTH: Record<Exclude<Pos, "month">, number> = { year: 0.8, day: 1.0, hour: 0.9 };
const VHS_POS_MONTH_QI: Record<Qi, number> = { main: 1.5, middle: 1.2, residual: 1.0 };
const ROOT_CLS: Record<RootClass, number> = {
  same_main: 1.00,
  same_middle: 0.80,
  same_residual: 0.50,
  same_element: 0.40,
  floating: 0.30,
};
const CLASH_LIGHT_PENALTY = 0.90;

/* ── System B mode (HK_SYSTEMB_DIST_V1) · additive · default off ──
 * สูตร旺衰打分(software 旺衰派) มีหลักคัมภีร์: 本>中>餘 + 月令×2 + 透干มีราก/ลอย(虚浮)
 * อ่านตรงตำรา子平真詮 扶抑 3/3 · ดู SYSTEM-B-ELEMENT-SPEC.md
 *   ก้านบน透干: มีราก5/ลอย2.5(penalty0.5) · 藏干: 1ตัว[8]/2ตัว[5,3]/3ตัว[5,2,1] · 月令×2 · ไม่ตัด DM
 *   ⚠ %ธาตุเท่านั้น(diagnostic) · ห้าม feed用神 (%≠用神 · 用神=wrapper-7格局) */
const SYSB_STEM_ROOTED = 5;
const SYSB_STEM_FLOAT = 2.5;
const SYSB_HIDDEN: Record<number, number[]> = { 1: [8], 2: [5, 3], 3: [5, 2, 1] };
export type ElementDistMode = "legacy" | "systemB";

const ELS: Element[] = ["wood", "fire", "earth", "metal", "water"];
const ELEMENT_PRODUCES: Record<Element, Element> = {
  wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood",
};

const POSITIONS: Pos[] = ["year", "month", "day", "hour"];

/* ──────────────────────────────────────────────────────────── */
/* P1 · validate unknown stems                                  */
/* ──────────────────────────────────────────────────────────── */

function isValidStem(s: unknown): s is string {
  return typeof s === "string" && s in STEM_ELEMENT;
}
function isValidBranch(b: unknown): b is string {
  return typeof b === "string" && b in HIDDEN;
}

function activePositions(natal: Natal): Pos[] {
  return POSITIONS.filter(p => {
    const pillar = (natal as any)[p];
    return pillar && isValidStem(pillar.stem) && isValidBranch(pillar.branch);
  });
}

/* ──────────────────────────────────────────────────────────── */
/* HS classifier · P0 · return trace                            */
/* ──────────────────────────────────────────────────────────── */

export interface RootClassResult {
  cls: RootClass;
  root_pos: Pos | null;
  root_branch: string | null;
  root_qi: Qi | null;
  root_stem: string | null;
}

const RANK: Record<RootClass, number> = {
  same_main: 5, same_middle: 4, same_residual: 3, same_element: 2, floating: 1,
};

function classifyStem(natal: Natal, stem: string): RootClassResult {
  if (!isValidStem(stem)) {
    return { cls: "floating", root_pos: null, root_branch: null, root_qi: null, root_stem: null };
  }
  const el = STEM_ELEMENT[stem];
  let best: RootClassResult = {
    cls: "floating", root_pos: null, root_branch: null, root_qi: null, root_stem: null,
  };
  let bestRank = RANK.floating;

  for (const p of activePositions(natal)) {
    const branch = (natal as any)[p].branch as string;
    const hidden = HIDDEN[branch] || {};
    for (const qi of ["main", "middle", "residual"] as Qi[]) {
      const s = hidden[qi];
      if (!s) continue;
      let cls: RootClass | null = null;
      if (s === stem) cls = `same_${qi}` as RootClass;
      else if (STEM_ELEMENT[s] === el) cls = "same_element";
      if (cls && RANK[cls] > bestRank) {
        bestRank = RANK[cls];
        best = { cls, root_pos: p, root_branch: branch, root_qi: qi, root_stem: s };
      }
    }
  }
  return best;
}

/* ──────────────────────────────────────────────────────────── */
/* Branch stability · P1 · return tags                          */
/* ──────────────────────────────────────────────────────────── */

export interface BranchStabilityResult {
  factor: number;
  tags: string[];
}

function branchStability(natal: Natal, pos: Pos): BranchStabilityResult {
  const pillar = (natal as any)[pos];
  if (!pillar) return { factor: 1.0, tags: [] };
  const branch = pillar.branch as string;
  const tags: string[] = [];
  for (const p of activePositions(natal)) {
    if (p === pos) continue;
    const other = (natal as any)[p].branch as string;
    if (CLASH[branch] === other) {
      tags.push(`${branch}${other}沖`);
    }
  }
  return { factor: tags.length > 0 ? CLASH_LIGHT_PENALTY : 1.0, tags };
}

/* ──────────────────────────────────────────────────────────── */
/* Main calculation                                             */
/* ──────────────────────────────────────────────────────────── */

export interface HsContribution {
  pos: Pos;
  stem: string;
  element: Element;
  classify: RootClassResult;
  score: number;
}

export interface VhsContribution {
  pos: Pos;
  branch: string;
  qi: Qi;
  hidden_stem: string;
  element: Element;
  base_weight: number;        /* QI_WEIGHT[qi] */
  position_factor: number;    /* VHS_POS_MONTH_QI or VHS_POS_NON_MONTH */
  stability_factor: number;   /* branch stability · CLASH_LIGHT_PENALTY or 1.0 */
  stability_tags: string[];
  score: number;              /* base × position × stability */
}

export type PillarMode = "full" | "partial";
export type ConfidenceLevel = "full" | "partial";

export interface ElementDistributionResult {
  /* meta */
  pillar_mode: PillarMode;
  confidence: ConfidenceLevel;
  missing_positions: Pos[];
  engine_version: "phase-17g-v6" | "system-b-v1";

  /* per-element breakdown */
  hs: Record<Element, number>;
  vhs: Record<Element, number>;
  dist: Record<Element, number>;
  total: number;

  /* display vs raw · กัน rounding off-by-1 */
  pctRaw: Record<Element, number>;       /* unrounded · ใช้ logic */
  pctDisplay: Record<Element, number>;   /* round 1 decimal · ใช้ UI */

  /* DM strength · preliminary only */
  supportRaw: number;                    /* unrounded support % */
  supportDisplay: number;                /* round int */
  strength_level: "extreme_weak" | "weak" | "balanced_weak" | "balanced"
                | "balanced_strong" | "strong" | "extreme_strong";
  strength_warning: string;              /* ห้ามตัดสิน 從/化/假從 */

  /* trace per contribution */
  hs_trace: HsContribution[];
  vhs_trace: VhsContribution[];
}

function levelFrom(supportRaw: number): ElementDistributionResult["strength_level"] {
  if (supportRaw <= 15) return "extreme_weak";
  if (supportRaw <= 35) return "weak";
  if (supportRaw <= 45) return "balanced_weak";
  if (supportRaw <= 55) return "balanced";
  if (supportRaw <= 65) return "balanced_strong";
  if (supportRaw <= 85) return "strong";
  return "extreme_strong";
}

/**
 * buildElementDistribution
 *
 * @param natal · pillar object · supports 3p (hour = null) and 4p
 * @returns ElementDistributionResult · with full trace
 *
 * Phase 17g · Plan C v6 strict · Codex APPROVED
 *
 * ห้ามใช้ output นี้:
 *   - feed wrapper-7 internal yongshen decision (use total_score เดิม)
 *   - ตัดสิน 從格 / 化格 / 假從 (use rule-based Phase 18)
 */
export function buildElementDistribution(natal: Natal, mode: ElementDistMode = "legacy"): ElementDistributionResult {
  /* validate + classify pillar mode */
  const active = activePositions(natal);
  const missing_positions = POSITIONS.filter(p => !active.includes(p));
  const pillar_mode: PillarMode = missing_positions.length === 0 ? "full" : "partial";
  const confidence: ConfidenceLevel = pillar_mode === "full" ? "full" : "partial";

  /* HS contributions */
  const hs: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  const hs_trace: HsContribution[] = [];
  for (const pos of active) {
    const stem = (natal as any)[pos].stem as string;
    const element = STEM_ELEMENT[stem];
    const classify = classifyStem(natal, stem);
    let score: number;
    if (mode === "systemB") {
      const m2 = pos === "month" ? 2 : 1;
      score = (classify.cls === "floating" ? SYSB_STEM_FLOAT : SYSB_STEM_ROOTED) * m2;
    } else {
      score = STEM_BASE * STEM_POS[pos] * ROOT_CLS[classify.cls];
    }
    hs[element] += score;
    hs_trace.push({ pos, stem, element, classify, score: round3(score) });
  }

  /* VHS contributions */
  const vhs: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  const vhs_trace: VhsContribution[] = [];
  for (const pos of active) {
    const branch = (natal as any)[pos].branch as string;
    const hidden = HIDDEN[branch] || {};
    const stability = branchStability(natal, pos);
    /* System B: weight ตามจำนวนก้านซ่อน (1[8]/2[5,3]/3[5,2,1]) ตามลำดับ main→middle→residual · 月令×2 · ไม่มี clash */
    const sysbQi = (["main", "middle", "residual"] as Qi[]).filter(q => hidden[q]);
    const sysbW = SYSB_HIDDEN[sysbQi.length] || [];
    let sysbIdx = 0;
    for (const qi of ["main", "middle", "residual"] as Qi[]) {
      const hidden_stem = hidden[qi];
      if (!hidden_stem) continue;
      const element = STEM_ELEMENT[hidden_stem];
      if (!element) continue;
      let base_weight: number;
      let position_factor: number;
      let stability_factor: number;
      if (mode === "systemB") {
        base_weight = sysbW[sysbIdx] ?? 0;
        position_factor = pos === "month" ? 2 : 1;
        stability_factor = 1;
      } else {
        base_weight = QI_WEIGHT[qi];
        position_factor = pos === "month"
          ? VHS_POS_MONTH_QI[qi]
          : VHS_POS_NON_MONTH[pos as Exclude<Pos, "month">];
        stability_factor = stability.factor;
      }
      const score = base_weight * position_factor * stability_factor;
      vhs[element] += score;
      vhs_trace.push({
        pos, branch, qi, hidden_stem, element,
        base_weight, position_factor,
        stability_factor,
        stability_tags: stability.tags.slice(),
        score: round3(score),
      });
      sysbIdx++;
    }
  }

  /* distribution + raw/display percentages */
  const dist: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  let total = 0;
  for (const el of ELS) {
    dist[el] = hs[el] + vhs[el];
    total += dist[el];
  }
  const safeTotal = total === 0 ? 1 : total;

  const pctRaw: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  const pctDisplay: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const el of ELS) {
    pctRaw[el] = (dist[el] / safeTotal) * 100;
    pctDisplay[el] = Math.round(pctRaw[el] * 10) / 10;
  }

  /* DM strength · use pctRaw for level decision (กัน rounding flip) */
  const dmStem = isValidStem(natal.day.stem) ? natal.day.stem : null;
  let supportRaw = 0;
  if (dmStem) {
    const dmEl = STEM_ELEMENT[dmStem];
    const resourceEl = (Object.keys(ELEMENT_PRODUCES) as Element[])
      .find(k => ELEMENT_PRODUCES[k] === dmEl);
    const dmPct = pctRaw[dmEl] ?? 0;
    const resPct = resourceEl ? (pctRaw[resourceEl] ?? 0) : 0;
    supportRaw = dmPct + resPct;
  }
  const strength_level = levelFrom(supportRaw);
  const supportDisplay = Math.round(supportRaw);

  return {
    pillar_mode,
    confidence,
    missing_positions,
    engine_version: mode === "systemB" ? "system-b-v1" : "phase-17g-v6",
    hs: roundObj(hs),
    vhs: roundObj(vhs),
    dist: roundObj(dist),
    total: round3(total),
    pctRaw,
    pctDisplay,
    supportRaw,
    supportDisplay,
    strength_level,
    strength_warning: "preliminary_distribution_based · ห้ามใช้ตัดสิน 從格/化格/假從 — Phase 18 rule-based format detector",
    hs_trace,
    vhs_trace,
  };
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }
function roundObj(obj: Record<Element, number>): Record<Element, number> {
  const out: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const el of ELS) out[el] = round3(obj[el]);
  return out;
}
