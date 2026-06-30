/**
 * astro-core · ระบบเรือน (houses) — Whole-sign + Equal
 * Whole-sign: เรือน = ราศี (Vedic bhava + Western traditional) · Equal: asc + 30k
 * Placidus = roadmap (ต้อง semi-arc · default Whole/Equal ก่อน · ถูกต้องตามสำนัก whole-sign)
 */
const norm360 = (d: number) => ((d % 360) + 360) % 360;

export type HouseSystem = "whole" | "equal";
export type HouseCusp = { house: number; cuspLon: number; sign: number };

/** 12 เรือน · house 1 = ลัคนา */
export function houses(ascLon: number, system: HouseSystem = "whole"): HouseCusp[] {
  const out: HouseCusp[] = [];
  const ascSign = Math.floor(norm360(ascLon) / 30);
  for (let i = 0; i < 12; i++) {
    if (system === "whole") {
      const sign = (ascSign + i) % 12;
      out.push({ house: i + 1, cuspLon: sign * 30, sign });
    } else {
      const cusp = norm360(ascLon + i * 30);
      out.push({ house: i + 1, cuspLon: +cusp.toFixed(3), sign: Math.floor(cusp / 30) });
    }
  }
  return out;
}

/** ดาวที่ longitude lon อยู่เรือนไหน (whole-sign: ตามราศี · equal: ตาม cusp) */
export function houseOf(lon: number, ascLon: number, system: HouseSystem = "whole"): number {
  const L = norm360(lon);
  if (system === "whole") {
    const ascSign = Math.floor(norm360(ascLon) / 30);
    return ((Math.floor(L / 30) - ascSign + 12) % 12) + 1;
  }
  return (Math.floor(norm360(L - ascLon) / 30) % 12) + 1;
}
