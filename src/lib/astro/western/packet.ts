/**
 * Western packet — แปลง WesternChart เป็น envelope มาตรฐานสำหรับส่งให้ชั้นถัดไป
 * ════════════════════════════════════════════════════════════════════════
 * โครงสร้างเดียวกับ packet ศาสตร์อื่น: { discipline, packetVersion, data, notAvailable }
 * deterministic ล้วน — แค่จัดรูป ไม่คำนวณดาราศาสตร์เพิ่ม
 */
import {
  SIGN_TH,
  type WesternChart,
  type Dignity,
  type Element,
  type Modality,
  type Polarity,
  type Gender,
  type Sect,
  type WesternPoint,
  type WesternHiddenContact,
  type WesternMinorDignity,
  type WesternTransits,
  type WesternMinorAspect,
  type WesternAspectPattern,
  type WesternFixedStarHit,
  type WesternTimingSupport,
  type WesternChartRuler,
  type WesternHouseRuler,
  type WesternDispositor,
  type WesternDominantPlanet,
  type WesternLot,
} from "./engine";

export type WesternPacketPlanet = {
  name: string;
  nameTh: string;
  sign: number;
  signTh: string;
  signDeg: number;
  declination: number;
  house: number | null;
  retro: boolean;
  dignity: Dignity | null;
  minorDignity: WesternMinorDignity;
  antisciaLon: number;
  contraAntisciaLon: number;
  uncertain?: boolean;
};

/** ตำแหน่งจุดสำคัญ (ลัคนา/กลางฟ้า) — null เมื่อไม่มีเวลาเกิด */
export type WesternPacketAngle = {
  lon: number;
  sign: number;
  signTh: string;
  signDeg: number;
} | null;

export type WesternPacketLot = {
  key: WesternLot["key"];
  nameTh: string;
  lon: number;
  sign: number;
  signTh: string;
  signDeg: number;
  house: number;
  formula: string;
  formulaMode: WesternLot["formulaMode"];
  source: WesternLot["source"];
  confidence: WesternLot["confidence"];
};

export type WesternTopicEvidence = {
  role: string;
  planet?: string;
  planetTh?: string;
  lot?: WesternLot["key"];
  lotTh?: string;
  signTh?: string;
  signDeg?: number;
  house?: number | null;
  dignity?: Dignity | null;
  minorScore?: number;
  reason: string;
};

export type WesternTopicLordMatrixRow = {
  topic: "identity" | "career" | "money" | "relationship" | "creativityChildren" | "travelFaith" | "health";
  labelTh: string;
  availability: "full" | "partial_no_time";
  evidence: WesternTopicEvidence[];
};

export type WesternTimingCoverage = {
  transits: "ref_date_aspects";
  returnCycles: "jupiter_saturn_coarse";
  exactTransitWindows: "not_in_packet";
  solarReturn: "not_in_packet";
  secondaryProgressions: "not_in_packet";
  annualProfection: "not_in_packet";
  rectification: "workflow_required_not_ai_guess";
};

export type WesternPacket = {
  discipline: "western";
  packetVersion: "western-v2";
  hasBirthTime: boolean;
  birthTimeMode: "known" | "unknown_noon_anchor";
  anchorTime: {
    localTime: "12:00";
    timezone: "profile_local";
    purpose: "date_only_placeholder_not_birth_time";
  } | null;
  moonUncertainty: boolean;
  forbiddenFieldsWhenNoTime: string[];
  allowedFieldsWhenNoTime: string[];
  degradeLevel: "full" | "partial";
  gender: Gender;
  sect: Sect;
  partOfFortuneFormula: "sect_reversed" | null;
  unsupportedSpecialtyPackets: string[];
  timingCoverage: WesternTimingCoverage;
  data: {
    ascendant: WesternPacketAngle;
    mc: WesternPacketAngle;
    partOfFortune: WesternPoint;
    lots: WesternPacketLot[];
    planets: WesternPacketPlanet[];
    houses: { house: number; sign: number; signTh: string; cuspLon: number }[] | null;
    aspects: { a: string; b: string; type: string; angleTh: string; orb: number; applying: boolean }[];
    minorAspects: WesternMinorAspect[];
    aspectPatterns: WesternAspectPattern[];
    hiddenContacts: WesternHiddenContact[];
    fixedStarHits: WesternFixedStarHit[];
    transits: WesternTransits;
    timingSupport: WesternTimingSupport;
    chartRuler: WesternChartRuler;
    houseRulers: WesternHouseRuler[] | null;
    topicLordMatrix: WesternTopicLordMatrixRow[];
    dispositors: WesternDispositor[];
    dominantPlanets: WesternDominantPlanet[];
    shape: {
      elements: Record<Element, number>;
      modalities: Record<Modality, number>;
      polarities: Record<Polarity, number>;
      stellium: { sign: number; signTh: string; count: number; planets: string[] }[];
    };
  };
  notAvailable: string[];
};

const UNSUPPORTED_SPECIALTY_PACKETS = [
  "chiron",
  "secondaryProgressions",
  "primaryDirections",
  "solarArcDirections",
  "annualProfection",
  "solarReturnChart",
  "lunarReturnChart",
  "eclipseHits",
  "horaryQuestionChart",
  "electionalSearch",
  "astrocartographyLines",
  "medicalAstrologyProtocol",
  "rectificationCandidates",
  "mundaneEventChart",
  "harmonicCharts",
  "compositeChart",
];

const FORBIDDEN_FIELDS_NO_TIME = [
  "ascendant",
  "mc",
  "houses",
  "houseRulers",
  "partOfFortune",
  "lots",
  "sect",
  "chartRuler",
  "planetHouse",
  "angleContacts",
];

const ALLOWED_FIELDS_NO_TIME = [
  "planetSign",
  "planetDegree",
  "essentialDignity",
  "minorDignity",
  "planetAspects",
  "minorAspects",
  "aspectPatterns",
  "declination",
  "antiscia",
  "fixedStarHitsToPlanets",
  "elementBalance",
  "modalityBalance",
  "polarityBalance",
  "transitsToPlanets",
];

/** ทำ angle object จาก longitude (null → null) */
function angle(lon: number | null): WesternPacketAngle {
  if (lon === null) return null;
  const sign = Math.floor(((lon % 360) + 360) % 360 / 30);
  return { lon, sign, signTh: SIGN_TH[sign], signDeg: +(lon - sign * 30).toFixed(4) };
}

function packetLot(lot: WesternLot): WesternPacketLot {
  return {
    key: lot.key,
    nameTh: lot.nameTh,
    lon: lot.point.lon,
    sign: lot.point.sign,
    signTh: lot.point.signTh,
    signDeg: lot.point.signDeg,
    house: lot.point.house,
    formula: lot.formula,
    formulaMode: lot.formulaMode,
    source: lot.source,
    confidence: lot.confidence,
  };
}

function planetEvidence(chart: WesternChart, planet: string, role: string, reason: string): WesternTopicEvidence | null {
  const p = chart.planets.find((x) => x.name === planet);
  if (!p) return null;
  return {
    role,
    planet: p.name,
    planetTh: p.nameTh,
    signTh: SIGN_TH[p.sign],
    signDeg: p.signDeg,
    house: p.house,
    dignity: p.dignity,
    minorScore: p.minorDignity.score,
    reason,
  };
}

function houseLordEvidence(chart: WesternChart, house: number, role: string, reason: string): WesternTopicEvidence | null {
  const h = chart.houseRulers?.find((x) => x.house === house);
  if (!h) return null;
  return {
    role,
    planet: h.ruler,
    planetTh: h.rulerTh,
    signTh: h.rulerPlanet?.signTh,
    signDeg: h.rulerPlanet?.signDeg,
    house: h.rulerPlanet?.house ?? null,
    dignity: h.rulerPlanet?.dignity ?? null,
    minorScore: h.rulerPlanet?.minorScore,
    reason,
  };
}

function lotEvidence(chart: WesternChart, lot: WesternLot["key"], role: string, reason: string): WesternTopicEvidence | null {
  const l = chart.lots.find((x) => x.key === lot);
  if (!l) return null;
  return {
    role,
    lot: l.key,
    lotTh: l.nameTh,
    signTh: l.point.signTh,
    signDeg: l.point.signDeg,
    house: l.point.house,
    reason,
  };
}

function compact<T>(items: Array<T | null>): T[] {
  return items.filter((x): x is T => x !== null);
}

function buildTopicLordMatrix(chart: WesternChart): WesternTopicLordMatrixRow[] {
  const availability: WesternTopicLordMatrixRow["availability"] = chart.hasBirthTime ? "full" : "partial_no_time";
  const spousePlanet = chart.gender === "F" ? "Sun" : "Moon";
  const rows: WesternTopicLordMatrixRow[] = [
    {
      topic: "identity",
      labelTh: "ตัวตน/ทิศชีวิต",
      availability,
      evidence: compact([
        houseLordEvidence(chart, 1, "1st house ruler", "เจ้าเรือน 1 ใช้ดูตัวตน ทิศชีวิต และแรงขับหลัก"),
        planetEvidence(chart, "Sun", "Sun", "แกนอัตตา/เจตจำนง"),
        planetEvidence(chart, "Moon", "Moon", "อารมณ์ ความเคยชิน และชีวิตประจำวัน"),
      ]),
    },
    {
      topic: "career",
      labelTh: "งาน/ชื่อเสียง",
      availability,
      evidence: compact([
        houseLordEvidence(chart, 10, "10th house ruler", "เจ้าเรือน 10 เป็นแกนอาชีพ/สถานะ"),
        planetEvidence(chart, "Sun", "Sun", "การยืนในสังคมและการนำ"),
        planetEvidence(chart, "Saturn", "Saturn", "โครงสร้าง ความรับผิดชอบ งานระยะยาว"),
        planetEvidence(chart, "Mercury", "Mercury", "ทักษะคิด-สื่อสาร-ธุรกิจ"),
        lotEvidence(chart, "Spirit", "Lot of Spirit", "เจตจำนงและทางเลือกที่เจ้าชะตาขับเอง"),
      ]),
    },
    {
      topic: "money",
      labelTh: "เงิน/ทรัพย์/รายได้",
      availability,
      evidence: compact([
        houseLordEvidence(chart, 2, "2nd house ruler", "เจ้าเรือน 2 ใช้ดูทรัพย์ส่วนตัวและรายได้"),
        houseLordEvidence(chart, 8, "8th house ruler", "เจ้าเรือน 8 ใช้ดูเงินร่วม หนี้ ภาษี ทรัพย์คนอื่น"),
        houseLordEvidence(chart, 11, "11th house ruler", "เจ้าเรือน 11 ใช้ดูรายได้จากเครือข่ายและผลตอบแทน"),
        planetEvidence(chart, "Venus", "Venus", "สิ่งมีค่า ความสบาย รายได้จากความนิยม/ศิลปะ"),
        planetEvidence(chart, "Jupiter", "Jupiter", "การขยายตัว โอกาส และทรัพย์จากความรู้"),
        lotEvidence(chart, "Fortune", "Lot of Fortune", "ความเป็นอยู่ โชคลาภ และทรัพย์ที่จับต้องได้"),
        lotEvidence(chart, "Necessity", "Lot of Necessity", "พันธะ ค่าใช้จ่าย และแรงกดดันที่ต้องรับผิดชอบ"),
      ]),
    },
    {
      topic: "relationship",
      labelTh: "คู่ครอง/ความสัมพันธ์",
      availability,
      evidence: compact([
        houseLordEvidence(chart, 7, "7th house ruler", "เจ้าเรือน 7 เป็นแกนคู่ครอง หุ้นส่วน และคู่สัญญา"),
        planetEvidence(chart, spousePlanet, "spouse significator", chart.gender === "F" ? "เจ้าชะตาหญิงใช้อาทิตย์เป็นตัวแทนคู่ครองตาม Ptolemy Book 4" : "เจ้าชะตาชายใช้จันทร์เป็นตัวแทนคู่ครองตาม Ptolemy Book 4"),
        planetEvidence(chart, "Venus", "Venus", "รูปแบบรัก ความพอใจ และแรงประสาน"),
        planetEvidence(chart, "Mars", "Mars", "แรงปรารถนา ความกล้า และความปะทะ"),
        lotEvidence(chart, "Eros", "Lot of Eros", "แรงดึงดูด ความรัก และความอยากสัมพันธ์"),
      ]),
    },
    {
      topic: "creativityChildren",
      labelTh: "ความรักเชิงสร้างสรรค์/ลูก/ผลงาน",
      availability,
      evidence: compact([
        houseLordEvidence(chart, 5, "5th house ruler", "เจ้าเรือน 5 ใช้ดูผลงาน ความรักแบบโรแมนติก ลูก และความสุข"),
        planetEvidence(chart, "Sun", "Sun", "การสร้างสรรค์และความภาคภูมิใจ"),
        planetEvidence(chart, "Venus", "Venus", "ความรัก ความงาม และความเพลิดเพลิน"),
        planetEvidence(chart, "Jupiter", "Jupiter", "การเติบโต ลูกศิษย์ ลูกหลาน และความเอื้อเฟื้อ"),
      ]),
    },
    {
      topic: "travelFaith",
      labelTh: "ต่างแดน/การเรียนสูง/ศรัทธา",
      availability,
      evidence: compact([
        houseLordEvidence(chart, 9, "9th house ruler", "เจ้าเรือน 9 ใช้ดูต่างประเทศ การเรียนสูง ความเชื่อ และครู"),
        planetEvidence(chart, "Jupiter", "Jupiter", "ปัญญา ครู ศาสนา กฎหมาย และการขยายโลกทัศน์"),
        planetEvidence(chart, "Sun", "Sun", "หลักชีวิต เกียรติ และความหมายที่เจ้าชะตายึดถือ"),
        lotEvidence(chart, "Victory", "Lot of Victory", "ชัยชนะ การหนุนส่ง และแรงขยายที่เกิดผล"),
      ]),
    },
    {
      topic: "health",
      labelTh: "สุขภาพ/งานประจำ/ภาระกาย",
      availability,
      evidence: compact([
        houseLordEvidence(chart, 1, "1st house ruler", "เรือน 1 และเจ้าดวงใช้ดูร่างกายพื้นฐาน"),
        houseLordEvidence(chart, 6, "6th house ruler", "เจ้าเรือน 6 ใช้ดูโรค งานประจำ และภาระที่กัดกินพลัง"),
        planetEvidence(chart, "Moon", "Moon", "ของเหลวในร่างกาย อารมณ์ การนอน และรอบชีวิต"),
        planetEvidence(chart, "Saturn", "Saturn", "ข้อจำกัด ความเรื้อรัง กระดูก ผิว และความแห้ง"),
        planetEvidence(chart, "Mars", "Mars", "อักเสบ อุบัติเหตุ ผ่าตัด และความร้อน"),
        lotEvidence(chart, "Nemesis", "Lot of Nemesis", "ข้อจำกัด ผลสะท้อน และจุดที่ต้องมีวินัย"),
      ]),
    },
  ];
  return rows.map((row) => ({ ...row, evidence: row.evidence.slice(0, 8) }));
}

const TIMING_COVERAGE: WesternTimingCoverage = {
  transits: "ref_date_aspects",
  returnCycles: "jupiter_saturn_coarse",
  exactTransitWindows: "not_in_packet",
  solarReturn: "not_in_packet",
  secondaryProgressions: "not_in_packet",
  annualProfection: "not_in_packet",
  rectification: "workflow_required_not_ai_guess",
};

/** สร้าง envelope packet จากผัง */
export function buildWesternPacket(chart: WesternChart): WesternPacket {
  // สิ่งที่ใช้ไม่ได้เมื่อขาดเวลาเกิด (ลัคนา/กลางฟ้า/เรือน/จุดโชค/sect ต้องใช้การหมุนของโลก)
  const notAvailable: string[] = [];
  if (!chart.hasBirthTime) notAvailable.push("ascendant", "mc", "houses", "partOfFortune", "lots", "sect");
  if (!chart.transits) notAvailable.push("transits");

  return {
    discipline: "western",
    packetVersion: "western-v2",
    hasBirthTime: chart.hasBirthTime,
    birthTimeMode: chart.hasBirthTime ? "known" : "unknown_noon_anchor",
    anchorTime: chart.hasBirthTime ? null : {
      localTime: "12:00",
      timezone: "profile_local",
      purpose: "date_only_placeholder_not_birth_time",
    },
    moonUncertainty: !chart.hasBirthTime,
    forbiddenFieldsWhenNoTime: chart.hasBirthTime ? [] : FORBIDDEN_FIELDS_NO_TIME,
    allowedFieldsWhenNoTime: chart.hasBirthTime ? [] : ALLOWED_FIELDS_NO_TIME,
    degradeLevel: chart.degradeLevel,
    gender: chart.gender,
    sect: chart.sect,
    partOfFortuneFormula: chart.partOfFortuneFormula,
    unsupportedSpecialtyPackets: UNSUPPORTED_SPECIALTY_PACKETS,
    timingCoverage: TIMING_COVERAGE,
    data: {
      ascendant: angle(chart.ascendant),
      mc: angle(chart.mc),
      partOfFortune: chart.partOfFortune,
      lots: chart.lots.map(packetLot),
      planets: chart.planets.map((p) => ({
        name: p.name,
        nameTh: p.nameTh,
        sign: p.sign,
        signTh: SIGN_TH[p.sign],
        signDeg: p.signDeg,
        declination: p.declination,
        house: p.house,
        retro: p.retro,
        dignity: p.dignity,
        minorDignity: p.minorDignity,
        antisciaLon: p.antisciaLon,
        contraAntisciaLon: p.contraAntisciaLon,
        ...(p.uncertain ? { uncertain: true } : {}),
      })),
      houses: chart.houses
        ? chart.houses.map((h) => ({
            house: h.house,
            sign: h.sign,
            signTh: SIGN_TH[h.sign],
            cuspLon: h.cuspLon,
          }))
        : null,
      aspects: chart.aspects.map((a) => ({
        a: a.a,
        b: a.b,
        type: a.type,
        angleTh: a.angleTh,
        orb: a.orb,
        applying: a.applying,
      })),
      minorAspects: chart.minorAspects,
      aspectPatterns: chart.aspectPatterns,
      hiddenContacts: chart.hiddenContacts,
      fixedStarHits: chart.fixedStarHits,
      transits: chart.transits,
      timingSupport: chart.timingSupport,
      chartRuler: chart.chartRuler,
      houseRulers: chart.houseRulers,
      topicLordMatrix: buildTopicLordMatrix(chart),
      dispositors: chart.dispositors,
      dominantPlanets: chart.dominantPlanets,
      shape: chart.shape,
    },
    notAvailable,
  };
}
