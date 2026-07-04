/**
 * fusion5 pair interactions · deterministic cross-chart packets for non-BaZi panels.
 * AI may interpret these closed lists, but must not invent additional cross-chart hits.
 */
import { ASPECTS } from "../astro-core/aspects";
import { houseOf } from "../astro-core/houses";
import { qizhengNatal } from "../astro/qizheng/engine";
import { SIGNS, STARS } from "../tianxing/tables";
import { westernChart, SIGN_TH, type WesternChart } from "../astro/western/engine";
import { vedicChart, type VedicChart, type VGraha } from "../astro/vedic/engine";
import { ashtakoota, type AshtakootaResult } from "../astro/vedic/ashtakoota";
import { GRAHA_TH, type GrahaKey, RASHI_TH } from "../astro/vedic/tables";
import { ziweiChart, type ZiweiChart, type ZiweiPalace } from "../astro/ziwei/engine";
import { BRANCHES, type PalaceName } from "../astro/ziwei/tables";
import { uranianChart } from "../astro/uranian/engine";
import { uranianSynastry } from "../astro/uranian/synastry";
import type { ScienceId } from "./disciplines";

type PairBirthData = { name: string; dtUTC: Date; lat: number; lng: number; hasTime: boolean; gender: "M" | "F" };

const CORE_WESTERN = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"]);
const PERSONAL_WESTERN = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]);
const QIZHENG_IMPORTANT = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu", "Yuebo", "Ziqi"]);

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const norm360 = (d: number) => ((d % 360) + 360) % 360;
const angleDiff = (a: number, b: number) => {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
};

function zodiacAspectByLon(a: number, b: number, maxOrb: number): { type: string; zh: string; angleTh: string; orb: number } | null {
  const sep = angleDiff(a, b);
  for (const asp of ASPECTS) {
    const orb = Math.abs(sep - asp.angle);
    if (orb <= maxOrb) return { type: asp.type, zh: asp.zh, angleTh: asp.th, orb: r2(orb) };
  }
  return null;
}

function zodiacAspectBySign(a: number, b: number): { type: string; zh: string; angleTh: string; signDistance: number } | null {
  const d = Math.abs(a - b);
  const signDistance = Math.min(d, 12 - d);
  if (signDistance === 0) return { type: "same_sign", zh: "同宮", angleTh: "ราศีเดียวกัน", signDistance };
  if (signDistance === 2) return { type: "sextile", zh: "六合/六分", angleTh: "หกสิบ", signDistance };
  if (signDistance === 3) return { type: "square", zh: "刑/方", angleTh: "ฉาก", signDistance };
  if (signDistance === 4) return { type: "trine", zh: "三合/拱", angleTh: "ตรีโกณ", signDistance };
  if (signDistance === 6) return { type: "opposition", zh: "沖/對", angleTh: "เล็ง", signDistance };
  return null;
}

function chartLabel(b: PairBirthData, idx: number) {
  return b.name || `คนที่ ${idx + 1}`;
}

function renderPacketBlock(science: ScienceId, payload: unknown): string {
  return [
    `\n=== PAIR_INTERACTION_PACKET ${science} · CLOSED_LIST ===`,
    "รายการข้ามดวงด้านล่างคำนวณจากระบบแล้วเท่านั้น · AI ห้ามสร้างปฏิกิริยาข้ามดวงเพิ่มนอกลิสต์นี้",
    JSON.stringify(payload, null, 2),
    "=== END_PAIR_INTERACTION_PACKET ===",
  ].join("\n");
}

function birthTimeMode(b: PairBirthData) {
  return b.hasTime ? "known" : "unknown_no_time";
}

function westernTargets(chart: WesternChart, owner: "A" | "B", includeTimePoints = true) {
  const planets = chart.planets
    .filter((p) => CORE_WESTERN.has(p.name))
    .map((p) => ({
      owner,
      kind: "planet" as const,
      name: p.name,
      nameTh: p.nameTh,
      lon: p.lon,
      declination: p.declination,
      antisciaLon: p.antisciaLon,
      contraAntisciaLon: p.contraAntisciaLon,
    }));
  const points = includeTimePoints ? [
    ...(chart.ascendant != null ? [{ owner, kind: "angle" as const, name: "Ascendant", nameTh: "ลัคนา", lon: chart.ascendant, declination: null }] : []),
    ...(chart.mc != null ? [{ owner, kind: "angle" as const, name: "MC", nameTh: "กลางฟ้า", lon: chart.mc, declination: null }] : []),
    ...(chart.partOfFortune ? [{ owner, kind: "point" as const, name: "Part of Fortune", nameTh: "จุดโชค", lon: chart.partOfFortune.lon, declination: null }] : []),
  ] : [];
  return { planets, points, all: [...planets, ...points] };
}

function westernPair(a: PairBirthData, b: PairBirthData, refDate: Date) {
  const A = westernChart(a.dtUTC, a.lat, a.lng, a.hasTime, a.gender, refDate);
  const B = westernChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender, refDate);
  const bothHaveTime = A.hasBirthTime && B.hasBirthTime;
  const ta = westernTargets(A, "A", bothHaveTime);
  const tb = westernTargets(B, "B", bothHaveTime);
  const aspects: Array<{ fromOwner: "A" | "B"; from: string; fromKind: string; toOwner: "A" | "B"; to: string; toKind: string; type: string; zh: string; angleTh: string; orb: number }> = [];
  for (const x of ta.planets) {
    for (const y of tb.all) {
      const luminary = x.name === "Sun" || x.name === "Moon" || y.name === "Sun" || y.name === "Moon";
      const point = y.kind !== "planet";
      const asp = zodiacAspectByLon(x.lon, y.lon, point ? 3 : luminary ? 7 : 5);
      if (asp) aspects.push({ fromOwner: x.owner, from: x.name, fromKind: x.kind, toOwner: y.owner, to: y.name, toKind: y.kind, ...asp });
    }
  }
  for (const x of tb.planets) {
    for (const y of ta.points) {
      const asp = zodiacAspectByLon(x.lon, y.lon, 3);
      if (asp) aspects.push({ fromOwner: x.owner, from: x.name, fromKind: x.kind, toOwner: y.owner, to: y.name, toKind: y.kind, ...asp });
    }
  }

  const overlays: Array<{ fromOwner: "A" | "B"; planet: string; toOwner: "A" | "B"; house: number; signTh: string }> = [];
  const overlayPlanets = (from: "A" | "B", fromChart: WesternChart, to: "A" | "B", toChart: WesternChart) => {
    if (toChart.ascendant == null) return;
    for (const p of fromChart.planets.filter((x) => PERSONAL_WESTERN.has(x.name))) {
      const h = houseOf(p.lon, toChart.ascendant, "whole");
      overlays.push({ fromOwner: from, planet: p.name, toOwner: to, house: h, signTh: SIGN_TH[Math.floor(p.lon / 30)] });
    }
  };
  if (bothHaveTime) {
    overlayPlanets("A", A, "B", B);
    overlayPlanets("B", B, "A", A);
  }

  const hiddenContacts: Array<{ fromOwner: "A" | "B"; from: string; toOwner: "A" | "B"; to: string; type: "antiscia" | "contra_antiscia" | "parallel" | "contraparallel"; orb: number }> = [];
  const crossHidden = (pa: (typeof ta.planets)[number], pb: (typeof tb.planets)[number]) => {
    const anti = angleDiff(pa.antisciaLon, pb.lon);
    if (anti <= 1) hiddenContacts.push({ fromOwner: pa.owner, from: pa.name, toOwner: pb.owner, to: pb.name, type: "antiscia", orb: r2(anti) });
    const contra = angleDiff(pa.contraAntisciaLon, pb.lon);
    if (contra <= 1) hiddenContacts.push({ fromOwner: pa.owner, from: pa.name, toOwner: pb.owner, to: pb.name, type: "contra_antiscia", orb: r2(contra) });
    const par = Math.abs(pa.declination - pb.declination);
    if (par <= 1 && Math.sign(pa.declination || 0.0001) === Math.sign(pb.declination || 0.0001)) {
      hiddenContacts.push({ fromOwner: pa.owner, from: pa.name, toOwner: pb.owner, to: pb.name, type: "parallel", orb: r2(par) });
    }
    const contraPar = Math.abs(pa.declination + pb.declination);
    if (contraPar <= 1 && Math.sign(pa.declination || 0.0001) !== Math.sign(pb.declination || 0.0001)) {
      hiddenContacts.push({ fromOwner: pa.owner, from: pa.name, toOwner: pb.owner, to: pb.name, type: "contraparallel", orb: r2(contraPar) });
    }
  };
  for (const pa of ta.planets.filter((p) => PERSONAL_WESTERN.has(p.name))) {
    for (const pb of tb.planets.filter((p) => PERSONAL_WESTERN.has(p.name))) crossHidden(pa, pb);
  }

  const spouseA = A.gender === "M" ? "Moon" : "Sun";
  const spouseB = B.gender === "M" ? "Moon" : "Sun";
  return {
    discipline: "western",
    packetVersion: "western-pair-v1",
    pair: { A: chartLabel(a, 0), B: chartLabel(b, 1) },
    birthTimeMode: { A: birthTimeMode(a), B: birthTimeMode(b) },
    timeLimitedByUnknownBirthTime: bothHaveTime ? null : "No-time pair mode keeps planet-to-planet synastry only; angle, lot, chart-ruler and house-overlay synastry are closed.",
    rule: bothHaveTime
      ? "closed-list synastry: tropical major aspects + whole-sign house overlays + antiscia/declination contacts"
      : "closed-list no-time synastry: tropical planet-to-planet major aspects + antiscia/declination contacts only; no angles/lots/houses",
    data: {
      spouseSignificators: { A: spouseA, B: spouseB, rule: "Ptolemy-style: male chart uses Moon, female chart uses Sun" },
      aspects: aspects.sort((x, y) => x.orb - y.orb).slice(0, 60),
      houseOverlays: overlays,
      hiddenContacts: hiddenContacts.sort((x, y) => x.orb - y.orb).slice(0, 40),
    },
    notAvailable: [
      ...(!A.hasBirthTime || !B.hasBirthTime ? ["houseOverlayRequiresBothBirthTimes"] : []),
      "fixedStarSynastry",
    ],
  };
}

const TARA: Record<number, { name: string; th: string; tone: "support" | "mixed" | "stress" }> = {
  1: { name: "Janma", th: "ชนมะ/ไวต่อกัน", tone: "mixed" },
  2: { name: "Sampat", th: "ทรัพย์/เกื้อหนุน", tone: "support" },
  3: { name: "Vipat", th: "วิบัติ/สะดุด", tone: "stress" },
  4: { name: "Kshema", th: "เกษม/สบายใจ", tone: "support" },
  5: { name: "Pratyari", th: "ปะทะ/ต้าน", tone: "stress" },
  6: { name: "Sadhaka", th: "สำเร็จ/ช่วยผลัก", tone: "support" },
  7: { name: "Naidhana", th: "หนัก/บั่นทอน", tone: "stress" },
  8: { name: "Mitra", th: "มิตร", tone: "support" },
  9: { name: "Paramamitra", th: "มิตรยิ่ง", tone: "support" },
};

function taraFrom(from: VedicChart, to: VedicChart) {
  const count = ((to.moonNakshatra.index - from.moonNakshatra.index + 27) % 27) + 1;
  const taraNo = ((count - 1) % 9) + 1;
  const t = TARA[taraNo];
  return {
    fromMoonNakshatra: from.moonNakshatra.name,
    toMoonNakshatra: to.moonNakshatra.name,
    count,
    taraNo,
    tara: t.name,
    meaningTh: t.th,
    tone: t.tone,
  };
}

function rashiRelation(fromSign: number, toSign: number) {
  const distance = ((toSign - fromSign + 12) % 12) + 1;
  const type =
    distance === 1 ? "same_rashi" :
    distance === 7 ? "sama_saptama/opposition" :
    distance === 5 || distance === 9 ? "trikona" :
    distance === 4 || distance === 10 ? "kendra" :
    distance === 6 || distance === 8 ? "shadashtaka" :
    distance === 2 || distance === 12 ? "dwi_dwadasha" :
    "upachaya_3_11";
  return { from: RASHI_TH[fromSign], to: RASHI_TH[toSign], distance, type };
}

const DRISHTI: Partial<Record<GrahaKey, number[]>> = {
  Sun: [7], Moon: [7], Mercury: [7], Venus: [7],
  Mars: [4, 7, 8], Jupiter: [5, 7, 9], Saturn: [3, 7, 10],
};

function vedicPair(a: PairBirthData, b: PairBirthData, refDate: Date) {
  const A = vedicChart(a.dtUTC, a.lat, a.lng, a.hasTime, refDate);
  const B = vedicChart(b.dtUTC, b.lat, b.lng, b.hasTime, refDate);
  const bothHaveTime = A.hasTime && B.hasTime;
  const grahaByName = (chart: VedicChart, name: GrahaKey) => chart.grahas.find((g) => g.name === name);
  const drishti: Array<{ fromOwner: "A" | "B"; from: string; toOwner: "A" | "B"; to: string; fromRashi: string; toRashi: string; aspectHouse: number }> = [];
  const scanDrishti = (fromOwner: "A" | "B", fromChart: VedicChart, toOwner: "A" | "B", toChart: VedicChart) => {
    for (const g of fromChart.grahas) {
      const houses = DRISHTI[g.name] || [];
      for (const target of toChart.grahas) {
        const aspectHouse = ((target.rashi - g.rashi + 12) % 12) + 1;
        if (houses.includes(aspectHouse)) {
          drishti.push({
            fromOwner, from: g.name, toOwner, to: target.name,
            fromRashi: RASHI_TH[g.rashi], toRashi: RASHI_TH[target.rashi], aspectHouse,
          });
        }
      }
    }
  };
  scanDrishti("A", A, "B", B);
  scanDrishti("B", B, "A", A);

  const degreeContacts: Array<{ a: string; b: string; type: "same_degree_same_rashi" | "same_degree_opposite_rashi"; orb: number; rashi: string }> = [];
  for (const ga of A.grahas) {
    for (const gb of B.grahas) {
      const sameDegOrb = Math.abs(ga.rashiDeg - gb.rashiDeg);
      if (ga.rashi === gb.rashi && sameDegOrb <= 3) {
        degreeContacts.push({ a: ga.name, b: gb.name, type: "same_degree_same_rashi", orb: r2(sameDegOrb), rashi: RASHI_TH[ga.rashi] });
      }
      if ((ga.rashi + 6) % 12 === gb.rashi && sameDegOrb <= 3) {
        degreeContacts.push({ a: ga.name, b: gb.name, type: "same_degree_opposite_rashi", orb: r2(sameDegOrb), rashi: `${RASHI_TH[ga.rashi]}-${RASHI_TH[gb.rashi]}` });
      }
    }
  }

  const overlays: Array<{ fromOwner: "A" | "B"; graha: string; toOwner: "A" | "B"; bhava: number }> = [];
  const scanOverlay = (fromOwner: "A" | "B", fromChart: VedicChart, toOwner: "A" | "B", toChart: VedicChart) => {
    if (!toChart.lagna) return;
    for (const g of fromChart.grahas) overlays.push({ fromOwner, graha: g.name, toOwner, bhava: houseOf(g.sidLon, toChart.lagna.sidLon, "whole") });
  };
  if (bothHaveTime) {
    scanOverlay("A", A, "B", B);
    scanOverlay("B", B, "A", A);
  }

  // Ashtakoota (Guna Milan 36) — จากจันทร์ sidereal ของทั้งคู่ (deterministic · ตาราง saravali CC BY-SA 4.0)
  // bride/groom ตามเพศจริง; ถ้าเพศเดียวกัน/ไม่ชัด ใช้ A=bride ตามลำดับที่ส่งมา (แจ้งใน roleRule)
  let ashtakootaBlock: {
    roleRule: string;
    brideChart: "A" | "B";
    groomChart: "A" | "B";
    confidence: string;
    result: AshtakootaResult;
  } | null = null;
  try {
    const moonA = grahaByName(A, "Moon");
    const moonB = grahaByName(B, "Moon");
    if (moonA && moonB) {
      const brideChart: "A" | "B" = b.gender === "F" && a.gender !== "F" ? "B" : "A";
      const groomChart: "A" | "B" = brideChart === "A" ? "B" : "A";
      const moonOf = (o: "A" | "B") => (o === "A" ? moonA : moonB);
      const bm = moonOf(brideChart);
      const gm = moonOf(groomChart);
      ashtakootaBlock = {
        roleRule: a.gender !== b.gender
          ? "bride=ฝ่ายหญิง (F) · groom=ฝ่ายชาย ตามกติกา Guna Milan"
          : "เพศเดียวกัน/ไม่ระบุคู่ชายหญิง → ใช้คนแรก(A)=bride คนที่สอง(B)=groom โดยสัญนิยม (คะแนน kuta ที่ไม่สมมาตรให้อ่านเป็นแนวโน้ม ไม่ใช่คำตัดสินบทบาท)",
        brideChart,
        groomChart,
        confidence: bothHaveTime ? "confirmed_birth_time" : "conditional_no_birth_time_moon_may_shift",
        result: ashtakoota(
          { nakshatraIndex: bm.nakshatra.index, rashi: bm.rashi, rashiDeg: bm.rashiDeg },
          { nakshatraIndex: gm.nakshatra.index, rashi: gm.rashi, rashiDeg: gm.rashiDeg },
        ),
      };
    }
  } catch { ashtakootaBlock = null; /* ล้ม = degrade ชัดเจนผ่าน notAvailable */ }

  const dashaCross = (owner: "A" | "B", chart: VedicChart, other: VedicChart) => {
    const current = [chart.vimshottari.currentMaha?.lord, chart.vimshottari.currentAntar?.lord].filter((x): x is GrahaKey => !!x);
    return current.map((lord) => {
      const inOther = grahaByName(other, lord);
      return {
        owner,
        dashaLord: lord,
        dashaLordTh: GRAHA_TH[lord],
        otherChartRashi: inOther ? RASHI_TH[inOther.rashi] : null,
        otherChartHouse: inOther?.house ?? null,
        otherChartDignity: inOther?.dignity ?? null,
      };
    });
  };

  return {
    discipline: "vedic",
    packetVersion: "vedic-pair-v1",
    pair: { A: chartLabel(a, 0), B: chartLabel(b, 1) },
    birthTimeMode: { A: birthTimeMode(a), B: birthTimeMode(b) },
    timeLimitedByUnknownBirthTime: bothHaveTime ? null : "No-time pair mode keeps rashi/graha drishti contacts and marks Moon-based compatibility conditional; Lagna, bhava overlays, Navamsa synastry and dasha cross-reference are closed.",
    rule: bothHaveTime
      ? "closed-list Jyotish compatibility cues: Moon tara, Ashtakoota 36 (guna milan), rashi relations, Parashari graha drishti, bhava overlays, current dasha cross-reference"
      : "closed-list no-time Jyotish cues: graha rashi/drishti contacts; Moon tara/rashi/Ashtakoota are conditional if birth time is unknown",
    data: {
      moonBasedCompatibility: {
        confidence: bothHaveTime ? "confirmed_birth_time" : "conditional_no_birth_time_moon_may_shift",
        taraBala: { A_to_B: taraFrom(A, B), B_to_A: taraFrom(B, A) },
        moonRashiRelation: { A_to_B: rashiRelation(grahaByName(A, "Moon")!.rashi, grahaByName(B, "Moon")!.rashi), B_to_A: rashiRelation(grahaByName(B, "Moon")!.rashi, grahaByName(A, "Moon")!.rashi) },
      },
      ashtakoota: ashtakootaBlock,
      lagnaRashiRelation: A.lagna && B.lagna ? { A_to_B: rashiRelation(A.lagna.rashi, B.lagna.rashi), B_to_A: rashiRelation(B.lagna.rashi, A.lagna.rashi) } : null,
      parashariDrishti: drishti.slice(0, 80),
      degreeContacts: degreeContacts.sort((x, y) => x.orb - y.orb).slice(0, 40),
      bhavaOverlays: overlays,
      currentDashaCrossReferences: bothHaveTime ? [...dashaCross("A", A, B), ...dashaCross("B", B, A)] : [],
    },
    notAvailable: [
      ...(!bothHaveTime ? ["lagnaRelation", "bhavaOverlay", "navamsaSynastry", "vimshottariCrossReferenceRequiresConfirmedMoon"] : []),
      ...(ashtakootaBlock ? [] : ["ashtakootaScore"]),
      "navamsaSynastry",
    ],
  };
}

const BRANCH_INDEX = Object.fromEntries(BRANCHES.map((b, i) => [b, i])) as Record<string, number>;
const LIUHE: Record<string, string> = { 子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯", 辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午" };
const SANHE = [
  { branches: ["申", "子", "辰"], element: "水" },
  { branches: ["亥", "卯", "未"], element: "木" },
  { branches: ["寅", "午", "戌"], element: "火" },
  { branches: ["巳", "酉", "丑"], element: "金" },
];

function ziweiBranchRel(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return null;
  const ia = BRANCH_INDEX[a], ib = BRANCH_INDEX[b];
  const diff = Math.abs(ia - ib);
  const d = Math.min(diff, 12 - diff);
  const sameSanhe = SANHE.find((g) => g.branches.includes(a) && g.branches.includes(b));
  return {
    a, b,
    type: a === b ? "same_branch" : d === 6 ? "opposition" : LIUHE[a] === b ? "六合" : sameSanhe ? "三合" : "none",
    element: sameSanhe?.element ?? null,
  };
}

function palace(chart: ZiweiChart, name: PalaceName): ZiweiPalace | null {
  return chart.palaces.find((p) => p.name === name) || null;
}

function findZiweiStar(chart: ZiweiChart, star: string) {
  for (const p of chart.palaces) {
    if (p.majorStars.some((s) => s.name === star) || p.minorStars.some((s) => s.name === star)) {
      return { palaceName: p.name, branch: p.branch, isMajor: p.majorStars.some((s) => s.name === star) };
    }
  }
  return null;
}

function starsAt(chart: ZiweiChart, name: PalaceName): string[] {
  const p = palace(chart, name);
  return p ? [...p.majorStars.map((s) => s.name), ...p.minorStars.map((s) => s.name)] : [];
}

function ziweiPair(a: PairBirthData, b: PairBirthData, refDate: Date) {
  const A = ziweiChart(a.dtUTC, a.lat, a.lng, a.gender, a.hasTime, { refDate });
  const B = ziweiChart(b.dtUTC, b.lat, b.lng, b.gender, b.hasTime, { refDate });
  const bothHaveTime = A.hasTime && B.hasTime;
  const crossSiHua = [
    ...A.siHua.map((s) => ({ fromOwner: "A", star: s.star, type: s.type, inOtherChart: findZiweiStar(B, s.star) })),
    ...B.siHua.map((s) => ({ fromOwner: "B", star: s.star, type: s.type, inOtherChart: findZiweiStar(A, s.star) })),
  ];
  const focalPalaces: PalaceName[] = ["命宮", "夫妻", "財帛", "官祿", "福德"];
  const focalStarOverlaps: Array<{ palace: PalaceName; stars: string[] }> = [];
  for (const name of focalPalaces) {
    const both = starsAt(A, name).filter((s) => starsAt(B, name).includes(s));
    if (both.length) focalStarOverlaps.push({ palace: name, stars: both });
  }

  return {
    discipline: "ziwei",
    packetVersion: "ziwei-pair-v1",
    pair: { A: chartLabel(a, 0), B: chartLabel(b, 1) },
    birthTimeMode: { A: birthTimeMode(a), B: birthTimeMode(b) },
    timeLimitedByUnknownBirthTime: bothHaveTime ? null : "No-time pair mode closes 命宮/身宮/夫妻宮/12宮/大限/cross-palace 四化; only each person's birth-year 四化 names remain as non-cross context.",
    rule: bothHaveTime
      ? "closed-list Zi Wei cross-chart cues: 命/身 branch relation, 夫妻↔命 relation, 四化 star cross-location, focal palace star overlap"
      : "closed-list no-time Zi Wei context: birth-year 四化 only; no cross-palace compatibility cues",
    data: bothHaveTime ? {
      mingGongRelation: ziweiBranchRel(A.mingGong?.branch, B.mingGong?.branch),
      shenGongRelation: ziweiBranchRel(A.shenGong?.branch, B.shenGong?.branch),
      spouseToLifeRelations: {
        A_spouse_to_B_life: ziweiBranchRel(palace(A, "夫妻")?.branch, B.mingGong?.branch),
        B_spouse_to_A_life: ziweiBranchRel(palace(B, "夫妻")?.branch, A.mingGong?.branch),
      },
      crossSiHua,
      focalStarOverlaps,
      daXianWindows: {
        A: A.palaces.map((p) => ({ palace: p.name, ageStart: p.daXian.ageStart, ageEnd: p.daXian.ageEnd })),
        B: B.palaces.map((p) => ({ palace: p.name, ageStart: p.daXian.ageStart, ageEnd: p.daXian.ageEnd })),
      },
    } : {
      birthYearSiHuaOnly: {
        A: A.siHua.map((s) => ({ star: s.star, type: s.type })),
        B: B.siHua.map((s) => ({ star: s.star, type: s.type })),
      },
    },
    notAvailable: [
      ...(!bothHaveTime ? ["mingGongRelation", "shenGongRelation", "spousePalaceRelation", "crossSiHuaPalaceLocation", "crossPalaceStars", "daXianWindows"] : []),
    ],
  };
}

function qzStarClass(r: ReturnType<typeof qizhengNatal>["reading"], key: string, hasBirthTime = true) {
  if (!hasBirthTime) return STARS[key]?.kind || "star_position_only";
  if (r.yongshen.key === key) return "命主";
  if (r.en_stars.some((s) => s.key === key)) return "恩星";
  if (r.yong_stars.some((s) => s.key === key)) return "用星";
  if (r.chou_stars.some((s) => s.key === key)) return "仇星";
  if (r.nan_stars.some((s) => s.key === key)) return "難星";
  return STARS[key]?.kind || "neutral";
}

function qizhengPair(a: PairBirthData, b: PairBirthData) {
  const A = qizhengNatal(a.dtUTC, a.lat, a.lng, a.hasTime);
  const B = qizhengNatal(b.dtUTC, b.lat, b.lng, b.hasTime);
  const bothHaveTime = A.hasBirthTime && B.hasBirthTime;
  const ar = A.reading, br = B.reading;
  const importantA = ar.stars.filter((s) => QIZHENG_IMPORTANT.has(s.key));
  const importantB = br.stars.filter((s) => QIZHENG_IMPORTANT.has(s.key));
  const starAspects: Array<{ fromOwner: "A" | "B"; from: string; fromClass: string; toOwner: "A" | "B"; to: string; toClass: string; relation: string; zh: string; signDistance: number }> = [];
  const scan = (fromOwner: "A" | "B", source: typeof importantA, sourceReading: typeof ar, sourceHasTime: boolean, toOwner: "A" | "B", target: typeof importantB, targetReading: typeof br, targetHasTime: boolean) => {
    for (const s of source) {
      for (const t of target) {
        const rel = zodiacAspectBySign(s.sign, t.sign);
        if (rel) starAspects.push({
          fromOwner, from: s.zh, fromClass: qzStarClass(sourceReading, s.key, sourceHasTime),
          toOwner, to: t.zh, toClass: qzStarClass(targetReading, t.key, targetHasTime),
          relation: rel.type, zh: rel.zh, signDistance: rel.signDistance,
        });
      }
    }
  };
  scan("A", importantA, ar, bothHaveTime, "B", importantB, br, bothHaveTime);
  scan("B", importantB, br, bothHaveTime, "A", importantA, ar, bothHaveTime);

  const ascRel = bothHaveTime ? zodiacAspectBySign(ar.ascendant.sign, br.ascendant.sign) : null;
  const spouseOverlay = (owner: "A" | "B", source: typeof ar, targetOwner: "A" | "B", targetNatal: ReturnType<typeof qizhengNatal>) => {
    const spouseHouse = targetNatal.houses.find((h) => h.zh === "妻妾");
    if (!spouseHouse) return [];
    const spouseSign = SIGNS.findIndex((s) => s.th === spouseHouse.signTh);
    return source.stars
      .filter((s) => s.sign === spouseSign)
      .map((s) => ({ fromOwner: owner, star: s.zh, starTh: s.th, starClass: qzStarClass(source, s.key), toOwner: targetOwner, targetHouse: "妻妾", targetSign: spouseHouse.signZh, status: s.status }));
  };

  return {
    discipline: "qizheng",
    packetVersion: "qizheng-pair-v1",
    pair: { A: chartLabel(a, 0), B: chartLabel(b, 1) },
    birthTimeMode: { A: birthTimeMode(a), B: birthTimeMode(b) },
    timeLimitedByUnknownBirthTime: bothHaveTime ? null : "No-time pair mode keeps star sign contacts only; 命宮/命主/恩用仇難/12宮/妻妾 overlays are closed because they require birth time.",
    rule: bothHaveTime
      ? "closed-list Guolao cues: 命宮 sign relation, 命主/恩用仇難 star aspects by sign, partner 妻妾-house overlays"
      : "closed-list no-time Guolao cues: 七政四餘 star sign contacts only; no 命宮/命主/恩用仇難/12宮 overlays",
    data: {
      ...(bothHaveTime ? {
      mingGongRelation: ascRel ? {
        A_sign: ar.ascendant.signZh,
        B_sign: br.ascendant.signZh,
        relation: ascRel.type,
        zh: ascRel.zh,
        signDistance: ascRel.signDistance,
      } : { A_sign: ar.ascendant.signZh, B_sign: br.ascendant.signZh, relation: "none" },
      mingZhu: {
        A: { star: ar.yongshen.zh, sign: ar.stars.find((s) => s.key === ar.yongshen.key)?.signZh ?? null, status: ar.yongshen.status },
        B: { star: br.yongshen.zh, sign: br.stars.find((s) => s.key === br.yongshen.key)?.signZh ?? null, status: br.yongshen.status },
      },
      } : {}),
      starAspects: starAspects.slice(0, 80),
      ...(bothHaveTime ? { spouseHouseOverlays: [...spouseOverlay("A", ar, "B", B), ...spouseOverlay("B", br, "A", A)] } : {}),
    },
    notAvailable: [
      ...(!bothHaveTime ? ["mingGongRelation", "mingZhu", "enYongChouNanClass", "12houses", "spouseHouseOverlays"] : []),
    ],
  };
}

// ยูเรเนียน synastry (r393) — radix-radix · ไม่พึ่ง refDate (timing แยก r2k-5) · reuse uranianChart เดิม
function uranianPair(a: PairBirthData, b: PairBirthData) {
  const A = uranianChart(a.dtUTC, a.lat, a.lng, a.hasTime, a.gender);
  const B = uranianChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender);
  return uranianSynastry(A, B, chartLabel(a, 0), chartLabel(b, 1));
}

function pairPayload(science: ScienceId, a: PairBirthData, b: PairBirthData, refDate: Date): unknown {
  if (science === "western") return westernPair(a, b, refDate);
  if (science === "vedic") return vedicPair(a, b, refDate);
  if (science === "ziwei") return ziweiPair(a, b, refDate);
  if (science === "qizheng") return qizhengPair(a, b);
  if (science === "uranian") return uranianPair(a, b);
  return null;
}

export function renderPairInteractionPacket(science: ScienceId, births: PairBirthData[], refDate: Date): string {
  // 2 ดวง = path เดิม (output คงเดิม byte-identical)
  if (births.length === 2) {
    const payload = pairPayload(science, births[0], births[1], refDate);
    return payload ? renderPacketBlock(science, payload) : "";
  }
  if (births.length < 2 || births.length > 4) return "";
  // กลุ่ม 3-4 ดวง: คำนวณทุกคู่ i<j (3 ดวง=3 คู่ · 4 ดวง=6 คู่) · reuse pair builder เดิมทีละคู่ ไม่แก้สูตร
  const pairCount = (births.length * (births.length - 1)) / 2;
  const blocks: string[] = [];
  for (let i = 0; i < births.length; i++) {
    for (let j = i + 1; j < births.length; j++) {
      const payload = pairPayload(science, births[i], births[j], refDate);
      if (!payload) continue;
      blocks.push([
        `--- คู่ ${chartLabel(births[i], i)}×${chartLabel(births[j], j)} (ในคู่นี้ A=${chartLabel(births[i], i)} · B=${chartLabel(births[j], j)}) ---`,
        JSON.stringify(payload, null, 2),
      ].join("\n"));
    }
  }
  if (!blocks.length) return "";
  return [
    `\n=== PAIR_INTERACTION_PACKET ${science} · CLOSED_LIST · ${pairCount} คู่ (กลุ่ม ${births.length} ดวง) ===`,
    "รายการข้ามดวงด้านล่างคำนวณจากระบบแล้วเท่านั้น · AI ห้ามสร้างปฏิกิริยาข้ามดวงเพิ่มนอกลิสต์นี้ · อ่านทีละคู่ตามหัว 'คู่ ชื่อ×ชื่อ' และห้ามสลับ A/B ข้ามคู่",
    ...blocks,
    "=== END_PAIR_INTERACTION_PACKET ===",
  ].join("\n");
}
