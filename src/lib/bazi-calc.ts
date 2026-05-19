/**
 * bazi-calc.ts · Layer 0 wrapper
 * Single source of truth for "birth → BaZi pillars + analysis"
 * ALL endpoints must use this · ห้ามคำนวณเอง
 */

import { applyTST, type TstOutput } from "./tyme-tst";

/* 19 พ.ค. Option α (Codex round 4 fix) · discriminated input
 * 4p path · time required (เดิม · backward compat)
 * 3p path · time optional (ห้ามบังคับ dummy time · "honest null") */
interface BirthInputBase {
  date: string;            // "YYYY-MM-DD"
  longitude?: number;      // default 100.5018 (Bangkok)
  latitude?: number;       // unused for now
  gmtOffsetHours?: number; // default +7
  gender?: "M" | "F";
  applyTrueSolarTime?: boolean; // default true
  dayBoundary?: "23:00" | "00:00";
}
export interface BirthInput4p extends BirthInputBase {
  time: string;              // "HH:MM" · required
  birthTimeKnown?: true;     // default · 4-pillar mode
}
export interface BirthInput3p extends BirthInputBase {
  time?: string;             // optional · ignored when present
  birthTimeKnown: false;     // explicit false · 3-pillar mode
}
/* Backward compat alias · existing caller (no birthTimeKnown) ใช้ 4p path */
export type BirthInput = BirthInput4p | BirthInput3p;

export type Pillar = { stem: string; branch: string };

/* 19 พ.ค. Option α (Codex-approved) · discriminated union แทน Pillar|null
 * 4-pillar: hour is Pillar (เดิม · backward compat)
 * 3-pillar: hour is null + metadata uncertainty flags
 * Consumer ต้อง narrow ด้วย `if (analysis.mode === "4p")` หรือ `if (analysis.birthTimeKnown)` */
export type BaziPillars4p = {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: Pillar;
};
export type BaziPillars3p = {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: null;
};
/* Backward-compat alias · existing consumer ไม่ break · default = 4p
 * Code ที่ต้องรับทั้ง 4p+3p ให้ใช้ BaziPillarsAny หรือ narrow ผ่าน BaziAnalysis */
export type BaziPillars = BaziPillars4p;
export type BaziPillarsAny = BaziPillars4p | BaziPillars3p;

interface BaziAnalysisCore {
  dayMaster: string;
  geJu: { structure: string | null; basis?: string; confidence?: string };
  strength: { percent: number; level: string };
  yongshen: { stem: string; element: string; finalScore: number; reason: string[] }[];
  climate: string | null;
  lunar: string;
}

export interface BaziAnalysis4p extends BaziAnalysisCore {
  pillars: BaziPillars4p;
  pillarsZh: { year: string; month: string; day: string; hour: string };
  tst: TstOutput;
  source: "tst" | "local";
  mode: "4p";
  birthTimeKnown: true;
}

export interface BaziAnalysis3p extends BaziAnalysisCore {
  pillars: BaziPillars3p;
  pillarsZh: { year: string; month: string; day: string; hour: null };
  tst: null;
  source: "no-hour";
  mode: "3p";
  birthTimeKnown: false;
  /* 19 พ.ค. Codex Q3 + รอบ 4 · metadata · UI ตัดสินใจ render warning */
  dateAnchor: "civil-noon";              /* คำนวณ DM จาก noon ของวันที่ user ระบุ */
  ignoredDayBoundary: boolean;           /* true เสมอ · เพราะไม่มีเวลา · dayBoundary ใช้ไม่ได้ */
  /* Phase 5 split: แยก uncertainty ออกเป็น 2 มิติ · backward compat ผ่าน dayPillarUncertain (OR) */
  dayBoundaryUncertain: boolean;         /* 3p: true เสมอ · ไม่รู้ว่าก่อน/หลัง 23:00 zi-shi · day pillar อาจคลาด ±1 */
  monthPillarUncertainNearJieqi: boolean;/* 3p: true ถ้า noon วันเกิดอยู่ภายใน ±24h ของ jieqi · month pillar อาจคลาด */
  dayPillarUncertain: boolean;           /* legacy alias = dayBoundaryUncertain || monthPillarUncertainNearJieqi */
}

export type BaziAnalysis = BaziAnalysis4p | BaziAnalysis3p;

/**
 * Compute full BaZi chart from birth input.
 * 19 พ.ค. Option α (Codex-approved overload):
 *   - Default · birthTimeKnown=undefined|true → BaziAnalysis4p (เดิม · backward compat)
 *   - birthTimeKnown:false → BaziAnalysis3p (no-hour mode)
 * Caller เก่าไม่ต้องเปลี่ยน type narrowing · เพราะ overload narrow ให้แล้ว
 */
export async function calcBazi(input: BirthInput3p): Promise<BaziAnalysis3p>;
export async function calcBazi(input: BirthInput4p): Promise<BaziAnalysis4p>;
export async function calcBazi(input: BirthInput): Promise<BaziAnalysis>;
export async function calcBazi(input: BirthInput): Promise<BaziAnalysis> {
  const tyme = await import("tyme4ts");
  // Dynamic require for CJS wrappers (.js)
  // Use eval-style import to avoid Next.js trace bundling issues if needed
  const w3 = await import("../../data/library/wrappers/3-ge-ju.js");
  const w6 = await import("../../data/library/wrappers/6-strength-yongshen.js");

  const [yy, mm, dd] = input.date.split("-").map(Number);
  const longitude = input.longitude ?? 100.5018;
  const gmtOffset = input.gmtOffsetHours ?? 7;
  const useTst = input.applyTrueSolarTime !== false; // default true
  /* 19 พ.ค. Option α · birthTimeKnown default true (backward compat) */
  const birthTimeKnown = input.birthTimeKnown !== false;

  /* 19 พ.ค. Option α · 3-pillar mode (no hour) · honest null · no fallback */
  if (!birthTimeKnown) {
    /* Compute year/month/day pillars using a stable noon anchor for date math only.
     * Noon is used purely to lookup which Chinese day this falls on.
     * We DO NOT expose noon as the "hour pillar" — it is discarded. */
    const stNoon = tyme.SolarTime.fromYmdHms(yy, mm, dd, 12, 0, 0);
    const ecNoon = stNoon.getLunarHour().getEightChar();
    const ypN = ecNoon.getYear().getName();
    const mpN = ecNoon.getMonth().getName();
    const dpN = ecNoon.getDay().getName();
    const pillars3: BaziPillars3p = {
      year:  { stem: ypN[0], branch: ypN[1] },
      month: { stem: mpN[0], branch: mpN[1] },
      day:   { stem: dpN[0], branch: dpN[1] },
      hour:  null,
    };
    /* Wrappers run on 3 pillars · wrapper-3/5/6/7/follow filter hour=null ผ่าน activePositions */
    const ge3 = w3.inferGeJu(pillars3);
    const yong3 = w6.bridgeYongshen(pillars3);
    /* Phase 5 · uncertainty split:
     *   dayBoundaryUncertain = true เสมอ (ไม่รู้เวลา → ไม่รู้ว่าก่อน/หลัง 23:00 zi-shi → day อาจ ±1)
     *   monthPillarUncertainNearJieqi = noon ของวันเกิดอยู่ภายใน ±24h ของ jieqi moment
     *   dayPillarUncertain (legacy alias) = OR ของ 2 ตัวข้างต้น */
    const dayBoundaryUncertain = true;
    let monthPillarUncertainNearJieqi = false;
    try {
      const term = stNoon.getSolarDay().getTerm();
      if (term) {
        const termSt = term.getJulianDay().getSolarTime();
        const termY = termSt.getYear();
        const termM = termSt.getMonth();
        const termD = termSt.getDay();
        const termH = termSt.getHour();
        const termMin = termSt.getMinute();
        const noonMs = Date.UTC(yy, mm - 1, dd, 12, 0, 0);
        const termMs = Date.UTC(termY, termM - 1, termD, termH, termMin, 0);
        const diffHours = Math.abs(noonMs - termMs) / 3_600_000;
        if (diffHours <= 24) monthPillarUncertainNearJieqi = true;
      }
    } catch { /* ignore · default false */ }
    const dayPillarUncertain = dayBoundaryUncertain || monthPillarUncertainNearJieqi;
    return {
      pillars: pillars3,
      pillarsZh: { year: ypN, month: mpN, day: dpN, hour: null },
      dayMaster: pillars3.day.stem,
      geJu: { structure: ge3.structure, basis: ge3.basis, confidence: ge3.confidence },
      strength: { percent: yong3.strength.percent, level: yong3.strength.level },
      yongshen: yong3.yongshenFinal,
      climate: yong3.climate?.climate || null,
      tst: null,
      source: "no-hour",
      lunar: stNoon.getLunarHour().getLunarDay().toString(),
      mode: "3p",
      birthTimeKnown: false,
      dateAnchor: "civil-noon",
      ignoredDayBoundary: true,
      dayBoundaryUncertain,
      monthPillarUncertainNearJieqi,
      dayPillarUncertain,
    };
  }

  const [hh, mn] = input.time.split(":").map(Number);

  let tst: TstOutput;
  let solarHour: number;
  let solarMinute: number;
  let solarYy = yy, solarMm = mm, solarDd = dd;
  if (useTst) {
    tst = applyTST({ year: yy, month: mm, day: dd, hour: hh, minute: mn, longitude, gmtOffsetHours: gmtOffset });
    solarHour = tst.appliedHour;
    solarMinute = tst.appliedMinute;
    // apply dayShift (Zi Shi cross-midnight · ให้ tyme4ts apply Zi Shi rule ถูกต้อง)
    if (tst.appliedDayShift !== 0) {
      const shifted = new Date(Date.UTC(yy, mm - 1, dd + tst.appliedDayShift, 12, 0, 0));
      solarYy = shifted.getUTCFullYear();
      solarMm = shifted.getUTCMonth() + 1;
      solarDd = shifted.getUTCDate();
    }
  } else {
    tst = {
      appliedHour: hh, appliedMinute: mn, appliedDayShift: 0,
      longitudeShiftMin: 0, eotMin: 0, totalShiftMin: 0,
      appliedTimeStr: `${String(hh).padStart(2,"0")}:${String(mn).padStart(2,"0")}`,
      meta: { standardMeridian: gmtOffset * 15, longitude, gmtOffsetHours: gmtOffset },
    };
    solarHour = hh;
    solarMinute = mn;
  }

  /* Day boundary handling · default 23:00 (classical 早子時) · "00:00" = Voytek-style */
  const dayBoundary = input.dayBoundary || "23:00";

  /* Call tyme4ts normally (handles 23:00 hour boundary for hour pillar consistently) */
  const st = tyme.SolarTime.fromYmdHms(solarYy, solarMm, solarDd, solarHour, solarMinute, 0);
  const lh = st.getLunarHour();
  const ec = lh.getEightChar();

  const yp = ec.getYear().getName();
  const mpc = ec.getMonth().getName();
  let dp = ec.getDay().getName();
  const hp = ec.getHour().getName();

  /* For 00:00 boundary at 23:xx: DAY belongs to CURRENT day (not next).
   * Hour pillar stays as tyme4ts default (Voytek split convention). */
  if (dayBoundary === "00:00" && solarHour === 23) {
    const stDay = tyme.SolarTime.fromYmdHms(solarYy, solarMm, solarDd, 22, 59, 0);
    dp = stDay.getLunarHour().getEightChar().getDay().getName();
  }

  const pillars: BaziPillars = {
    year:  { stem: yp[0], branch: yp[1] },
    month: { stem: mpc[0], branch: mpc[1] },
    day:   { stem: dp[0], branch: dp[1] },
    hour:  { stem: hp[0], branch: hp[1] },
  };

  // Run wrappers · ใช้ pillar ที่ TST แล้ว
  const ge = w3.inferGeJu(pillars);
  const yong = w6.bridgeYongshen(pillars);

  return {
    pillars,
    pillarsZh: { year: yp, month: mpc, day: dp, hour: hp },
    dayMaster: pillars.day.stem,
    geJu: { structure: ge.structure, basis: ge.basis, confidence: ge.confidence },
    strength: { percent: yong.strength.percent, level: yong.strength.level },
    yongshen: yong.yongshenFinal,
    climate: yong.climate?.climate || null,
    tst,
    source: useTst ? "tst" : "local",
    lunar: lh.getLunarDay().toString(),
    /* 19 พ.ค. Option α · 4-pillar mode (เดิม) · backward compat */
    mode: "4p",
    birthTimeKnown: true,
  };
}

/**
 * Quick helper: ให้ tyme.SolarTime ที่ apply TST แล้ว
 * สำหรับ caller ที่ต้องการเรียก method เพิ่มเอง (ChildLimit, DecadeFortune, etc.)
 * 19 พ.ค. Option α · helper นี้ต้องการเวลาเสมอ · accept เฉพาะ BirthInput4p
 * 3p ไม่ควรเรียก helper นี้ (ไม่มี solar time ให้ apply)
 */
export async function getSolarTimeAtTST(input: BirthInput4p) {
  const tyme = await import("tyme4ts");
  const [yy, mm, dd] = input.date.split("-").map(Number);
  const [hh, mn] = input.time.split(":").map(Number);
  const longitude = input.longitude ?? 100.5018;
  const tst = applyTST({
    year: yy, month: mm, day: dd, hour: hh, minute: mn,
    longitude, gmtOffsetHours: input.gmtOffsetHours ?? 7,
  });
  let solarYy = yy, solarMm = mm, solarDd = dd;
  if (tst.appliedDayShift !== 0) {
    const shifted = new Date(Date.UTC(yy, mm - 1, dd + tst.appliedDayShift, 12, 0, 0));
    solarYy = shifted.getUTCFullYear();
    solarMm = shifted.getUTCMonth() + 1;
    solarDd = shifted.getUTCDate();
  }
  return {
    st: tyme.SolarTime.fromYmdHms(solarYy, solarMm, solarDd, tst.appliedHour, tst.appliedMinute, 0),
    tst,
  };
}
