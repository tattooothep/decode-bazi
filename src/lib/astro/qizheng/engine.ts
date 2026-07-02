/**
 * astro/qizheng · 七政四餘 engine (wrap tianxingReading + เติม 12宮 + ดาวจร/transit)
 * ⚠️ wrap เท่านั้น — ไม่แตะ src/lib/tianxing/index.ts (live r294)
 * ศัพท์เฉพาะศาสตร์นี้: 命宮/廟旺/恩用仇難/格局/12宮 — ห้ามปนศัพท์ปาจื้อ/Western
 */
import { tianxingReading, type TXResult, type TXStar } from "../../tianxing/index";
import { SIGNS } from "../../tianxing/tables";
import { shuAt } from "../../tianxing/xiu28";

/** ชื่อ 12 เรือน (GLXZ1 L4873 命宮財帛兄弟田宅男女奴僕妻妾疾厄遷移官祿福德相貌) */
const HOUSE12 = [
  { zh: "命宮", th: "ตัวตน/ลัคนา", domain: "บุคลิก·ชีวิตหลัก", strong: true },
  { zh: "財帛", th: "ทรัพย์", domain: "เงินทอง·การหาเงิน", strong: false },
  { zh: "兄弟", th: "พี่น้อง", domain: "พี่น้อง·เพื่อน·ผู้ร่วมงาน", strong: false },
  { zh: "田宅", th: "เคหะ", domain: "บ้าน·ที่ดิน·อสังหา·ฐานราก", strong: true },
  { zh: "男女", th: "บุตร", domain: "บุตร·ผลงานสร้างสรรค์·ความรัก", strong: true },
  { zh: "奴僕", th: "บริวาร", domain: "ลูกน้อง·เครือข่าย", strong: false },
  { zh: "妻妾", th: "คู่ครอง", domain: "คู่สมรส·การแต่งงาน", strong: false },
  { zh: "疾厄", th: "โรคภัย", domain: "สุขภาพ·จุดอ่อนกาย·อุบัติเหตุ", strong: false },
  { zh: "遷移", th: "โยกย้าย", domain: "เดินทาง·ต่างแดน·โอกาสภายนอก", strong: false },
  { zh: "官祿", th: "หน้าที่การงาน", domain: "งาน·ยศ·ตำแหน่ง·ชื่อเสียง", strong: true },
  { zh: "福德", th: "วาสนา", domain: "บุญ·ความสุขใจ·อายุ", strong: false },
  { zh: "相貌", th: "รูปลักษณ์", domain: "หน้าตา·ปัญญา·ภาพลักษณ์", strong: false },
];

export type QizhengHouse = {
  house: number; zh: string; th: string; domain: string; strong: boolean;
  sign: number; signTh: string; signZh: string;
  rulerKey: string; rulerTh: string; rulerStatus: string; rulerStatusRank: number;
  rulerInHouse: number;                    // เจ้าเรือนไปตกเรือนไหน
  starsInHouse: { th: string; zh: string; status: string; rank: number }[];
  level: "good" | "neutral" | "weak";      // ผลเรือนนี้
  note: string;
};

const XIONG = new Set(["Mars", "Saturn", "Rahu", "Ketu"]); // ดาวร้าย
const JI = new Set(["Jupiter", "Venus", "Ziqi", "Moon"]);  // ดาวมงคล

/** 12 เรือน — 先看其宮後看其主 (ดูเรือน→เจ้าเรือน廟旺→恩用仇難) */
export function qizhengHouses(r: TXResult): QizhengHouse[] {
  const ascSign = r.ascendant.sign;
  const starsBySign = (sign: number) => r.stars.filter((s) => s.sign === sign);
  const houseOfSign = (sign: number) => ((sign - ascSign + 12) % 12) + 1;
  return HOUSE12.map((h, i) => {
    const sign = (ascSign + i) % 12;
    const rulerKey = SIGNS[sign].ruler;
    const ruler = r.stars.find((s) => s.key === rulerKey);
    const inHouse = ruler ? houseOfSign(ruler.sign) : 0;
    const stars = starsBySign(sign).map((s) => ({ th: s.th, zh: s.zh, status: s.status, rank: s.statusRank }));
    const rank = ruler?.statusRank ?? 3;
    // ผลเรือน: เจ้าเรือนแข็ง(升殿/廟/旺 rank≥4)=ดี · 平=กลาง · 落陷(≤2)=อ่อน · ปรับด้วยดาวมงคล/ร้ายในเรือน
    let score = rank >= 4 ? 1 : rank <= 2 ? -1 : 0;
    if (ruler && ruler.sign === sign) score += 1;            // เจ้าเรือนอยู่บ้านตัวเอง (居本宮)
    for (const s of starsBySign(sign)) { if (JI.has(s.key)) score += 0.3; if (XIONG.has(s.key)) score -= 0.3; }  // ดาวมงคล/ร้ายในเรือน (นับครั้งเดียว · E2)
    const level: QizhengHouse["level"] = score >= 1 ? "good" : score <= -0.6 ? "weak" : "neutral";
    const note =
      level === "good" ? `เจ้าเรือน${ruler?.th || ""}${rank >= 4 ? "แข็ง(" + (ruler?.status || "") + ")" : ""}${ruler && ruler.sign === sign ? "·อยู่บ้านตัวเอง" : ""} → ${h.domain}เด่น`
      : level === "weak" ? `เจ้าเรือน${ruler?.th || ""}อ่อน(${ruler?.status || ""}) → ${h.domain}ต้องระวัง/ทำเอง`
      : `เจ้าเรือน${ruler?.th || ""}กลางๆ → ${h.domain}เรื่อยๆ`;
    return {
      house: i + 1, zh: h.zh, th: h.th, domain: h.domain, strong: h.strong,
      sign, signTh: SIGNS[sign].th, signZh: SIGNS[sign].zh,
      rulerKey, rulerTh: ruler?.th || rulerKey, rulerStatus: ruler?.status || "—", rulerStatusRank: rank,
      rulerInHouse: inHouse, starsInHouse: stars, level, note,
    };
  });
}

export type QizhengTransitRow = { year: number; jupiterHouse: number; jupiterHouseZh: string; saturnHouse: number; saturnHouseZh: string; note: string };

const XIU_DEGREE_LORD: Record<string, string> = {
  角: "Jupiter", 斗: "Jupiter", 奎: "Jupiter", 井: "Jupiter",
  亢: "Venus", 牛: "Venus", 婁: "Venus", 鬼: "Venus",
  氐: "Saturn", 女: "Saturn", 胃: "Saturn", 柳: "Saturn",
  房: "Sun", 虛: "Sun", 昴: "Sun", 星: "Sun",
  心: "Moon", 危: "Moon", 畢: "Moon", 張: "Moon",
  尾: "Mars", 室: "Mars", 觜: "Mars", 翼: "Mars",
  箕: "Mercury", 壁: "Mercury", 參: "Mercury", 軫: "Mercury",
};

const LIMIT_SEQUENCE: Array<{ zh: string; years: number }> = [
  { zh: "相貌", years: 10 },
  { zh: "福德", years: 11 },
  { zh: "官祿", years: 15 },
  { zh: "遷移", years: 8 },
  { zh: "疾厄", years: 7 },
  { zh: "妻妾", years: 11 },
  { zh: "奴僕", years: 4.5 },
  { zh: "男女", years: 4.5 },
  { zh: "田宅", years: 4.5 },
  { zh: "兄弟", years: 5 },
  { zh: "財帛", years: 5 },
];

export type QizhengLimitSegment = {
  index: number;
  house: number;
  zh: string;
  th: string;
  domain: string;
  sign: number;
  signTh: string;
  signZh: string;
  ageStart: number;
  ageEnd: number;
  years: number;
  speedDegPerYear: number;
};

export type QizhengTimingLimit = {
  refDateISO: string;
  targetYear: number;
  actualAge: number;
  nominalAge: number;
  chuMingAge: number;
  chuMingMethod: string;
  methodConfidence: "medium";
  current: {
    segment: QizhengLimitSegment;
    elapsedYears: number;
    degreeInPalace: number;
    limitSiderealLon: number;
    limitShu: { zh: string; th: string; deg: number; width: number };
    limitDegreeLord: {
      key: string;
      th: string;
      zh: string;
      natalStatus: string;
      natalStatusRank: number;
      natalHouse: number | null;
      relationToMing: string;
    };
    limitPalaceLord: {
      key: string;
      th: string;
      status: string;
      statusRank: number;
      natalHouse: number;
    };
    tone: "support" | "mixed" | "stress";
    note: string;
  };
  sequence: QizhengLimitSegment[];
  dongweiHundredSix: {
    supplied: true;
    cycleYears: number;
    source: string;
    note: string;
  };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm360 = (d: number) => ((d % 360) + 360) % 360;
const localYear = (d: Date, lng: number) => new Date(d.getTime() + Math.round(lng / 15) * 3_600_000).getUTCFullYear();

function starHouse(r: TXResult, key: string): number | null {
  const star = r.stars.find((s) => s.key === key);
  return star ? ((star.sign - r.ascendant.sign + 12) % 12) + 1 : null;
}

function relationFromMing(r: TXResult, key: string): string {
  if (key === r.yongshen.key) return "命主同星";
  if (r.en_stars.some((s) => s.key === key)) return "恩星";
  if (r.yong_stars.some((s) => s.key === key)) return "用星";
  if (r.chou_stars.some((s) => s.key === key)) return "仇星";
  if (r.nan_stars.some((s) => s.key === key)) return "難星";
  return "中性";
}

function estimateChuMingAge(r: TXResult): number {
  // 張果星宗ให้出命限อยู่ราว 11-20 歲; v1 ใช้宮內度ทุก 3° เป็นหนึ่ง行 แล้ว clamp ตามช่วงตำรา
  return Math.max(11, Math.min(20, 10 + Math.ceil(r.mingDegree.deg / 3)));
}

export function qizhengTimingLimit(n: QizhengNatal, refDate: Date): QizhengTimingLimit | null {
  if (!n.hasBirthTime || !n.houses.length || !refDate || isNaN(refDate.getTime())) return null;
  const r = n.reading;
  const birth = new Date(r.dtUTC);
  const targetYear = localYear(refDate, r.lng);
  const nominalAge = Math.max(1, targetYear - localYear(birth, r.lng) + 1);
  const actualAge = Math.max(0, (refDate.getTime() - birth.getTime()) / 86400000 / 365.2425);
  const chuMingAge = estimateChuMingAge(r);

  const byZh = new Map(n.houses.map((h) => [h.zh, h]));
  const sequence: QizhengLimitSegment[] = [];
  let age = chuMingAge;
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const item of LIMIT_SEQUENCE) {
      const h = byZh.get(item.zh);
      if (!h) continue;
      sequence.push({
        index: sequence.length,
        house: h.house,
        zh: h.zh,
        th: h.th,
        domain: h.domain,
        sign: h.sign,
        signTh: h.signTh,
        signZh: h.signZh,
        ageStart: r2(age),
        ageEnd: r2(age + item.years),
        years: item.years,
        speedDegPerYear: r2(30 / item.years),
      });
      age += item.years;
    }
  }

  let current = sequence.find((s) => nominalAge >= s.ageStart && nominalAge < s.ageEnd);
  if (!current) current = nominalAge < chuMingAge
    ? {
        index: -1,
        house: 1,
        zh: "命宮",
        th: "ตัวตน/ลัคนา",
        domain: "บุคลิก·ชีวิตหลัก",
        sign: r.ascendant.sign,
        signTh: r.ascendant.signTh,
        signZh: r.ascendant.signZh,
        ageStart: 1,
        ageEnd: chuMingAge,
        years: chuMingAge - 1,
        speedDegPerYear: r2(30 / Math.max(1, chuMingAge - 1)),
      }
    : sequence[sequence.length - 1];

  const elapsedYears = Math.max(0, Math.min(current.years, nominalAge - current.ageStart));
  const degreeInPalace = r2(Math.max(0, Math.min(29.99, (elapsedYears / Math.max(0.01, current.years)) * 30)));
  const limitSiderealLon = r2(norm360(current.sign * 30 + degreeInPalace));
  const limitTropicalLon = norm360(limitSiderealLon + r.ayanamsa);
  const sh = shuAt(limitTropicalLon, birth);
  const lordKey = XIU_DEGREE_LORD[sh.zh] || "";
  const lordMeta = lordKey ? r.stars.find((s) => s.key === lordKey) : null;
  const palaceLord = r.stars.find((s) => s.key === byZh.get(current.zh)?.rulerKey);
  const relation = lordKey ? relationFromMing(r, lordKey) : "中性";
  const lordRank = lordMeta?.statusRank ?? 0;
  const palaceRank = palaceLord?.statusRank ?? 0;
  let tone: QizhengTimingLimit["current"]["tone"] = "mixed";
  if ((relation === "恩星" || relation === "用星" || relation === "命主同星") && lordRank >= 4 && palaceRank >= 3) tone = "support";
  if (relation === "難星" || relation === "仇星" || lordRank <= 2 || palaceRank <= 2) tone = "stress";

  return {
    refDateISO: refDate.toISOString().slice(0, 10),
    targetYear,
    actualAge: r2(actualAge),
    nominalAge,
    chuMingAge,
    chuMingMethod: "estimated_from_ming_degree_3deg_rows_v1",
    methodConfidence: "medium",
    current: {
      segment: current,
      elapsedYears: r2(elapsedYears),
      degreeInPalace,
      limitSiderealLon,
      limitShu: { zh: sh.zh, th: sh.th, deg: sh.deg, width: sh.width },
      limitDegreeLord: {
        key: lordKey,
        th: lordMeta?.th || lordKey || "—",
        zh: lordMeta?.zh || lordKey || "—",
        natalStatus: lordMeta?.status || "—",
        natalStatusRank: lordRank,
        natalHouse: lordKey ? starHouse(r, lordKey) : null,
        relationToMing: relation,
      },
      limitPalaceLord: {
        key: palaceLord?.key || byZh.get(current.zh)?.rulerKey || "",
        th: palaceLord?.th || byZh.get(current.zh)?.rulerTh || "—",
        status: palaceLord?.status || byZh.get(current.zh)?.rulerStatus || "—",
        statusRank: palaceRank || byZh.get(current.zh)?.rulerStatusRank || 0,
        natalHouse: byZh.get(current.zh)?.rulerInHouse || 0,
      },
      tone,
      note: tone === "support"
        ? "限度主และ限宮主ให้แรงหนุน ใช้เปิดเรื่องของเรือนนี้ได้"
        : tone === "stress"
          ? "限度主หรือ限宮主มีแรงขัด ต้องอ่านเป็นแรงกด/ภาระของช่วงวัยนี้"
          : "แรงช่วงวัยผสม ต้องอ่านคู่กับพื้นดวงและ木土流年",
    },
    sequence,
    dongweiHundredSix: {
      supplied: true,
      cycleYears: 100.5,
      source: "欽定古今圖書集成/藝術典/第567卷 年分訣+行度訣; 第582卷 洞微百六限說+限度主論",
      note: "v1 supplies deterministic 洞微大限/行限 segment and 限度主. Original 逐年行限度圖/命度圖 facsimile is not embedded; 出命限 uses 3-degree row estimate capped at 11-20.",
    },
  };
}

/** ดาวจร (流年) — 木/土 จร เทียบเรือนเกิด · บอกจังหวะปี (deterministic ตามปี) */
export function qizhengTransit(natalAscSign: number, years: number[]): QizhengTransitRow[] {
  return years.map((y) => {
    // ใช้ดาวจรกลางปี (15 มิ.ย.) ผ่าน tianxingReading (ดาวจริง)
    const rr = tianxingReading(new Date(`${y}-06-15T05:00:00Z`), 13.75, 100.5);
    const J = rr.stars.find((s) => s.key === "Jupiter")!;
    const S = rr.stars.find((s) => s.key === "Saturn")!;
    const hJ = ((J.sign - natalAscSign + 12) % 12);
    const hS = ((S.sign - natalAscSign + 12) % 12);
    const both = hJ === hS;
    return {
      year: y, jupiterHouse: hJ + 1, jupiterHouseZh: HOUSE12[hJ].zh,
      saturnHouse: hS + 1, saturnHouseZh: HOUSE12[hS].zh,
      note: both ? `木+土 เข้าเรือน${HOUSE12[hJ].zh}พร้อมกัน = จังหวะ${HOUSE12[hJ].domain}เข้มข้น`
        : `木→${HOUSE12[hJ].zh}(${HOUSE12[hJ].domain}) · 土→${HOUSE12[hS].zh}(${HOUSE12[hS].domain})`,
    };
  });
}

export type QizhengNatal = {
  reading: TXResult;
  houses: QizhengHouse[];
  hasBirthTime: boolean;
};

/** ผังดวงกำเนิด 七政四餘 เต็ม (ผัง + 命主 + 廟旺 + 恩用仇難 + 格局 + 12宮) */
export function qizhengNatal(dtUTC: Date, lat: number, lng: number, hasBirthTime = true): QizhengNatal {
  const reading = tianxingReading(dtUTC, lat, lng);
  return { reading, houses: hasBirthTime ? qizhengHouses(reading) : [], hasBirthTime };
}
