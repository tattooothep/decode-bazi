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

export type StarPos = { key: string; lonTrop: number; retro: boolean };
export type AstroChart = {
  dtUTC: string; lat: number; lng: number;
  ascendant: number;                 // 命宮 ลัคนา (tropical องศา)
  obliquity: number;
  stars: StarPos[];                  // 7政 + 羅計月孛 (紫氣 = ยังไม่คำนวณ V1)
};

/** คำนวณผังดาราศาสตร์ทั้งหมด (deterministic · verify ได้) */
export function computeAstro(dtUTC: Date, lat: number, lng: number): AstroChart {
  const stars: StarPos[] = BODIES.map((b) => ({ key: b, lonTrop: eclipticLon(b, dtUTC), retro: isRetro(b, dtUTC) }));
  const node = meanNode(dtUTC);
  stars.push({ key: "Rahu", lonTrop: node, retro: true });          // 羅睺 (mean node ถอยเสมอ)
  stars.push({ key: "Ketu", lonTrop: norm360(node + 180), retro: true }); // 計都
  stars.push({ key: "Yuebo", lonTrop: lunarApogee(dtUTC), retro: false }); // 月孛
  // 紫氣 = ยังไม่คำนวณ (รอยืนยัน lineage · ห้าม fake)
  return {
    dtUTC: dtUTC.toISOString(), lat, lng,
    ascendant: ascendant(dtUTC, lat, lng),
    obliquity: obliquity(dtUTC),
    stars,
  };
}
