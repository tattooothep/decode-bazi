// Chart extensions · เพิ่ม field พื้นฐานที่ /chart และ /today ขาด
// ใช้ใน /api/chart route เพิ่มเติมจาก ge_ju · useful_god · strength_yongshen · tiao_hou · hs_hhs · matrix_summary
// อ่าน source: wrappers/shared.js (ten gods · twelvePhase · clash tables) · stars-detector (kong_wang)
// Status: read-only · ไม่ recommend activity · ไม่มี wording user-facing

import type { BaziPillars } from "./bazi-calc";

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

function buildElementCounts(pillars: BaziPillars): ElementCounts {
  const counts: ElementCounts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  const pkeys: (keyof BaziPillars)[] = ["year", "month", "day", "hour"];
  for (const k of pkeys) {
    const p = pillars[k];
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
  hour: { stem: string; ten_god: string | null };
};

function buildTenGodsMap(pillars: BaziPillars): TenGodsMap {
  const dm = pillars.day.stem;
  return {
    year: { stem: pillars.year.stem, ten_god: tenGodOf(dm, pillars.year.stem) },
    month: { stem: pillars.month.stem, ten_god: tenGodOf(dm, pillars.month.stem) },
    day: { stem: pillars.day.stem, ten_god: "日主" },
    hour: { stem: pillars.hour.stem, ten_god: tenGodOf(dm, pillars.hour.stem) },
  };
}

export type QiPhases = {
  year: string | null;
  month: string | null;
  day: string | null;
  hour: string | null;
};

function buildQiPhases(pillars: BaziPillars): QiPhases {
  const dm = pillars.day.stem;
  return {
    year: twelvePhase(dm, pillars.year.branch),
    month: twelvePhase(dm, pillars.month.branch),
    day: twelvePhase(dm, pillars.day.branch),
    hour: twelvePhase(dm, pillars.hour.branch),
  };
}

export type InteractionFlag = {
  type: "六沖" | "六合" | "六害" | "六破";
  pair: [string, string];
  pillars_pair: [string, string];
};

function buildInteractions(pillars: BaziPillars): InteractionFlag[] {
  const pkeys: (keyof BaziPillars)[] = ["year", "month", "day", "hour"];
  const out: InteractionFlag[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const a = pillars[pkeys[i]].branch;
      const b = pillars[pkeys[j]].branch;
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

function buildPunishments(pillars: BaziPillars): PunishmentFlag[] {
  const branches = [pillars.year.branch, pillars.month.branch, pillars.day.branch, pillars.hour.branch];
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

function buildCombinations(pillars: BaziPillars) {
  const branches = [pillars.year.branch, pillars.month.branch, pillars.day.branch, pillars.hour.branch];
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
  return { san_he, san_hui };
}

export type JishenInfo = {
  elements: string[]; // jishen elements (outside top-3 useful god)
  wealth_role: "yongshen" | "xishen" | "jishen" | "neutral";
};

function buildJishen(dayMaster: string): JishenInfo {
  const ranks = USEFUL_GOD_RANKS[dayMaster] || [];
  const usefulElements = Array.from(new Set(ranks.slice(0, 3).map((s) => STEM_ELEMENT[s])));
  const xishenElements = Array.from(new Set(ranks.slice(3, 5).map((s) => STEM_ELEMENT[s]))).filter((e) => !usefulElements.includes(e));
  const allElements = ["wood", "fire", "earth", "metal", "water"];
  const jishen = allElements.filter((e) => !usefulElements.includes(e) && !xishenElements.includes(e));

  const wealthElement = ELEMENT_CONTROLS[STEM_ELEMENT[dayMaster]];
  let wealth_role: JishenInfo["wealth_role"] = "neutral";
  if (usefulElements.includes(wealthElement)) wealth_role = "yongshen";
  else if (xishenElements.includes(wealthElement)) wealth_role = "xishen";
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
    // คำนวณ day index จาก epoch
    const ref = new Date("1984-02-02T00:00:00Z").getTime();
    const target = Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate());
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

export type ChartExtensions = {
  element_counts: ElementCounts;
  ten_gods_map: TenGodsMap;
  qi_phases: QiPhases;
  interactions: InteractionFlag[];
  punishments: PunishmentFlag[];
  combinations: ReturnType<typeof buildCombinations>;
  jishen: JishenInfo;
  today_overlay: TodayOverlay | null;
};

export function buildChartExtensions(pillars: BaziPillars, todayDate: Date = new Date()): ChartExtensions {
  return {
    element_counts: buildElementCounts(pillars),
    ten_gods_map: buildTenGodsMap(pillars),
    qi_phases: buildQiPhases(pillars),
    interactions: buildInteractions(pillars),
    punishments: buildPunishments(pillars),
    combinations: buildCombinations(pillars),
    jishen: buildJishen(pillars.day.stem),
    today_overlay: buildTodayOverlay(pillars, todayDate),
  };
}
