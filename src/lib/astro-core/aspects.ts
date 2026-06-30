/**
 * astro-core · มุมสัมพันธ์ดาว (aspects) — Western (+七政 對照/三合)
 * major aspects: 合0/六十60/สี่เหลี่ยม90/สามเหลี่ยม120/เล็ง180 · orb ตามดาว
 */
const norm360 = (d: number) => ((d % 360) + 360) % 360;

export type AspectType = "conjunction" | "sextile" | "square" | "trine" | "opposition";
export const ASPECTS: { type: AspectType; angle: number; th: string; zh: string }[] = [
  { type: "conjunction", angle: 0,   th: "ทับซ้อน",   zh: "合" },
  { type: "sextile",     angle: 60,  th: "หกสิบ",     zh: "六分" },
  { type: "square",      angle: 90,  th: "ฉาก (ขัด)", zh: "刑/方" },
  { type: "trine",       angle: 120, th: "ตรีโกณ (ดี)", zh: "拱/三分" },
  { type: "opposition",  angle: 180, th: "เล็ง (ปะทะ)", zh: "沖/對" },
];

/** orb มาตรฐาน (องศา) — ดาวสว่าง(日月)กว้างกว่า */
function orbFor(a: string, b: string): number {
  const luminary = (x: string) => x === "Sun" || x === "Moon";
  return luminary(a) || luminary(b) ? 8 : 6;
}

export type Aspect = { a: string; b: string; type: AspectType; angleTh: string; orb: number; applying: boolean };

/** หามุมสัมพันธ์ระหว่างดาวคู่ (รับ list {key,lon,speed}) */
export function findAspects(bodies: { key: string; lon: number; speed: number }[]): Aspect[] {
  const out: Aspect[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      let sep = Math.abs(norm360(A.lon - B.lon)); if (sep > 180) sep = 360 - sep;
      for (const asp of ASPECTS) {
        const orb = orbFor(A.key, B.key);
        const d = Math.abs(sep - asp.angle);
        if (d <= orb) {
          // applying: มุมกำลังเข้าใกล้ (ดาวเร็วไล่ตาม)
          const rel = (A.speed - B.speed);
          const applying = (norm360(A.lon - B.lon) < 180) ? rel < 0 : rel > 0;
          out.push({ a: A.key, b: B.key, type: asp.type, angleTh: asp.th, orb: +d.toFixed(2), applying });
          break;
        }
      }
    }
  }
  return out;
}
