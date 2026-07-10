// Chart extensions · เพิ่ม field พื้นฐานที่ /chart และ /today ขาด
// ใช้ใน /api/chart route เพิ่มเติมจาก ge_ju · useful_god · strength_yongshen · tiao_hou · hs_hhs · matrix_summary
// อ่าน source: wrappers/shared.js (ten gods · twelvePhase · clash tables) · stars-detector (kong_wang)
// Status: read-only · ไม่ recommend activity · ไม่มี wording user-facing

import type { BaziPillars, BaziPillarsAny } from "./bazi-calc";
import * as tyme from "tyme4ts";

/* 19 พ.ค. Option α · accept hour=null · 4p path byte-equal · 3p path: skip hour-only events */
const ACTIVE_KEYS_4P: (keyof BaziPillars)[] = ["year", "month", "day", "hour"];
function activeKeys(p: BaziPillarsAny): (keyof BaziPillars)[] {
  return ACTIVE_KEYS_4P.filter(k => p[k] != null) as (keyof BaziPillars)[];
}

const STEM_ELEMENT: Record<string, string> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};

const BRANCH_ELEMENT: Record<string, string> = {
  子: "water", 亥: "water", 寅: "wood", 卯: "wood", 巳: "fire", 午: "fire",
  申: "metal", 酉: "metal", 辰: "earth", 戌: "earth", 丑: "earth", 未: "earth",
};

const HIDDEN_STEMS: Record<string, string[]> = {
  子: ["癸"], 丑: ["己", "癸", "辛"], 寅: ["甲", "丙", "戊"], 卯: ["乙"],
  辰: ["戊", "乙", "癸"], 巳: ["丙", "戊", "庚"], 午: ["丁", "己"], 未: ["己", "丁", "乙"],
  申: ["庚", "壬", "戊"], 酉: ["辛"], 戌: ["戊", "辛", "丁"], 亥: ["壬", "甲"],
};

const SIX_CLASH: Record<string, string> = {
  子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅",
  卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳",
};
const SIX_HE: Record<string, string> = {
  子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯",
  辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午",
};
const SIX_HARM: Record<string, string> = {
  子: "未", 未: "子", 丑: "午", 午: "丑", 寅: "巳", 巳: "寅",
  卯: "辰", 辰: "卯", 申: "亥", 亥: "申", 酉: "戌", 戌: "酉",
};
const SIX_DESTROY: Record<string, string> = {
  子: "酉", 酉: "子", 丑: "辰", 辰: "丑", 寅: "亥", 亥: "寅",
  卯: "午", 午: "卯", 巳: "申", 申: "巳", 未: "戌", 戌: "未",
};

const SAN_HE_SETS = [
  ["申", "子", "辰"], ["亥", "卯", "未"], ["寅", "午", "戌"], ["巳", "酉", "丑"],
];
const SAN_HUI_SETS = [
  ["寅", "卯", "辰"], ["巳", "午", "未"], ["申", "酉", "戌"], ["亥", "子", "丑"],
];
/* 半合 · pair ที่มี cardinal (ตัวกลางของ 三合) เท่านั้น */
const BAN_HE_PAIRS: Array<{ pair: [string, string]; element: "water"|"fire"|"wood"|"metal" }> = [
  { pair: ["申", "子"], element: "water" }, { pair: ["子", "辰"], element: "water" },
  { pair: ["寅", "午"], element: "fire" },  { pair: ["午", "戌"], element: "fire" },
  { pair: ["亥", "卯"], element: "wood" },  { pair: ["卯", "未"], element: "wood" },
  { pair: ["巳", "酉"], element: "metal" }, { pair: ["酉", "丑"], element: "metal" },
];

const ELEMENT_CONTROLS: Record<string, string> = {
  wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood",
};
const ELEMENT_PRODUCES: Record<string, string> = {
  wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood",
};
const STEM_POLARITY: Record<string, "yang" | "yin"> = {
  甲: "yang", 乙: "yin", 丙: "yang", 丁: "yin", 戊: "yang", 己: "yin",
  庚: "yang", 辛: "yin", 壬: "yang", 癸: "yin",
};

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

const STEM_ANCHOR: Record<string, { start: string; dir: 1 | -1 }> = {
  甲: { start: "亥", dir: 1 }, 丙: { start: "寅", dir: 1 }, 戊: { start: "寅", dir: 1 },
  庚: { start: "巳", dir: 1 }, 壬: { start: "申", dir: 1 },
  乙: { start: "午", dir: -1 }, 丁: { start: "酉", dir: -1 }, 己: { start: "酉", dir: -1 },
  辛: { start: "子", dir: -1 }, 癸: { start: "卯", dir: -1 },
};
const BRANCHES_ORDER = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const PHASE_ORDER = ["長生", "沐浴", "冠帶", "臨官", "帝旺", "衰", "病", "死", "墓", "絕", "胎", "養"];

function twelvePhase(stem: string, branch: string): string | null {
  const anchor = STEM_ANCHOR[stem];
  if (!anchor) return null;
  const startIdx = BRANCHES_ORDER.indexOf(anchor.start);
  const branchIdx = BRANCHES_ORDER.indexOf(branch);
  if (startIdx < 0 || branchIdx < 0) return null;
  let offset = (branchIdx - startIdx) * anchor.dir;
  offset = ((offset % 12) + 12) % 12;
  return PHASE_ORDER[offset];
}

function tenGodOf(dayMaster: string, targetStem: string): string | null {
  const dmEl = STEM_ELEMENT[dayMaster];
  const tEl = STEM_ELEMENT[targetStem];
  if (!dmEl || !tEl) return null;
  const samePol = STEM_POLARITY[dayMaster] === STEM_POLARITY[targetStem];
  if (dmEl === tEl) return samePol ? "比肩" : "劫財";
  if (ELEMENT_PRODUCES[dmEl] === tEl) return samePol ? "食神" : "傷官";
  if (ELEMENT_CONTROLS[dmEl] === tEl) return samePol ? "偏財" : "正財";
  if (ELEMENT_CONTROLS[tEl] === dmEl) return samePol ? "七殺" : "正官";
  if (ELEMENT_PRODUCES[tEl] === dmEl) return samePol ? "偏印" : "正印";
  return null;
}

export type ElementCounts = { wood: number; fire: number; earth: number; metal: number; water: number };

function buildElementCounts(pillars: BaziPillarsAny): ElementCounts {
  const counts: ElementCounts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  const pkeys = activeKeys(pillars);
  for (const k of pkeys) {
    const p = pillars[k]!;
    const se = STEM_ELEMENT[p.stem];
    const be = BRANCH_ELEMENT[p.branch];
    if (se) counts[se as keyof ElementCounts] += 1;
    if (be) counts[be as keyof ElementCounts] += 1;
    const hs = HIDDEN_STEMS[p.branch] || [];
    for (const h of hs) {
      const he = STEM_ELEMENT[h];
      if (he) counts[he as keyof ElementCounts] += 0.5;
    }
  }
  return counts;
}

export type TenGodsMap = {
  year: { stem: string; ten_god: string | null };
  month: { stem: string; ten_god: string | null };
  day: { stem: string; ten_god: "日主" };
  hour: { stem: string; ten_god: string | null } | null;     /* 19 พ.ค. Option α · 3p: null */
};

function buildTenGodsMap(pillars: BaziPillarsAny): TenGodsMap {
  const dm = pillars.day.stem;
  return {
    year: { stem: pillars.year.stem, ten_god: tenGodOf(dm, pillars.year.stem) },
    month: { stem: pillars.month.stem, ten_god: tenGodOf(dm, pillars.month.stem) },
    day: { stem: pillars.day.stem, ten_god: "日主" },
    hour: pillars.hour
      ? { stem: pillars.hour.stem, ten_god: tenGodOf(dm, pillars.hour.stem) }
      : null,
  };
}

export type QiPhases = {
  year: string | null;
  month: string | null;
  day: string | null;
  hour: string | null;
};

function buildQiPhases(pillars: BaziPillarsAny): QiPhases {
  const dm = pillars.day.stem;
  return {
    year: twelvePhase(dm, pillars.year.branch),
    month: twelvePhase(dm, pillars.month.branch),
    day: twelvePhase(dm, pillars.day.branch),
    hour: pillars.hour ? twelvePhase(dm, pillars.hour.branch) : null,
  };
}

export type InteractionFlag = {
  type: "六沖" | "六合" | "六害" | "六破";
  pair: [string, string];
  pillars_pair: [string, string];
};

/* Stem clash (天干相沖) · Voytek "Xiang Ke / 天克"
 * 戊己 (central earth) ไม่ clash */
const STEM_CLASH: Record<string, string> = {
  甲: "庚", 庚: "甲",
  乙: "辛", 辛: "乙",
  丙: "壬", 壬: "丙",
  丁: "癸", 癸: "丁",
};

/* Stem combinations (五合) · 5 pairs + transformation element + required branches */
const STEM_COMBOS: Record<string, { partner: string; element: "earth"|"metal"|"water"|"wood"|"fire"; requiredBranches: string[] }> = {
  甲: { partner: "己", element: "earth", requiredBranches: ["辰","午","戌","丑","未"] },
  己: { partner: "甲", element: "earth", requiredBranches: ["辰","午","戌","丑","未"] },
  乙: { partner: "庚", element: "metal", requiredBranches: ["丑","未","酉","申"] },
  庚: { partner: "乙", element: "metal", requiredBranches: ["丑","未","酉","申"] },
  丙: { partner: "辛", element: "water", requiredBranches: ["子","辰","申","亥"] },
  辛: { partner: "丙", element: "water", requiredBranches: ["子","辰","申","亥"] },
  丁: { partner: "壬", element: "wood",  requiredBranches: ["亥","卯","寅","未"] },
  壬: { partner: "丁", element: "wood",  requiredBranches: ["亥","卯","寅","未"] },
  戊: { partner: "癸", element: "fire",  requiredBranches: ["寅","午","戌","巳"] },
  癸: { partner: "戊", element: "fire",  requiredBranches: ["寅","午","戌","巳"] },
};

export type StemInteractionFlag = {
  type: "五合" | "天克";
  pair: [string, string];
  pillars_pair: [string, string];
  element?: "earth"|"metal"|"water"|"wood"|"fire";
  transformed?: boolean;
};

function buildStemInteractions(pillars: BaziPillarsAny): StemInteractionFlag[] {
  const pkeys = activeKeys(pillars);
  const branches = pkeys.map(k => pillars[k]!.branch);
  const out: StemInteractionFlag[] = [];
  const seenCombo = new Set<string>();
  for (let i = 0; i < pkeys.length; i++) {
    for (let j = i + 1; j < pkeys.length; j++) {
      const a = pillars[pkeys[i]]!.stem;
      const b = pillars[pkeys[j]]!.stem;
      if (STEM_CLASH[a] === b) {
        out.push({ type: "天克", pair: [a, b], pillars_pair: [pkeys[i] as string, pkeys[j] as string] });
      }
      const info = STEM_COMBOS[a];
      if (info && info.partner === b) {
        const key = `${pkeys[i]}-${pkeys[j]}-${[a,b].sort().join("")}`;
        if (!seenCombo.has(key)) {
          seenCombo.add(key);
          const transformed = info.requiredBranches.some(rb => branches.includes(rb));
          out.push({ type: "五合", pair: [a, b], pillars_pair: [pkeys[i] as string, pkeys[j] as string], element: info.element, transformed });
        }
      }
    }
  }
  return out;
}

export type FanYinFuYinFlag = {
  type: "反吟" | "伏吟" | "伏吟·ก้าน" | "伏吟·กิ่ง" | "反吟·ก้าน" | "反吟·กิ่ง";
  natal_pillar: string;
  other_pillar: string;
  natal: { stem: string; branch: string };
  other: { stem: string; branch: string };
};

function classifyFanFu(a: {stem:string;branch:string}, b: {stem:string;branch:string}): FanYinFuYinFlag["type"] | null {
  const sameStem = a.stem === b.stem;
  const sameBranch = a.branch === b.branch;
  const clashStem = STEM_CLASH[a.stem] === b.stem;
  const clashBranch = SIX_CLASH[a.branch] === b.branch;
  if (sameStem && sameBranch)   return "伏吟";        /* ซ้ำเต็ม */
  if (clashStem && clashBranch) return "反吟";        /* พลิกเต็ม */
  if (sameStem && clashBranch)  return "反吟·ก้าน";   /* ก้านซ้ำ + กิ่งชน */
  if (clashStem && sameBranch)  return "反吟·กิ่ง";   /* ก้านชน + กิ่งซ้ำ */
  if (sameStem)                 return "伏吟·ก้าน";   /* ก้านซ้ำเดี่ยว */
  if (sameBranch)               return "伏吟·กิ่ง";   /* กิ่งซ้ำเดี่ยว */
  return null;
}

function buildFanYinFuYin(pillars: BaziPillarsAny, luckPillars: LuckPillar[], currentLuckIdx: number, currentYear?: { stem: string; branch: string }): FanYinFuYinFlag[] {
  const out: FanYinFuYinFlag[] = [];
  const pkeys = activeKeys(pillars);
  /* A. ภายในเสาเกิด (natal × natal) */
  for (let i = 0; i < pkeys.length; i++) {
    for (let j = i + 1; j < pkeys.length; j++) {
      const a = pillars[pkeys[i]]!;
      const b = pillars[pkeys[j]]!;
      const t = classifyFanFu(a, b);
      if (t) out.push({ type: t, natal_pillar: pkeys[i], other_pillar: pkeys[j], natal: a, other: b });
    }
  }
  /* B. เสาเกิด × เสาโชคปัจจุบัน */
  if (currentLuckIdx >= 0 && luckPillars[currentLuckIdx]) {
    const lp = luckPillars[currentLuckIdx];
    const lpKey = `luck_${currentLuckIdx}`;
    const lpStem = { stem: lp.stem, branch: lp.branch };
    for (const pk of pkeys) {
      const n = pillars[pk]!;
      const t = classifyFanFu(n, lpStem);
      if (t) out.push({ type: t, natal_pillar: pk, other_pillar: lpKey, natal: n, other: lpStem });
    }
  }
  /* C. เสาเกิด × ปีปัจจุบัน */
  if (currentYear) {
    for (const pk of pkeys) {
      const n = pillars[pk]!;
      const t = classifyFanFu(n, currentYear);
      if (t) out.push({ type: t, natal_pillar: pk, other_pillar: "current_year", natal: n, other: currentYear });
    }
  }
  return out;
}

/* Voytek-style DM strength · Layer 3 · ไม่แตะ wrapper 6 (LOCKED) ·
 * แสดงคู่ classical strength เพื่อให้ลูกค้าคุ้นเคย Voytek เห็นมุมมองเดียวกัน
 * supporting = Resource (produces DM) + Parallel (same as DM)
 * opposing   = Output + Wealth + Power */
export type VoytekStrength = {
  supporting_pct: number;
  opposing_pct: number;
  level: "extreme_weak" | "weak" | "balanced_weak" | "balanced" | "balanced_strong" | "strong" | "extreme_strong";
  level_th: string;
  level_en: string;
  level_zh: string;
  /* 10 gods bar 5 ธาตุ · Voytek style */
  bars: Array<{
    role: "resource" | "parallel" | "output" | "wealth" | "power";
    element: "wood" | "fire" | "earth" | "metal" | "water";
    pct: number;
    role_th: string;
    role_en: string;
    role_zh: string;
  }>;
};

function buildVoytekStrength(pillars: BaziPillars, _elementCounts: ElementCounts): VoytekStrength {
  const dm = pillars.day.stem;
  const dmEl = STEM_ELEMENT[dm] as "wood"|"fire"|"earth"|"metal"|"water";
  const producesDm = Object.keys(ELEMENT_PRODUCES).find(k => ELEMENT_PRODUCES[k] === dmEl) as "wood"|"fire"|"earth"|"metal"|"water";
  const wealth = ELEMENT_CONTROLS[dmEl] as "wood"|"fire"|"earth"|"metal"|"water";
  const power  = Object.keys(ELEMENT_CONTROLS).find(k => ELEMENT_CONTROLS[k] === dmEl) as "wood"|"fire"|"earth"|"metal"|"water";
  const output = ELEMENT_PRODUCES[dmEl] as "wood"|"fire"|"earth"|"metal"|"water";

  /* Voytek-style weighting (tuned vs 5 reference charts):
   *   stem: 4 (HS main qi heavily weighted)
   *   hidden main: 1.5 · middle: 0.5 · residual: 0.2 */
  const counts: ElementCounts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  const pkeys = activeKeys(pillars);
  for (const k of pkeys) {
    const p = pillars[k];
    const se = STEM_ELEMENT[p.stem] as keyof ElementCounts;
    if (se) counts[se] += 4;
    const hs = HIDDEN_STEMS[p.branch] || [];
    const weights = [1.5, 0.5, 0.2];
    for (let i = 0; i < hs.length; i++) {
      const he = STEM_ELEMENT[hs[i]] as keyof ElementCounts;
      if (he) counts[he] += weights[i] || 0.1;
    }
  }
  const total = counts.wood + counts.fire + counts.earth + counts.metal + counts.water || 1;
  const pct = (el: "wood"|"fire"|"earth"|"metal"|"water") => Math.round((counts[el] / total) * 100);

  const supporting = pct(dmEl) + pct(producesDm);
  const opposing = 100 - supporting;

  let level: VoytekStrength["level"];
  let level_th: string, level_en: string, level_zh: string;
  if (supporting <= 15)      { level = "extreme_weak";     level_th = "อ่อนสุดขีด";    level_en = "Extreme Weak";    level_zh = "極弱"; }
  else if (supporting <= 35) { level = "weak";             level_th = "อ่อน";          level_en = "Weak";            level_zh = "弱"; }
  else if (supporting <= 45) { level = "balanced_weak";    level_th = "สมดุล-อ่อน";    level_en = "Balanced-Weak";   level_zh = "中和偏弱"; }
  else if (supporting <= 55) { level = "balanced";         level_th = "สมดุล";         level_en = "Balanced";        level_zh = "中和"; }
  else if (supporting <= 65) { level = "balanced_strong"; level_th = "สมดุล-แกร่ง";  level_en = "Balanced-Strong"; level_zh = "中和偏強"; }
  else if (supporting <= 85) { level = "strong";           level_th = "แกร่ง";         level_en = "Strong";          level_zh = "強"; }
  else                       { level = "extreme_strong";   level_th = "แกร่งสุดขีด";   level_en = "Extreme Strong";   level_zh = "極強"; }

  const ROLE_META: Record<string, { role_th: string; role_en: string; role_zh: string }> = {
    resource: { role_th: "ครูบาอาจารย์ · 印", role_en: "Resource",  role_zh: "印星" },
    parallel: { role_th: "ตัวเรา · 比劫",       role_en: "Parallel",  role_zh: "比劫" },
    output:   { role_th: "ลูกหลาน · 食傷",     role_en: "Output",    role_zh: "食傷" },
    wealth:   { role_th: "ทรัพย์ · 財",         role_en: "Wealth",    role_zh: "財星" },
    power:    { role_th: "อำนาจ · 官殺",       role_en: "Power",     role_zh: "官殺" },
  };

  const bars: VoytekStrength["bars"] = [
    { role: "resource", element: producesDm, pct: pct(producesDm), ...ROLE_META.resource },
    { role: "parallel", element: dmEl,       pct: pct(dmEl),       ...ROLE_META.parallel },
    { role: "output",   element: output,     pct: pct(output),     ...ROLE_META.output },
    { role: "wealth",   element: wealth,     pct: pct(wealth),     ...ROLE_META.wealth },
    { role: "power",    element: power,      pct: pct(power),      ...ROLE_META.power },
  ];

  return { supporting_pct: supporting, opposing_pct: opposing, level, level_th, level_en, level_zh, bars };
}

/* Compute current year pillar from todayDate · jia-zi cycle */
function currentYearPillar(date: Date): { stem: string; branch: string } {
  const year = date.getUTCFullYear();
  /* 1984 = 甲子 reference */
  const offset = ((year - 1984) % 60 + 60) % 60;
  const stems = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
  const branches = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
  return { stem: stems[offset % 10], branch: branches[offset % 12] };
}

/* ── Engine 1 · LP × natal interactions matrix ──────────────── */
export type LPNatalInteraction = {
  natal_pillar: "year"|"month"|"day"|"hour";
  types: string[];  /* 六沖·六合·六害·六破·半合·五合·天克·三合·三會 */
  natal: { stem: string; branch: string };
  lp: { stem: string; branch: string };
};

function buildLpNatalInteractions(pillars: BaziPillars, lp: { stem: string; branch: string }): LPNatalInteraction[] {
  const pkeys = activeKeys(pillars);
  const out: LPNatalInteraction[] = [];
  for (const pk of pkeys) {
    const n = pillars[pk];
    const types: string[] = [];
    /* Stem */
    if (STEM_CLASH[n.stem] === lp.stem) types.push("天克");
    const sc = STEM_COMBOS[n.stem];
    if (sc && sc.partner === lp.stem) types.push("五合");
    /* Branch */
    if (SIX_CLASH[n.branch] === lp.branch) types.push("六沖");
    if (SIX_HE[n.branch] === lp.branch) types.push("六合");
    if (SIX_HARM[n.branch] === lp.branch) types.push("六害");
    if (SIX_DESTROY[n.branch] === lp.branch) types.push("六破");
    for (const r of BAN_HE_PAIRS) {
      if ((r.pair[0] === n.branch && r.pair[1] === lp.branch) ||
          (r.pair[0] === lp.branch && r.pair[1] === n.branch)) {
        types.push("半合·"+r.element);
      }
    }
    if (types.length) out.push({ natal_pillar: pk, types, natal: n, lp });
  }
  /* 三合/三會: check if LP branch completes a trio with 2 natal branches · 3p: skip hour */
  const allBranches = activeKeys(pillars).map(k => pillars[k]!.branch);
  for (const set of SAN_HE_SETS) {
    const lpInSet = set.includes(lp.branch);
    const present = set.filter(b => allBranches.includes(b));
    if (lpInSet && present.length === 2) {
      out.push({ natal_pillar: "year", types: ["三合·"+set.join("")], natal: pillars.year, lp });
    }
  }
  for (const set of SAN_HUI_SETS) {
    const lpInSet = set.includes(lp.branch);
    const present = set.filter(b => allBranches.includes(b));
    if (lpInSet && present.length === 2) {
      out.push({ natal_pillar: "year", types: ["三會·"+set.join("")], natal: pillars.year, lp });
    }
  }
  return out;
}

/* ── 天地合 cross-pillar (stems combine + branches 六合) ────── */
export type TianDiHe = {
  pair: [string, string];
  pillars_pair: [string, string];
  element: "earth"|"metal"|"water"|"wood"|"fire";
};

function buildTianDiHe(pillars: BaziPillarsAny): TianDiHe[] {
  const pkeys = activeKeys(pillars);
  const out: TianDiHe[] = [];
  for (let i = 0; i < pkeys.length; i++) {
    for (let j = i + 1; j < pkeys.length; j++) {
      const a = pillars[pkeys[i]]!;
      const b = pillars[pkeys[j]]!;
      const sc = STEM_COMBOS[a.stem];
      const stemMatch = sc && sc.partner === b.stem;
      const branchMatch = SIX_HE[a.branch] === b.branch;
      if (stemMatch && branchMatch) {
        out.push({
          pair: [a.stem + a.branch, b.stem + b.branch],
          pillars_pair: [pkeys[i] as string, pkeys[j] as string],
          element: sc.element,
        });
      }
    }
  }
  return out;
}

/* ── Engine 2 · TCM organ map + Industry map + Special chart rules ─── */
const TCM_ORGAN: Record<string, { yin_zh: string; yang_zh: string; yin_th: string; yang_th: string; system_zh: string; system_th: string }> = {
  wood:  { yin_zh:"肝",yang_zh:"膽",yin_th:"ตับ",yang_th:"ถุงน้ำดี",system_zh:"筋·目",system_th:"เส้นเอ็น·ดวงตา" },
  fire:  { yin_zh:"心",yang_zh:"小腸",yin_th:"หัวใจ",yang_th:"ลำไส้เล็ก",system_zh:"血脈·舌",system_th:"หลอดเลือด·ลิ้น" },
  earth: { yin_zh:"脾",yang_zh:"胃",yin_th:"ม้าม",yang_th:"กระเพาะ",system_zh:"肌肉·口",system_th:"กล้ามเนื้อ·ปาก" },
  metal: { yin_zh:"肺",yang_zh:"大腸",yin_th:"ปอด",yang_th:"ลำไส้ใหญ่",system_zh:"皮膚·鼻",system_th:"ผิวหนัง·จมูก" },
  water: { yin_zh:"腎",yang_zh:"膀胱",yin_th:"ไต",yang_th:"กระเพาะปัสสาวะ",system_zh:"骨·耳",system_th:"กระดูก·หู" },
};

const INDUSTRY_TH: Record<string, string[]> = {
  wood:  ["การศึกษา·พิมพ์","แฟชั่น·สิ่งทอ","ออกแบบ·สถาปัตย์","เกษตร·ป่าไม้","สื่อสิ่งพิมพ์","สมุนไพร·ดอกไม้"],
  fire:  ["IT·ดิจิทัล","ความงาม·เครื่องสำอาง","โรงแรม·ร้านอาหาร","ไฟฟ้า·อิเล็กทรอนิกส์","โฆษณา·บันเทิง","พลังงานความร้อน"],
  earth: ["อสังหาริมทรัพย์","ก่อสร้าง·วัสดุ","ประกันชีวิต","เซรามิก·เครื่องปั้น","เกษตร·พืชสวน","ที่ปรึกษา"],
  metal: ["การเงิน·ธนาคาร","เครื่องจักร·ยานยนต์","อัญมณี·เครื่องประดับ","แพทย์·ยา","ความปลอดภัย·ทหาร","เทคโนโลยีหนัก"],
  water: ["เดินเรือ·ขนส่ง","ท่องเที่ยว·สปา","ประมง·เครื่องดื่ม","เคมี·พลังงาน","พลังงานไฟฟ้า","กลยุทธ์·วิเคราะห์"],
};

const INDUSTRY_EN: Record<string, string[]> = {
  wood:  ["Education·Publishing","Fashion·Textiles","Design·Architecture","Agriculture·Forestry","Media·Print","Herbs·Florals"],
  fire:  ["IT·Digital","Beauty·Cosmetics","Hospitality·F&B","Electronics","Advertising·Entertainment","Thermal Energy"],
  earth: ["Real Estate","Construction","Insurance","Ceramics·Pottery","Horticulture","Consulting"],
  metal: ["Finance·Banking","Machinery·Auto","Jewelry","Medicine·Pharma","Security·Military","Heavy Tech"],
  water: ["Shipping·Logistics","Tourism·Spa","Fisheries·Beverage","Chemicals·Energy","Power Generation","Strategy·Analytics"],
};

const INDUSTRY_ZH: Record<string, string[]> = {
  wood:  ["教育·出版","時尚·紡織","設計·建築","農業·林業","媒體","花卉·草藥"],
  fire:  ["IT·數位","美容·化妝","餐飲·酒店","電子","廣告·娛樂","熱能"],
  earth: ["房地產","建築","保險","陶瓷","園藝","顧問"],
  metal: ["金融·銀行","機械·汽車","珠寶","醫療·製藥","安保·軍工","重工科技"],
  water: ["航運·物流","旅遊·水療","漁業·飲料","化工·能源","電力","策略分析"],
};

export type SpecialChartRules = {
  applicable: boolean;
  type_zh: string;
  type_en: string;
  type_th: string;
  friendly_elements: string[];
  hostile_elements: string[];
  summary_th: string;
  summary_en: string;
};

function buildSpecialChartRules(pillars: BaziPillarsAny, geJuStructure: string | null): SpecialChartRules {
  const dm = pillars.day.stem;
  const dmEl = STEM_ELEMENT[dm];
  const wealthEl = ELEMENT_CONTROLS[dmEl];
  const outputEl = ELEMENT_PRODUCES[dmEl];
  const powerEl = Object.keys(ELEMENT_CONTROLS).find(k => ELEMENT_CONTROLS[k] === dmEl) || "";
  const resourceEl = Object.keys(ELEMENT_PRODUCES).find(k => ELEMENT_PRODUCES[k] === dmEl) || "";
  const structure = geJuStructure || "";
  const actual = structure.replace(/^假/, "");
  const fakePrefix = structure.startsWith("假") ? "กึ่ง" : "";

  const standard = {
    applicable: false,
    type_zh: "正格", type_en: "Standard", type_th: "ปกติ",
    friendly_elements: [], hostile_elements: [],
    summary_th: "ดวงปกติ · ใช้กฎ用神มาตรฐาน", summary_en: "Standard chart · use regular yongshen rules",
  };

  if (actual === "從財格") {
    return {
      applicable: true,
      type_zh: structure,
      type_en: structure.startsWith("假") ? "Partial Follow Wealth" : "Follow Wealth",
      type_th: `${fakePrefix}ตามทรัพย์ · พิเศษ`,
      friendly_elements: [wealthEl, outputEl],
      hostile_elements: [dmEl, resourceEl],
      summary_th: `ดวงพิเศษ · DM อ่อนมากจน "${fakePrefix}ตามทรัพย์" → ธาตุ${ELEMENT_TH_MAP_LOCAL[wealthEl]}และ${ELEMENT_TH_MAP_LOCAL[outputEl]}เป็นมิตร`,
      summary_en: `Special chart · DM follows Wealth → ${wealthEl}/${outputEl} become friendly`,
    };
  }
  if (actual === "從殺格" || actual === "從官格") {
    return {
      applicable: true,
      type_zh: structure,
      type_en: actual === "從殺格" ? "Follow Killing" : "Follow Officer",
      type_th: `${fakePrefix}ตามอำนาจ · พิเศษ`,
      friendly_elements: [powerEl, wealthEl],
      hostile_elements: [dmEl, resourceEl],
      summary_th: `ดวงพิเศษ · DM ${fakePrefix}ตามอำนาจ → ธาตุ${ELEMENT_TH_MAP_LOCAL[powerEl]}เป็นมิตร`,
      summary_en: `Special chart · follows Power → ${powerEl} becomes friendly`,
    };
  }
  if (actual === "從兒格") {
    return {
      applicable: true,
      type_zh: structure,
      type_en: structure.startsWith("假") ? "Partial Follow Output" : "Follow Output",
      type_th: `${fakePrefix}ตามผลงาน · พิเศษ`,
      friendly_elements: [outputEl, wealthEl],
      hostile_elements: [resourceEl, powerEl],
      summary_th: `ดวงพิเศษ · DM ${fakePrefix}ตามผลงาน → ธาตุ${ELEMENT_TH_MAP_LOCAL[outputEl]}และ${ELEMENT_TH_MAP_LOCAL[wealthEl]}เป็นมิตร`,
      summary_en: `Special chart · follows Output → ${outputEl} becomes friendly`,
    };
  }

  const soleVigorous: Record<string, { element: string; en: string; th: string }> = {
    "曲直格": { element: "wood", en: "Wood Dominant", th: "ไม้ล้วน · พิเศษ" },
    "炎上格": { element: "fire", en: "Fire Dominant", th: "ไฟล้วน · พิเศษ" },
    "稼穡格": { element: "earth", en: "Earth Dominant", th: "ดินล้วน · พิเศษ" },
    "從革格": { element: "metal", en: "Metal Dominant", th: "ทองล้วน · พิเศษ" },
    "潤下格": { element: "water", en: "Water Dominant", th: "น้ำล้วน · พิเศษ" },
  };
  const sole = soleVigorous[structure];
  if (sole) {
    const el = sole.element;
    const child = ELEMENT_PRODUCES[el];
    const parent = Object.keys(ELEMENT_PRODUCES).find(k => ELEMENT_PRODUCES[k] === el) || "";
    const controller = Object.keys(ELEMENT_CONTROLS).find(k => ELEMENT_CONTROLS[k] === el) || "";
    return {
      applicable: true,
      type_zh: structure,
      type_en: sole.en,
      type_th: sole.th,
      friendly_elements: [el, child, parent].filter(Boolean),
      hostile_elements: [controller, ELEMENT_CONTROLS[el]].filter(Boolean),
      summary_th: `ดวงพิเศษ · พลัง${ELEMENT_TH_MAP_LOCAL[el]}กุมทั้งผัง → ใช้กฎเฉพาะของ${structure} ไม่อ่านเหมือนดวงปกติ`,
      summary_en: `Special chart · ${el} dominates the chart; use ${structure} rules, not standard balancing only`,
    };
  }

  if (structure === "從強格" || structure === "從旺格") {
    return {
      applicable: true,
      type_zh: structure,
      type_en: structure === "從強格" ? "Follow Strong" : "Follow Dominant",
      type_th: structure === "從強格" ? "ตามความแกร่ง · พิเศษ" : "ตามความ旺 · พิเศษ",
      friendly_elements: [dmEl, resourceEl, outputEl].filter(Boolean),
      hostile_elements: [wealthEl, powerEl].filter(Boolean),
      summary_th: `ดวงพิเศษ · ตัวตนและแรงหนุนแรงมาก → ธาตุ${ELEMENT_TH_MAP_LOCAL[dmEl]}และ${ELEMENT_TH_MAP_LOCAL[resourceEl]}เป็นแกน`,
      summary_en: `Special chart · strong DM follows its dominant support pattern`,
    };
  }

  if (/^化[木火土金水]格$/.test(structure)) {
    const zhEl = structure[1];
    const el = ({ 木:"wood", 火:"fire", 土:"earth", 金:"metal", 水:"water" } as Record<string, string>)[zhEl];
    const child = ELEMENT_PRODUCES[el];
    const parent = Object.keys(ELEMENT_PRODUCES).find(k => ELEMENT_PRODUCES[k] === el) || "";
    return {
      applicable: true,
      type_zh: structure,
      type_en: `Transform to ${el}`,
      type_th: `化${ELEMENT_TH_MAP_LOCAL[el]} · พิเศษ`,
      friendly_elements: [el, child, parent].filter(Boolean),
      hostile_elements: [Object.keys(ELEMENT_CONTROLS).find(k => ELEMENT_CONTROLS[k] === el) || ""].filter(Boolean),
      summary_th: `ดวงพิเศษ · ก้านฟ้า合化เป็น${ELEMENT_TH_MAP_LOCAL[el]} → อ่านตามพลังแปลง ไม่ใช่อ่านแค่ Day Master เดิม`,
      summary_en: `Special chart · heavenly stems transform into ${el}; read by transformation pattern`,
    };
  }

  if (structure === "魁罡格") {
    return {
      applicable: true,
      type_zh: structure,
      type_en: "Kui Gang",
      type_th: "魁罡 · พิเศษ",
      friendly_elements: [dmEl, outputEl].filter(Boolean),
      hostile_elements: [powerEl].filter(Boolean),
      summary_th: "ดวงพิเศษ · 魁罡 ต้องอ่านเรื่องแรงกดดัน วินัย และความสุดโต่งแยกจากดวงปกติ",
      summary_en: "Special chart · Kui Gang needs separate handling for pressure, discipline, and extremes",
    };
  }

  return standard;
}

const BRANCH_TH: Record<string, string> = {子:"ชวด",丑:"ฉลู",寅:"ขาล",卯:"เถาะ",辰:"มะโรง",巳:"มะเส็ง",午:"มะเมีย",未:"มะแม",申:"วอก",酉:"ระกา",戌:"จอ",亥:"กุน"};

export type SpousePalace = {
  day_branch: string;
  day_branch_th: string;
  /* r420 · i18n additive */
  day_branch_en?: string;
  day_branch_element: string;
  partner_element_th: string;
  partner_element_en?: string;
  partner_element_zh?: string;
  hidden_stems: string[];
  partner_traits_th: string;
  partner_traits_en: string;
  partner_traits_zh?: string;
  relationship_flags: string[];  /* clashes/combos with day branch */
};

function buildSpousePalace(pillars: BaziPillarsAny): SpousePalace {
  const dayBr = pillars.day.branch;
  const dayBrEl = BRANCH_ELEMENT[dayBr] || "earth";
  const hs = HIDDEN_STEMS[dayBr] || [];
  const flags: string[] = [];
  /* 19 พ.ค. Option α · 3p: skip hour pillar · spouse palace ใช้ day branch + other actives */
  const otherBranches: { branch: string; pillar: string }[] = [
    { branch: pillars.year.branch,  pillar: "year" },
    { branch: pillars.month.branch, pillar: "month" },
    ...(pillars.hour ? [{ branch: pillars.hour.branch, pillar: "hour" }] : []),
  ];
  for (const o of otherBranches) {
    if (SIX_CLASH[dayBr] === o.branch) flags.push(`六沖·${o.pillar}`);
    if (SIX_HE[dayBr] === o.branch) flags.push(`六合·${o.pillar}`);
    if (SIX_HARM[dayBr] === o.branch) flags.push(`六害·${o.pillar}`);
  }
  const TRAITS_TH: Record<string,string> = {
    wood: "อ่อนโยน · มีอุดมการณ์ · ชอบเรียนรู้",
    fire: "เปิดเผย · กระตือรือร้น · ใส่ใจ",
    earth: "มั่นคง · ดูแลครอบครัว · จริงใจ",
    metal: "มีระเบียบ · ตรงไปตรงมา · เด็ดเดี่ยว",
    water: "ลึก·ฉลาด · ปรับตัวเก่ง · มีสไตล์",
  };
  const TRAITS_EN: Record<string,string> = {
    wood: "Gentle · Idealistic · Curious",
    fire: "Open · Passionate · Caring",
    earth: "Stable · Family-oriented · Sincere",
    metal: "Organized · Direct · Decisive",
    water: "Deep · Adaptive · Stylish",
  };
  /* r420 · i18n additive · zh gloss ตามภาพธาตุในตำรา */
  const TRAITS_ZH: Record<string,string> = {
    wood: "溫和 · 有理想 · 好學",
    fire: "開朗 · 熱情 · 體貼",
    earth: "穩重 · 顧家 · 誠懇",
    metal: "有條理 · 直率 · 果斷",
    water: "深沉聰慧 · 善應變 · 有格調",
  };
  const BRANCH_EN: Record<string,string> = {子:"Rat",丑:"Ox",寅:"Tiger",卯:"Rabbit",辰:"Dragon",巳:"Snake",午:"Horse",未:"Goat",申:"Monkey",酉:"Rooster",戌:"Dog",亥:"Pig"};
  const ELEMENT_EN_LOCAL: Record<string,string> = {wood:"Wood",fire:"Fire",earth:"Earth",metal:"Metal",water:"Water"};
  const ELEMENT_ZH_LOCAL: Record<string,string> = {wood:"木",fire:"火",earth:"土",metal:"金",water:"水"};
  return {
    day_branch: dayBr,
    day_branch_th: BRANCH_TH[dayBr] || dayBr,
    day_branch_en: BRANCH_EN[dayBr] || dayBr,
    day_branch_element: dayBrEl,
    partner_element_th: ELEMENT_TH_MAP_LOCAL[dayBrEl] || dayBrEl,
    partner_element_en: ELEMENT_EN_LOCAL[dayBrEl] || dayBrEl,
    partner_element_zh: ELEMENT_ZH_LOCAL[dayBrEl] || dayBrEl,
    hidden_stems: hs,
    partner_traits_th: TRAITS_TH[dayBrEl] || "",
    partner_traits_en: TRAITS_EN[dayBrEl] || "",
    partner_traits_zh: TRAITS_ZH[dayBrEl] || "",
    relationship_flags: flags,
  };
}

export type CareerIndustry = {
  primary_element: string;
  yongshen_element: string;
  industries_th: string[];
  industries_en: string[];
  industries_zh: string[];
  advice_th: string;
  advice_en: string;
  /* r420 · i18n additive */
  advice_zh?: string;
};

function buildCareerIndustry(pillars: BaziPillars, yongshenElement: string | null): CareerIndustry {
  const dmEl = STEM_ELEMENT[pillars.day.stem];
  const pickEl = (yongshenElement && yongshenElement in INDUSTRY_TH ? yongshenElement : dmEl);
  return {
    primary_element: dmEl,
    yongshen_element: pickEl,
    industries_th: INDUSTRY_TH[pickEl] || [],
    industries_en: INDUSTRY_EN[pickEl] || [],
    industries_zh: INDUSTRY_ZH[pickEl] || [],
    advice_th: `อาชีพธาตุ${ELEMENT_TH_MAP_LOCAL[pickEl] || pickEl}เหมาะกับดวงคุณ · ${ELEMENT_TH_MAP_LOCAL[pickEl]||pickEl}เสริม用神`,
    advice_en: `${pickEl} industries align with your chart · supports yongshen`,
    advice_zh: `${({wood:"木",fire:"火",earth:"土",metal:"金",water:"水"} as Record<string,string>)[pickEl] || pickEl}行事業與命局相合 · 生扶用神`,
  };
}

const ELEMENT_TH_MAP_LOCAL: Record<string, string> = {wood:"ไม้",fire:"ไฟ",earth:"ดิน",metal:"ทอง",water:"น้ำ"};

export type HealthMapping = {
  dm_element: string;
  dm_organs_th: string;
  dm_organs_zh: string;
  /* r420 · i18n additive */
  dm_organs_en?: string;
  weak_organs: { element: string; organs_th: string; organs_zh: string; organs_en?: string; reason_th: string; reason_en?: string; reason_zh?: string }[];
  caution_organs: { element: string; organs_th: string; organs_zh: string; organs_en?: string; reason_th: string; reason_en?: string; reason_zh?: string }[];
  summary_th: string;
  summary_en?: string;
  summary_zh?: string;
};

/* r420 · i18n additive · อวัยวะ TCM ภาษาอังกฤษ (ศัพท์แพทย์แผนจีนสากล) */
const TCM_ORGAN_EN: Record<string, { yin: string; yang: string; system: string }> = {
  wood:  { yin: "Liver",   yang: "Gallbladder",     system: "tendons · eyes" },
  fire:  { yin: "Heart",   yang: "Small intestine", system: "blood vessels · tongue" },
  earth: { yin: "Spleen",  yang: "Stomach",         system: "muscles · mouth" },
  metal: { yin: "Lungs",   yang: "Large intestine", system: "skin · nose" },
  water: { yin: "Kidneys", yang: "Bladder",         system: "bones · ears" },
};
const ELEMENT_EN_MAP_LOCAL: Record<string, string> = {wood:"Wood",fire:"Fire",earth:"Earth",metal:"Metal",water:"Water"};
const ELEMENT_ZH_MAP_LOCAL: Record<string, string> = {wood:"木",fire:"火",earth:"土",metal:"金",water:"水"};

function buildHealthMapping(pillars: BaziPillars, elementCounts: ElementCounts, strengthPct: number): HealthMapping {
  const dmEl = STEM_ELEMENT[pillars.day.stem];
  const total = elementCounts.wood + elementCounts.fire + elementCounts.earth + elementCounts.metal + elementCounts.water || 1;
  const avg = total / 5;
  const weak: HealthMapping["weak_organs"] = [];
  const caution: HealthMapping["caution_organs"] = [];
  const ELS = ["wood","fire","earth","metal","water"] as const;
  for (const el of ELS) {
    const v = elementCounts[el];
    const organ = TCM_ORGAN[el];
    if (v < avg * 0.4) {
      const oe = TCM_ORGAN_EN[el];
      weak.push({
        element: el,
        organs_th: `${organ.yin_th}·${organ.yang_th} (${organ.system_th})`,
        organs_zh: `${organ.yin_zh}·${organ.yang_zh}·${organ.system_zh}`,
        organs_en: `${oe.yin}·${oe.yang} (${oe.system})`,
        reason_th: `ธาตุ${ELEMENT_TH_MAP_LOCAL[el]}อ่อน · อวัยวะนี้ต้องเสริม`,
        reason_en: `${ELEMENT_EN_MAP_LOCAL[el]} is weak · these organs need support`,
        reason_zh: `${ELEMENT_ZH_MAP_LOCAL[el]}弱 · 此臟腑宜補養`,
      });
    } else if (v > avg * 1.7) {
      const oe = TCM_ORGAN_EN[el];
      caution.push({
        element: el,
        organs_th: `${organ.yin_th}·${organ.yang_th}`,
        organs_zh: `${organ.yin_zh}·${organ.yang_zh}`,
        organs_en: `${oe.yin}·${oe.yang}`,
        reason_th: `ธาตุ${ELEMENT_TH_MAP_LOCAL[el]}หนักเกิน · ระวัง${organ.yin_th}-${organ.yang_th}ทำงานหนัก`,
        reason_en: `${ELEMENT_EN_MAP_LOCAL[el]} is excessive · watch for overworked ${oe.yin}/${oe.yang}`,
        reason_zh: `${ELEMENT_ZH_MAP_LOCAL[el]}過旺 · 防${organ.yin_zh}${organ.yang_zh}過勞`,
      });
    }
  }
  const dmOrgan = TCM_ORGAN[dmEl];
  const dmOrganEn = TCM_ORGAN_EN[dmEl];
  const ctrlOrgan = TCM_ORGAN[ELEMENT_CONTROLS[dmEl]];
  const ctrlOrganEn = TCM_ORGAN_EN[ELEMENT_CONTROLS[dmEl]];
  return {
    dm_element: dmEl,
    dm_organs_th: `${dmOrgan.yin_th}·${dmOrgan.yang_th}`,
    dm_organs_zh: `${dmOrgan.yin_zh}·${dmOrgan.yang_zh}`,
    dm_organs_en: `${dmOrganEn.yin}·${dmOrganEn.yang}`,
    weak_organs: weak,
    caution_organs: caution,
    summary_th: strengthPct < 35
      ? `วันเจ้าธาตุ${ELEMENT_TH_MAP_LOCAL[dmEl]}อ่อน · ${dmOrgan.yin_th}/${dmOrgan.yang_th}อาจเปราะ · ดูแล${dmOrgan.system_th}`
      : strengthPct > 65
      ? `วันเจ้าธาตุ${ELEMENT_TH_MAP_LOCAL[dmEl]}แกร่ง · ${dmOrgan.yin_th}/${dmOrgan.yang_th}แข็งแรง · ระวัง${TCM_ORGAN[ELEMENT_CONTROLS[dmEl]]?.yin_th||""}ที่ถูกควบคุม`
      : `วันเจ้าธาตุ${ELEMENT_TH_MAP_LOCAL[dmEl]}สมดุล · ดูแล${dmOrgan.yin_th}·${dmOrgan.yang_th}เป็นพื้นฐาน`,
    summary_en: strengthPct < 35
      ? `${ELEMENT_EN_MAP_LOCAL[dmEl]} Day Master is weak · ${dmOrganEn.yin}/${dmOrganEn.yang} may be fragile · care for ${dmOrganEn.system}`
      : strengthPct > 65
      ? `${ELEMENT_EN_MAP_LOCAL[dmEl]} Day Master is strong · ${dmOrganEn.yin}/${dmOrganEn.yang} are robust · watch the controlled ${ctrlOrganEn?.yin || ""}`
      : `${ELEMENT_EN_MAP_LOCAL[dmEl]} Day Master is balanced · maintain ${dmOrganEn.yin}·${dmOrganEn.yang} as the foundation`,
    summary_zh: strengthPct < 35
      ? `日主${ELEMENT_ZH_MAP_LOCAL[dmEl]}弱 · ${dmOrgan.yin_zh}${dmOrgan.yang_zh}易虛 · 宜養${dmOrgan.system_zh}`
      : strengthPct > 65
      ? `日主${ELEMENT_ZH_MAP_LOCAL[dmEl]}旺 · ${dmOrgan.yin_zh}${dmOrgan.yang_zh}強健 · 防所剋之${ctrlOrgan?.yin_zh || ""}受損`
      : `日主${ELEMENT_ZH_MAP_LOCAL[dmEl]}中和 · 平日保養${dmOrgan.yin_zh}${dmOrgan.yang_zh}為本`,
  };
}

/* ── 流年 100-year timeline · ขยายตำราโบราณ 15 พ.ค. 2026 ─────── */
export type LiuNianEntry = {
  year: number;
  age: number;
  pillar: { stem: string; branch: string };
  element: string;
  branch_element: string;
  hidden_stems: TransitHiddenStem[];
  bazi_year_start: { name: string; date: string } | null;
  bazi_year_end: { name: string; date: string } | null;
  calendar_note: string;
  ten_god: string | null;
  vs_day_branch: string[];  /* clash · he · harm · destroy · ban_he */
  flag: "auspicious" | "cautious" | "neutral";
  /* 64 卦 hexagram ของปี · Mei Hua Yi Shu */
  hex?: {
    num: number;
    zh: string; th: string; en: string;
    symbol: string;
    upper_zh: string; lower_zh: string;
    changing_line: number;
  } | null;
};

export type TransitHiddenStem = {
  stem: string;
  element: string;
  ten_god: string | null;
  useful_role?: "yong" | "xi" | "ji" | "neutral";
};

export type TransitImpact = {
  type: string;
  type_th: string;
  /* r420 · i18n additive */
  type_en?: string;
  pair: string;
  target: "year" | "month" | "day" | "hour" | "luck";
  target_th: string;
  palace_th: string;
  domains_th: string[];
  strength: "low" | "medium" | "high" | "critical";
  summary_th: string;
  summary_en?: string;
  summary_zh?: string;
};

export type LiuYueEntry = {
  year: number;
  month: number;
  label: string;
  pillar: { stem: string; branch: string };
  element: string;
  branch_element: string;
  stem_useful_role?: "yong" | "xi" | "ji" | "neutral";
  branch_useful_role?: "yong" | "xi" | "ji" | "neutral";
  hidden_stems: TransitHiddenStem[];
  jieqi_start: { name: string; date: string } | null;
  jieqi_end: { name: string; date: string } | null;
  month_method: "jieqi_major_term" | "mid_month_fallback";
  ten_god: string | null;
  vs_day_branch: string[];
  vs_luck_branch: string[];
  impacts: TransitImpact[];
  flag: "auspicious" | "cautious" | "neutral";
};

export type LuckDecadeYearEntry = LiuNianEntry & {
  stem_useful_role?: "yong" | "xi" | "ji" | "neutral";
  branch_useful_role?: "yong" | "xi" | "ji" | "neutral";
  vs_luck_branch: string[];
  impacts: TransitImpact[];
  months: LiuYueEntry[];
};

export type LuckDecadeDrilldown = {
  luck_index: number;
  luck_pillar: { stem: string; branch: string };
  age_start: number;
  age_end: number;
  age_start_detail?: string;
  age_end_detail?: string;
  start_date?: string;
  end_date?: string;
  timing_method?: string;
  direction?: "forward" | "backward";
  direction_th?: string;
  year_start: number;
  year_end: number;
  years: LuckDecadeYearEntry[];
};

type TransitRoleResolver = (element: string) => "yong" | "xi" | "ji" | "neutral";

function hiddenStemDetails(branch: string, dm: string, usefulRole?: TransitRoleResolver): TransitHiddenStem[] {
  return (HIDDEN_STEMS[branch] || []).map((stem) => {
    const element = STEM_ELEMENT[stem] || "unknown";
    return {
      stem,
      element,
      ten_god: tenGodOf(dm, stem),
      useful_role: usefulRole ? usefulRole(element) : undefined,
    };
  });
}

function baziYearBoundary(year: number): {
  start: { name: string; date: string } | null;
  end: { name: string; date: string } | null;
  startDate: Date | null;
  endDate: Date | null;
} {
  try {
    const start = tyme.SolarTerm.fromName(year, "立春").getJulianDay().getSolarTime();
    const end = tyme.SolarTerm.fromName(year + 1, "立春").getJulianDay().getSolarTime();
    return {
      start: { name: "立春", date: formatSolarTimeLike(start) },
      end: { name: "立春", date: formatSolarTimeLike(end) },
      startDate: solarTimeToDate(start),
      endDate: solarTimeToDate(end),
    };
  } catch (_) {
    return { start: null, end: null, startDate: null, endDate: null };
  }
}

function buildLiuNianTimeline(pillars: BaziPillars, baseYear: number, span: number = 10, birthYear?: number): LiuNianEntry[] {
  const dm = pillars.day.stem;
  const dayBranch = pillars.day.branch;
  const stems = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
  const branches = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
  const out: LiuNianEntry[] = [];
  /* dynamic require to keep TS happy */
  let yearHex: any = null;
  try { yearHex = require("./year-hexagram"); } catch (_) {}
  for (let i = 0; i < span; i++) {
    const y = baseYear + i;
    const offset = ((y - 1984) % 60 + 60) % 60;
    const stem = stems[offset % 10];
    const branch = branches[offset % 12];
    const ten_god = tenGodOf(dm, stem);
    const vs: string[] = [];
    if (SIX_CLASH[dayBranch] === branch) vs.push("六沖");
    if (SIX_HE[dayBranch] === branch) vs.push("六合");
    if (SIX_HARM[dayBranch] === branch) vs.push("六害");
    if (SIX_DESTROY[dayBranch] === branch) vs.push("六破");
    for (const r of BAN_HE_PAIRS) {
      if ((r.pair[0] === dayBranch && r.pair[1] === branch) ||
          (r.pair[0] === branch && r.pair[1] === dayBranch)) {
        vs.push("半合·"+r.element);
      }
    }
    /* Simple flag */
    let flag: LiuNianEntry["flag"] = "neutral";
    if (vs.some(t => t === "六合" || t.startsWith("半合"))) flag = "auspicious";
    else if (vs.some(t => t === "六沖" || t === "六害" || t === "六破")) flag = "cautious";
    /* hex per year */
    let hex: LiuNianEntry["hex"] = null;
    if (yearHex?.hexagramForStemBranch) {
      const h = yearHex.hexagramForStemBranch(stem, branch);
      if (h?.hex) {
        hex = {
          num: h.num,
          zh: h.hex.zh, th: h.hex.th, en: h.hex.en,
          symbol: h.hex.symbol,
          upper_zh: h.upper.zh, lower_zh: h.lower.zh,
          changing_line: h.changing_line,
        };
      }
    }
    const age = birthYear ? (y - birthYear) : 0;
    const boundary = baziYearBoundary(y);
    out.push({
      year: y,
      age,
      pillar: { stem, branch },
      element: STEM_ELEMENT[stem] || "unknown",
      branch_element: BRANCH_ELEMENT[branch] || "unknown",
      hidden_stems: hiddenStemDetails(branch, dm),
      bazi_year_start: boundary.start,
      bazi_year_end: boundary.end,
      calendar_note: boundary.start
        ? `ปีปาจื้อ ${stem}${branch} เริ่มที่${boundary.start.name} ${boundary.start.date}; ม.ค.ก่อน立春ยังเป็นปีปาจื้อก่อนหน้า`
        : "ปีปาจื้อเริ่มที่立春; ไม่มีเวลาขอบปีในระบบ",
      ten_god,
      vs_day_branch: vs,
      flag,
      hex,
    });
  }
  return out;
}

function branchTransitTags(dayBranch: string, branch: string): string[] {
  const vs: string[] = [];
  if (SIX_CLASH[dayBranch] === branch) vs.push("六沖");
  if (SIX_HE[dayBranch] === branch) vs.push("六合");
  if (SIX_HARM[dayBranch] === branch) vs.push("六害");
  if (SIX_DESTROY[dayBranch] === branch) vs.push("六破");
  for (const r of BAN_HE_PAIRS) {
    if ((r.pair[0] === dayBranch && r.pair[1] === branch) ||
        (r.pair[0] === branch && r.pair[1] === dayBranch)) {
      vs.push("半合·"+r.element);
    }
  }
  return vs;
}

function transitFlag(vs: string[]): "auspicious" | "cautious" | "neutral" {
  if (vs.some(t => t === "六沖" || t === "六害" || t === "六破")) return "cautious";
  if (vs.some(t => t === "六合" || t.startsWith("半合"))) return "auspicious";
  return "neutral";
}

const TRANSIT_TYPE_TH: Record<string, string> = {
  伏吟: "เสาซ้ำเรื่องเดิม",
  反吟: "เสาพลิกแรง",
  六沖: "ปะทะ",
  六合: "จับคู่",
  六害: "ทำร้ายแทรก",
  六破: "บั่นทอน",
  半合: "ครึ่งผสาน",
  五合: "ก้านฟ้าผสาน",
  天克: "ก้านฟ้าขัด",
};

const TRANSIT_TARGET_TH: Record<string, string> = {
  year: "เสาปี 年",
  month: "เสาเดือน 月",
  day: "เสาวัน 日",
  hour: "เสายาม 時",
  luck: "วัยจร 大運",
};

const TRANSIT_PALACE_TH: Record<string, string> = {
  year: "祖宮/บ้านเดิม",
  month: "父母兄弟宮/งาน-พ่อแม่",
  day: "夫妻宮/ตัวตน-คู่ครอง",
  hour: "子女宮/ลูก-บั้นปลาย",
  luck: "大運/จังหวะใหญ่สิบปี",
};

const TRANSIT_DOMAIN_TH: Record<string, string[]> = {
  year: ["บ้านเดิม", "เครือญาติ", "ภาพรวม"],
  month: ["งาน", "พ่อแม่", "อาชีพ"],
  day: ["ตัวตน", "คู่ครอง", "บ้าน"],
  hour: ["ลูก", "บั้นปลาย", "สุขภาพ"],
  luck: ["วัยจร", "ทิศทางสิบปี", "จังหวะใหญ่"],
};

/* r420 · i18n additive · EN ศัพท์วงการ BaZi · ZH ตัวตำรา · ใช้ประกอบ summary_en/summary_zh เท่านั้น ไม่แตะ logic */
const TRANSIT_TYPE_EN: Record<string, string> = {
  伏吟: "Fu Yin (repeating pillar)",
  反吟: "Fan Yin (reversal)",
  六沖: "Clash",
  六合: "Combine",
  六害: "Harm",
  六破: "Destruction",
  半合: "Half combine",
  五合: "Stem combine",
  天克: "Stem clash",
};
const TRANSIT_TARGET_EN: Record<string, string> = {
  year: "Year pillar 年",
  month: "Month pillar 月",
  day: "Day pillar 日",
  hour: "Hour pillar 時",
  luck: "Luck cycle 大運",
};
const TRANSIT_TARGET_ZH: Record<string, string> = {
  year: "年柱",
  month: "月柱",
  day: "日柱",
  hour: "時柱",
  luck: "大運",
};
const TRANSIT_DOMAIN_EN: Record<string, string[]> = {
  year: ["family roots", "relatives", "overall"],
  month: ["work", "parents", "career"],
  day: ["self", "spouse", "home"],
  hour: ["children", "later years", "health"],
  luck: ["luck cycle", "ten-year direction", "major rhythm"],
};
const TRANSIT_DOMAIN_ZH: Record<string, string[]> = {
  year: ["祖業", "親族", "全局"],
  month: ["事業", "父母", "職涯"],
  day: ["自身", "配偶", "家宅"],
  hour: ["子女", "晚運", "健康"],
  luck: ["大運", "十年方向", "大節奏"],
};

function transitStrength(type: string, target: string): TransitImpact["strength"] {
  if ((type === "伏吟" || type === "反吟") && (target === "day" || target === "luck")) return "critical";
  if (type === "伏吟" || type === "反吟") return "high";
  if (type === "六沖" && (target === "day" || target === "month")) return "high";
  if (type === "六沖") return "medium";
  if (type === "六害" || type === "六破" || type === "天克") return "medium";
  return "low";
}

function buildTransitImpacts(
  pillars: BaziPillarsAny,
  transit: { stem: string; branch: string },
  luck?: { stem: string; branch: string },
): TransitImpact[] {
  const out: TransitImpact[] = [];
  const pushImpact = (typeRaw: string, target: "year" | "month" | "day" | "hour" | "luck", pair: string) => {
    const type = typeRaw.includes("半合") ? "半合" : typeRaw;
    const strength = transitStrength(type, target);
    const targetTh = TRANSIT_TARGET_TH[target] || target;
    const domains = TRANSIT_DOMAIN_TH[target] || ["ภาพรวม"];
    out.push({
      type,
      type_th: TRANSIT_TYPE_TH[type] || type,
      type_en: TRANSIT_TYPE_EN[type] || type,
      pair,
      target,
      target_th: targetTh,
      palace_th: TRANSIT_PALACE_TH[target] || targetTh,
      domains_th: domains,
      strength,
      summary_th: `${TRANSIT_TYPE_TH[type] || type} ${pair} กระทบ${targetTh} · ${domains.join("/")}`,
      summary_en: `${TRANSIT_TYPE_EN[type] || type} ${pair} affects ${TRANSIT_TARGET_EN[target] || target} · ${(TRANSIT_DOMAIN_EN[target] || ["overall"]).join("/")}`,
      summary_zh: `${type} ${pair} 動${TRANSIT_TARGET_ZH[target] || target} · ${(TRANSIT_DOMAIN_ZH[target] || ["全局"]).join("/")}`,
    });
  };
  const targets: Array<{ key: "year" | "month" | "day" | "hour" | "luck"; stem: string; branch: string }> = [
    ...activeKeys(pillars).map((key) => ({ key: key as "year" | "month" | "day" | "hour", stem: pillars[key]!.stem, branch: pillars[key]!.branch })),
    ...(luck ? [{ key: "luck" as const, stem: luck.stem, branch: luck.branch }] : []),
  ];
  for (const t of targets) {
    const full = classifyFanFu({ stem: t.stem, branch: t.branch }, transit);
    if (full === "伏吟" || full === "反吟") pushImpact(full, t.key, `${t.stem}${t.branch}↔${transit.stem}${transit.branch}`);
    for (const tag of branchTransitTags(t.branch, transit.branch)) {
      const base = tag.split("·")[0];
      pushImpact(base, t.key, `${t.branch}${transit.branch}`);
    }
    if (STEM_CLASH[t.stem] === transit.stem) pushImpact("天克", t.key, `${t.stem}${transit.stem}`);
    const combo = STEM_COMBOS[t.stem];
    if (combo?.partner === transit.stem) pushImpact("五合", t.key, `${t.stem}${transit.stem}`);
  }
  return out.sort((a, b) => {
    const rank: Record<TransitImpact["strength"], number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return rank[a.strength] - rank[b.strength];
  });
}

function yearStem(year: number): string {
  const offset = ((year - 1984) % 60 + 60) % 60;
  return STEMS_ORDER[offset % 10];
}

const LIU_YUE_MAJOR_TERMS = [
  { no: 1, name: "立春", yearOffset: 0 }, { no: 2, name: "惊蛰", yearOffset: 0 },
  { no: 3, name: "清明", yearOffset: 0 }, { no: 4, name: "立夏", yearOffset: 0 },
  { no: 5, name: "芒种", yearOffset: 0 }, { no: 6, name: "小暑", yearOffset: 0 },
  { no: 7, name: "立秋", yearOffset: 0 }, { no: 8, name: "白露", yearOffset: 0 },
  { no: 9, name: "寒露", yearOffset: 0 }, { no: 10, name: "立冬", yearOffset: 0 },
  { no: 11, name: "大雪", yearOffset: 0 }, { no: 12, name: "小寒", yearOffset: 1 },
];

function formatSolarTimeLike(st: any): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${st.getYear()}-${pad(st.getMonth())}-${pad(st.getDay())} ${pad(st.getHour())}:${pad(st.getMinute())}`;
}

function solarTimeToDate(st: any): Date {
  return new Date(Date.UTC(st.getYear(), st.getMonth() - 1, st.getDay(), st.getHour(), st.getMinute(), st.getSecond?.() || 0));
}

function dateToYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addAgeYears(birthDate: Date, age: number): Date {
  const years = Math.floor(age);
  const frac = age - years;
  const out = new Date(birthDate.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  out.setUTCDate(out.getUTCDate() + Math.round(frac * 365.2425));
  return out;
}

function ageDetail(age: number): string {
  const years = Math.floor(age);
  const monthFloat = (age - years) * 12;
  const months = Math.floor(monthFloat);
  const days = Math.round((monthFloat - months) * 30.4375);
  return `${years} ปี${months ? ` ${months} เดือน` : ""}${days ? ` ${days} วัน` : ""}`;
}

function monthPillarMidMonth(year: number, month: number): { stem: string; branch: string } {
  /* Mid-month anchor: avoids Jieqi boundary ambiguity. Jan belongs to 丑 month of previous solar year. */
  const branchesByGregorianMid = ["丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子"];
  const branch = branchesByGregorianMid[Math.max(0, Math.min(11, month - 1))];
  const stemStartByYearStem: Record<string, string> = {
    甲: "丙", 己: "丙",
    乙: "戊", 庚: "戊",
    丙: "庚", 辛: "庚",
    丁: "壬", 壬: "壬",
    戊: "甲", 癸: "甲",
  };
  const solarYearStem = yearStem(month === 1 ? year - 1 : year);
  const startStem = stemStartByYearStem[solarYearStem] || "丙"; // 寅 month stem
  const startIdx = STEMS_ORDER.indexOf(startStem);
  const offsetFromYin = month === 1 ? 11 : month - 2;
  const stem = STEMS_ORDER[(startIdx + offsetFromYin + 120) % 10];
  return { stem, branch };
}

function liuYuePillarByJieqi(year: number, month: number): {
  pillar: { stem: string; branch: string };
  jieqi_start: { name: string; date: string } | null;
  jieqi_end: { name: string; date: string } | null;
  month_method: "jieqi_major_term" | "mid_month_fallback";
} {
  try {
    const startCfg = LIU_YUE_MAJOR_TERMS[Math.max(0, Math.min(11, month - 1))];
    const endCfg = month === 12 ? LIU_YUE_MAJOR_TERMS[0] : LIU_YUE_MAJOR_TERMS[month];
    const startTerm = tyme.SolarTerm.fromName(year + startCfg.yearOffset, startCfg.name);
    const endTerm = tyme.SolarTerm.fromName(year + (month === 12 ? 1 : endCfg.yearOffset), endCfg.name);
    const startTime = startTerm.getJulianDay().getSolarTime();
    const endTime = endTerm.getJulianDay().getSolarTime();
    const monthName = startTime.next(3600).getLunarHour().getEightChar().getMonth().getName();
    return {
      pillar: { stem: monthName[0], branch: monthName[1] },
      jieqi_start: { name: startCfg.name, date: formatSolarTimeLike(startTime) },
      jieqi_end: { name: endCfg.name, date: formatSolarTimeLike(endTime) },
      month_method: "jieqi_major_term",
    };
  } catch (_) {
    const gregYear = month === 12 ? year + 1 : year;
    const gregMonth = month === 12 ? 1 : month + 1;
    return {
      pillar: monthPillarMidMonth(gregYear, gregMonth),
      jieqi_start: null,
      jieqi_end: null,
      month_method: "mid_month_fallback",
    };
  }
}

function buildLiuYueForYear(
  pillars: BaziPillars,
  year: number,
  luck?: { stem: string; branch: string },
  usefulRole?: TransitRoleResolver,
): LiuYueEntry[] {
  const dm = pillars.day.stem;
  const dayBranch = pillars.day.branch;
  const out: LiuYueEntry[] = [];
  for (let month = 1; month <= 12; month++) {
    const byJieqi = liuYuePillarByJieqi(year, month);
    const pillar = byJieqi.pillar;
    const vsDay = branchTransitTags(dayBranch, pillar.branch);
    const vsLuck = luck ? branchTransitTags(luck.branch, pillar.branch) : [];
    const stemElement = STEM_ELEMENT[pillar.stem] || "unknown";
    const branchElement = BRANCH_ELEMENT[pillar.branch] || "unknown";
    out.push({
      year,
      month,
      label: `${year}-L${String(month).padStart(2, "0")}`,
      pillar,
      element: stemElement,
      branch_element: branchElement,
      stem_useful_role: usefulRole ? usefulRole(stemElement) : undefined,
      branch_useful_role: usefulRole ? usefulRole(branchElement) : undefined,
      hidden_stems: hiddenStemDetails(pillar.branch, dm, usefulRole),
      jieqi_start: byJieqi.jieqi_start,
      jieqi_end: byJieqi.jieqi_end,
      month_method: byJieqi.month_method,
      ten_god: tenGodOf(dm, pillar.stem),
      vs_day_branch: vsDay,
      vs_luck_branch: vsLuck,
      impacts: buildTransitImpacts(pillars, pillar, luck),
      flag: transitFlag([...vsDay, ...vsLuck]),
    });
  }
  return out;
}

function annotateLuckPillarTiming(lp: LuckPillar[], birthDate?: Date): LuckPillar[] {
  if (!birthDate) return lp;
  const birthYear = birthDate.getUTCFullYear();
  return lp.map((p) => {
    const startDate = addAgeYears(birthDate, p.age_start);
    const endDate = addAgeYears(birthDate, p.age_start + 10);
    return {
      ...p,
      age_start_detail: ageDetail(p.age_start),
      age_end_detail: ageDetail(p.age_start + 10),
      start_date: dateToYmd(startDate),
      end_date: dateToYmd(endDate),
      timing_method: "tyme4ts ChildLimit.fromSolarTime → age_start; date = birth datetime + age_start",
      year_start: birthYear + Math.floor(p.age_start),
      year_end: birthYear + Math.ceil(p.age_start + 10),
    };
  });
}

function buildLuckDecadeDrilldown(
  pillars: BaziPillars,
  lp: LuckPillar[],
  birthYear?: number,
  usefulRole?: TransitRoleResolver,
): LuckDecadeDrilldown[] {
  if (!birthYear) return [];
  return lp.map((p, idx) => {
    const luckStart = p.start_date ? new Date(`${p.start_date}T00:00:00Z`) : null;
    const luckEnd = p.end_date ? new Date(`${p.end_date}T00:00:00Z`) : null;
    const candidateStart = p.year_start ?? Math.floor(birthYear + p.age_start);
    const candidateEnd = p.year_end ?? Math.ceil(birthYear + p.age_start + 10);
    const yearNums: number[] = [];
    for (let y = candidateStart - 1; y <= candidateEnd + 1; y++) {
      const boundary = baziYearBoundary(y);
      if (luckStart && luckEnd && boundary.startDate && boundary.endDate) {
        if (boundary.startDate < luckEnd && boundary.endDate > luckStart) yearNums.push(y);
      } else if (y >= candidateStart && y <= candidateStart + 9) {
        yearNums.push(y);
      }
    }
    const years = yearNums
      .map((y) => buildLiuNianTimeline(pillars, y, 1, birthYear)[0])
      .map((y) => {
        const vsLuck = branchTransitTags(p.branch, y.pillar.branch);
        const mergedVs = [...y.vs_day_branch, ...vsLuck];
        const stemElement = STEM_ELEMENT[y.pillar.stem] || "unknown";
        const branchElement = BRANCH_ELEMENT[y.pillar.branch] || "unknown";
        const luckPillar = { stem: p.stem, branch: p.branch };
        return {
          ...y,
          element: stemElement,
          branch_element: branchElement,
          stem_useful_role: usefulRole ? usefulRole(stemElement) : undefined,
          branch_useful_role: usefulRole ? usefulRole(branchElement) : undefined,
          hidden_stems: hiddenStemDetails(y.pillar.branch, pillars.day.stem, usefulRole),
          vs_luck_branch: vsLuck,
          impacts: buildTransitImpacts(pillars, y.pillar, luckPillar),
          flag: transitFlag(mergedVs),
          months: buildLiuYueForYear(pillars, y.year, luckPillar, usefulRole),
        };
      });
    return {
      luck_index: idx,
      luck_pillar: { stem: p.stem, branch: p.branch },
      age_start: p.age_start,
      age_end: p.age_end,
      age_start_detail: p.age_start_detail,
      age_end_detail: p.age_end_detail,
      start_date: p.start_date,
      end_date: p.end_date,
      timing_method: p.timing_method,
      direction: p.direction,
      direction_th: p.direction_th,
      year_start: years[0]?.year ?? candidateStart,
      year_end: years[years.length - 1]?.year ?? candidateEnd,
      years,
    };
  });
}

function buildInteractions(pillars: BaziPillarsAny): InteractionFlag[] {
  const pkeys = activeKeys(pillars);
  const out: InteractionFlag[] = [];
  for (let i = 0; i < pkeys.length; i++) {
    for (let j = i + 1; j < pkeys.length; j++) {
      const a = pillars[pkeys[i]]!.branch;
      const b = pillars[pkeys[j]]!.branch;
      if (SIX_CLASH[a] === b) out.push({ type: "六沖", pair: [a, b], pillars_pair: [pkeys[i], pkeys[j]] });
      if (SIX_HE[a] === b) out.push({ type: "六合", pair: [a, b], pillars_pair: [pkeys[i], pkeys[j]] });
      if (SIX_HARM[a] === b) out.push({ type: "六害", pair: [a, b], pillars_pair: [pkeys[i], pkeys[j]] });
      if (SIX_DESTROY[a] === b) out.push({ type: "六破", pair: [a, b], pillars_pair: [pkeys[i], pkeys[j]] });
    }
  }
  return out;
}

export type PunishmentFlag = {
  type: "三刑" | "自刑" | "子卯刑";
  branches: string[];
};

function buildPunishments(pillars: BaziPillarsAny): PunishmentFlag[] {
  /* 19 พ.ค. Option α · 3p: ใช้ active branches เท่านั้น */
  const branches = activeKeys(pillars).map(k => pillars[k]!.branch);
  const flags: PunishmentFlag[] = [];

  const ungrateful = ["寅", "巳", "申"].filter((b) => branches.includes(b));
  if (ungrateful.length >= 2) flags.push({ type: "三刑", branches: ungrateful });
  const earth = ["丑", "戌", "未"].filter((b) => branches.includes(b));
  if (earth.length >= 2) flags.push({ type: "三刑", branches: earth });

  const selfSet = ["辰", "午", "酉", "亥"];
  for (const s of selfSet) {
    if (branches.filter((b) => b === s).length >= 2) flags.push({ type: "自刑", branches: [s, s] });
  }
  if (branches.includes("子") && branches.includes("卯")) flags.push({ type: "子卯刑", branches: ["子", "卯"] });
  return flags;
}

function buildCombinations(pillars: BaziPillarsAny) {
  const pkeys = activeKeys(pillars);
  const branches = pkeys.map(k => pillars[k]!.branch);
  const san_he: string[][] = [];
  for (const set of SAN_HE_SETS) {
    const present = set.filter((b) => branches.includes(b));
    if (present.length >= 2) san_he.push(present);
  }
  const san_hui: string[][] = [];
  for (const set of SAN_HUI_SETS) {
    const present = set.filter((b) => branches.includes(b));
    if (present.length >= 2) san_hui.push(present);
  }
  /* G6 · 半合 detection · pair ของ pillar ที่ตรงกับ BAN_HE_PAIRS (cardinal + flanking) */
  const ban_he: Array<{ pair: [string, string]; element: "water"|"fire"|"wood"|"metal"; pillars_pair: [string, string] }> = [];
  for (let i = 0; i < pkeys.length; i++) {
    for (let j = i + 1; j < pkeys.length; j++) {
      const a = branches[i], b = branches[j];
      for (const rule of BAN_HE_PAIRS) {
        if ((rule.pair[0] === a && rule.pair[1] === b) || (rule.pair[0] === b && rule.pair[1] === a)) {
          ban_he.push({ pair: [a, b], element: rule.element, pillars_pair: [pkeys[i] as string, pkeys[j] as string] });
        }
      }
    }
  }
  return { san_he, san_hui, ban_he };
}

export type JishenInfo = {
  elements: string[]; // jishen elements (outside top-3 useful god)
  wealth_role: "yongshen" | "xishen" | "jishen" | "neutral";
};

function buildJishen(dayMaster: string, adjustedYongshenElements?: string[] | null): JishenInfo {
  /* ถ้ามี adjustedYongshenElements (จาก wrapper-6 Fix E) ใช้นั่นเป็น truth · ไม่งั้น fallback ranks เก่า */
  let usefulElements: string[];
  if (adjustedYongshenElements && adjustedYongshenElements.length) {
    usefulElements = Array.from(new Set(adjustedYongshenElements.slice(0, 3)));
  } else {
    const ranks = USEFUL_GOD_RANKS[dayMaster] || [];
    usefulElements = Array.from(new Set(ranks.slice(0, 3).map((s) => STEM_ELEMENT[s])));
  }
  const allElements = ["wood", "fire", "earth", "metal", "water"];
  const jishen = allElements.filter((e) => !usefulElements.includes(e));

  const wealthElement = ELEMENT_CONTROLS[STEM_ELEMENT[dayMaster]];
  let wealth_role: JishenInfo["wealth_role"] = "neutral";
  if (usefulElements.includes(wealthElement)) wealth_role = "yongshen";
  else if (jishen.includes(wealthElement)) wealth_role = "jishen";
  return { elements: jishen, wealth_role };
}

export type TodayOverlay = {
  today_pillar: { stem: string; branch: string };
  vs_day_branch: ("六沖" | "六合" | "六害" | "六破" | null)[];
  has_clash: boolean;
  has_he: boolean;
  has_harm: boolean;
  has_destroy: boolean;
};

function buildTodayOverlay(pillars: BaziPillars, todayDate: Date): TodayOverlay | null {
  try {
    // ใช้ tyme4ts หา today pillar
    const today_pillar = { stem: "", branch: "" };
    // jia zi 60 cycle from a known reference: 1984-02-02 = 甲子 day
    // 17 พ.ค. Fix: เดิมใช้ getUTCDate() → Bangkok 00:00-07:00 (= UTC วันก่อน) ทำให้ day index ผิด 1 วัน
    // ใช้ local date components (server tz = Asia/Bangkok) เพื่อให้ตรงวันจริง
    const ref = new Date("1984-02-02T00:00:00Z").getTime();
    const target = Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    const days = Math.round((target - ref) / 86400000);
    const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
    const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
    const idx = ((days % 60) + 60) % 60;
    today_pillar.stem = stems[idx % 10];
    today_pillar.branch = branches[idx % 12];

    const dayBranch = pillars.day.branch;
    const tb = today_pillar.branch;
    const types: ("六沖" | "六合" | "六害" | "六破" | null)[] = [];
    if (SIX_CLASH[dayBranch] === tb) types.push("六沖");
    if (SIX_HE[dayBranch] === tb) types.push("六合");
    if (SIX_HARM[dayBranch] === tb) types.push("六害");
    if (SIX_DESTROY[dayBranch] === tb) types.push("六破");
    return {
      today_pillar,
      vs_day_branch: types.length ? types : [null],
      has_clash: types.includes("六沖"),
      has_he: types.includes("六合"),
      has_harm: types.includes("六害"),
      has_destroy: types.includes("六破"),
    };
  } catch {
    return null;
  }
}

export type LuckPillar = {
  age_start: number;
  age_end: number;
  year_start?: number;
  year_end?: number;
  age_start_detail?: string;
  age_end_detail?: string;
  start_date?: string;
  end_date?: string;
  timing_method?: string;
  direction?: "forward" | "backward";
  direction_th?: string;
  stem: string;
  branch: string;
  element: "wood" | "fire" | "earth" | "metal" | "water";
  qi_phase: string | null;
};

const STEMS_ORDER = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];

function buildLuckPillars(pillars: BaziPillars, gender: "M" | "F" = "M", startAge: number = 10): LuckPillar[] {
  const monthStem = pillars.month.stem;
  const monthBranch = pillars.month.branch;
  /* Classical Voytek alignment · ใช้ YEAR STEM polarity (ไม่ใช่ DM polarity) */
  const yearPolarity = STEM_POLARITY[pillars.year.stem];
  // yang year + male → forward · yang year + female → backward
  // yin year + male → backward · yin year + female → forward
  const forward = (yearPolarity === "yang" && gender === "M") || (yearPolarity === "yin" && gender === "F");
  const dir = forward ? 1 : -1;

  const monthStemIdx = STEMS_ORDER.indexOf(monthStem);
  const monthBranchIdx = BRANCHES_ORDER.indexOf(monthBranch);
  if (monthStemIdx < 0 || monthBranchIdx < 0) return [];

  const dm = pillars.day.stem;
  const out: LuckPillar[] = [];
  for (let i = 1; i <= 8; i++) {
    const sIdx = (monthStemIdx + dir * i + 100) % 10;
    const bIdx = (monthBranchIdx + dir * i + 120) % 12;
    const stem = STEMS_ORDER[sIdx];
    const branch = BRANCHES_ORDER[bIdx];
    const element = (STEM_ELEMENT[stem] as "wood" | "fire" | "earth" | "metal" | "water") || "earth";
    const qi_phase = twelvePhase(dm, branch);
    const age0 = startAge + (i - 1) * 10;
    /* end-exclusive: next pillar starts at age0+10 · no gap, no overlap */
    out.push({
      age_start: Math.round(age0 * 100) / 100,
      age_end: Math.round((age0 + 10 - 0.01) * 100) / 100,
      direction: forward ? "forward" : "backward",
      direction_th: forward ? "เดินหน้า順" : "ถอยหลัง逆",
      stem,
      branch,
      element,
      qi_phase,
    });
  }
  return out;
}

import { buildNayin, buildKongWang, buildThreePhases, buildSpecialStars, buildLifePalace, buildPalaceReadings, buildFiveStructure, type NaYinPerPillar, type KongWangInfo, type ThreePhases, type StarsPerPillar, type LifePalaceInfo, type PalaceReadingCell, type FiveStructureInfo } from "./chart-table";
import { buildPersonalStars, type PersonalStarReading } from "./chart-personal-stars";

export type ChartExtensions = {
  element_counts: ElementCounts;
  ten_gods_map: TenGodsMap;
  qi_phases: QiPhases;
  interactions: InteractionFlag[];
  punishments: PunishmentFlag[];
  combinations: ReturnType<typeof buildCombinations>;
  jishen: JishenInfo;
  today_overlay: TodayOverlay | null;
  luck_pillars: LuckPillar[];
  current_luck_idx: number;
  /* G1 additions · §02 Joey Yap-style table */
  nayin: NaYinPerPillar;
  kong_wang: KongWangInfo;
  three_phases: ThreePhases;
  special_stars: StarsPerPillar;
  /* G4 additions · 4 BaZi natal sections */
  life_palace: LifePalaceInfo | null;
  palace_readings: Record<"year"|"month"|"day"|"hour", PalaceReadingCell>;
  five_structure: FiveStructureInfo;
  personal_stars: PersonalStarReading[];
  /* Voytek alignment · stem interactions + fan/fu yin + current year pillar */
  stem_interactions: StemInteractionFlag[];
  fan_yin_fu_yin: FanYinFuYinFlag[];
  current_year_pillar: { stem: string; branch: string };
  voytek_strength: VoytekStrength;
  /* Engine 1 · LP-natal + 天地合 + 流年 timeline */
  lp_natal_interactions: LPNatalInteraction[];
  tian_di_he: TianDiHe[];
  liu_nian_timeline: LiuNianEntry[];
  luck_decade_drilldown: LuckDecadeDrilldown[];
  /* Engine 2 · Special chart + Spouse + Career + Health */
  special_chart: SpecialChartRules;
  spouse_palace: SpousePalace;
  career_industry: CareerIndustry;
  health_mapping: HealthMapping;
};

export function buildChartExtensions(pillars: BaziPillarsAny, todayDate: Date = new Date(), gender: "M" | "F" = "M", birthDate?: Date, startAge: number = 10, geJuStructure: string | null = null, strengthPct: number = 50, yongshenElement: string | null = null, adjustedYongshenElements: string[] | null = null): ChartExtensions {
  const pAny = pillars as any;
  const birthYear = birthDate?.getUTCFullYear();
  const lp = annotateLuckPillarTiming(buildLuckPillars(pAny, gender, startAge), birthDate);
  let currentAge = 0;
  if (birthDate) {
    currentAge = Math.floor((todayDate.getTime() - birthDate.getTime()) / (365.25 * 86400000));
  }
  const current_luck_idx = lp.findIndex((p) => currentAge >= p.age_start && currentAge < (p.age_start + 10));
  const cyp = currentYearPillar(todayDate);
  const finalIdx = current_luck_idx >= 0 ? current_luck_idx : 0;
  const ec = buildElementCounts(pillars);
  const jishenInfo = buildJishen(pillars.day.stem, adjustedYongshenElements);
  const usefulList = Array.from(new Set((adjustedYongshenElements || []).map((e) => String(e).toLowerCase()).filter(Boolean)));
  const yongEl = yongshenElement ? String(yongshenElement).toLowerCase() : usefulList[0];
  const transitUsefulRole: TransitRoleResolver = (element: string) => {
    const el = String(element || "").toLowerCase();
    if (yongEl && el === yongEl) return "yong";
    if (usefulList.includes(el)) return "xi";
    if (jishenInfo.elements.includes(el)) return "ji";
    return "neutral";
  };
  return {
    element_counts: ec,
    ten_gods_map: buildTenGodsMap(pillars),
    qi_phases: buildQiPhases(pillars),
    interactions: buildInteractions(pillars),
    punishments: buildPunishments(pillars),
    combinations: buildCombinations(pillars),
    jishen: jishenInfo,
    today_overlay: buildTodayOverlay(pAny, todayDate),
    luck_pillars: lp,
    current_luck_idx: finalIdx,
    /* G1 · table data */
    nayin: buildNayin(pAny),
    kong_wang: buildKongWang(pAny),
    three_phases: buildThreePhases(pAny),
    special_stars: buildSpecialStars(pAny),
    /* G4 · 4 BaZi natal sections */
    life_palace: buildLifePalace(pAny),
    palace_readings: buildPalaceReadings(pAny),
    five_structure: buildFiveStructure(pAny),
    personal_stars: buildPersonalStars(pAny, buildKongWang(pAny).per_pillar),
    /* Voytek alignment · stem interactions + fan/fu yin + current year */
    stem_interactions: buildStemInteractions(pillars),
    fan_yin_fu_yin: buildFanYinFuYin(pillars, lp, finalIdx, cyp),
    current_year_pillar: cyp,
    voytek_strength: buildVoytekStrength(pAny, ec),
    /* Engine 1 · LP × natal + 天地合 + 10-year 流年 timeline */
    lp_natal_interactions: lp[finalIdx]
      ? buildLpNatalInteractions(pAny, { stem: lp[finalIdx].stem, branch: lp[finalIdx].branch })
      : [],
    tian_di_he: buildTianDiHe(pillars),
    liu_nian_timeline: buildLiuNianTimeline(pAny, birthYear || todayDate.getUTCFullYear(), 100, birthYear),
    luck_decade_drilldown: buildLuckDecadeDrilldown(pAny, lp, birthYear, transitUsefulRole),
    /* Engine 2 · Special chart + Spouse + Career + Health */
    special_chart: buildSpecialChartRules(pAny, geJuStructure),
    spouse_palace: buildSpousePalace(pillars),
    career_industry: buildCareerIndustry(pAny, yongshenElement),
    health_mapping: buildHealthMapping(pAny, ec, strengthPct),
  };
}
