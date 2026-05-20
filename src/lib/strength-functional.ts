/**
 * strength-functional.ts · 20 พ.ค. 2026 · Phase 17g
 *
 * Recompute DM Strength · 3 layer precedence:
 *   1. Phase 17g · distribution_score (Plan C v6 strict · Codex APPROVED)
 *      → ถ้ามี · prefer pctRaw จาก ElementDistributionResult
 *   2. Phase 17b · effective_score (root + visibility)
 *      → fallback ถ้าไม่มี distribution
 *   3. total_score (root only)
 *      → fallback ถ้าไม่มี effective_score
 *
 * Methodology v3 ของอากง:
 *   "Day Master ไม่ควรนับเป็นตัวช่วยของตัวเอง"
 *   → support = Resource + Parallel (DM)
 */

import type { ElementDistributionResult } from "./element-distribution-functional";

const STEM_ELEMENT: Record<string, string> = {
  甲:"wood", 乙:"wood", 丙:"fire", 丁:"fire", 戊:"earth",
  己:"earth", 庚:"metal", 辛:"metal", 壬:"water", 癸:"water",
};
const ELEMENT_PRODUCES: Record<string, string> = {
  wood:"fire", fire:"earth", earth:"metal", metal:"water", water:"wood",
};
const ELEMENT_CONTROLS: Record<string, string> = {
  wood:"earth", earth:"water", water:"fire", fire:"metal", metal:"wood",
};

const ELS = ["wood","fire","earth","metal","water"] as const;
type ElName = typeof ELS[number];

export interface RootednessMap {
  [el: string]: {
    total_score: number;
    rootedness_label: string;
    /* Phase 17b · semantic split 通根 vs 透干 · optional · backward compat */
    stem_visibility_score?: number;
    effective_score?: number;
  };
}

export interface FunctionalStrength {
  supporting_pct: number;
  opposing_pct: number;
  level: "extreme_weak"|"weak"|"balanced_weak"|"balanced"|"balanced_strong"|"strong"|"extreme_strong";
  level_th: string;
  level_en: string;
  level_zh: string;
  bars: Array<{
    role: "resource"|"parallel"|"output"|"wealth"|"power";
    element: string;
    pct: number;
    role_th: string;
    role_en: string;
    role_zh: string;
  }>;
  source: "functional-wrapper7";
}

export function buildStrengthFunctional(
  dmStem: string,
  rootedness: RootednessMap,
  distribution?: ElementDistributionResult,
): FunctionalStrength {
  const dmEl = (STEM_ELEMENT[dmStem] || "earth") as ElName;
  const producesDm = (Object.keys(ELEMENT_PRODUCES).find(k => ELEMENT_PRODUCES[k] === dmEl) || "fire") as ElName;
  const wealth = (ELEMENT_CONTROLS[dmEl] || "water") as ElName;
  const power  = (Object.keys(ELEMENT_CONTROLS).find(k => ELEMENT_CONTROLS[k] === dmEl) || "wood") as ElName;
  const output = (ELEMENT_PRODUCES[dmEl] || "metal") as ElName;

  /* Phase 17g · 3-layer precedence (Plan C v6 strict · Codex APPROVED):
   * 1. distribution.pctRaw → ใช้ supportRaw ตัดสิน level (กัน rounding flip)
   * 2. rootedness.effective_score → fallback Phase 17b semantic split
   * 3. rootedness.total_score → fallback Phase 17 เดิม (root only) */
  let supportingRaw: number;        /* float · ใช้ตัดสิน level (กัน boundary flip) */
  let supporting: number;            /* int · ใช้ display */
  let opposing: number;
  const pctMap: Record<ElName, number> = { wood:0, fire:0, earth:0, metal:0, water:0 };

  if (distribution) {
    /* Phase 17g · ใช้ supportRaw (float) ตัดสิน level · supportDisplay ใช้ %display */
    for (const el of ELS) pctMap[el] = Math.round(distribution.pctRaw[el] ?? 0);
    supportingRaw = distribution.supportRaw;
    supporting = Math.round(distribution.supportRaw);
    opposing = 100 - supporting;
  } else {
    /* Phase 17b/17d fallback · backward compat · raw float สำหรับ level */
    let total = 0;
    const score: Record<ElName, number> = { wood:0, fire:0, earth:0, metal:0, water:0 };
    for (const el of ELS) {
      const r = rootedness[el];
      const s = r?.effective_score ?? r?.total_score ?? 0;
      score[el] = Math.max(0, s);
      total += score[el];
    }
    if (total === 0) total = 1;
    const dmPctRaw = (score[dmEl] / total) * 100;
    const resPctRaw = (score[producesDm] / total) * 100;
    supportingRaw = dmPctRaw + resPctRaw;
    for (const el of ELS) pctMap[el] = Math.round((score[el] / total) * 100);
    supporting = Math.round(supportingRaw);
    opposing = 100 - supporting;
  }

  const pct = (el: ElName) => pctMap[el];

  let level: FunctionalStrength["level"];
  let level_th: string, level_en: string, level_zh: string;
  /* Codex P0 · ตัดสิน level ด้วย supportingRaw (float) · กัน boundary flip 15/35/45/55/65/85 */
  if (supportingRaw <= 15)      { level = "extreme_weak";    level_th = "อ่อนสุดขีด";   level_en = "Extreme Weak";    level_zh = "極弱"; }
  else if (supportingRaw <= 35) { level = "weak";            level_th = "อ่อน";         level_en = "Weak";            level_zh = "弱"; }
  else if (supportingRaw <= 45) { level = "balanced_weak";   level_th = "สมดุล-อ่อน";   level_en = "Balanced-Weak";   level_zh = "中和偏弱"; }
  else if (supportingRaw <= 55) { level = "balanced";        level_th = "สมดุล";        level_en = "Balanced";        level_zh = "中和"; }
  else if (supportingRaw <= 65) { level = "balanced_strong"; level_th = "สมดุล-แกร่ง";  level_en = "Balanced-Strong"; level_zh = "中和偏強"; }
  else if (supportingRaw <= 85) { level = "strong";          level_th = "แกร่ง";        level_en = "Strong";          level_zh = "強"; }
  else                          { level = "extreme_strong"; level_th = "แกร่งสุดขีด";  level_en = "Extreme Strong";  level_zh = "極強"; }

  const ROLE_META: Record<string, { role_th: string; role_en: string; role_zh: string }> = {
    resource: { role_th: "ครูบาอาจารย์ · 印", role_en: "Resource",  role_zh: "印星" },
    parallel: { role_th: "ตัวเรา · 比劫",      role_en: "Parallel",  role_zh: "比劫" },
    output:   { role_th: "ลูกหลาน · 食傷",     role_en: "Output",    role_zh: "食傷" },
    wealth:   { role_th: "ทรัพย์ · 財",         role_en: "Wealth",    role_zh: "財星" },
    power:    { role_th: "อำนาจ · 官殺",       role_en: "Power",     role_zh: "官殺" },
  };

  const bars: FunctionalStrength["bars"] = [
    { role: "resource", element: producesDm, pct: pct(producesDm), ...ROLE_META.resource },
    { role: "parallel", element: dmEl,       pct: pct(dmEl),       ...ROLE_META.parallel },
    { role: "output",   element: output,     pct: pct(output),     ...ROLE_META.output },
    { role: "wealth",   element: wealth,     pct: pct(wealth),     ...ROLE_META.wealth },
    { role: "power",    element: power,      pct: pct(power),      ...ROLE_META.power },
  ];

  return {
    supporting_pct: supporting,
    opposing_pct: opposing,
    level, level_th, level_en, level_zh,
    bars,
    source: "functional-wrapper7",
  };
}
