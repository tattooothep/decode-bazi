/**
 * ป้ายเห็นพ้องข้ามศาสตร์ (cross-science agreement badge) — r374 phase-3
 * =====================================================================
 * นับสัญญาณจาก ModuleResult ที่แนบใน candidate ต่อ "สาย" 4 กลุ่ม
 * (map module→กลุ่ม ชุดเดียวกับหมวด UI r372 · SCIENCE_GROUP_DEFS ใน datepick.html):
 *   ① basic    พื้นฐานปฏิทินจีน   ② sky      ท้องฟ้าจริง
 *   ③ personal เฉพาะดวงคุณ        ④ advanced ชั้นสูง (ฉีเหมิน/เหอหลัว)
 *
 * กติกา (deterministic ล้วน · ไม่มี AI · engine คำนวณ → AI แค่ตีความ · กฎข้อ 9):
 *   สัญญาณบวกของ module = reasons.up ที่ delta > 0 (info delta 0 เช่น BAZI_NEUTRAL ไม่นับ)
 *   สัญญาณลบของ module  = reasons.down ทุกตัว (สาย cap มัก delta 0 เพราะตัดผ่าน caps —
 *                          ก็เป็นสัญญาณลบจริง จึงนับ) · warnings ไม่นับ (เป็นข้อควรระวัง)
 *   กลุ่ม "หนุน" = up > down · กลุ่ม "ค้าน" = down > up · เท่ากันและมีสัญญาณ = ผสม (ไม่นับฝั่งไหน)
 *   groups = จำนวนกลุ่มที่มีสัญญาณจริงอย่างน้อย 1 (module status ready เท่านั้น)
 *
 * ใช้ใน /api/auspicious: แนบ additive field `agreement` ต่อ candidate
 * "เฉพาะเมื่อ module phase-3 เปิด" — ปิด = candidates byte-identical เดิม
 * (regression test-datepick-sky-r372 เทียบ byte ต่อ baseline ต้องผ่านต่อ)
 */
import type { ModuleKey, ModuleResult } from "./types";

export type AgreementGroupKey = "basic" | "sky" | "personal" | "advanced";

/** module → กลุ่ม · ชุดเดียวกับ SCIENCE_GROUP_DEFS (r372 UI) + module ใหม่ r374 */
export const AGREEMENT_GROUPS: { key: AgreementGroupKey; modules: ModuleKey[] }[] = [
  { key: "basic", modules: ["ze_ri", "dong_gong", "twelve_officers", "twenty_eight", "twelve_spirits", "nine_stars", "tai_sui"] },
  { key: "sky", modules: ["tian_xing", "moon_void", "moon_sign", "retro_window", "eclipse_zone", "rahu_kalam", "panchanga"] },
  { key: "personal", modules: ["ba_zi", "yong_shen", "hex64", "tara_bala"] },
  { key: "advanced", modules: ["qi_men", "he_luo"] },
];

export type AgreementGroupSignal = { key: AgreementGroupKey; up: number; down: number };

export type Agreement = {
  /** จำนวนกลุ่มที่มีสัญญาณจริง (up+down > 0) */
  groups: number;
  /** กลุ่มที่หนุนสุทธิ (up > down) */
  positive: number;
  /** กลุ่มที่ค้านสุทธิ (down > up) */
  negative: number;
  /** รายละเอียดต่อกลุ่ม (เฉพาะกลุ่มที่มีสัญญาณ · ให้ UI วาด detail ได้) */
  perGroup: AgreementGroupSignal[];
};

/** นับสัญญาณเห็นพ้อง/ขัดแย้งข้ามสายจาก modules ที่แนบใน candidate */
export function computeAgreement(c: { modules?: Partial<Record<ModuleKey, ModuleResult>> }): Agreement {
  const modules = (c?.modules || {}) as Partial<Record<ModuleKey, ModuleResult>>;
  const perGroup: AgreementGroupSignal[] = [];
  let positive = 0;
  let negative = 0;

  for (const g of AGREEMENT_GROUPS) {
    let up = 0;
    let down = 0;
    for (const key of g.modules) {
      const mr = modules[key];
      if (!mr || mr.status !== "ready") continue;
      up += (mr.reasons?.up || []).filter((r) => Number(r?.delta || 0) > 0).length;
      down += (mr.reasons?.down || []).length;
    }
    if (up + down === 0) continue; // กลุ่มไม่มีสัญญาณ = ไม่นับ
    perGroup.push({ key: g.key, up, down });
    if (up > down) positive++;
    else if (down > up) negative++;
  }

  return { groups: perGroup.length, positive, negative, perGroup };
}
