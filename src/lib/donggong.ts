/**
 * 董公擇日 (Dong Gong Date Selection) · 29 มิ.ย. 2026
 * ชั้นพื้นบ้าน สาย 建除黃黑道 — ตำรา 董公選要覽 (NLC scan tier-1)
 * lookup: (月建·建除位·日干支) → ดี/ร้าย + 宜/忌 + 神煞 (干支เฉพาะชนะ base)
 * ✅ display-only · pure function · ไม่แตะ score/modules/ranking ของศาสตร์อื่น (เติมของ)
 */
import { DG_DAY, DG_EXC } from "@/lib/donggong-data";

const MONTH_IDX: Record<string, number> = {
  寅: 1, 卯: 2, 辰: 3, 巳: 4, 午: 5, 未: 6, 申: 7, 酉: 8, 戌: 9, 亥: 10, 子: 11, 丑: 12,
};

export type DGLevel = "top" | "good" | "neutral" | "bad";
export type DongGong = {
  monthIdx: number;
  jianchu: string;            // 建除位
  verdict: string;            // ผลสุทธิ (干支 override base ถ้ามี)
  base: string;               // ผลตำแหน่งดิบ
  fromException: boolean;     // ผลมาจาก干支เฉพาะ
  level: DGLevel;
  shensha: string[];          // ดาวประจำวัน (จีน)
  yi: string[];               // 宜
  ji: string[];               // 忌
  note: string;
  missing: boolean;           // ต้นฉบับไม่ได้ถอดตำแหน่งนี้
  th: string; en: string; zh: string;   // label สั้น 3 ภาษา
};

const TOP = new Set(["上吉", "全吉", "大吉"]);
const GOOD = new Set(["吉", "次吉"]);
const BAD = new Set(["凶", "大凶", "不利"]);
function levelOf(v: string): DGLevel {
  if (TOP.has(v)) return "top";
  if (GOOD.has(v)) return "good";
  if (BAD.has(v)) return "bad";
  return "neutral";
}

const JC_TH: Record<string, string> = { 建: "ก่อตั้ง", 除: "กำจัด", 滿: "เต็ม", 平: "ราบ", 定: "มั่นคง", 執: "ยึดกุม", 破: "ทลาย", 危: "เสี่ยง", 成: "สำเร็จ", 收: "เก็บเกี่ยว", 開: "เปิด", 閉: "ปิด" };
const JC_EN: Record<string, string> = { 建: "Establish", 除: "Remove", 滿: "Full", 平: "Balance", 定: "Stable", 執: "Initiate", 破: "Destruction", 危: "Danger", 成: "Success", 收: "Harvest", 開: "Open", 閉: "Close" };
const V_TH: Record<string, string> = { "上吉": "ดีเยี่ยม", "全吉": "ดีล้วน", "大吉": "ดีมาก", "吉": "ดี", "次吉": "ดีรอง", "凶": "ร้าย", "大凶": "ร้ายมาก", "不利": "ไม่ดี", "—": "ขึ้นกับวัน" };
const V_EN: Record<string, string> = { "上吉": "Excellent", "全吉": "All-auspicious", "大吉": "Very good", "吉": "Good", "次吉": "Fairly good", "凶": "Inauspicious", "大凶": "Very bad", "不利": "Unfavorable", "—": "Depends on day" };

/** lookup 董公 จากกิ่งเดือน(月建) + กิ่งวัน(日支) + 干支วัน */
export function dongGong(monthBranch: string, dayBranch: string, dayGanzhi: string): DongGong | null {
  const monthIdx = MONTH_IDX[monthBranch];
  if (!monthIdx || !dayBranch) return null;
  const d = DG_DAY[`${monthIdx}|${dayBranch}`];
  if (!d) return null;
  const e = dayGanzhi ? DG_EXC[`${monthIdx}|${dayGanzhi}`] : undefined;
  const base = d.verdict || "—";
  const verdict = (e && e.verdict) ? e.verdict : base;
  const note = (e && e.note) ? e.note : d.note;
  const level = levelOf(verdict);
  const jcTh = JC_TH[d.pos] || d.pos;
  const jcEn = JC_EN[d.pos] || d.pos;
  return {
    monthIdx, jianchu: d.pos, verdict, base, fromException: !!(e && e.verdict),
    level, shensha: d.shensha, yi: d.yi, ji: d.ji, note, missing: d.missing,
    th: `${V_TH[verdict] || verdict} · ${d.pos}${jcTh}`,
    en: `${V_EN[verdict] || verdict} · ${d.pos} ${jcEn}`,
    zh: `${verdict} · ${d.pos}日`,
  };
}
