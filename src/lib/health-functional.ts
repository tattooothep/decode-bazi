/**
 * health-functional.ts · 19 พ.ค. 2026
 *
 * Recompute Health mapping ใช้ **Functional Strength** จาก wrapper-7 rootedness
 * แทน Raw element_counts (ที่ buildHealthMapping ใน chart-extensions.ts ใช้)
 *
 * เหตุ: ตำราอากง — "ดูพลังจริงของธาตุ" ไม่ใช่แค่ "นับ"
 * Aeaw (假從財格): Raw น้ำ 41% · Functional น้ำ 61.5% (strong_root)
 * → Health card ต้องเตือน "ไต/กระเพาะปัสสาวะ" จริง · ไม่ใช่ราย raw count
 *
 * รับ rootedness object จาก wrapper-7 `_details.rootedness`
 */

const TCM_ORGAN: Record<string, { yin_zh: string; yang_zh: string; yin_th: string; yang_th: string; system_zh: string; system_th: string }> = {
  wood:  { yin_zh: "肝",   yang_zh: "膽",   yin_th: "ตับ",          yang_th: "ถุงน้ำดี",     system_zh: "筋·眼",   system_th: "เอ็น·ตา" },
  fire:  { yin_zh: "心",   yang_zh: "小腸", yin_th: "หัวใจ",       yang_th: "ลำไส้เล็ก",  system_zh: "血·舌",   system_th: "เลือด·ลิ้น" },
  earth: { yin_zh: "脾",   yang_zh: "胃",   yin_th: "ม้าม",        yang_th: "กระเพาะ",   system_zh: "肉·口",   system_th: "กล้ามเนื้อ·ปาก" },
  metal: { yin_zh: "肺",   yang_zh: "大腸", yin_th: "ปอด",         yang_th: "ลำไส้ใหญ่", system_zh: "皮·鼻",   system_th: "ผิวหนัง·จมูก" },
  water: { yin_zh: "腎",   yang_zh: "膀胱", yin_th: "ไต",          yang_th: "กระเพาะปัสสาวะ", system_zh: "骨·耳", system_th: "กระดูก·หู" },
};

const ELEMENT_TH: Record<string, string> = { wood:"ไม้", fire:"ไฟ", earth:"ดิน", metal:"ทอง", water:"น้ำ" };
const STEM_ELEMENT: Record<string, string> = {
  甲:"wood", 乙:"wood", 丙:"fire", 丁:"fire", 戊:"earth",
  己:"earth", 庚:"metal", 辛:"metal", 壬:"water", 癸:"water",
};
const ELEMENT_CONTROLS: Record<string, string> = {
  wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood",
};

export interface RootednessItem {
  total_score: number;
  rootedness_label: string;
  /* Phase 17b · semantic split 通根 vs 透干 · optional · backward compat */
  stem_visibility_score?: number;
  effective_score?: number;
}
export type RootednessMap = Record<string, RootednessItem>;

export interface FunctionalHealth {
  dm_element: string;
  dm_organs_th: string;
  dm_organs_zh: string;
  weak_organs: Array<{ element: string; organs_th: string; organs_zh: string; reason_th: string; functional_pct: number }>;
  caution_organs: Array<{ element: string; organs_th: string; organs_zh: string; reason_th: string; functional_pct: number }>;
  summary_th: string;
  source: "functional-wrapper7";
}

/**
 * คำนวณ Health Mapping จาก Functional Strength (rootedness)
 * @param dmStem · day master stem (甲乙丙丁戊己庚辛壬癸)
 * @param rootedness · จาก wrapper-7 synth._details.rootedness
 * @param strengthPct · DM strength % (0..100) เพื่อสรุปภาพรวม
 */
import type { ElementDistributionResult } from "./element-distribution-functional";

export function buildHealthFunctional(
  dmStem: string,
  rootedness: RootednessMap,
  strengthPct: number,
  distribution?: ElementDistributionResult,
): FunctionalHealth {
  const dmEl = STEM_ELEMENT[dmStem] || "earth";
  const ELS = ["wood", "fire", "earth", "metal", "water"];

  /* Phase 17g · 3-layer precedence:
   * 1. distribution.dist (Plan C v6) → prefer
   * 2. rootedness.effective_score (Phase 17b)
   * 3. rootedness.total_score (root only) */
  let total = 0;
  const score: Record<string, number> = {};
  if (distribution) {
    for (const el of ELS) {
      const v = Math.max(0, distribution.dist[el as keyof typeof distribution.dist] ?? 0);
      score[el] = v;
      total += v;
    }
  } else {
    for (const el of ELS) {
      const r = rootedness[el];
      const v = Math.max(0, r?.effective_score ?? r?.total_score ?? 0);
      score[el] = v;
      total += v;
    }
  }
  if (total === 0) total = 1;

  /* threshold เดิม: weak < avg×0.4 · caution > avg×1.7
   * จาก buildHealthMapping ใน chart-extensions.ts:642
   * ใช้ % เดียวกัน · เปลี่ยนแค่ input source */
  const avg = total / 5;
  const weak: FunctionalHealth["weak_organs"] = [];
  const caution: FunctionalHealth["caution_organs"] = [];

  for (const el of ELS) {
    const v = score[el];
    const pct = Math.round((v / total) * 1000) / 10;
    const organ = TCM_ORGAN[el];
    if (!organ) continue;

    if (v < avg * 0.4) {
      weak.push({
        element: el,
        organs_th: `${organ.yin_th}·${organ.yang_th} (${organ.system_th})`,
        organs_zh: `${organ.yin_zh}·${organ.yang_zh}·${organ.system_zh}`,
        reason_th: `ธาตุ${ELEMENT_TH[el]}อ่อน (Functional ${pct}%) · ${rootedness[el]?.rootedness_label || "no_root"} · ดูแลอวัยวะนี้`,
        functional_pct: pct,
      });
    } else if (v > avg * 1.7) {
      caution.push({
        element: el,
        organs_th: `${organ.yin_th}·${organ.yang_th}`,
        organs_zh: `${organ.yin_zh}·${organ.yang_zh}`,
        reason_th: `ธาตุ${ELEMENT_TH[el]}หนักเกิน (Functional ${pct}%) · ${rootedness[el]?.rootedness_label || "strong_root"} · ระวัง${organ.yin_th}-${organ.yang_th}ทำงานหนัก`,
        functional_pct: pct,
      });
    }
  }

  const dmOrgan = TCM_ORGAN[dmEl];
  const dmCtrlEl = ELEMENT_CONTROLS[dmEl];
  const dmCtrlOrgan = TCM_ORGAN[dmCtrlEl];

  const summary_th =
    strengthPct < 35
      ? `วันเจ้าธาตุ${ELEMENT_TH[dmEl]}อ่อน (Functional) · ${dmOrgan.yin_th}/${dmOrgan.yang_th}อาจเปราะ · ดูแล${dmOrgan.system_th}`
      : strengthPct > 65
      ? `วันเจ้าธาตุ${ELEMENT_TH[dmEl]}แกร่ง (Functional) · ${dmOrgan.yin_th}/${dmOrgan.yang_th}แข็งแรง · ระวัง${dmCtrlOrgan?.yin_th || ""}ที่ถูกควบคุม`
      : `วันเจ้าธาตุ${ELEMENT_TH[dmEl]}สมดุล (Functional) · ดูแล${dmOrgan.yin_th}·${dmOrgan.yang_th}เป็นพื้นฐาน`;

  return {
    dm_element: dmEl,
    dm_organs_th: `${dmOrgan.yin_th}·${dmOrgan.yang_th}`,
    dm_organs_zh: `${dmOrgan.yin_zh}·${dmOrgan.yang_zh}`,
    weak_organs: weak,
    caution_organs: caution,
    summary_th,
    source: "functional-wrapper7",
  };
}
