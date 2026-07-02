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
  MOOLATRIKONA, NATURAL_RELATIONSHIPS, type GrahaRelation,
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
export type VedicDignity = "exalted" | "moolatrikona" | "own" | "friend" | "neutral" | "enemy" | "debilitated";
export type VargaName = "D1" | "D2" | "D3" | "D4" | "D7" | "D9" | "D10" | "D12" | "D16" | "D20" | "D24" | "D27" | "D30" | "D40" | "D45" | "D60";

export type VCombustion = {
  combust: boolean;
  orbFromSun: number | null;
  limitDeg: number | null;
};

export type VVargaPoint = {
  kind: "lagna" | "graha";
  name: "Lagna" | GrahaKey;
  nameTh: string;
  division: VargaName;
  rashi: number;
  rashiDeg: number;
  part: number;
  lord: GrahaKey;
  dignity: VedicDignity | null;
  vargottama: boolean;
};

export type VVargaSet = {
  shodasha: Record<VargaName, VVargaPoint[]>;
  navamsaD9: VVargaPoint[];
  dashamsaD10: VVargaPoint[];
};

export type VAshtakavarga = {
  method: "bhinna-ashtakavarga-v1";
  planets: Array<{
    graha: GrahaKey;
    bindusByRashi: number[];
    totalBindus: number;
  }>;
  sarvaByRashi: number[];
  sarvaTotal: number;
};

export type VShadbala = {
  method: "normalized-sixfold-v1";
  scale: "0-100";
  planets: Array<{
    graha: GrahaKey;
    grahaTh: string;
    score: number;
    band: "strong" | "moderate" | "weak";
    components: {
      sthana: number;
      dig: number;
      kala: number;
      cheshta: number;
      naisargika: number;
      drik: number;
    };
  }>;
};

export type VYogaCandidate = {
  code: string;
  name: string;
  status: "present" | "possible";
  evidence: string[];
  cautions: string[];
};

export type VGocharaGraha = {
  name: GrahaKey;
  nameTh: string;
  sidLon: number;
  rashi: number;
  rashiDeg: number;
  nakshatra: NakInfo;
  houseFromLagna: number | null;
  houseFromMoon: number;
  retro: boolean;
  speed: number;
  dignity: VedicDignity;
  combust: boolean;
  combustion: VCombustion;
};

export type VGocharaHit = {
  transit: GrahaKey;
  natal: GrahaKey;
  relation: "same_rashi" | "parashari_drishti";
  aspectHouse: number;
};

export type VGochara = {
  refDate: string;
  ayanamsa: number;
  grahas: VGocharaGraha[];
  hitsToNatal: VGocharaHit[];
};

export type VGraha = {
  name: GrahaKey;
  nameTh: string;
  sidLon: number;     // sidereal longitude (Lahiri)
  rashi: number;      // 0-11
  rashiDeg: number;   // 0-30 ภายในราศี
  nakshatra: NakInfo;
  house: number | null; // bhava 1-12 (whole-sign จาก Lagna) · null ถ้าไม่มีเวลา
  retro: boolean;
  speed: number;
  dignity: VedicDignity;
  rashiLord: GrahaKey;
  rashiLordRelation: GrahaRelation;
  moolatrikona: boolean;
  deepExaltationOrb: number | null;
  deepDebilitationOrb: number | null;
  combust: boolean;
  combustion: VCombustion;
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
  vargas: VVargaSet;
  ashtakavarga: VAshtakavarga;
  shadbala: VShadbala;
  yogaCandidates: VYogaCandidate[];
  gochara: VGochara;
};

/** ปี ค.ศ. แบบทศนิยม (UTC) — deterministic */
export function decimalYear(d: Date): number {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
}

function nakInfo(sidLon: number): NakInfo {
  const n = nakshatraOf(sidLon);
  return { index: n.index, name: n.name, nameTh: n.nameTh, lord: n.lord, pada: padaOf(sidLon) };
}

const DRISHTI_HOUSES: Partial<Record<GrahaKey, number[]>> = {
  Sun: [7],
  Moon: [7],
  Mercury: [7],
  Venus: [7],
  Mars: [4, 7, 8],
  Jupiter: [5, 7, 9],
  Saturn: [3, 7, 10],
};

const CLASSICAL_SHADBALA_GRAHAS: GrahaKey[] = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
const VARGA_NAMES: VargaName[] = ["D1", "D2", "D3", "D4", "D7", "D9", "D10", "D12", "D16", "D20", "D24", "D27", "D30", "D40", "D45", "D60"];

const isKendra = (n: number | null | undefined) => n === 1 || n === 4 || n === 7 || n === 10;
const signHouseFrom = (fromSign: number, toSign: number) => ((toSign - fromSign + 12) % 12) + 1;
const signDistance = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 12 - d);
};
const scoreClamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function relationToSignLord(graha: GrahaKey, signLord: GrahaKey): GrahaRelation {
  if (graha === signLord) return "self";
  const rel = NATURAL_RELATIONSHIPS[graha];
  if (!rel) return "not_applicable";
  if (rel.friends.includes(signLord)) return "friend";
  if (rel.enemies.includes(signLord)) return "enemy";
  return "neutral";
}

function isMoolatrikona(graha: GrahaKey, rashi: number, deg: number): boolean {
  const mt = MOOLATRIKONA[graha];
  return !!mt && mt.sign === rashi && deg >= mt.startDeg && deg < mt.endDeg;
}

/** ฐานะกราหะละเอียดขึ้น: อุจ/มูลตรีโกณ/เกษตร/มิตร/กลาง/ศัตรู/นิจ */
function dignityOf(graha: GrahaKey, rashi: number, deg: number): VedicDignity {
  if (DEBILITATION[graha] === rashi) return "debilitated";
  if (isMoolatrikona(graha, rashi, deg)) return "moolatrikona";
  const ex = EXALTATION[graha];
  if (ex && ex.sign === rashi) return "exalted";
  const lord = RASHI_LORDS[rashi];
  if (lord === graha) return "own";
  const rel = relationToSignLord(graha, lord);
  if (rel === "friend" || rel === "enemy") return rel;
  return "neutral";
}

function combustionOf(graha: GrahaKey, sidLon: number, sunSid: number): VCombustion {
  const limitDeg = graha === "Sun" ? null : COMBUST_DEG[graha] ?? null;
  const orbFromSun = limitDeg == null ? null : angSep(sidLon, sunSid);
  return { combust: limitDeg != null && orbFromSun != null && orbFromSun < limitDeg, orbFromSun, limitDeg };
}

function deepOrb(graha: GrahaKey, rashi: number, deg: number, mode: "exaltation" | "debilitation"): number | null {
  const ex = EXALTATION[graha];
  if (!ex) return null;
  const sign = mode === "exaltation" ? ex.sign : (ex.sign + 6) % 12;
  return sign === rashi ? Math.abs(deg - ex.deg) : null;
}

function buildGraha(key: GrahaKey, body: BodyPos, dt: Date, sunSid: number, lagnaSid: number | null): VGraha {
  const sidLon = toSidereal(body.lon, dt);
  const rashi = Math.floor(sidLon / 30);
  const rashiDeg = sidLon % 30;
  const rashiLord = RASHI_LORDS[rashi];
  const combustion = combustionOf(key, sidLon, sunSid);
  return {
    name: key,
    nameTh: GRAHA_TH[key],
    sidLon,
    rashi,
    rashiDeg,
    nakshatra: nakInfo(sidLon),
    house: lagnaSid != null ? houseOf(sidLon, lagnaSid, "whole") : null,
    retro: !!body.retro,
    speed: body.speed,
    dignity: dignityOf(key, rashi, rashiDeg),
    rashiLord,
    rashiLordRelation: relationToSignLord(key, rashiLord),
    moolatrikona: isMoolatrikona(key, rashi, rashiDeg),
    deepExaltationOrb: deepOrb(key, rashi, rashiDeg, "exaltation"),
    deepDebilitationOrb: deepOrb(key, rashi, rashiDeg, "debilitation"),
    combust: combustion.combust,
    combustion,
  };
}

const VARGA_DIVISIONS: Record<VargaName, number> = {
  D1: 1, D2: 2, D3: 3, D4: 4, D7: 7, D9: 9, D10: 10, D12: 12,
  D16: 16, D20: 20, D24: 24, D27: 27, D30: 30, D40: 40, D45: 45, D60: 60,
};

function modalityStart(sign: number, movable: number, fixed: number, dual: number) {
  return sign % 3 === 0 ? movable : sign % 3 === 1 ? fixed : dual;
}

function vargaRashi(sidLon: number, division: VargaName): { rashi: number; rashiDeg: number; part: number } {
  const L = norm360(sidLon);
  const baseSign = Math.floor(L / 30);
  const deg = L % 30;
  if (division === "D1") return { rashi: baseSign, rashiDeg: deg, part: 1 };

  if (division === "D2") {
    const part = deg < 15 ? 1 : 2;
    const oddSign = baseSign % 2 === 0;
    return {
      rashi: oddSign ? (part === 1 ? 4 : 3) : (part === 1 ? 3 : 4),
      rashiDeg: (deg % 15) * 2,
      part,
    };
  }

  if (division === "D30") {
    const oddSign = baseSign % 2 === 0;
    const ranges = oddSign
      ? [
          { end: 5, sign: 0 }, { end: 10, sign: 10 }, { end: 18, sign: 8 }, { end: 25, sign: 2 }, { end: 30, sign: 6 },
        ]
      : [
          { end: 5, sign: 1 }, { end: 12, sign: 5 }, { end: 20, sign: 11 }, { end: 25, sign: 9 }, { end: 30, sign: 7 },
        ];
    let prev = 0;
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      if (deg < r.end || i === ranges.length - 1) {
        const span = r.end - prev;
        return { rashi: r.sign, rashiDeg: ((deg - prev) / span) * 30, part: i + 1 };
      }
      prev = r.end;
    }
  }

  const parts = VARGA_DIVISIONS[division];
  const partSize = 30 / parts;
  const part = Math.min(parts - 1, Math.floor(deg / partSize));
  let start: number;
  switch (division) {
    case "D3":
      return { rashi: (baseSign + part * 4) % 12, rashiDeg: (deg - part * partSize) * parts, part: part + 1 };
    case "D4":
      return { rashi: (baseSign + part * 3) % 12, rashiDeg: (deg - part * partSize) * parts, part: part + 1 };
    case "D7":
      start = baseSign % 2 === 0 ? baseSign : (baseSign + 6) % 12;
      break;
    case "D9":
      start = modalityStart(baseSign, baseSign, (baseSign + 8) % 12, (baseSign + 4) % 12);
      break;
    case "D10":
      start = baseSign % 2 === 0 ? baseSign : (baseSign + 8) % 12;
      break;
    case "D12":
      start = baseSign;
      break;
    case "D16":
      start = modalityStart(baseSign, 0, 4, 8);
      break;
    case "D20":
      start = modalityStart(baseSign, 0, 8, 4);
      break;
    case "D24":
      start = baseSign % 2 === 0 ? 4 : 3;
      break;
    case "D27":
      start = modalityStart(baseSign, 0, 3, 6);
      break;
    case "D40":
      start = baseSign % 2 === 0 ? 0 : 6;
      break;
    case "D45":
      start = modalityStart(baseSign, 0, 4, 8);
      break;
    case "D60":
      start = baseSign % 2 === 0 ? baseSign : (baseSign + 6) % 12;
      break;
    default:
      start = baseSign;
  }
  return {
    rashi: (start + part) % 12,
    rashiDeg: (deg - part * partSize) * parts,
    part: part + 1,
  };
}

function vargaPoint(kind: "lagna" | "graha", name: "Lagna" | GrahaKey, nameTh: string, sidLon: number, natalRashi: number, division: VargaName): VVargaPoint {
  const v = vargaRashi(sidLon, division);
  return {
    kind,
    name,
    nameTh,
    division,
    rashi: v.rashi,
    rashiDeg: v.rashiDeg,
    part: v.part,
    lord: RASHI_LORDS[v.rashi],
    dignity: name === "Lagna" ? null : dignityOf(name, v.rashi, v.rashiDeg),
    vargottama: natalRashi === v.rashi,
  };
}

function buildVargas(grahas: VGraha[], lagna: VLagna | null): VVargaSet {
  const points = [
    ...(lagna ? [{ kind: "lagna" as const, name: "Lagna" as const, nameTh: "ลัคนา", sidLon: lagna.sidLon, rashi: lagna.rashi }] : []),
    ...grahas.map((g) => ({ kind: "graha" as const, name: g.name, nameTh: g.nameTh, sidLon: g.sidLon, rashi: g.rashi })),
  ];
  const shodasha = Object.fromEntries(
    VARGA_NAMES.map((name) => [name, points.map((p) => vargaPoint(p.kind, p.name, p.nameTh, p.sidLon, p.rashi, name))]),
  ) as Record<VargaName, VVargaPoint[]>;
  return {
    shodasha,
    navamsaD9: shodasha.D9,
    dashamsaD10: shodasha.D10,
  };
}

function buildYogaCandidates(grahas: VGraha[], lagna: VLagna | null): VYogaCandidate[] {
  if (!lagna) return [];
  const out: VYogaCandidate[] = [];
  const by = (g: GrahaKey) => grahas.find((x) => x.name === g);
  const pancha: Array<{ graha: GrahaKey; code: string; name: string }> = [
    { graha: "Mars", code: "ruchaka", name: "Ruchaka Mahapurusha" },
    { graha: "Mercury", code: "bhadra", name: "Bhadra Mahapurusha" },
    { graha: "Jupiter", code: "hamsa", name: "Hamsa Mahapurusha" },
    { graha: "Venus", code: "malavya", name: "Malavya Mahapurusha" },
    { graha: "Saturn", code: "sasa", name: "Sasa Mahapurusha" },
  ];
  for (const p of pancha) {
    const g = by(p.graha);
    if (g && isKendra(g.house) && ["exalted", "moolatrikona", "own"].includes(g.dignity)) {
      out.push({
        code: p.code,
        name: p.name,
        status: "present",
        evidence: [`${g.name} in house ${g.house}`, `dignity=${g.dignity}`],
        cautions: g.combust ? ["combustion weakens expression"] : [],
      });
    }
  }

  const moon = by("Moon");
  const jupiter = by("Jupiter");
  if (moon && jupiter && isKendra(signHouseFrom(moon.rashi, jupiter.rashi))) {
    out.push({
      code: "gaja_kesari",
      name: "Gaja-Kesari candidate",
      status: jupiter.dignity === "debilitated" || jupiter.combust ? "possible" : "present",
      evidence: [`Jupiter is ${signHouseFrom(moon.rashi, jupiter.rashi)} from Moon`],
      cautions: [
        ...(jupiter.dignity === "debilitated" ? ["Jupiter debilitated"] : []),
        ...(jupiter.combust ? ["Jupiter combust"] : []),
      ],
    });
  }

  for (const g of grahas.filter((x) => x.dignity === "debilitated")) {
    const debLord = RASHI_LORDS[g.rashi];
    const ex = EXALTATION[g.name];
    const exaltLord = ex ? RASHI_LORDS[ex.sign] : null;
    const debLordGraha = by(debLord);
    const exaltLordGraha = exaltLord ? by(exaltLord) : null;
    const hasKendraSupport =
      (debLordGraha && (isKendra(debLordGraha.house) || (moon && isKendra(signHouseFrom(moon.rashi, debLordGraha.rashi))))) ||
      (exaltLordGraha && (isKendra(exaltLordGraha.house) || (moon && isKendra(signHouseFrom(moon.rashi, exaltLordGraha.rashi)))));
    if (hasKendraSupport) {
      out.push({
        code: `neechabhanga_indicator_${g.name.toLowerCase()}`,
        name: `Neechabhanga indicator for ${g.name}`,
        status: "possible",
        evidence: [`${g.name} debilitated`, "debilitation/exaltation lord has kendra support"],
        cautions: ["indicator only; full cancellation needs source-specific checks"],
      });
    }
  }
  return out;
}

type AshtakavargaContributor = GrahaKey | "Lagna";
type AshtakavargaRules = Record<GrahaKey, Record<AshtakavargaContributor, number[]>>;

const ASHTAKAVARGA_RULES: AshtakavargaRules = {
  Sun: {
    Sun: [1, 2, 4, 7, 8, 9, 10, 11],
    Moon: [3, 6, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [3, 5, 6, 9, 10, 11, 12],
    Jupiter: [5, 6, 9, 11],
    Venus: [6, 7, 12],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Rahu: [], Ketu: [],
    Lagna: [3, 4, 6, 10, 11, 12],
  },
  Moon: {
    Sun: [3, 6, 7, 8, 10, 11],
    Moon: [1, 3, 6, 7, 10, 11],
    Mars: [2, 3, 5, 6, 9, 10, 11],
    Mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    Jupiter: [1, 4, 7, 8, 10, 11, 12],
    Venus: [3, 4, 5, 7, 9, 10, 11],
    Saturn: [3, 5, 6, 11],
    Rahu: [], Ketu: [],
    Lagna: [3, 6, 10, 11],
  },
  Mars: {
    Sun: [3, 5, 6, 10, 11],
    Moon: [3, 6, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [3, 5, 6, 11],
    Jupiter: [6, 10, 11, 12],
    Venus: [6, 8, 11, 12],
    Saturn: [1, 4, 7, 8, 9, 10, 11],
    Rahu: [], Ketu: [],
    Lagna: [1, 3, 6, 10, 11],
  },
  Mercury: {
    Sun: [5, 6, 9, 11, 12],
    Moon: [2, 4, 6, 8, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    Jupiter: [6, 8, 11, 12],
    Venus: [1, 2, 3, 4, 5, 8, 9, 11],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Rahu: [], Ketu: [],
    Lagna: [1, 2, 4, 6, 8, 10, 11],
  },
  Jupiter: {
    Sun: [1, 2, 3, 4, 7, 8, 9, 10, 11],
    Moon: [2, 5, 7, 9, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    Jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
    Venus: [2, 5, 6, 9, 10, 11],
    Saturn: [3, 5, 6, 12],
    Rahu: [], Ketu: [],
    Lagna: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  Venus: {
    Sun: [8, 11, 12],
    Moon: [1, 2, 3, 4, 5, 8, 9, 11, 12],
    Mars: [3, 5, 6, 9, 11, 12],
    Mercury: [3, 5, 6, 9, 11],
    Jupiter: [5, 8, 9, 10, 11],
    Venus: [1, 2, 3, 4, 5, 8, 9, 10, 11],
    Saturn: [3, 4, 5, 8, 9, 10, 11],
    Rahu: [], Ketu: [],
    Lagna: [1, 2, 3, 4, 5, 8, 9, 11],
  },
  Saturn: {
    Sun: [1, 2, 4, 7, 8, 10, 11],
    Moon: [3, 6, 11],
    Mars: [3, 5, 6, 10, 11, 12],
    Mercury: [6, 8, 9, 10, 11, 12],
    Jupiter: [5, 6, 11, 12],
    Venus: [6, 11, 12],
    Saturn: [3, 5, 6, 11],
    Rahu: [], Ketu: [],
    Lagna: [1, 3, 4, 6, 10, 11],
  },
  Rahu: { Sun: [], Moon: [], Mars: [], Mercury: [], Jupiter: [], Venus: [], Saturn: [], Rahu: [], Ketu: [], Lagna: [] },
  Ketu: { Sun: [], Moon: [], Mars: [], Mercury: [], Jupiter: [], Venus: [], Saturn: [], Rahu: [], Ketu: [], Lagna: [] },
};

function buildAshtakavarga(grahas: VGraha[], lagna: VLagna | null): VAshtakavarga {
  const by = (g: GrahaKey) => grahas.find((x) => x.name === g);
  const contributorSign = (c: AshtakavargaContributor): number | null => c === "Lagna" ? lagna?.rashi ?? null : by(c)?.rashi ?? null;
  const planets = CLASSICAL_SHADBALA_GRAHAS.map((graha) => {
    const bindusByRashi = Array(12).fill(0) as number[];
    const rules = ASHTAKAVARGA_RULES[graha];
    for (const contributor of [...CLASSICAL_SHADBALA_GRAHAS, "Lagna"] as AshtakavargaContributor[]) {
      const start = contributorSign(contributor);
      if (start == null) continue;
      for (const relHouse of rules[contributor] || []) {
        bindusByRashi[(start + relHouse - 1) % 12] += 1;
      }
    }
    return { graha, bindusByRashi, totalBindus: bindusByRashi.reduce((s, n) => s + n, 0) };
  });
  const sarvaByRashi = Array(12).fill(0) as number[];
  for (const p of planets) p.bindusByRashi.forEach((n, i) => { sarvaByRashi[i] += n; });
  return {
    method: "bhinna-ashtakavarga-v1",
    planets,
    sarvaByRashi,
    sarvaTotal: sarvaByRashi.reduce((s, n) => s + n, 0),
  };
}

const DIGNITY_SCORE: Record<VedicDignity, number> = {
  exalted: 100,
  moolatrikona: 92,
  own: 84,
  friend: 68,
  neutral: 52,
  enemy: 36,
  debilitated: 18,
};

const NATURAL_STRENGTH: Record<GrahaKey, number> = {
  Sun: 100, Moon: 85, Venus: 72, Jupiter: 57, Mercury: 43, Mars: 28, Saturn: 17,
  Rahu: 0, Ketu: 0,
};

const AVG_SPEED: Record<GrahaKey, number> = {
  Sun: 0.9856, Moon: 13.176, Mars: 0.52, Mercury: 1.2, Jupiter: 0.083, Venus: 1.0, Saturn: 0.033,
  Rahu: 0.0529, Ketu: 0.0529,
};

function buildShadbala(grahas: VGraha[], vargas: VVargaSet, lagna: VLagna | null): VShadbala {
  const by = (g: GrahaKey) => grahas.find((x) => x.name === g)!;
  const sun = by("Sun");
  const moon = by("Moon");
  const dayBirth = sun.house == null ? true : sun.house >= 7 && sun.house <= 12;
  const waxingMoon = ((moon.sidLon - sun.sidLon + 360) % 360) <= 180;
  const benefics = new Set<GrahaKey>(["Jupiter", "Venus", ...(waxingMoon ? ["Moon" as GrahaKey] : []), "Mercury"]);
  const malefics = new Set<GrahaKey>(["Sun", "Mars", "Saturn", ...(!waxingMoon ? ["Moon" as GrahaKey] : [])]);

  const vargaStrength = (graha: GrahaKey) => {
    const sample: VargaName[] = ["D1", "D2", "D3", "D7", "D9", "D10", "D12", "D30"];
    const scores = sample
      .map((v) => vargas.shodasha[v].find((p) => p.name === graha)?.dignity)
      .filter((x): x is VedicDignity => !!x)
      .map((x) => DIGNITY_SCORE[x]);
    return scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 50;
  };
  const digTarget: Record<GrahaKey, number> = {
    Sun: 10, Mars: 10, Moon: 4, Venus: 4, Mercury: 1, Jupiter: 1, Saturn: 7,
    Rahu: 0, Ketu: 0,
  };
  const drikScore = (target: VGraha) => {
    let score = 50;
    for (const from of grahas.filter((g) => g.name !== target.name)) {
      const aspectHouse = signHouseFrom(from.rashi, target.rashi);
      const aspects = (DRISHTI_HOUSES[from.name] || []).includes(aspectHouse) || aspectHouse === 1;
      if (!aspects) continue;
      if (benefics.has(from.name)) score += aspectHouse === 1 ? 10 : 14;
      if (malefics.has(from.name)) score -= aspectHouse === 1 ? 8 : 12;
    }
    return scoreClamp(score);
  };

  const planets = CLASSICAL_SHADBALA_GRAHAS.map((graha) => {
    const g = by(graha);
    const houseScore = g.house ? Math.max(35, 100 - Math.abs(10 - g.house) * 5) : 50;
    const sthana = scoreClamp((DIGNITY_SCORE[g.dignity] * 0.55) + (vargaStrength(graha) * 0.35) + (houseScore * 0.10));
    const target = digTarget[graha];
    const dig = g.house && target ? scoreClamp(100 - (Math.min(Math.abs(g.house - target), 12 - Math.abs(g.house - target)) / 6) * 100) : 50;
    const kalaBase =
      graha === "Mercury" ? 62 :
      (dayBirth && ["Sun", "Jupiter", "Venus"].includes(graha)) || (!dayBirth && ["Moon", "Mars", "Saturn"].includes(graha)) ? 76 : 46;
    const kala = scoreClamp(graha === "Moon" ? (kalaBase * 0.55 + (waxingMoon ? 82 : 45) * 0.45) : kalaBase);
    const speedRatio = Math.min(2, Math.abs(g.speed) / (AVG_SPEED[graha] || 1));
    const cheshta = scoreClamp((g.retro ? 82 : 42) + speedRatio * 18);
    const naisargika = NATURAL_STRENGTH[graha];
    const drik = drikScore(g);
    const score = scoreClamp((sthana + dig + kala + cheshta + naisargika + drik) / 6);
    return {
      graha,
      grahaTh: GRAHA_TH[graha],
      score,
      band: score >= 67 ? "strong" as const : score >= 45 ? "moderate" as const : "weak" as const,
      components: { sthana, dig, kala, cheshta, naisargika, drik },
    };
  });
  return { method: "normalized-sixfold-v1", scale: "0-100", planets };
}

function buildGochara(refDate: Date, natalGrahas: VGraha[], lagnaSid: number | null, moonSid: number): VGochara {
  const bodies = computeBodies(refDate, { modern: false, node: true });
  const sunSid = toSidereal(bodies.find((b) => b.key === "Sun")!.lon, refDate);
  const grahas: VGocharaGraha[] = [];
  for (const key of GRAHA_ORDER) {
    const b = bodies.find((x) => x.key === key);
    if (!b) continue;
    const g = buildGraha(key, b, refDate, sunSid, null);
    grahas.push({
      name: g.name,
      nameTh: g.nameTh,
      sidLon: g.sidLon,
      rashi: g.rashi,
      rashiDeg: g.rashiDeg,
      nakshatra: g.nakshatra,
      houseFromLagna: lagnaSid != null ? houseOf(g.sidLon, lagnaSid, "whole") : null,
      houseFromMoon: houseOf(g.sidLon, moonSid, "whole"),
      retro: g.retro,
      speed: g.speed,
      dignity: g.dignity,
      combust: g.combust,
      combustion: g.combustion,
    });
  }
  const hitsToNatal: VGocharaHit[] = [];
  for (const t of grahas) {
    for (const n of natalGrahas) {
      const aspectHouse = signHouseFrom(t.rashi, n.rashi);
      if (aspectHouse === 1) {
        hitsToNatal.push({ transit: t.name, natal: n.name, relation: "same_rashi", aspectHouse });
      } else if ((DRISHTI_HOUSES[t.name] || []).includes(aspectHouse)) {
        hitsToNatal.push({ transit: t.name, natal: n.name, relation: "parashari_drishti", aspectHouse });
      }
    }
  }
  return {
    refDate: refDate.toISOString().slice(0, 10),
    ayanamsa: lahiriAyanamsa(refDate),
    grahas,
    hitsToNatal,
  };
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
    const g = buildGraha(key, b, dtUTC, sunSid, lagnaSid);
    if (key === "Moon") moonSid = g.sidLon;
    grahas.push(g);
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

  const vargas = buildVargas(grahas, lagna);

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
    vargas,
    ashtakavarga: buildAshtakavarga(grahas, lagna),
    shadbala: buildShadbala(grahas, vargas, lagna),
    yogaCandidates: buildYogaCandidates(grahas, lagna),
    gochara: buildGochara(refDate, grahas, lagnaSid, moonSid),
  };
}
