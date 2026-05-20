/**
 * Year → 64 Hexagram engine · Mei Hua Yi Shu style
 *
 * mapping: stem+branch ของปี → upper trigram + lower trigram → King Wen hex (1-64)
 *
 * 15 พ.ค. 2026 · อากง
 */

/* 8 trigrams · Earlier Heaven order (binary top→bottom · 1=Yang/陽 line) */
export const TRIGRAMS_8 = [
  { idx: 0, zh: "乾", th: "เฉียน", en: "Heaven",   binary: "111", element: "metal" },
  { idx: 1, zh: "兌", th: "ตุ้ย",  en: "Lake",     binary: "110", element: "metal" },
  { idx: 2, zh: "離", th: "หลี",   en: "Fire",     binary: "101", element: "fire"  },
  { idx: 3, zh: "震", th: "เจิ้น",  en: "Thunder",  binary: "100", element: "wood"  },
  { idx: 4, zh: "巽", th: "ซวิ่น",  en: "Wind",     binary: "011", element: "wood"  },
  { idx: 5, zh: "坎", th: "ขั่น",   en: "Water",    binary: "010", element: "water" },
  { idx: 6, zh: "艮", th: "เกิ้น",   en: "Mountain", binary: "001", element: "earth" },
  { idx: 7, zh: "坤", th: "คุน",    en: "Earth",    binary: "000", element: "earth" },
];

/* 64 hexagrams · King Wen order · upper-lower binary (6-bit) → number */
/* binary: bit_top → bit_bottom · 1=Yang, 0=Yin · 6 lines */
const HEX_LIST: Array<[number, string, string, string, string]> = [
  [1,  "111111", "乾",   "เฉียน · ฟ้า",          "Creative"],
  [2,  "000000", "坤",   "คุน · ดิน",            "Receptive"],
  [3,  "100010", "屯",   "จุน · ตั้งใหม่",        "Difficulty start"],
  [4,  "010001", "蒙",   "เหมิง · เยาว์",         "Youthful folly"],
  [5,  "111010", "需",   "ซู · รอคอย",            "Waiting"],
  [6,  "010111", "訟",   "ซ่ง · ขัดแย้ง",         "Conflict"],
  [7,  "010000", "師",   "ซือ · กองทัพ",          "Army"],
  [8,  "000010", "比",   "ปี้ · ร่วมกัน",          "Holding together"],
  [9,  "111011", "小畜", "เสี่ยวซู่ · สะสมเล็ก",   "Small taming"],
  [10, "110111", "履",   "หลู่ · เหยียบ",          "Treading"],
  [11, "111000", "泰",   "ไท่ · สงบเจริญ",        "Peace"],
  [12, "000111", "否",   "ผี่ · อุดตัน",            "Standstill"],
  [13, "101111", "同人", "ถงเหริน · ร่วมหมู่",     "Fellowship"],
  [14, "111101", "大有", "ต้าโหย่ว · ครอบครอง",   "Great possession"],
  [15, "000100", "謙",   "เชียน · ถ่อมตน",         "Modesty"],
  [16, "001000", "豫",   "อวี้ · ปลื้ม",            "Enthusiasm"],
  [17, "100110", "隨",   "สุย · ตาม",              "Following"],
  [18, "011001", "蠱",   "กู่ · เน่าเสีย",          "Work on decay"],
  [19, "110000", "臨",   "หลิน · เข้าใกล้",         "Approach"],
  [20, "000011", "觀",   "กวน · สังเกต",           "Contemplation"],
  [21, "101001", "噬嗑", "ซื่อเฮ่อ · กัด",          "Biting through"],
  [22, "100101", "賁",   "เปิน · ประดับ",          "Adorning"],
  [23, "000001", "剝",   "ปอ · แตกสลาย",          "Splitting apart"],
  [24, "100000", "復",   "ฟู่ · กลับมา",            "Return"],
  [25, "100111", "無妄", "อู๋วั่ง · ไร้ลวง",        "Innocence"],
  [26, "111001", "大畜", "ต้าซู่ · สะสมใหญ่",      "Great taming"],
  [27, "100001", "頤",   "อี๋ · เลี้ยงดู",           "Nourishment"],
  [28, "011110", "大過", "ต้ากั้ว · เกินใหญ่",      "Preponderance great"],
  [29, "010010", "坎",   "ขั่น · น้ำซ้อนน้ำ",       "Abysmal"],
  [30, "101101", "離",   "หลี · ไฟซ้อนไฟ",         "Clinging"],
  [31, "001110", "咸",   "เสียน · เร้า",            "Influence"],
  [32, "011100", "恆",   "เหิง · ยั่งยืน",           "Duration"],
  [33, "001111", "遯",   "ตุ้น · หลีก",             "Retreat"],
  [34, "111100", "大壯", "ต้าจ้วง · พลังใหญ่",     "Great power"],
  [35, "000101", "晉",   "จิ้น · ก้าวหน้า",         "Progress"],
  [36, "101000", "明夷", "หมิงอี · แสงดับ",        "Darkening light"],
  [37, "101011", "家人", "เจียเหริน · ครอบครัว",   "Family"],
  [38, "110101", "睽",   "ขุย · แยก",              "Opposition"],
  [39, "010100", "蹇",   "เจี่ยน · ลำบาก",          "Obstruction"],
  [40, "001010", "解",   "เจี่ย · ปล่อย",           "Deliverance"],
  [41, "110001", "損",   "สุ่น · ลด",               "Decrease"],
  [42, "100011", "益",   "อี้ · เพิ่ม",              "Increase"],
  [43, "111110", "夬",   "กว้าย · ตัด",             "Breakthrough"],
  [44, "011111", "姤",   "โก้ว · พบ",              "Coming to meet"],
  [45, "000110", "萃",   "ฉุ่ย · รวม",              "Gathering"],
  [46, "011000", "升",   "เซิง · ขึ้น",              "Pushing upward"],
  [47, "010110", "困",   "คุ้น · ถูกขัง",            "Oppression"],
  [48, "011010", "井",   "จิ่ง · บ่อน้ำ",            "The Well"],
  [49, "101110", "革",   "เก๋อ · ปฏิรูป",            "Revolution"],
  [50, "011101", "鼎",   "ติ่ง · ภาชนะ",            "The Cauldron"],
  [51, "100100", "震",   "เจิ้น · ฟ้าผ่า",            "Arousing"],
  [52, "001001", "艮",   "เกิ้น · ภูเขา",            "Keeping still"],
  [53, "001011", "漸",   "เจี้ยน · ค่อยพัฒนา",      "Development"],
  [54, "110100", "歸妹", "กุยเม่ย · กลับสาว",       "Marrying maiden"],
  [55, "101100", "豐",   "เฟิง · เจริญ",            "Abundance"],
  [56, "001101", "旅",   "หลี่ · เดินทาง",          "Wanderer"],
  [57, "011011", "巽",   "ซวิ่น · ลม",              "Gentle wind"],
  [58, "110110", "兌",   "ตุ้ย · ทะเลสาบ",          "Joyous lake"],
  [59, "010011", "渙",   "ฮ่วน · สลาย",            "Dispersion"],
  [60, "110010", "節",   "เจี๋ย · ขีดจำกัด",          "Limitation"],
  [61, "110011", "中孚", "จงฟู · ใจซื่อ",            "Inner truth"],
  [62, "001100", "小過", "เสี่ยวกั้ว · เกินน้อย",    "Preponderance small"],
  [63, "101010", "既濟", "จี้จี้ · สำเร็จ",            "After completion"],
  [64, "010101", "未濟", "เว่ยจี้ · ยังไม่สำเร็จ",   "Before completion"],
];

export const HEXAGRAMS_64: Record<string, { num: number; zh: string; th: string; en: string; symbol: string }> = {};
for (const [num, binary, zh, th, en] of HEX_LIST) {
  const symbol = String.fromCodePoint(0x4DC0 + (num as number) - 1);
  HEXAGRAMS_64[binary as string] = { num: num as number, zh: zh as string, th: th as string, en: en as string, symbol };
}

const STEMS = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];

/**
 * year hexagram via Mei Hua Yi Shu style
 * - upper trigram = (stem_idx + branch_idx) % 8
 * - lower trigram = (stem_idx + branch_idx + branch_idx) % 8
 * - changing line = (stem_idx + branch_idx + 1) % 6 + 1
 */
export function hexagramForStemBranch(stem: string, branch: string): {
  upper: typeof TRIGRAMS_8[0]; lower: typeof TRIGRAMS_8[0];
  binary: string; num: number;
  hex: { zh: string; th: string; en: string; symbol: string } | null;
  changing_line: number;
} | null {
  const sIdx = STEMS.indexOf(stem);
  const bIdx = BRANCHES.indexOf(branch);
  if (sIdx < 0 || bIdx < 0) return null;
  const upperIdx = (sIdx + bIdx) % 8;
  const lowerIdx = (sIdx + bIdx * 2 + 1) % 8;
  const upper = TRIGRAMS_8[upperIdx];
  const lower = TRIGRAMS_8[lowerIdx];
  const binary = upper.binary + lower.binary;
  const hex = HEXAGRAMS_64[binary] || null;
  return {
    upper, lower, binary,
    num: hex?.num || 0,
    hex: hex ? { zh: hex.zh, th: hex.th, en: hex.en, symbol: hex.symbol } : null,
    changing_line: ((sIdx + bIdx + 1) % 6) + 1,
  };
}

export function hexagramForYear(year: number): ReturnType<typeof hexagramForStemBranch> {
  const offset = ((year - 1984) % 60 + 60) % 60;
  const stem = STEMS[offset % 10];
  const branch = BRANCHES[offset % 12];
  return hexagramForStemBranch(stem, branch);
}

export function hexagramForToday(date: Date): ReturnType<typeof hexagramForStemBranch> & { _day_seed?: string } | null {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();
  const seed = y + m + d;
  const seedHr = y + m + d + h;
  const upperIdx = (seed % 8 + 8) % 8;
  const lowerIdx = (seedHr % 8 + 8) % 8;
  const upper = TRIGRAMS_8[upperIdx];
  const lower = TRIGRAMS_8[lowerIdx];
  const binary = upper.binary + lower.binary;
  const hex = HEXAGRAMS_64[binary] || null;
  return {
    upper, lower, binary,
    num: hex?.num || 0,
    hex: hex ? { zh: hex.zh, th: hex.th, en: hex.en, symbol: hex.symbol } : null,
    changing_line: (seed % 6) + 1,
    _day_seed: `${y}${m}${d}${h}`,
  } as any;
}
