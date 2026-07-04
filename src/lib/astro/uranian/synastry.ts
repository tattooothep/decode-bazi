/**
 * ปฏิกิริยาข้ามดวงยูเรเนียน (Uranian synastry · vergleichende Astrologie) — r393
 * ════════════════════════════════════════════════════════════════════════
 * รับ UranianChart 2 ดวง (จาก uranianChart() เดิม · ไม่คำนวณดาราศาสตร์ใหม่) → สัมผัสข้ามดวง + orb
 * ซื่อตรงต่อคัมภีร์ Witte „Vergleichende Astrologie" (หมวด F · บท 42) + Sonnensumme (บท 02) +
 * Halbsumme ☉|☽ / Summe = Spiegelpunkt zum Widderpunkt (บท 19) + จุดไวข้ามดวง (บท 16/41)
 *
 * กฎข้อ 9 (Decode): engine ส่ง structured JSON เท่านั้น · AI อ่านความหมาย verbatim จากคัมภีร์หมวด F/H
 *   → ห้าม engine ตัดสิน „เข้ากัน/ไม่เข้ากัน" เป็นคะแนน (NO_PERCENT)
 * reuse: midpointLon / dial90Distance (engine export) · norm360 (astro-core) — ไม่มี Date.now/random
 *
 * ⚠️ ไม่แตะ engine.ts / packet.ts / render.ts / auslosung.ts (LOCKED · additive ล้วน · import อ่านอย่างเดียว)
 * TNP ใน synastry = เฟส 2 (precision ±1–2° ไม่พอ orb 1.0° ข้ามดวง · จดไว้)
 * house overlay (กฎ 4 บท 42) + crossAntiscia (C5) = เฟส 1.5/r2k-4.5 · pair timing = r2k-5
 */
import { midpointLon, dial90Distance, type UranianChart, type UranianPoint } from "./engine";
import { norm360 } from "../../astro-core/ephemeris";

export type CrossOwner = "A" | "B";

/** สัมผัสข้ามดวง 1 รายการ (ชนิด C1–C4) */
export type UranianCrossContact = {
  kind: "crossMidpointPicture" | "crossSensitivePoint" | "personalDirectContact" | "connectionMidpoint";
  baseOwner: CrossOwner;            // เจ้าของครึ่งผลรวม/จุดไว/จุดส่วนตัว
  hitOwner: CrossOwner;             // เจ้าของดาว/จุดที่มากระตุ้น
  a: string; b?: string;           // ดาวคู่ที่สร้างครึ่งผลรวม/จุดไว (b ว่างสำหรับ C3 direct)
  aTh: string; bTh?: string;
  activatedBy: string;             // ดาว/จุดของ hitOwner ที่ตกทับ
  activatedByTh: string;
  pointLon: number;                // ลองจิจูดจุดที่ถูกกระตุ้น (สากล 0-360)
  pointSignTh: string; pointSignDeg: number;
  orbDeg: number;                  // ระยะบนหน้าปัด 90° (0..45)
  formula: string;
  touchesPersonal: boolean;        // แตะ ☉/MC/Asc ฝั่งใดฝั่งหนึ่ง
  moonUncertain?: boolean;         // มีจันทร์ของดวงไม่มีเวลาร่วม
  canonRef: string;
};

/** จุดเชื่อมสองดวง (Sonnensumme บท 02 · ☉☽-Summe บท 19 · MC-Summe บท 02 „Spitzen X") */
export type UranianConnectionPoint = {
  kind: "sonnensumme" | "sun_moon_summe" | "mc_summe";
  baseOwner: CrossOwner | "AB";    // AB = จุดร่วม (บวกดาวสองดวง) · A/B = Summe ของดวงนั้น (บท 19)
  formula: string;
  midLon: number; midSignTh: string; midSignDeg: number;
  occupants: Array<{ owner: CrossOwner; name: string; nameTh: string; orbDeg: number }>;
  canonRef: string;
};

export type UranianSynastryPacket = {
  discipline: "uranian";
  packetVersion: "uranian-synastry-v1";
  pair: { A: string; B: string };
  birthTimeMode: { A: "known" | "unknown_no_time"; B: "known" | "unknown_no_time" };
  rule: string;
  orbCrossDeg: number;
  data: {
    contacts: UranianCrossContact[];
    connectionPoints: UranianConnectionPoint[];
  };
  notAvailable: string[];
};

const ORB_CROSS_DEG = 1.0;          // เข้มกว่า natal picture (1.5°) เพราะข้ามดวงมีคู่เป็นไปได้มากกว่า (A×B) · Witte „scharfe Aspekte" บท 16 (ไม่ให้เลข → ค่าสากล)
const MAX_CONTACTS = 80;

/** จุดส่วนตัวเด่น (ถ่วงน้ำหนัก · Anareta บท 16/30 · ☉=Auslöser บท 12) — ตรงกับ engine PERSONAL_PROMINENT */
const PERSONAL = new Set(["Sun", "Meridian", "Ascendant"]);
/** เป้าไว synastry เต็มตัว (บท 42 Mondknoten=จุดเชื่อมชาย-หญิง · บท 19 ☉☽=Freundschaft/Ehe) */
const RELATIONAL_PERSONAL = new Set(["Sun", "Moon", "Meridian", "Ascendant", "Node"]);

const anyPersonal = (...names: (string | undefined)[]) => names.some((n) => n != null && PERSONAL.has(n));
const anyMoonUncertain = (...pts: (UranianPoint | undefined)[]) => pts.some((p) => p?.uncertain === true);

const SIGN_TH = [
  "เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์",
  "ตุล", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน",
] as const;
const signOf = (lon: number) => {
  const L = norm360(lon), s = Math.floor(L / 30);
  return { signTh: SIGN_TH[s], signDeg: +(L - s * 30).toFixed(4) };
};

/** point ของ chart ที่เป็นเป้าไว synastry (personalPoints มี ☉☽MC Asc Node แล้ว) */
const relationalPoints = (c: UranianChart): UranianPoint[] =>
  c.personalPoints.filter((p) => RELATIONAL_PERSONAL.has(p.name));

/** ครึ่งผลรว/จุดไว (C1/C2/C4) ถูกดาว/จุด hit กระตุ้น */
function makeContact(
  kind: UranianCrossContact["kind"],
  baseOwner: CrossOwner, hitOwner: CrossOwner,
  a: UranianPoint, b: UranianPoint, q: UranianPoint,
  pointLon: number, orb: number, formula: string, canonRef: string,
): UranianCrossContact {
  const { signTh, signDeg } = signOf(pointLon);
  const c: UranianCrossContact = {
    kind, baseOwner, hitOwner,
    a: a.name, b: b.name, aTh: a.nameTh, bTh: b.nameTh,
    activatedBy: q.name, activatedByTh: q.nameTh,
    pointLon: +norm360(pointLon).toFixed(4), pointSignTh: signTh, pointSignDeg: signDeg,
    orbDeg: +orb.toFixed(3), formula,
    touchesPersonal: anyPersonal(a.name, b.name, q.name),
    canonRef,
  };
  if (anyMoonUncertain(a, b, q)) c.moonUncertain = true;
  return c;
}

/** จุดส่วนตัว base ↔ ดาว/จุด hit (มุมแข็งบนหน้าปัด 90° · C3) */
function makeContactDirect(
  baseOwner: CrossOwner, hitOwner: CrossOwner,
  p: UranianPoint, q: UranianPoint, orb: number, canonRef: string,
): UranianCrossContact {
  const { signTh, signDeg } = signOf(p.lon);
  const c: UranianCrossContact = {
    kind: "personalDirectContact", baseOwner, hitOwner,
    a: p.name, aTh: p.nameTh,
    activatedBy: q.name, activatedByTh: q.nameTh,
    pointLon: +norm360(p.lon).toFixed(4), pointSignTh: signTh, pointSignDeg: signDeg,
    orbDeg: +orb.toFixed(3),
    formula: `${baseOwner}.${p.name} ↔ ${hitOwner}.${q.name} = สัมผัสตรง (มุมแข็งบนหน้าปัด 90°)`,
    touchesPersonal: anyPersonal(p.name, q.name),
    canonRef,
  };
  if (anyMoonUncertain(p, q)) c.moonUncertain = true;
  return c;
}

/** C4 · จุดเชื่อมสองดวง: Sonnensumme (บท 02) · ☉☽-Summe (บท 19) · MC-Summe (บท 02 „Spitzen X") */
function buildConnectionPoints(chartA: UranianChart, chartB: UranianChart): UranianConnectionPoint[] {
  const out: UranianConnectionPoint[] = [];
  const byName = (c: UranianChart, n: string) => c.points.find((p) => p.name === n);
  const occupantsOn = (mid: number, ...charts: Array<{ owner: CrossOwner; chart: UranianChart }>) => {
    const occ: UranianConnectionPoint["occupants"] = [];
    for (const { owner, chart } of charts) {
      for (const p of chart.points) {
        const orb = dial90Distance(p.lon, mid);
        if (orb <= ORB_CROSS_DEG) occ.push({ owner, name: p.name, nameTh: p.nameTh, orbDeg: +orb.toFixed(3) });
      }
    }
    return occ.sort((x, y) => x.orbDeg - y.orbDeg);
  };

  // 1) Sonnensumme (บท 02) — ครึ่งผลรวม A.☉|B.☉ = „จุดที่ทำให้เกิดการเชื่อม" (ต้องมีเสมอ แม้ occupants ว่าง)
  const sunA = byName(chartA, "Sun"), sunB = byName(chartB, "Sun");
  if (sunA && sunB) {
    const mid = midpointLon(sunA.lon, sunB.lon);
    const { signTh, signDeg } = signOf(mid);
    out.push({
      kind: "sonnensumme", baseOwner: "AB",
      formula: "A.☉ + B.☉ → ครึ่งผลรวม = จุดที่ทำให้เกิดการเชื่อม (Sonnensumme · บท 02)",
      midLon: +norm360(mid).toFixed(4), midSignTh: signTh, midSignDeg: signDeg,
      occupants: occupantsOn(mid, { owner: "A", chart: chartA }, { owner: "B", chart: chartB }),
      canonRef: "บท 02/19",
    });
  }

  // 2) MC-Summe (บท 02 „Spitzen der X Häuser addiert" = การเชื่อมระดับลึก) — ต้องมีเวลาทั้งคู่
  const mcA = byName(chartA, "Meridian"), mcB = byName(chartB, "Meridian");
  if (mcA && mcB) {
    const mid = midpointLon(mcA.lon, mcB.lon);
    const { signTh, signDeg } = signOf(mid);
    out.push({
      kind: "mc_summe", baseOwner: "AB",
      formula: "A.MC + B.MC → ครึ่งผลรวม = จุดเชื่อมระดับลึก (Spitzen der X Häuser · บท 02)",
      midLon: +norm360(mid).toFixed(4), midSignTh: signTh, midSignDeg: signDeg,
      occupants: occupantsOn(mid, { owner: "A", chart: chartA }, { owner: "B", chart: chartB }),
      canonRef: "บท 02",
    });
  }

  // 3) ☉☽-Summe (บท 19) — Summe(☉+☽) ของแต่ละดวง = Spiegelpunkt zum Widderpunkt = „จุดเชื่อมกับคนอื่นบนโลก"
  //    → หาดาว/จุดของ "อีกดวง" ที่ตกทับ = สัญญาณเชื่อมคน (verbatim บท 19)
  const each: Array<{ owner: CrossOwner; self: UranianChart; other: CrossOwner; otherChart: UranianChart }> = [
    { owner: "A", self: chartA, other: "B", otherChart: chartB },
    { owner: "B", self: chartB, other: "A", otherChart: chartA },
  ];
  for (const { owner, self, other, otherChart } of each) {
    const sun = byName(self, "Sun"), moon = byName(self, "Moon");
    if (!sun || !moon) continue;
    const summe = norm360(sun.lon + moon.lon);
    const { signTh, signDeg } = signOf(summe);
    out.push({
      kind: "sun_moon_summe", baseOwner: owner,
      formula: `${owner}.☉ + ${owner}.☽ = Summe (Spiegelpunkt zum Widderpunkt) = จุดเชื่อมกับคนอื่น (บท 19) · หาดาว/จุดของ ${other} ที่ตกทับ`,
      midLon: +norm360(summe).toFixed(4), midSignTh: signTh, midSignDeg: signDeg,
      occupants: occupantsOn(summe, { owner: other, chart: otherChart }),
      canonRef: "บท 19",
    });
  }

  return out;
}

/**
 * ปฏิกิริยาข้ามดวงยูเรเนียน (Uranian synastry) — เฟส 1: C1–C4 (ไม่มีเรือน/ไม่มี TNP/ไม่มี timing)
 * @param chartA/chartB  UranianChart จาก uranianChart() เดิม (radix-radix · ไม่พึ่งวันปัจจุบัน)
 * @param labelA/labelB  ชื่อ 2 คน
 */
export function uranianSynastry(
  chartA: UranianChart, chartB: UranianChart, labelA: string, labelB: string,
): UranianSynastryPacket {
  const contacts: UranianCrossContact[] = [];
  const A = chartA.points, B = chartB.points;

  // ── C1 · crossMidpointPicture: ครึ่งผลรวมของ base ถูกดาว/จุดของ hit กระตุ้น (2 ทิศ) ──
  const scanCrossPicture = (baseOwner: CrossOwner, base: UranianPoint[], hitOwner: CrossOwner, hit: UranianPoint[]) => {
    for (let i = 0; i < base.length; i++) {
      for (let j = i + 1; j < base.length; j++) {
        const mid = midpointLon(base[i].lon, base[j].lon);
        for (const q of hit) {
          const orb = dial90Distance(q.lon, mid);
          if (orb <= ORB_CROSS_DEG) contacts.push(makeContact(
            "crossMidpointPicture", baseOwner, hitOwner, base[i], base[j], q, mid, orb,
            `${baseOwner}.${base[i].name} + ${baseOwner}.${base[j].name} − ${hitOwner}.${q.name} = แกนสมมาตร (ข้ามดวง)`,
            "บท 41/16",
          ));
        }
      }
    }
  };
  scanCrossPicture("A", A, "B", B);
  scanCrossPicture("B", B, "A", A);

  // ── C2 · crossSensitivePoint: ผลรวม/ผลต่างของ base ถูกดาว/จุดของ hit กระตุ้น (2 ทิศ) ──
  const scanCrossSensitive = (baseOwner: CrossOwner, base: UranianPoint[], hitOwner: CrossOwner, hit: UranianPoint[]) => {
    for (let i = 0; i < base.length; i++) {
      for (let j = i + 1; j < base.length; j++) {
        const sum = norm360(base[i].lon + base[j].lon);
        const diff = norm360(base[i].lon - base[j].lon);
        for (const [kind, pt] of [["sum", sum], ["difference", diff]] as const) {
          for (const q of hit) {
            const orb = dial90Distance(q.lon, pt);
            if (orb <= ORB_CROSS_DEG) contacts.push(makeContact(
              "crossSensitivePoint", baseOwner, hitOwner, base[i], base[j], q, pt, orb,
              `${baseOwner}.${base[i].name} ${kind === "sum" ? "+" : "−"} ${baseOwner}.${base[j].name} = จุดไว · กระตุ้นโดย ${hitOwner}.${q.name}`,
              "บท 16/19",
            ));
          }
        }
      }
    }
  };
  scanCrossSensitive("A", A, "B", B);
  scanCrossSensitive("B", B, "A", A);

  // ── C3 · personalDirectContact: จุดส่วนตัว base ↔ ดาว/จุด hit (มุมแข็งบนหน้าปัด 90°) ──
  const scanPersonalDirect = (baseOwner: CrossOwner, base: UranianChart, hitOwner: CrossOwner, hit: UranianPoint[]) => {
    for (const p of relationalPoints(base)) {
      for (const q of hit) {
        const orb = dial90Distance(p.lon, q.lon);
        if (orb <= ORB_CROSS_DEG) contacts.push(makeContactDirect(baseOwner, hitOwner, p, q, orb, "บท 42"));
      }
    }
  };
  scanPersonalDirect("A", chartA, "B", B);
  scanPersonalDirect("B", chartB, "A", A);

  // ── C4 · connectionMidpoint: Sonnensumme (บท 02) + ☉☽-Summe (บท 19) + MC-Summe (บท 02) ──
  const connectionPoints = buildConnectionPoints(chartA, chartB);

  contacts.sort((x, y) => x.orbDeg - y.orbDeg
    || x.baseOwner.localeCompare(y.baseOwner) || x.a.localeCompare(y.a)
    || (x.b ?? "").localeCompare(y.b ?? "") || x.activatedBy.localeCompare(y.activatedBy)
    || x.kind.localeCompare(y.kind));

  const noTimeA = !chartA.hasBirthTime, noTimeB = !chartB.hasBirthTime;
  return {
    discipline: "uranian",
    packetVersion: "uranian-synastry-v1",
    pair: { A: labelA, B: labelB },
    birthTimeMode: {
      A: noTimeA ? "unknown_no_time" : "known",
      B: noTimeB ? "unknown_no_time" : "known",
    },
    rule: "closed-list Uranian synastry: cross-midpoint pictures + cross sensitive points "
      + "+ personal-point direct contacts (dial 90°) + Sonnensumme/☉☽-Summe connection points "
      + "(บท 02/16/19/41/42 · Witte vergleichende Astrologie) · NO_PERCENT · AI ห้ามสร้างสัมผัสข้ามดวงนอกลิสต์",
    orbCrossDeg: ORB_CROSS_DEG,
    data: { contacts: contacts.slice(0, MAX_CONTACTS), connectionPoints },
    notAvailable: [
      ...(noTimeA || noTimeB ? ["meridianSynastry", "ascendantSynastry", "houseOverlaySynastry"] : []),
      "crossAntiscia_phase1_5_r2k4_5",                                      // C5 · เฟส 1.5
      "houseOverlaySynastry_rule4_phase2_r2k4_5",                          // กฎ 4 เรือน · บท 42
      "tnpSynastry_phase2",                                                // Cupido/Hades · precision ไม่พอ orb 1.0°
      "transitActivationOfConnectionPoints_isPairTiming_r2k5",             // บท 42 การกระตุ้นดาวจร = แยก module
    ],
  };
}
