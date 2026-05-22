/**
 * Module Weights · กำหนดน้ำหนักของแต่ละศาสตร์ตามประเภทกิจกรรม
 * ==============================================================
 *
 * หลักการ:
 *   - ทุก activity type มี weights ต่างกัน
 *   - sum ของ weights ในแต่ละ activity = 1.0 (normalize ภายหลัง)
 *   - ถ้าลูกค้าติ๊กเพียงบางศาสตร์ · normalize เฉพาะที่ติ๊ก
 *
 * แหล่งที่มา:
 *   - ตำรา協紀辨方書 (พิธีกรรม)
 *   - 通書 (กิจกรรมทั่วไป)
 *   - ประสบการณ์ใช้งานจริง
 */

import type { ModuleKey, ActivityType } from "./types";

// =====================================================================
// WEIGHTS MATRIX · 7 activities × 11 modules
// =====================================================================

export type WeightsMatrix = Record<ActivityType, Record<ModuleKey, number>>;

export const MODULE_WEIGHTS: WeightsMatrix = {
  // ----------------------------------------------------------------
  // 立約 · เซ็นสัญญา / ทำเอกสารสำคัญ
  // ----------------------------------------------------------------
  // หลัก: 擇日 (วันเซ็น) + 八字 (DM ของผู้เซ็น)
  // รอง: 奇門 (ทิศ), 十官 (กิจกรรม)
  立約: {
    ze_ri:           0.20,
    ba_zi:           0.18,
    tai_sui:         0.12,
    qi_men:          0.12,
    twelve_officers: 0.10,
    yong_shen:       0.10,
    twenty_eight:    0.06,
    twelve_spirits:  0.05,
    nine_stars:      0.03,
    he_luo:          0.02,
    hex64:           0.02,
  },

  // ----------------------------------------------------------------
  // 出行 · เดินทาง
  // ----------------------------------------------------------------
  // หลัก: 奇門 (เน้นทิศ + ประตู)
  // รอง: 擇日, 28宿 (เรื่อง旅行)
  出行: {
    qi_men:          0.28,
    ze_ri:           0.18,
    twenty_eight:    0.12,
    ba_zi:           0.10,
    tai_sui:         0.10,
    twelve_spirits:  0.08,
    twelve_officers: 0.06,
    nine_stars:      0.04,
    yong_shen:       0.02,
    he_luo:          0.01,
    hex64:           0.01,
  },

  // ----------------------------------------------------------------
  // 動土 · ตอกเสาเข็ม / เริ่มก่อสร้าง
  // ----------------------------------------------------------------
  // หลัก: 擇日 + 太歲 + 奇門 · ระวังปะทะพื้นดิน/ทิศ
  動土: {
    ze_ri:           0.22,
    tai_sui:         0.16,
    qi_men:          0.14,
    ba_zi:           0.12,
    twelve_officers: 0.10,
    twenty_eight:    0.08,
    twelve_spirits:  0.06,
    nine_stars:      0.05,
    he_luo:          0.03,
    yong_shen:       0.03,
    hex64:           0.01,
  },

  // ----------------------------------------------------------------
  // 搬家 · ย้ายบ้าน
  // ----------------------------------------------------------------
  // หลัก: 9 飛星 (ทิศ + พลังบ้าน), 河洛
  搬家: {
    nine_stars:      0.22,
    he_luo:          0.18,
    ze_ri:           0.15,
    qi_men:          0.12,
    tai_sui:         0.10,
    ba_zi:           0.08,
    twelve_officers: 0.06,
    twenty_eight:    0.04,
    twelve_spirits:  0.03,
    yong_shen:       0.01,
    hex64:           0.01,
  },

  // ----------------------------------------------------------------
  // 開市 · เปิดกิจการ
  // ----------------------------------------------------------------
  // ครอบคลุมที่สุด · ทุกศาสตร์มีน้ำหนัก
  開市: {
    ze_ri:           0.18,
    ba_zi:           0.15,
    qi_men:          0.15,
    yong_shen:       0.12,
    nine_stars:      0.10,
    tai_sui:         0.08,
    twelve_officers: 0.08,
    twenty_eight:    0.05,
    he_luo:          0.04,
    twelve_spirits:  0.03,
    hex64:           0.02,
  },

  // ----------------------------------------------------------------
  // 婚姻 · แต่งงาน
  // ----------------------------------------------------------------
  // หลัก: 擇日, 八字 (compatibility 2 คน), 神煞 (天德/月德)
  婚姻: {
    ze_ri:           0.22,
    ba_zi:           0.20,
    twelve_spirits:  0.15,
    tai_sui:         0.10,
    twelve_officers: 0.08,
    twenty_eight:    0.08,
    qi_men:          0.06,
    yong_shen:       0.05,
    nine_stars:      0.03,
    he_luo:          0.02,
    hex64:           0.01,
  },

  // ----------------------------------------------------------------
  // 求財 · หาเงิน / ลงทุน
  // ----------------------------------------------------------------
  // หลัก: 八字 + 用神 (ดูทรัพย์ของ DM)
  求財: {
    ba_zi:           0.22,
    yong_shen:       0.20,
    qi_men:          0.15,
    ze_ri:           0.12,
    tai_sui:         0.10,
    nine_stars:      0.08,
    twelve_officers: 0.05,
    hex64:           0.04,
    twenty_eight:    0.02,
    twelve_spirits:  0.01,
    he_luo:          0.01,
  },

  // ----------------------------------------------------------------
  // 祭祀 · พิธีกรรม / ไหว้
  // ----------------------------------------------------------------
  // หลัก: 神煞 (天德/月德/天恩), 28宿
  祭祀: {
    twelve_spirits:  0.22,
    twenty_eight:    0.18,
    ze_ri:           0.15,
    tai_sui:         0.10,
    twelve_officers: 0.08,
    qi_men:          0.08,
    ba_zi:           0.06,
    he_luo:          0.05,
    nine_stars:      0.04,
    yong_shen:       0.02,
    hex64:           0.02,
  },
};

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Get weights สำหรับ activity ที่ filter เฉพาะ activeModules
 * และ normalize ให้รวม = 1.0
 */
export function getNormalizedWeights(
  activityType: ActivityType,
  activeModules: ModuleKey[]
): Record<ModuleKey, number> {
  const baseWeights = MODULE_WEIGHTS[activityType];
  if (!baseWeights) {
    throw new Error(`Unknown activity: ${activityType}`);
  }

  // Filter เฉพาะ active
  const filtered: Record<string, number> = {};
  let total = 0;
  for (const mod of activeModules) {
    const w = baseWeights[mod] ?? 0;
    filtered[mod] = w;
    total += w;
  }

  // Normalize
  if (total === 0) {
    // ไม่มี module ที่ตรง · กระจายเท่ากัน
    const equal = 1.0 / activeModules.length;
    for (const mod of activeModules) {
      filtered[mod] = equal;
    }
  } else {
    for (const mod of Object.keys(filtered)) {
      filtered[mod] = filtered[mod] / total;
    }
  }

  return filtered as Record<ModuleKey, number>;
}

/**
 * Validate · sum weights ต้อง = 1.0 (±0.01)
 */
export function validateWeights(): { activity: ActivityType; sum: number }[] {
  const results: { activity: ActivityType; sum: number }[] = [];
  for (const [activity, weights] of Object.entries(MODULE_WEIGHTS)) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    results.push({ activity: activity as ActivityType, sum });
  }
  return results;
}
