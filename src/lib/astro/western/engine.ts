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
import * as A from "astronomy-engine";
import { computeBodies, ascendant, midheaven, norm360, declinationFromEcliptic, type BodyPos } from "../../astro-core/ephemeris";
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

type ClassicalPlanet = "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn";

export type Polarity = "masculine" | "feminine";
const SIGN_POLARITY: Polarity[] = [
  "masculine", "feminine", "masculine", "feminine", "masculine", "feminine",
  "masculine", "feminine", "masculine", "feminine", "masculine", "feminine",
];

export const SIGN_RULER: ClassicalPlanet[] = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];

export type WesternPlanetRef = {
  name: string;
  nameTh: string;
  sign: number;
  signTh: string;
  signDeg: number;
  house: number | null;
  dignity: Dignity | null;
  minorScore: number;
};

export type WesternChartRuler = {
  sign: number;
  signTh: string;
  ruler: ClassicalPlanet;
  rulerTh: string;
  planet: WesternPlanetRef | null;
} | null;

export type WesternHouseRuler = {
  house: number;
  sign: number;
  signTh: string;
  ruler: ClassicalPlanet;
  rulerTh: string;
  rulerPlanet: WesternPlanetRef | null;
};

export type WesternDispositor = {
  planet: string;
  planetTh: string;
  sign: number;
  signTh: string;
  ruler: ClassicalPlanet;
  rulerTh: string;
  rulerHouse: number | null;
  rulerDignity: Dignity | null;
};

export type WesternDominantPlanet = {
  name: string;
  nameTh: string;
  score: number;
  reasons: string[];
};

export type WesternMinorDignity = {
  triplicityDayLord: ClassicalPlanet;
  triplicityNightLord: ClassicalPlanet;
  triplicityParticipatingLord: ClassicalPlanet;
  activeTriplicityLord: ClassicalPlanet | null;
  termLord: ClassicalPlanet;
  faceLord: ClassicalPlanet;
  score: number;             // Lilly-style essential dignity points: ruler 5, exalt 4, triplicity 3, term 2, face 1; debilities negative
  peregrine: boolean;        // true = no major/minor dignity and no major debility
};

export type WesternHiddenContact = {
  a: string;
  b: string;
  type: "antiscia" | "contra_antiscia" | "parallel" | "contraparallel";
  orb: number;
};

export type WesternTransitAspect = {
  transit: string;
  natal: string;
  natalKind: "planet" | "angle" | "point";
  type: string;
  angleTh: string;
  orb: number;
};

export type WesternTransits = {
  refDate: string;
  planets: Pick<WesternPlanet, "name" | "nameTh" | "lon" | "sign" | "signDeg" | "retro" | "speed" | "declination">[];
  aspectsToNatal: WesternTransitAspect[];
} | null;

export type WesternMinorAspectType = "semisextile" | "semisquare" | "quintile" | "sesquiquadrate" | "biquintile" | "quincunx";
export type WesternMinorAspect = {
  a: string;
  b: string;
  type: WesternMinorAspectType;
  angleTh: string;
  orb: number;
  applying: boolean;
};

export type WesternAspectPattern = {
  type: "t_square" | "grand_trine" | "yod" | "kite";
  planets: string[];
  apex?: string;
  focus?: string;
  note: string;
};

export type WesternFixedStarHit = {
  star: string;
  starTh: string;
  target: string;
  targetTh: string;
  targetKind: "planet" | "angle" | "point";
  contact: "conjunction" | "opposition" | "parallel" | "contraparallel";
  orb: number;
  starLon: number;
  starLat: number;
  starDeclination: number;
  targetLon: number | null;
  targetDeclination: number | null;
  nature: string[];
  source: "SIMBAD_J2000_RA_DEC+astronomy-engine";
};

export type WesternReturnCycle = {
  planet: "Jupiter" | "Saturn";
  planetTh: string;
  natalLon: number;
  transitLon: number;
  orbToReturn: number;
  currentAspectToNatal: { type: string; angleTh: string; orb: number } | null;
  orbitalPeriodYears: number;
  currentCycleNumber: number;
  previousApproxAge: number;
  nextApproxAge: number;
  ageAtRefDate: number;
};

export type WesternRetrogradeStatus = {
  planet: string;
  planetTh: string;
  retro: boolean;
  speed: number;
};

export type WesternTimingSupport = {
  refDate: string;
  returnCycles: WesternReturnCycle[];
  retrogrades: WesternRetrogradeStatus[];
} | null;

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

const TRIPLICITY_TABLE: Record<Element, { day: ClassicalPlanet; night: ClassicalPlanet; participating: ClassicalPlanet }> = {
  fire: { day: "Sun", night: "Jupiter", participating: "Saturn" },
  earth: { day: "Venus", night: "Moon", participating: "Mars" },
  air: { day: "Saturn", night: "Mercury", participating: "Jupiter" },
  water: { day: "Venus", night: "Mars", participating: "Moon" },
};

const EGYPTIAN_TERMS: Record<number, { end: number; lord: ClassicalPlanet }[]> = {
  0: [{ end: 6, lord: "Jupiter" }, { end: 14, lord: "Venus" }, { end: 21, lord: "Mercury" }, { end: 26, lord: "Mars" }, { end: 30, lord: "Saturn" }],
  1: [{ end: 8, lord: "Venus" }, { end: 15, lord: "Mercury" }, { end: 22, lord: "Jupiter" }, { end: 27, lord: "Saturn" }, { end: 30, lord: "Mars" }],
  2: [{ end: 7, lord: "Mercury" }, { end: 14, lord: "Jupiter" }, { end: 21, lord: "Venus" }, { end: 25, lord: "Mars" }, { end: 30, lord: "Saturn" }],
  3: [{ end: 6, lord: "Mars" }, { end: 13, lord: "Venus" }, { end: 20, lord: "Mercury" }, { end: 27, lord: "Jupiter" }, { end: 30, lord: "Saturn" }],
  4: [{ end: 6, lord: "Jupiter" }, { end: 13, lord: "Venus" }, { end: 19, lord: "Saturn" }, { end: 25, lord: "Mercury" }, { end: 30, lord: "Mars" }],
  5: [{ end: 7, lord: "Mercury" }, { end: 13, lord: "Venus" }, { end: 18, lord: "Jupiter" }, { end: 24, lord: "Mars" }, { end: 30, lord: "Saturn" }],
  6: [{ end: 6, lord: "Saturn" }, { end: 14, lord: "Mercury" }, { end: 21, lord: "Jupiter" }, { end: 28, lord: "Venus" }, { end: 30, lord: "Mars" }],
  7: [{ end: 7, lord: "Mars" }, { end: 11, lord: "Venus" }, { end: 19, lord: "Mercury" }, { end: 24, lord: "Jupiter" }, { end: 30, lord: "Saturn" }],
  8: [{ end: 12, lord: "Jupiter" }, { end: 17, lord: "Venus" }, { end: 21, lord: "Mercury" }, { end: 26, lord: "Saturn" }, { end: 30, lord: "Mars" }],
  9: [{ end: 7, lord: "Mercury" }, { end: 14, lord: "Jupiter" }, { end: 22, lord: "Venus" }, { end: 26, lord: "Saturn" }, { end: 30, lord: "Mars" }],
  10: [{ end: 7, lord: "Mercury" }, { end: 13, lord: "Venus" }, { end: 20, lord: "Jupiter" }, { end: 25, lord: "Mars" }, { end: 30, lord: "Saturn" }],
  11: [{ end: 12, lord: "Venus" }, { end: 16, lord: "Jupiter" }, { end: 19, lord: "Mercury" }, { end: 28, lord: "Mars" }, { end: 30, lord: "Saturn" }],
};

const CHALDEAN_FACES: ClassicalPlanet[][] = [
  ["Mars", "Sun", "Venus"],
  ["Mercury", "Moon", "Saturn"],
  ["Jupiter", "Mars", "Sun"],
  ["Venus", "Mercury", "Moon"],
  ["Saturn", "Jupiter", "Mars"],
  ["Sun", "Venus", "Mercury"],
  ["Moon", "Saturn", "Jupiter"],
  ["Mars", "Sun", "Venus"],
  ["Mercury", "Moon", "Saturn"],
  ["Jupiter", "Mars", "Sun"],
  ["Venus", "Mercury", "Moon"],
  ["Saturn", "Jupiter", "Mars"],
];

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

function minorDignityOf(planetKey: string, sign: number, signDeg: number, sect: Sect): WesternMinorDignity {
  const trip = TRIPLICITY_TABLE[SIGN_ELEMENT[sign]];
  const activeTriplicityLord = sect === "day" ? trip.day : sect === "night" ? trip.night : null;
  const termLord = EGYPTIAN_TERMS[sign].find((x) => signDeg < x.end)?.lord || EGYPTIAN_TERMS[sign][4].lord;
  const faceLord = CHALDEAN_FACES[sign][Math.min(2, Math.floor(signDeg / 10))];
  const major = dignityOf(planetKey, sign);
  let score = 0;
  if (major === "rulership") score += 5;
  if (major === "exaltation") score += 4;
  if (major === "detriment") score -= 5;
  if (major === "fall") score -= 4;
  if (activeTriplicityLord && planetKey === activeTriplicityLord) score += 3;
  if (planetKey === termLord) score += 2;
  if (planetKey === faceLord) score += 1;
  const hasMinor = !!activeTriplicityLord && planetKey === activeTriplicityLord || planetKey === termLord || planetKey === faceLord;
  return {
    triplicityDayLord: trip.day,
    triplicityNightLord: trip.night,
    triplicityParticipatingLord: trip.participating,
    activeTriplicityLord,
    termLord,
    faceLord,
    score,
    peregrine: !major && !hasMinor,
  };
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
  lat: number;           // ละติจูดสุริยวิถี
  declination: number;   // declination ใช้หา parallel/contraparallel
  sign: number;          // ราศี 0-11
  signDeg: number;       // องศาในราศี 0-30
  house: number | null;  // เรือน 1-12 (null เมื่อไม่มีเวลาเกิด)
  retro: boolean;        // เดินถอย (พักร์)
  speed: number;         // ความเร็ว °/วัน
  dignity: Dignity | null;
  minorDignity: WesternMinorDignity;
  antisciaLon: number;
  contraAntisciaLon: number;
  uncertain?: boolean;   // true = ค่าไม่แน่นอนเมื่อไม่มีเวลาเกิด (เช่น จันทร์)
};

export type WesternShape = {
  elements: Record<Element, number>;      // นับดาวตามธาตุ
  modalities: Record<Modality, number>;   // นับดาวตามคุณภาพราศี
  polarities: Record<Polarity, number>;    // masculine/feminine signs
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

export type WesternLotKey = "Fortune" | "Spirit" | "Eros" | "Necessity" | "Courage" | "Victory" | "Nemesis";

export type WesternLot = {
  key: WesternLotKey;
  nameTh: string;
  point: Exclude<WesternPoint, null>;
  formula: string;
  formulaMode: "sect_reversed";
  source: "hellenistic_arabic_derived_v1";
  confidence: "requires_birth_time";
};

export type WesternChart = {
  hasBirthTime: boolean;
  degradeLevel: "full" | "partial";   // full = มีเวลาเกิด · partial = ไม่มีเวลา
  houseSystem: "whole";               // Placidus = roadmap (ต้องใช้ semi-arc)
  gender: Gender;                     // เพศเจ้าชะตา (ใช้เลือกตัวแทนคู่ครอง)
  sect: Sect;                         // กลางวัน/กลางคืน · null เมื่อไม่มีเวลา
  ascendant: number | null;           // ลัคนา (longitude) · null เมื่อไม่มีเวลา
  mc: number | null;                  // กลางฟ้า MC · null เมื่อไม่มีเวลา
  partOfFortune: WesternPoint;        // จุดโชค (การเงิน/ลาภ) · null เมื่อไม่มีลัคนา
  partOfFortuneFormula: "sect_reversed" | null;
  lots: WesternLot[];
  houses: HouseCusp[] | null;         // 12 เรือน · null เมื่อไม่มีเวลา
  planets: WesternPlanet[];           // ดาว 10 + ราหู/เกตุ
  aspects: Aspect[];                  // มุมสัมพันธ์
  minorAspects: WesternMinorAspect[];
  aspectPatterns: WesternAspectPattern[];
  hiddenContacts: WesternHiddenContact[];
  fixedStarHits: WesternFixedStarHit[];
  transits: WesternTransits;
  timingSupport: WesternTimingSupport;
  chartRuler: WesternChartRuler;
  houseRulers: WesternHouseRuler[] | null;
  dispositors: WesternDispositor[];
  dominantPlanets: WesternDominantPlanet[];
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

function buildLots(ascLon: number | null, planets: WesternPlanet[], sect: Sect, partOfFortune: WesternPoint): WesternLot[] {
  if (ascLon === null || !partOfFortune) return [];
  const byName = (name: string) => planets.find((p) => p.name === name);
  const sun = byName("Sun");
  const moon = byName("Moon");
  if (!sun || !moon) return [];

  const isNight = sect === "night";
  const point = (lon: number) => makePoint(lon, ascLon) as Exclude<WesternPoint, null>;
  const mk = (key: WesternLotKey, nameTh: string, lon: number, formula: string): WesternLot => ({
    key,
    nameTh,
    point: point(lon),
    formula,
    formulaMode: "sect_reversed",
    source: "hellenistic_arabic_derived_v1",
    confidence: "requires_birth_time",
  });

  const spiritLon = isNight ? ascLon + moon.lon - sun.lon : ascLon + sun.lon - moon.lon;
  const spirit = mk("Spirit", "จุดวิญญาณ/เจตจำนง", spiritLon, "day=Asc+Sun-Moon, night=Asc+Moon-Sun");
  const lots: WesternLot[] = [
    mk("Fortune", "จุดโชค/ความเป็นอยู่", partOfFortune.lon, "day=Asc+Moon-Sun, night=Asc+Sun-Moon"),
    spirit,
  ];

  const mercury = byName("Mercury");
  const venus = byName("Venus");
  const mars = byName("Mars");
  const jupiter = byName("Jupiter");
  const saturn = byName("Saturn");

  if (venus) {
    lots.push(mk("Eros", "จุดความรัก/แรงดึงดูด", isNight ? ascLon + spirit.point.lon - venus.lon : ascLon + venus.lon - spirit.point.lon, "day=Asc+Venus-Spirit, night=Asc+Spirit-Venus"));
  }
  if (mercury) {
    lots.push(mk("Necessity", "จุดความจำเป็น/พันธะ", isNight ? ascLon + mercury.lon - partOfFortune.lon : ascLon + partOfFortune.lon - mercury.lon, "day=Asc+Fortune-Mercury, night=Asc+Mercury-Fortune"));
  }
  if (mars) {
    lots.push(mk("Courage", "จุดความกล้า/แรงปะทะ", isNight ? ascLon + partOfFortune.lon - mars.lon : ascLon + mars.lon - partOfFortune.lon, "day=Asc+Mars-Fortune, night=Asc+Fortune-Mars"));
  }
  if (jupiter) {
    lots.push(mk("Victory", "จุดชัยชนะ/การหนุนส่ง", isNight ? ascLon + spirit.point.lon - jupiter.lon : ascLon + jupiter.lon - spirit.point.lon, "day=Asc+Jupiter-Spirit, night=Asc+Spirit-Jupiter"));
  }
  if (saturn) {
    lots.push(mk("Nemesis", "จุดข้อจำกัด/ผลสะท้อน", isNight ? ascLon + saturn.lon - partOfFortune.lon : ascLon + partOfFortune.lon - saturn.lon, "day=Asc+Fortune-Saturn, night=Asc+Saturn-Fortune"));
  }
  return lots;
}

/** ดาวที่นับเข้า balance ธาตุ/คุณภาพ + ตรวจ stellium (ดาวจริง 10 ดวง · ไม่รวมจุดราหู/เกตุ) */
const CORE_10 = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]);
const CLASSICAL_7_SET = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]);

function angleDiff(a: number, b: number): number {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}

function antisciaLon(lon: number): number {
  return norm360(180 - lon);
}

function findHiddenContacts(planets: WesternPlanet[]): WesternHiddenContact[] {
  const out: WesternHiddenContact[] = [];
  const maxOrb = 1.0;
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i], b = planets[j];
      const antiOrb = angleDiff(a.antisciaLon, b.lon);
      if (antiOrb <= maxOrb) out.push({ a: a.name, b: b.name, type: "antiscia", orb: +antiOrb.toFixed(2) });
      const contraOrb = angleDiff(a.contraAntisciaLon, b.lon);
      if (contraOrb <= maxOrb) out.push({ a: a.name, b: b.name, type: "contra_antiscia", orb: +contraOrb.toFixed(2) });
      const parallelOrb = Math.abs(a.declination - b.declination);
      if (parallelOrb <= maxOrb && Math.sign(a.declination || 0.0001) === Math.sign(b.declination || 0.0001)) {
        out.push({ a: a.name, b: b.name, type: "parallel", orb: +parallelOrb.toFixed(2) });
      }
      const contraParallelOrb = Math.abs(a.declination + b.declination);
      if (contraParallelOrb <= maxOrb && Math.sign(a.declination || 0.0001) !== Math.sign(b.declination || 0.0001)) {
        out.push({ a: a.name, b: b.name, type: "contraparallel", orb: +contraParallelOrb.toFixed(2) });
      }
    }
  }
  return out.sort((a, b) => a.orb - b.orb);
}

const TRANSIT_ASPECTS: { type: string; angle: number; angleTh: string; orb: number }[] = [
  { type: "conjunction", angle: 0, angleTh: "ทับซ้อน", orb: 2 },
  { type: "sextile", angle: 60, angleTh: "หกสิบองศา", orb: 1.5 },
  { type: "square", angle: 90, angleTh: "ฉาก/ขัดแย้ง", orb: 1.5 },
  { type: "trine", angle: 120, angleTh: "ตรีโกณ", orb: 1.5 },
  { type: "opposition", angle: 180, angleTh: "เล็ง", orb: 2 },
];

function findTransitAspects(transitPlanets: WesternPlanet[], natalPlanets: WesternPlanet[], natalPoints: { name: string; lon: number; kind: "angle" | "point" }[]): WesternTransitAspect[] {
  const targets = [
    ...natalPlanets.map((p) => ({ name: p.name, lon: p.lon, kind: "planet" as const })),
    ...natalPoints,
  ];
  const out: WesternTransitAspect[] = [];
  for (const t of transitPlanets.filter((p) => CORE_10.has(p.name))) {
    for (const n of targets) {
      for (const asp of TRANSIT_ASPECTS) {
        const orb = Math.abs(angleDiff(t.lon, n.lon) - asp.angle);
        if (orb <= asp.orb) out.push({ transit: t.name, natal: n.name, natalKind: n.kind, type: asp.type, angleTh: asp.angleTh, orb: +orb.toFixed(2) });
      }
    }
  }
  return out.sort((a, b) => a.orb - b.orb).slice(0, 40);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

const MINOR_ASPECTS: { type: WesternMinorAspectType; angle: number; angleTh: string; orb: number }[] = [
  { type: "semisextile", angle: 30, angleTh: "กึ่งหกสิบ (30°)", orb: 1.5 },
  { type: "semisquare", angle: 45, angleTh: "กึ่งฉาก (45°)", orb: 1.5 },
  { type: "quintile", angle: 72, angleTh: "ควินไทล์ (72°)", orb: 1.2 },
  { type: "sesquiquadrate", angle: 135, angleTh: "ฉากครึ่ง (135°)", orb: 1.5 },
  { type: "biquintile", angle: 144, angleTh: "ไบควินไทล์ (144°)", orb: 1.2 },
  { type: "quincunx", angle: 150, angleTh: "ควินคังซ์/ปรับตัว (150°)", orb: 2 },
];

function applyingBetween(a: WesternPlanet, b: WesternPlanet): boolean {
  const rel = a.speed - b.speed;
  return norm360(a.lon - b.lon) < 180 ? rel < 0 : rel > 0;
}

function findMinorAspects(planets: WesternPlanet[]): WesternMinorAspect[] {
  const ps = planets.filter((p) => CORE_10.has(p.name));
  const out: WesternMinorAspect[] = [];
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      const sep = angleDiff(a.lon, b.lon);
      for (const asp of MINOR_ASPECTS) {
        const orbLimit = (a.name === "Sun" || a.name === "Moon" || b.name === "Sun" || b.name === "Moon") ? asp.orb + 0.5 : asp.orb;
        const orb = Math.abs(sep - asp.angle);
        if (orb <= orbLimit) {
          out.push({ a: a.name, b: b.name, type: asp.type, angleTh: asp.angleTh, orb: r2(orb), applying: applyingBetween(a, b) });
          break;
        }
      }
    }
  }
  return out.sort((a, b) => a.orb - b.orb).slice(0, 48);
}

function hasMajor(aspects: Aspect[], a: string, b: string, type: string, maxOrb = 8): boolean {
  return aspects.some((x) =>
    ((x.a === a && x.b === b) || (x.a === b && x.b === a)) &&
    x.type === type &&
    x.orb <= maxOrb
  );
}

function hasMinor(minors: WesternMinorAspect[], a: string, b: string, type: WesternMinorAspectType, maxOrb = 2): boolean {
  return minors.some((x) =>
    ((x.a === a && x.b === b) || (x.a === b && x.b === a)) &&
    x.type === type &&
    x.orb <= maxOrb
  );
}

function sortedKey(items: string[]): string {
  return [...items].sort().join("|");
}

function findAspectPatterns(planets: WesternPlanet[], aspects: Aspect[], minorAspects: WesternMinorAspect[]): WesternAspectPattern[] {
  const names = planets.filter((p) => CORE_10.has(p.name)).map((p) => p.name);
  const out: WesternAspectPattern[] = [];
  const seen = new Set<string>();
  const push = (p: WesternAspectPattern) => {
    const key = `${p.type}:${sortedKey(p.planets)}:${p.apex || ""}:${p.focus || ""}`;
    if (!seen.has(key)) { seen.add(key); out.push(p); }
  };

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (let k = j + 1; k < names.length; k++) {
        const a = names[i], b = names[j], c = names[k];
        if (hasMajor(aspects, a, b, "trine") && hasMajor(aspects, a, c, "trine") && hasMajor(aspects, b, c, "trine")) {
          push({ type: "grand_trine", planets: [a, b, c], note: "three closed trines" });
        }
        for (const apex of [a, b, c]) {
          const base = [a, b, c].filter((x) => x !== apex);
          if (hasMajor(aspects, base[0], base[1], "opposition") && hasMajor(aspects, apex, base[0], "square") && hasMajor(aspects, apex, base[1], "square")) {
            push({ type: "t_square", planets: [a, b, c], apex, note: "opposition base with two squares to apex" });
          }
          if (hasMinor(minorAspects, apex, base[0], "quincunx") && hasMinor(minorAspects, apex, base[1], "quincunx") && hasMajor(aspects, base[0], base[1], "sextile", 4)) {
            push({ type: "yod", planets: [a, b, c], apex, note: "two quincunxes with sextile base" });
          }
        }
      }
    }
  }

  const grandTrines = out.filter((p) => p.type === "grand_trine");
  for (const gt of grandTrines) {
    for (const focus of names.filter((n) => !gt.planets.includes(n))) {
      for (const opposed of gt.planets) {
        const others = gt.planets.filter((n) => n !== opposed);
        if (hasMajor(aspects, focus, opposed, "opposition") && others.every((n) => hasMajor(aspects, focus, n, "sextile", 4))) {
          push({ type: "kite", planets: [...gt.planets, focus], focus, note: "grand trine with opposition and two sextiles" });
        }
      }
    }
  }
  return out.slice(0, 24);
}

const FIXED_STAR_BODIES = [A.Body.Star1, A.Body.Star2, A.Body.Star3, A.Body.Star4, A.Body.Star5, A.Body.Star6, A.Body.Star7, A.Body.Star8] as const;
const FIXED_STAR_CATALOG = [
  { star: "Aldebaran", starTh: "อัลเดบารัน", ra: 4 + 35 / 60 + 55.239 / 3600, dec: 16 + 30 / 60 + 33.49 / 3600, distanceLy: 65, nature: ["Mars"] },
  { star: "Sirius", starTh: "ซิริอุส", ra: 6 + 45 / 60 + 8.917 / 3600, dec: -(16 + 42 / 60 + 58.02 / 3600), distanceLy: 9, nature: ["Jupiter", "Mars"] },
  { star: "Regulus", starTh: "เรกูลัส", ra: 10 + 8 / 60 + 22.311 / 3600, dec: 11 + 58 / 60 + 1.95 / 3600, distanceLy: 79, nature: ["Mars", "Jupiter"] },
  { star: "Spica", starTh: "สไปกา", ra: 13 + 25 / 60 + 11.579 / 3600, dec: -(11 + 9 / 60 + 40.75 / 3600), distanceLy: 250, nature: ["Venus", "Mercury"] },
  { star: "Antares", starTh: "แอนทาเรส", ra: 16 + 29 / 60 + 24.460 / 3600, dec: -(26 + 25 / 60 + 55.21 / 3600), distanceLy: 550, nature: ["Mars", "Jupiter"] },
  { star: "Vega", starTh: "เวกา", ra: 18 + 36 / 60 + 56.336 / 3600, dec: 38 + 47 / 60 + 1.28 / 3600, distanceLy: 25, nature: ["Venus", "Mercury"] },
  { star: "Fomalhaut", starTh: "โฟมัลฮอต", ra: 22 + 57 / 60 + 39.046 / 3600, dec: -(29 + 37 / 60 + 20.05 / 3600), distanceLy: 25, nature: ["Venus", "Mercury"] },
  { star: "Algol", starTh: "อัลกอล", ra: 3 + 8 / 60 + 10.132 / 3600, dec: 40 + 57 / 60 + 20.33 / 3600, distanceLy: 90, nature: ["Saturn", "Jupiter"] },
] as const;

function fixedStarPositions(date: Date) {
  const observer = new A.Observer(0, 0, 0);
  return FIXED_STAR_CATALOG.map((s, i) => {
    const body = FIXED_STAR_BODIES[i];
    A.DefineStar(body, s.ra, s.dec, s.distanceLy);
    const eq = A.Equator(body, date, observer, false, true);
    const ecl = A.Ecliptic(eq.vec);
    return {
      ...s,
      lon: norm360(ecl.elon),
      lat: ecl.elat,
      declination: eq.dec,
    };
  });
}

function findFixedStarHits(date: Date, planets: WesternPlanet[], ascLon: number | null, mcLon: number | null, partOfFortune: WesternPoint): WesternFixedStarHit[] {
  const targets = [
    ...planets.filter((p) => CORE_10.has(p.name)).map((p) => ({
      name: p.name, nameTh: p.nameTh, kind: "planet" as const, lon: p.lon, declination: p.declination,
    })),
    ...(ascLon !== null ? [{ name: "Ascendant", nameTh: "ลัคนา", kind: "angle" as const, lon: ascLon, declination: declinationFromEcliptic(ascLon, 0, date) }] : []),
    ...(mcLon !== null ? [{ name: "MC", nameTh: "กลางฟ้า", kind: "angle" as const, lon: mcLon, declination: declinationFromEcliptic(mcLon, 0, date) }] : []),
    ...(partOfFortune ? [{ name: "Part of Fortune", nameTh: "จุดโชค", kind: "point" as const, lon: partOfFortune.lon, declination: declinationFromEcliptic(partOfFortune.lon, 0, date) }] : []),
  ];
  const out: WesternFixedStarHit[] = [];
  for (const s of fixedStarPositions(date)) {
    for (const t of targets) {
      const conjOrb = angleDiff(s.lon, t.lon);
      if (conjOrb <= 1) {
        out.push({ star: s.star, starTh: s.starTh, target: t.name, targetTh: t.nameTh, targetKind: t.kind, contact: "conjunction", orb: r2(conjOrb), starLon: r4(s.lon), starLat: r4(s.lat), starDeclination: r4(s.declination), targetLon: r4(t.lon), targetDeclination: r4(t.declination), nature: [...s.nature], source: "SIMBAD_J2000_RA_DEC+astronomy-engine" });
      }
      const oppOrb = Math.abs(angleDiff(s.lon, t.lon) - 180);
      if (oppOrb <= 1) {
        out.push({ star: s.star, starTh: s.starTh, target: t.name, targetTh: t.nameTh, targetKind: t.kind, contact: "opposition", orb: r2(oppOrb), starLon: r4(s.lon), starLat: r4(s.lat), starDeclination: r4(s.declination), targetLon: r4(t.lon), targetDeclination: r4(t.declination), nature: [...s.nature], source: "SIMBAD_J2000_RA_DEC+astronomy-engine" });
      }
      const par = Math.abs(s.declination - t.declination);
      if (par <= 0.5 && Math.sign(s.declination || 0.0001) === Math.sign(t.declination || 0.0001)) {
        out.push({ star: s.star, starTh: s.starTh, target: t.name, targetTh: t.nameTh, targetKind: t.kind, contact: "parallel", orb: r2(par), starLon: r4(s.lon), starLat: r4(s.lat), starDeclination: r4(s.declination), targetLon: r4(t.lon), targetDeclination: r4(t.declination), nature: [...s.nature], source: "SIMBAD_J2000_RA_DEC+astronomy-engine" });
      }
      const cpar = Math.abs(s.declination + t.declination);
      if (cpar <= 0.5 && Math.sign(s.declination || 0.0001) !== Math.sign(t.declination || 0.0001)) {
        out.push({ star: s.star, starTh: s.starTh, target: t.name, targetTh: t.nameTh, targetKind: t.kind, contact: "contraparallel", orb: r2(cpar), starLon: r4(s.lon), starLat: r4(s.lat), starDeclination: r4(s.declination), targetLon: r4(t.lon), targetDeclination: r4(t.declination), nature: [...s.nature], source: "SIMBAD_J2000_RA_DEC+astronomy-engine" });
      }
    }
  }
  return out.sort((a, b) => a.orb - b.orb).slice(0, 40);
}

function planetRef(planets: WesternPlanet[], name: string): WesternPlanetRef | null {
  const p = planets.find((x) => x.name === name);
  return p ? { name: p.name, nameTh: p.nameTh, sign: p.sign, signTh: SIGN_TH[p.sign], signDeg: p.signDeg, house: p.house, dignity: p.dignity, minorScore: p.minorDignity.score } : null;
}

function buildChartRuler(planets: WesternPlanet[], ascLon: number | null): WesternChartRuler {
  if (ascLon === null) return null;
  const sign = Math.floor(norm360(ascLon) / 30);
  const ruler = SIGN_RULER[sign];
  return { sign, signTh: SIGN_TH[sign], ruler, rulerTh: NAME_TH[ruler], planet: planetRef(planets, ruler) };
}

function buildHouseRulers(planets: WesternPlanet[], houseCusps: HouseCusp[] | null): WesternHouseRuler[] | null {
  if (!houseCusps) return null;
  return houseCusps.map((h) => {
    const ruler = SIGN_RULER[h.sign];
    return { house: h.house, sign: h.sign, signTh: SIGN_TH[h.sign], ruler, rulerTh: NAME_TH[ruler], rulerPlanet: planetRef(planets, ruler) };
  });
}

function buildDispositors(planets: WesternPlanet[]): WesternDispositor[] {
  return planets.map((p) => {
    const ruler = SIGN_RULER[p.sign];
    const rp = planets.find((x) => x.name === ruler);
    return { planet: p.name, planetTh: p.nameTh, sign: p.sign, signTh: SIGN_TH[p.sign], ruler, rulerTh: NAME_TH[ruler], rulerHouse: rp?.house ?? null, rulerDignity: rp?.dignity ?? null };
  });
}

function buildDominantPlanets(planets: WesternPlanet[], chartRuler: WesternChartRuler): WesternDominantPlanet[] {
  const scores = new Map<string, WesternDominantPlanet>();
  const add = (name: string, points: number, reason: string) => {
    if (!CLASSICAL_7_SET.has(name)) return;
    const p = planets.find((x) => x.name === name);
    if (!p) return;
    const row = scores.get(name) || { name, nameTh: p.nameTh, score: 0, reasons: [] };
    row.score += points;
    row.reasons.push(reason);
    scores.set(name, row);
  };
  for (const p of planets.filter((x) => CLASSICAL_7_SET.has(x.name))) {
    if (p.minorDignity.score > 0) add(p.name, p.minorDignity.score, "minor dignity support");
    else if (p.minorDignity.score < 0) add(p.name, p.minorDignity.score, "minor dignity debility");
    if (p.house && [1, 4, 7, 10].includes(p.house)) add(p.name, 5, `angular house ${p.house}`);
    else if (p.house && [2, 5, 8, 11].includes(p.house)) add(p.name, 3, `succedent house ${p.house}`);
    if (p.name === "Sun" || p.name === "Moon") add(p.name, 2, "luminary");
  }
  if (chartRuler) add(chartRuler.ruler, 5, "chart ruler");
  for (const p of planets) add(SIGN_RULER[p.sign], 1, `disposes ${p.name}`);
  return [...scores.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 5);
}

function nearestReturnAspect(transitLon: number, natalLon: number): { type: string; angleTh: string; orb: number } | null {
  const sep = angleDiff(transitLon, natalLon);
  const candidates = TRANSIT_ASPECTS.map((a) => ({ type: a.type, angleTh: a.angleTh, orb: Math.abs(sep - a.angle) })).sort((a, b) => a.orb - b.orb);
  return candidates[0].orb <= 3 ? { ...candidates[0], orb: r2(candidates[0].orb) } : null;
}

function buildTimingSupport(dtUTC: Date, refDate: Date | undefined, natalPlanets: WesternPlanet[], transits: WesternTransits): WesternTimingSupport {
  if (!refDate || !transits) return null;
  const ageAtRefDate = (refDate.getTime() - dtUTC.getTime()) / 86400000 / 365.2425;
  const returnMeta: Array<{ planet: "Jupiter" | "Saturn"; period: number }> = [
    { planet: "Jupiter", period: 11.862 },
    { planet: "Saturn", period: 29.457 },
  ];
  const returnCycles = returnMeta.flatMap((m): WesternReturnCycle[] => {
    const natal = natalPlanets.find((p) => p.name === m.planet);
    const transit = transits.planets.find((p) => p.name === m.planet);
    if (!natal || !transit) return [];
    const cycle = Math.max(0, Math.floor(ageAtRefDate / m.period));
    return [{
      planet: m.planet,
      planetTh: NAME_TH[m.planet],
      natalLon: natal.lon,
      transitLon: transit.lon,
      orbToReturn: r2(angleDiff(transit.lon, natal.lon)),
      currentAspectToNatal: nearestReturnAspect(transit.lon, natal.lon),
      orbitalPeriodYears: m.period,
      currentCycleNumber: cycle,
      previousApproxAge: r2(cycle * m.period),
      nextApproxAge: r2((cycle + 1) * m.period),
      ageAtRefDate: r2(ageAtRefDate),
    }];
  });
  const retrogrades = transits.planets
    .filter((p) => ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"].includes(p.name))
    .map((p) => ({ planet: p.name, planetTh: p.nameTh, retro: p.retro, speed: p.speed }));
  return { refDate: refDate.toISOString(), returnCycles, retrogrades };
}

/**
 * สร้างผังโหราศาสตร์ตะวันตก (tropical)
 * @param dtUTC  เวลาเกิดเป็น UTC (Date) — caller แปลงจากเวลาท้องถิ่นมาแล้ว
 * @param lat    ละติจูด (องศา · เหนือ +)
 * @param lng    ลองจิจูด (องศา · ตะวันออก +)
 * @param hasTime มีเวลาเกิดแม่นหรือไม่ — false → ไม่คำนวณลัคนา/เรือน + ติดธงจันทร์
 * @param gender เพศเจ้าชะตา "M"|"F" (default "M") — เลือกตัวแทนคู่ครอง (Ptolemy Book 4)
 * @param refDate วันอ้างอิงสำหรับ transit เบื้องต้น (optional)
 */
export function westernChart(dtUTC: Date, lat: number, lng: number, hasTime = true, gender: Gender = "M", refDate?: Date): WesternChart {
  // 1) ดาว 10 (modern:true → รวมยูเรนัส/เนปจูน/พลูโต) + ราหู/เกตุ (node:true)
  const bodies: BodyPos[] = computeBodies(dtUTC, { modern: true, node: true });

  // 2) ลัคนา / MC / เรือน — ต้องใช้เวลาเกิดแม่น (depend on หมุนโลก)
  const ascLon = hasTime ? ascendant(dtUTC, lat, lng) : null;
  const mcLon = hasTime ? midheaven(dtUTC, lng) : null;
  // เรือน whole-sign: เรือน = ราศี (Placidus = roadmap · ต้องคำนวณ semi-arc เพิ่ม)
  const houseCusps = ascLon !== null ? houses(ascLon, "whole") : null;

  // 3) ประกอบข้อมูลดาวแต่ละดวง
  const makePlanet = (b: BodyPos, sectForTriplicity: Sect): WesternPlanet => {
    const lon = norm360(b.lon);
    const sign = Math.floor(lon / 30);
    const signDeg = +(lon - sign * 30).toFixed(4);
    const house = ascLon !== null ? houseOf(lon, ascLon, "whole") : null;
    return {
      name: b.key,
      nameTh: NAME_TH[b.key] ?? b.key,
      lon: +lon.toFixed(4),
      lat: +Number(b.lat || 0).toFixed(4),
      declination: +Number(b.declination || 0).toFixed(4),
      sign,
      signDeg,
      house,
      retro: b.retro,
      speed: +b.speed.toFixed(4),
      dignity: dignityOf(b.key, sign),
      minorDignity: CLASSICAL_7_SET.has(b.key) ? minorDignityOf(b.key, sign, signDeg, sectForTriplicity) : {
        triplicityDayLord: TRIPLICITY_TABLE[SIGN_ELEMENT[sign]].day,
        triplicityNightLord: TRIPLICITY_TABLE[SIGN_ELEMENT[sign]].night,
        triplicityParticipatingLord: TRIPLICITY_TABLE[SIGN_ELEMENT[sign]].participating,
        activeTriplicityLord: sectForTriplicity === "day" ? TRIPLICITY_TABLE[SIGN_ELEMENT[sign]].day : sectForTriplicity === "night" ? TRIPLICITY_TABLE[SIGN_ELEMENT[sign]].night : null,
        termLord: EGYPTIAN_TERMS[sign].find((x) => signDeg < x.end)?.lord || EGYPTIAN_TERMS[sign][4].lord,
        faceLord: CHALDEAN_FACES[sign][Math.min(2, Math.floor(signDeg / 10))],
        score: 0,
        peregrine: false,
      },
      antisciaLon: +antisciaLon(lon).toFixed(4),
      contraAntisciaLon: +norm360(antisciaLon(lon) + 180).toFixed(4),
    };
  };

  let provisionalSect: Sect = null;
  const provisionalPlanets = bodies.map((b) => makePlanet(b, null));
  const provisionalSun = provisionalPlanets.find((p) => p.name === "Sun");
  if (provisionalSun && provisionalSun.house !== null) provisionalSect = provisionalSun.house >= 7 ? "day" : "night";
  const planets: WesternPlanet[] = bodies.map((b) => {
    const p = makePlanet(b, provisionalSect);
    // ไม่มีเวลาเกิด → จันทร์เคลื่อนไว (~12-15°/วัน) ราศี/องศาอาจคลาด → ติดธง
    if (!hasTime && b.key === "Moon") p.uncertain = true;
    return p;
  });

  // 4) มุมสัมพันธ์ — รวมดาว 10 + ราหู/เกตุ · ตัดคู่ ราหู-เกตุ (เล็งกันเสมอ = ไม่มีนัย)
  const aspectInput = planets.map((p) => ({ key: p.name, lon: p.lon, speed: p.speed }));
  const aspects = findAspects(aspectInput).filter(
    (a) => !((a.a === "Rahu" && a.b === "Ketu") || (a.a === "Ketu" && a.b === "Rahu")),
  );
  const minorAspects = findMinorAspects(planets);
  const aspectPatterns = findAspectPatterns(planets, aspects, minorAspects);

  // 5) balance ธาตุ/คุณภาพราศี + stellium — นับเฉพาะดาวจริง 10 ดวง
  const elements: Record<Element, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalities: Record<Modality, number> = { cardinal: 0, fixed: 0, mutable: 0 };
  const polarities: Record<Polarity, number> = { masculine: 0, feminine: 0 };
  const bySign: Record<number, string[]> = {};
  for (const p of planets) {
    if (!CORE_10.has(p.name)) continue;
    elements[SIGN_ELEMENT[p.sign]]++;
    modalities[SIGN_MODALITY[p.sign]]++;
    polarities[SIGN_POLARITY[p.sign]]++;
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
  const sect: Sect = provisionalSect;

  // 7) Part of Fortune (จุดโชค · การเงิน/ลาภ) — ต้องมีลัคนา + อาทิตย์ + จันทร์
  //    ใช้ variant medieval/Arabic แบบกลับสูตรตาม sect; canon layer แยก provenance จาก Ptolemy/Lilly
  let partOfFortune: WesternPoint = null;
  let partOfFortuneFormula: "sect_reversed" | null = null;
  if (ascLon !== null && sun && moon) {
    const lon = sect === "night"
      ? ascLon + sun.lon - moon.lon
      : ascLon + moon.lon - sun.lon; // day หรือ sect=null (มีลัคนาแต่ตีความเป็นกลางวันเป็น default)
    partOfFortune = makePoint(lon, ascLon);
    partOfFortuneFormula = "sect_reversed";
  }
  const lots = buildLots(ascLon, planets, sect, partOfFortune);

  const hiddenContacts = findHiddenContacts(planets);
  let transits: WesternTransits = null;
  if (refDate && !isNaN(refDate.getTime())) {
    const transitBodies = computeBodies(refDate, { modern: true, node: false });
    const transitPlanets = transitBodies.map((b) => makePlanet(b, null));
    const natalPoints = [
      ...(ascLon !== null ? [{ name: "Ascendant", lon: ascLon, kind: "angle" as const }] : []),
      ...(mcLon !== null ? [{ name: "MC", lon: mcLon, kind: "angle" as const }] : []),
      ...(partOfFortune ? [{ name: "Part of Fortune", lon: partOfFortune.lon, kind: "point" as const }] : []),
    ];
    transits = {
      refDate: refDate.toISOString(),
      planets: transitPlanets.map((p) => ({
        name: p.name, nameTh: p.nameTh, lon: p.lon, sign: p.sign, signDeg: p.signDeg,
        retro: p.retro, speed: p.speed, declination: p.declination,
      })),
      aspectsToNatal: findTransitAspects(transitPlanets, planets, natalPoints),
    };
  }

  const fixedStarHits = findFixedStarHits(dtUTC, planets, ascLon, mcLon, partOfFortune);
  const chartRuler = buildChartRuler(planets, ascLon);
  const houseRulers = buildHouseRulers(planets, houseCusps);
  const dispositors = buildDispositors(planets);
  const dominantPlanets = buildDominantPlanets(planets, chartRuler);
  const timingSupport = buildTimingSupport(dtUTC, refDate, planets, transits);

  return {
    hasBirthTime: hasTime,
    degradeLevel: hasTime ? "full" : "partial",
    houseSystem: "whole",
    gender,
    sect,
    ascendant: ascLon !== null ? +ascLon.toFixed(4) : null,
    mc: mcLon !== null ? +mcLon.toFixed(4) : null,
    partOfFortune,
    partOfFortuneFormula,
    lots,
    houses: houseCusps,
    planets,
    aspects,
    minorAspects,
    aspectPatterns,
    hiddenContacts,
    fixedStarHits,
    transits,
    timingSupport,
    chartRuler,
    houseRulers,
    dispositors,
    dominantPlanets,
    shape: { elements, modalities, polarities, stellium },
  };
}
