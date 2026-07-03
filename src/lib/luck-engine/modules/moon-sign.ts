/**
 * Module · 月宿宮 จันทร์ประจำราศี (Moon Sign · electional) — r372 · opt-in
 * =====================================================================
 * จันทร์ (tropical) อยู่ราศีไหน ณ กลาง slot → เทียบตาราง activity×sign
 * แบบตำรา electional (Lilly-line): จันทร์ในราศีที่เข้ากับ "ดาวเจ้ากิจกรรม" = หนุน
 * ราศี detriment/fall ของดาวเจ้ากิจกรรม หรือราศีที่จันทร์เองอ่อน (Scorpio=fall ·
 * Capricorn=detriment — Lilly ให้เลี่ยงจันทร์ราศีพิจิก/มังกรในงาน election ทั่วไป) = ลบ
 *
 * ⚠️ BASELINE TABLE: data/library/astro-canon/western/ (grep แล้ว) มีเฉพาะ guard-level
 *    rules (00g-horary-electional) + dignity pack (05) — ไม่มีตาราง sign×กิจกรรมละเอียด
 *    → ใช้เกณฑ์ทั่วไปตามหลัก dignity คลาสสิก (rulership/exaltation ของดาวเจ้ากิจกรรม
 *    = ดี · detriment/fall ของมัน + จันทร์อ่อน = ลบ) และทำเครื่องหมาย baseline ไว้
 *    (ถ้าได้ตำราละเอียดค่อยยกระดับ · ห้าม AI เดาเพิ่ม — กฎข้อ 9)
 *
 * ⚠️ opt-in เหมือน dong_gong/tian_xing (r367): route แนบเฉพาะเมื่อ user ติ๊ก
 * ⚠️ moon_sign ไม่อยู่ใน UNIVERSAL_MODULES / DATEPICK_HARD_MODULES —
 *    aj_ephemeris_cache ไม่มีคอลัมน์ moon_sign (ใส่ UNIVERSAL → SQL error → ฤกษ์หายทั้งหน้า)
 * ⚠️ moon_sign เป็น "ตัวถ่วง" ไม่ใช่ "ตัวตัด": soft score +6/-6 · ไม่มี cap
 *    (weight 0.02 ใน weights matrix → กระทบ weighted average เบา ๆ ตามที่เจ้านายสั่ง)
 */
import type { ModuleResult, Reason, CandidateSlot, ActivityType } from "../types";
import { eclipticLon } from "@/lib/astro-core/ephemeris";

/** ราศี 0=เมษ(Aries) … 11=มีน(Pisces) · tropical (lon/30) */
export const SIGN_TH = [
  "เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์",
  "ตุลย์", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน",
];
const SIGN_ZH = ["白羊", "金牛", "雙子", "巨蟹", "獅子", "處女", "天秤", "天蠍", "射手", "摩羯", "水瓶", "雙魚"];

// ดัชนีราศี (อ่านง่าย)
const ARI = 0, TAU = 1, GEM = 2, CAN = 3, LEO = 4, VIR = 5, LIB = 6, SCO = 7, SAG = 8, CAP = 9, AQU = 10, PIS = 11;

/**
 * ตาราง activity×sign (baseline · หลักที่ใช้ต่อกิจกรรม):
 *   立約 เจ้ากิจกรรม=พุธ(เอกสาร/ตกลง): ดี Gemini/Virgo (พุธครอง) + Libra (ตราชู-ข้อตกลง)
 *        ลบ Sagittarius/Pisces (พุธ detriment) + Scorpio (จันทร์ fall)
 *   出行 การเคลื่อนที่: ดี Gemini (ทางสั้น/สื่อสาร) + Sagittarius (ทางไกล · พฤหัสครอง 9th)
 *        + Cancer (จันทร์ครอง · น้ำเดินทางสะดวกตามตำราเรือ) · ลบ Scorpio/Capricorn (จันทร์อ่อน)
 *   動土 โครงสร้าง/ฐานราก: ดีราศีธาตุมั่นคง Taurus (จันทร์ exalt · ดินคงที่) + Leo + Aquarius
 *        (fixed signs = ฐานมั่น) · ลบ Scorpio/Capricorn (จันทร์อ่อน)
 *   搬家 บ้าน/ที่อยู่: ดี Taurus (มั่นคง) + Cancer (จันทร์ครอง=เรือน) + Libra (เรือนสงบ)
 *        ลบ Scorpio/Capricorn (จันทร์อ่อน) + Aries (ร้อนรน ไม่ลงหลัก)
 *   開市 เปิดกิจการ: ดี Taurus (ทรัพย์) + Leo (หน้าร้าน/การเห็น) + Sagittarius (ขยายตัว-พฤหัส)
 *        ลบ Scorpio/Capricorn (จันทร์อ่อน) + Pisces (การค้าเลือนไหล · พุธ detriment)
 *   婚姻 เจ้ากิจกรรม=ศุกร์: ดี Taurus/Libra (ศุกร์ครอง) + Pisces (ศุกร์ exalt) — ตาม Lilly
 *        ลบ Aries/Scorpio (ศุกร์ detriment) + Capricorn (จันทร์ detriment)
 *   求財 ทรัพย์: ดี Taurus (จันทร์ exalt · เรือนทรัพย์) + Sagittarius/Pisces (พฤหัสครอง=ลาภ)
 *        ลบ Scorpio/Capricorn (จันทร์อ่อน)
 *   祭祀 พิธี/ศรัทธา: ดี Pisces/Sagittarius (พฤหัส=ศาสนา) + Cancer (จันทร์ครอง=พิธีในเรือน)
 *        ลบ Scorpio/Capricorn (จันทร์อ่อน)
 */
export const MOON_SIGN_TABLE: Record<ActivityType, { good: number[]; bad: number[] }> = {
  立約: { good: [GEM, VIR, LIB], bad: [SAG, PIS, SCO] },
  出行: { good: [GEM, SAG, CAN], bad: [SCO, CAP] },
  動土: { good: [TAU, LEO, AQU], bad: [SCO, CAP] },
  搬家: { good: [TAU, CAN, LIB], bad: [SCO, CAP, ARI] },
  開市: { good: [TAU, LEO, SAG], bad: [SCO, CAP, PIS] },
  婚姻: { good: [TAU, LIB, PIS], bad: [ARI, SCO, CAP] },
  求財: { good: [TAU, SAG, PIS], bad: [SCO, CAP] },
  祭祀: { good: [PIS, SAG, CAN], bad: [SCO, CAP] },
};

const SOFT_DELTA = 6; // soft ±6 · ไม่มี cap (ตัวถ่วง ไม่ใช่ตัวตัด)

/** กลาง時辰 (convention เดียวกับ tian-xing.ts · 子=00:00 นาฬิกาไทย) */
function slotMidUtc(c: CandidateSlot): Date | null {
  const date = c.calendar?.gregorianDate;
  const sc = c.calendar?.shichen;
  if (!date || typeof sc !== "number" || !Number.isFinite(sc)) return null;
  const d = new Date(`${date}T${String((sc * 2) % 24).padStart(2, "0")}:00:00+07:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function computeMoonSign(c: CandidateSlot, activity: ActivityType): ModuleResult {
  const mid = slotMidUtc(c);
  const table = MOON_SIGN_TABLE[activity];
  if (!mid || !table) {
    return {
      module: "moon_sign", status: "missing",
      score: { raw: 50, normalized: 50, weight: 1 }, pass: true, tags: [],
      reasons: { up: [], down: [], warning: [] }, confidence: 0, raw: {},
    };
  }

  const lon = eclipticLon("Moon", mid);
  const sign = Math.floor(lon / 30) % 12;
  const good = table.good.includes(sign);
  const bad = table.bad.includes(sign);
  const delta = good ? SOFT_DELTA : bad ? -SOFT_DELTA : 0;
  const normalized = 50 + delta;

  const up: Reason[] = [];
  const down: Reason[] = [];
  if (good) {
    up.push({
      code: "MOON_SIGN_FIT",
      thai: `จันทร์อยู่ราศี${SIGN_TH[sign]} · เข้ากับกิจกรรมนี้ตามตำรา electional (+${SOFT_DELTA} เบา ๆ)`,
      zh: `月在${SIGN_ZH[sign]}`,
      delta: SOFT_DELTA,
      severity: "info",
      source: "moon_sign",
    });
  } else if (bad) {
    down.push({
      code: "MOON_SIGN_WEAK",
      thai: `จันทร์อยู่ราศี${SIGN_TH[sign]} · ไม่หนุนกิจกรรมนี้ตามตำรา electional (−${SOFT_DELTA} เบา ๆ · ไม่ตัดฤกษ์)`,
      zh: `月在${SIGN_ZH[sign]}`,
      delta: -SOFT_DELTA,
      severity: "info",
      source: "moon_sign",
    });
  }

  return {
    module: "moon_sign",
    status: "ready",
    score: { raw: normalized, normalized, weight: 1 },
    pass: true, // soft scorer · ไม่ตัด
    tags: [`moon_${sign}`, good ? "moon_sign_fit" : bad ? "moon_sign_weak" : "moon_sign_neutral"],
    reasons: { up, down, warning: [] },
    confidence: 0.75, // baseline table (ยังไม่มีตำราละเอียดใน canon)
    raw: {
      moon_lon: Math.round(lon * 100) / 100,
      sign,
      sign_th: SIGN_TH[sign],
      sign_zh: SIGN_ZH[sign],
      fit: good ? "good" : bad ? "bad" : "neutral",
      table_source: "baseline_dignity", // ตาราง baseline จาก dignity คลาสสิก (ดู comment หัวไฟล์)
    },
  };
}
