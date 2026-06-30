/**
 * โหราศาสตร์พระเวท (Vedic / Jyotish · sidereal Lahiri) — ตารางคงที่ (deterministic)
 * ⚠️ ห้าม AI คำนวณ · ตารางนี้คือค่าคงที่ตามตำรา Jyotish (Parashara)
 * ศัพท์ Vedic เท่านั้น: graha (ดาว) · rashi (ราศี) · bhava (เรือน) · nakshatra (ฤกษ์) · dasha (ทศา)
 */

/** กราหะ 9 ดวง (นพเคราะห์) · 7 政 + Rahu/Ketu (mean node) */
export type GrahaKey =
  | "Sun" | "Moon" | "Mars" | "Mercury" | "Jupiter" | "Venus" | "Saturn"
  | "Rahu" | "Ketu";

/** ชื่อไทยของกราหะ */
export const GRAHA_TH: Record<GrahaKey, string> = {
  Sun: "อาทิตย์",
  Moon: "จันทร์",
  Mars: "อังคาร",
  Mercury: "พุธ",
  Jupiter: "พฤหัสบดี",
  Venus: "ศุกร์",
  Saturn: "เสาร์",
  Rahu: "ราหู",
  Ketu: "เกตุ",
};

/** ลำดับกราหะตามตำรา (ใช้แสดงผล) */
export const GRAHA_ORDER: GrahaKey[] = [
  "Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu",
];

/** ===== RASHI (ราศี) ===== 12 ราศี เริ่มจากเมษ (0) */
export const RASHI_TH = [
  "เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์",
  "ตุล", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน",
];
export const RASHI_EN = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

/** เจ้าราศี (rashi lord) · เมษ=Mars … */
export const RASHI_LORDS: GrahaKey[] = [
  "Mars",    // 0 เมษ Aries
  "Venus",   // 1 พฤษภ Taurus
  "Mercury", // 2 เมถุน Gemini
  "Moon",    // 3 กรกฎ Cancer
  "Sun",     // 4 สิงห์ Leo
  "Mercury", // 5 กันย์ Virgo
  "Venus",   // 6 ตุล Libra
  "Mars",    // 7 พิจิก Scorpio
  "Jupiter", // 8 ธนู Sagittarius
  "Saturn",  // 9 มังกร Capricorn
  "Saturn",  // 10 กุมภ์ Aquarius
  "Jupiter", // 11 มีน Pisces
];

/** ===== exaltation / debilitation (อุจ/นิจ) ===== */
/** ราศีและองศาที่เป็นมหาอุจ (deep exaltation) · ราศีนิจ = ตรงข้าม (+6) */
export const EXALTATION: Partial<Record<GrahaKey, { sign: number; deg: number }>> = {
  Sun:     { sign: 0,  deg: 10 }, // อุจเมษ 10° · นิจตุล
  Moon:    { sign: 1,  deg: 3 },  // อุจพฤษภ 3° · นิจพิจิก
  Mars:    { sign: 9,  deg: 28 }, // อุจมังกร 28° · นิจกรกฎ
  Mercury: { sign: 5,  deg: 15 }, // อุจกันย์ 15° · นิจมีน
  Jupiter: { sign: 3,  deg: 5 },  // อุจกรกฎ 5° · นิจมังกร
  Venus:   { sign: 11, deg: 27 }, // อุจมีน 27° · นิจกันย์
  Saturn:  { sign: 6,  deg: 20 }, // อุจตุล 20° · นิจเมษ
};

/** ราศีนิจ = ตรงข้ามราศีอุจ */
export const DEBILITATION: Partial<Record<GrahaKey, number>> = Object.fromEntries(
  Object.entries(EXALTATION).map(([k, v]) => [k, (v!.sign + 6) % 12]),
) as Partial<Record<GrahaKey, number>>;

/** ระยะ combust (อัสตงคต) จากอาทิตย์ · องศา */
export const COMBUST_DEG: Partial<Record<GrahaKey, number>> = {
  Moon: 12, Mars: 17, Mercury: 14, Jupiter: 11, Venus: 10, Saturn: 15,
};

/** ===== NAKSHATRA (ฤกษ์) ===== 27 ฤกษ์ · แต่ละช่วง 13°20' = 13.3333° */
export const NAKSHATRA_SPAN = 360 / 27; // 13.333333…°
export const PADA_SPAN = NAKSHATRA_SPAN / 4; // 3°20' = 3.333333…°

/** ลำดับเจ้าฤกษ์ (vimshottari lord cycle) · Ketu→…→Mercury วน 3 รอบ = 27 */
export const LORD_CYCLE: GrahaKey[] = [
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
];

export type Nakshatra = { index: number; name: string; nameTh: string; lord: GrahaKey };

const NAK_NAMES_EN = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
  "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni",
  "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha",
  "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
];
const NAK_NAMES_TH = [
  "อัศวินี", "ภรณี", "กฤติกา", "โรหิณี", "มฤคศิระ", "อารทรา",
  "ปุนัพสุ", "ปุษยะ", "อาศเลษา", "มฆา", "ปุรพผลคุนี", "อุตรผลคุนี",
  "หัสตะ", "จิตรา", "สวาติ", "วิศาขา", "อนุราธา", "เชษฐา",
  "มูละ", "ปุรพษาฒ", "อุตรษาฒ", "ศรวณะ", "ธนิษฐา", "ศตภิษัช",
  "ปุรพภัทรบท", "อุตรภัทรบท", "เรวดี",
];

/** ตาราง 27 ฤกษ์ (สร้างจากชื่อ + เจ้าฤกษ์วน 9) */
export const NAKSHATRAS: Nakshatra[] = NAK_NAMES_EN.map((name, i) => ({
  index: i,
  name,
  nameTh: NAK_NAMES_TH[i],
  lord: LORD_CYCLE[i % 9],
}));

/** ===== VIMSHOTTARI DASHA ===== ปีของแต่ละเจ้าทศา รวม 120 ปี */
export const DASHA_YEARS: Record<GrahaKey, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7,
  Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
  // Rahu/Ketu มีค่าครบ; รวม Ketu7+Venus20+Sun6+Moon10+Mars7+Rahu18+Jupiter16+Saturn19+Mercury17 = 120
};
export const VIMSHOTTARI_TOTAL = 120;

/** ค้นหาฤกษ์จาก sidereal longitude (0-360) */
export function nakshatraOf(sidLon: number): Nakshatra {
  const L = ((sidLon % 360) + 360) % 360;
  return NAKSHATRAS[Math.floor(L / NAKSHATRA_SPAN) % 27];
}

/** บาท (pada) 1-4 จาก sidereal longitude */
export function padaOf(sidLon: number): number {
  const L = ((sidLon % 360) + 360) % 360;
  const inNak = L % NAKSHATRA_SPAN;
  return Math.floor(inNak / PADA_SPAN) + 1;
}
