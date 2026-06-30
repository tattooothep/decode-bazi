/**
 * astro/qizheng · 七政四餘 engine (wrap tianxingReading + เติม 12宮 + ดาวจร/transit)
 * ⚠️ wrap เท่านั้น — ไม่แตะ src/lib/tianxing/index.ts (live r294)
 * ศัพท์เฉพาะศาสตร์นี้: 命宮/廟旺/恩用仇難/格局/12宮 — ห้ามปนศัพท์ปาจื้อ/Western
 */
import { tianxingReading, type TXResult, type TXStar } from "../../tianxing/index";
import { SIGNS } from "../../tianxing/tables";

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
  signTh: string; signZh: string;
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
    if (stars.some((s) => JI.has(r.stars.find((x) => x.th === s.th)?.key || ""))) score += 0.5;
    for (const s of starsBySign(sign)) { if (JI.has(s.key)) score += 0.3; if (XIONG.has(s.key)) score -= 0.3; }
    const level: QizhengHouse["level"] = score >= 1 ? "good" : score <= -0.6 ? "weak" : "neutral";
    const note =
      level === "good" ? `เจ้าเรือน${ruler?.th || ""}${rank >= 4 ? "แข็ง(" + (ruler?.status || "") + ")" : ""}${ruler && ruler.sign === sign ? "·อยู่บ้านตัวเอง" : ""} → ${h.domain}เด่น`
      : level === "weak" ? `เจ้าเรือน${ruler?.th || ""}อ่อน(${ruler?.status || ""}) → ${h.domain}ต้องระวัง/ทำเอง`
      : `เจ้าเรือน${ruler?.th || ""}กลางๆ → ${h.domain}เรื่อยๆ`;
    return {
      house: i + 1, zh: h.zh, th: h.th, domain: h.domain, strong: h.strong,
      signTh: SIGNS[sign].th, signZh: SIGNS[sign].zh,
      rulerKey, rulerTh: ruler?.th || rulerKey, rulerStatus: ruler?.status || "—", rulerStatusRank: rank,
      rulerInHouse: inHouse, starsInHouse: stars, level, note,
    };
  });
}

export type QizhengTransitRow = { year: number; jupiterHouse: number; jupiterHouseZh: string; saturnHouse: number; saturnHouseZh: string; note: string };

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
