/**
 * 擇日 (Ze Ri / Tong Shu) Module
 * ===============================
 * ตัวอย่าง implementation ของ LuckModule interface
 *
 * Logic:
 *   1. ตรวจ官庫 (good days)
 *   2. ตรวจ 7 殺 / 沖刑害破
 *   3. ตรวจ 神煞 (deities)
 *   4. รวม score · return ModuleResult
 *
 * Data dependencies:
 *   - 06_qimen/01_tooltips.json (神煞 lookup)
 *   - 05_dizhi12/01_twelve_branches.json (sanhe/liuhe)
 */

import type {
  LuckModule,
  ModuleInput,
  ModuleResult,
  ModuleKey,
  EarthlyBranch,
  Reason
} from "../types";
import { evaluateMonthDaySha } from "../../luopan/month-day-sha";

// =====================================================================
// Branch relationships
// =====================================================================

const CLASH: Record<EarthlyBranch, EarthlyBranch> = {
  "子":"午","丑":"未","寅":"申","卯":"酉","辰":"戌","巳":"亥",
  "午":"子","未":"丑","申":"寅","酉":"卯","戌":"辰","亥":"巳"
};

const LIUHE: Record<EarthlyBranch, EarthlyBranch> = {
  "子":"丑","丑":"子","寅":"亥","亥":"寅","卯":"戌","戌":"卯",
  "辰":"酉","酉":"辰","巳":"申","申":"巳","午":"未","未":"午"
};

// 三合 groups
const SANHE_GROUPS: EarthlyBranch[][] = [
  ["申","子","辰"],   // water
  ["寅","午","戌"],   // fire
  ["巳","酉","丑"],   // metal
  ["亥","卯","未"]    // wood
];

// 神煞 lists (จาก協紀辨方書) · ค่าบางเดือนเป็น 干 บางเดือนเป็น 支 → ใช้ string permissive
const TIAN_DE_BY_MONTH: Record<EarthlyBranch, string> = {
  "寅":"丁","卯":"申","辰":"壬","巳":"辛","午":"亥","未":"甲",
  "申":"癸","酉":"寅","戌":"丙","亥":"乙","子":"巳","丑":"庚"
};

const YUE_DE_BY_MONTH: Record<EarthlyBranch, string> = {
  "寅":"丙","卯":"甲","辰":"壬","巳":"庚","午":"丙","未":"甲",
  "申":"壬","酉":"庚","戌":"丙","亥":"甲","子":"壬","丑":"庚"
};

// =====================================================================
// Module Implementation
// =====================================================================

export const zeRiModule: LuckModule = {
  key: "ze_ri" as ModuleKey,

  label: {
    thai: "擇日 (เลือกฤกษ์)",
    zh: "擇日",
    en: "Tong Shu / Auspicious Day"
  },

  isHeavy: false,
  isPersonal: false,

  async compute(input: ModuleInput): Promise<ModuleResult> {
    const { slot } = input;
    const dayBranch = slot.pillars.day.branch;
    const hourBranch = slot.pillars.hour.branch;
    const monthBranch = slot.pillars.month.branch;
    const yearBranch = slot.pillars.year.branch;

    let rawScore = 50;
    const tags: string[] = [];
    const reasonsUp: Reason[] = [];
    const reasonsDown: Reason[] = [];
    const reasonsWarning: Reason[] = [];
    const caps: NonNullable<ModuleResult["caps"]> = [];
    let pass = true;

    // ---------------------------------------------------------------
    // CHECK 1: 沖太歲 (clash with year branch)
    // ---------------------------------------------------------------
    if (CLASH[dayBranch] === yearBranch) {
      rawScore -= 25;
      pass = false;
      tags.push("clash_taisui");
      reasonsWarning.push({
        code: "CLASH_TAISUI",
        thai: `วันชง太歲 (${dayBranch} ปะทะ ${yearBranch})`,
        zh: `日沖太歲`,
        delta: -25,
        severity: "critical",
        source: "ze_ri"
      });
    }

    // ---------------------------------------------------------------
    // CHECK 2: 日沖時 (day-hour clash)
    // ---------------------------------------------------------------
    if (CLASH[dayBranch] === hourBranch) {
      rawScore -= 15;
      tags.push("day_hour_clash");
      reasonsDown.push({
        code: "DAY_HOUR_CLASH",
        thai: `วัน-ยามปะทะ (${dayBranch} ${hourBranch})`,
        delta: -15,
        severity: "warning",
        source: "ze_ri"
      });
    }

    // ---------------------------------------------------------------
    // CHECK 3: 六合 (six harmonies between day-hour)
    // ---------------------------------------------------------------
    if (LIUHE[dayBranch] === hourBranch) {
      rawScore += 12;
      tags.push("liuhe_day_hour");
      reasonsUp.push({
        code: "LIUHE_DAY_HOUR",
        thai: `วัน-ยาม合 (${dayBranch}+${hourBranch})`,
        delta: 12,
        severity: "info",
        source: "ze_ri"
      });
    }

    // ---------------------------------------------------------------
    // CHECK 4: 三合 (triple harmonies)
    // ---------------------------------------------------------------
    for (const group of SANHE_GROUPS) {
      const dayInGroup = group.includes(dayBranch);
      const hourInGroup = group.includes(hourBranch);
      const monthInGroup = group.includes(monthBranch);
      const matchCount = [dayInGroup, hourInGroup, monthInGroup].filter(Boolean).length;
      if (matchCount >= 2) {
        rawScore += 15;
        tags.push(`sanhe_${group[0]}`);
        reasonsUp.push({
          code: "SANHE",
          thai: `วัน三合 (${group.join("")})`,
          delta: 15,
          severity: "info",
          source: "ze_ri"
        });
        break;
      }
    }

    // ---------------------------------------------------------------
    // CHECK 5: 天德 (sky virtue)
    // ---------------------------------------------------------------
    const tianDeStem = TIAN_DE_BY_MONTH[monthBranch];
    // 天德 เดือน寅巳申亥辰戌丑未=ก้าน · เดือน卯午酉子=กิ่ง(申亥寅巳) → ต้องเทียบทั้ง day.stem+day.branch
    if (tianDeStem && (slot.pillars.day.stem === tianDeStem || slot.pillars.day.branch === tianDeStem)) {
      rawScore += 18;
      tags.push("tian_de");
      reasonsUp.push({
        code: "TIAN_DE",
        thai: "天德 (สวรรค์อนุเคราะห์)",
        delta: 18,
        severity: "info",
        source: "ze_ri"
      });
    }

    // ---------------------------------------------------------------
    // CHECK 6: 月德 (month virtue)
    // ---------------------------------------------------------------
    const yueDeStem = YUE_DE_BY_MONTH[monthBranch];
    if (yueDeStem && slot.pillars.day.stem === yueDeStem) {
      rawScore += 12;
      tags.push("yue_de");
      reasonsUp.push({
        code: "YUE_DE",
        thai: "月德 (เดือนอนุเคราะห์)",
        delta: 12,
        severity: "info",
        source: "ze_ri"
      });
    }

    // ---------------------------------------------------------------
    // CHECK 7: 月煞/日煞 (month/day sha) · ไทยนำ จีนรอง
    // ---------------------------------------------------------------
    const monthDaySha = evaluateMonthDaySha({
      monthBranch,
      dayBranch,
      activityType: input.activityType,
      targetDirection: input.targetDirection || null
    });
    rawScore += monthDaySha.delta;
    if (!monthDaySha.pass) pass = false;
    tags.push(...monthDaySha.tags);
    reasonsUp.push(...monthDaySha.reasons.up);
    reasonsDown.push(...monthDaySha.reasons.down);
    reasonsWarning.push(...monthDaySha.reasons.warning);
    caps.push(...(monthDaySha.caps || []));

    // ---------------------------------------------------------------
    // Activity-specific checks
    // ---------------------------------------------------------------
    if (input.activityType === "立約") {
      // เซ็นสัญญา · ระวัง破/危
      if (tags.includes("officer_破") || tags.includes("officer_危")) {
        rawScore -= 10;
        reasonsWarning.push({
          code: "CONTRACT_BAD_DAY",
          thai: "ไม่เหมาะเซ็นสัญญาใน破/危วัน",
          delta: -10,
          source: "ze_ri"
        });
      }
    }

    if (input.activityType === "婚姻") {
      // แต่งงาน · ดี ถ้ามี天德 + 月德 พร้อมกัน
      if (tags.includes("tian_de") && tags.includes("yue_de")) {
        rawScore += 10;
        reasonsUp.push({
          code: "MARRIAGE_BLESSED",
          thai: "天月德ซ้อน · มงคลแต่งงาน",
          delta: 10,
          source: "ze_ri"
        });
      }
    }

    // ---------------------------------------------------------------
    // Build result
    // ---------------------------------------------------------------
    const normalized = Math.max(0, Math.min(100, rawScore));

    return {
      module: "ze_ri",
      status: "ready",
      score: {
        raw: rawScore,
        normalized,
        weight: 1.0
      },
      pass,
      tags,
      reasons: {
        up: reasonsUp,
        down: reasonsDown,
        warning: reasonsWarning
      },
      caps,
      confidence: 0.95,
      raw: {
        dayBranch,
        hourBranch,
        monthBranch,
        monthDaySha: monthDaySha.raw,
        checks: {
          clashTaisui: CLASH[dayBranch] === yearBranch,
          dayHourClash: CLASH[dayBranch] === hourBranch,
          liuhe: LIUHE[dayBranch] === hourBranch,
          tianDe: tianDeStem === slot.pillars.day.stem || tianDeStem === slot.pillars.day.branch,
          yueDe: yueDeStem === slot.pillars.day.stem
        }
      }
    };
  }
};
