/**
 * strength-functional.ts · 19 พ.ค. 2026
 *
 * Recompute DM Strength (Voytek-style) using **Functional rootedness**
 * แทน raw weighted count ใน buildVoytekStrength (chart-extensions.ts:307)
 *
 * เหตุ: Aeaw 假從財格 · raw บอก 44% supporting = "สมดุล-อ่อน"
 * แต่ตำราจริง · ดิน 7.7% + ไฟ 15.4% = 23% supporting = **"อ่อน" (weak)**
 *
 * Methodology v3 ของอากง:
 *   "Day Master ไม่ควรนับเป็นตัวช่วยของตัวเอง"
 *   → แต่สำหรับ "support" คือ Resource + Parallel · DM อยู่ใน parallel ก็ได้ (peer)
 *   → กฎเดียวกับ buildVoytekStrength เดิม
 */

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
  [el: string]: { total_score: number; rootedness_label: string };
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
): FunctionalStrength {
  const dmEl = (STEM_ELEMENT[dmStem] || "earth") as ElName;
  const producesDm = (Object.keys(ELEMENT_PRODUCES).find(k => ELEMENT_PRODUCES[k] === dmEl) || "fire") as ElName;
  const wealth = (ELEMENT_CONTROLS[dmEl] || "water") as ElName;
  const power  = (Object.keys(ELEMENT_CONTROLS).find(k => ELEMENT_CONTROLS[k] === dmEl) || "wood") as ElName;
  const output = (ELEMENT_PRODUCES[dmEl] || "metal") as ElName;

  /* รวม total · ใช้ Math.max(0,...) กัน negative · ที่ wrapper-7 อาจให้ */
  let total = 0;
  const score: Record<ElName, number> = { wood:0, fire:0, earth:0, metal:0, water:0 };
  for (const el of ELS) {
    score[el] = Math.max(0, rootedness[el]?.total_score ?? 0);
    total += score[el];
  }
  if (total === 0) total = 1;

  const pct = (el: ElName) => Math.round((score[el] / total) * 100);

  const supporting = pct(dmEl) + pct(producesDm);
  const opposing = 100 - supporting;

  let level: FunctionalStrength["level"];
  let level_th: string, level_en: string, level_zh: string;
  if (supporting <= 15)      { level = "extreme_weak";    level_th = "อ่อนสุดขีด";   level_en = "Extreme Weak";    level_zh = "極弱"; }
  else if (supporting <= 35) { level = "weak";            level_th = "อ่อน";         level_en = "Weak";            level_zh = "弱"; }
  else if (supporting <= 45) { level = "balanced_weak";   level_th = "สมดุล-อ่อน";   level_en = "Balanced-Weak";   level_zh = "中和偏弱"; }
  else if (supporting <= 55) { level = "balanced";        level_th = "สมดุล";        level_en = "Balanced";        level_zh = "中和"; }
  else if (supporting <= 65) { level = "balanced_strong"; level_th = "สมดุล-แกร่ง";  level_en = "Balanced-Strong"; level_zh = "中和偏強"; }
  else if (supporting <= 85) { level = "strong";          level_th = "แกร่ง";        level_en = "Strong";          level_zh = "強"; }
  else                       { level = "extreme_strong"; level_th = "แกร่งสุดขีด";  level_en = "Extreme Strong";  level_zh = "極強"; }

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
