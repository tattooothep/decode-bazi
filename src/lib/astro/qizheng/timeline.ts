/**
 * Qizheng TIMING_TIMELINE · เฟส 4 ของ timeline engine — ชั้นเวลา 七政四餘 ที่ audit พบว่าขาด
 *   1) 流年全星: ดาวจรครบ 七政+四餘 (เดิมส่งแค่ 木/土) เทียบเรือนเกิด + 廟旺จร + เทียบ恩用仇難ของ命主
 *   2) 流月 (太陽過宮): ขอบเดือนสุริยคติ sidereal จริง + เรือนของดาวเร็วรายเดือน
 *   3) วันแม่นดาวจรชนจุดสำคัญ: 木/土/羅/計/火 ทับ(同宮同度)/เล็ง(對照) 命度·身度·命主กำเนิด
 * deterministic ทั้งหมด (tianxingReading + astro-core/events scan+bisection) · AI ห้ามเดาวัน
 * วันที่ทุกจุด = เวลาไทย (Asia/Bangkok)
 */
import { tianxingReading, type TXResult } from "../../tianxing/index";
import { findAspectHits, findIngresses, type EventBodyKey } from "../../astro-core/events";
import { norm360 } from "../../astro-core/ephemeris";

const BKK_MS = 7 * 3600 * 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const bkkDateISO = (d: Date) => new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);
const bkkMonth = (d: Date) => new Date(d.getTime() + BKK_MS).getUTCMonth() + 1;

const HOUSE12_ZH = ["命宮", "財帛", "兄弟", "田宅", "男女", "奴僕", "妻妾", "疾厄", "遷移", "官祿", "福德", "相貌"];

export type QizhengTimelineStar = {
  key: string; th: string; zh: string;
  signTh: string; deg: number;
  house: number; houseZh: string;
  status: string; retro: boolean;
  relationToMing: string;             // 恩星/用星/仇星/難星/命主同星/中性 (เทียบ命主กำเนิด)
};

export type QizhengMonthRow = {
  month: number;                       // ลำดับเดือนสุริยคติในปี (1-12 ตามลำดับ太陽過宮)
  fromISO: string; toISO: string;
  sunSignTh: string;
  sunHouse: number; sunHouseZh: string;
  fastStars: { zh: string; th: string; house: number; houseZh: string }[]; // 火/金/水 กลางเดือน
};

export type QizhengHitRow = {
  dateISO: string; month: number;
  starZh: string; starTh: string;
  target: "命度" | "身度" | "命主กำเนิด";
  aspect: "ทับ(同宮同度)" | "เล็ง(對照)";
  retro: boolean;
  relationToMing: string;
};

export type QizhengTimeline = {
  targetYear: number;
  timezone: "Asia/Bangkok";
  method: "tianxing_full_overlay + sun_ingress_months + scan_bisection_hits";
  liuNianStars: QizhengTimelineStar[];
  months: QizhengMonthRow[];
  hits: QizhengHitRow[];
  coverageNote: string;
};

/** ความสัมพันธ์ของดาว key ต่อ命主กำเนิด (ยึด恩用仇難ของพื้นดวง) */
function relationToMing(natal: TXResult, key: string): string {
  if (key === natal.yongshen.key) return "命主同星";
  if (natal.en_stars.some((s) => s.key === key)) return "恩星";
  if (natal.yong_stars.some((s) => s.key === key)) return "用星";
  if (natal.chou_stars.some((s) => s.key === key)) return "仇星";
  if (natal.nan_stars.some((s) => s.key === key)) return "難星";
  return "中性";
}

/** สร้าง TIMING_TIMELINE 七政四餘 ของปีเป้าหมาย (ต้องมีเวลาเกิด — 12宮อิงลัคนา) */
export function buildQizhengTimeline(natal: TXResult, targetYear: number, lat: number, lng: number): QizhengTimeline {
  const from = new Date(Date.UTC(targetYear, 0, 1) - BKK_MS);
  const to = new Date(Date.UTC(targetYear + 1, 0, 1) - BKK_MS - 1000);
  const midYear = new Date(Date.UTC(targetYear, 5, 15, 5));
  const ascSign = natal.ascendant.sign;
  const houseOfSign = (sign: number) => ((sign - ascSign + 12) % 12) + 1;

  // ---- 1) 流年全星 (กลางปี · พิกัดเกิดจริง — แก้บั๊กเดิมที่ hardcode กรุงเทพ) ----
  const rr = tianxingReading(midYear, lat, lng);
  const liuNianStars: QizhengTimelineStar[] = rr.stars.map((s) => {
    const house = houseOfSign(s.sign);
    return {
      key: s.key, th: s.th, zh: s.zh,
      signTh: s.signTh, deg: r2(s.deg),
      house, houseZh: HOUSE12_ZH[house - 1],
      status: s.status, retro: s.retro,
      relationToMing: relationToMing(natal, s.key),
    };
  });

  // ---- 2) 流月 = 太陽過宮 (sidereal ingress ของอาทิตย์ · ayanamsa ปีเป้าหมาย) ----
  const sunIngresses = findIngresses("Sun", from, to, rr.ayanamsa);
  const boundaries = [from, ...sunIngresses.map((e) => e.date), to];
  const months: QizhengMonthRow[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const f = boundaries[i], t = boundaries[i + 1];
    if (t.getTime() - f.getTime() < 2 * 86400000) continue; // เศษหัว/ท้ายปีสั้นกว่า 2 วัน ข้าม
    const mid = new Date((f.getTime() + t.getTime()) / 2);
    const rm = tianxingReading(mid, lat, lng);
    const sun = rm.stars.find((s) => s.key === "Sun")!;
    const fast = ["Mars", "Venus", "Mercury"].map((k) => {
      const s = rm.stars.find((x) => x.key === k)!;
      const h = houseOfSign(s.sign);
      return { zh: s.zh, th: s.th, house: h, houseZh: HOUSE12_ZH[h - 1] };
    });
    const hSun = houseOfSign(sun.sign);
    months.push({
      month: months.length + 1,
      fromISO: bkkDateISO(f), toISO: bkkDateISO(t),
      sunSignTh: sun.signTh,
      sunHouse: hSun, sunHouseZh: HOUSE12_ZH[hSun - 1],
      fastStars: fast,
    });
  }

  // ---- 3) วันแม่นดาวจรชนจุดสำคัญ (tropical lon · ทับ 0° / เล็ง 180°) ----
  const yongshenNatal = natal.stars.find((s) => s.key === natal.yongshen.key);
  const targets: { name: QizhengHitRow["target"]; lon: number }[] = [
    { name: "命度", lon: natal.mingDegree.lonTrop },
    { name: "身度", lon: natal.shenDegree.lonTrop },
    ...(yongshenNatal ? [{ name: "命主กำเนิด" as const, lon: yongshenNatal.lonTrop }] : []),
  ];
  const movers: { key: EventBodyKey; zh: string; th: string }[] = [
    { key: "Jupiter", zh: "木", th: "พฤหัส" },
    { key: "Saturn", zh: "土", th: "เสาร์" },
    { key: "Rahu", zh: "羅睺", th: "ราหู" },
    { key: "Ketu", zh: "計都", th: "เกตุ" },
    { key: "Mars", zh: "火", th: "อังคาร" },
  ];
  const hits: QizhengHitRow[] = [];
  for (const m of movers) {
    for (const tgt of targets) {
      for (const angle of [0, 180] as const) {
        for (const h of findAspectHits(m.key, tgt.name, norm360(tgt.lon), angle, from, to)) {
          hits.push({
            dateISO: bkkDateISO(h.date), month: bkkMonth(h.date),
            starZh: m.zh, starTh: m.th,
            target: tgt.name,
            aspect: angle === 0 ? "ทับ(同宮同度)" : "เล็ง(對照)",
            retro: h.retro,
            relationToMing: relationToMing(natal, m.key as string),
          });
        }
      }
    }
  }
  hits.sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  return {
    targetYear,
    timezone: "Asia/Bangkok",
    method: "tianxing_full_overlay + sun_ingress_months + scan_bisection_hits",
    liuNianStars,
    months,
    hits,
    coverageNote: `ชั้นเวลา七政四餘ปี ${targetYear}: 流年ครบ ${liuNianStars.length} ดวง (พิกัดเกิดจริง) · 流月太陽過宮 ${months.length} ช่วง · วันชนจุดสำคัญ ${hits.length} จุด (木土羅計火 × 命度/身度/命主) · ยังไม่มี: 流日 · 小限 (รอตาราง/คัมภีร์ยืนยัน ห้ามเดา) · 十干化曜 ดูที่ field data.huaYao ของ packet`,
  };
}
