/**
 * โหราศาสตร์ยูเรเนียน (Uranian / Hamburger Schule) — engine deterministic ล้วน
 * ════════════════════════════════════════════════════════════════════════
 * ศาสตร์ที่ 6 · วิธีของ Alfred Witte (1878–1941 · คัมภีร์ PD): ภาพดาว (Planetenbild) +
 * ครึ่งผลรวม (Halbsumme) + จุดไว (sensitive Punkte) บนหน้าปัด 90° (dial 90°)
 *
 * กฎข้อ 9 (BaZi/Decode): engine คำนวณ structured JSON → AI แค่ตีความภาษา
 *   - ตำแหน่งดาวจริง 10 ดวง (tropical) มาจาก astro-core/ephemeris (astronomy-engine MIT) เดียวกับ Western
 *   - ลัคนา/กลางฟ้า (Meridian/MC/Asc) เมื่อมีเวลาเกิด (degraded no-time เหมือน Western)
 *   - จุดกึ่งกลาง (Halbsumme) + ภาพดาว + จุดไว = เรขาคณิตล้วน (ใช้อัลกอริทึม dial 90° เดียวกับ day-sniper r386)
 *
 * ⚠️ ทรานส์เนปจูนของ Witte เอง (Cupido/Hades/Kronos/Zeus = PD) — เฟส 1 ยัง "ไม่คำนวณตำแหน่ง"
 *    (ต้องใช้ Immerwährende Ephemeride ของ Witte / SwissEph = roadmap เฟส 2) → ระบุชื่อ+เจ้าราศี+แหล่งความหมาย
 *    ไว้ให้ panel อ้างคัมภีร์หมวด H ได้ แต่ห้ามแต่งองศา/จุดกึ่งกลางของมันเอง
 * ⛔ ห้ามรวม Apollon/Admetos/Vulkanus/Poseidon (Sieggrün หลังสงคราม = ลิขสิทธิ์) เด็ดขาด
 *
 * ไม่มี Date.now()/Math.random() — รับ dtUTC เข้ามาเท่านั้น → ผลลัพธ์คงที่
 */
import { computeBodies, ascendant, midheaven, norm360, type BodyPos } from "../../astro-core/ephemeris";
import { wrap180 } from "../../astro-core/events";

/** ชื่อไทยของดาว/จุด (key จาก astro-core) */
const NAME_TH: Record<string, string> = {
  Sun: "อาทิตย์", Moon: "จันทร์", Mercury: "พุธ", Venus: "ศุกร์", Mars: "อังคาร",
  Jupiter: "พฤหัสบดี", Saturn: "เสาร์", Uranus: "ยูเรนัส", Neptune: "เนปจูน", Pluto: "พลูโต",
  Meridian: "เมริเดียน (MC)", Ascendant: "ลัคนา (Asc)",
};
/** ชื่อเยอรมัน (verbatim ตามคัมภีร์ Witte · ใช้จับคู่ประโยคความหมาย) */
const NAME_DE: Record<string, string> = {
  Sun: "Sonne", Moon: "Mond", Mercury: "Merkur", Venus: "Venus", Mars: "Mars",
  Jupiter: "Jupiter", Saturn: "Saturn", Uranus: "Uranus", Neptune: "Neptun", Pluto: "Pluto",
  Meridian: "Meridian", Ascendant: "Aszendent",
};

/** ราศี 12 (index 0 = เมษ) — เพื่ออ้างตำแหน่งอ่านง่าย (สากล ไม่ใช่ศัพท์จีน/พระเวท) */
export const SIGN_TH = [
  "เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์",
  "ตุล", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน",
] as const;

/** ดาวจริงที่ Witte ใช้ (10 ดวง · ☉☽☿♀♂♃♄⛢♆♇) — ลำดับคงที่ = deterministic */
const URANIAN_BODY_ORDER = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as const;

/**
 * ทรานส์เนปจูนที่ „Witte เขียนความหมายเองในวารสาร PD" (คัมภีร์หมวด H · 01-source-policy-conclusion)
 * เฟส 1: position = null (ยังไม่ wire ephemeris จริง) — panel อ้างความหมาย verbatim จากคัมภีร์เท่านั้น
 * ⛔ ไม่รวม Apollon/Admetos/Vulkanus/Poseidon (Sieggrün · ลิขสิทธิ์)
 */
export const WITTE_TNP: Array<{ name: string; nameDe: string; nameTh: string; rulerSignDe: string; canonRef: string }> = [
  { name: "Cupido", nameDe: "Cupido", nameTh: "คิวปิโด", rulerSignDe: "Wage (ตุล)", canonRef: "คัมภีร์หมวด H.1 · บท 19" },
  { name: "Hades", nameDe: "Hades", nameTh: "ฮาเดส", rulerSignDe: "Jungfrau (กันย์)", canonRef: "คัมภีร์หมวด H.2 · บท 40" },
  { name: "Kronos", nameDe: "Kronos", nameTh: "โครนอส", rulerSignDe: "Krebs (กรกฎ)", canonRef: "คัมภีร์หมวด H.3 · บท 27" },
  { name: "Zeus", nameDe: "Zeus", nameTh: "เซอุส", rulerSignDe: "Löwe (สิงห์)", canonRef: "คัมภีร์หมวด H.4 · บท 19/40" },
];

/** ⛔ Lefeldt/Sieggrün transneptunians — ห้ามหลุดเข้าระบบ (คงไว้เพื่อ guard/test อ่านได้ · ไม่เคยถูก compute) */
export const EXCLUDED_TNP = ["Apollon", "Admetos", "Vulkanus", "Poseidon"] as const;

/** จุดร่วมสร้างภาพดาว (planetary picture point): ดาว/จุด 1 ตัว บนหน้าปัด 90° */
export type UranianPoint = {
  name: string;       // key อังกฤษ เช่น "Sun"
  nameTh: string;
  nameDe: string;
  kind: "planet" | "angle";
  lon: number;        // ลองจิจูดสุริยวิถี tropical 0-360
  sign: number;       // ราศี 0-11
  signTh: string;
  signDeg: number;    // องศาในราศี 0-30
  dial90: number;     // ตำแหน่งบนหน้าปัด 90° (lon mod 90)
  uncertain?: boolean;// จันทร์เมื่อไม่มีเวลาเกิด
};

/** ครึ่งผลรวม (Halbsumme) = แกนสมมาตรของสองดาว a|b */
export type UranianHalbsumme = {
  a: string; b: string;
  aTh: string; bTh: string;
  mid: number;        // ลองจิจูดจุดกึ่งกลาง (ส่วนโค้งสั้น)
  midSignTh: string;
  midSignDeg: number;
  midDial90: number;  // จุดกึ่งกลางบนหน้าปัด 90°
};

/** ภาพดาว (Planetenbild): ดาว/จุด "occupant" ตกบนครึ่งผลรวมของ a|b (a + c − b) ภายใน orb */
export type UranianPlanetaryPicture = {
  pair: string;       // "a/c" (สองดาวที่สร้างครึ่งผลรวม)
  pairTh: string;
  occupant: string;   // ดาว/จุดที่ตกบนแกนสมมาตร
  occupantTh: string;
  formula: string;    // "a + c − occupant" หรือรูปแบบภาพดาว
  orbDeg: number;     // ระยะบนหน้าปัด 90° (0..45)
  applyingNote: "radix_static";
};

/** จุดไว (sensitiver Punkt): ผลรวม (a+b) หรือผลต่าง (a−b) ที่ถูกดาว/จุดอื่นกระตุ้นภายใน orb */
export type UranianSensitivePoint = {
  kind: "sum" | "difference";
  a: string; b: string;
  aTh: string; bTh: string;
  pointLon: number;   // ตำแหน่งจุดไว (สากล 0-360)
  pointSignTh: string;
  pointSignDeg: number;
  activatedBy: string;      // ดาว/จุดที่ตกบนจุดไวภายใน orb
  activatedByTh: string;
  orbDeg: number;
};

export type Gender = "M" | "F";

export type UranianChart = {
  hasBirthTime: boolean;
  degradeLevel: "full" | "partial";     // full = มีเวลาเกิด · partial = ไม่มีเวลา (ไม่มี Meridian/Asc)
  gender: Gender;
  points: UranianPoint[];               // ดาวจริง 10 (+Meridian/Asc เมื่อมีเวลา)
  halbsummen: UranianHalbsumme[];       // ครึ่งผลรวมทุกคู่
  planetaryPictures: UranianPlanetaryPicture[]; // ภาพดาวที่ "ยิงเข้า" orb (คัดคมสุด)
  sensitivePoints: UranianSensitivePoint[];     // จุดไวที่ถูกกระตุ้น (คัดคมสุด)
  witteTransneptunians: typeof WITTE_TNP;       // ชื่อ+เจ้าราศี+แหล่งความหมาย (เฟส 1 ยังไม่คำนวณตำแหน่ง)
  tnpPositionSource: "witte_pd_ephemeris_not_wired_phase1";
  excludedTransneptunians: readonly string[];   // Lefeldt/Sieggrün — ไม่เคยถูกคำนวณ
  orbPictureDeg: number;
  orbSensitiveDeg: number;
};

/* ── คณิตหน้าปัด 90° (dial 90°) — อัลกอริทึมเดียวกับ day-sniper r386 (midpointLon/dial90Distance) ──
 * จุดกึ่งกลาง (a+b)/2 คืนฝั่งส่วนโค้งสั้น (อีกคำตอบ = +180° เท่ากันบน dial 90°)
 * ระยะบน dial 90° ครอบ ☌/□/☍ ต่อทั้ง mid และ mid+180 ในนิพจน์เดียว → ตรงตามขนบ Uranian/Witte
 */
/** จุดกึ่งกลาง (Halbsumme) บนวงกลม — reuse ตรรกะ day-sniper.midpointLon */
export function midpointLon(a: number, b: number): number {
  return norm360(a + wrap180(b - a) / 2);
}
/** ระยะเชิงมุมบนหน้าปัด 90° (องศา 0..45) — reuse ตรรกะ day-sniper.dial90Distance */
export function dial90Distance(lon: number, mid: number): number {
  const d = (((lon - mid) % 90) + 90) % 90;
  return Math.min(d, 90 - d);
}

const ORB_PICTURE_DEG = 1.5;   // ภาพดาว radix — Witte ให้ „Spielraum" แก่ดาวกลาง (บท 31)
const ORB_SENSITIVE_DEG = 1.0; // จุดไวเข้ม
const MAX_PICTURES = 60;       // คุมขนาด packet (prompt budget)
const MAX_SENSITIVE = 60;

function toPoint(b: BodyPos, kind: "planet" | "angle", lonOverride?: number, uncertain?: boolean): UranianPoint {
  const lon = norm360(lonOverride ?? b.lon);
  const s = Math.floor(lon / 30);
  return {
    name: b.key as string,
    nameTh: NAME_TH[b.key as string] ?? (b.key as string),
    nameDe: NAME_DE[b.key as string] ?? (b.key as string),
    kind,
    lon: +lon.toFixed(4),
    sign: s,
    signTh: SIGN_TH[s],
    signDeg: +(lon - s * 30).toFixed(4),
    dial90: +(lon % 90).toFixed(4),
    ...(uncertain ? { uncertain: true } : {}),
  };
}

function anglePoint(name: string, lon: number): UranianPoint {
  const L = norm360(lon);
  const s = Math.floor(L / 30);
  return {
    name, nameTh: NAME_TH[name] ?? name, nameDe: NAME_DE[name] ?? name, kind: "angle",
    lon: +L.toFixed(4), sign: s, signTh: SIGN_TH[s], signDeg: +(L - s * 30).toFixed(4), dial90: +(L % 90).toFixed(4),
  };
}

/**
 * สร้างผังยูเรเนียน (Uranian)
 * @param dtUTC   เวลาเกิด UTC (Date)
 * @param lat     ละติจูด (เหนือ +)
 * @param lng     ลองจิจูด (ตะวันออก +)
 * @param hasTime มีเวลาเกิดแม่นหรือไม่ — false → ไม่มี Meridian/Asc + ติดธงจันทร์
 * @param gender  เพศเจ้าชะตา (context เฉย ๆ · ยูเรเนียนไม่ใช้เพศคำนวณตำแหน่ง)
 */
export function uranianChart(dtUTC: Date, lat: number, lng: number, hasTime = true, gender: Gender = "M"): UranianChart {
  // 1) ดาวจริง 10 ดวง (tropical · astronomy-engine เดียวกับ Western) — ไม่คำนวณ node (ยูเรเนียนใช้ Mondknoten เสริมเท่านั้น เฟส 2)
  const bodies: BodyPos[] = computeBodies(dtUTC, { modern: true, node: false });
  const byOrder = URANIAN_BODY_ORDER.map((k) => bodies.find((b) => b.key === k)).filter((b): b is BodyPos => !!b);

  const points: UranianPoint[] = byOrder.map((b) => toPoint(b, "planet", undefined, !hasTime && b.key === "Moon"));

  // 2) Meridian (MC) + Aszendent — ต้องมีเวลาเกิด (Witte: Meridian = แกนกระตุ้นระดับนาที)
  if (hasTime) {
    const mc = midheaven(dtUTC, lng);
    const asc = ascendant(dtUTC, lat, lng);
    points.push(anglePoint("Meridian", mc));
    points.push(anglePoint("Ascendant", asc));
  }

  // 3) ครึ่งผลรวม (Halbsumme) ทุกคู่ — แกนสมมาตร a|b
  const halbsummen: UranianHalbsumme[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j];
      const mid = midpointLon(a.lon, b.lon);
      const ms = Math.floor(mid / 30);
      halbsummen.push({
        a: a.name, b: b.name, aTh: a.nameTh, bTh: b.nameTh,
        mid: +mid.toFixed(4), midSignTh: SIGN_TH[ms], midSignDeg: +(mid - ms * 30).toFixed(4),
        midDial90: +(mid % 90).toFixed(4),
      });
    }
  }

  // 4) ภาพดาว (Planetenbild): occupant ตกบนครึ่งผลรวมของอีกสองดาว (a + c − occupant ภายใน orb บน dial 90°)
  const pictures: UranianPlanetaryPicture[] = [];
  for (const hs of halbsummen) {
    for (const p of points) {
      if (p.name === hs.a || p.name === hs.b) continue;
      const orb = dial90Distance(p.lon, hs.mid);
      if (orb <= ORB_PICTURE_DEG) {
        pictures.push({
          pair: `${hs.a}/${hs.b}`, pairTh: `${hs.aTh}/${hs.bTh}`,
          occupant: p.name, occupantTh: p.nameTh,
          formula: `${hs.a} + ${hs.b} − ${p.name} = แกนสมมาตร (Halbsumme ${hs.a}|${hs.b})`,
          orbDeg: +orb.toFixed(3), applyingNote: "radix_static",
        });
      }
    }
  }
  pictures.sort((x, y) => x.orbDeg - y.orbDeg || x.pair.localeCompare(y.pair) || x.occupant.localeCompare(y.occupant));

  // 5) จุดไว (sensitive Punkte): ผลรวม a+b และผลต่าง a−b ถูกดาว/จุดอื่นกระตุ้น (Witte บท 16/31)
  //    „a + b − V = a + b" (ผลรวม = จุดไว Erdhoroskop) · „a + V − b = a − b" (ผลต่าง = จุดอนาคต)
  const sensitive: UranianSensitivePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j];
      const sum = norm360(a.lon + b.lon);
      const diff = norm360(a.lon - b.lon);
      for (const [kind, pt] of [["sum", sum], ["difference", diff]] as const) {
        for (const q of points) {
          if (q.name === a.name || q.name === b.name) continue;
          const orb = dial90Distance(q.lon, pt);
          if (orb <= ORB_SENSITIVE_DEG) {
            const ps = Math.floor(pt / 30);
            sensitive.push({
              kind, a: a.name, b: b.name, aTh: a.nameTh, bTh: b.nameTh,
              pointLon: +pt.toFixed(4), pointSignTh: SIGN_TH[ps], pointSignDeg: +(pt - ps * 30).toFixed(4),
              activatedBy: q.name, activatedByTh: q.nameTh, orbDeg: +orb.toFixed(3),
            });
          }
        }
      }
    }
  }
  sensitive.sort((x, y) => x.orbDeg - y.orbDeg || x.a.localeCompare(y.a) || x.b.localeCompare(y.b) || x.activatedBy.localeCompare(y.activatedBy));

  return {
    hasBirthTime: hasTime,
    degradeLevel: hasTime ? "full" : "partial",
    gender,
    points,
    halbsummen,
    planetaryPictures: pictures.slice(0, MAX_PICTURES),
    sensitivePoints: sensitive.slice(0, MAX_SENSITIVE),
    witteTransneptunians: WITTE_TNP,
    tnpPositionSource: "witte_pd_ephemeris_not_wired_phase1",
    excludedTransneptunians: EXCLUDED_TNP,
    orbPictureDeg: ORB_PICTURE_DEG,
    orbSensitiveDeg: ORB_SENSITIVE_DEG,
  };
}
