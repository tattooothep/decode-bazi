/**
 * 紫微斗數 · 安星排盤 · ตารางคงที่ (deterministic ล้วน · ห้าม AI)
 *
 * พิกัด "ground index" (กง靐): อิง 寅 = 0 (紫微斗數 12 宮 เริ่มที่ 寅)
 *   ground 0=寅 1=卯 2=辰 3=巳 4=午 5=未 6=申 7=酉 8=戌 9=亥 10=子 11=丑
 *   branchIndex (子=0): branch = (ground + 2) % 12 ; ground = (branchIndex - 2 + 12) % 12
 *
 * ตาราง安星ทั้งหมด cross-check กับ iztro (open-source ziwei JS oracle) แล้วตรงเป๊ะ
 * — Ziwei engine
 */

/* 12 地支 (子=0) */
export const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
/* 10 天干 (甲=0) */
export const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;

/* 12 宮 (เรียงจาก 命宮 ทวนเข็ม) */
export const PALACE_NAMES = [
  "命宮", "兄弟", "夫妻", "子女", "財帛", "疾厄",
  "遷移", "僕役", "官祿", "田宅", "福德", "父母",
] as const;
export type PalaceName = (typeof PALACE_NAMES)[number];

/* 14 主星 (ชื่อตัวเต็ม) */
export const MAJOR_STARS = [
  "紫微", "天機", "太陽", "武曲", "天同", "廉貞", "天府",
  "太陰", "貪狼", "巨門", "天相", "天梁", "七殺", "破軍",
] as const;
export type MajorStar = (typeof MAJOR_STARS)[number];

/* แปลง ground index → branchIndex(子=0) และกลับ */
export const groundToBranchIndex = (g: number): number => ((g % 12) + 2 + 12) % 12;
export const branchIndexToGround = (b: number): number => ((b % 12) - 2 + 12) % 12;
export const groundToBranch = (g: number): string => BRANCHES[groundToBranchIndex(g)];
/* mod 12 → 0..11 */
export const fix12 = (n: number): number => ((n % 12) + 12) % 12;

/* ground index ของ 地支 ชื่อ (寅=0) — ใช้ในสูตร安星 */
const G: Record<string, number> = {};
BRANCHES.forEach((b, i) => { G[b] = branchIndexToGround(i); });
export const groundOf = (branch: string): number => G[branch];

/* ─────────────────────────────────────────────────────────────
 * 紫微系 6 星 · offset ground จากตำแหน่ง紫微 (逆行 = ลบ)
 * 天府系 8 星 · offset ground จากตำแหน่ง天府 (順行 = บวก)
 * ───────────────────────────────────────────────────────────── */
export const ZIWEI_SERIES: { star: MajorStar; offset: number }[] = [
  { star: "紫微", offset: 0 },
  { star: "天機", offset: -1 },
  { star: "太陽", offset: -3 },
  { star: "武曲", offset: -4 },
  { star: "天同", offset: -5 },
  { star: "廉貞", offset: -8 },
];
export const TIANFU_SERIES: { star: MajorStar; offset: number }[] = [
  { star: "天府", offset: 0 },
  { star: "太陰", offset: 1 },
  { star: "貪狼", offset: 2 },
  { star: "巨門", offset: 3 },
  { star: "天相", offset: 4 },
  { star: "天梁", offset: 5 },
  { star: "七殺", offset: 6 },
  { star: "破軍", offset: 10 },
];

/* ─────────────────────────────────────────────────────────────
 * 五虎遁 · ก้านเดือนที่ 寅 ตามก้านปี (年干 → 寅干)
 *   甲己→丙  乙庚→戊  丙辛→庚  丁壬→壬  戊癸→甲
 * tigerStem = (2 + (yearStem%5)*2) % 10
 * ก้านของ ground g (寅=0) = (tigerStem + g) % 10
 * ───────────────────────────────────────────────────────────── */
export const tigerStemIndex = (yearStemIndex: number): number => (2 + (yearStemIndex % 5) * 2) % 10;
export const stemAtGround = (yearStemIndex: number, ground: number): number =>
  (tigerStemIndex(yearStemIndex) + ground + 100) % 10;

/* ─────────────────────────────────────────────────────────────
 * 納音五行 → 五行局 (水二/木三/金四/土五/火六)
 * 60 甲子 納音 element ตามคู่ (甲子=index0)
 * ───────────────────────────────────────────────────────────── */
const NAYIN_ELEMENT_PAIRS = [
  // pair index 0..29 (แต่ละคู่ = 2 干支 · 甲子乙丑=pair0 ...)
  "金", "火", "木", "土", "金", "火", "水", "土", "金", "木", // 0-9
  "水", "土", "火", "木", "水", "金", "火", "木", "土", "金", // 10-19
  "火", "水", "土", "金", "木", "水", "土", "火", "木", "水", // 20-29
];
/** element (五行) ของคู่干支 จาก jiazi index 0..59 */
export const nayinElement = (jiaziIndex: number): string =>
  NAYIN_ELEMENT_PAIRS[Math.floor((((jiaziIndex % 60) + 60) % 60) / 2)];

/** jiazi index 0..59 จาก (stemIndex, branchIndex) */
export const jiaziIndex = (stemIndex: number, branchIndex: number): number => {
  for (let n = 0; n < 60; n++) if (n % 10 === stemIndex && n % 12 === branchIndex) return n;
  return -1;
};

/** 五行局: element → {name, num} */
export const WUXING_JU: Record<string, { name: string; num: number }> = {
  水: { name: "水二局", num: 2 },
  木: { name: "木三局", num: 3 },
  金: { name: "金四局", num: 4 },
  土: { name: "土五局", num: 5 },
  火: { name: "火六局", num: 6 },
};

/* ─────────────────────────────────────────────────────────────
 * 廟旺利陷平 (brightness) ของ 14 主星 · index = ground (寅=0 .. 丑=11)
 * (ตรง iztro STARS_INFO.brightness เป๊ะ)
 * ───────────────────────────────────────────────────────────── */
export const BRIGHTNESS: Record<MajorStar, string[]> = {
  紫微: ["旺", "旺", "得", "旺", "廟", "廟", "旺", "旺", "得", "旺", "平", "廟"],
  天機: ["得", "旺", "利", "平", "廟", "陷", "得", "旺", "利", "平", "廟", "陷"],
  太陽: ["旺", "廟", "旺", "旺", "旺", "得", "得", "陷", "不", "陷", "陷", "不"],
  武曲: ["得", "利", "廟", "平", "旺", "廟", "得", "利", "廟", "平", "旺", "廟"],
  天同: ["利", "平", "平", "廟", "陷", "不", "旺", "平", "平", "廟", "旺", "不"],
  廉貞: ["廟", "平", "利", "陷", "平", "利", "廟", "平", "利", "陷", "平", "利"],
  天府: ["廟", "得", "廟", "得", "旺", "廟", "得", "旺", "廟", "得", "廟", "廟"],
  太陰: ["旺", "陷", "陷", "陷", "不", "不", "利", "不", "旺", "廟", "廟", "廟"],
  貪狼: ["平", "利", "廟", "陷", "旺", "廟", "平", "利", "廟", "陷", "旺", "廟"],
  巨門: ["廟", "廟", "陷", "旺", "旺", "不", "廟", "廟", "陷", "旺", "旺", "不"],
  天相: ["廟", "陷", "得", "得", "廟", "得", "廟", "陷", "得", "得", "廟", "廟"],
  天梁: ["廟", "廟", "廟", "陷", "廟", "旺", "陷", "得", "廟", "陷", "廟", "旺"],
  七殺: ["廟", "旺", "廟", "平", "旺", "廟", "廟", "廟", "廟", "平", "旺", "廟"],
  破軍: ["得", "陷", "旺", "平", "廟", "旺", "得", "陷", "旺", "平", "廟", "旺"],
};
/** brightness ของ 主星 ที่ ground g */
export const brightnessAt = (star: MajorStar, ground: number): string =>
  BRIGHTNESS[star] ? BRIGHTNESS[star][fix12(ground)] : "";

/* ─────────────────────────────────────────────────────────────
 * 四化表 · 年干(หรือ宮干) → [祿, 權, 科, 忌] ให้ดาวไหน
 * ตัวเต็ม · ตรง iztro getMutagensByHeavenlyStem
 * ───────────────────────────────────────────────────────────── */
export const SI_HUA_TYPES = ["祿", "權", "科", "忌"] as const;
export type SiHuaType = (typeof SI_HUA_TYPES)[number];
export const SI_HUA: Record<string, [string, string, string, string]> = {
  甲: ["廉貞", "破軍", "武曲", "太陽"],
  乙: ["天機", "天梁", "紫微", "太陰"],
  丙: ["天同", "天機", "文昌", "廉貞"],
  丁: ["太陰", "天同", "天機", "巨門"],
  戊: ["貪狼", "太陰", "右弼", "天機"],
  己: ["武曲", "貪狼", "天梁", "文曲"],
  庚: ["太陽", "武曲", "太陰", "天同"],
  辛: ["巨門", "太陽", "文曲", "文昌"],
  壬: ["天梁", "紫微", "左輔", "武曲"],
  癸: ["破軍", "巨門", "太陰", "貪狼"],
};

/* ─────────────────────────────────────────────────────────────
 * 祿存/天馬/天魁/天鉞 · ground index ตาม年干/年支
 * ───────────────────────────────────────────────────────────── */
/** 祿存 ground ตาม年干 (擎羊=祿存+1 · 陀羅=祿存-1) */
export const LU_CUN_GROUND: Record<string, number> = {
  甲: groundOf("寅"), 乙: groundOf("卯"), 丙: groundOf("巳"), 戊: groundOf("巳"),
  丁: groundOf("午"), 己: groundOf("午"), 庚: groundOf("申"), 辛: groundOf("酉"),
  壬: groundOf("亥"), 癸: groundOf("子"),
};
/** 天馬 ground ตาม年支 (四馬地 寅申巳亥) */
export const TIAN_MA_GROUND: Record<string, number> = {
  寅: groundOf("申"), 午: groundOf("申"), 戌: groundOf("申"),
  申: groundOf("寅"), 子: groundOf("寅"), 辰: groundOf("寅"),
  巳: groundOf("亥"), 酉: groundOf("亥"), 丑: groundOf("亥"),
  亥: groundOf("巳"), 卯: groundOf("巳"), 未: groundOf("巳"),
};
/** 天魁·天鉞 ground ตาม年干 */
export const KUI_YUE_GROUND: Record<string, { kui: number; yue: number }> = {
  甲: { kui: groundOf("丑"), yue: groundOf("未") },
  戊: { kui: groundOf("丑"), yue: groundOf("未") },
  庚: { kui: groundOf("丑"), yue: groundOf("未") },
  乙: { kui: groundOf("子"), yue: groundOf("申") },
  己: { kui: groundOf("子"), yue: groundOf("申") },
  辛: { kui: groundOf("午"), yue: groundOf("寅") },
  丙: { kui: groundOf("亥"), yue: groundOf("酉") },
  丁: { kui: groundOf("亥"), yue: groundOf("酉") },
  壬: { kui: groundOf("卯"), yue: groundOf("巳") },
  癸: { kui: groundOf("卯"), yue: groundOf("巳") },
};
/** 火星·鈴星 起子時 ground ตาม年支 (แล้วบวก timeIndex) */
export const HUO_LING_START: Record<string, { huo: number; ling: number }> = {
  寅: { huo: groundOf("丑"), ling: groundOf("卯") },
  午: { huo: groundOf("丑"), ling: groundOf("卯") },
  戌: { huo: groundOf("丑"), ling: groundOf("卯") },
  申: { huo: groundOf("寅"), ling: groundOf("戌") },
  子: { huo: groundOf("寅"), ling: groundOf("戌") },
  辰: { huo: groundOf("寅"), ling: groundOf("戌") },
  巳: { huo: groundOf("卯"), ling: groundOf("戌") },
  酉: { huo: groundOf("卯"), ling: groundOf("戌") },
  丑: { huo: groundOf("卯"), ling: groundOf("戌") },
  亥: { huo: groundOf("酉"), ling: groundOf("戌") },
  卯: { huo: groundOf("酉"), ling: groundOf("戌") },
  未: { huo: groundOf("酉"), ling: groundOf("戌") },
};
