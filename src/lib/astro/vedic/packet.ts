/**
 * โหราศาสตร์พระเวท (Vedic / Jyotish) — packet envelope (structured JSON)
 * ⚠️ engine คำนวณ → packet จัดรูป → render/AI แค่ตีความ (กฎข้อ 9)
 * ศัพท์ Vedic เท่านั้น (graha/rashi/bhava/nakshatra/dasha) + คำแปลไทย
 */
import { RASHI_TH, GRAHA_TH, type GrahaKey } from "./tables";
import type { VedicChart, MahaDasha, AntarDasha, VedicDignity } from "./engine";
import type { VedicTimeline } from "./timeline";

export type VedicPacket = {
  discipline: "vedic";
  packetVersion: "vedic-v2";
  hasBirthTime: boolean;
  birthTimeMode: "known" | "unknown_noon_anchor";
  anchorTime: {
    localTime: "12:00";
    timezone: "profile_local";
    purpose: "date_only_placeholder_not_birth_time";
  } | null;
  moonUncertainty: boolean;
  forbiddenFieldsWhenNoTime: string[];
  allowedFieldsWhenNoTime: string[];
  timingConfidence: {
    moonNakshatra: "firm" | "uncertain_no_time";
    vimshottari: "firm" | "reference_only_no_time";
    gocharaFromMoon: "firm" | "reference_only_no_time";
  };
  chandraLagnaMode: {
    enabled: boolean;
    status: "primary_cross_check" | "secondary_no_time";
    moonRashi: number;
    moonRashiTh: string;
    confidence: "firm" | "uncertain_no_time";
    usage: "supporting_only_not_birth_lagna" | "cross_check_with_birth_lagna";
    caution: string;
  };
  degradeLevel: "full" | "minimal";
  data: {
    ayanamsa: { value: number; name: "Lahiri" };
    lagna: {
      sidLon: number; rashi: number; rashiTh: string; deg: number;
      nakshatra: string; pada: number;
    } | null;
    grahas: Array<{
      name: string; nameTh: string; sidLon: number; rashi: number; rashiTh: string;
      deg: number; house: number | null; nakshatra: string; pada: number;
      speed: number;
      retro: boolean; dignity: VedicDignity; rashiLord: string; rashiLordTh: string;
      rashiLordRelation: string; moolatrikona: boolean;
      deepExaltationOrb: number | null; deepDebilitationOrb: number | null;
      combust: boolean; combustion: { combust: boolean; orbFromSun: number | null; limitDeg: number | null };
    }>;
    vargas: {
      shodasha: Record<string, Array<{
        kind: string; name: string; nameTh: string; rashi: number; rashiTh: string; deg: number;
        part: number; lord: string; lordTh: string; dignity: VedicDignity | null; vargottama: boolean;
      }>>;
      navamsaD9: Array<{
        kind: string; name: string; nameTh: string; rashi: number; rashiTh: string; deg: number;
        part: number; lord: string; lordTh: string; dignity: VedicDignity | null; vargottama: boolean;
      }>;
      dashamsaD10: Array<{
        kind: string; name: string; nameTh: string; rashi: number; rashiTh: string; deg: number;
        part: number; lord: string; lordTh: string; dignity: VedicDignity | null; vargottama: boolean;
      }>;
    };
    drishti: Array<{
      from: string; fromTh: string; to: string; toTh: string;
      aspectHouse: number; fromRashiTh: string; toRashiTh: string;
    }>;
    yogaCandidates: Array<{
      code: string; name: string; status: string; evidence: string[]; cautions: string[];
    }>;
    gochara: {
      refDate: string;
      ayanamsa: { value: number; name: "Lahiri" };
      grahas: Array<{
        name: string; nameTh: string; sidLon: number; rashi: number; rashiTh: string; deg: number;
        houseFromLagna: number | null; houseFromMoon: number; nakshatra: string; pada: number;
        retro: boolean; dignity: VedicDignity; combust: boolean;
        combustion: { combust: boolean; orbFromSun: number | null; limitDeg: number | null };
      }>;
      hitsToNatal: Array<{
        transit: string; transitTh: string; natal: string; natalTh: string;
      relation: string; aspectHouse: number;
      }>;
    };
    ashtakavarga: {
      method: string;
      planets: Array<{ graha: string; grahaTh: string; bindusByRashi: Array<{ rashi: number; rashiTh: string; bindu: number }>; totalBindus: number }>;
      sarvaByRashi: Array<{ rashi: number; rashiTh: string; bindu: number }>;
      sarvaTotal: number;
    };
    shadbala: {
      method: string;
      scale: string;
      planets: Array<{
        graha: string;
        grahaTh: string;
        score: number;
        band: string;
        components: { sthana: number; dig: number; kala: number; cheshta: number; naisargika: number; drik: number };
      }>;
    };
    bhavas: Array<{ house: number; sign: number; signTh: string; lord: string }> | null;
    moonNakshatra: { name: string; pada: number; lord: string };
    vimshottari: {
      startLord: string;
      balanceYears: number;
      mahadasha: MahaDasha[];
      currentMaha: MahaDasha | null;
      currentAntar: AntarDasha | null;
    };
    timingTimeline: VedicTimeline | null;
  };
  notAvailable: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const rn = (n: number | null | undefined, d = 2) => n == null ? null : Math.round(n * 10 ** d) / 10 ** d;

const DRISHTI: Partial<Record<GrahaKey, number[]>> = {
  Sun: [7],
  Moon: [7],
  Mercury: [7],
  Venus: [7],
  Mars: [4, 7, 8],
  Jupiter: [5, 7, 9],
  Saturn: [3, 7, 10],
};

const FORBIDDEN_FIELDS_NO_TIME = [
  "lagna",
  "bhavas",
  "grahaHouse",
  "houseFromLagna",
  "navamsaLagnaD9",
  "dashamsaLagnaD10",
  "lagnaLord",
  "marakaByHouse",
  "yogakarakaByLagna",
  "vimshottariFirmTiming",
  "moonNakshatraFirmTiming",
];

const ALLOWED_FIELDS_NO_TIME = [
  "grahaRashi",
  "grahaDegree",
  "dignity",
  "rashiLord",
  "rashiLordRelation",
  "combustion",
  "retrograde",
  "parashariDrishtiBetweenGrahas",
  "chandraLagnaSupportingHouses",
  "grahaVargaPositions",
  "shadbala",
  "ashtakavargaByRashi",
  "gocharaRashi",
];

export function buildVedicPacket(chart: VedicChart, timingTimeline: VedicTimeline | null = null): VedicPacket {
  const notAvailable: string[] = [];
  // ไม่มีเวลาเกิด: ลัคนา/ภพ ทำไม่ได้ + จันทร์เคลื่อน ~13°/วัน → ฤกษ์จันทร์/ทศา (Vimshottari) ไม่แน่นอน (E1)
  if (!chart.hasTime) notAvailable.push("lagna", "bhavas", "grahaHouse", "navamsaLagnaD9", "dashamsaLagnaD10", "moonNakshatra(จันทร์ไม่แน่นอน)", "vimshottariDasha(พึ่งฤกษ์จันทร์)");
  if (!timingTimeline) notAvailable.push("timingTimeline(antardasha/gocharaIngress/sadeSati/varshaphala)");

  const lagna = chart.lagna
    ? {
        sidLon: r4(chart.lagna.sidLon),
        rashi: chart.lagna.rashi,
        rashiTh: RASHI_TH[chart.lagna.rashi],
        deg: r2(chart.lagna.rashiDeg),
        nakshatra: chart.lagna.nakshatra.name,
        pada: chart.lagna.nakshatra.pada,
      }
    : null;

  const grahas = chart.grahas.map((g) => ({
    name: g.name,
    nameTh: g.nameTh,
    sidLon: r4(g.sidLon),
    rashi: g.rashi,
    rashiTh: RASHI_TH[g.rashi],
    deg: r2(g.rashiDeg),
    house: g.house,
    nakshatra: g.nakshatra.name,
    pada: g.nakshatra.pada,
    speed: r4(g.speed),
    retro: g.retro,
    dignity: g.dignity,
    rashiLord: g.rashiLord,
    rashiLordTh: GRAHA_TH[g.rashiLord],
    rashiLordRelation: g.rashiLordRelation,
    moolatrikona: g.moolatrikona,
    deepExaltationOrb: rn(g.deepExaltationOrb),
    deepDebilitationOrb: rn(g.deepDebilitationOrb),
    combust: g.combust,
    combustion: {
      combust: g.combustion.combust,
      orbFromSun: rn(g.combustion.orbFromSun),
      limitDeg: rn(g.combustion.limitDeg),
    },
  }));
  const moon = chart.grahas.find((g) => g.name === "Moon") || chart.grahas[1];

  const mapVarga = (points: VedicChart["vargas"]["navamsaD9"]) => points.map((p) => ({
    kind: p.kind,
    name: p.name,
    nameTh: p.nameTh,
    rashi: p.rashi,
    rashiTh: RASHI_TH[p.rashi],
    deg: r2(p.rashiDeg),
    part: p.part,
    lord: p.lord,
    lordTh: GRAHA_TH[p.lord],
    dignity: p.dignity,
    vargottama: p.vargottama,
  }));

  const mapBindus = (items: number[]) => items.map((bindu, rashi) => ({ rashi, rashiTh: RASHI_TH[rashi], bindu }));

  const drishti: VedicPacket["data"]["drishti"] = [];
  for (const from of chart.grahas) {
    for (const to of chart.grahas) {
      if (from.name === to.name) continue;
      const aspectHouse = ((to.rashi - from.rashi + 12) % 12) + 1;
      if ((DRISHTI[from.name] || []).includes(aspectHouse)) {
        drishti.push({
          from: from.name,
          fromTh: from.nameTh,
          to: to.name,
          toTh: to.nameTh,
          aspectHouse,
          fromRashiTh: RASHI_TH[from.rashi],
          toRashiTh: RASHI_TH[to.rashi],
        });
      }
    }
  }

  const bhavas = chart.bhavas
    ? chart.bhavas.map((b) => ({
        house: b.house,
        sign: b.sign,
        signTh: RASHI_TH[b.sign],
        lord: GRAHA_TH[b.lord],
      }))
    : null;

  return {
    discipline: "vedic",
    packetVersion: "vedic-v2",
    hasBirthTime: chart.hasTime,
    birthTimeMode: chart.hasTime ? "known" : "unknown_noon_anchor",
    anchorTime: chart.hasTime ? null : {
      localTime: "12:00",
      timezone: "profile_local",
      purpose: "date_only_placeholder_not_birth_time",
    },
    moonUncertainty: !chart.hasTime,
    forbiddenFieldsWhenNoTime: chart.hasTime ? [] : FORBIDDEN_FIELDS_NO_TIME,
    allowedFieldsWhenNoTime: chart.hasTime ? [] : ALLOWED_FIELDS_NO_TIME,
    timingConfidence: {
      moonNakshatra: chart.hasTime ? "firm" : "uncertain_no_time",
      vimshottari: chart.hasTime ? "firm" : "reference_only_no_time",
      gocharaFromMoon: chart.hasTime ? "firm" : "reference_only_no_time",
    },
    chandraLagnaMode: {
      enabled: !!moon,
      status: chart.hasTime ? "primary_cross_check" : "secondary_no_time",
      moonRashi: moon?.rashi ?? -1,
      moonRashiTh: moon ? RASHI_TH[moon.rashi] : "",
      confidence: chart.hasTime ? "firm" : "uncertain_no_time",
      usage: chart.hasTime ? "cross_check_with_birth_lagna" : "supporting_only_not_birth_lagna",
      caution: chart.hasTime
        ? "ใช้ Chandra Lagna เป็นชั้นเทียบกับ birth Lagna ไม่ใช่แทนข้อมูลหลัก"
        : "ไม่มีเวลาเกิด: ใช้ Chandra Lagna เป็นฐานประกอบเท่านั้น ห้ามแทน birth Lagna และห้ามฟันเรือน/ทศาหนักจากจันทร์",
    },
    degradeLevel: chart.degradeLevel,
    data: {
      ayanamsa: { value: r4(chart.ayanamsa), name: "Lahiri" },
      lagna,
      grahas,
      vargas: {
        shodasha: Object.fromEntries(
          Object.entries(chart.vargas.shodasha).map(([name, points]) => [name, mapVarga(points)]),
        ),
        navamsaD9: mapVarga(chart.vargas.navamsaD9),
        dashamsaD10: mapVarga(chart.vargas.dashamsaD10),
      },
      bhavas,
      moonNakshatra: {
        name: chart.moonNakshatra.name,
        pada: chart.moonNakshatra.pada,
        lord: chart.moonNakshatra.lord,
      },
      drishti,
      yogaCandidates: chart.yogaCandidates.map((y) => ({
        code: y.code,
        name: y.name,
        status: y.status,
        evidence: y.evidence,
        cautions: y.cautions,
      })),
      gochara: {
        refDate: chart.gochara.refDate,
        ayanamsa: { value: r4(chart.gochara.ayanamsa), name: "Lahiri" },
        grahas: chart.gochara.grahas.map((g) => ({
          name: g.name,
          nameTh: g.nameTh,
          sidLon: r4(g.sidLon),
          rashi: g.rashi,
          rashiTh: RASHI_TH[g.rashi],
          deg: r2(g.rashiDeg),
          houseFromLagna: g.houseFromLagna,
          houseFromMoon: g.houseFromMoon,
          nakshatra: g.nakshatra.name,
          pada: g.nakshatra.pada,
          retro: g.retro,
          dignity: g.dignity,
          combust: g.combust,
          combustion: {
            combust: g.combustion.combust,
            orbFromSun: rn(g.combustion.orbFromSun),
            limitDeg: rn(g.combustion.limitDeg),
          },
        })),
        hitsToNatal: chart.gochara.hitsToNatal.map((h) => ({
          transit: h.transit,
          transitTh: GRAHA_TH[h.transit],
          natal: h.natal,
          natalTh: GRAHA_TH[h.natal],
          relation: h.relation,
          aspectHouse: h.aspectHouse,
        })),
      },
      ashtakavarga: {
        method: chart.ashtakavarga.method,
        planets: chart.ashtakavarga.planets.map((p) => ({
          graha: p.graha,
          grahaTh: GRAHA_TH[p.graha],
          bindusByRashi: mapBindus(p.bindusByRashi),
          totalBindus: p.totalBindus,
        })),
        sarvaByRashi: mapBindus(chart.ashtakavarga.sarvaByRashi),
        sarvaTotal: chart.ashtakavarga.sarvaTotal,
      },
      shadbala: {
        method: chart.shadbala.method,
        scale: chart.shadbala.scale,
        planets: chart.shadbala.planets,
      },
      vimshottari: {
        startLord: chart.vimshottari.startLord,
        balanceYears: r2(chart.vimshottari.balanceYears),
        mahadasha: chart.vimshottari.mahadasha,
        currentMaha: chart.vimshottari.currentMaha,
        currentAntar: chart.vimshottari.currentAntar,
      },
      timingTimeline,
    },
    notAvailable,
  };
}
