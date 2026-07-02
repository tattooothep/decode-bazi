/**
 * astro/qizheng · 十干化曜 (變曜) — ดาวแปลงบทบาทตามก้านปีเกิด
 * ตำรา: 《張果星宗二》諸星起例·變曜 (欽定古今圖書集成·藝術典·第568卷 · Wikisource · public domain)
 *   「甲火乙孛丙屬木，丁是金星戊上求。己人太陰庚是水，辛炁壬計癸羅睺」
 *   訣曰: 祿暗福耗蔭貴刑印囚權 / 火孛木金土月水炁計羅
 *   ตาราง 天干化曜星例〈以年干橫取〉 ยืนยันทุกแถว: 天祿=火孛木金土月水炁計羅 · 天暗=孛木金土月水炁計羅火 · … · 天權=羅火孛木金土月水炁計
 *   → สูตร: star[(stemIndex + roleIndex) mod 10] · ลำดับดาวคงที่ · ก้านปีเลื่อนจุดเริ่ม
 * additive layer: อ่านผลจาก qizhengNatal เดิมเท่านั้น — ไม่แตะสูตร engine เดิม
 */
import { SolarTime } from "tyme4ts";
import type { QizhengNatal } from "./engine";

/** ก้านฟ้า 10 ตัว (ลำดับมาตรฐาน 甲=0) */
export const HUAYAO_STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;

/** ลำดับดาวตาม訣 「火孛木金土月水炁計羅」 — key ตรงกับ engine (tianxing STARS) */
const HUAYAO_STAR_SEQUENCE: { key: string; zh: string; th: string }[] = [
  { key: "Mars", zh: "火", th: "อังคาร" },
  { key: "Yuebo", zh: "孛", th: "เยวี่ยปั๋ว (月孛)" },
  { key: "Jupiter", zh: "木", th: "พฤหัส" },
  { key: "Venus", zh: "金", th: "ศุกร์" },
  { key: "Saturn", zh: "土", th: "เสาร์" },
  { key: "Moon", zh: "月", th: "จันทร์" },
  { key: "Mercury", zh: "水", th: "พุธ" },
  { key: "Ziqi", zh: "炁", th: "จื่อชี่ (紫氣)" },
  { key: "Ketu", zh: "計", th: "เกตุ (計都)" },
  { key: "Rahu", zh: "羅", th: "ราหู (羅睺)" },
];

/** บทบาทตามลำดับ訣 「祿暗福耗蔭貴刑印囚權」 + 主/管เรือน จากบท 變曜+天祿…天權 (卷568 verbatim) */
const HUAYAO_ROLES: { zh: string; full: string; meaningZh: string; meaningTh: string; palaceZh: string }[] = [
  { zh: "祿", full: "天祿", meaningZh: "主享祿", meaningTh: "ลาภยศ/เงินเดือน-ผลตอบแทน", palaceZh: "官祿" },
  { zh: "暗", full: "天暗", meaningZh: "主暗昧", meaningTh: "ดาวมัวหมอง/บั่นทอนลับหลัง", palaceZh: "相貌" },
  { zh: "福", full: "天福", meaningZh: "主獲福", meaningTh: "วาสนา/ความสุข", palaceZh: "財帛(福德/遷移)" },
  { zh: "耗", full: "天耗", meaningZh: "主破耗", meaningTh: "รั่วไหล/สึกหรอทรัพย์", palaceZh: "兄弟" },
  { zh: "蔭", full: "天蔭", meaningZh: "主廕庇", meaningTh: "ร่มเงาอุปถัมภ์/คู่ครองหนุน", palaceZh: "妻妾" },
  { zh: "貴", full: "天貴", meaningZh: "主嗣貴", meaningTh: "เกียรติ/ทายาทดี", palaceZh: "男女" },
  { zh: "刑", full: "天刑", meaningZh: "主犯刑", meaningTh: "โทษทัณฑ์/ขัดแย้งบริวาร", palaceZh: "奴僕" },
  { zh: "印", full: "天印", meaningZh: "主有印", meaningTh: "ตรา/อำนาจเอกสาร-ทรัพย์สินถาวร", palaceZh: "田宅" },
  { zh: "囚", full: "天囚", meaningZh: "主囚禁", meaningTh: "จองจำ/เจ็บป่วยเรื้อรัง", palaceZh: "疾厄" },
  { zh: "權", full: "天權", meaningZh: "主重權", meaningTh: "อำนาจสิทธิ์ขาด", palaceZh: "命宮" },
];

export type QizhengHuaYaoRole = {
  role: string;            // 祿/暗/福/耗/蔭/貴/刑/印/囚/權
  roleFull: string;        // 天祿 …
  meaningZh: string;       // 主享祿 …
  meaningTh: string;
  palaceZh: string;        // เรือนที่ดาวบทบาทนี้ "คุม" (管庫星)
  starKey: string;         // key ใน engine
  starZh: string;
  starTh: string;
  natalSignTh: string | null;
  natalHouse: number | null;   // เรือน 1-12 ในพื้นดวง (null ถ้าไม่มีเวลาเกิด)
  natalStatus: string | null;  // 廟旺/落陷 ฯลฯ จาก engine
  natalStatusRank: number | null;
  retro: boolean | null;
};

export type QizhengHuaYao = {
  yearStem: string;        // ก้านปีเกิด (年干 · ปีจันทรคติ noon-anchor)
  yearStemIndex: number;   // 甲=0 … 癸=9
  basis: string;
  source: string;
  roles: QizhengHuaYaoRole[];
};

/** ตาราง化曜ล้วน (pure): stemIndex 甲=0…癸=9 → 10 บทบาท → ดาว */
export function huaYaoForStem(stemIndex: number): { role: (typeof HUAYAO_ROLES)[number]; star: (typeof HUAYAO_STAR_SEQUENCE)[number] }[] {
  const s = ((stemIndex % 10) + 10) % 10;
  return HUAYAO_ROLES.map((role, i) => ({ role, star: HUAYAO_STAR_SEQUENCE[(s + i) % 10] }));
}

/** ก้านปีเกิด (年干) จากปีจันทรคติ · tyme4ts noon anchor (pattern เดียวกับ ziwei/overlay.ts xuSuiAt) */
export function yearStemIndexAt(dtUTC: Date, gmtOffsetHours: number): number {
  const ms = dtUTC.getTime() + gmtOffsetHours * 3_600_000;
  const d = new Date(ms);
  const st = SolarTime.fromYmdHms(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 12, 0, 0);
  return st.getLunarHour().getLunarDay().getLunarMonth().getLunarYear().getSixtyCycle().getHeavenStem().getIndex();
}

/**
 * สร้าง 化曜 ของดวง: บทบาท 10 ดวง + ตำแหน่ง/สถานะจริงจากพื้นดวง
 * @param n QizhengNatal (ผล engine เดิม · read-only)
 * @param dtUTC เวลาเกิด UTC
 * @param gmtOffsetHours เขตเวลา (default Math.round(lng/15) ฝั่งผู้เรียก)
 */
export function qizhengHuaYao(n: QizhengNatal, dtUTC: Date, gmtOffsetHours: number): QizhengHuaYao {
  const stemIndex = yearStemIndexAt(dtUTC, gmtOffsetHours);
  const r = n.reading;
  const ascSign = n.hasBirthTime ? r.ascendant.sign : null;
  const roles: QizhengHuaYaoRole[] = huaYaoForStem(stemIndex).map(({ role, star }) => {
    const natal = r.stars.find((s) => s.key === star.key) || null;
    return {
      role: role.zh,
      roleFull: role.full,
      meaningZh: role.meaningZh,
      meaningTh: role.meaningTh,
      palaceZh: role.palaceZh,
      starKey: star.key,
      starZh: star.zh,
      starTh: star.th,
      natalSignTh: natal?.signTh ?? null,
      natalHouse: natal && ascSign != null ? ((natal.sign - ascSign + 12) % 12) + 1 : null,
      natalStatus: natal?.status ?? null,
      natalStatusRank: natal?.statusRank ?? null,
      retro: natal?.retro ?? null,
    };
  });
  return {
    yearStem: HUAYAO_STEMS[stemIndex],
    yearStemIndex: stemIndex,
    basis: "年干(ปีจันทรคติ · tyme4ts noon anchor) · 訣: 祿暗福耗蔭貴刑印囚權 / 火孛木金土月水炁計羅 · star[(stem+role) mod 10]",
    source: "張果星宗二·變曜+天干化曜星例 (欽定古今圖書集成·藝術典·第568卷 · public domain)",
    roles,
  };
}
