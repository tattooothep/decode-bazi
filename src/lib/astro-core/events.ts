/**
 * astro-core/events · ตัวหา "วันเกิดเหตุ" แบบ deterministic (ใช้ร่วม Western/Vedic/Qizheng)
 * หลักการ: scan ช่วงเวลาด้วย step ตามความเร็วดาว → เจอการข้ามศูนย์ (sign change) → bisection จนแม่นระดับนาที
 * ⚠️ engine คำนวณ → AI แค่ตีความ (กฎข้อ 9) · ห้ามให้ AI ประมาณวันเอง
 */
import * as A from "astronomy-engine";
import { type BodyKey, eclipticLon, eclipticSpeed, meanNode, norm360 } from "./ephemeris";

export type EventBodyKey = BodyKey | "Rahu" | "Ketu";

/** ระยะห่างเชิงมุมแบบมีเครื่องหมาย (-180, 180] */
export function wrap180(d: number): number {
  const x = norm360(d);
  return x > 180 ? x - 360 : x;
}

/** longitude ของ body (รองรับ Rahu/Ketu = mean node) */
export function bodyLon(body: EventBodyKey, date: Date): number {
  if (body === "Rahu") return meanNode(date);
  if (body === "Ketu") return norm360(meanNode(date) + 180);
  return eclipticLon(body, date);
}

/** step scan (วัน) ตามคาบดาว — เล็กพอที่จะไม่พลาด hit ระหว่างเดินหน้า-ถอย-เดินหน้า */
export const SCAN_STEP_DAYS: Record<string, number> = {
  Sun: 4, Moon: 0.4, Mercury: 1.5, Venus: 2, Mars: 4,
  Jupiter: 8, Saturn: 10, Uranus: 12, Neptune: 12, Pluto: 12,
  Rahu: 10, Ketu: 10,
};

const DAY_MS = 86400000;

/** bisection หา instant ที่ f เปลี่ยนเครื่องหมายใน [t0,t1] (f ต่อเนื่อง) */
function bisect(f: (t: Date) => number, t0: Date, t1: Date, iters = 48): Date {
  let a = t0.getTime(), b = t1.getTime();
  let fa = f(new Date(a));
  for (let i = 0; i < iters && b - a > 1000; i++) {
    const m = (a + b) / 2;
    const fm = f(new Date(m));
    if ((fa <= 0 && fm <= 0) || (fa > 0 && fm > 0)) { a = m; fa = fm; } else { b = m; }
  }
  return new Date((a + b) / 2);
}

export type AspectHit = {
  body: EventBodyKey;
  targetName: string;
  targetLon: number;
  aspectAngle: number;      // 0/60/90/120/180
  date: Date;
  retro: boolean;           // ดาวจรกำลังถอยตอนชนหรือไม่
  pass: number;             // ครั้งที่เท่าไหร่ในช่วง (เดินหน้า-ถอย-เดินหน้า = 3 ครั้ง)
};

/** หา "วันมุม exact" ของดาวจร body ทำมุม aspectAngle กับจุด natal (targetLon) ในช่วง [from,to] */
export function findAspectHits(body: EventBodyKey, targetName: string, targetLon: number, aspectAngle: number, from: Date, to: Date): AspectHit[] {
  const stepMs = (SCAN_STEP_DAYS[body] ?? 6) * DAY_MS;
  // มุม exact เมื่อ |wrap180(lon − target)| = angle → แก้ 2 สาขา (+angle, −angle) · 0/180 = สาขาเดียว
  const branches = aspectAngle === 0 || aspectAngle === 180 ? [aspectAngle] : [aspectAngle, -aspectAngle];
  const hits: AspectHit[] = [];
  for (const br of branches) {
    const f = (t: Date) => wrap180(bodyLon(body, t) - targetLon - br);
    let prevT = from.getTime();
    let prevV = f(new Date(prevT));
    for (let t = prevT + stepMs; t <= to.getTime() + stepMs; t += stepMs) {
      const now = Math.min(t, to.getTime());
      const v = f(new Date(now));
      // ข้ามศูนย์แบบ "ระยะสั้น" เท่านั้น (กัน wrap 360 หลอกตอนดาวข้ามจุดตรงข้าม)
      if (prevV === 0 || (prevV < 0 !== v < 0 && Math.abs(prevV - v) < 90)) {
        const d = bisect(f, new Date(prevT), new Date(now));
        if (d.getTime() >= from.getTime() && d.getTime() <= to.getTime()) {
          hits.push({
            body, targetName, targetLon, aspectAngle,
            date: d,
            retro: body === "Rahu" || body === "Ketu" ? true : eclipticSpeed(body as BodyKey, d) < 0,
            pass: 0,
          });
        }
      }
      prevT = now; prevV = v;
      if (now >= to.getTime()) break;
    }
  }
  hits.sort((x, y) => x.date.getTime() - y.date.getTime());
  // ตัดซ้ำ (สองสาขาอาจเจอจุดเดียวกันที่ 0/180) + ใส่ลำดับ pass
  const dedup: AspectHit[] = [];
  for (const h of hits) {
    if (dedup.length && Math.abs(dedup[dedup.length - 1].date.getTime() - h.date.getTime()) < 6 * 3600 * 1000) continue;
    dedup.push(h);
  }
  dedup.forEach((h, i) => { h.pass = i + 1; });
  return dedup;
}

export type IngressEvent = { body: EventBodyKey; date: Date; fromSign: number; toSign: number; retro: boolean };

/** หา "วันย้ายราศี" (ingress) ของดาวในช่วง · offsetDeg = ayanamsa สำหรับ sidereal (0 = tropical) */
export function findIngresses(body: EventBodyKey, from: Date, to: Date, offsetDeg = 0): IngressEvent[] {
  const stepMs = (SCAN_STEP_DAYS[body] ?? 6) * DAY_MS;
  const lonAt = (t: Date) => norm360(bodyLon(body, t) - offsetDeg);
  const out: IngressEvent[] = [];
  let prevT = from.getTime();
  let prevSign = Math.floor(lonAt(new Date(prevT)) / 30);
  for (let t = prevT + stepMs; t <= to.getTime() + stepMs; t += stepMs) {
    const now = Math.min(t, to.getTime());
    const sign = Math.floor(lonAt(new Date(now)) / 30);
    if (sign !== prevSign) {
      // ขอบราศีที่ถูกข้าม: เดินหน้า = ขอบของ sign ใหม่ · ถอยหลัง = ขอบของ sign เดิม
      const forward = wrap180(lonAt(new Date(now)) - lonAt(new Date(prevT))) > 0;
      const boundary = (forward ? sign : prevSign) * 30;
      const f = (tt: Date) => wrap180(lonAt(tt) - boundary);
      const d = bisect(f, new Date(prevT), new Date(now));
      if (d.getTime() >= from.getTime() && d.getTime() <= to.getTime()) {
        out.push({ body, date: d, fromSign: prevSign, toSign: sign, retro: body === "Rahu" || body === "Ketu" ? true : eclipticSpeed(body as BodyKey, d) < 0 });
      }
    }
    prevT = now; prevSign = sign;
    if (now >= to.getTime()) break;
  }
  return out;
}

export type StationEvent = { body: BodyKey; date: Date; type: "station_retrograde" | "station_direct"; lon: number };

/** หา "วันดาวหยุดนิ่ง" (station) — ความเร็วเปลี่ยนเครื่องหมาย */
export function findStations(body: BodyKey, from: Date, to: Date): StationEvent[] {
  if (body === "Sun" || body === "Moon") return [];
  const stepMs = Math.min(4, SCAN_STEP_DAYS[body] ?? 4) * DAY_MS;
  const out: StationEvent[] = [];
  let prevT = from.getTime();
  let prevV = eclipticSpeed(body, new Date(prevT));
  for (let t = prevT + stepMs; t <= to.getTime() + stepMs; t += stepMs) {
    const now = Math.min(t, to.getTime());
    const v = eclipticSpeed(body, new Date(now));
    if (prevV < 0 !== v < 0) {
      const d = bisect((tt) => eclipticSpeed(body, tt), new Date(prevT), new Date(now), 36);
      if (d.getTime() >= from.getTime() && d.getTime() <= to.getTime()) {
        out.push({ body, date: d, type: v < 0 ? "station_retrograde" : "station_direct", lon: eclipticLon(body, d) });
      }
    }
    prevT = now; prevV = v;
    if (now >= to.getTime()) break;
  }
  return out;
}

/** หา instant ที่ดาว body กลับสู่ลองจิจูดกำเนิด (return) ใกล้ approxDate ที่สุด */
export function findReturnInstant(body: BodyKey, natalLon: number, approxDate: Date, windowDays = 30): Date | null {
  const from = new Date(approxDate.getTime() - windowDays * DAY_MS);
  const to = new Date(approxDate.getTime() + windowDays * DAY_MS);
  const hits = findAspectHits(body, "natal", natalLon, 0, from, to);
  if (!hits.length) return null;
  hits.sort((a, b) => Math.abs(a.date.getTime() - approxDate.getTime()) - Math.abs(b.date.getTime() - approxDate.getTime()));
  return hits[0].date;
}

export type EclipseEvent = {
  kind: "solar" | "lunar";
  subtype: string;             // total/annular/partial/penumbral/hybrid
  date: Date;                  // peak
  eclipseLon: number;          // จุดคราส (solar = Sun · lunar = Moon)
};

/** คราสทั้งหมดในช่วง (astronomy-engine ให้ instant ตรง ๆ) */
export function findEclipses(from: Date, to: Date): EclipseEvent[] {
  const out: EclipseEvent[] = [];
  try {
    let se = A.SearchGlobalSolarEclipse(from);
    while (se && se.peak.date.getTime() <= to.getTime()) {
      out.push({ kind: "solar", subtype: String(se.kind), date: se.peak.date, eclipseLon: eclipticLon("Sun", se.peak.date) });
      se = A.NextGlobalSolarEclipse(se.peak);
    }
  } catch { /* นอกช่วงข้อมูล = ข้าม */ }
  try {
    let le = A.SearchLunarEclipse(from);
    while (le && le.peak.date.getTime() <= to.getTime()) {
      out.push({ kind: "lunar", subtype: String(le.kind), date: le.peak.date, eclipseLon: norm360(eclipticLon("Sun", le.peak.date) + 180) });
      le = A.NextLunarEclipse(le.peak);
    }
  } catch { /* นอกช่วงข้อมูล = ข้าม */ }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
