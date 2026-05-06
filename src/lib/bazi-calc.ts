/**
 * bazi-calc.ts · Layer 0 wrapper
 * Single source of truth for "birth → BaZi pillars + analysis"
 * ALL endpoints must use this · ห้ามคำนวณเอง
 */

import { applyTST, type TstOutput } from "./tyme-tst";

export type BirthInput = {
  date: string;          // "YYYY-MM-DD"
  time: string;          // "HH:MM"
  longitude?: number;    // default 100.5018 (Bangkok)
  latitude?: number;     // unused for now (future: place-based)
  gmtOffsetHours?: number; // default +7
  gender?: "M" | "F";
  applyTrueSolarTime?: boolean; // default true · set false to use raw local clock
};

export type Pillar = { stem: string; branch: string };

export type BaziPillars = {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: Pillar;
};

export type BaziAnalysis = {
  pillars: BaziPillars;
  pillarsZh: { year: string; month: string; day: string; hour: string };
  dayMaster: string;
  geJu: { structure: string | null; basis?: string; confidence?: string };
  strength: { percent: number; level: string };
  yongshen: { stem: string; element: string; finalScore: number; reason: string[] }[];
  climate: string | null;
  tst: TstOutput;
  source: "tst" | "local";
  // raw lunar string for display
  lunar: string;
};

/**
 * Compute full BaZi chart from birth input.
 * Always applies TST unless explicitly disabled.
 */
export async function calcBazi(input: BirthInput): Promise<BaziAnalysis> {
  const tyme = await import("tyme4ts");
  // Dynamic require for CJS wrappers (.js)
  // Use eval-style import to avoid Next.js trace bundling issues if needed
  const w3 = await import("../../data/library/wrappers/3-ge-ju.js");
  const w6 = await import("../../data/library/wrappers/6-strength-yongshen.js");

  const [yy, mm, dd] = input.date.split("-").map(Number);
  const [hh, mn] = input.time.split(":").map(Number);
  const longitude = input.longitude ?? 100.5018;
  const gmtOffset = input.gmtOffsetHours ?? 7;
  const useTst = input.applyTrueSolarTime !== false; // default true

  let tst: TstOutput;
  let solarHour: number;
  let solarMinute: number;
  if (useTst) {
    tst = applyTST({ year: yy, month: mm, day: dd, hour: hh, minute: mn, longitude, gmtOffsetHours: gmtOffset });
    solarHour = tst.appliedHour;
    solarMinute = tst.appliedMinute;
  } else {
    tst = {
      appliedHour: hh, appliedMinute: mn,
      longitudeShiftMin: 0, eotMin: 0, totalShiftMin: 0,
      appliedTimeStr: `${String(hh).padStart(2,"0")}:${String(mn).padStart(2,"0")}`,
      meta: { standardMeridian: gmtOffset * 15, longitude, gmtOffsetHours: gmtOffset },
    };
    solarHour = hh;
    solarMinute = mn;
  }

  const st = tyme.SolarTime.fromYmdHms(yy, mm, dd, solarHour, solarMinute, 0);
  const lh = st.getLunarHour();
  const ec = lh.getEightChar();

  const yp = ec.getYear().getName();
  const mpc = ec.getMonth().getName();
  const dp = ec.getDay().getName();
  const hp = ec.getHour().getName();

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
  };
}

/**
 * Quick helper: ให้ tyme.SolarTime ที่ apply TST แล้ว
 * สำหรับ caller ที่ต้องการเรียก method เพิ่มเอง (ChildLimit, DecadeFortune, etc.)
 */
export async function getSolarTimeAtTST(input: BirthInput) {
  const tyme = await import("tyme4ts");
  const [yy, mm, dd] = input.date.split("-").map(Number);
  const [hh, mn] = input.time.split(":").map(Number);
  const longitude = input.longitude ?? 100.5018;
  const tst = applyTST({
    year: yy, month: mm, day: dd, hour: hh, minute: mn,
    longitude, gmtOffsetHours: input.gmtOffsetHours ?? 7,
  });
  return {
    st: tyme.SolarTime.fromYmdHms(yy, mm, dd, tst.appliedHour, tst.appliedMinute, 0),
    tst,
  };
}
