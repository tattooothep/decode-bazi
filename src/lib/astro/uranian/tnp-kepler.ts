/**
 * โหราศาสตร์ยูเรเนียน · เครื่องคำนวณตำแหน่งทรานส์เนปจูนของ Witte (TNP Kepler solver) — r391-tnp
 * ════════════════════════════════════════════════════════════════════════════════════════
 * คำนวณตำแหน่งจริง 4 ดวงสมมุติของ Alfred Witte (Cupido/Hades/Zeus/Kronos) จาก
 * "ธาตุวงโคจร (orbital elements)" ที่ Witte พิมพ์เองในบทความ PD 1923–1924 (source of truth · ฟรี)
 * → ไม่ต้องซื้อ Swiss Ephemeris · ไม่ใช้ไฟล์ seorbel.txt
 *
 * ── ที่มาของ element (verbatim จากคัมภีร์ · trace ได้ทุกตัวเลข) ────────────────────────────
 *  Cupido : บท 22 „Synodischer Lauf des Planeten Cupido" (AB 5.Jg Aug 1923) + บท 19 (AB Jul 1923)
 *           a=41 „Sonnenweiten" · T=262,5 Jahre · Sonnennähe 1780 · Herr der Wage
 *  Hades  : บท 39 „Wahrscheinlicher Lauf ... Hades" (AB 6.Jg 1924) + บท 40 (AR Jun 1924)
 *           a=50,667 · T=360,66 Jahre · Neigung 1°03' · absteigender Knoten 12°♓ (→ aufsteig. 12°♍)
 *           Sonnennähe 1874 · Herr der Jungfrau
 *  Kronos : บท 27 „Der 4. Transneptun-Planet Kronos" (AR 15.Jg Jan 1924)
 *           a=64,8 · T=521,8 Jahre · Sonnennähe 1654 · Herr des Krebs
 *  Zeus   : ⚠️ ไม่มีตาราง element ในคลัง 47 บทความ (เรามี Cupido=ที่1 · Hades=ที่2 · Kronos=ที่4 ·
 *           „Zeus"=ที่3 ตารางหาย) → คำนวณไม่ได้ · รายงานตรง ๆ ว่าขาด · คงชื่อ+ความหมายไว้เฉย ๆ
 *
 * ── element ที่คัมภีร์ให้ไม่ครบ (ห้ามเดา · ระบุตรง ๆ) ──────────────────────────────────────
 *  • Exzentrizität (e): Witte „zuerst als Kreislinie berechnet, dann durch Transite/Direktionen
 *    berichtigt" (บท 19, S.49) และขอให้ผู้อ่านช่วย „ob die Exzentrizität richtig eingesetzt ist"
 *    → e ไม่เคยตีพิมพ์เป็นตัวเลข → ใช้ „วงกลม (Kreislinie) mean-element" e=0 = โมเดลฐานของ Witte เอง
 *  • Argument of perihelion (ω): ไม่ตีพิมพ์ (และไม่มีความหมายเมื่อ e=0 · วงกลมไม่มีทิศ perihelion)
 *  • Cupido/Kronos: „aufsteigender Knoten (Ω)" + „Neigung (i)" ไม่ให้ตัวเลขจำเพาะ (บท 19 S.51 ระบุว่า
 *    Knoten/Breite „muß noch bestimmt werden") → ใช้ i=0 (ระนาบสุริยวิถี) · ระบุว่าขาด
 *  • ค่า anchor ลองจิจูด (L0) สกัดจากตัวอย่างจริงของ Witte (Fraktur OCR) → คลาด ~1–2° (เทียบสแกน)
 *
 * ── ความแม่น (precision · ห้ามอวดเกินจริง) ───────────────────────────────────────────────
 *  Kepler solver เอง deterministic <0,001° · แต่ „ธาตุวงโคจร" เป็น fictitious mean-element:
 *  ตำแหน่งสัมบูรณ์คลาด ~±1–2° (จาก e=0 · anchor OCR · Knoten/incl ที่ขาด) — „ระดับองศา/ลิปดา"
 *  ไม่ใช่ „ดาวจริงระดับวินาที" อย่างดาว 10 ดวง · ราศีมักถูก · องศาเป๊ะห้ามยึด
 *
 * กฎข้อ 9 (BaZi/Decode): engine คำนวณ structured JSON → AI แค่ตีความ · ไม่มี Date.now()/Math.random()
 * ⛔ solver เฉพาะ 4 ดวง Witte · ไม่แตะ Apollon/Admetos/Vulkanus/Poseidon (Sieggrün · ลิขสิทธิ์)
 */
import { eclipticLon, norm360 } from "../../astro-core/ephemeris";

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const TROPICAL_YEAR_DAYS = 365.24219;

/** ธาตุวงโคจร (orbital elements) ของทรานส์เนปจูน Witte 1 ดวง — สกัด verbatim จากคัมภีร์ PD */
export type TnpOrbitalElement = {
  name: string;         // key อังกฤษ
  nameDe: string;
  nameTh: string;
  rulerSignDe: string;
  a: number;            // กึ่งแกนเอก (AU · „Sonnenweiten" ของ Witte)
  eccentricity: number; // e — 0 = „Kreislinie" (Witte ไม่ตีพิมพ์ค่า e)
  eccentricityGiven: boolean;
  inclDeg: number;      // ความเอียงต่อสุริยวิถี (°)
  inclGiven: boolean;
  nodeDeg: number;      // ลองจิจูดโหนดขึ้น Ω (°)
  nodeGiven: boolean;
  argPeriDeg: number;   // ω (ไม่ตีพิมพ์ · = 0 เมื่อ e=0)
  argPeriGiven: boolean;
  periodYears: number;  // คาบดาราคติ T
  perihelionYear: number | null; // ปีที่อยู่ใกล้ดวงอาทิตย์ („in Sonnennähe")
  epochYear: number;    // ปี (ทศนิยม) ของ anchor
  meanLonAtEpochDeg: number;     // ลองจิจูดสุริยวิถี helio ณ epoch (จุดยึด)
  anchorSource: string; // ที่มา anchor (บท/ตัวอย่าง Witte)
  elementSource: string;// ที่มา element (บท)
  missing: string[];    // element ที่คัมภีร์ไม่ให้ (ห้ามเดา · ระบุตรง ๆ)
};

/**
 * 3 ดวงที่คำนวณได้ (มี a + T + anchor จากคัมภีร์ PD)
 * ⚠️ ค่าองศาทั้งหมดสกัดจาก Fraktur OCR ของ Witte — ระบุแหล่งทุกตัว · ยังต้องเทียบสแกนก่อนโชว์เลขเป๊ะ
 */
export const TNP_ELEMENTS: TnpOrbitalElement[] = [
  {
    name: "Cupido", nameDe: "Cupido", nameTh: "คิวปิโด", rulerSignDe: "Wage (ตุล)",
    a: 41.0, eccentricity: 0, eccentricityGiven: false,
    inclDeg: 0, inclGiven: false, nodeDeg: 0, nodeGiven: false, argPeriDeg: 0, argPeriGiven: false,
    periodYears: 262.5, perihelionYear: 1780,
    // บท 19 „Der Lauf des Cupido im Jahre 1923-24" → geozentr. 16°07'–19°19' ♌ (loop-mid ~17,7° ♌ = 137,7°)
    epochYear: 1923.6, meanLonAtEpochDeg: 137.7,
    anchorSource: "บท 19 · ตาราง «Lauf des Cupido 1923-24» (16°07'–19°19' Löwe · loop-mid ≈17,7°♌)",
    elementSource: "บท 22 (a=41 Sonnenweiten · T=262,5 J · Sonnennähe 1780) + บท 19 (Herr der Wage)",
    missing: ["Exzentrizität (e)", "argument of perihelion (ω)", "aufsteigender Knoten (Ω)", "Neigung (i)"],
  },
  {
    name: "Hades", nameDe: "Hades", nameTh: "ฮาเดส", rulerSignDe: "Jungfrau (กันย์)",
    a: 50.667, eccentricity: 0, eccentricityGiven: false,
    inclDeg: 1.05, inclGiven: true,          // „Neigung gegen die Ekliptik 1°03'" (บท 39)
    nodeDeg: 162.0, nodeGiven: true,         // absteigender Knoten 12°♓ → aufsteigender 12°♍ = 162°
    argPeriDeg: 0, argPeriGiven: false,
    periodYears: 360.66, perihelionYear: 1874,
    // บท 40 ตัวอย่าง Napoleon (เกิด 15 ส.ค. 1769) „Ort des Hades = 23°58' ♎" = 203,97°
    epochYear: 1769.62, meanLonAtEpochDeg: 203.97,
    anchorSource: "บท 40 · ตัวอย่าง Napoleon 1769 «Ort des Hades 23°58'♎»=203,97° (cross: Goethe 1749=4°14'♎=184,23°)",
    elementSource: "บท 39 (a=50,667 · T=360,66 J · i=1°03' · Knoten 12°♓ · Sonnennähe 1874) + บท 40",
    missing: ["Exzentrizität (e)", "argument of perihelion (ω)"],
  },
  {
    name: "Kronos", nameDe: "Kronos", nameTh: "โครนอส", rulerSignDe: "Krebs (กรกฎ)",
    a: 64.8, eccentricity: 0, eccentricityGiven: false,
    inclDeg: 0, inclGiven: false, nodeDeg: 0, nodeGiven: false, argPeriDeg: 0, argPeriGiven: false,
    periodYears: 521.8, perihelionYear: 1654,
    // บท 27 ตัวอย่าง Friedrich Ebert „Kronos/☉ 1870 = 27°10' ♓" = 357,17°
    epochYear: 1870.0, meanLonAtEpochDeg: 357.17,
    anchorSource: "บท 27 · ตัวอย่าง Friedrich Ebert «Kronos ☉ 1870 = 27°10'♓»=357,17°",
    elementSource: "บท 27 (a=64,8 Sonnenweiten · T=521,8 J · Sonnennähe 1654 · Herr des Krebs)",
    missing: ["Exzentrizität (e)", "argument of perihelion (ω)", "aufsteigender Knoten (Ω)", "Neigung (i)"],
  },
];

/**
 * ดวงที่ „คำนวณไม่ได้" — Zeus (ทรานส์เนปจูนที่ 3 ของ Witte)
 * ⚠️ ตาราง element/ephemeris ของ Zeus ไม่มีในคลัง 47 บทความที่มี (มีแค่ Cupido/Hades/Kronos) ·
 * เลข „~455 ปี" มาจากพจนานุกรมเชิงวิธี (secondary) ไม่ใช่ตาราง Witte ปฐมภูมิ → ห้ามแต่งตัวเลข
 */
export const TNP_NOT_COMPUTABLE: Array<{ name: string; nameDe: string; nameTh: string; rulerSignDe: string; reason: string; missing: string[] }> = [
  {
    name: "Zeus", nameDe: "Zeus", nameTh: "เซอุส", rulerSignDe: "Löwe (สิงห์)",
    reason: "ไม่มีตาราง element/ephemeris ของ Zeus (ทรานส์เนปจูนที่ 3) ในคลังบทความ Witte ที่มี — มีเฉพาะ Cupido/Hades/Kronos · เลขคาบ ~455 ปี เป็น secondary (พจนานุกรมเชิงวิธี) ไม่ใช่ตาราง Witte",
    missing: ["a (Entfernung)", "T (คาบ ปฐมภูมิ)", "aufsteigender Knoten (Ω)", "Neigung (i)", "Sonnennähe/perihelion", "anchor ลองจิจูด"],
  },
];

/** ป้ายบอกแหล่ง + ระดับความแม่น (ใส่ใน packet · ความซื่อสัตย์ภายใน) */
export const TNP_POSITION_SOURCE = "witte_pd_kepler_mean_element_r391" as const;
export const TNP_PRECISION_NOTE =
  "ตำแหน่งดาวสมมุติ (fictitious mean-element) จากธาตุวงโคจร Witte PD ผ่าน Kepler solver deterministic · " +
  "โมเดลฐาน = วงกลม (Kreislinie · e=0 เพราะ Witte ไม่ตีพิมพ์ eccentricity) + anchor สกัดจาก Fraktur OCR · " +
  "ความแม่นระดับ ~±1–2° (องศา) ราศีมักถูก องศาเป๊ะห้ามยึด — ไม่ใช่ดาวจริงระดับวินาทีอย่างดาว 10 ดวง";

/** ผลตำแหน่ง TNP 1 ดวง ณ วันที่ (สากล ไม่มีศัพท์จีน/พระเวท) */
export type TnpPosition = {
  name: string;
  nameDe: string;
  nameTh: string;
  rulerSignDe: string;
  lon: number;        // ลองจิจูดสุริยวิถี geocentric tropical 0–360
  lat: number;        // ละติจูดสุริยวิถี geocentric (°)
  sign: number;       // ราศี 0–11
  signDeg: number;    // องศาในราศี 0–30
  dial90: number;     // ตำแหน่งบนหน้าปัด 90° (lon mod 90)
  helioLon: number;   // ลองจิจูด heliocentric (ก่อน parallax) — โปร่งใส
  distanceAU: number;
  precision: "mean_element_fictitious";
  source: string;
};

/* ══════════════ Kepler solver (mean → eccentric [Newton] → true → helio → geo) ══════════════ */

/** สมการเคปเลอร์ M = E − e·sin E · แก้ E ด้วย Newton–Raphson (deterministic · e=0 → E=M ทันที) */
export function solveEccentricAnomaly(meanAnomRad: number, e: number): number {
  let E = e < 0.8 ? meanAnomRad : Math.PI; // seed
  for (let i = 0; i < 60; i++) {
    const dE = (E - e * Math.sin(E) - meanAnomRad) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/** ปี (ทศนิยม UTC) จาก Date — deterministic (ไม่พึ่ง timezone เครื่อง) */
export function decimalYearUTC(date: Date): number {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const next = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (next - start);
}

/**
 * ตำแหน่ง heliocentric (rectangular · ระนาบสุริยวิถี · AU) ของ TNP 1 ดวง ณ ปีทศนิยม
 * mean anomaly M(t) = (L0 − Ω − ω) + n·Δt · n = 360°/T ต่อปี → Kepler → helio vector
 */
function tnpHeliocentricVec(el: TnpOrbitalElement, decYear: number): { x: number; y: number; z: number; helioLon: number; r: number } {
  const n = 360 / el.periodYears;                 // °/ปี (mean motion ดาราคติ)
  const dt = decYear - el.epochYear;
  const e = el.eccentricity;
  const O = el.nodeDeg * D2R;
  const w = el.argPeriDeg * D2R;
  const inc = el.inclDeg * D2R;
  // M0 ตั้งให้ ณ epoch (e=0,ω=0) ลองจิจูด helio = L0 พอดี → M0 = L0 − Ω − ω
  const M = norm360(el.meanLonAtEpochDeg - el.nodeDeg - el.argPeriDeg + n * dt) * D2R;
  const E = solveEccentricAnomaly(M, e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = el.a * (1 - e * Math.cos(E));
  // ตำแหน่งในระนาบวงโคจร
  const xo = r * Math.cos(nu);
  const yo = r * Math.sin(nu);
  // หมุน ω (arg peri) → i (incl) → Ω (node) เข้าพิกัดสุริยวิถี
  const cw = Math.cos(w), sw = Math.sin(w), co = Math.cos(O), so = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
  const x = (co * cw - so * sw * ci) * xo + (-co * sw - so * cw * ci) * yo;
  const y = (so * cw + co * sw * ci) * xo + (-so * sw + co * cw * ci) * yo;
  const z = (sw * si) * xo + (cw * si) * yo;
  return { x, y, z, helioLon: norm360(Math.atan2(y, x) * R2D), r };
}

/**
 * ตำแหน่ง geocentric ecliptic (tropical) ของ TNP 1 ดวง ณ วันที่ (Date UTC)
 * โลก heliocentric = (☉ geo lon + 180°) ที่ ~1 AU (astronomy-engine ผ่าน eclipticLon) → parallax จริง
 */
export function tnpPosition(el: TnpOrbitalElement, date: Date): TnpPosition {
  const decYear = decimalYearUTC(date);
  const helio = tnpHeliocentricVec(el, decYear);
  // โลก heliocentric (ecliptic · AU) — Sun geocentric lon + 180°, r_earth ≈ 1
  const Le = norm360(eclipticLon("Sun", date) + 180) * D2R;
  const xe = Math.cos(Le), ye = Math.sin(Le), ze = 0;
  const xg = helio.x - xe, yg = helio.y - ye, zg = helio.z - ze;
  const lon = norm360(Math.atan2(yg, xg) * R2D);
  const lat = Math.atan2(zg, Math.hypot(xg, yg)) * R2D;
  const s = Math.floor(lon / 30);
  return {
    name: el.name, nameDe: el.nameDe, nameTh: el.nameTh, rulerSignDe: el.rulerSignDe,
    lon: +lon.toFixed(4), lat: +lat.toFixed(4),
    sign: s, signDeg: +(lon - s * 30).toFixed(4), dial90: +(lon % 90).toFixed(4),
    helioLon: +helio.helioLon.toFixed(4), distanceAU: el.a,
    precision: "mean_element_fictitious",
    source: el.elementSource,
  };
}

/** ผลรวมตำแหน่ง TNP Witte ณ วันที่ + รายการที่คำนวณไม่ได้ + ป้ายความแม่น */
export type WitteTnpPositions = {
  source: typeof TNP_POSITION_SOURCE;
  precisionNote: string;
  computed: TnpPosition[];                                   // 3 ดวง (Cupido/Hades/Kronos)
  notComputable: typeof TNP_NOT_COMPUTABLE;                  // Zeus (element ขาด)
  elementsMissing: Array<{ name: string; missing: string[] }>; // element ที่ขาดต่อดวง (โปร่งใส)
};

/** คำนวณตำแหน่ง TNP Witte ทั้งหมด ณ วันที่ (deterministic · ใช้ได้ทั้งมี/ไม่มีเวลาเกิด — พึ่งแค่วันที่) */
export function witteTnpPositions(date: Date): WitteTnpPositions {
  return {
    source: TNP_POSITION_SOURCE,
    precisionNote: TNP_PRECISION_NOTE,
    computed: TNP_ELEMENTS.map((el) => tnpPosition(el, date)),
    notComputable: TNP_NOT_COMPUTABLE,
    elementsMissing: [
      ...TNP_ELEMENTS.map((el) => ({ name: el.name, missing: el.missing })),
      ...TNP_NOT_COMPUTABLE.map((z) => ({ name: z.name, missing: z.missing })),
    ],
  };
}
