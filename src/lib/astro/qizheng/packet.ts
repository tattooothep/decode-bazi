/**
 * astro/qizheng · packet (structured · version-lock) → ป้อน AI
 * envelope เดียวกับทุกศาสตร์ · AI อ่านเฉพาะ data นี้ ห้ามเดาตำแหน่งดาว
 */
import { qizhengNatal, qizhengTimingLimit, qizhengTransit, type QizhengNatal, type QizhengTimingLimit } from "./engine";

export type QizhengPacket = {
  discipline: "qizheng";
  packetVersion: "qizheng-v3";
  hasBirthTime: boolean;
  degradeLevel: "full" | "partial";
  data: {
    ascendant: { signTh: string; signZh: string; deg: number; shu: string; shuDeg: number; rulerTh: string };
    mingDegree: { signTh: string; signZh: string; deg: number; shu: string; shuTh: string; shuDeg: number; lordTh: string; lordZh: string; lordStatus: string; relationToMing: string };
    shenDegree: { signTh: string; signZh: string; deg: number; shu: string; shuTh: string; shuDeg: number; lordTh: string; lordZh: string; lordStatus: string; relationToMing: string };
    yongshen: { th: string; status: string };
    stars: { th: string; zh: string; signTh: string; signDeg: number; shu: string; shuDeg: number; status: string; retro: boolean }[];
    enStars: string[]; yongStars: string[]; nanStars: string[]; chouStars: string[];
    geju: { th: string; good: boolean }[];
    houses12: { house: number; zh: string; th: string; domain: string; signTh: string; rulerTh: string; rulerStatus: string; rulerInHouse: number; starsInHouse: string[]; level: string; note: string }[];
    transit: { year: number; jupiterHouseZh: string; saturnHouseZh: string; note: string }[];
    xingXian: QizhengTimingLimit | null;
    verdictTh: string; level: string;
  };
  notAvailable: string[];
};

export function buildQizhengPacket(dtUTC: Date, lat: number, lng: number, hasBirthTime = true, transitYears?: number[], refDate?: Date): QizhengPacket {
  const n: QizhengNatal = qizhengNatal(dtUTC, lat, lng, hasBirthTime);
  const r = n.reading;
  const years = transitYears || Array.from({ length: 12 }, (_, i) => 2015 + i);
  const transit = hasBirthTime ? qizhengTransit(r.ascendant.sign, years) : [];
  const xingXian = refDate && hasBirthTime ? qizhengTimingLimit(n, refDate) : null;
  const timingGaps = xingXian ? ["流月", "流日", "化曜"] : ["行限", "限度主", "洞微百六限", "流月", "流日", "化曜"];
  const notAvailable: string[] = hasBirthTime
    ? timingGaps
    : ["命宮(ลัคนา)", "命度", "度主", "身宮", "身主", "12宮(เรือนชีวิต)", ...timingGaps];
  return {
    discipline: "qizheng",
    packetVersion: "qizheng-v3",
    hasBirthTime,
    degradeLevel: hasBirthTime ? "full" : "partial",
    data: {
      ascendant: { signTh: r.ascendant.signTh, signZh: r.ascendant.signZh, deg: r.ascendant.deg, shu: r.ascendant.shu, shuDeg: r.ascendant.shuDeg, rulerTh: r.ascendant.rulerTh },
      mingDegree: {
        signTh: r.mingDegree.signTh, signZh: r.mingDegree.signZh, deg: r.mingDegree.deg,
        shu: r.mingDegree.shu, shuTh: r.mingDegree.shuTh, shuDeg: r.mingDegree.shuDeg,
        lordTh: r.mingDegree.lordTh, lordZh: r.mingDegree.lordZh, lordStatus: r.mingDegree.lordStatus,
        relationToMing: r.mingDegree.relationToMing,
      },
      shenDegree: {
        signTh: r.shenDegree.signTh, signZh: r.shenDegree.signZh, deg: r.shenDegree.deg,
        shu: r.shenDegree.shu, shuTh: r.shenDegree.shuTh, shuDeg: r.shenDegree.shuDeg,
        lordTh: r.shenDegree.lordTh, lordZh: r.shenDegree.lordZh, lordStatus: r.shenDegree.lordStatus,
        relationToMing: r.shenDegree.relationToMing,
      },
      yongshen: hasBirthTime ? { th: r.yongshen.th, status: r.yongshen.status } : { th: "—", status: "unavailable_no_birth_time" },
      stars: r.stars.map((s) => ({ th: s.th, zh: s.zh, signTh: s.signTh, signDeg: s.deg, shu: s.shu, shuDeg: s.shuDeg, status: s.status, retro: s.retro })),
      enStars: hasBirthTime ? r.en_stars.map((s) => s.th) : [],
      yongStars: hasBirthTime ? r.yong_stars.map((s) => s.th) : [],
      nanStars: hasBirthTime ? r.nan_stars.map((s) => s.th) : [],
      chouStars: hasBirthTime ? r.chou_stars.map((s) => s.th) : [],
      geju: hasBirthTime ? r.geju.map((g) => ({ th: g.th, good: g.good })) : [],
      houses12: n.houses.map((h) => ({ house: h.house, zh: h.zh, th: h.th, domain: h.domain, signTh: h.signTh, rulerTh: h.rulerTh, rulerStatus: h.rulerStatus, rulerInHouse: h.rulerInHouse, starsInHouse: h.starsInHouse.map((s) => s.th), level: h.level, note: h.note })),
      transit: transit.map((t) => ({ year: t.year, jupiterHouseZh: t.jupiterHouseZh, saturnHouseZh: t.saturnHouseZh, note: t.note })),
      xingXian,
      verdictTh: hasBirthTime ? r.verdictTh.th : "ไม่ทราบเวลาเกิด: อ่านได้เฉพาะตำแหน่งดาวจริง ราศี 宿 廟旺/พักร์ เท่านั้น; ปิด命宮/命度/度主/身主/12宮/恩用仇難/格局/行限",
      level: hasBirthTime ? r.level : "partial_no_birth_time",
    },
    notAvailable,
  };
}
