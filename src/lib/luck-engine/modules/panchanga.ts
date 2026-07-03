/**
 * Module · ปัญจางค์ 5 องค์ (Pañcāṅga · पञ्चाङ्ग) — r374 phase-3 · opt-in · หมวด ② ท้องฟ้าจริง
 * =====================================================================
 * ปัญจางค์ = องค์ประกอบ 5 อย่างของวันตามระบบมุหูรตะ/ปฏิทินอินเดีย (Panchanga):
 *   1. ติถี (tithi)       = ดิถีจันทร์ = (จันทร์−อาทิตย์)/12° → 1-30
 *                            1-15 ศุกลปักษ์ (ข้างขึ้น) · 16-30 กฤษณปักษ์ (ข้างแรม)
 *                            (ayanamsa หักล้างกันเองใน "ผลต่าง" → ใช้ tropical ได้ตรงตำรา)
 *   2. วาระ (vāra)        = วันสัปดาห์ · แสดงประกอบเท่านั้น ไม่ใช้ตัดสินเดี่ยว
 *                            (ตำราแท้นับ sunrise→sunrise · ที่นี่ใช้วันปฏิทินไทยของ slot
 *                             เพราะไม่มีกฎตัดคะแนนอิงวาระเดี่ยว ๆ — กันคลาดยามก่อนรุ่ง)
 *   3. นักษัตร (nakṣatra) = ฤกษ์จันทร์ 27 ฤกษ์ = จันทร์ sidereal (Lahiri) /13°20′
 *   4. โยคะ (yoga)        = (อาทิตย์ sidereal + จันทร์ sidereal)/13°20′ → 27 โยคะ
 *   5. กรณะ (karaṇa)      = ครึ่งติถี = (จันทร์−อาทิตย์)/6° → 60 ช่อง
 *                            ช่อง 0=กิงสตุฆนะ · 1-56 วน 7 กรณะจร (พวะ..วิษฏิ) · 57-59 กรณะคงที่
 *
 * กติกาคะแนน (เฉพาะกฎที่ตำรามาตรฐานลงรอยกัน · อ้าง Muhūrta Cintāmaṇi ของ Rāma Daivajña
 * + ธรรมเนียมปัญจางคะอินเดียใต้ที่ใช้แพร่หลาย เช่น Drik Panchang):
 *   · ติถีริกตา (riktā tithi = จตุรถี 4 / นวมี 9 / จตุรทศี 14 ของทั้งสองปักษ์)
 *     ตำราจัดเป็นกลุ่มติถี "ว่างเปล่า" ห้ามงานมงคลเริ่มใหม่ → กิจกรรม 開市/婚姻 cap 55
 *     กิจกรรมอื่น = เตือนอย่างเดียว (PANCHANGA_RIKTA_CAP)
 *   · กรณะวิษฏิ (Viṣṭi = ภัทรา Bhadrā) — กรณะจรตัวที่ 7 · ตำราทุกสายห้ามเริ่มงานมงคล
 *     ระหว่างภัทรา → cap 55 ทุกกิจกรรม (PANCHANGA_VISHTI_CAP)
 *   · อมาวสยา (amāvāsyā = ติถี 30 จันทร์ดับ) — ห้ามงานมงคลทุกชนิด ยกเว้นพิธีบูชา
 *     บรรพบุรุษ (pitṛ-kārya) → cap 45 ทุกกิจกรรมยกเว้น 祭祀 (PANCHANGA_AMAVASYA_CAP)
 *   · โยคะร้าย วยตีปาตะ (Vyatīpāta #17) / ไวธฤติ (Vaidhṛti #27) — ตำราให้เลี่ยงทั้งช่วงโยคะ
 *     → cap 60 ทุกกิจกรรม (PANCHANGA_BAD_YOGA_CAP)
 *   · โยคะดี สิทธิ (Siddhi #16) / สิทธะ (Siddha #21) / ศุภะ (Śubha #23) → +5 เบา ๆ
 *     (โยคะ "อมฤตสิทธิ" แบบ vāra×nakṣatra เป็นตารางแยก ยังไม่ implement — ห้ามเดาเพิ่ม กฎข้อ 9)
 *
 * ⚠️ opt-in เหมือน sky modules r372: route แนบเฉพาะเมื่อ user ติ๊ก (panchanga ∈ activeModules)
 * ⚠️ panchanga ไม่อยู่ใน UNIVERSAL_MODULES / DATEPICK_HARD_MODULES —
 *    aj_ephemeris_cache ไม่มีคอลัมน์ panchanga (ใส่ UNIVERSAL → SQL error → ฤกษ์หายทั้งหน้า)
 *    ตัดฤกษ์ผ่าน caps ใน combineScores + enforceSkyCaps เท่านั้น
 * แสดงชื่อไทย + สันสกฤตทับศัพท์เสมอ · perf: cache ราย slot-midpoint (module-level Map)
 */
import type { ModuleResult, Reason, CapRule, CandidateSlot, ActivityType } from "../types";
import { eclipticLon, norm360 } from "@/lib/astro-core/ephemeris";
import { lahiriAyanamsa } from "@/lib/astro-core/ayanamsa";
import { NAKSHATRA_SPAN, NAKSHATRAS, padaOf } from "@/lib/astro/vedic/tables";
import { slotWindowUtc, thaiDateStr, evictFifo } from "./sky-shared";

/** ชื่อติถี 1-14 ของแต่ละปักษ์ (ตัวที่ 15 = ปูรณิมา/อมาวสยา แยกตามปักษ์) · ไทยทับศัพท์+Latin */
export const TITHI_NAMES: { th: string; sa: string }[] = [
  { th: "ปรติปทา", sa: "Pratipadā" }, { th: "ทวิตียา", sa: "Dvitīyā" },
  { th: "ตฤตียา", sa: "Tṛtīyā" }, { th: "จตุรถี", sa: "Caturthī" },
  { th: "ปัญจมี", sa: "Pañcamī" }, { th: "ษัษฐี", sa: "Ṣaṣṭhī" },
  { th: "สัปตมี", sa: "Saptamī" }, { th: "อัษฏมี", sa: "Aṣṭamī" },
  { th: "นวมี", sa: "Navamī" }, { th: "ทศมี", sa: "Daśamī" },
  { th: "เอกาทศี", sa: "Ekādaśī" }, { th: "ทวาทศี", sa: "Dvādaśī" },
  { th: "ตรโยทศี", sa: "Trayodaśī" }, { th: "จตุรทศี", sa: "Caturdaśī" },
];
export const PURNIMA = { th: "ปูรณิมา (จันทร์เพ็ญ)", sa: "Pūrṇimā" };
export const AMAVASYA = { th: "อมาวสยา (จันทร์ดับ)", sa: "Amāvāsyā" };

/** โยคะ 27 (index 0 = โยคะที่ 1 วิษกัมภะ) · ไทยทับศัพท์+Latin */
export const YOGA_NAMES: { th: string; sa: string }[] = [
  { th: "วิษกัมภะ", sa: "Viṣkambha" }, { th: "ปรีติ", sa: "Prīti" },
  { th: "อายุษมาน", sa: "Āyuṣmān" }, { th: "เสาภาคยะ", sa: "Saubhāgya" },
  { th: "โศภนะ", sa: "Śobhana" }, { th: "อติคัณฑะ", sa: "Atigaṇḍa" },
  { th: "สุกรมัน", sa: "Sukarman" }, { th: "ธฤติ", sa: "Dhṛti" },
  { th: "ศูละ", sa: "Śūla" }, { th: "คัณฑะ", sa: "Gaṇḍa" },
  { th: "วฤทธิ", sa: "Vṛddhi" }, { th: "ธรุวะ", sa: "Dhruva" },
  { th: "วยาฆาตะ", sa: "Vyāghāta" }, { th: "หรรษณะ", sa: "Harṣaṇa" },
  { th: "วัชระ", sa: "Vajra" }, { th: "สิทธิ", sa: "Siddhi" },
  { th: "วยตีปาตะ", sa: "Vyatīpāta" }, { th: "วรียาน", sa: "Varīyān" },
  { th: "ปริฆะ", sa: "Parigha" }, { th: "ศิวะ", sa: "Śiva" },
  { th: "สิทธะ", sa: "Siddha" }, { th: "สาธยะ", sa: "Sādhya" },
  { th: "ศุภะ", sa: "Śubha" }, { th: "ศุกละ", sa: "Śukla" },
  { th: "พรหมะ", sa: "Brahma" }, { th: "อินทระ", sa: "Indra" },
  { th: "ไวธฤติ", sa: "Vaidhṛti" },
];
/** โยคะดี (Muhūrta Cintāmaṇi นับเป็นศุภโยคะเด่น) · index 0-based: สิทธิ#16 สิทธะ#21 ศุภะ#23 */
export const BENEFIC_YOGAS = new Set([15, 20, 22]);
/** โยคะร้ายที่ตำราให้เลี่ยงทั้งช่วง · วยตีปาตะ#17 ไวธฤติ#27 (0-based 16, 26) */
export const MALEFIC_YOGAS = new Set([16, 26]);

/** กรณะจร 7 ตัว (วนช่อง 1-56) · ตัวที่ 7 วิษฏิ=ภัทรา คือกรณะร้าย */
export const KARANA_MOVABLE: { th: string; sa: string }[] = [
  { th: "พวะ", sa: "Bava" }, { th: "พาลวะ", sa: "Bālava" },
  { th: "เกาลวะ", sa: "Kaulava" }, { th: "ไตติละ", sa: "Taitila" },
  { th: "คระ", sa: "Gara" }, { th: "วณิชะ", sa: "Vaṇija" },
  { th: "วิษฏิ (ภัทรา)", sa: "Viṣṭi (Bhadrā)" },
];
/** กรณะคงที่ 4 ตัว · ช่อง 57=ศกุนิ 58=จตุษปาท 59=นาคะ 0=กิงสตุฆนะ */
export const KARANA_FIXED: Record<number, { th: string; sa: string }> = {
  57: { th: "ศกุนิ", sa: "Śakuni" },
  58: { th: "จตุษปาท", sa: "Catuṣpāda" },
  59: { th: "นาคะ", sa: "Nāga" },
  0: { th: "กิงสตุฆนะ", sa: "Kiṃstughna" },
};

/** วาระ (วันสัปดาห์) · 0=อาทิตย์ .. 6=เสาร์ · ไทย+สันสกฤตทับศัพท์ */
export const VARA_NAMES: { th: string; sa: string }[] = [
  { th: "อาทิตย์", sa: "Ravivāra" }, { th: "จันทร์", sa: "Somavāra" },
  { th: "อังคาร", sa: "Maṅgalavāra" }, { th: "พุธ", sa: "Budhavāra" },
  { th: "พฤหัสบดี", sa: "Guruvāra" }, { th: "ศุกร์", sa: "Śukravāra" },
  { th: "เสาร์", sa: "Śanivāra" },
];

export type Panchanga = {
  /** ติถี 1-30 (1-15 ศุกลปักษ์ · 16-30 กฤษณปักษ์) */
  tithi: number;
  /** ติถีในปักษ์ 1-15 */
  tithiInPaksha: number;
  paksha: "shukla" | "krishna";
  tithiTh: string;
  tithiSa: string;
  isRikta: boolean;     // จตุรถี/นวมี/จตุรทศี
  isAmavasya: boolean;  // ติถี 30
  isPurnima: boolean;   // ติถี 15
  vara: number;         // 0=อาทิตย์..6=เสาร์ (วันปฏิทินไทยของ slot)
  varaTh: string;
  varaSa: string;
  nakshatra: number;    // 0-26
  nakshatraTh: string;
  nakshatraSa: string;
  pada: number;         // 1-4
  yoga: number;         // 0-26 (โยคะที่ yoga+1)
  yogaTh: string;
  yogaSa: string;
  karana: number;       // 0-59
  karanaTh: string;
  karanaSa: string;
  isVishti: boolean;
  elong: number;        // จันทร์−อาทิตย์ (องศา 0-360)
  sunSid: number;       // อาทิตย์ sidereal Lahiri
  moonSid: number;      // จันทร์ sidereal Lahiri
  ayanamsa: number;
};

/** ชื่อกรณะจากช่อง 0-59 · isVishti เมื่อกรณะจรตัวที่ 7 (ช่อง 7,14,...,56) */
export function karanaNameOf(k: number): { th: string; sa: string; isVishti: boolean } {
  const kk = ((k % 60) + 60) % 60;
  if (KARANA_FIXED[kk]) return { ...KARANA_FIXED[kk], isVishti: false };
  const mv = KARANA_MOVABLE[(kk - 1) % 7];
  return { ...mv, isVishti: (kk - 1) % 7 === 6 };
}

/** คำนวณปัญจางค์ ณ instant (geocentric · ไม่ขึ้นกับพิกัด) · varaDateStr = วันปฏิทินไทยของ slot */
export function panchangaAt(date: Date, varaDateStr?: string): Panchanga {
  const sunTrop = eclipticLon("Sun", date);
  const moonTrop = eclipticLon("Moon", date);
  const ay = lahiriAyanamsa(date);
  const elong = norm360(moonTrop - sunTrop);
  const sunSid = norm360(sunTrop - ay);
  const moonSid = norm360(moonTrop - ay);

  const tithi = (Math.floor(elong / 12) % 30) + 1;                    // 1-30
  const tithiInPaksha = ((tithi - 1) % 15) + 1;                        // 1-15
  const paksha: "shukla" | "krishna" = tithi <= 15 ? "shukla" : "krishna";
  const isPurnima = tithi === 15;
  const isAmavasya = tithi === 30;
  const tName = tithiInPaksha === 15 ? (isAmavasya ? AMAVASYA : PURNIMA) : TITHI_NAMES[tithiInPaksha - 1];

  const nak = Math.floor(moonSid / NAKSHATRA_SPAN) % 27;               // 0-26 sidereal
  const yoga = Math.floor(norm360(sunSid + moonSid) / NAKSHATRA_SPAN) % 27; // 0-26
  const karana = Math.floor(elong / 6) % 60;                           // 0-59
  const kName = karanaNameOf(karana);

  const dateStr = varaDateStr || thaiDateStr(date.getTime());
  const vara = new Date(`${dateStr}T00:00:00Z`).getUTCDay();

  return {
    tithi, tithiInPaksha, paksha,
    tithiTh: tName.th, tithiSa: tName.sa,
    isRikta: tithiInPaksha === 4 || tithiInPaksha === 9 || tithiInPaksha === 14,
    isAmavasya, isPurnima,
    vara, varaTh: VARA_NAMES[vara].th, varaSa: VARA_NAMES[vara].sa,
    nakshatra: nak, nakshatraTh: NAKSHATRAS[nak].nameTh, nakshatraSa: NAKSHATRAS[nak].name,
    pada: padaOf(moonSid),
    yoga, yogaTh: YOGA_NAMES[yoga].th, yogaSa: YOGA_NAMES[yoga].sa,
    karana, karanaTh: kName.th, karanaSa: kName.sa, isVishti: kName.isVishti,
    elong: Math.round(elong * 10000) / 10000,
    sunSid: Math.round(sunSid * 10000) / 10000,
    moonSid: Math.round(moonSid * 10000) / 10000,
    ayanamsa: Math.round(ay * 10000) / 10000,
  };
}

const _cache = new Map<string, Panchanga>();
const CACHE_MAX = 4000;

function panchangaCached(midMs: number, dateStr: string): Panchanga {
  const key = `${midMs}|${dateStr}`;
  const hit = _cache.get(key);
  if (hit) return hit;
  const p = panchangaAt(new Date(midMs), dateStr);
  _cache.set(key, p);
  evictFifo(_cache, CACHE_MAX);
  return p;
}

/** กิจกรรมที่ติถีริกตาโดน cap (งานมงคลเริ่มใหม่ตาม spec: เปิดกิจการ/แต่งงาน) */
const RIKTA_CAP_ACTIVITIES = new Set<ActivityType>(["開市", "婚姻"]);

function baseResult(status: "missing" | "ready", normalized: number, confidence: number): ModuleResult {
  return {
    module: "panchanga",
    status,
    score: { raw: normalized, normalized, weight: 1 },
    pass: normalized >= 40,
    tags: [],
    reasons: { up: [], down: [], warning: [] },
    confidence,
    raw: {},
  };
}

export function computePanchanga(c: CandidateSlot, activity: ActivityType): ModuleResult {
  const slot = slotWindowUtc(c);
  if (!slot) return baseResult("missing", 50, 0);

  const p = panchangaCached(slot.midMs, c.calendar.gregorianDate);
  const up: Reason[] = [];
  const down: Reason[] = [];
  const warning: Reason[] = [];
  const caps: (CapRule & { code: string })[] = [];
  let normalized = 55; // กลาง

  // ── โยคะดี · สิทธิ/สิทธะ/ศุภะ → +5 เบา ๆ ──
  if (BENEFIC_YOGAS.has(p.yoga)) {
    normalized = 60;
    up.push({
      code: "PANCHANGA_GOOD_YOGA",
      thai: `โยคะ${p.yogaTh} (${p.yogaSa}) เป็นศุภโยคะตามตำรามุหูรตะ · หนุนงานมงคล +5`,
      zh: "吉瑜伽", delta: 5, severity: "info", source: "panchanga",
    });
  }

  // ── โยคะร้าย · วยตีปาตะ/ไวธฤติ → cap 60 ──
  if (MALEFIC_YOGAS.has(p.yoga)) {
    normalized = Math.min(normalized, 48);
    caps.push({
      type: "max", value: 60,
      reason: `โยคะ${p.yogaTh} (${p.yogaSa}) เป็นโยคะร้าย ตำราให้เลี่ยงทั้งช่วง · เพดานคะแนน 60`,
      source: "panchanga", code: "PANCHANGA_BAD_YOGA_CAP",
    });
    down.push({
      code: "PANCHANGA_BAD_YOGA",
      thai: `โยคะของวันคือ ${p.yogaTh} (${p.yogaSa}) · ตำรามุหูรตะจัดเป็นโยคะร้าย เลี่ยงเริ่มงานมงคลทั้งช่วง · เพดานคะแนน 60`,
      zh: "凶瑜伽", delta: 0, severity: "warning", source: "panchanga",
    });
  }

  // ── กรณะวิษฏิ (ภัทรา) → cap 55 ทุกกิจกรรม ──
  if (p.isVishti) {
    normalized = Math.min(normalized, 45);
    caps.push({
      type: "max", value: 55,
      reason: `กรณะ${p.karanaTh} · ตำราห้ามเริ่มงานมงคลระหว่างภัทรา · เพดานคะแนน 55`,
      source: "panchanga", code: "PANCHANGA_VISHTI_CAP",
    });
    down.push({
      code: "PANCHANGA_VISHTI",
      thai: `ยามนี้อยู่ในกรณะ${p.karanaTh} (${p.karanaSa}) · ตำรามุหูรตะทุกสายงดเริ่มงานมงคลระหว่างภัทรา · เพดานคะแนน 55`,
      zh: "毘瑟底時分", delta: 0, severity: "warning", source: "panchanga",
    });
  }

  // ── ติถีริกตา (4/9/14) → cap 55 เฉพาะเปิดกิจการ/แต่งงาน · อื่น ๆ เตือน ──
  if (p.isRikta) {
    if (RIKTA_CAP_ACTIVITIES.has(activity)) {
      normalized = Math.min(normalized, 45);
      caps.push({
        type: "max", value: 55,
        reason: `ติถีริกตา (${p.tithiTh} · ${p.tithiSa}) ไม่เหมาะงานมงคลเริ่มใหม่ · เพดานคะแนน 55`,
        source: "panchanga", code: "PANCHANGA_RIKTA_CAP",
      });
      down.push({
        code: "PANCHANGA_RIKTA",
        thai: `วันนี้เป็นติถีริกตา · ${p.tithiTh} (${p.tithiSa}) ${p.paksha === "shukla" ? "ข้างขึ้น" : "ข้างแรม"} · ตำราจัดเป็นติถีว่างเปล่า ไม่เหมาะเปิดกิจการ/แต่งงาน · เพดานคะแนน 55`,
        zh: "里克塔日", delta: 0, severity: "warning", source: "panchanga",
      });
    } else {
      warning.push({
        code: "PANCHANGA_RIKTA_WARN",
        thai: `วันนี้เป็นติถีริกตา · ${p.tithiTh} (${p.tithiSa}) · ตำราให้ระวังงานมงคลเริ่มใหม่ (กิจกรรมนี้ไม่โดนตัด)`,
        zh: "里克塔日", delta: 0, severity: "warning", source: "panchanga",
      });
    }
  }

  // ── อมาวสยา (ติถี 30) → cap 45 ทุกกิจกรรมยกเว้นพิธีกรรม (pitṛ-kārya เหมาะจันทร์ดับ) ──
  if (p.isAmavasya) {
    if (activity !== "祭祀") {
      normalized = Math.min(normalized, 40);
      caps.push({
        type: "max", value: 45,
        reason: `อมาวสยา (จันทร์ดับ · Amāvāsyā) ห้ามงานมงคลทุกชนิด · เพดานคะแนน 45`,
        source: "panchanga", code: "PANCHANGA_AMAVASYA_CAP",
      });
      down.push({
        code: "PANCHANGA_AMAVASYA",
        thai: `วันนี้เป็นอมาวสยา (จันทร์ดับ · ติถี 30) · ตำรามุหูรตะห้ามงานมงคลทุกชนิด ยกเว้นพิธีบูชาบรรพบุรุษ · เพดานคะแนน 45`,
        zh: "朔日", delta: 0, severity: "warning", source: "panchanga",
      });
    } else {
      up.push({
        code: "PANCHANGA_AMAVASYA_RITUAL",
        thai: `อมาวสยา (จันทร์ดับ) · ตำราถือว่าเหมาะกับพิธีบูชาบรรพบุรุษ (pitṛ-kārya) · ไม่ตัดคะแนนสำหรับพิธีกรรม`,
        zh: "朔日祭祖", delta: 0, severity: "info", source: "panchanga",
      });
    }
  }

  // ── สรุปปัญจางค์ 5 องค์ (info เสมอ · ให้ user เห็นครบทั้งการ์ด) ──
  up.push({
    code: "PANCHANGA_INFO",
    thai: `ปัญจางค์: ติถี ${p.tithiInPaksha} ${p.tithiTh} ${p.paksha === "shukla" ? "ข้างขึ้น" : "ข้างแรม"} · วาระ${p.varaTh} · นักษัตร${p.nakshatraTh} (${p.nakshatraSa}) · โยคะ${p.yogaTh} · กรณะ${p.karanaTh}`,
    zh: "五支",
    delta: 0, severity: "info", source: "panchanga",
  });

  const result = baseResult("ready", normalized, 0.85);
  result.pass = caps.length === 0 && normalized >= 40;
  result.tags = [
    `tithi_${p.tithi}`, `paksha_${p.paksha}`, `nak_${p.nakshatra}`, `yoga_${p.yoga + 1}`, `karana_${p.karana}`,
    ...(p.isRikta ? ["rikta_tithi"] : []),
    ...(p.isVishti ? ["vishti_karana"] : []),
    ...(p.isAmavasya ? ["amavasya"] : []),
    ...(MALEFIC_YOGAS.has(p.yoga) ? ["bad_yoga"] : []),
    ...(BENEFIC_YOGAS.has(p.yoga) ? ["good_yoga"] : []),
  ];
  result.reasons = { up, down, warning };
  if (caps.length) result.caps = caps;
  result.raw = { ...p, system: "indian_panchanga" };
  return result;
}
