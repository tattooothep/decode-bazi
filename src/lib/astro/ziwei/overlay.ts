/**
 * Ziwei OVERLAY · เฟส 3 ของ timeline engine — ชั้นซ้อนทับที่ audit พบว่าขาด
 *   1) อายุ (虛歲) ณ ปีเป้าหมาย → เลือก 大限 ปัจจุบัน
 *   2) 疊宮: ตาราง natal × 大限 × 流年 ต่อ ground เดียวกัน (relabel 12 宮)
 *   3) 自化: 宮干 ผลิต四化ตกใน宮ตัวเอง (自化祿/權/科/忌)
 *   4) 借星安星: 宮ว่าง主星 ยืมดาว對宮 (คำนวณจริง ไม่ใช่แค่ข้อความใบ้)
 *   5) 流昌/流曲 ตาม流年干 (ตาราง十干昌曲มาตรฐาน)
 * ทำงานบนผลของ ziweiChart (安星 LOCKED ผ่าน golden iztro) — ไม่แตะสูตรเดิม · deterministic ล้วน
 * หมายเหตุ: 流火/流鈴/流空/流劫 ต่างสำนัก ยังไม่ใส่จนกว่ามีคัมภีร์ยืนยัน (แจ้งใน coverageNote)
 */
import { SolarTime } from "tyme4ts";
import {
  PALACE_NAMES, SI_HUA, SI_HUA_TYPES, fix12, groundOf, groundToBranch,
  type PalaceName, type SiHuaType,
} from "./tables";
import type { ZiweiChart, ZiweiPalace } from "./engine";

/** ตาราง 流昌/流曲 ตามก้านปีจร (十干昌曲) */
const LIU_CHANG_BRANCH: Record<string, string> = { "甲": "巳", "乙": "午", "丙": "申", "丁": "酉", "戊": "申", "己": "酉", "庚": "亥", "辛": "子", "壬": "寅", "癸": "卯" };
const LIU_QU_BRANCH: Record<string, string> = { "甲": "酉", "乙": "申", "丙": "午", "丁": "巳", "戊": "午", "己": "巳", "庚": "卯", "辛": "寅", "壬": "子", "癸": "亥" };

export type ZiweiOverlay = {
  targetYear: number;
  age: {
    xuSui: number;                    // 虛歲 (ใช้เทียบช่วง大限ของ engine)
    basis: string;
  };
  currentDaXian: {
    natalPalaceName: PalaceName;      // 宮ไหนของดวงเดิมเป็น大限命宮ตอนนี้
    branch: string;
    ganzhi: string;
    ageStart: number;
    ageEnd: number;
  } | null;
  dieGong: {
    ground: number;
    branch: string;
    natalName: PalaceName;
    daXianName: PalaceName | null;    // null = ยังไม่เข้า大限
    liuNianName: PalaceName | null;   // null = ไม่มี流年
    majorStars: string[];
  }[];
  ziHua: { palaceName: PalaceName; branch: string; stem: string; star: string; type: SiHuaType }[];
  jieXing: { palaceName: PalaceName; branch: string; borrowedFromBranch: string; stars: string[] }[];
  liuChangQu: { star: "流昌" | "流曲"; palaceName: PalaceName; branch: string; source: string }[];
  coverageNote: string;
};

/** 虛歲 จากปีจันทรคติเกิด (noon anchor เดียวกับ engine) */
function xuSuiAt(dtUTC: Date, gmtOffsetHours: number, targetYear: number): number {
  const ms = dtUTC.getTime() + gmtOffsetHours * 3_600_000;
  const d = new Date(ms);
  const st = SolarTime.fromYmdHms(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 12, 0, 0);
  const birthLunarYear = st.getLunarHour().getLunarDay().getLunarMonth().getLunarYear().getYear();
  return targetYear - birthLunarYear + 1;
}

/** หา宮ที่ดาว (主星/輔星) ตกอยู่ */
function palaceOfStar(palaces: ZiweiPalace[], star: string): ZiweiPalace | null {
  for (const p of palaces) {
    if (p.majorStars.some((s) => s.name === star) || p.minorStars.some((s) => s.name === star)) return p;
  }
  return null;
}

/**
 * สร้าง overlay ปีเป้าหมายจากผังที่คำนวณแล้ว
 * @param chart   ผลจาก ziweiChart (ต้อง hasTime · ไม่งั้นคืน null)
 * @param dtUTC   เวลาเกิด UTC (ใช้หา虛歲ฐานจันทรคติ)
 * @param gmtOffsetHours เขตเวลาเดียวกับที่ส่งให้ engine
 * @param targetYear ปีเป้าหมาย (ค.ศ. · ควรตรงกับปีของ refDate ที่ใช้สร้าง流年)
 */
export function buildZiweiOverlay(chart: ZiweiChart, dtUTC: Date, gmtOffsetHours: number, targetYear: number): ZiweiOverlay | null {
  if (!chart.hasTime || !chart.palaces.length || !chart.mingGong) return null;
  const palaces = chart.palaces;
  const mingGround = chart.mingGong.ground;

  // ---- 1) 虛歲 + 大限ปัจจุบัน ----
  const xuSui = xuSuiAt(dtUTC, gmtOffsetHours, targetYear);
  const daxianPalace = palaces.find((p) => xuSui >= p.daXian.ageStart && xuSui <= p.daXian.ageEnd) ?? null;
  const currentDaXian = daxianPalace
    ? {
        natalPalaceName: daxianPalace.name,
        branch: daxianPalace.branch,
        ganzhi: daxianPalace.ganzhi,
        ageStart: daxianPalace.daXian.ageStart,
        ageEnd: daxianPalace.daXian.ageEnd,
      }
    : null;

  // ---- 2) 疊宮 (natal × 大限 × 流年) ----
  // ชื่อ宮ของชั้นใดๆ ต่อ ground g: nameIdx = fix12(ชั้นนั้นمี命ที่ ground ไหน − g) (ทิศเดียวกับ natal: 命→ทวนเข็ม)
  const liuNianGround = chart.liuNian ? groundOf(chart.liuNian.mingBranch) : null;
  const dieGong = palaces
    .slice()
    .sort((a, b) => a.ground - b.ground)
    .map((p) => ({
      ground: p.ground,
      branch: p.branch,
      natalName: p.name,
      daXianName: daxianPalace ? PALACE_NAMES[fix12(daxianPalace.ground - p.ground)] : null,
      liuNianName: liuNianGround != null ? PALACE_NAMES[fix12(liuNianGround - p.ground)] : null,
      majorStars: p.majorStars.map((s) => s.name),
    }));

  // ---- 3) 自化 (宮干ของแต่ละ宮เกิด化 แล้วดาวनั้นอยู่ใน宮เดิม) ----
  const ziHua: ZiweiOverlay["ziHua"] = [];
  for (const p of palaces) {
    const stars = SI_HUA[p.stem] || [];
    stars.forEach((star, i) => {
      const at = palaceOfStar(palaces, star);
      if (at && at.ground === p.ground) {
        ziHua.push({ palaceName: p.name, branch: p.branch, stem: p.stem, star, type: SI_HUA_TYPES[i] });
      }
    });
  }

  // ---- 4) 借星安星 (宮ว่าง主星 → ยืม對宮) ----
  const jieXing: ZiweiOverlay["jieXing"] = [];
  for (const p of palaces) {
    if (p.majorStars.length) continue;
    const opp = palaces.find((x) => x.ground === fix12(p.ground + 6));
    if (opp && opp.majorStars.length) {
      jieXing.push({
        palaceName: p.name,
        branch: p.branch,
        borrowedFromBranch: opp.branch,
        stars: opp.majorStars.map((s) => s.name),
      });
    }
  }

  // ---- 5) 流昌/流曲 ตาม流年干 ----
  const liuChangQu: ZiweiOverlay["liuChangQu"] = [];
  if (chart.liuNian) {
    const liuStem = chart.liuNian.ganzhi.slice(0, 1);
    const pairs: ["流昌" | "流曲", string][] = [
      ["流昌", LIU_CHANG_BRANCH[liuStem]],
      ["流曲", LIU_QU_BRANCH[liuStem]],
    ];
    for (const [star, branch] of pairs) {
      if (!branch) continue;
      const pal = palaces.find((x) => x.ground === groundOf(branch));
      if (pal) liuChangQu.push({ star, palaceName: pal.name, branch, source: "流年干(十干昌曲)" });
    }
  }

  return {
    targetYear,
    age: { xuSui, basis: "虛歲จากปีจันทรคติเกิด (targetYear − ปีจันทรคติเกิด + 1) · ใช้เทียบช่วง大限ของผัง" },
    currentDaXian,
    dieGong,
    ziHua,
    jieXing,
    liuChangQu,
    coverageNote: `overlay ปี ${targetYear}: 虛歲 ${xuSui} · 大限ปัจจุบัน ${currentDaXian ? `${currentDaXian.natalPalaceName}宮 ${currentDaXian.ganzhi} (อายุ ${currentDaXian.ageStart}-${currentDaXian.ageEnd})` : "ยังไม่เข้า大限แรก (童限)"} · 疊宮ครบ 12 ground · 自化 ${ziHua.length} จุด · 借星 ${jieXing.length} 宮 · 流昌流曲ตาม流年干 · หมายเหตุ: 流火/流鈴/流空/流劫 ยังไม่ใส่ (ตำราต่างสำนัก รอคัมภีร์ยืนยัน ห้ามเดา)`,
  };
}
