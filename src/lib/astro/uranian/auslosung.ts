/**
 * โหราศาสตร์ยูเรเนียน · ชั้นกระตุ้น/จับเวลา (Auslösung) — r389 engine
 * ════════════════════════════════════════════════════════════════════════
 * เติม "ชั้นเวลา" ให้ผังยูเรเนียนที่นิ่ง (natal midpoints/pictures) → ฟันวัน/เดือนได้
 * วิธีจับเวลา (Auslösung) ของสำนัก Hamburg (Witte) 3 ชั้น — ทุกชั้น deterministic ล้วน (กฎข้อ 9):
 *   1) Transite (ดาวจร)      — ตำแหน่งดาวจริงในช่วงเป้าหมาย แตะจุด/จุดกึ่งกลางกำเนิด (hard aspect บนขั้น 45°)
 *   2) Sonnenbogen (ส่วนโค้งอาทิตย์) — directed = natal + arc · arc = ☉progressed − ☉natal (secondary: N วัน=N ปี)
 *   3) Sekundär-progression  — ☉progressed(~1°/ปี) · ☽progressed(~1°/เดือน) · Meridian progressed(=natal MC + arc)
 *
 * ⚠️ ทรานส์เนปจูน Witte (Cupido/Hades/Kronos/Zeus) = ยัง "ไม่คำนวณตำแหน่ง" (ต้องใช้ SwissEph/Witte-Ephemeride
 *    = roadmap เฟส 2) → ห้ามใช้เป็นดาวจร/directed/progressed ในชั้นนี้ · ระบุไว้ใน notAvailable
 * ⛔ ไม่คำนวณ Lefeldt/Sieggrün (Apollon/Admetos/Vulkanus/Poseidon) เด็ดขาด
 *
 * ── convention มุมกระตุ้น (ตามขนบ Uranian/Witte · หน้าปัด 90°) ──────────────
 * ชั้น Auslösung ใช้ "hard-aspect family" 5 มุม: 0°/45°/90°/135°/180° (ครึ่งเหลี่ยม 45° = ขั้นละเอียดของหน้าปัด 90°)
 * จุดกึ่งกลางเป็น "แกนสมมาตร 2 ปลาย" (mid กับ mid+180) → ตรวจ 5 มุมนี้เทียบ mid ค่าเดียว ครอบทั้งสองปลายอัตโนมัติ
 * (มุม 180° เทียบ mid = ทับปลาย mid+180 · มุม 135° เทียบ mid = 45° เทียบปลาย mid+180 ฯลฯ) — คณิตสะอาด เทสได้
 *
 * ไม่มี Date.now()/Math.random() — รับ dtUTC เกิด + targetFromISO/targetToISO เท่านั้น → ผลลัพธ์คงที่ (deterministic)
 */
import { eclipticLon, norm360 } from "../../astro-core/ephemeris";
import { wrap180 } from "../../astro-core/events";
import { NAME_TH, SIGN_TH, type UranianChart, type UranianPoint } from "./engine";

const DAY_MS = 86_400_000;
const TROPICAL_YEAR_DAYS = 365.24219;      // ปีสุริยคติเฉลี่ย (แปลง arc→อายุ→ค.ศ. + อายุ↔ปฏิทิน)

/** 5 มุมแข็ง (hard-aspect family บนขั้น 45° ของหน้าปัด 90°) */
export const HARD_ASPECTS = [0, 45, 90, 135, 180] as const;
const ASPECT_TH: Record<number, string> = {
  0: "ทับ (0°)", 45: "กึ่งเหลี่ยม (45°)", 90: "ฉาก (90°)", 135: "เหลี่ยมครึ่ง (135°)", 180: "เล็ง (180°)",
};

/** ดาวจร 9 ดวง (☉→♇ ยกเว้นจันทร์) — จันทร์เร็ว ~13°/วัน · snapshot เที่ยงวัน = สุ่ม ไม่ใช่สัญญาณ (เหมือนเข็ม D day-sniper) */
const TRANSITERS = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as const;
const FAST_TRANSITERS = new Set(["Sun", "Mercury", "Venus", "Mars"]);
const ORB_FAST_DEG = 0.5;                  // ดาวเร็ว orb เข้ม
const ORB_SLOW_DEG = 1.0;                  // ดาวช้า (พฤหัส→พลูโต) ค้างนาน → orb กว้างขึ้นเล็กน้อยตามขนบ

/** cap ผลลัพธ์ (คุมงบ packet/prompt · deterministic) */
export const AUSLOSUNG_MAX_EVENTS = 80;
export const AUSLOSUNG_MAX_GROUPS = 24;
export const AUSLOSUNG_MAX_PER_GROUP = 10;

export type AuslosungMethod = "transit" | "solar_arc" | "prog_sun" | "prog_moon" | "prog_mc";
/** ชนิดจุดไวกำเนิด: จุดเดี่ยว · จุดกึ่งกลาง(Halbsumme occupied) · จุดผลรวม/ผลต่าง (sensitiver Punkt) */
export type AuslosungTargetKind = "point" | "midpoint" | "sum" | "difference";

/** เหตุการณ์กระตุ้น 1 ครั้ง (ดาวจร/directed/progressed แตะจุดไวกำเนิด 1 จุด) */
export type AuslosungEvent = {
  dateISO: string;                 // วันกระตุ้น (UTC wall date · เรียงเวลาได้)
  method: AuslosungMethod;
  mover: string;                   // ตัวกระตุ้น (key อังกฤษ เช่น "Saturn")
  moverTh: string;
  natalTarget: string;             // จุดไวกำเนิดที่ถูกแตะ (key เช่น "Moon/Neptune" หรือ "Meridian")
  natalTargetTh: string;
  natalTargetKind: AuslosungTargetKind;
  natalTargetLon: number;          // ลองจิจูดจุดไวกำเนิด (สากล 0-360)
  aspect: number;                  // 0/45/90/135/180
  aspectTh: string;
  orbArcmin: number;               // orb จริง (ลิปดา) — จัดลำดับความคม ไม่ใช่คะแนนทำนาย
  applying: boolean;               // orb กำลังแคบลง (เทียบ +6 ชม. · deterministic)
  detail: string;                  // สรุปไทยสั้น
};

/** จุดไวกำเนิด 1 จุด + รายการกระตุ้นในช่วงเป้าหมาย (จัดกลุ่มเพื่ออ่านง่าย) */
export type AuslosungGroup = {
  targetKey: string;
  targetTh: string;
  targetKind: AuslosungTargetKind;
  targetLon: number;
  signTh: string;
  signDeg: number;                 // องศาในราศี 0-30
  formula: string | null;          // จุดกึ่งกลาง → "a + b" · จุดเดี่ยว → null
  natalOrbArcmin: number;          // ความคมของจุดไวในผังกำเนิด (จุดเดี่ยว=0 · จุดกึ่งกลาง/ผลรวม-ผลต่าง=orb ที่ natal ทับ)
  events: AuslosungEvent[];
  tightestOrbArcmin: number;       // orb การกระตุ้นที่แคบสุดในช่วงเป้าหมาย
};

export type UranianAuslosung = {
  version: "uranian-auslosung-v1";
  targetFromISO: string;
  targetToISO: string;
  ageAtFrom: number;               // อายุ (ปี) ต้นช่วง
  ageAtTo: number;
  solarArcDegAtFrom: number;       // ส่วนโค้งอาทิตย์ (องศา) ต้นช่วง (~อายุ)
  solarArcDegAtTo: number;
  nodeType: "mean";                // Mondknoten = mean node
  methods: AuslosungMethod[];
  methodCounts: Record<AuslosungMethod, number>; // จำนวน event ต่อวิธี (ก่อน cap · โปร่งใส)
  events: AuslosungEvent[];        // แบน: คัดคมสุด (orb แคบ) ทั้งช่วง แล้วเรียงตามวัน (cap)
  groups: AuslosungGroup[];        // จัดกลุ่มตามจุดไวกำเนิด (cap)
  totalEventsFound: number;        // ก่อน cap (โปร่งใส)
  orbFastDeg: number;
  orbSlowDeg: number;
  notes: string[];
  notAvailable: string[];          // เฟส 1: ตำแหน่ง TNP Witte ยังไม่คำนวณ
};

/* ══════════════ คณิตมุม ══════════════ */

/** มุมแข็งที่ใกล้สุด + orb (องศา) ระหว่าง lon กับจุดอ้าง base
 *  ใช้ได้ทั้งจุดเดี่ยว (base = lon จุด) และจุดกึ่งกลาง (base = mid · 5 มุมครอบทั้งแกน mid|mid+180) */
export function nearestHardAspect(lon: number, base: number): { aspect: number; orbDeg: number } {
  const sep = Math.abs(wrap180(lon - base)); // 0..180
  let best = { aspect: 0, orbDeg: Infinity };
  for (const asp of HARD_ASPECTS) {
    const orb = Math.abs(sep - asp);
    if (orb < best.orbDeg) best = { aspect: asp, orbDeg: orb };
  }
  return best;
}

/* ══════════════ ชุดจุดไวกำเนิด (เป้า) ══════════════ */

type NatalFactor = { key: string; th: string; lon: number };
/** natalOrbArcmin = ความคมของ "จุดไว" ในผังกำเนิด (จุดเดี่ยว=0 · จุดกึ่งกลาง=orb ภาพดาว · ผลรวม/ผลต่าง=orb ที่ natal ทับ) */
type NatalTarget = NatalFactor & { kind: AuslosungTargetKind; formula: string | null; natalOrbArcmin: number };

/** จุดเดี่ยวกำเนิด (ดาวจริง 10 + Meridian/Asc + Node + AriesPoint) — dedupe ตามชื่อ · deterministic order */
function natalFactors(chart: UranianChart): NatalFactor[] {
  const seen = new Set<string>();
  const out: NatalFactor[] = [];
  const add = (p: UranianPoint) => {
    if (seen.has(p.name)) return;
    seen.add(p.name);
    out.push({ key: p.name, th: p.nameTh, lon: p.lon });
  };
  for (const p of chart.points) add(p);
  for (const p of chart.personalPoints) add(p);
  return out;
}

/** จุดกึ่งกลาง "คมสุด" = Halbsumme ที่มีดาว/จุดตกทับ (planetary picture) — เป้าจุดกึ่งกลางของชั้นเวลา */
function occupiedMidpointTargets(chart: UranianChart): NatalTarget[] {
  const seen = new Set<string>();
  const out: NatalTarget[] = [];
  for (const pic of chart.planetaryPictures) {
    if (seen.has(pic.pair)) continue;
    const hs = chart.halbsummen.find((h) => `${h.a}/${h.b}` === pic.pair);
    if (!hs) continue;
    seen.add(pic.pair);
    out.push({
      key: pic.pair, th: `${hs.aTh}/${hs.bTh}`, lon: hs.mid,
      kind: "midpoint", formula: `${hs.a} + ${hs.b} (natal ${pic.occupantTh}ทับ · orb ${pic.orbDeg}°)`,
      natalOrbArcmin: +(pic.orbDeg * 60).toFixed(1),
    });
  }
  return out;
}

/** จุดผลรวม/ผลต่าง (sensitiver Punkt) ที่ natal กระตุ้นแล้ว = จุดไวคมสุดของผัง (เช่น ☽+♆ ที่ Meridian ทับ) */
function sensitiveTargets(chart: UranianChart): NatalTarget[] {
  const seen = new Set<string>();
  const out: NatalTarget[] = [];
  for (const s of chart.sensitivePoints) {
    const op = s.kind === "sum" ? "+" : "−";
    const key = `${s.a}${op}${s.b}`;
    if (seen.has(key)) continue;   // pointLon เท่ากันทุก activatedBy → เก็บครั้งแรก (deterministic เพราะ sensitivePoints เรียง orb แล้ว)
    seen.add(key);
    out.push({
      key, th: `${s.aTh}${op}${s.bTh}`, lon: s.pointLon, kind: s.kind,
      formula: `${s.a} ${op} ${s.b} (natal ${s.activatedByTh}ทับ · orb ${s.orbDeg}°)`,
      natalOrbArcmin: +(s.orbDeg * 60).toFixed(1),
    });
  }
  return out;
}

/** เป้าทั้งหมดสำหรับดาวจร = จุดเดี่ยว + จุดกึ่งกลางคมสุด + จุดผลรวม/ผลต่างคมสุด (จุดไวจริงของผัง) */
function natalTargets(chart: UranianChart): NatalTarget[] {
  return [
    ...natalFactors(chart).map((f): NatalTarget => ({ ...f, kind: "point", formula: null, natalOrbArcmin: 0 })),
    ...occupiedMidpointTargets(chart),
    ...sensitiveTargets(chart),
  ];
}

/** เป้าสำหรับ directed/progressed = จุดเดี่ยว + จุดกึ่งกลางคมสุด (directed→midpoint = ขนบ Witte) */
function movingTargets(chart: UranianChart): NatalTarget[] {
  return [
    ...natalFactors(chart).map((f): NatalTarget => ({ ...f, kind: "point", formula: null, natalOrbArcmin: 0 })),
    ...occupiedMidpointTargets(chart),
  ];
}

/* ══════════════ helper เวลา ══════════════ */

const isoToUTCms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const noonUTCms = (dayMs: number) => dayMs + 12 * 3_600_000;
const msToISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** อายุ (ปี) ณ เวลา ms เทียบวันเกิด */
function ageYearsAt(birthMs: number, ms: number): number {
  return (ms - birthMs) / (TROPICAL_YEAR_DAYS * DAY_MS);
}
/** ปฏิทิน ค.ศ. (ms) ที่ตรงกับอายุ A ปี */
function calendarMsForAge(birthMs: number, age: number): number {
  return birthMs + age * TROPICAL_YEAR_DAYS * DAY_MS;
}
/** วัน ephemeris ของ secondary progression: N วันหลังเกิด = N ปีอายุ (day-for-year) */
function progDate(birthMs: number, age: number): Date {
  return new Date(birthMs + age * DAY_MS);
}

function signOf(lon: number): { signTh: string; signDeg: number } {
  const L = norm360(lon);
  const s = Math.floor(L / 30);
  return { signTh: SIGN_TH[s], signDeg: +(L - s * 30).toFixed(4) };
}

/* ══════════════ ชั้น 1 · Transite (ดาวจร · daily snapshot + peak) ══════════════ */

function scanTransits(chart: UranianChart, fromMs: number, toMs: number, targets: NatalTarget[]): AuslosungEvent[] {
  const events: AuslosungEvent[] = [];
  const nDays = Math.round((toMs - fromMs) / DAY_MS) + 1;
  // precompute ลองจิจูดดาวจรเที่ยงวัน UTC ต่อวัน (ต่อดาว) — deterministic
  for (const tName of TRANSITERS) {
    const limit = FAST_TRANSITERS.has(tName) ? ORB_FAST_DEG : ORB_SLOW_DEG;
    const lons: number[] = new Array(nDays);
    for (let i = 0; i < nDays; i++) lons[i] = eclipticLon(tName as any, new Date(noonUTCms(fromMs + i * DAY_MS)));
    for (const t of targets) {
      // เดินรายวัน จับ streak (orb≤limit + มุมเดียวกัน) → ปล่อย event ที่วัน orb แคบสุดของ streak
      let streakAspect = -1, bestI = -1, bestOrb = Infinity;
      const flush = () => {
        if (bestI < 0) return;
        const dayMs = fromMs + bestI * DAY_MS;
        const orbDeg = bestOrb;
        const lonNext = eclipticLon(tName as any, new Date(noonUTCms(dayMs) + 6 * 3_600_000));
        const applying = nearestHardAspect(lonNext, t.lon).orbDeg < orbDeg;
        events.push(mkEvent("transit", tName, t, streakAspect, orbDeg, applying, msToISO(dayMs)));
        streakAspect = -1; bestI = -1; bestOrb = Infinity;
      };
      for (let i = 0; i < nDays; i++) {
        const { aspect, orbDeg } = nearestHardAspect(lons[i], t.lon);
        if (orbDeg <= limit) {
          if (aspect !== streakAspect) flush();       // เปลี่ยนมุม = จบ streak เดิม
          streakAspect = aspect;
          if (orbDeg < bestOrb) { bestOrb = orbDeg; bestI = i; }
        } else flush();
      }
      flush();
    }
  }
  return events;
}

/* ══════════════ ชั้น 2+3 · directed/progressed (สแกนอายุ + bisect exact) ══════════════ */

/** หา instant (อายุ) ที่ f ข้ามศูนย์ ในช่วง [a0,a1] (bisect · ~3 วินาที) */
function bisectAge(f: (age: number) => number, a0: number, a1: number): number {
  let a = a0, b = a1, fa = f(a);
  for (let i = 0; i < 42 && b - a > 1e-7; i++) {
    const m = (a + b) / 2, fm = f(m);
    if ((fa <= 0) === (fm <= 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

/** สแกน "ตำแหน่งเคลื่อน" moverLon(age) แตะจุดกำเนิด targets ในช่วงอายุ [ageFrom,ageTo] แล้ว emit event
 *  moverLabel/method ระบุชนิด · stepDays = ช่วงสุ่มปฏิทิน (ละเอียดพอไม่ข้าม 2 มุมใน step เดียว) */
function scanMoving(
  method: AuslosungMethod, moverKey: string, moverTh: string,
  moverLon: (age: number) => number, targets: NatalTarget[],
  birthMs: number, ageFrom: number, ageTo: number, stepDays: number,
): AuslosungEvent[] {
  const events: AuslosungEvent[] = [];
  const stepAge = stepDays / TROPICAL_YEAR_DAYS;
  const ages: number[] = [];
  for (let a = ageFrom; a < ageTo + stepAge; a += stepAge) ages.push(Math.min(a, ageTo));
  // precompute moverLon ต่อ step (ephemeris ครั้งเดียวต่อ step)
  const mvLon = ages.map((a) => moverLon(a));
  for (const t of targets) {
    if (t.kind === "point" && t.key === moverKey) continue; // ตัวเองไม่แตะตัวเอง (0° = ตัวมันเสมอ)
    for (const asp of HARD_ASPECTS) {
      const g = (age: number) => wrap180(moverLon(age) - t.lon - asp); // bisect เรียก ephemeris จริง (ไม่ interp เชิงเส้น)
      let prev = wrap180(mvLon[0] - t.lon - asp);
      for (let i = 1; i < ages.length; i++) {
        const cur = wrap180(mvLon[i] - t.lon - asp);
        if ((prev < 0) !== (cur < 0) && Math.abs(prev - cur) < 90) {
          const hitAge = bisectAge(g, ages[i - 1], ages[i]);
          const calMs = calendarMsForAge(birthMs, hitAge);
          const lon = moverLon(hitAge);
          const orbDeg = Math.abs(wrap180(lon - t.lon - asp));
          const applying = Math.abs(wrap180(moverLon(hitAge + 1 / TROPICAL_YEAR_DAYS) - t.lon - asp)) < orbDeg;
          events.push(mkEvent(method, moverKey, t, asp, orbDeg, applying, msToISO(calMs), moverTh));
        }
        prev = cur;
      }
    }
  }
  return events;
}

/* ══════════════ ประกอบ event ══════════════ */

const KIND_TH: Record<AuslosungTargetKind, string> = {
  point: "จุด", midpoint: "จุดกึ่งกลาง", sum: "จุดผลรวม", difference: "จุดผลต่าง",
};

function mkEvent(
  method: AuslosungMethod, mover: string, t: NatalTarget,
  aspect: number, orbDeg: number, applying: boolean, dateISO: string, moverThOverride?: string,
): AuslosungEvent {
  const moverTh = moverThOverride || NAME_TH[mover] || mover;
  const aspectTh = ASPECT_TH[aspect];
  const kindTh = KIND_TH[t.kind];
  const methodTh = METHOD_TH[method];
  return {
    dateISO, method, mover, moverTh,
    natalTarget: t.key, natalTargetTh: t.th, natalTargetKind: t.kind, natalTargetLon: +norm360(t.lon).toFixed(4),
    aspect, aspectTh, orbArcmin: +(orbDeg * 60).toFixed(1), applying,
    detail: `${methodTh}: ${moverTh} ${aspectTh} ${kindTh}กำเนิด ${t.th} (orb ${(orbDeg * 60).toFixed(1)}′${applying ? " · เข้าหา" : " · แยกออก"})`,
  };
}

const METHOD_TH: Record<AuslosungMethod, string> = {
  transit: "ดาวจร", solar_arc: "ส่วนโค้งอาทิตย์", prog_sun: "☉เคลื่อน", prog_moon: "☽เคลื่อน", prog_mc: "Meridianเคลื่อน",
};

/* ══════════════ entry หลัก ══════════════ */

/**
 * ชั้นกระตุ้น/จับเวลา (Auslösung) สำหรับช่วงเป้าหมาย
 * @param chart          ผังยูเรเนียนกำเนิด (จาก uranianChart)
 * @param birthDtUTC     เวลาเกิด UTC (Date) — ต้องตรงกับ chart
 * @param targetFromISO  ต้นช่วงเป้าหมาย "YYYY-MM-DD" (เช่น "2026-01-01")
 * @param targetToISO    ปลายช่วง (inclusive)
 */
export function computeUranianAuslosung(
  chart: UranianChart, birthDtUTC: Date, targetFromISO: string, targetToISO: string,
): UranianAuslosung {
  const birthMs = birthDtUTC.getTime();
  const fromMs = isoToUTCms(targetFromISO);
  const toMs = isoToUTCms(targetToISO);
  const ageFrom = ageYearsAt(birthMs, fromMs);
  const ageTo = ageYearsAt(birthMs, toMs);

  const targets = natalTargets(chart);          // เป้าดาวจร: จุด + จุดกึ่งกลางคม + จุดผลรวม/ผลต่างคม
  const moving = movingTargets(chart);           // เป้า directed/prog: จุด + จุดกึ่งกลางคม
  const factors = natalFactors(chart);
  const natalSun = factors.find((f) => f.key === "Sun")!;
  const natalMC = factors.find((f) => f.key === "Meridian");

  // ── arc(age) = ☉progressed(N วัน=N ปี) − ☉natal ──
  const arcAt = (age: number) => norm360(eclipticLon("Sun", progDate(birthMs, age)) - natalSun.lon);
  const solarArcDegAtFrom = +arcAt(ageFrom).toFixed(3);
  const solarArcDegAtTo = +arcAt(ageTo).toFixed(3);

  const raw: AuslosungEvent[] = [];

  // 1) Transite — ดาวจรแตะจุด/จุดกึ่งกลาง/จุดผลรวม-ผลต่างกำเนิด
  raw.push(...scanTransits(chart, fromMs, toMs, targets));

  // 2) Sonnenbogen — directed X (ทุกจุด ยกเว้น Sun ซึ่งเป็น prog_sun) = natalX + arc แตะจุดกำเนิด
  for (const X of factors) {
    if (X.key === "Sun") continue;
    raw.push(...scanMoving("solar_arc", X.key, `${X.th}(directed)`,
      (age) => norm360(X.lon + arcAt(age)), moving, birthMs, ageFrom, ageTo, 2));
  }

  // 3) Sekundär-progression
  //   3a) ☉progressed (~1°/ปี)
  raw.push(...scanMoving("prog_sun", "Sun", "☉เคลื่อน",
    (age) => eclipticLon("Sun", progDate(birthMs, age)), moving, birthMs, ageFrom, ageTo, 2));
  //   3b) ☽progressed (~1°/เดือน → ~13°/ปี · step ถี่ขึ้น)
  raw.push(...scanMoving("prog_moon", "Moon", "☽เคลื่อน",
    (age) => eclipticLon("Moon", progDate(birthMs, age)), moving, birthMs, ageFrom, ageTo, 1));
  //   3c) Meridian progressed = natal MC + arc (เฉพาะมีเวลาเกิด)
  if (natalMC) {
    raw.push(...scanMoving("prog_mc", "Meridian", "Meridianเคลื่อน",
      (age) => norm360(natalMC.lon + arcAt(age)), moving, birthMs, ageFrom, ageTo, 2));
  }

  // ── dedupe (วันเดียว · method · mover · target · aspect ซ้ำ — เก็บ orb แคบสุด) ──
  const dedup = new Map<string, AuslosungEvent>();
  for (const e of raw) {
    const k = `${e.dateISO}|${e.method}|${e.mover}|${e.natalTarget}|${e.aspect}`;
    const cur = dedup.get(k);
    if (!cur || e.orbArcmin < cur.orbArcmin) dedup.set(k, e);
  }
  const all = [...dedup.values()];
  const totalEventsFound = all.length;

  const methodCounts = { transit: 0, solar_arc: 0, prog_sun: 0, prog_moon: 0, prog_mc: 0 } as Record<AuslosungMethod, number>;
  for (const e of all) methodCounts[e.method]++;

  // ── flat: คัด "คมสุด" (orb แคบ) ทั้งช่วงก่อน (ไม่ใช่แค่ต้นปี) แล้วค่อยเรียงตามวันเพื่อแสดง · cap ──
  const tieKey = (a: AuslosungEvent, b: AuslosungEvent) =>
    a.method.localeCompare(b.method) || a.mover.localeCompare(b.mover) ||
    a.natalTarget.localeCompare(b.natalTarget) || a.dateISO.localeCompare(b.dateISO) || a.aspect - b.aspect;
  const sharpest = [...all].sort((a, b) => a.orbArcmin - b.orbArcmin || tieKey(a, b)).slice(0, AUSLOSUNG_MAX_EVENTS);
  const events = sharpest.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.orbArcmin - b.orbArcmin || tieKey(a, b));

  // ── groups: จัดตามจุดไวกำเนิด · เรียงตาม "ความคม natal" ก่อน (จุดไวคมสุดของผังมาก่อน) แล้วค่อย orb การกระตุ้น ──
  //    (จุดกึ่งกลาง/ผลรวม-ผลต่างที่ natal ทับเป๊ะ = จุดไวสำคัญของดวง — ควรโชว์ก่อนคู่สุ่มที่บังเอิญโดนจร)
  const gmap = new Map<string, AuslosungGroup>();
  for (const e of all) {
    const gk = `${e.natalTargetKind}:${e.natalTarget}`;
    let g = gmap.get(gk);
    if (!g) {
      const target = targets.find((t) => t.key === e.natalTarget && t.kind === e.natalTargetKind)!;
      const sg = signOf(e.natalTargetLon);
      g = {
        targetKey: e.natalTarget, targetTh: e.natalTargetTh, targetKind: e.natalTargetKind,
        targetLon: e.natalTargetLon, signTh: sg.signTh, signDeg: sg.signDeg,
        formula: target?.formula ?? null, natalOrbArcmin: target?.natalOrbArcmin ?? 0,
        events: [], tightestOrbArcmin: Infinity,
      };
      gmap.set(gk, g);
    }
    g.events.push(e);
    if (e.orbArcmin < g.tightestOrbArcmin) g.tightestOrbArcmin = e.orbArcmin;
  }
  const groups = [...gmap.values()]
    .map((g) => ({
      ...g,
      events: g.events.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.orbArcmin - b.orbArcmin)
        .slice(0, AUSLOSUNG_MAX_PER_GROUP),
    }))
    .sort((a, b) => a.natalOrbArcmin - b.natalOrbArcmin || a.tightestOrbArcmin - b.tightestOrbArcmin
      || b.events.length - a.events.length || a.targetKey.localeCompare(b.targetKey))
    .slice(0, AUSLOSUNG_MAX_GROUPS);

  const methods: AuslosungMethod[] = ["transit", "solar_arc", "prog_sun", "prog_moon"];
  if (natalMC) methods.push("prog_mc");

  return {
    version: "uranian-auslosung-v1",
    targetFromISO, targetToISO,
    ageAtFrom: +ageFrom.toFixed(3), ageAtTo: +ageTo.toFixed(3),
    solarArcDegAtFrom, solarArcDegAtTo,
    nodeType: "mean",
    methods, methodCounts,
    events, groups, totalEventsFound,
    orbFastDeg: ORB_FAST_DEG, orbSlowDeg: ORB_SLOW_DEG,
    notes: [
      "จับเวลาแบบ Witte 3 ชั้น: ดาวจร(Transite) · ส่วนโค้งอาทิตย์(Sonnenbogen) · เคลื่อนทุติยภูมิ(Sekundär-progression ☉☽Meridian)",
      "จุดกึ่งกลาง = แกนสมมาตร 2 ปลาย · มุมแข็ง 0/45/90/135/180 เทียบ mid ครอบทั้งแกน",
      "orb เป็นระยะเชิงมุมจริง (ลิปดา) ใช้จัดลำดับความคม — ไม่ใช่คะแนนทำนาย (NO_PERCENT)",
      "จันทร์จร (transit Moon) ตัดออกจากชั้นดาวจร (เร็ว ~13°/วัน · snapshot เที่ยงวัน = สุ่ม) — ใช้ ☽progressed แทนสำหรับชั้นเดือน",
      "ส่วนโค้งอาทิตย์/☉เคลื่อน = secondary (N วันหลังเกิด = N ปีอายุ) · Meridian เคลื่อนตามส่วนโค้งอาทิตย์",
    ],
    notAvailable: [
      "witteTransneptunianPositions", // Cupido/Hades/Kronos/Zeus ยังไม่คำนวณตำแหน่ง (รอ SwissEph/Witte-Ephemeride เฟส 2)
      "transitMoon",                  // ตัดจงใจ (เหตุผลด้านบน)
    ],
  };
}
