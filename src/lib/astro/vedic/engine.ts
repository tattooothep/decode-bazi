/**
 * โหราศาสตร์พระเวท (Vedic / Jyotish · sidereal Lahiri) — engine คำนวณ deterministic
 * ⚠️ ห้าม AI คำนวณ · ใช้ astro-core (ดาวจริง · VSOP87/Meeus) + ตารางคงที่ tables.ts
 * ใช้ whole-sign bhava (ตามสำนัก Parashara) · Vimshottari dasha จากฤกษ์จันทร์
 * deterministic ล้วน: ไม่มี Date.now() · "ปัจจุบัน" รับผ่าน refDate (default 2026-06-30)
 */
import { computeBodies, ascendant, type BodyPos } from "../../astro-core/ephemeris";
import { toSidereal, lahiriAyanamsa } from "../../astro-core/ayanamsa";
import { houseOf } from "../../astro-core/houses";
import {
  type GrahaKey,
  GRAHA_TH, GRAHA_ORDER, RASHI_LORDS, EXALTATION, DEBILITATION, COMBUST_DEG,
  LORD_CYCLE, DASHA_YEARS, VIMSHOTTARI_TOTAL, NAKSHATRA_SPAN,
  nakshatraOf, padaOf,
} from "./tables";

const norm360 = (d: number) => ((d % 360) + 360) % 360;
/** ระยะเชิงมุมสั้นสุดระหว่าง 2 ลองจิจูด (0-180) */
const angSep = (a: number, b: number) => {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
};

/** ===== Types ===== */
export type NakInfo = { index: number; name: string; nameTh: string; lord: GrahaKey; pada: number };

export type VGraha = {
  name: GrahaKey;
  nameTh: string;
  sidLon: number;     // sidereal longitude (Lahiri)
  rashi: number;      // 0-11
  rashiDeg: number;   // 0-30 ภายในราศี
  nakshatra: NakInfo;
  house: number | null; // bhava 1-12 (whole-sign จาก Lagna) · null ถ้าไม่มีเวลา
  retro: boolean;
  dignity: "exalted" | "debilitated" | "own" | "neutral";
  combust: boolean;
};

export type VLagna = {
  sidLon: number;
  rashi: number;
  rashiDeg: number;
  nakshatra: NakInfo;
};

export type VBhava = { house: number; sign: number; lord: GrahaKey };

export type MahaDasha = {
  lord: GrahaKey;
  startYear: number; // ปี ค.ศ. แบบทศนิยม
  endYear: number;
  ageStart: number;  // อายุ (ปี)
  ageEnd: number;
};

export type AntarDasha = {
  lord: GrahaKey;
  startYear: number;
  endYear: number;
  ageStart: number;
  ageEnd: number;
};

export type Vimshottari = {
  startLord: GrahaKey;
  balanceYears: number;          // เศษทศาแรกที่เหลือ ณ เกิด
  mahadasha: MahaDasha[];        // 9 ช่วง ต่อเนื่อง ~120 ปี
  currentMaha: MahaDasha | null; // มหาทศาปัจจุบัน (ณ refDate)
  currentAntar: AntarDasha | null;
};

export type VedicChart = {
  dtUTC: Date;
  lat: number;
  lng: number;
  hasTime: boolean;
  degradeLevel: "full" | "minimal";
  ayanamsa: number;
  lagna: VLagna | null;
  grahas: VGraha[];
  bhavas: VBhava[] | null;
  moonNakshatra: NakInfo;
  vimshottari: Vimshottari;
};

/** ปี ค.ศ. แบบทศนิยม (UTC) — deterministic */
function decimalYear(d: Date): number {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
}

function nakInfo(sidLon: number): NakInfo {
  const n = nakshatraOf(sidLon);
  return { index: n.index, name: n.name, nameTh: n.nameTh, lord: n.lord, pada: padaOf(sidLon) };
}

/** ฐานะกราหะ (อุจ/นิจ/เกษตร/เป็นกลาง) */
function dignityOf(graha: GrahaKey, rashi: number): VGraha["dignity"] {
  const ex = EXALTATION[graha];
  if (ex && ex.sign === rashi) return "exalted";
  if (DEBILITATION[graha] === rashi) return "debilitated";
  if (RASHI_LORDS[rashi] === graha) return "own";
  return "neutral";
}

/**
 * คำนวณผังพระเวท
 * @param dtUTC เวลาเกิด UTC
 * @param lat ละติจูด
 * @param lng ลองจิจูด (ตะวันออก +)
 * @param hasTime มีเวลาเกิดหรือไม่ (ไม่มี → ไม่คำนวณ Lagna/bhava/house)
 * @param refDate วันอ้างอิง "ปัจจุบัน" สำหรับทศา (default 2026-06-30 · deterministic)
 */
export function vedicChart(
  dtUTC: Date,
  lat: number,
  lng: number,
  hasTime = true,
  refDate: Date = new Date("2026-06-30T00:00:00Z"),
): VedicChart {
  const ayan = lahiriAyanamsa(dtUTC);

  // กราหะ 9 ดวง: 7政 + Rahu/Ketu (mean node)
  const bodies: BodyPos[] = computeBodies(dtUTC, { modern: false, node: true });
  const sunSid = toSidereal(
    bodies.find((b) => b.key === "Sun")!.lon,
    dtUTC,
  );

  // Lagna (ลัคนา) — sidereal ของ ascendant
  let lagna: VLagna | null = null;
  let lagnaSid: number | null = null;
  if (hasTime) {
    lagnaSid = toSidereal(ascendant(dtUTC, lat, lng), dtUTC);
    lagna = {
      sidLon: lagnaSid,
      rashi: Math.floor(lagnaSid / 30),
      rashiDeg: lagnaSid % 30,
      nakshatra: nakInfo(lagnaSid),
    };
  }

  // กราหะ
  const grahas: VGraha[] = [];
  let moonSid = 0;
  for (const key of GRAHA_ORDER) {
    const b = bodies.find((x) => x.key === key);
    if (!b) continue;
    const sidLon = toSidereal(b.lon, dtUTC);
    if (key === "Moon") moonSid = sidLon;
    const rashi = Math.floor(sidLon / 30);
    const combust =
      key !== "Sun" && COMBUST_DEG[key] != null
        ? angSep(sidLon, sunSid) < (COMBUST_DEG[key] as number)
        : false;
    grahas.push({
      name: key,
      nameTh: GRAHA_TH[key],
      sidLon,
      rashi,
      rashiDeg: sidLon % 30,
      nakshatra: nakInfo(sidLon),
      house: lagnaSid != null ? houseOf(sidLon, lagnaSid, "whole") : null,
      retro: !!b.retro,
      dignity: dignityOf(key, rashi),
      combust,
    });
  }

  // bhava 12 เรือน (whole-sign) + เจ้าเรือน
  let bhavas: VBhava[] | null = null;
  if (lagna) {
    const ascSign = lagna.rashi;
    bhavas = [];
    for (let i = 0; i < 12; i++) {
      const sign = (ascSign + i) % 12;
      bhavas.push({ house: i + 1, sign, lord: RASHI_LORDS[sign] });
    }
  }

  const moonNak = nakInfo(moonSid);

  // ===== Vimshottari Dasha =====
  const birthDec = decimalYear(dtUTC);
  const startLord = moonNak.lord;
  const degInNak = ((moonSid % NAKSHATRA_SPAN) + NAKSHATRA_SPAN) % NAKSHATRA_SPAN;
  const balanceYears = ((NAKSHATRA_SPAN - degInNak) / NAKSHATRA_SPAN) * DASHA_YEARS[startLord];

  const startIdx = LORD_CYCLE.indexOf(startLord);
  const mahadasha: MahaDasha[] = [];
  let age = 0;
  for (let i = 0; i < 9; i++) {
    const lord = LORD_CYCLE[(startIdx + i) % 9];
    const dur = i === 0 ? balanceYears : DASHA_YEARS[lord];
    const ageStart = age;
    const ageEnd = age + dur;
    mahadasha.push({
      lord,
      ageStart,
      ageEnd,
      startYear: birthDec + ageStart,
      endYear: birthDec + ageEnd,
    });
    age = ageEnd;
  }

  // ปัจจุบัน (ณ refDate) — deterministic
  const refAge = decimalYear(refDate) - birthDec;
  const currentMaha = mahadasha.find((m) => refAge >= m.ageStart && refAge < m.ageEnd) ?? null;

  let currentAntar: AntarDasha | null = null;
  if (currentMaha) {
    const L = currentMaha.lord;
    const fullLen = DASHA_YEARS[L];
    // จุดเริ่มของมหาทศา "เต็ม" (อาจติดลบถ้าเป็นทศาแรกแบบเศษ)
    const fullStartAge = currentMaha.ageEnd - fullLen;
    const idxL = LORD_CYCLE.indexOf(L);
    let aAge = fullStartAge;
    for (let j = 0; j < 9; j++) {
      const antarLord = LORD_CYCLE[(idxL + j) % 9];
      const dur = (fullLen * DASHA_YEARS[antarLord]) / VIMSHOTTARI_TOTAL;
      const aStart = aAge;
      const aEnd = aAge + dur;
      if (refAge >= aStart && refAge < aEnd) {
        currentAntar = {
          lord: antarLord,
          ageStart: aStart,
          ageEnd: aEnd,
          startYear: birthDec + aStart,
          endYear: birthDec + aEnd,
        };
        break;
      }
      aAge = aEnd;
    }
  }

  return {
    dtUTC,
    lat,
    lng,
    hasTime,
    degradeLevel: hasTime ? "full" : "minimal",
    ayanamsa: ayan,
    lagna,
    grahas,
    bhavas,
    moonNakshatra: moonNak,
    vimshottari: { startLord, balanceYears, mahadasha, currentMaha, currentAntar },
  };
}
