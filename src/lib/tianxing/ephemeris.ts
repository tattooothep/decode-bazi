/**
 * 天星擇日 · ชั้นดาราศาสตร์ (deterministic) — ตำแหน่งดาวจริง
 * ใช้ astronomy-engine (MIT · VSOP87/Meeus · ไม่ใช่ตารางดาวโบราณ · ไม่มีไฟล์ ephemeris)
 * ทุกสูตร mean-element อ้าง Meeus "Astronomical Algorithms" (มาตรฐานสากล)
 * ✅ verify: วสันตวิษุวัต→Sun 0° · พระอาทิตย์ขึ้น→Sun≈ลัคนา
 */
import * as A from "astronomy-engine";

const norm360 = (d: number) => ((d % 360) + 360) % 360;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const jdOf = (date: Date) => date.getTime() / 86400000 + 2440587.5;
const tOf = (date: Date) => (jdOf(date) - 2451545.0) / 36525;

export type PlanetKey = "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn";
const BODIES: PlanetKey[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];

/** ลองจิจูดสุริยวิถี (tropical) ของดาว ณ เวลา (geocentric apparent) */
export function eclipticLon(body: PlanetKey, date: Date): number {
  if (body === "Sun") return norm360(A.SunPosition(date).elon);
  const v = A.GeoVector(body as any, date, true);
  return norm360(A.Ecliptic(v).elon);
}

/** ดาวเดินถอย (พักร์) — เทียบ longitude วันนี้กับ −1 วัน (Sun/Moon ไม่ถอยเสมอ) */
function isRetro(body: PlanetKey, date: Date): boolean {
  if (body === "Sun" || body === "Moon") return false;
  const a = eclipticLon(body, date);
  const b = eclipticLon(body, new Date(date.getTime() - 86400000));
  let diff = a - b; if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
  return diff < 0;
}

/** ความเอียงสุริยวิถี (mean obliquity · Meeus) องศา */
export function obliquity(date: Date): number {
  const T = tOf(date);
  return 23.439291 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
}

/** 羅睺 = mean ascending node ของดวงจันทร์ (Meeus) · 計都 = +180 */
export function meanNode(date: Date): number {
  const T = tOf(date);
  return norm360(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000);
}
/** 月孛 = mean lunar apogee (= mean perigee ϖ + 180 · Meeus) */
export function lunarApogee(date: Date): number {
  const T = tOf(date);
  const peri = 83.3532465 + 4069.0137287 * T - 0.0103200 * T * T - T * T * T / 80053;
  return norm360(peri + 180);
}

/** ลัคนา (命宮) — Ascendant ecliptic longitude (tropical) · สูตรมาตรฐาน */
export function ascendant(date: Date, latDeg: number, lngDeg: number): number {
  // GST (apparent sidereal time, ชม.) → LST องศา (ตะวันออก +)
  const gstHours = A.SiderealTime(date);                 // Greenwich apparent sidereal time
  const ramc = norm360(gstHours * 15 + lngDeg);          // local sidereal (RAMC) องศา
  const eps = obliquity(date) * D2R;
  const phi = latDeg * D2R;
  const th = ramc * D2R;
  // λ_asc = atan2( cosθ , −(sinθ·cosε + tanφ·sinε) )
  let asc = Math.atan2(Math.cos(th), -(Math.sin(th) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * R2D;
  return norm360(asc);
}

/* ── 23 ก.ค. 2569 · ค่าดาราศาสตร์จริงต่อดาว (additive · ไม่แตะ lonTrop/retro เดิม) ──
 * ลอกวิธีเรียกจากของที่มีในบ้านแล้ว:
 *   elat        ← src/lib/astro-core/ephemeris.ts (eclipticCoords: SunPosition().elat / A.Ecliptic(GeoVector).elat)
 *   altDeg/azDeg ← src/lib/luck-engine/modules/rahu-kalam.ts (A.Observer) + A.Equator + A.Horizon
 *   mag/phaseFrac/ringTilt ← A.Illumination
 * ⚠️ ทุก field เป็น optional — คำนวณไม่ได้ = ไม่ส่ง (ห้ามส่ง 0 หลอก)
 * ⚠️ 4 ดาวเงา (羅睺/計都/月孛/紫氣) = "จุดคำนวณ" ไม่ใช่วัตถุจริง → ไม่มี mag/alt/az เด็ดขาด
 */
export type StarPos = {
  key: string;
  lonTrop: number;
  retro: boolean;
  elat?: number;      // ละติจูดสุริยวิถี (°) — เหนือ + / ใต้ −
  altDeg?: number;    // มุมเงยเหนือขอบฟ้า (°) −90..90 · รวมการหักเหแสง (refraction "normal")
  azDeg?: number;     // ทิศ (°) 0=เหนือ 90=ตะวันออก · 0..360
  mag?: number;       // ความสว่างปรากฏจริง (visual magnitude · ยิ่งน้อยยิ่งสว่าง)
  phaseFrac?: number; // สัดส่วนหน้าที่สว่าง 0..1 — ส่งเฉพาะดวงจันทร์
  ringTilt?: number;  // มุมเอียงวงแหวน (°) — ส่งเฉพาะเสาร์
};

/** ละติจูดสุริยวิถี (tropical · geocentric apparent) — pattern เดียวกับ astro-core/eclipticCoords */
export function eclipticLat(body: PlanetKey, date: Date): number {
  if (body === "Sun") {
    const s = A.SunPosition(date) as unknown as { elat?: number };
    return Number(s.elat || 0);
  }
  const v = A.GeoVector(body as any, date, true);
  const e = A.Ecliptic(v) as unknown as { elat: number };
  return Number(e.elat || 0);
}

/** มุมเงย/ทิศ ณ พิกัด+เวลานั้น — A.Observer + A.Equator(ofdate,aberration) + A.Horizon (pattern rahu-kalam) */
export function horizonOf(body: PlanetKey, date: Date, lat: number, lng: number): { altDeg: number; azDeg: number } | null {
  try {
    const obs = new A.Observer(lat, lng, 0);
    const eq = A.Equator(body as any, date, obs, true, true);
    const h = A.Horizon(date, obs, eq.ra, eq.dec, "normal");
    if (!Number.isFinite(h.altitude) || !Number.isFinite(h.azimuth)) return null;
    return { altDeg: +h.altitude.toFixed(2), azDeg: +norm360(h.azimuth).toFixed(2) };
  } catch { return null; }
}

/** ความสว่าง/เฟส/วงแหวน — A.Illumination (mag ของทุกดวง · phase_fraction เอาเฉพาะจันทร์ · ring_tilt เฉพาะเสาร์) */
export function illuminationOf(body: PlanetKey, date: Date): { mag?: number; phaseFrac?: number; ringTilt?: number } {
  try {
    const i = A.Illumination(body as any, date);
    const out: { mag?: number; phaseFrac?: number; ringTilt?: number } = {};
    if (Number.isFinite(i.mag)) out.mag = +i.mag.toFixed(2);
    if (body === "Moon" && Number.isFinite(i.phase_fraction)) out.phaseFrac = +i.phase_fraction.toFixed(4);
    if (body === "Saturn" && typeof i.ring_tilt === "number" && Number.isFinite(i.ring_tilt)) out.ringTilt = +i.ring_tilt.toFixed(2);
    return out;
  } catch { return {}; }
}
export type AstroChart = {
  dtUTC: string; lat: number; lng: number;
  ascendant: number;                 // 命宮 ลัคนา (tropical องศา)
  obliquity: number;
  stars: StarPos[];                  // 7政 + 羅計月孛 (紫氣 = ยังไม่คำนวณ V1)
};

/** คำนวณผังดาราศาสตร์ทั้งหมด (deterministic · verify ได้) */
export function computeAstro(dtUTC: Date, lat: number, lng: number): AstroChart {
  const stars: StarPos[] = BODIES.map((b) => {
    const base: StarPos = { key: b, lonTrop: eclipticLon(b, dtUTC), retro: isRetro(b, dtUTC) };
    const elat = eclipticLat(b, dtUTC);
    if (Number.isFinite(elat)) base.elat = +elat.toFixed(4);
    const hz = horizonOf(b, dtUTC, lat, lng);
    if (hz) { base.altDeg = hz.altDeg; base.azDeg = hz.azDeg; }
    const il = illuminationOf(b, dtUTC);
    if (il.mag !== undefined) base.mag = il.mag;
    if (il.phaseFrac !== undefined) base.phaseFrac = il.phaseFrac;
    if (il.ringTilt !== undefined) base.ringTilt = il.ringTilt;
    return base;
  });
  const node = meanNode(dtUTC);
  // 羅睺/計都 = จุดตัดวงโคจรจันทร์กับสุริยวิถี → อยู่บนระนาบสุริยวิถีพอดี elat = 0 "ตามนิยาม" (ไม่ใช่ค่าที่วัดได้)
  // ไม่มี mag/altDeg/azDeg เพราะไม่ใช่วัตถุจริง (ห้ามปั้น)
  stars.push({ key: "Rahu", lonTrop: node, retro: true, elat: 0 });          // 羅睺 (mean node ถอยเสมอ)
  stars.push({ key: "Ketu", lonTrop: norm360(node + 180), retro: true, elat: 0 }); // 計都
  // 月孛 = mean lunar apogee (ธาตุวงโคจรเฉลี่ย) — ละติจูดไม่นิยามเป็น 0 → ไม่ส่ง elat
  stars.push({ key: "Yuebo", lonTrop: lunarApogee(dtUTC), retro: false }); // 月孛
  // 紫氣 = ยังไม่คำนวณ (รอยืนยัน lineage · ห้าม fake)
  return {
    dtUTC: dtUTC.toISOString(), lat, lng,
    ascendant: ascendant(dtUTC, lat, lng),
    obliquity: obliquity(dtUTC),
    stars,
  };
}
