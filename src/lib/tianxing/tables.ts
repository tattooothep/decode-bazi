/**
 * 天星擇日 · ตารางคลาสสิก (documented · ไม่ใช่ OCR)
 * ราศี/命主廟旺/喜怕(恩難) = หลัก 七政 มาตรฐาน (domicile/exaltation + 喜怕จาก果老星宗 prep#1)
 * ⚠️ V1 baseline: 廟旺ระดับราศี (ยังไม่ลง 度數เป๊ะของ果老) · ใช้ประกอบ ไม่ฟันธง · รอซินแสเสริม
 */
export type Lang3 = { th: string; en: string; zh: string };

/** 12 ราศี (0=เมษ..11=มีน) + เจ้าราศี(命主) */
export const SIGNS: { th: string; zh: string; en: string; ruler: string }[] = [
  { th: "เมษ", zh: "白羊", en: "Aries", ruler: "Mars" },
  { th: "พฤษภ", zh: "金牛", en: "Taurus", ruler: "Venus" },
  { th: "เมถุน", zh: "雙子", en: "Gemini", ruler: "Mercury" },
  { th: "กรกฎ", zh: "巨蟹", en: "Cancer", ruler: "Moon" },
  { th: "สิงห์", zh: "獅子", en: "Leo", ruler: "Sun" },
  { th: "กันย์", zh: "處女", en: "Virgo", ruler: "Mercury" },
  { th: "ตุล", zh: "天秤", en: "Libra", ruler: "Venus" },
  { th: "พิจิก", zh: "天蠍", en: "Scorpio", ruler: "Mars" },
  { th: "ธนู", zh: "人馬", en: "Sagittarius", ruler: "Jupiter" },
  { th: "มังกร", zh: "摩羯", en: "Capricorn", ruler: "Saturn" },
  { th: "กุมภ์", zh: "寶瓶", en: "Aquarius", ruler: "Saturn" },
  { th: "มีน", zh: "雙魚", en: "Pisces", ruler: "Jupiter" },
];

/** ดาว 7政+4餘 · ชื่อ 3 ภาษา + ธาตุ + ดี(吉)/ร้าย(凶)/餘 */
export const STARS: Record<string, { th: string; zh: string; en: string; element: string; kind: "ji" | "xiong" | "yu" }> = {
  Sun: { th: "อาทิตย์", zh: "日", en: "Sun", element: "yang", kind: "ji" },
  Moon: { th: "จันทร์", zh: "月", en: "Moon", element: "yin", kind: "ji" },
  Mercury: { th: "พุธ", zh: "水", en: "Mercury", element: "water", kind: "ji" },
  Venus: { th: "ศุกร์", zh: "金", en: "Venus", element: "metal", kind: "ji" },
  Mars: { th: "อังคาร", zh: "火", en: "Mars", element: "fire", kind: "xiong" },
  Jupiter: { th: "พฤหัส", zh: "木", en: "Jupiter", element: "wood", kind: "ji" },
  Saturn: { th: "เสาร์", zh: "土", en: "Saturn", element: "earth", kind: "xiong" },
  Rahu: { th: "ราหู", zh: "羅睺", en: "Rahu", element: "fire", kind: "xiong" },
  Ketu: { th: "เกตุ", zh: "計都", en: "Ketu", element: "earth", kind: "xiong" },
  Yuebo: { th: "เยวี่ยปั๋ว", zh: "月孛", en: "Yuebo", element: "water", kind: "yu" },
};

/** 廟(บ้านเดิม) · 旺(ราศีอุจ) ของ 7政 (sign index) — classical domicile/exaltation */
const DOMICILE: Record<string, number[]> = {
  Sun: [4], Moon: [3], Mercury: [2, 5], Venus: [1, 6], Mars: [0, 7], Jupiter: [8, 11], Saturn: [9, 10],
};
const EXALT: Record<string, number> = { Sun: 0, Moon: 1, Mercury: 5, Venus: 11, Mars: 9, Jupiter: 3, Saturn: 6 };
const opp = (s: number) => (s + 6) % 12;

/** สถานะกำลังดาว ณ ราศี → 廟/旺/落/陷/平 */
export function miaoWang(star: string, sign: number): { code: string; th: string; rank: number } {
  const dom = DOMICILE[star]; const ex = EXALT[star];
  if (dom?.includes(sign)) return { code: "廟", th: "บ้านเดิม (แรงสุด)", rank: 5 };
  if (ex === sign) return { code: "旺", th: "อุจ (รุ่งเรือง)", rank: 4 };
  if (dom?.map(opp).includes(sign)) return { code: "落", th: "นิจ (อ่อนแรง)", rank: 2 };
  if (ex !== undefined && opp(ex) === sign) return { code: "陷", th: "ตก (อับแสง)", rank: 1 };
  return { code: "平", th: "ปานกลาง", rank: 3 };
}

/** 喜怕 (恩/難) ราย 7政 — จาก 果老星宗 (prep#1) · ระบุธาตุดาวที่ "หนุน(喜→恩)" / "ทำร้าย(怕→難)" */
export const XIQA: Record<string, { en: string[]; nan: string[] }> = {
  Mercury: { en: ["metal"], nan: ["earth"] },        // 水喜金怕土
  Venus: { en: ["earth"], nan: ["fire"] },           // 金喜土怕火
  Saturn: { en: ["fire"], nan: ["wood"] },           // 土喜火怕木
  Mars: { en: ["wood"], nan: ["water"] },            // 火喜木怕水
  Jupiter: { en: ["water"], nan: ["metal"] },        // 木喜水怕金
  Sun: { en: ["metal", "water"], nan: ["wood"] },    // 日喜金水怕木
  Moon: { en: ["fire"], nan: ["earth"] },            // 月喜火(羅)怕土(計)
};

export const JI_STARS = ["Jupiter", "Venus", "Moon"];   // 吉星 木金月
export const XIONG_STARS = ["Mars", "Saturn", "Rahu", "Ketu"]; // 凶星 火土羅計

/** Lahiri ayanamsa (องศา) สำหรับแปลง tropical→sidereal · ⚠️ V1 placeholder · สำนักจีนยืนยันภายหลัง (prep#3) */
export function ayanamsa(date: Date): number {
  const yrs = (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 365.25;
  return 23.853 + yrs * 0.013971; // ~50.29"/ปี
}
