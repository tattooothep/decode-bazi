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
// WEIGHTS MATRIX · 9 activities (r413a: +求醫) × 20 modules
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
    tian_xing:       0.12,
    dong_gong:       0,     // r367 · ตงกงไม่เข้า weighted average (ตัดผ่าน caps + boost route-side)
    moon_void:       0,     // r372 · ทำงานผ่าน caps ล้วน (จันทร์ว่าง cap 45)
    retro_window:    0,     // r372 · ทำงานผ่าน caps ล้วน (ดาวถอย cap 40-50)
    eclipse_zone:    0,     // r372 · ทำงานผ่าน caps ล้วน (คราส cap 35/55)
    rahu_kalam:      0,     // r372 · ทำงานผ่าน caps ล้วน (ราหูกาล cap 50)
    moon_sign:       0.02,  // r372 · soft scorer เบา ๆ (±6 ผ่าน weighted average · ไม่มี cap)
    panchanga:       0.03,  // r374 · ปัญจางค์ 5 องค์ · ตัดหลักผ่าน caps (45-60) + soft +5 ผ่าน average เบา ๆ
    tara_bala:       0.02,  // r374 · ตาราพละ (personal) · ตัดหลักผ่าน cap 50 + soft +4 เบา ๆ · ไม่มีโปรไฟล์ = missing = ไม่กระทบ
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
    tian_xing:       0.12,
    dong_gong:       0,     // r367 · ตงกงไม่เข้า weighted average (ตัดผ่าน caps + boost route-side)
    moon_void:       0,     // r372 · ทำงานผ่าน caps ล้วน (จันทร์ว่าง cap 45)
    retro_window:    0,     // r372 · ทำงานผ่าน caps ล้วน (ดาวถอย cap 40-50)
    eclipse_zone:    0,     // r372 · ทำงานผ่าน caps ล้วน (คราส cap 35/55)
    rahu_kalam:      0,     // r372 · ทำงานผ่าน caps ล้วน (ราหูกาล cap 50)
    moon_sign:       0.02,  // r372 · soft scorer เบา ๆ (±6 ผ่าน weighted average · ไม่มี cap)
    panchanga:       0.03,  // r374 · ปัญจางค์ 5 องค์ · ตัดหลักผ่าน caps (45-60) + soft +5 ผ่าน average เบา ๆ
    tara_bala:       0.02,  // r374 · ตาราพละ (personal) · ตัดหลักผ่าน cap 50 + soft +4 เบา ๆ · ไม่มีโปรไฟล์ = missing = ไม่กระทบ
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
    tian_xing:       0.12,
    dong_gong:       0,     // r367 · ตงกงไม่เข้า weighted average (ตัดผ่าน caps + boost route-side)
    moon_void:       0,     // r372 · ทำงานผ่าน caps ล้วน (จันทร์ว่าง cap 45)
    retro_window:    0,     // r372 · ทำงานผ่าน caps ล้วน (ดาวถอย cap 40-50)
    eclipse_zone:    0,     // r372 · ทำงานผ่าน caps ล้วน (คราส cap 35/55)
    rahu_kalam:      0,     // r372 · ทำงานผ่าน caps ล้วน (ราหูกาล cap 50)
    moon_sign:       0.02,  // r372 · soft scorer เบา ๆ (±6 ผ่าน weighted average · ไม่มี cap)
    panchanga:       0.03,  // r374 · ปัญจางค์ 5 องค์ · ตัดหลักผ่าน caps (45-60) + soft +5 ผ่าน average เบา ๆ
    tara_bala:       0.02,  // r374 · ตาราพละ (personal) · ตัดหลักผ่าน cap 50 + soft +4 เบา ๆ · ไม่มีโปรไฟล์ = missing = ไม่กระทบ
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
    tian_xing:       0.12,
    dong_gong:       0,     // r367 · ตงกงไม่เข้า weighted average (ตัดผ่าน caps + boost route-side)
    moon_void:       0,     // r372 · ทำงานผ่าน caps ล้วน (จันทร์ว่าง cap 45)
    retro_window:    0,     // r372 · ทำงานผ่าน caps ล้วน (ดาวถอย cap 40-50)
    eclipse_zone:    0,     // r372 · ทำงานผ่าน caps ล้วน (คราส cap 35/55)
    rahu_kalam:      0,     // r372 · ทำงานผ่าน caps ล้วน (ราหูกาล cap 50)
    moon_sign:       0.02,  // r372 · soft scorer เบา ๆ (±6 ผ่าน weighted average · ไม่มี cap)
    panchanga:       0.03,  // r374 · ปัญจางค์ 5 องค์ · ตัดหลักผ่าน caps (45-60) + soft +5 ผ่าน average เบา ๆ
    tara_bala:       0.02,  // r374 · ตาราพละ (personal) · ตัดหลักผ่าน cap 50 + soft +4 เบา ๆ · ไม่มีโปรไฟล์ = missing = ไม่กระทบ
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
    tian_xing:       0.12,
    dong_gong:       0,     // r367 · ตงกงไม่เข้า weighted average (ตัดผ่าน caps + boost route-side)
    moon_void:       0,     // r372 · ทำงานผ่าน caps ล้วน (จันทร์ว่าง cap 45)
    retro_window:    0,     // r372 · ทำงานผ่าน caps ล้วน (ดาวถอย cap 40-50)
    eclipse_zone:    0,     // r372 · ทำงานผ่าน caps ล้วน (คราส cap 35/55)
    rahu_kalam:      0,     // r372 · ทำงานผ่าน caps ล้วน (ราหูกาล cap 50)
    moon_sign:       0.02,  // r372 · soft scorer เบา ๆ (±6 ผ่าน weighted average · ไม่มี cap)
    panchanga:       0.03,  // r374 · ปัญจางค์ 5 องค์ · ตัดหลักผ่าน caps (45-60) + soft +5 ผ่าน average เบา ๆ
    tara_bala:       0.02,  // r374 · ตาราพละ (personal) · ตัดหลักผ่าน cap 50 + soft +4 เบา ๆ · ไม่มีโปรไฟล์ = missing = ไม่กระทบ
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
    tian_xing:       0.12,
    dong_gong:       0,     // r367 · ตงกงไม่เข้า weighted average (ตัดผ่าน caps + boost route-side)
    moon_void:       0,     // r372 · ทำงานผ่าน caps ล้วน (จันทร์ว่าง cap 45)
    retro_window:    0,     // r372 · ทำงานผ่าน caps ล้วน (ดาวถอย cap 40-50)
    eclipse_zone:    0,     // r372 · ทำงานผ่าน caps ล้วน (คราส cap 35/55)
    rahu_kalam:      0,     // r372 · ทำงานผ่าน caps ล้วน (ราหูกาล cap 50)
    moon_sign:       0.02,  // r372 · soft scorer เบา ๆ (±6 ผ่าน weighted average · ไม่มี cap)
    panchanga:       0.03,  // r374 · ปัญจางค์ 5 องค์ · ตัดหลักผ่าน caps (45-60) + soft +5 ผ่าน average เบา ๆ
    tara_bala:       0.02,  // r374 · ตาราพละ (personal) · ตัดหลักผ่าน cap 50 + soft +4 เบา ๆ · ไม่มีโปรไฟล์ = missing = ไม่กระทบ
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
    tian_xing:       0.12,
    dong_gong:       0,     // r367 · ตงกงไม่เข้า weighted average (ตัดผ่าน caps + boost route-side)
    moon_void:       0,     // r372 · ทำงานผ่าน caps ล้วน (จันทร์ว่าง cap 45)
    retro_window:    0,     // r372 · ทำงานผ่าน caps ล้วน (ดาวถอย cap 40-50)
    eclipse_zone:    0,     // r372 · ทำงานผ่าน caps ล้วน (คราส cap 35/55)
    rahu_kalam:      0,     // r372 · ทำงานผ่าน caps ล้วน (ราหูกาล cap 50)
    moon_sign:       0.02,  // r372 · soft scorer เบา ๆ (±6 ผ่าน weighted average · ไม่มี cap)
    panchanga:       0.03,  // r374 · ปัญจางค์ 5 องค์ · ตัดหลักผ่าน caps (45-60) + soft +5 ผ่าน average เบา ๆ
    tara_bala:       0.02,  // r374 · ตาราพละ (personal) · ตัดหลักผ่าน cap 50 + soft +4 เบา ๆ · ไม่มีโปรไฟล์ = missing = ไม่กระทบ
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
    tian_xing:       0.12,
    dong_gong:       0,     // r367 · ตงกงไม่เข้า weighted average (ตัดผ่าน caps + boost route-side)
    moon_void:       0,     // r372 · ทำงานผ่าน caps ล้วน (จันทร์ว่าง cap 45)
    retro_window:    0,     // r372 · ทำงานผ่าน caps ล้วน (ดาวถอย cap 40-50)
    eclipse_zone:    0,     // r372 · ทำงานผ่าน caps ล้วน (คราส cap 35/55)
    rahu_kalam:      0,     // r372 · ทำงานผ่าน caps ล้วน (ราหูกาล cap 50)
    moon_sign:       0.02,  // r372 · soft scorer เบา ๆ (±6 ผ่าน weighted average · ไม่มี cap)
    panchanga:       0.03,  // r374 · ปัญจางค์ 5 องค์ · ตัดหลักผ่าน caps (45-60) + soft +5 ผ่าน average เบา ๆ
    tara_bala:       0.02,  // r374 · ตาราพละ (personal) · ตัดหลักผ่าน cap 50 + soft +4 เบา ๆ · ไม่มีโปรไฟล์ = missing = ไม่กระทบ
  },

  // ----------------------------------------------------------------
  // 求醫 · การแพทย์ (พบแพทย์/รักษา/ผ่าตัด) — r413a
  // ----------------------------------------------------------------
  // เดิม medical_visit/surgery ถูก map เป็น 祭祀 (ไหว้เจ้า) → ตัดสินด้วยเกณฑ์พิธีกรรม
  // โครงลอกจาก 祭祀 แล้วปรับ: 擇日 นำ (通書 建除 滿日 มีธง 治病/服藥 · ze-ri เป็นแกนวันดี-ร้าย)
  // + 八字/用神 สูงขึ้น (ร่างกายเจ้าชะตา · วันปะทะ DM ไม่ควรผ่าตัด) + 太歲 คงสูง (ห้ามชงวันผ่าตัด)
  // + 神煞/28宿 ลดลงจากระดับพิธีกรรม (ไม่ใช่งานไหว้) · ตงกงยัง "นำ" ในทางตัดฤกษ์ผ่าน caps/boost
  // (dong_gong weight = 0 ตาม convention เดิมทุกกิจกรรม — ทำงานผ่าน caps ไม่เข้า weighted average)
  求醫: {
    ze_ri:           0.22,
    ba_zi:           0.16,
    tai_sui:         0.12,
    twelve_officers: 0.10,
    twelve_spirits:  0.10,
    yong_shen:       0.08,
    twenty_eight:    0.08,
    qi_men:          0.08,
    nine_stars:      0.03,
    he_luo:          0.02,
    hex64:           0.01,
    tian_xing:       0.12,
    dong_gong:       0,     // convention r367 · ตงกงไม่เข้า weighted average (ตัดผ่าน caps + boost route-side)
    moon_void:       0,     // convention r372 · ทำงานผ่าน caps ล้วน (จันทร์ว่าง cap 45)
    retro_window:    0,     // convention r372 · ทำงานผ่าน caps ล้วน (ดาวถอย cap 40-50)
    eclipse_zone:    0,     // convention r372 · ทำงานผ่าน caps ล้วน (คราส cap 35/55)
    rahu_kalam:      0,     // convention r372 · ทำงานผ่าน caps ล้วน (ราหูกาล cap 50)
    moon_sign:       0.02,  // convention r372 · soft scorer เบา ๆ (求醫 = แถว conservative · ดู moon-sign.ts)
    panchanga:       0.03,  // convention r374 · ตัดหลักผ่าน caps (45-60) + soft +5 เบา ๆ
    tara_bala:       0.02,  // convention r374 · ตัดหลักผ่าน cap 50 + soft +4 เบา ๆ
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
