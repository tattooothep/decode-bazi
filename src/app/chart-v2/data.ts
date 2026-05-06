// Mockup data for /chart-v2
// Subject: พิมพ์ใจ ศรีสุวรรณ · 1986-04-12 16:42 · Bangkok
// (verified vs Voytek 4/4 pillars · 6 พ.ค. 2026)

export const SUBJECT = {
  nameTh: "พิมพ์ใจ ศรีสุวรรณ",
  nameEn: "Phimchai Srisuwan",
  nameZh: "詩瑞萬·萍才",
  birthDate: "1986-04-12",
  birthTime: "16:42",
  birthCity: "Bangkok · 13.7563°N · 100.5018°E",
};

export type ElementCode = "Wood" | "Fire" | "Earth" | "Metal" | "Water";

export const ELEMENT_TOKEN: Record<ElementCode, string> = {
  Wood:  "var(--chart-1)",
  Fire:  "var(--chart-2)",
  Earth: "var(--chart-3)",
  Metal: "var(--chart-4)",
  Water: "var(--chart-5)",
};

export const ELEMENT_ZH: Record<ElementCode, string> = {
  Wood: "木", Fire: "火", Earth: "土", Metal: "金", Water: "水",
};

export const ELEMENT_TH: Record<ElementCode, string> = {
  Wood: "ไม้", Fire: "ไฟ", Earth: "ดิน", Metal: "ทอง", Water: "น้ำ",
};

export const PILLARS = [
  { label: "Hour",  labelZh: "時", stem: "丙", branch: "申", element: "Fire"  as ElementCode, godStem: "比 Friend",     hidden: ["庚","壬","戊"], pinyin: "Bǐng Shēn" },
  { label: "Day",   labelZh: "日", stem: "丙", branch: "戌", element: "Fire"  as ElementCode, godStem: "DAY MASTER",      hidden: ["戊","辛","丁"], pinyin: "Bǐng Xū",  isDM: true },
  { label: "Month", labelZh: "月", stem: "壬", branch: "辰", element: "Water" as ElementCode, godStem: "七殺 Qi Sha",     hidden: ["戊","乙","癸"], pinyin: "Rén Chén" },
  { label: "Year",  labelZh: "年", stem: "丙", branch: "寅", element: "Fire"  as ElementCode, godStem: "比 Friend",       hidden: ["甲","丙","戊"], pinyin: "Bǐng Yín" },
];

export const DM = {
  zh: "丙",
  pinyin: "Bǐng",
  en: "Yang Fire",
  th: "ไฟใหญ่ · พระอาทิตย์",
  strengthPercent: 62,
  status: "Strong" as "Weak" | "Slightly Weak" | "Balanced" | "Slightly Strong" | "Strong" | "Very Strong",
};

export const ELEMENTS_DIST: Record<ElementCode, number> = {
  Fire:  42,
  Earth: 18,
  Wood:  14,
  Metal: 16,
  Water: 10,
};

export const YONGSHEN = ["Water", "Metal"] as ElementCode[];
export const JI       = ["Fire", "Wood"] as ElementCode[];

export const TODAY = {
  date: "2026-05-06",
  dayPillar: "庚辰",
  score: 78,
  verdict: "GOOD" as const,
  verdictTh: "ดี",
  actionMode: "L2 Conditional",
  actionModeTh: "เงื่อนไข · ทำได้แต่ระวัง",
  actionModeColor: "var(--gold)",
  brief:
    "ดิน 庚辰 ดูดไฟ DM 丙 · เหมาะปิดดีลที่ค้างมานาน · ระวังคนธาตุไม้",
};

export const STARS_TOP = [
  { zh: "天乙貴人", th: "ขุนนาง", en: "Nobleman",        pillar: "hour", polarity: "good" as const },
  { zh: "月德貴人", th: "เทวคุณ", en: "Monthly Virtue",  pillar: "day",  polarity: "good" as const },
  { zh: "將都",     th: "ผู้บัญชา", en: "Commander",      pillar: "hour", polarity: "good" as const },
];
export const STARS_TOTAL = 8; // active out of 25

export const TEN_GODS = [
  { code: "比",    th: "เพื่อน",    pct: 24 },
  { code: "七殺",  th: "ผู้คุม",    pct: 18 },
  { code: "偏印",  th: "ครู",       pct: 14 },
  { code: "正官",  th: "นาย",       pct: 12 },
  { code: "傷官",  th: "พรสวรรค์",   pct: 10 },
  { code: "偏財",  th: "โอกาส",     pct: 8 },
  { code: "食神",  th: "ปลดปล่อย",  pct: 6 },
  { code: "正財",  th: "สะสม",      pct: 4 },
  { code: "正印",  th: "บ่มเพาะ",   pct: 3 },
  { code: "劫財",  th: "ขัดแข่ง",   pct: 1 },
];

export const LUCK_PILLARS = [
  { age: "0-9",   pillar: "辛卯", element: "Wood"  as ElementCode },
  { age: "10-19", pillar: "庚寅", element: "Wood"  as ElementCode },
  { age: "20-29", pillar: "己丑", element: "Earth" as ElementCode },
  { age: "30-39", pillar: "戊子", element: "Water" as ElementCode, current: true },
  { age: "40-49", pillar: "丁亥", element: "Water" as ElementCode },
  { age: "50-59", pillar: "丙戌", element: "Earth" as ElementCode },
  { age: "60-69", pillar: "乙酉", element: "Metal" as ElementCode },
  { age: "70-79", pillar: "甲申", element: "Metal" as ElementCode },
];

export const INTERACTIONS = [
  { type: "Stem Combo",      pattern: "丙辛→水", involved: ["year","month"], polarity: "good" as const },
  { type: "Branch 三合",     pattern: "申子辰→水", involved: ["hour","day","month"], polarity: "good" as const },
  { type: "Branch Clash",    pattern: "寅申冲", involved: ["year","hour"], polarity: "warn" as const },
  { type: "Fan Yin",         pattern: "丙寅 vs 庚申", involved: ["year","luck"], polarity: "warn" as const },
  { type: "Heaven Void",     pattern: "戌·亥", involved: ["all"], polarity: "neutral" as const },
];

// Tongshu today
export const TONGSHU = {
  dayOfficer: { zh: "閉", th: "ปิด", en: "Close" },
  twelveStar: { zh: "司命", th: "ผู้บัญชาชะตา" },
  constellation: { zh: "箕", th: "หมู่ดาวกี" },
  yi: ["嫁娶", "祭祀", "祈福", "求嗣", "出行"],
  yiTh: ["แต่งงาน", "บูชา", "อธิษฐาน", "ขอบุตร", "เดินทาง"],
  ji: ["开光", "掘井", "开仓"],
  jiTh: ["ทำพิธีเปิดบุญ", "ขุดบ่อ", "เปิดคลัง"],
  shenSha: ["月德","天恩","时德","阴德","福生","司命"],
};

export const COMPASS = {
  best: { zh: "東", th: "ตะวันออก", deg: 90 },
  avoid: { zh: "西", th: "ตะวันตก", deg: 270 },
};

export const HOURS_12 = [
  { zh: "子", h: "23-01", tone: "neutral" as const },
  { zh: "丑", h: "01-03", tone: "neutral" as const },
  { zh: "寅", h: "03-05", tone: "neutral" as const },
  { zh: "卯", h: "05-07", tone: "ok"      as const },
  { zh: "辰", h: "07-09", tone: "ok"      as const },
  { zh: "巳", h: "09-11", tone: "good"    as const },
  { zh: "午", h: "11-13", tone: "ok"      as const },
  { zh: "未", h: "13-15", tone: "ok"      as const },
  { zh: "申", h: "15-17", tone: "neutral" as const },
  { zh: "酉", h: "17-19", tone: "neutral" as const },
  { zh: "戌", h: "19-21", tone: "neutral" as const },
  { zh: "亥", h: "21-23", tone: "bad"     as const },
];
