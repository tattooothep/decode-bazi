/**
 * fusion5 · registry 5 ศาสตร์ — single source ผูก {ศาสตร์, engine, คัมภีร์, AI, ยาม, ต้องเวลา}
 * หัวใจกันมั่ว: route/UI อ่านจากนี่ที่เดียว · ห้าม inline เลือก endpoint/คัมภีร์เอง
 * AI mapping ตาม spec เจ้านาย: 八字→Claude · 紫微→Gemini · 七政→Grok · Western→Claude · Vedic→Codex
 */
export type ScienceId = "bazi" | "ziwei" | "qizheng" | "western" | "vedic" | "uranian";

export type ScienceBinding = {
  id: ScienceId;
  labelTh: string; labelZh: string; labelEn: string;
  engine: string;                      // id engine deterministic
  defaultModel: string;                // AI ที่จับคู่
  fallbackModels: string[];
  knowledgeId: string;                 // คัมภีร์เฉพาะศาสตร์ (lock)
  needsBirthTime: boolean;             // true = ไม่มีเวลา → disable ทั้งศาสตร์; false = อาจอ่านแบบ degraded/no-time ได้
  /** @deprecated billing 2026-07: fusion หักตามตัวอักษรคำตอบ (≈30 ตัว/1 ยาม) เหมือน sifu · ค่านี้เหลือเพื่อ UI เก่า/ประมาณการเท่านั้น ไม่ใช้ charge */
  costYam: number;
  available: boolean;                  // false = engine ยังไม่พร้อม → "เร็วๆนี้"
  termGuard: string;                   // ศัพท์ที่ panel นี้ห้ามใช้ (กันปนศาสตร์)
};

export const DISCIPLINES: Record<ScienceId, ScienceBinding> = {
  bazi: {
    id: "bazi", labelTh: "ปาจื้อ 八字", labelZh: "八字", labelEn: "BaZi",
    engine: "bazi-chart-packet", defaultModel: "claude-max-cli", fallbackModels: ["codex-cli", "grok-cli"],
    knowledgeId: "bazi-interaction-master", needsBirthTime: false, costYam: 10, available: true,
    termGuard: "ห้ามใช้ศัพท์ฝรั่ง(house/aspect)หรือ紫微(主星)",
  },
  qizheng: {
    id: "qizheng", labelTh: "ดาวจริง 七政四餘", labelZh: "七政四餘", labelEn: "Real-Star (Guolao)",
    engine: "qizheng-realstar", defaultModel: "grok-cli", fallbackModels: ["claude-max-cli", "gemini-api"],
    knowledgeId: "qizheng-guolao", needsBirthTime: true, costYam: 15, available: true,
    termGuard: "ห้ามใช้ศัพท์ปาจื้อ(用神十神), ฝรั่ง, หรือ紫微四化(祿權科忌) · ใช้ 命主/命度/度主/身主/廟旺/恩用仇難/格局",
  },
  ziwei: {
    id: "ziwei", labelTh: "จื่อเวยโต่วซู 紫微斗數", labelZh: "紫微斗數", labelEn: "Zi Wei Dou Shu",
    engine: "ziwei-anxing", defaultModel: "gemini-api", fallbackModels: ["claude-max-cli", "codex-cli"],
    knowledgeId: "ziwei-quanshu", needsBirthTime: true, costYam: 12, available: true,
    termGuard: "ห้ามใช้ศัพท์ปาจื้อ(用神)/七政(廟旺) · ใช้ 主星/四化/十二宮/大限",
  },
  western: {
    id: "western", labelTh: "โหราตะวันตก", labelZh: "西洋占星", labelEn: "Western Astrology",
    engine: "western-tropical", defaultModel: "claude-max-cli", fallbackModels: ["codex-cli", "gemini-api"],
    knowledgeId: "western-ptolemy", needsBirthTime: false, costYam: 10, available: true,
    termGuard: "ห้ามใช้ศัพท์จีน(廟旺/用神/主星) · ใช้ sign/house/aspect/dignity",
  },
  vedic: {
    id: "vedic", labelTh: "โหราพระเวท (ฮินดู)", labelZh: "吠陀占星", labelEn: "Vedic Astrology",
    engine: "vedic-sidereal", defaultModel: "codex-cli", fallbackModels: ["claude-max-cli", "gemini-api"],
    knowledgeId: "vedic-parashara", needsBirthTime: false, costYam: 10, available: true,
    termGuard: "ห้ามใช้ศัพท์จีน · ใช้ graha/rashi/bhava/nakshatra/dasha",
  },
  // ศาสตร์ที่ 6 · ยูเรเนียน (Hamburger Schule · Alfred Witte) — งานต้องอ้าง verbatim เยอรมัน+ห้ามแต่ง → ใช้ Claude (แม่นสุด)
  uranian: {
    id: "uranian", labelTh: "โหราศาสตร์ยูเรเนียน", labelZh: "天王星占星(漢堡學派)", labelEn: "Uranian Astrology",
    engine: "uranian-midpoint", defaultModel: "claude-max-cli", fallbackModels: ["gemini-api", "grok-cli"],
    knowledgeId: "uranian-witte", needsBirthTime: false, costYam: 12, available: true,
    termGuard: "ใช้ Halbsumme/Planetenbild/sensitive Punkte/Meridian/Sonnenbogen · ห้ามปนศัพท์จีน(用神/廟旺/主星) หรือ Vedic(graha/dasha)",
  },
};

export const JUDGE_MODEL = "claude-max-cli";
/** @deprecated fusion billing = chars · ไม่ใช้ judge flat yam แล้ว */
export const JUDGE_YAM = 5;

/** ศาสตร์ที่เปิดใช้ได้จริงตอนนี้ */
export function availableSciences(): ScienceId[] {
  return (Object.keys(DISCIPLINES) as ScienceId[]).filter((k) => DISCIPLINES[k].available);
}

/**
 * @deprecated 2026-07 · fusion5 หักยามตามตัวอักษรคำตอบ (reserve 1 + drain) เหมือน /api/sifu
 * เหลือไว้เพื่อ estimate UI / compatibility · ห้ามใช้เป็น SoT ตัดเงิน
 */
export function computeYam(sciences: ScienceId[], profileCount: number): number {
  const valid = sciences.filter((s) => DISCIPLINES[s]?.available);
  const panels = valid.reduce((sum, s) => sum + DISCIPLINES[s].costYam * profileCount, 0);
  return panels + (valid.length >= 2 ? JUDGE_YAM : 0);
}
