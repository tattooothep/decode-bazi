/**
 * astro/qizheng · packet (structured · version-lock) → ป้อน AI
 * envelope เดียวกับทุกศาสตร์ · AI อ่านเฉพาะ data นี้ ห้ามเดาตำแหน่งดาว
 */
import { qizhengNatal, qizhengTransit, type QizhengNatal } from "./engine";

export type QizhengPacket = {
  discipline: "qizheng";
  packetVersion: "qizheng-v1";
  hasBirthTime: boolean;
  degradeLevel: "full" | "partial";
  data: {
    ascendant: { signTh: string; signZh: string; rulerTh: string };
    yongshen: { th: string; status: string };
    stars: { th: string; zh: string; signTh: string; shu: string; status: string; retro: boolean }[];
    enStars: string[]; yongStars: string[]; nanStars: string[]; chouStars: string[];
    geju: { th: string; good: boolean }[];
    houses12: { house: number; zh: string; th: string; domain: string; signTh: string; rulerTh: string; rulerStatus: string; rulerInHouse: number; starsInHouse: string[]; level: string; note: string }[];
    transit: { year: number; jupiterHouseZh: string; saturnHouseZh: string; note: string }[];
    verdictTh: string; level: string;
  };
  notAvailable: string[];
};

export function buildQizhengPacket(dtUTC: Date, lat: number, lng: number, hasBirthTime = true, transitYears?: number[]): QizhengPacket {
  const n: QizhengNatal = qizhengNatal(dtUTC, lat, lng, hasBirthTime);
  const r = n.reading;
  const years = transitYears || Array.from({ length: 12 }, (_, i) => 2015 + i);
  const transit = qizhengTransit(r.ascendant.sign, years);
  const notAvailable: string[] = hasBirthTime ? [] : ["命宮(ลัคนา)", "12宮(เรือนชีวิต)"];
  return {
    discipline: "qizheng",
    packetVersion: "qizheng-v1",
    hasBirthTime,
    degradeLevel: hasBirthTime ? "full" : "partial",
    data: {
      ascendant: { signTh: r.ascendant.signTh, signZh: r.ascendant.signZh, rulerTh: r.ascendant.rulerTh },
      yongshen: { th: r.yongshen.th, status: r.yongshen.status },
      stars: r.stars.map((s) => ({ th: s.th, zh: s.zh, signTh: s.signTh, shu: s.shu, status: s.status, retro: s.retro })),
      enStars: r.en_stars.map((s) => s.th), yongStars: r.yong_stars.map((s) => s.th), nanStars: r.nan_stars.map((s) => s.th), chouStars: r.chou_stars.map((s) => s.th),
      geju: r.geju.map((g) => ({ th: g.th, good: g.good })),
      houses12: n.houses.map((h) => ({ house: h.house, zh: h.zh, th: h.th, domain: h.domain, signTh: h.signTh, rulerTh: h.rulerTh, rulerStatus: h.rulerStatus, rulerInHouse: h.rulerInHouse, starsInHouse: h.starsInHouse.map((s) => s.th), level: h.level, note: h.note })),
      transit: transit.map((t) => ({ year: t.year, jupiterHouseZh: t.jupiterHouseZh, saturnHouseZh: t.saturnHouseZh, note: t.note })),
      verdictTh: r.verdictTh.th, level: r.level,
    },
    notAvailable,
  };
}
