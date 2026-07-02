/**
 * Vedic TIMING_TIMELINE · ชั้นจังหวะเวลาปีเป้าหมาย (เฟส 2 ของ timeline engine)
 * เติมชั้นที่ audit พบว่าขาด: antardasha/pratyantar ทั้งปี · gochara ingress (sidereal) ·
 * sade sati พร้อมวันเฟส · varshaphala (สุริยคติ sidereal return) + Muntha · ashtakavarga transit scoring
 * deterministic ทั้งหมด — ทศา = เลขคณิตสัดส่วน Vimshottari ล้วน · ingress = scan+bisection (astro-core/events)
 * วันที่ทุกจุดรายงานเป็นเวลาไทย (Asia/Bangkok)
 */
import { findIngresses, findReturnInstant, type EventBodyKey } from "../../astro-core/events";
import { computeBodies, norm360 } from "../../astro-core/ephemeris";
import { lahiriAyanamsa, toSidereal } from "../../astro-core/ayanamsa";
import { decimalYear, type VedicChart } from "./engine";
import { DASHA_YEARS, GRAHA_TH, LORD_CYCLE, RASHI_TH, VIMSHOTTARI_TOTAL, type GrahaKey } from "./tables";

const DAY_MS = 86400000;
const BKK_MS = 7 * 3600 * 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

function bkkDateISO(d: Date): string {
  return new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);
}
/** decimal year → Date (ผกผันของ decimalYear ใน engine) */
function dateFromDecimalYear(y: number): Date {
  const yr = Math.floor(y);
  const start = Date.UTC(yr, 0, 1);
  const end = Date.UTC(yr + 1, 0, 1);
  return new Date(start + (y - yr) * (end - start));
}

export type VedicDashaRow = {
  maha: GrahaKey; mahaTh: string;
  antar: GrahaKey; antarTh: string;
  pratyantar: GrahaKey; pratyantarTh: string;
  fromISO: string; toISO: string;       // clip กับปีเป้าหมาย · เวลาไทย
};

export type VedicTransitSegment = {
  graha: GrahaKey; grahaTh: string;
  fromISO: string; toISO: string;
  rashi: number; rashiTh: string;
  houseFromMoon: number;
  houseFromLagna: number | null;
  bavBindus: number | null;             // bindu ของ graha นั้นในราศีที่จรเหยียบ (ashtakavarga transit scoring)
  sarvaBindus: number;                  // SAV ของราศีนั้น
  retroAtIngress: boolean | null;       // null = อยู่ราศีนี้มาตั้งแต่ต้นปี
};

export type VedicTimeline = {
  targetYear: number;
  timezone: "Asia/Bangkok";
  method: "vimshottari_arithmetic + sidereal_scan_bisection(lahiri_midyear)";
  dashaTimeline: VedicDashaRow[];       // ปรัตยันตรทศาทุกช่วงที่คาบเกี่ยวปีเป้าหมาย (มี maha/antar กำกับ)
  transitSegments: VedicTransitSegment[]; // Saturn/Jupiter/Rahu/Ketu/Mars รายช่วงราศีตลอดปี + bindu
  sadeSati: {
    natalMoonRashi: number; natalMoonRashiTh: string;
    activeAnyTimeInYear: boolean;
    phases: { phase: "rising_12th" | "peak_1st" | "setting_2nd"; phaseTh: string; fromISO: string; toISO: string }[];
  };
  varshaphala: {
    instantISO: string; dateISO: string;
    uncertainNoBirthTime: boolean;
    munthaRashi: number | null; munthaRashiTh: string | null;
    grahas: { name: GrahaKey; nameTh: string; rashi: number; rashiTh: string; rashiDeg: number; retro: boolean }[];
  } | null;
  coverageNote: string;
};

/** ทศา 3 ชั้น (maha→antar→pratyantar) ทุกช่วงที่คาบเกี่ยว [yStart,yEnd) · เลขคณิตล้วน สอดคล้อง engine เดิม */
function buildDashaTimeline(chart: VedicChart, yStart: number, yEnd: number): VedicDashaRow[] {
  const rows: VedicDashaRow[] = [];
  for (const m of chart.vimshottari.mahadasha) {
    if (m.endYear <= yStart || m.startYear >= yEnd) continue;
    // ฐานอันตรทศา = มหาทศา "เต็ม" (ทศาแรกเป็นเศษ → จุดเริ่มเต็มถอยหลังจาก endYear)
    const fullLen = DASHA_YEARS[m.lord];
    const fullStartYear = m.endYear - fullLen;
    const idxM = LORD_CYCLE.indexOf(m.lord);
    let aY = fullStartYear;
    for (let j = 0; j < 9; j++) {
      const antarLord = LORD_CYCLE[(idxM + j) % 9];
      const aLen = (fullLen * DASHA_YEARS[antarLord]) / VIMSHOTTARI_TOTAL;
      const aStart = aY, aEnd = aY + aLen;
      aY = aEnd;
      if (aEnd <= yStart || aStart >= yEnd || aEnd <= m.startYear) continue;
      const idxA = LORD_CYCLE.indexOf(antarLord);
      let pY = aStart;
      for (let k = 0; k < 9; k++) {
        const pLord = LORD_CYCLE[(idxA + k) % 9];
        const pLen = (aLen * DASHA_YEARS[pLord]) / VIMSHOTTARI_TOTAL;
        const pStart = pY, pEnd = pY + pLen;
        pY = pEnd;
        if (pEnd <= yStart || pStart >= yEnd || pEnd <= m.startYear) continue;
        rows.push({
          maha: m.lord, mahaTh: GRAHA_TH[m.lord],
          antar: antarLord, antarTh: GRAHA_TH[antarLord],
          pratyantar: pLord, pratyantarTh: GRAHA_TH[pLord],
          fromISO: bkkDateISO(dateFromDecimalYear(Math.max(pStart, yStart, m.startYear))),
          toISO: bkkDateISO(dateFromDecimalYear(Math.min(pEnd, yEnd))),
        });
      }
    }
  }
  return rows.sort((a, b) => a.fromISO.localeCompare(b.fromISO));
}

/** สร้าง TIMING_TIMELINE พระเวทของปีเป้าหมาย */
export function buildVedicTimeline(chart: VedicChart, targetYear: number): VedicTimeline {
  const from = new Date(Date.UTC(targetYear, 0, 1) - BKK_MS);
  const to = new Date(Date.UTC(targetYear + 1, 0, 1) - BKK_MS - 1000);
  const yStart = decimalYear(from), yEnd = decimalYear(to);
  const midYear = new Date(Date.UTC(targetYear, 6, 1));
  const ayanMid = lahiriAyanamsa(midYear);

  // ---- 1) ทศา 3 ชั้นตลอดปี ----
  const dashaTimeline = buildDashaTimeline(chart, yStart, yEnd);

  // ---- 2) gochara ingress (sidereal Lahiri) + segment รายราศี + ashtakavarga transit scoring ----
  const moonRashi = Math.floor(((chart.grahas.find((g) => g.name === "Moon")?.sidLon ?? 0) % 360) / 30);
  const lagnaRashi = chart.lagna ? chart.lagna.rashi : null;
  const bavOf = (graha: GrahaKey, rashi: number): number | null => {
    const p = chart.ashtakavarga.planets.find((x) => x.graha === graha);
    return p ? p.bindusByRashi[rashi] : null;
  };
  const transitSegments: VedicTransitSegment[] = [];
  const satPhases: { rashi: number; fromISO: string; toISO: string }[] = [];
  for (const body of ["Saturn", "Jupiter", "Rahu", "Ketu", "Mars"] as EventBodyKey[]) {
    const ing = findIngresses(body, from, to, ayanMid);
    // ราศีต้นปี (ก่อน ingress แรก)
    const startSid = norm360(toSidereal(
      // bodyLon ผ่าน findIngresses ใช้ offset กลางปี · จุด "สถานะต้นปี" ใช้ toSidereal ตรง (ayanamsa ณ วันนั้น)
      // ค่าต่างกัน < 0.02° ไม่กระทบราศี ยกเว้นเฉียดขอบ ซึ่ง ingress list จะสะท้อนเอง
      (computeBodies(from, { modern: false, node: true }).find((b) => b.key === body)?.lon ?? 0), from));
    let curRashi = Math.floor(startSid / 30);
    let curFrom = from;
    let curRetroAtIngress: boolean | null = null;
    const pushSeg = (rashi: number, f: Date, t: Date, retroAtIngress: boolean | null) => {
      const seg: VedicTransitSegment = {
        graha: body as GrahaKey, grahaTh: GRAHA_TH[body as GrahaKey],
        fromISO: bkkDateISO(f), toISO: bkkDateISO(t),
        rashi, rashiTh: RASHI_TH[rashi],
        houseFromMoon: ((rashi - moonRashi + 12) % 12) + 1,
        houseFromLagna: lagnaRashi != null ? ((rashi - lagnaRashi + 12) % 12) + 1 : null,
        bavBindus: bavOf(body as GrahaKey, rashi),
        sarvaBindus: chart.ashtakavarga.sarvaByRashi[rashi],
        retroAtIngress,
      };
      transitSegments.push(seg);
      if (body === "Saturn") satPhases.push({ rashi, fromISO: seg.fromISO, toISO: seg.toISO });
    };
    for (const e of ing) {
      pushSeg(curRashi, curFrom, e.date, curRetroAtIngress);
      curRashi = e.toSign; curFrom = e.date; curRetroAtIngress = e.retro;
    }
    pushSeg(curRashi, curFrom, to, curRetroAtIngress);
  }
  transitSegments.sort((a, b) => a.graha.localeCompare(b.graha) || a.fromISO.localeCompare(b.fromISO));

  // ---- 3) sade sati (เสาร์เรือน 12/1/2 จากจันทร์กำเนิด) ----
  const phaseOf = (rashi: number): "rising_12th" | "peak_1st" | "setting_2nd" | null => {
    const h = ((rashi - moonRashi + 12) % 12) + 1;
    return h === 12 ? "rising_12th" : h === 1 ? "peak_1st" : h === 2 ? "setting_2nd" : null;
  };
  const PHASE_TH: Record<string, string> = {
    rising_12th: "ช่วงขึ้น (เสาร์เรือน 12 จากจันทร์)",
    peak_1st: "ช่วงพีค (เสาร์ทับราศีจันทร์)",
    setting_2nd: "ช่วงคลาย (เสาร์เรือน 2 จากจันทร์)",
  };
  const phases = satPhases
    .map((s) => ({ p: phaseOf(s.rashi), fromISO: s.fromISO, toISO: s.toISO }))
    .filter((x): x is { p: "rising_12th" | "peak_1st" | "setting_2nd"; fromISO: string; toISO: string } => !!x.p)
    .map((x) => ({ phase: x.p, phaseTh: PHASE_TH[x.p], fromISO: x.fromISO, toISO: x.toISO }));

  // ---- 4) varshaphala (สุริยะกลับตำแหน่ง sidereal กำเนิด) + Muntha ----
  const natalSun = chart.grahas.find((g) => g.name === "Sun");
  let varshaphala: VedicTimeline["varshaphala"] = null;
  if (natalSun) {
    const birthBkk = new Date(chart.dtUTC.getTime() + BKK_MS);
    const approx = new Date(Date.UTC(targetYear, birthBkk.getUTCMonth(), Math.min(birthBkk.getUTCDate(), 28)) - BKK_MS);
    // sidereal return: tropical lon เป้าหมาย = sidLon กำเนิด + ayanamsa ณ ช่วง return (ayanamsa เลื่อน ~0.014°/ปี · คลาดวันระดับนาที)
    const targetTropical = norm360(natalSun.sidLon + lahiriAyanamsa(approx));
    const instant = findReturnInstant("Sun", targetTropical, approx, 6);
    if (instant) {
      const grahasSR = computeBodies(instant, { modern: false, node: true }).map((b) => {
        const sid = norm360(toSidereal(b.lon, instant));
        const rashi = Math.floor(sid / 30);
        return { name: b.key as GrahaKey, nameTh: GRAHA_TH[b.key as GrahaKey] || String(b.key), rashi, rashiTh: RASHI_TH[rashi], rashiDeg: r2(sid - rashi * 30), retro: b.retro };
      });
      const yearsElapsed = targetYear - birthBkk.getUTCFullYear();
      const munthaRashi = chart.lagna ? (chart.lagna.rashi + yearsElapsed) % 12 : null;
      varshaphala = {
        instantISO: instant.toISOString(),
        dateISO: bkkDateISO(instant),
        uncertainNoBirthTime: !chart.hasTime,
        munthaRashi,
        munthaRashiTh: munthaRashi != null ? RASHI_TH[munthaRashi] : null,
        grahas: grahasSR,
      };
    }
  }

  return {
    targetYear,
    timezone: "Asia/Bangkok",
    method: "vimshottari_arithmetic + sidereal_scan_bisection(lahiri_midyear)",
    dashaTimeline,
    transitSegments,
    sadeSati: {
      natalMoonRashi: moonRashi,
      natalMoonRashiTh: RASHI_TH[moonRashi],
      activeAnyTimeInYear: phases.length > 0,
      phases,
    },
    varshaphala,
    coverageNote: `ชั้นเวลาพระเวทปี ${targetYear} คำนวณจริงทั้งปี: ทศา 3 ชั้น ${dashaTimeline.length} ช่วง · transit segment ${transitSegments.length} ช่วง (เสาร์/พฤหัส/ราหู/เกตุ/อังคาร พร้อม bindu) · sade sati ${phases.length ? "มีช่วง active" : "ไม่ active ปีนี้"} · varshaphala ${varshaphala ? "มี" : "ไม่มี"}${chart.hasTime ? "" : " · ไม่ทราบเวลาเกิด: ทศา/จันทร์อ้างเที่ยงวัน ใช้เป็นแนวโน้ม ห้ามฟันวันแม่นจากทศา"}`,
  };
}
