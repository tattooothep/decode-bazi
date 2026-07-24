/**
 * ชั้นลึก 七政四餘 สำหรับแอพมือถือ (23 ก.ค. 2569)
 *
 * ปัญหาเดิม: แม่ข่ายคำนวณ 12宮 / 三主 / 行限 / 流年木土 / 化曜 ครบแล้ว (เว็บ fusion5 ใช้อยู่ผ่าน
 *   src/lib/astro/qizheng/packet.ts) แต่ route มือถือส่งกลับแค่ผลดิบของ tianxingReading()
 *   → แอพอ่านศาสตร์ลึกไม่ได้เลย
 *
 * ไฟล์นี้ = "ต่อท่อ" เท่านั้น · เรียก engine เดิมแบบ read-only
 *   ❌ ห้ามเขียนสูตรใหม่ · ❌ ห้ามปั้นค่าแทน engine — engine ไม่คืน = ไม่ส่ง field นั้น (ไม่ใช่ส่ง 0/"—")
 *
 * ทุกก้อนติด methodConfidence + precision + source ตามคัมภีร์
 *   · data/library/astro-canon/qizheng/10-degree-limit-specificity.md → น้ำหนักอ่าน 度主 > 命主 > 身主
 *   · data/library/astro-canon/qizheng/19-timing-forecast-specificity.md → บอกตรงว่าได้ระดับ "ปี"
 *     เดือน/วันยังพิสูจน์ไม่ได้ (ไม่มี 流月/流日 ในชุดนี้)
 *   · ไม่ทราบเวลาเกิด → ปิด 命宮/12宮/度主/身主/行限 ตาม No-Time Mode ของคัมภีร์
 */
import { qizhengHouses, qizhengTimingLimit, qizhengTransit, type QizhengNatal } from "./astro/qizheng/engine";
import { qizhengHuaYao } from "./astro/qizheng/huayao";
import type { TXResult } from "./tianxing";

export type Note3 = { th: string; en: string; zh: string };

/** ชั้นโครงผัง (ไม่ใช่ชั้นเวลา) */
const PRECISION_STRUCTURE = "chart_structure";
/** ชั้นเวลา — ละเอียดได้แค่ระดับปี/ช่วงวัย */
const PRECISION_YEAR = "year";

const NOTE_STRUCTURE: Note3 = {
  th: "ตำแหน่งดาวเป็นค่าดาราศาสตร์จริง ส่วนป้ายกำลัง (廟旺/落陷) และการตีเรือนมาจากตารางคัมภีร์ อ่านเป็นแนวโน้มพื้นดวง ไม่ใช่การกำหนดเวลา",
  en: "Star positions are real astronomy; dignity labels and house mapping come from classical tables. Read as natal tendency, not as timing.",
  zh: "星位為真實天文計算，廟旺與宮位判讀取自古籍表格；屬命盤傾向，非擇時。",
};
const NOTE_YEAR: Note3 = {
  th: "ชั้นนี้อ่านได้ถึงระดับปีและช่วงวัยเท่านั้น เดือนและวันยังพิสูจน์ไม่ได้จากข้อมูลชุดนี้",
  en: "This layer resolves to year and life-stage only; month and day precision is not proved by this data.",
  zh: "此層僅能斷至年與運限階段，月、日精度本資料無法證實。",
};

const SRC_HOUSES =
  "張果星宗·十二宮 (欽定古今圖書集成·藝術典) · engine qizhengHouses: 先看其宮後看其主 (เจ้าเรือน + 廟旺 อิง宿度)";
const SRC_THREE_LORDS =
  "果老星宗/星學大成 · 命主=เจ้าราศีลัคนา · 度主=度主ของ宿ที่命度ตก · 身主=度主ของ宿ที่月躔 · น้ำหนักอ่านตาม 10-degree-limit-specificity (度主 > 命主 > 身主)";
const SRC_TRANSIT =
  "流年木土過宮 · ตำแหน่งพฤหัส/เสาร์จริงกลางปี (astronomy-engine) เทียบเรือนของผังเกิด · engine qizhengTransit";

type TXStarRow = TXResult["stars"][number];

/** ดาวในผัง (engine ไม่มี = null · ห้ามปั้น) */
function findStar(reading: TXResult, key: string | null | undefined): TXStarRow | null {
  if (!key) return null;
  return reading.stars.find((s) => s.key === key) || null;
}

/** เรือนที่ดาวตก (1-12) — ต้องรู้ลัคนาเท่านั้น */
function houseOfStar(reading: TXResult, star: TXStarRow, hasBirthTime: boolean): number | null {
  return hasBirthTime ? ((star.sign - reading.ascendant.sign + 12) % 12) + 1 : null;
}

export type LordAnchor = { signTh: string; signZh: string; deg: number; shu: string; shuTh: string; shuDeg: number };

export type QizhengLord = {
  role: string; roleTh: string; roleEn: string; weightRank: number;
  starKey: string; starTh: string; starZh: string;
  signTh: string; signZh: string; deg: number;
  shu: string; shuDeg: number;
  status: string; statusTh: string; statusRank: number;
  retro: boolean;
  house: number | null;
  relationToMing: string;
  anchor?: LordAnchor;
};

function buildLord(
  reading: TXResult,
  role: string,
  roleTh: string,
  roleEn: string,
  weightRank: number,
  key: string | null | undefined,
  relationToMing: string,
  hasBirthTime: boolean,
  anchor?: LordAnchor
): QizhengLord | null {
  const star = findStar(reading, key);
  if (!star) return null; // engine ระบุเจ้าไม่ได้ → ไม่ส่งก้อนนี้
  return {
    role, roleTh, roleEn, weightRank,
    starKey: star.key, starTh: star.th, starZh: star.zh,
    signTh: star.signTh, signZh: star.signZh, deg: star.deg,
    shu: star.shu, shuDeg: star.shuDeg,
    status: star.status, statusTh: star.statusTh, statusRank: star.statusRank,
    retro: star.retro,
    house: houseOfStar(reading, star, hasBirthTime),
    relationToMing,
    ...(anchor ? { anchor } : {}),
  };
}

/** ปีท้องถิ่นของพิกัดผัง (สูตรเดียวกับ engine/packet — ห้ามคิดใหม่) */
export function localYearAt(d: Date, lng: number): number {
  return new Date(d.getTime() + Math.round(lng / 15) * 3_600_000).getUTCFullYear();
}

export type QizhengDeepInput = {
  reading: TXResult;
  /** เวลาเกิด/เวลาของผัง (UTC) — ใช้หาก้านปีของ 化曜 */
  dtUTC: Date;
  lat: number;
  lng: number;
  /** natal = ดวงกำเนิดของโปรไฟล์ (เปิดชั้นเวลา) · moment = ฟ้า ณ เวลาที่ถาม (ไม่มีเจ้าชะตา → ไม่มีชั้นเวลา) */
  chartKind: "natal" | "moment";
  birthTimeKnown: boolean;
  /** วันอ้างอิงของ 行限/流年 — ไม่ส่ง = วันนี้ */
  refDate?: Date;
  refDateSource?: "query" | "now";
};

export type QizhengDeep = {
  deepMeta: {
    chartKind: "natal" | "moment";
    birthTimeKnown: boolean;
    refDate: string;
    refDateSource: "query" | "now";
    notAvailable: string[];
    note: Note3;
  };
  houses?: unknown;
  threeLords?: unknown;
  xianLimit?: unknown;
  yearTransit?: unknown;
  huayao?: unknown;
};

/** ประกอบชั้นลึกทั้งหมดจากผลที่ engine คืน (deterministic · ไม่มี I/O) */
export function buildQizhengDeep(input: QizhengDeepInput): QizhengDeep {
  const { reading, dtUTC, lat, lng, chartKind, birthTimeKnown } = input;
  const refDate = input.refDate && !isNaN(input.refDate.getTime()) ? input.refDate : new Date();
  const refDateSource = input.refDateSource || (input.refDate ? "query" : "now");

  // โครงเดียวกับ qizhengNatal() ทุกประการ (ประกอบเองเพื่อไม่คำนวณดาราศาสตร์ซ้ำรอบสอง)
  const natal: QizhengNatal = {
    reading,
    houses: birthTimeKnown ? qizhengHouses(reading) : [],
    hasBirthTime: birthTimeKnown,
  };
  const notAvailable: string[] = [];

  // ① 12 เรือน — engine qizhengHouses (先看其宮後看其主)
  const houses = natal.houses.length
    ? {
        methodConfidence: "medium" as const,
        precision: PRECISION_STRUCTURE,
        source: SRC_HOUSES,
        methodNote: NOTE_STRUCTURE,
        ascendantSignTh: reading.ascendant.signTh,
        ascendantSignZh: reading.ascendant.signZh,
        items: natal.houses.map((h) => ({
          house: h.house, zh: h.zh, th: h.th, domain: h.domain, keyPalace: h.strong,
          signTh: h.signTh, signZh: h.signZh,
          ruler: {
            key: h.rulerKey, th: h.rulerTh,
            status: h.rulerStatus, statusRank: h.rulerStatusRank,
            inHouse: h.rulerInHouse,
          },
          starsInHouse: h.starsInHouse.map((s) => ({ th: s.th, zh: s.zh, status: s.status, statusRank: s.rank })),
          level: h.level,
          note: h.note,
        })),
      }
    : null;
  if (!houses) notAvailable.push("12宮(เรือนชีวิต)");

  // ② 三主 命主/度主/身主 — น้ำหนักอ่านตามคัมภีร์: 度主 > 命主 > 身主
  const degreeLord = birthTimeKnown
    ? buildLord(reading, "度主", "เจ้าองศาลัคนา (命度)", "Degree lord", 1, reading.mingDegree.lordKey, reading.mingDegree.relationToMing, birthTimeKnown, {
        signTh: reading.mingDegree.signTh, signZh: reading.mingDegree.signZh, deg: reading.mingDegree.deg,
        shu: reading.mingDegree.shu, shuTh: reading.mingDegree.shuTh, shuDeg: reading.mingDegree.shuDeg,
      })
    : null;
  const lifeLord = birthTimeKnown
    ? buildLord(reading, "命主", "เจ้าเรือนลัคนา (命宮主)", "Life lord", 2, reading.yongshen.key, "命主同星", birthTimeKnown)
    : null;
  const bodyLord = birthTimeKnown
    ? buildLord(reading, "身主", "เจ้าองศาจันทร์ (身宮)", "Body lord", 3, reading.shenDegree.lordKey, reading.shenDegree.relationToMing, birthTimeKnown, {
        signTh: reading.shenDegree.signTh, signZh: reading.shenDegree.signZh, deg: reading.shenDegree.deg,
        shu: reading.shenDegree.shu, shuTh: reading.shenDegree.shuTh, shuDeg: reading.shenDegree.shuDeg,
      })
    : null;
  const threeLords = degreeLord || lifeLord || bodyLord
    ? {
        methodConfidence: "medium" as const,
        precision: PRECISION_STRUCTURE,
        source: SRC_THREE_LORDS,
        methodNote: NOTE_STRUCTURE,
        weightOrder: ["度主", "命主", "身主"],
        weightNote: {
          th: "อ่านตามน้ำหนัก 度主 (จุดชี้ชัดที่สุด) → 命主 (ดาวเจ้าชะตา) → 身主 (การแบกรับจริงในชีวิต)",
          en: "Weight order: degree lord (sharpest anchor) → life lord (governing star) → body lord (practical delivery).",
          zh: "判讀權重：度主（最精準錨點）→ 命主（主星）→ 身主（實際承擔）。",
        },
        complete: Boolean(degreeLord && lifeLord && bodyLord),
        ...(degreeLord ? { degreeLord } : {}),
        ...(lifeLord ? { lifeLord } : {}),
        ...(bodyLord ? { bodyLord } : {}),
      }
    : null;
  if (!threeLords) notAvailable.push("三主(命主/度主/身主)");

  // ③ 行限 ตามอายุจริง ณ refDate (natal เท่านั้น — ผังฟ้าเวลาอื่นไม่มีเจ้าชะตาให้นับอายุ)
  const limit = chartKind === "natal" && birthTimeKnown ? qizhengTimingLimit(natal, refDate) : null;
  const xianLimit = limit
    ? {
        methodConfidence: limit.methodConfidence, // engine กำหนดเอง = "medium"
        precision: PRECISION_YEAR,
        source: limit.dongweiHundredSix.source,
        methodNote: NOTE_YEAR,
        refDate: limit.refDateISO,
        refDateSource,
        targetYear: limit.targetYear,
        ageActual: limit.actualAge,
        ageNominal: limit.nominalAge,
        chuMingAge: limit.chuMingAge,
        chuMingMethod: limit.chuMingMethod,
        current: {
          house: limit.current.segment.house,
          zh: limit.current.segment.zh,
          th: limit.current.segment.th,
          domain: limit.current.segment.domain,
          signTh: limit.current.segment.signTh,
          signZh: limit.current.segment.signZh,
          ageStart: limit.current.segment.ageStart,
          ageEnd: limit.current.segment.ageEnd,
          elapsedYears: limit.current.elapsedYears,
          degreeInPalace: limit.current.degreeInPalace,
          limitShu: limit.current.limitShu,
          degreeLord: limit.current.limitDegreeLord, // 限度主 + สถานะในพื้นดวง + 恩用仇難
          palaceLord: limit.current.limitPalaceLord, // 限宮主
          tone: limit.current.tone,
          note: limit.current.note,
        },
        sequence: limit.sequence.map((s) => ({
          index: s.index, house: s.house, zh: s.zh, th: s.th, domain: s.domain,
          ageStart: s.ageStart, ageEnd: s.ageEnd,
        })),
        dongweiNote: limit.dongweiHundredSix.note,
      }
    : null;
  if (!xianLimit) notAvailable.push("行限/限度主");

  // ④ 流年木土 — พฤหัส/เสาร์จรตกเรือนไหนของผังเกิด (natal เท่านั้น)
  let yearTransit: Record<string, unknown> | null = null;
  if (chartKind === "natal" && birthTimeKnown && natal.houses.length) {
    const year = localYearAt(refDate, lng);
    const row = qizhengTransit(reading.ascendant.sign, [year], lat, lng)[0] || null;
    if (row) {
      const houseMeta = (n: number) => natal.houses.find((h) => h.house === n) || null;
      const jH = houseMeta(row.jupiterHouse), sH = houseMeta(row.saturnHouse);
      yearTransit = {
        methodConfidence: "medium" as const,
        precision: PRECISION_YEAR,
        source: SRC_TRANSIT,
        methodNote: NOTE_YEAR,
        year: row.year,
        refDateSource,
        jupiter: {
          house: row.jupiterHouse, zh: row.jupiterHouseZh,
          ...(jH ? { th: jH.th, domain: jH.domain, houseLevel: jH.level } : {}),
        },
        saturn: {
          house: row.saturnHouse, zh: row.saturnHouseZh,
          ...(sH ? { th: sH.th, domain: sH.domain, houseLevel: sH.level } : {}),
        },
        sameHouse: row.jupiterHouse === row.saturnHouse,
        summaryTh: row.note,
      };
    }
  }
  if (!yearTransit) notAvailable.push("流年木土");

  // ⑤ 化曜 管庫星 จากก้านปีเกิด (ต้องการแค่ก้านปี → ใช้ได้แม้ไม่รู้เวลาเกิด · เรือนจะเป็น null)
  let huayao: Record<string, unknown> | null = null;
  try {
    const hy = qizhengHuaYao(natal, dtUTC, Math.round(lng / 15));
    huayao = {
      methodConfidence: "medium" as const,
      precision: PRECISION_STRUCTURE,
      source: hy.source,
      methodNote: NOTE_STRUCTURE,
      basis: hy.basis,
      // ผังเกิด = ก้านปีเกิด · ผังฟ้าเวลาอื่น = ก้านปีของผังนั้น (ห้ามให้แอพเข้าใจผิดว่าเป็นปีเกิดเสมอ)
      stemOf: chartKind === "natal" ? "birth_year" : "chart_year",
      yearStem: hy.yearStem,
      yearStemIndex: hy.yearStemIndex,
      roles: hy.roles,
    };
  } catch {
    huayao = null; // engine ล้ม = ไม่ส่ง (ห้ามปั้น)
  }
  if (!huayao) notAvailable.push("化曜");
  // ชั้นที่ "ยังไม่ต่อท่อให้แอพ" — ประกาศไว้เสมอตาม Missing layer guard ของคัมภีร์ 19-timing-forecast
  // (เว็บมี buildQizhengTimeline ให้ 流月/流年全星 แต่ยังไม่เปิดเส้นมือถือ) → แอพห้ามพูดระดับเดือน/วัน
  notAvailable.push("流月(太陽過宮)", "流日", "小限");

  return {
    deepMeta: {
      chartKind,
      birthTimeKnown,
      refDate: refDate.toISOString().slice(0, 10),
      refDateSource,
      notAvailable,
      note: birthTimeKnown
        ? {
            th: "ชั้นลึกอ่านจาก engine ชุดเดียวกับเว็บ ไม่ได้คำนวณซ้ำคนละสูตร",
            en: "Deep layers come from the same engine the web reading uses — no separate formula.",
            zh: "深層資料取自與網頁相同的推算引擎，並非另行計算。",
          }
        : {
            th: "โปรไฟล์ไม่ทราบเวลาเกิด จึงปิดเรือนชีวิต 三主 และ 行限 ตามคัมภีร์ อ่านได้เฉพาะตำแหน่งดาวจริง",
            en: "Birth time unknown, so houses, the three lords and the limit layer are closed per the classics; only real star positions can be read.",
            zh: "出生時間未知，依古法關閉十二宮、三主與行限，僅能讀取真實星位。",
          },
    },
    ...(houses ? { houses } : {}),
    ...(threeLords ? { threeLords } : {}),
    ...(xianLimit ? { xianLimit } : {}),
    ...(yearTransit ? { yearTransit } : {}),
    ...(huayao ? { huayao } : {}),
  };
}
