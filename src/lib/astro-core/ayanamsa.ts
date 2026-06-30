/**
 * astro-core · Ayanamsa (Lahiri/Chitrapaksha) — แปลง tropical → sidereal สำหรับ Vedic
 * Lahiri: anchor Spica (Chitra) · ค่า J2000.0 = 23.85294° · อิง precession
 * ⚠️ golden-verify กับ astro.com (sidereal=Lahiri) ก่อน lock — beta จนกว่าจะยืนยัน
 */
const jdOf = (date: Date) => date.getTime() / 86400000 + 2440587.5;

/** Lahiri ayanamsa (องศา) ณ วันที่ */
export function lahiriAyanamsa(date: Date): number {
  const T = (jdOf(date) - 2451545.0) / 36525.0;       // Julian centuries from J2000
  // Lahiri (Chitrapaksha) · 23.85294° @J2000 + precession (~50.27"/ปี) + acceleration
  return 23.85294 + 1.396042 * T + 0.000308 * T * T;
}

/** tropical longitude → sidereal (Vedic) */
export function toSidereal(lonTropical: number, date: Date): number {
  return ((lonTropical - lahiriAyanamsa(date)) % 360 + 360) % 360;
}
