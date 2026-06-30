/**
 * astro-core · ชั้นดาราศาสตร์ใช้ร่วม (deterministic) — ตำแหน่งดาวจริง
 * ใช้ astronomy-engine (MIT · VSOP87/Meeus) · ฐานร่วมของ 七政四餘 / Western / Vedic
 * ⚠️ engine คำนวณ → AI แค่ตีความ (กฎข้อ 9) · ห้ามให้ AI เดาตำแหน่งดาว
 * อิงสูตรเดียวกับ src/lib/tianxing/ephemeris.ts (validated golden 5/5) + ขยายดาวนอก
 */
import * as A from "astronomy-engine";

export const norm360 = (d: number) => ((d % 360) + 360) % 360;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const jdOf = (date: Date) => date.getTime() / 86400000 + 2440587.5;
const tOf = (date: Date) => (jdOf(date) - 2451545.0) / 36525;

/** ดาวคลาสสิก 7 (七政) + ดาวนอก 3 (Western modern) */
export type BodyKey =
  | "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn"
  | "Uranus" | "Neptune" | "Pluto";

export const CLASSICAL_7: BodyKey[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
export const MODERN_3: BodyKey[] = ["Uranus", "Neptune", "Pluto"];

/** ลองจิจูดสุริยวิถี (tropical · geocentric apparent) ของดาว ณ เวลา */
export function eclipticLon(body: BodyKey, date: Date): number {
  if (body === "Sun") return norm360(A.SunPosition(date).elon);
  const v = A.GeoVector(A.Body[body] as any, date, true);
  return norm360(A.Ecliptic(v).elon);
}

/** ความเร็ว ใช้แยก applying/separating + retro · °/วัน (เทียบ ±0.5 วัน) */
export function eclipticSpeed(body: BodyKey, date: Date): number {
  const dt = 0.5 * 86400000;
  const a = eclipticLon(body, new Date(date.getTime() - dt));
  const b = eclipticLon(body, new Date(date.getTime() + dt));
  let diff = b - a; if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
  return diff; // ต่อ 1 วัน
}

/** ดาวเดินถอย (พักร์) — Sun/Moon ไม่ถอยเสมอ */
export function isRetro(body: BodyKey, date: Date): boolean {
  if (body === "Sun" || body === "Moon") return false;
  return eclipticSpeed(body, date) < 0;
}

/** ความเอียงสุริยวิถี (mean obliquity · Meeus) องศา */
export function obliquity(date: Date): number {
  const T = tOf(date);
  return 23.439291 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
}

/** 羅睺/Rahu = mean ascending node (Meeus) · 計都/Ketu = +180 (Vedic ใช้ mean node) */
export function meanNode(date: Date): number {
  const T = tOf(date);
  return norm360(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000);
}
/** 月孛 = mean lunar apogee */
export function lunarApogee(date: Date): number {
  const T = tOf(date);
  const peri = 83.3532465 + 4069.0137287 * T - 0.0103200 * T * T - T * T * T / 80053;
  return norm360(peri + 180);
}

/** RAMC (Right Ascension of MC) องศา */
export function ramc(date: Date, lngDeg: number): number {
  return norm360(A.SiderealTime(date) * 15 + lngDeg);
}

/** ลัคนา (Ascendant) ecliptic longitude (tropical) · สูตรมาตรฐาน (= tianxing validated) */
export function ascendant(date: Date, latDeg: number, lngDeg: number): number {
  const eps = obliquity(date) * D2R;
  const phi = latDeg * D2R;
  const th = ramc(date, lngDeg) * D2R;
  const asc = Math.atan2(Math.cos(th), -(Math.sin(th) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * R2D;
  return norm360(asc);
}

/** MC (Midheaven) ecliptic longitude (tropical) */
export function midheaven(date: Date, lngDeg: number): number {
  const eps = obliquity(date) * D2R;
  const r = ramc(date, lngDeg) * D2R;
  let mc = Math.atan2(Math.tan(r), Math.cos(eps)) * R2D;
  // เลือก quadrant ให้ตรงกับ RAMC
  mc = norm360(mc);
  const ra = norm360(ramc(date, lngDeg));
  if (Math.abs(norm360(mc - ra)) > 90 && Math.abs(norm360(mc - ra)) < 270) mc = norm360(mc + 180);
  return mc;
}

export type BodyPos = { key: BodyKey | "Rahu" | "Ketu" | "Yuebo"; lon: number; speed: number; retro: boolean };

/** ดาวทั้งหมด (เลือกชุด) + นod/apogee */
export function computeBodies(date: Date, opts: { modern?: boolean; node?: boolean; apogee?: boolean } = {}): BodyPos[] {
  const set: BodyKey[] = opts.modern ? [...CLASSICAL_7, ...MODERN_3] : [...CLASSICAL_7];
  const out: BodyPos[] = set.map((b) => ({ key: b, lon: eclipticLon(b, date), speed: eclipticSpeed(b, date), retro: isRetro(b, date) }));
  if (opts.node !== false) {
    const node = meanNode(date);
    out.push({ key: "Rahu", lon: node, speed: -0.0529, retro: true });
    out.push({ key: "Ketu", lon: norm360(node + 180), speed: -0.0529, retro: true });
  }
  if (opts.apogee) out.push({ key: "Yuebo", lon: lunarApogee(date), speed: 0.111, retro: false });
  return out;
}
