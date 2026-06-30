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

/**
 * 落/不得地 ตามตำรา果老星宗總論 (extract_miaowang prep · 30 มิ.ย.)
 * — ตำราระบุ "不得地/落" เฉพาะบางดาว และ "ไม่ใช่ตรงข้าม 180° เสมอ"
 * V1 เดิมใช้ opp(domicile) ล้วน → 金·木 วางผิด · override ด้วยค่าจาก總論:
 *   金 不得地 = 寅(人馬/Sagittarius idx8)  · 木 不得地 = 子(寶瓶/Aquarius idx10)
 *   (火 落=酉/Taurus idx1 = opp(Scorpio) บังเอิญตรง · ดาวอื่นคง opp ตามเดิม)
 * ที่มา: 果老星宗 ⟨ดาว⟩總論 (ctext 張果星宗 ws904682) · cross-check DOMICILE 7/7, EXALT 6/7
 */
const LUO_OVERRIDE: Record<string, number[]> = {
  Venus: [8],    // 金不得地=人馬(Sagittarius)
  Jupiter: [10], // 木不得地=寶瓶(Aquarius)
};

/** สถานะกำลังดาว ณ ราศี → 廟/旺/落/陷/平 */
export function miaoWang(star: string, sign: number): { code: string; th: string; rank: number } {
  const dom = DOMICILE[star]; const ex = EXALT[star];
  if (dom?.includes(sign)) return { code: "廟", th: "บ้านเดิม (แรงสุด)", rank: 5 };
  if (ex === sign) return { code: "旺", th: "อุจ (รุ่งเรือง)", rank: 4 };
  // 落: ใช้ค่าตำรา總論 ก่อน (金·木) แล้วค่อย fallback opp(domicile)
  const luo = LUO_OVERRIDE[star];
  if (luo?.includes(sign)) return { code: "落", th: "ตกภพ/ไม่ได้ที่ (อ่อนแรง)", rank: 2 };
  if (!luo && dom?.map(opp).includes(sign)) return { code: "落", th: "ตกภพ (อ่อนแรง)", rank: 2 };
  if (ex !== undefined && opp(ex) === sign) return { code: "陷", th: "นิจ (อับแสงสุด)", rank: 1 };
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

// =====================================================================
// A3 · 恩用仇難 4 ขา (รอบ用神/命度主) — 果老星宗 (extract_enyong_natal prep · 30 มิ.ย.)
// ระบบเต็ม果老 = 4 ขา อิง用神(element): 恩=生用神(印) · 用=用神生(食傷·剋難จึงดี) · 仇=用神剋(財·剋恩จึงร้าย) · 難=剋用神(官殺·ร้ายสุด)
// V1 เดิมมีแค่ 喜怕=恩難(2 ขา) · ที่มา GLXZ1卷一(L4978/L5073) + ctext恩用仇難 · ⚠️ 日月ใช้กฎพิเศษ(君/后·調候) ไม่ตาม生剋ล้วน → ใช้ XIQA special + flag
// =====================================================================
const GEN: Record<string, string> = { wood: "water", fire: "wood", earth: "fire", metal: "earth", water: "metal" };       // 生我者(恩)
const PRODUCES: Record<string, string> = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };   // 我生者(用)
const CONTROLS: Record<string, string> = { wood: "earth", fire: "metal", earth: "water", metal: "wood", water: "fire" };   // 我剋者(仇)
const CONTROLLED: Record<string, string> = { wood: "metal", fire: "water", earth: "wood", metal: "fire", water: "earth" }; // 剋我者(難)

export type FourRel = { en: string[]; yong: string[]; chou: string[]; nan: string[]; special: boolean };

/** หา 恩/用/仇/難 (เป็นธาตุ) รอบ用神 ตาม element · 日月ใช้ XIQA พิเศษ (มีแค่ en/nan · flag special) */
export function fourRelations(rulerKey: string): FourRel {
  if (rulerKey === "Sun" || rulerKey === "Moon") {
    const xq = XIQA[rulerKey];
    return { en: xq?.en || [], yong: [], chou: [], nan: xq?.nan || [], special: true };
  }
  const E = STARS[rulerKey]?.element;
  if (!E || !GEN[E]) return { en: [], yong: [], chou: [], nan: [], special: false };
  return { en: [GEN[E]], yong: [PRODUCES[E]], chou: [CONTROLS[E]], nan: [CONTROLLED[E]], special: false };
}

// =====================================================================
// A4 · 格局 sign-level (合格/忌格) — 張果星宗五 (extract_geju prep · ctext ch.349444)
// เลือกเฉพาะ格ที่ตัดสินได้ด้วย "ราศีของดาว + 命宮" เท่านั้น (ไม่ต้องใช้ 宿/距度 ที่ยัง block)
// verbatim จากตำรา · ห้ามแต่ง · ส่วน格ที่ต้อง宿/廟旺度/晝夜 (T2) รอ distance table
// แผนที่宮地支→ราศี: 子=寶瓶10 丑=摩羯9 寅=人馬8 卯=天蠍7 辰=天秤6 巳=雙女5 午=獅子4 未=巨蟹3 申=雙子2 酉=金牛1 戌=白羊0 亥=雙魚11
// =====================================================================
export type GejuRule = {
  id: string; th: string; zh: string; good: boolean;
  /** ctx: signOf(starKey)→sign | ascSign | trine(a,b) 三合 | adjacent(a,b) ขนาบ */
  test: (ctx: GejuCtx) => boolean;
};
export type GejuCtx = {
  signOf: (key: string) => number | null;
  ascSign: number;
};
const LEO = 4, CANCER = 3;
// 五星居垣(合) = ดาวอยู่บ้านเดิม(廟) · 五星忌(入克宮) = ดาวในบ้านดาวที่剋กัน
export const GEJU_RULES: GejuRule[] = [
  // — 日月合格 (sign-level) —
  { id: "sun_own", th: "อาทิตย์อยู่ราศีสิงห์ (日居日位)", zh: "日居午位", good: true, test: c => c.signOf("Sun") === LEO },
  { id: "moon_own", th: "จันทร์อยู่ราศีกรกฎ (月居本垣)", zh: "月居未垣", good: true, test: c => c.signOf("Moon") === CANCER },
  { id: "sun_moon_palace", th: "อาทิตย์สิงห์+จันทร์กรกฎ (日月居垣)", zh: "日月居垣", good: true, test: c => c.signOf("Sun") === LEO && c.signOf("Moon") === CANCER },
  // — 日月忌格 —
  { id: "sun_moon_seat", th: "อาทิตย์ไปนั่งภพจันทร์ (日居月位)", zh: "日居未宮", good: false, test: c => c.signOf("Sun") === CANCER },
  { id: "moon_sun_seat", th: "จันทร์ไปนั่งภพอาทิตย์ (月到日宮)", zh: "月在午宮", good: false, test: c => c.signOf("Moon") === LEO },
  // — 五星居垣 (合·ดาวในบ้านเดิม) —
  { id: "jupiter_yuan", th: "พฤหัสครองบ้านเดิม (歲星居垣)", zh: "木在寅亥", good: true, test: c => [8, 11].includes(c.signOf("Jupiter") ?? -1) },
  { id: "mars_yuan", th: "อังคารครองบ้านเดิม (熒惑居垣)", zh: "火在卯戌", good: true, test: c => [7, 0].includes(c.signOf("Mars") ?? -1) },
  { id: "saturn_yuan", th: "เสาร์ครองบ้านเดิม (鎮星居垣)", zh: "土在子丑", good: true, test: c => [10, 9].includes(c.signOf("Saturn") ?? -1) },
  { id: "venus_yuan", th: "ศุกร์ครองบ้านเดิม (太白居垣)", zh: "金在辰酉", good: true, test: c => [6, 1].includes(c.signOf("Venus") ?? -1) },
  { id: "mercury_yuan", th: "พุธครองบ้านเดิม (辰星居垣)", zh: "水在巳申", good: true, test: c => [5, 2].includes(c.signOf("Mercury") ?? -1) },
  // — 五星忌格 (入克宮·ดาวในบ้านดาวที่ปะทะธาตุ) —
  { id: "jupiter_metal", th: "พฤหัสตกเรือนทอง (木入金鄉)", zh: "木在辰酉", good: false, test: c => [6, 1].includes(c.signOf("Jupiter") ?? -1) },
  { id: "mars_water", th: "อังคารตกเรือนน้ำ (火居水地)", zh: "火在巳申", good: false, test: c => [5, 2].includes(c.signOf("Mars") ?? -1) },
  { id: "saturn_wood", th: "เสาร์ตกเรือนไม้ (土在木宮)", zh: "土在寅亥", good: false, test: c => [8, 11].includes(c.signOf("Saturn") ?? -1) },
  { id: "venus_fire", th: "ศุกร์ตกเรือนไฟ (金乘火位)", zh: "金在卯戌", good: false, test: c => [7, 0].includes(c.signOf("Venus") ?? -1) },
  { id: "mercury_earth", th: "พุธตกเรือนดิน (水居土室)", zh: "水在子丑", good: false, test: c => [10, 9].includes(c.signOf("Mercury") ?? -1) },
];

/** Lahiri ayanamsa (องศา) สำหรับแปลง tropical→sidereal · ⚠️ V1 placeholder · สำนักจีนยืนยันภายหลัง (prep#3) */
export function ayanamsa(date: Date): number {
  const yrs = (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 365.25;
  return 23.853 + yrs * 0.013971; // ~50.29"/ปี
}
