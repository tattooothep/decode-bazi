import {
  MOUNTAINS_24,
  MOUNTAIN_BY_NAME,
  findMountain24,
  mountainNeighbor,
  normalizeDeg,
  signedAngleDelta,
} from "./mountains";
import type { Mountain24, YuanLong } from "./mountains";

export type TiguaSchool = "shen_13" | "full_24";

export type TiguaDecision = {
  school: TiguaSchool;
  mode: "下卦" | "替卦";
  trigger: "center" | "same_yinyang" | "yin_yang_cross" | "out_of_gua";
  inputDeg: number;
  mountain: Mountain24;
  centerDeg: number;
  deltaFromCenter: number;
  neighbor?: Mountain24;
  reasonTh: string;
  reasonZh: string;
  nearBoundary: boolean;
};

export type TiguaReplacement = {
  school: TiguaSchool;
  source: "shen_13" | "full_24" | "none";
  mountain: string;
  starName: string;
  starNumber: number;
};

export type FlyingDirection = "forward" | "reverse";

export type FlightInfo = {
  seedStar: number;
  centerStar: number;
  direction: FlyingDirection;
  referenceMountain: Mountain24;
  replacement?: TiguaReplacement;
  decision: TiguaDecision;
  noteTh: string;
  noteZh: string;
};

export type XuanKongChart = {
  version: "xuan-kong-chart-v1";
  period: number;
  school: TiguaSchool;
  facing: Mountain24;
  sitting: Mountain24;
  base: number[];
  water: number[];
  mountain: number[];
  waterFlight: FlightInfo;
  mountainFlight: FlightInfo;
};

const PALACE_INDEX: Record<string, number> = { 坎: 0, 坤: 1, 震: 2, 巽: 3, 中: 4, 乾: 5, 兌: 6, 艮: 7, 離: 8 };
const FLY_ORDER = [4, 5, 6, 7, 8, 0, 1, 2, 3];
const STAR_HOME: Record<number, string> = { 1: "坎", 2: "坤", 3: "震", 4: "巽", 6: "乾", 7: "兌", 8: "艮", 9: "離" };
const PALACE_MOUNTAINS: Record<string, string[]> = {
  坎: ["壬", "子", "癸"],
  艮: ["丑", "艮", "寅"],
  震: ["甲", "卯", "乙"],
  巽: ["辰", "巽", "巳"],
  離: ["丙", "午", "丁"],
  坤: ["未", "坤", "申"],
  兌: ["庚", "酉", "辛"],
  乾: ["戌", "乾", "亥"],
};
const YUAN_IDX: Record<YuanLong, number> = { 地元: 0, 天元: 1, 人元: 2 };
const STAR_NAME: Record<number, string> = { 1: "貪狼", 2: "巨門", 3: "祿存", 4: "文曲", 5: "廉貞", 6: "武曲", 7: "破軍", 8: "左輔", 9: "右弼" };

export const SHEN_13_REPLACEMENT: Record<string, number> = {
  甲: 1,
  申: 1,
  壬: 2,
  卯: 2,
  乙: 2,
  丑: 7,
  艮: 7,
  丙: 7,
  辰: 6,
  巽: 6,
  巳: 6,
  庚: 9,
  寅: 9,
};

export const FULL_24_REPLACEMENT: Record<string, number> = {
  子: 1,
  申: 1,
  甲: 1,
  壬: 2,
  坤: 2,
  乙: 2,
  癸: 3,
  未: 3,
  卯: 3,
  巳: 4,
  戌: 4,
  乾: 4,
  辰: 6,
  巽: 6,
  亥: 6,
  辛: 7,
  艮: 7,
  丙: 7,
  庚: 8,
  寅: 8,
  午: 8,
  酉: 9,
  丑: 9,
  丁: 9,
};

function normStar(star: number): number {
  return ((star - 1 + 9) % 9) + 1;
}

export function flyStars(centerStar: number, direction: FlyingDirection): number[] {
  const result = new Array(9).fill(null);
  for (let i = 0; i < 9; i += 1) {
    const palaceIndex = FLY_ORDER[i];
    result[palaceIndex] = direction === "forward" ? normStar(centerStar + i) : normStar(centerStar - i);
  }
  return result;
}

export function decideTigua(deg: number, school: TiguaSchool = "shen_13"): TiguaDecision {
  const inputDeg = normalizeDeg(deg);
  const mountain = findMountain24(inputDeg);
  const centerDeg = mountain.centerDeg;
  const delta = signedAngleDelta(inputDeg, centerDeg);
  const abs = Math.abs(delta);
  const nearBoundary = abs >= 6.5;

  if (abs <= 4.5) {
    return {
      school,
      mode: "下卦",
      trigger: "center",
      inputDeg,
      mountain,
      centerDeg,
      deltaFromCenter: delta,
      reasonTh: "องศาอยู่กลางซาน 9° ใช้ผัง下卦ตามปกติ",
      reasonZh: "正中九度，用下卦",
      nearBoundary,
    };
  }

  const side = delta < 0 ? "left" : "right";
  const neighbor = mountainNeighbor(mountain, side);
  const outOfGua = neighbor.trigram !== mountain.trigram;
  const yinYangCross = neighbor.yinYang !== mountain.yinYang;
  const mode = outOfGua || yinYangCross ? "替卦" : "下卦";
  const trigger = outOfGua ? "out_of_gua" : yinYangCross ? "yin_yang_cross" : "same_yinyang";
  return {
    school,
    mode,
    trigger,
    inputDeg,
    mountain,
    centerDeg,
    deltaFromCenter: delta,
    neighbor,
    reasonTh: outOfGua
      ? `兼ออกนอกกง ${mountain.trigram} ไป ${neighbor.trigram} ต้องใช้替卦`
      : yinYangCross
        ? `兼ในกงเดียวกันแต่陰陽ต่างกัน ${mountain.yinYang}/${neighbor.yinYang} ต้องใช้替卦`
        : `兼ในกงเดียวกันและ陰陽เดียวกัน ${mountain.yinYang}/${neighbor.yinYang} ใช้下卦`,
    reasonZh: outOfGua ? "出卦用替" : yinYangCross ? "陰陽互兼用替" : "同陰同陽不用替",
    nearBoundary,
  };
}

export function replacementForMountain(mountainName: string, school: TiguaSchool = "shen_13"): TiguaReplacement | null {
  const table = school === "full_24" ? FULL_24_REPLACEMENT : SHEN_13_REPLACEMENT;
  const starNumber = table[mountainName];
  if (!starNumber) return null;
  return {
    school,
    source: school,
    mountain: mountainName,
    starName: STAR_NAME[starNumber],
    starNumber,
  };
}

function referenceMountainForFlight(seedStar: number, activeMountain: Mountain24, currentPalace: string): Mountain24 {
  const homePalace = seedStar === 5 ? currentPalace : STAR_HOME[seedStar];
  if (!homePalace) throw new Error(`ไม่พบบ้านดาว ${seedStar} · 星本宮 missing`);
  const refName = PALACE_MOUNTAINS[homePalace]?.[YUAN_IDX[activeMountain.yuan]];
  const ref = refName ? MOUNTAIN_BY_NAME[refName] : null;
  if (!ref) throw new Error(`ไม่พบ三元龍อ้างอิง ${activeMountain.yuan} ในกง ${homePalace}`);
  return ref;
}

export function calcFlightInfo(seedStar: number, activeMountain: Mountain24, currentPalace: string, activeDeg: number, school: TiguaSchool = "shen_13"): FlightInfo {
  const decision = decideTigua(activeDeg, school);
  const referenceMountain = referenceMountainForFlight(seedStar, activeMountain, currentPalace);
  const direction: FlyingDirection = referenceMountain.yinYang === "陽" ? "forward" : "reverse";
  const replacement = decision.mode === "替卦" ? replacementForMountain(referenceMountain.name, school) || undefined : undefined;
  const centerStar = replacement?.starNumber || seedStar;
  return {
    seedStar,
    centerStar,
    direction,
    referenceMountain,
    replacement,
    decision,
    noteTh: replacement
      ? `ใช้替卦: ดาวเดิม ${seedStar} อ้างอิง ${referenceMountain.name} → ${replacement.starNumber} ${replacement.starName} 入中`
      : `ใช้下卦: ดาวเดิม ${seedStar} อ้างอิง ${referenceMountain.name} ${referenceMountain.yinYang} → ${direction === "forward" ? "順飛" : "逆飛"}`,
    noteZh: replacement ? `替星 ${replacement.starName}${replacement.starNumber} 入中` : `下卦 ${direction === "forward" ? "順飛" : "逆飛"}`,
  };
}

export function calcXuanKongChart(facingDeg: number, period = 9, school: TiguaSchool = "shen_13"): XuanKongChart {
  const facing = findMountain24(facingDeg);
  const sittingDeg = normalizeDeg(facingDeg + 180);
  const sitting = findMountain24(sittingDeg);
  const base = flyStars(period, "forward");
  const fIdx = PALACE_INDEX[facing.trigram];
  const sIdx = PALACE_INDEX[sitting.trigram];
  const fSeed = base[fIdx];
  const sSeed = base[sIdx];
  const waterFlight = calcFlightInfo(fSeed, facing, facing.trigram, facingDeg, school);
  const mountainFlight = calcFlightInfo(sSeed, sitting, sitting.trigram, sittingDeg, school);
  return {
    version: "xuan-kong-chart-v1",
    period,
    school,
    facing,
    sitting,
    base,
    water: flyStars(waterFlight.centerStar, waterFlight.direction),
    mountain: flyStars(mountainFlight.centerStar, mountainFlight.direction),
    waterFlight,
    mountainFlight,
  };
}

export function chartPalaceStars(chart: XuanKongChart, dirPalace: string): { mountain: number; water: number; base: number } | null {
  const idx = PALACE_INDEX[dirPalace];
  if (idx == null) return null;
  return { mountain: chart.mountain[idx], water: chart.water[idx], base: chart.base[idx] };
}

export function tiguaSchoolLabel(school: TiguaSchool): string {
  return school === "full_24" ? "สายเต็ม 24 ซาน · 替卦二十四山" : "สาย沈氏/中州 13 ซาน · 替星十三山";
}
