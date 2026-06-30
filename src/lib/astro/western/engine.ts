/**
 * โหราศาสตร์ตะวันตก (Western · tropical zodiac) — engine แบบ deterministic ล้วน
 * ════════════════════════════════════════════════════════════════════════
 * กฎข้อ 9 (BaZi/Decode): engine คำนวณ structured JSON → AI แค่ตีความภาษา
 * ห้ามให้ AI เดาตำแหน่งดาว/ราศี/มุม · ทุกค่าในไฟล์นี้คำนวณจากดาราศาสตร์จริง
 *
 * ฐานร่วม: src/lib/astro-core/{ephemeris,houses,aspects}.ts (astronomy-engine MIT)
 *   - computeBodies({modern:true, node:true}) → ดาว 10 + ราหู/เกตุ
 *   - ascendant / midheaven → ลัคนา/กลางฟ้า (tropical)
 *   - houses / houseOf → เรือน (whole-sign · Placidus = roadmap)
 *   - findAspects → มุมสัมพันธ์ดาว
 *
 * ไม่มี Date.now()/Math.random() — รับ dtUTC เข้ามาเท่านั้น → ผลลัพธ์คงที่
 */
import { computeBodies, ascendant, midheaven, norm360, type BodyPos } from "../../astro-core/ephemeris";
import { houses, houseOf, type HouseCusp } from "../../astro-core/houses";
import { findAspects, type Aspect } from "../../astro-core/aspects";

/** ราศีตะวันตก 12 (index 0 = เมษ/Aries) — ใช้ index นี้ทั้งระบบ */
export const SIGN_TH = [
  "เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์",
  "ตุล", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน",
] as const;
export const SIGN_EN = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

/** ธาตุประจำราศี: ไฟ/ดิน/ลม/น้ำ (index ตามราศี) */
export type Element = "fire" | "earth" | "air" | "water";
const SIGN_ELEMENT: Element[] = [
  "fire", "earth", "air", "water", "fire", "earth",
  "air", "water", "fire", "earth", "air", "water",
];
/** คุณภาพราศี (modality): จร/คงที่/ผันแปร */
export type Modality = "cardinal" | "fixed" | "mutable";
const SIGN_MODALITY: Modality[] = [
  "cardinal", "fixed", "mutable", "cardinal", "fixed", "mutable",
  "cardinal", "fixed", "mutable", "cardinal", "fixed", "mutable",
];

/** ฐานะดาวตามราศี (dignity แบบคลาสสิก) */
export type Dignity = "rulership" | "exaltation" | "detriment" | "fall";

/**
 * ตารางฐานะดาว (เฉพาะดาวคลาสสิก 7 ดวง) — index = ราศี 0..11
 *   rulers: ราศีที่ดาวครอง (เจ้าเรือน) · exalt: ราศีเด่นพิเศษ
 *   detriment = ตรงข้ามเจ้าเรือน (+6) · fall = ตรงข้าม exalt (+6)
 * ดาวนอก (ยูเรนัส/เนปจูน/พลูโต) + ราหู/เกตุ = ไม่ใส่ฐานะคลาสสิก (dignity = null)
 */
const DIGNITY_TABLE: Record<string, { rulers: number[]; exalt: number }> = {
  // อาทิตย์: ครองสิงห์(4) · เด่นเมษ(0)
  Sun: { rulers: [4], exalt: 0 },
  // จันทร์: ครองกรกฎ(3) · เด่นพฤษภ(1)
  Moon: { rulers: [3], exalt: 1 },
  // พุธ: ครองเมถุน(2)+กันย์(5) · เด่นกันย์(5)
  Mercury: { rulers: [2, 5], exalt: 5 },
  // ศุกร์: ครองพฤษภ(1)+ตุล(6) · เด่นมีน(11)
  Venus: { rulers: [1, 6], exalt: 11 },
  // อังคาร: ครองเมษ(0)+พิจิก(7) · เด่นมังกร(9)
  Mars: { rulers: [0, 7], exalt: 9 },
  // พฤหัส: ครองธนู(8)+มีน(11) · เด่นกรกฎ(3)
  Jupiter: { rulers: [8, 11], exalt: 3 },
  // เสาร์: ครองมังกร(9)+กุมภ์(10) · เด่นตุล(6)
  Saturn: { rulers: [9, 10], exalt: 6 },
};

/** คืนฐานะดาวในราศีนั้น (null = ไม่มีฐานะพิเศษ / เป็นดาวนอกหรือจุดราหู-เกตุ) */
function dignityOf(planetKey: string, sign: number): Dignity | null {
  const t = DIGNITY_TABLE[planetKey];
  if (!t) return null;
  if (t.rulers.includes(sign)) return "rulership";
  if (sign === t.exalt) return "exaltation";
  // detriment = ราศีตรงข้ามเจ้าเรือน (เจ้าเรือน + 6)
  if (t.rulers.some((r) => (r + 6) % 12 === sign)) return "detriment";
  // fall = ราศีตรงข้าม exalt
  if ((t.exalt + 6) % 12 === sign) return "fall";
  return null;
}

/** ชื่อไทยของดาว/จุด (key จาก astro-core) */
const NAME_TH: Record<string, string> = {
  Sun: "อาทิตย์", Moon: "จันทร์", Mercury: "พุธ", Venus: "ศุกร์", Mars: "อังคาร",
  Jupiter: "พฤหัสบดี", Saturn: "เสาร์", Uranus: "ยูเรนัส", Neptune: "เนปจูน", Pluto: "พลูโต",
  Rahu: "ราหู (North Node)", Ketu: "เกตุ (South Node)",
};

/** ข้อมูลดาว 1 ดวงในผัง */
export type WesternPlanet = {
  name: string;          // key ภาษาอังกฤษ เช่น "Sun", "Rahu"
  nameTh: string;        // ชื่อไทย
  lon: number;           // ลองจิจูดสุริยวิถี tropical (0-360)
  sign: number;          // ราศี 0-11
  signDeg: number;       // องศาในราศี 0-30
  house: number | null;  // เรือน 1-12 (null เมื่อไม่มีเวลาเกิด)
  retro: boolean;        // เดินถอย (พักร์)
  speed: number;         // ความเร็ว °/วัน
  dignity: Dignity | null;
  uncertain?: boolean;   // true = ค่าไม่แน่นอนเมื่อไม่มีเวลาเกิด (เช่น จันทร์)
};

export type WesternShape = {
  elements: Record<Element, number>;      // นับดาวตามธาตุ
  modalities: Record<Modality, number>;   // นับดาวตามคุณภาพราศี
  stellium: { sign: number; signTh: string; count: number; planets: string[] }[];
};

/** เพศ (Ptolemy Tetrabiblos Book 4 · ตัวแทนคู่ครอง: ชายใช้จันทร์ · หญิงใช้อาทิตย์) */
export type Gender = "M" | "F";

/** sect ของดวง (Lilly/Ptolemy · กลางวัน=อาทิตย์เหนือขอบฟ้า) · null เมื่อไม่มีเวลาเกิด */
export type Sect = "day" | "night" | null;

/** จุดคำนวณบนสุริยวิถี (เช่น Part of Fortune จุดโชค) · null เมื่อขาดลัคนา */
export type WesternPoint = {
  lon: number;       // ลองจิจูด tropical 0-360
  sign: number;      // ราศี 0-11
  signTh: string;    // ชื่อราศีไทย
  signDeg: number;   // องศาในราศี 0-30
  house: number;     // เรือน 1-12 (มีเสมอเพราะคำนวณเฉพาะเมื่อมีลัคนา)
} | null;

export type WesternChart = {
  hasBirthTime: boolean;
  degradeLevel: "full" | "partial";   // full = มีเวลาเกิด · partial = ไม่มีเวลา
  houseSystem: "whole";               // Placidus = roadmap (ต้องใช้ semi-arc)
  gender: Gender;                     // เพศเจ้าชะตา (ใช้เลือกตัวแทนคู่ครอง)
  sect: Sect;                         // กลางวัน/กลางคืน · null เมื่อไม่มีเวลา
  ascendant: number | null;           // ลัคนา (longitude) · null เมื่อไม่มีเวลา
  mc: number | null;                  // กลางฟ้า MC · null เมื่อไม่มีเวลา
  partOfFortune: WesternPoint;        // จุดโชค (การเงิน/ลาภ) · null เมื่อไม่มีลัคนา
  houses: HouseCusp[] | null;         // 12 เรือน · null เมื่อไม่มีเวลา
  planets: WesternPlanet[];           // ดาว 10 + ราหู/เกตุ
  aspects: Aspect[];                  // มุมสัมพันธ์
  shape: WesternShape;
};

/** สร้าง WesternPoint จาก longitude + ลัคนา (norm360 + หาราศี/องศา/เรือน) */
function makePoint(lon: number, ascLon: number): WesternPoint {
  const L = norm360(lon);
  const sign = Math.floor(L / 30);
  return {
    lon: +L.toFixed(4),
    sign,
    signTh: SIGN_TH[sign],
    signDeg: +(L - sign * 30).toFixed(4),
    house: houseOf(L, ascLon, "whole"),
  };
}

/** ดาวที่นับเข้า balance ธาตุ/คุณภาพ + ตรวจ stellium (ดาวจริง 10 ดวง · ไม่รวมจุดราหู/เกตุ) */
const CORE_10 = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]);

/**
 * สร้างผังโหราศาสตร์ตะวันตก (tropical)
 * @param dtUTC  เวลาเกิดเป็น UTC (Date) — caller แปลงจากเวลาท้องถิ่นมาแล้ว
 * @param lat    ละติจูด (องศา · เหนือ +)
 * @param lng    ลองจิจูด (องศา · ตะวันออก +)
 * @param hasTime มีเวลาเกิดแม่นหรือไม่ — false → ไม่คำนวณลัคนา/เรือน + ติดธงจันทร์
 * @param gender เพศเจ้าชะตา "M"|"F" (default "M") — เลือกตัวแทนคู่ครอง (Ptolemy Book 4)
 */
export function westernChart(dtUTC: Date, lat: number, lng: number, hasTime = true, gender: Gender = "M"): WesternChart {
  // 1) ดาว 10 (modern:true → รวมยูเรนัส/เนปจูน/พลูโต) + ราหู/เกตุ (node:true)
  const bodies: BodyPos[] = computeBodies(dtUTC, { modern: true, node: true });

  // 2) ลัคนา / MC / เรือน — ต้องใช้เวลาเกิดแม่น (depend on หมุนโลก)
  const ascLon = hasTime ? ascendant(dtUTC, lat, lng) : null;
  const mcLon = hasTime ? midheaven(dtUTC, lng) : null;
  // เรือน whole-sign: เรือน = ราศี (Placidus = roadmap · ต้องคำนวณ semi-arc เพิ่ม)
  const houseCusps = ascLon !== null ? houses(ascLon, "whole") : null;

  // 3) ประกอบข้อมูลดาวแต่ละดวง
  const planets: WesternPlanet[] = bodies.map((b) => {
    const lon = norm360(b.lon);
    const sign = Math.floor(lon / 30);
    const signDeg = +(lon - sign * 30).toFixed(4);
    const house = ascLon !== null ? houseOf(lon, ascLon, "whole") : null;
    const p: WesternPlanet = {
      name: b.key,
      nameTh: NAME_TH[b.key] ?? b.key,
      lon: +lon.toFixed(4),
      sign,
      signDeg,
      house,
      retro: b.retro,
      speed: +b.speed.toFixed(4),
      dignity: dignityOf(b.key, sign),
    };
    // ไม่มีเวลาเกิด → จันทร์เคลื่อนไว (~12-15°/วัน) ราศี/องศาอาจคลาด → ติดธง
    if (!hasTime && b.key === "Moon") p.uncertain = true;
    return p;
  });

  // 4) มุมสัมพันธ์ — รวมดาว 10 + ราหู/เกตุ · ตัดคู่ ราหู-เกตุ (เล็งกันเสมอ = ไม่มีนัย)
  const aspectInput = planets.map((p) => ({ key: p.name, lon: p.lon, speed: p.speed }));
  const aspects = findAspects(aspectInput).filter(
    (a) => !((a.a === "Rahu" && a.b === "Ketu") || (a.a === "Ketu" && a.b === "Rahu")),
  );

  // 5) balance ธาตุ/คุณภาพราศี + stellium — นับเฉพาะดาวจริง 10 ดวง
  const elements: Record<Element, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalities: Record<Modality, number> = { cardinal: 0, fixed: 0, mutable: 0 };
  const bySign: Record<number, string[]> = {};
  for (const p of planets) {
    if (!CORE_10.has(p.name)) continue;
    elements[SIGN_ELEMENT[p.sign]]++;
    modalities[SIGN_MODALITY[p.sign]]++;
    (bySign[p.sign] ??= []).push(p.name);
  }
  // stellium = ดาวจริง 3 ดวงขึ้นไปในราศีเดียวกัน
  const stellium = Object.entries(bySign)
    .filter(([, list]) => list.length >= 3)
    .map(([s, list]) => ({
      sign: +s,
      signTh: SIGN_TH[+s],
      count: list.length,
      planets: list,
    }))
    .sort((a, b) => b.count - a.count || a.sign - b.sign);

  // 6) sect (กลางวัน/กลางคืน) — อาทิตย์เหนือขอบฟ้า (เรือน 7-12) = day · เรือน 1-6 = night
  //    Ptolemy/Lilly: ดวงกลางวันเลือก day = Asc + Moon - Sun · กลางคืน night = Asc + Sun - Moon
  const sun = planets.find((p) => p.name === "Sun");
  const moon = planets.find((p) => p.name === "Moon");
  let sect: Sect = null;
  if (sun && sun.house !== null) sect = sun.house >= 7 ? "day" : "night";

  // 7) Part of Fortune (จุดโชค · การเงิน/ลาภ) — ต้องมีลัคนา + อาทิตย์ + จันทร์
  //    สูตร day = Asc + Moon - Sun · night = Asc + Sun - Moon (Lilly Christian Astrology)
  let partOfFortune: WesternPoint = null;
  if (ascLon !== null && sun && moon) {
    const lon = sect === "night"
      ? ascLon + sun.lon - moon.lon
      : ascLon + moon.lon - sun.lon; // day หรือ sect=null (มีลัคนาแต่ตีความเป็นกลางวันเป็น default)
    partOfFortune = makePoint(lon, ascLon);
  }

  return {
    hasBirthTime: hasTime,
    degradeLevel: hasTime ? "full" : "partial",
    houseSystem: "whole",
    gender,
    sect,
    ascendant: ascLon !== null ? +ascLon.toFixed(4) : null,
    mc: mcLon !== null ? +mcLon.toFixed(4) : null,
    partOfFortune,
    houses: houseCusps,
    planets,
    aspects,
    shape: { elements, modalities, stellium },
  };
}
