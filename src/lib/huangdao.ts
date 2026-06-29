/**
 * 黃道吉時 (Huang Dao auspicious hours) · 29 มิ.ย. 2026
 * "ยามทอง" ราย時辰 — เทพ  12 ตน (黃道吉 6 / 黑道凶 6) ประจำแต่ละชั่วยาม
 * คำนวณจาก กิ่งวัน(日支) + กิ่งยาม(時支) ตามตำรา 協紀辨方書
 * ✅ verify ตรงกับ tyme4ts LunarHour.getTwelveStar() 36/36 (3 วัน × 12 ยาม)
 * pure function · ไม่แตะ DB/engine · ใช้ตอน read-time
 */

const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

/* 青龍黃道 เริ่มที่時支ใด ตาม日支 (子午起申 · 丑未起戌 · 寅申起子 · 卯酉起寅 · 辰戌起辰 · 巳亥起午) */
const QINGLONG_START: Record<string, string> = {
  子: "申", 午: "申", 丑: "戌", 未: "戌", 寅: "子", 申: "子",
  卯: "寅", 酉: "寅", 辰: "辰", 戌: "辰", 巳: "午", 亥: "午",
};

/* ลำดับ 12 เทพเวร เริ่มจาก 青龍 */
const DEITY_ORDER = ["青龙", "明堂", "天刑", "朱雀", "金匮", "天德", "白虎", "玉堂", "天牢", "玄武", "司命", "勾陈"];

/* 6 黃道吉 (ที่เหลือ 6 = 黑道凶) */
const GOOD = new Set(["青龙", "明堂", "金匮", "天德", "玉堂", "司命"]);

const DEITY_TH: Record<string, string> = {
  青龙: "ชิงหลง (มังกรเขียว)", 明堂: "หมิงถัง (ท้องพระโรง)", 金匮: "จินคุ่ย (หีบทอง)",
  天德: "เทียนเต๋อ (คุณธรรมฟ้า)", 玉堂: "อวี้ถัง (วังหยก)", 司命: "ซือม่ิง (เทพชะตา)",
  天刑: "เทียนสิง (อาญาฟ้า)", 朱雀: "จูเชวี่ย (นกแดง)", 白虎: "ไป๋หู่ (เสือขาว)",
  天牢: "เทียนเหลา (คุกฟ้า)", 玄武: "เสวียนอู่ (เต่าดำ)", 勾陈: "โกวเฉิน (เทพคุมขัง)",
};
const DEITY_EN: Record<string, string> = {
  青龙: "Green Dragon", 明堂: "Bright Hall", 金匮: "Golden Casket", 天德: "Heavenly Virtue",
  玉堂: "Jade Hall", 司命: "Life Governor", 天刑: "Heavenly Punishment", 朱雀: "Vermilion Bird",
  白虎: "White Tiger", 天牢: "Heavenly Prison", 玄武: "Black Tortoise", 勾陈: "Hooking Chen",
};

export type HuangDao = {
  deity_zh: string;   // 青龙 ...
  deity_th: string;
  deity_en: string;
  good: boolean;      // true=黃道吉(ยามทอง) · false=黑道凶
  path_zh: string;    // 黃道 / 黑道
  path_th: string;    // ยามทอง / ยามดำ
};

/** คำนวณ黃道吉時 จากกิ่งวัน + กิ่งยาม · คืน null ถ้ากิ่งไม่ถูกต้อง */
export function huangDaoHour(dayBranch: string, hourBranch: string): HuangDao | null {
  const startBranch = QINGLONG_START[dayBranch];
  if (!startBranch || !BRANCHES.includes(hourBranch)) return null;
  const offset = ((BRANCHES.indexOf(hourBranch) - BRANCHES.indexOf(startBranch)) % 12 + 12) % 12;
  const deity = DEITY_ORDER[offset];
  const good = GOOD.has(deity);
  return {
    deity_zh: deity,
    deity_th: DEITY_TH[deity] || deity,
    deity_en: DEITY_EN[deity] || deity,
    good,
    path_zh: good ? "黃道" : "黑道",
    path_th: good ? "ยามทอง" : "ยามดำ",
  };
}
