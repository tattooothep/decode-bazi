export type ElementEn = "wood" | "fire" | "earth" | "metal" | "water";
export type YuanLong = "地元" | "天元" | "人元";
export type YinYang = "陽" | "陰";
export type TrigramZh = "坎" | "艮" | "震" | "巽" | "離" | "坤" | "兌" | "乾";
export type Dir8 = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type Mountain24 = {
  index: number;
  name: string;
  code: string;
  type: "干" | "支" | "卦";
  element: ElementEn;
  elementZh: "水" | "木" | "火" | "土" | "金";
  trigram: TrigramZh;
  yuan: YuanLong;
  yinYang: YinYang;
  startDeg: number;
  endDeg: number;
  centerDeg: number;
  dir8: Dir8;
};

const ELEMENT_ZH: Record<ElementEn, Mountain24["elementZh"]> = {
  water: "水",
  wood: "木",
  fire: "火",
  earth: "土",
  metal: "金",
};

const DIR8_BY_TRIGRAM: Record<TrigramZh, Dir8> = {
  坎: "N",
  艮: "NE",
  震: "E",
  巽: "SE",
  離: "S",
  坤: "SW",
  兌: "W",
  乾: "NW",
};

const RAW_MOUNTAINS = [
  { name: "壬", code: "N1", type: "干", element: "water", trigram: "坎", yuan: "地元", yinYang: "陽", start: 337.5, end: 352.5 },
  { name: "子", code: "N2", type: "支", element: "water", trigram: "坎", yuan: "天元", yinYang: "陰", start: 352.5, end: 7.5 },
  { name: "癸", code: "N3", type: "干", element: "water", trigram: "坎", yuan: "人元", yinYang: "陰", start: 7.5, end: 22.5 },
  { name: "丑", code: "NE1", type: "支", element: "earth", trigram: "艮", yuan: "地元", yinYang: "陰", start: 22.5, end: 37.5 },
  { name: "艮", code: "NE2", type: "卦", element: "earth", trigram: "艮", yuan: "天元", yinYang: "陽", start: 37.5, end: 52.5 },
  { name: "寅", code: "NE3", type: "支", element: "wood", trigram: "艮", yuan: "人元", yinYang: "陽", start: 52.5, end: 67.5 },
  { name: "甲", code: "E1", type: "干", element: "wood", trigram: "震", yuan: "地元", yinYang: "陽", start: 67.5, end: 82.5 },
  { name: "卯", code: "E2", type: "支", element: "wood", trigram: "震", yuan: "天元", yinYang: "陰", start: 82.5, end: 97.5 },
  { name: "乙", code: "E3", type: "干", element: "wood", trigram: "震", yuan: "人元", yinYang: "陰", start: 97.5, end: 112.5 },
  { name: "辰", code: "SE1", type: "支", element: "earth", trigram: "巽", yuan: "地元", yinYang: "陰", start: 112.5, end: 127.5 },
  { name: "巽", code: "SE2", type: "卦", element: "wood", trigram: "巽", yuan: "天元", yinYang: "陽", start: 127.5, end: 142.5 },
  { name: "巳", code: "SE3", type: "支", element: "fire", trigram: "巽", yuan: "人元", yinYang: "陽", start: 142.5, end: 157.5 },
  { name: "丙", code: "S1", type: "干", element: "fire", trigram: "離", yuan: "地元", yinYang: "陽", start: 157.5, end: 172.5 },
  { name: "午", code: "S2", type: "支", element: "fire", trigram: "離", yuan: "天元", yinYang: "陰", start: 172.5, end: 187.5 },
  { name: "丁", code: "S3", type: "干", element: "fire", trigram: "離", yuan: "人元", yinYang: "陰", start: 187.5, end: 202.5 },
  { name: "未", code: "SW1", type: "支", element: "earth", trigram: "坤", yuan: "地元", yinYang: "陰", start: 202.5, end: 217.5 },
  { name: "坤", code: "SW2", type: "卦", element: "earth", trigram: "坤", yuan: "天元", yinYang: "陽", start: 217.5, end: 232.5 },
  { name: "申", code: "SW3", type: "支", element: "metal", trigram: "坤", yuan: "人元", yinYang: "陽", start: 232.5, end: 247.5 },
  { name: "庚", code: "W1", type: "干", element: "metal", trigram: "兌", yuan: "地元", yinYang: "陽", start: 247.5, end: 262.5 },
  { name: "酉", code: "W2", type: "支", element: "metal", trigram: "兌", yuan: "天元", yinYang: "陰", start: 262.5, end: 277.5 },
  { name: "辛", code: "W3", type: "干", element: "metal", trigram: "兌", yuan: "人元", yinYang: "陰", start: 277.5, end: 292.5 },
  { name: "戌", code: "NW1", type: "支", element: "earth", trigram: "乾", yuan: "地元", yinYang: "陰", start: 292.5, end: 307.5 },
  { name: "乾", code: "NW2", type: "卦", element: "metal", trigram: "乾", yuan: "天元", yinYang: "陽", start: 307.5, end: 322.5 },
  { name: "亥", code: "NW3", type: "支", element: "water", trigram: "乾", yuan: "人元", yinYang: "陽", start: 322.5, end: 337.5 },
] as const;

export const MOUNTAINS_24: Mountain24[] = RAW_MOUNTAINS.map((m, index) => ({
  index,
  name: m.name,
  code: m.code,
  type: m.type,
  element: m.element,
  elementZh: ELEMENT_ZH[m.element],
  trigram: m.trigram,
  yuan: m.yuan,
  yinYang: m.yinYang,
  startDeg: m.start,
  endDeg: m.end,
  centerDeg: ((m.start < m.end ? (m.start + m.end) / 2 : (m.start + m.end + 360) / 2) % 360 + 360) % 360,
  dir8: DIR8_BY_TRIGRAM[m.trigram],
}));

export const MOUNTAIN_BY_NAME = Object.fromEntries(MOUNTAINS_24.map((m) => [m.name, m])) as Record<string, Mountain24>;

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function signedAngleDelta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

export function findMountain24(deg: number): Mountain24 {
  const d = normalizeDeg(deg);
  const found = MOUNTAINS_24.find((m) => m.startDeg < m.endDeg ? d >= m.startDeg && d < m.endDeg : d >= m.startDeg || d < m.endDeg);
  if (!found) throw new Error(`ไม่พบ 24 ซานสำหรับองศา ${deg} · 24山 missing`);
  return found;
}

export function mountainNeighbor(mountain: Mountain24, side: "left" | "right"): Mountain24 {
  const offset = side === "left" ? -1 : 1;
  return MOUNTAINS_24[(mountain.index + offset + 24) % 24];
}

export function degreeToDir8(deg: number): Dir8 {
  return findMountain24(deg).dir8;
}

export function isNearMountainBoundary(deg: number, cautionDeg = 1): boolean {
  const m = findMountain24(deg);
  const dStart = Math.abs(signedAngleDelta(deg, m.startDeg));
  const dEnd = Math.abs(signedAngleDelta(deg, m.endDeg));
  return Math.min(dStart, dEnd) <= cautionDeg;
}
