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
import { computeBodies, ascendant, midheaven, meanNode, declinationFromEcliptic, eclipticLon, norm360, type BodyPos } from "../../astro-core/ephemeris";
import { wrap180 } from "../../astro-core/events";
import { SearchMoonNode, NextMoonNode, NodeEventKind } from "astronomy-engine";
import { witteTnpPositions, TNP_POSITION_SOURCE, TNP_PRECISION_NOTE, TNP_NOT_COMPUTABLE, type TnpPosition } from "./tnp-kepler"; // r391 · ตำแหน่ง TNP จริง (Kepler mean-element)

/** ชื่อไทยของดาว/จุด (key จาก astro-core) — export ให้ชั้น Auslösung (auslosung.ts) reuse */
export const NAME_TH: Record<string, string> = {
  Sun: "อาทิตย์", Moon: "จันทร์", Mercury: "พุธ", Venus: "ศุกร์", Mars: "อังคาร",
  Jupiter: "พฤหัสบดี", Saturn: "เสาร์", Uranus: "ยูเรนัส", Neptune: "เนปจูน", Pluto: "พลูโต",
  Meridian: "เมริเดียน (MC)", Ascendant: "ลัคนา (Asc)",
  Node: "ราหู/จุดจันทร์เหนือ (Mondknoten)", AriesPoint: "จุดเมษ (Widderpunkt · 0°♈)",
};
/** ชื่อเยอรมัน (verbatim ตามคัมภีร์ Witte · ใช้จับคู่ประโยคความหมาย) */
const NAME_DE: Record<string, string> = {
  Sun: "Sonne", Moon: "Mond", Mercury: "Merkur", Venus: "Venus", Mars: "Mars",
  Jupiter: "Jupiter", Saturn: "Saturn", Uranus: "Uranus", Neptune: "Neptun", Pluto: "Pluto",
  Meridian: "Meridian", Ascendant: "Aszendent",
  Node: "Mondknoten", AriesPoint: "Widderpunkt",
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
  decl: number;       // เดคลิเนชัน (องศา · ใต้ = ลบ) — ใช้จับ parallel/contra-parallel (r390 · ลายเซ็น Witte บท 03/23/46)
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
  touchesPersonal?: boolean; // r390 · แตะจุดส่วนตัว (☉/MC/Asc) = เด่นกว่า (ถ่วงน้ำหนัก · Anareta บท 16/30)
};

/** จุดกระจก (Antiscia/Spiegelpunkte · บท 16/36 + Ptolemy zone5) — ดาว b ตกบนจุดสะท้อนของดาว a รอบแกน
 *  antiscia = แกนอายัน (0°กรกฎ/0°มังกร · Erdmeridian · Spiegelpunkte zum Erdmeridian = Anareta บท 16)
 *  contra   = แกนวิษุวัต (0°เมษ/0°ตุล · Kardinalpunkte)
 *  สูตรสะท้อน = วิธีสากล (Ptolemy PD zone5) · Witte จัดเป็น „จุดไวหมวดแรกสุด" (บท 16) แต่ไม่ระบุตัวเลข orb → orb = วิธีสากล */
export type UranianAntiscion = {
  kind: "antiscia" | "contra";
  axisTh: string;
  a: string; b: string; aTh: string; bTh: string;
  pointLon: number;   // ตำแหน่งจุดกระจกของ a (ที่ b ไปตกทับ · สากล 0-360)
  pointSignTh: string;
  pointSignDeg: number;
  orbDeg: number;     // ระยะ b ↔ จุดกระจกของ a (สุริยวิถี · ทับ 0°)
  touchesPersonal: boolean;
  canonRef: string;
};

/** คู่เดคลิเนชัน (Parallel ‖ / Contra-parallel · ลายเซ็น Witte บท 03/23/46) — orb = วิธีสากล (~1°) */
export type UranianDeclPair = {
  kind: "parallel" | "contra_parallel";
  a: string; b: string; aTh: string; bTh: string;
  declA: number; declB: number;
  orbDeg: number;     // |declA−declB| (parallel) หรือ |declA+declB| (contra-parallel)
  touchesPersonal: boolean;
};

/** ภาพดาว 4 ดวง (Vierergestirn · a+b = c+d · บท 44/31) — ครึ่งผลรวม 2 คู่ (ดาวต่างกันครบ 4) ตกค่าเดียวกันบนหน้าปัด 90° */
export type UranianFourPlanetPicture = {
  pairA: string; pairB: string;       // "a/b" = "c/d"
  pairATh: string; pairBTh: string;
  planets: string[];                  // [a,b,c,d]
  planetsTh: string[];
  midDial90: number;                  // ค่าหน้าปัด 90° ที่สองครึ่งผลรวมมาบรรจบ
  orbDeg: number;                     // ระยะบนหน้าปัด 90° ระหว่างครึ่งผลรวมสองคู่ (0..45)
  touchesPersonal: boolean;
  canonRef: string;
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
  touchesPersonal?: boolean; // r390 · แตะจุดส่วนตัว (☉/MC/Asc) = เด่นกว่า (ถ่วงน้ำหนัก)
};

/** r391 · ภาพดาวที่มีทรานส์เนปจูน Witte ร่วม (occupant/pair ≥1 ตัวเป็น TNP · แยกจาก planetaryPictures เดิม · additive)
 *  ความหมาย: TNP มีตำแหน่งแล้ว → อ่านภาพดาวหมวด H ได้ (Cupido=ครอบครัว/แต่งงาน · Hades=โรค/สูญเสีย ·
 *  Zeus=พลังมีเป้า · Kronos=อำนาจ) — precision = mean-element fictitious (~±1–2° · ห้ามยึดองศาเป๊ะ) */
export type UranianTnpPicture = {
  pair: string; pairTh: string;
  occupant: string; occupantTh: string;
  formula: string;
  orbDeg: number;
  involves: string[];            // ชื่อ TNP ที่ร่วมในภาพดาวนี้
  touchesPersonal: boolean;
  precision: "mean_element_fictitious";
};

/** r391 · จุดไวที่มีทรานส์เนปจูน Witte ร่วม (ผลรวม/ผลต่าง ≥1 ตัวเป็น TNP หรือถูก TNP กระตุ้น · additive) */
export type UranianTnpSensitive = {
  kind: "sum" | "difference";
  a: string; b: string; aTh: string; bTh: string;
  pointLon: number; pointSignTh: string; pointSignDeg: number;
  activatedBy: string; activatedByTh: string;
  orbDeg: number;
  involves: string[];
  touchesPersonal: boolean;
  precision: "mean_element_fictitious";
};

export type Gender = "M" | "F";

export type UranianChart = {
  hasBirthTime: boolean;
  degradeLevel: "full" | "partial";     // full = มีเวลาเกิด · partial = ไม่มีเวลา (ไม่มี Meridian/Asc)
  gender: Gender;
  points: UranianPoint[];               // ดาวจริง 10 (+Meridian/Asc เมื่อมีเวลา) — คงจำนวนเดิม (ภาพดาว/จุดไว คำนวณจากชุดนี้)
  personalPoints: UranianPoint[];       // จุดส่วนตัว 6 (☉☽Asc MC Node AriesPoint) — เป้าไวหลักของชั้น Auslösung (auslosung.ts) · additive ไม่กระทบ pictures/sensitive
  nodeType: "mean";                     // Mondknoten ในชั้นเวลา/personalPoints = mean node (คงเดิม r389 · ไม่กระทบ Auslösung)
  nodeMeanLon: number;                   // r390 · Mondknoten mean (Meeus)
  nodeTrueLon: number;                   // r390 · Mondknoten true/osculating (astronomy-engine SearchMoonNode) — เก็บทั้งคู่ ระบุชนิด
  halbsummen: UranianHalbsumme[];       // ครึ่งผลรวมทุกคู่
  planetaryPictures: UranianPlanetaryPicture[]; // ภาพดาวที่ "ยิงเข้า" orb (คัดคมสุด)
  fourPlanetPictures: UranianFourPlanetPicture[]; // r390 · ภาพดาว 4 ดวง (Vierergestirn · บท 44/31)
  sensitivePoints: UranianSensitivePoint[];     // จุดไวที่ถูกกระตุ้น (คัดคมสุด)
  antiscia: UranianAntiscion[];         // r390 · จุดกระจก (Spiegelpunkte · บท 16/36)
  declinationPairs: UranianDeclPair[];  // r390 · parallel/contra-parallel (บท 03/23/46)
  witteTransneptunians: typeof WITTE_TNP;       // ชื่อ+เจ้าราศี+แหล่งความหมาย (คงเดิม — ความหมายหมวด H)
  tnpPositionSource: "witte_pd_ephemeris_not_wired_phase1"; // คงลิเทอรัลเดิม (backward-compat · dial/packet เก่าอ่าน)
  // ── r391 · ตำแหน่ง TNP จริง (Kepler mean-element จาก orbital elements Witte PD) — additive ทั้งหมด ──
  tnpPoints: TnpPosition[];                     // Cupido/Hades/Kronos (Zeus คำนวณไม่ได้ · element ขาด)
  tnpPlanetaryPictures: UranianTnpPicture[];    // ภาพดาวที่มี TNP ร่วม (แยกจาก planetaryPictures เดิม)
  tnpSensitivePoints: UranianTnpSensitive[];    // จุดไวที่มี TNP ร่วม (แยกจาก sensitivePoints เดิม)
  tnpPositionSourceKepler: typeof TNP_POSITION_SOURCE; // ป้ายเฟส 2 (คำนวณแล้ว)
  tnpPrecisionNote: string;                     // ระบุความแม่น mean-element (ห้ามอวดเกินจริง)
  tnpNotComputable: typeof TNP_NOT_COMPUTABLE;  // Zeus — ระบุ element ที่ขาด (ห้ามเดา)
  tnpElementsMissing: Array<{ name: string; missing: string[] }>; // element ที่คัมภีร์ไม่ให้ (โปร่งใส)
  excludedTransneptunians: readonly string[];   // Lefeldt/Sieggrün — ไม่เคยถูกคำนวณ
  orbPictureDeg: number;
  orbSensitiveDeg: number;
  orbAntisciaDeg: number;               // r390
  orbParallelDeg: number;               // r390
  orbFourPlanetDeg: number;             // r390
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
const ORB_ANTISCIA_DEG = 1.0;  // r390 · จุดกระจก — Witte „scharfe Aspekte" (บท 16) แต่ไม่ระบุตัวเลข → orb = วิธีสากล
const ORB_PARALLEL_DEG = 1.0;  // r390 · parallel/contra-parallel — orb = วิธีสากล (บท 03/23/46 = ลายเซ็น Witte · ค่า orb สากล)
const ORB_FOURPLANET_DEG = 1.0;// r390 · ภาพดาว 4 ดวง บนหน้าปัด 90°
const MAX_PICTURES = 60;       // คุมขนาด packet (prompt budget)
const MAX_SENSITIVE = 60;
const MAX_ANTISCIA = 40;
const MAX_DECL = 40;
const MAX_FOURPLANET = 40;

/** จุดส่วนตัวเด่นที่สุด (ถ่วงน้ำหนัก · Anareta บท 16/30 · ☉=Auslöser บท 12 · MC=Spiegelpunkt körperlich/seelisch บท 36) */
const PERSONAL_PROMINENT = new Set(["Sun", "Meridian", "Ascendant"]);
const anyPersonal = (...names: string[]) => names.some((n) => PERSONAL_PROMINENT.has(n));

/** สูตรจุดกระจก (วิธีสากล · Ptolemy PD zone5) */
const antisciaLon = (lon: number) => norm360(180 - lon);   // สะท้อนรอบแกนอายัน (0°กรกฎ=90 / 0°มังกร=270)
const contraAntisciaLon = (lon: number) => norm360(-lon);  // สะท้อนรอบแกนวิษุวัต (0°เมษ=0 / 0°ตุล=180)

/** Mondknoten true/osculating — เวลาโหนดขึ้น (ascending) ที่ใกล้วันเกิดสุด แล้วอ่านลองจิจูดจันทร์ ณ ขณะข้าม (astronomy-engine SearchMoonNode) */
function trueNodeLon(date: Date): number {
  let ev = SearchMoonNode(new Date(date.getTime() - 30 * 86_400_000));
  let bestTime: Date | null = null, bestDiff = Infinity;
  for (let i = 0; i < 6; i++) {
    if (ev.kind === NodeEventKind.Ascending) {
      const t = ev.time.date;
      const diff = Math.abs(t.getTime() - date.getTime());
      if (diff < bestDiff) { bestDiff = diff; bestTime = t; }
    }
    ev = NextMoonNode(ev);
  }
  // ณ โหนดขึ้น จันทร์ latitude=0 → ลองจิจูดจันทร์ = ลองจิจูดโหนดขึ้น (true node)
  return bestTime ? norm360(eclipticLon("Moon", bestTime)) : norm360(meanNode(date));
}

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
    decl: +(b.declination ?? 0).toFixed(4),
    ...(uncertain ? { uncertain: true } : {}),
  };
}

function anglePoint(name: string, lon: number, dtUTC: Date): UranianPoint {
  const L = norm360(lon);
  const s = Math.floor(L / 30);
  return {
    name, nameTh: NAME_TH[name] ?? name, nameDe: NAME_DE[name] ?? name, kind: "angle",
    lon: +L.toFixed(4), sign: s, signTh: SIGN_TH[s], signDeg: +(L - s * 30).toFixed(4), dial90: +(L % 90).toFixed(4),
    decl: +declinationFromEcliptic(L, 0, dtUTC).toFixed(4),
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
    points.push(anglePoint("Meridian", mc, dtUTC));
    points.push(anglePoint("Ascendant", asc, dtUTC));
  }

  // 2b) จุดส่วนตัว (personal points) สำหรับชั้นเวลา (Auslösung) — ☉☽Asc MC Node AriesPoint
  //     additive ล้วน: ไม่ push เข้า points[] (คง 12/10 เดิม) → ภาพดาว/จุดไว/halbsummen ไม่เปลี่ยน
  //     Node = mean Mondknoten (Meeus · astro-core.meanNode) · AriesPoint = 0°♈ (Witte „Widderpunkt" = ศูนย์อ้างอิงโลก)
  const byName = (n: string) => points.find((p) => p.name === n);
  const personalPoints: UranianPoint[] = [];
  for (const n of ["Sun", "Moon", "Meridian", "Ascendant"]) {
    const p = byName(n);
    if (p) personalPoints.push(p);
  }
  personalPoints.push(anglePoint("Node", meanNode(dtUTC), dtUTC));
  personalPoints.push(anglePoint("AriesPoint", 0, dtUTC));

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
          touchesPersonal: anyPersonal(hs.a, hs.b, p.name),
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
              touchesPersonal: anyPersonal(a.name, b.name, q.name),
            });
          }
        }
      }
    }
  }
  sensitive.sort((x, y) => x.orbDeg - y.orbDeg || x.a.localeCompare(y.a) || x.b.localeCompare(y.b) || x.activatedBy.localeCompare(y.activatedBy));

  // 6) จุดกระจก (Antiscia/Spiegelpunkte · บท 16/36 + Ptolemy zone5) — b ตกบนจุดสะท้อนของ a รอบ 2 แกน
  //    antiscia = สะท้อนแกนอายัน (Erdmeridian 0°♋/♑) · contra = สะท้อนแกนวิษุวัต (Kardinalpunkte 0°♈/♎)
  //    สูตรสะท้อน + orb = วิธีสากล (Ptolemy PD) · Witte: „จุดไวหมวดแรกสุด" (Anareta บท 16) แต่ไม่ให้ตัวเลข orb
  const antiscia: UranianAntiscion[] = [];
  const ANTI_SPECS = [
    { kind: "antiscia" as const, mirror: antisciaLon, axisTh: "แกนอายัน 0°กรกฎ/0°มังกร (Erdmeridian · Anareta)", canonRef: "บท 16/36 · Ptolemy zone5 (สูตร+orb วิธีสากล)" },
    { kind: "contra" as const, mirror: contraAntisciaLon, axisTh: "แกนวิษุวัต 0°เมษ/0°ตุล (Kardinalpunkte)", canonRef: "บท 16 · Ptolemy zone5 (สูตร+orb วิธีสากล)" },
  ];
  for (const spec of ANTI_SPECS) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i], b = points[j];
        const mp = spec.mirror(a.lon);                 // จุดกระจกของ a (involution: b บนกระจก a ⟺ a บนกระจก b)
        const orb = Math.abs(wrap180(b.lon - mp));
        if (orb <= ORB_ANTISCIA_DEG) {
          const s = Math.floor(mp / 30);
          antiscia.push({
            kind: spec.kind, axisTh: spec.axisTh,
            a: a.name, b: b.name, aTh: a.nameTh, bTh: b.nameTh,
            pointLon: +mp.toFixed(4), pointSignTh: SIGN_TH[s], pointSignDeg: +(mp - s * 30).toFixed(4),
            orbDeg: +orb.toFixed(3), touchesPersonal: anyPersonal(a.name, b.name), canonRef: spec.canonRef,
          });
        }
      }
    }
  }
  antiscia.sort((x, y) => x.orbDeg - y.orbDeg || x.kind.localeCompare(y.kind) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));

  // 7) เดคลิเนชัน (Parallel ‖ / Contra-parallel · ลายเซ็น Witte บท 03/23/46) — orb = วิธีสากล (~1°)
  const declinationPairs: UranianDeclPair[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j];
      const par = Math.abs(a.decl - b.decl);
      const contra = Math.abs(a.decl + b.decl);
      if (par <= ORB_PARALLEL_DEG && par <= contra) {
        declinationPairs.push({ kind: "parallel", a: a.name, b: b.name, aTh: a.nameTh, bTh: b.nameTh, declA: a.decl, declB: b.decl, orbDeg: +par.toFixed(3), touchesPersonal: anyPersonal(a.name, b.name) });
      } else if (contra <= ORB_PARALLEL_DEG) {
        declinationPairs.push({ kind: "contra_parallel", a: a.name, b: b.name, aTh: a.nameTh, bTh: b.nameTh, declA: a.decl, declB: b.decl, orbDeg: +contra.toFixed(3), touchesPersonal: anyPersonal(a.name, b.name) });
      }
    }
  }
  declinationPairs.sort((x, y) => x.orbDeg - y.orbDeg || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));

  // 8) ภาพดาว 4 ดวง (Vierergestirn · a+b = c+d · บท 44/31) — ครึ่งผลรวม 2 คู่ (ดาวต่างกันครบ 4) ตกค่าเดียวกันบนหน้าปัด 90°
  const fourPlanetPictures: UranianFourPlanetPicture[] = [];
  for (let i = 0; i < halbsummen.length; i++) {
    for (let j = i + 1; j < halbsummen.length; j++) {
      const hi = halbsummen[i], hj = halbsummen[j];
      if (hi.a === hj.a || hi.a === hj.b || hi.b === hj.a || hi.b === hj.b) continue; // ต้องเป็นดาว 4 ดวงต่างกันครบ
      const orb = dial90Distance(hi.mid, hj.mid);
      if (orb <= ORB_FOURPLANET_DEG) {
        const planets = [hi.a, hi.b, hj.a, hj.b];
        fourPlanetPictures.push({
          pairA: `${hi.a}/${hi.b}`, pairB: `${hj.a}/${hj.b}`, pairATh: `${hi.aTh}/${hi.bTh}`, pairBTh: `${hj.aTh}/${hj.bTh}`,
          planets, planetsTh: [hi.aTh, hi.bTh, hj.aTh, hj.bTh],
          midDial90: +((hi.mid % 90 + hj.mid % 90) / 2).toFixed(3), orbDeg: +orb.toFixed(3),
          touchesPersonal: anyPersonal(...planets),
          canonRef: "บท 44 (S.52 · vier Planeten... gleiche Winkelunterschiede) / บท 31 (S.16)",
        });
      }
    }
  }
  fourPlanetPictures.sort((x, y) => x.orbDeg - y.orbDeg || x.pairA.localeCompare(y.pairA) || x.pairB.localeCompare(y.pairB));

  // 9) r391 · ทรานส์เนปจูน Witte (Cupido/Hades/Kronos) — ตำแหน่งจริงจาก Kepler mean-element (ไม่พึ่งเวลาเกิด · แค่วันที่)
  //    additive ล้วน: ไม่แตะ points[]/halbsummen/pictures/sensitive เดิม → regression 54/51/41/20 ไม่กระทบ
  const tnp = witteTnpPositions(dtUTC);
  const tnpPoints = tnp.computed;
  // node รวม (ดาวจริง+TNP) เพื่อหาภาพดาว/จุดไวที่ "มี TNP ร่วม" อย่างน้อย 1 ตัว
  type NodePt = { name: string; nameTh: string; lon: number; isTnp: boolean };
  const realNodes: NodePt[] = points.map((p) => ({ name: p.name, nameTh: p.nameTh, lon: p.lon, isTnp: false }));
  const tnpNodes: NodePt[] = tnpPoints.map((t) => ({ name: t.name, nameTh: t.nameTh, lon: t.lon, isTnp: true }));
  const allNodes: NodePt[] = [...realNodes, ...tnpNodes];
  const tnpInvolved = (...ns: NodePt[]) => ns.filter((n) => n.isTnp).map((n) => n.name);

  // 9a) ภาพดาว (Planetenbild) ที่มี TNP ร่วม
  const tnpPictures: UranianTnpPicture[] = [];
  for (let i = 0; i < allNodes.length; i++) {
    for (let j = i + 1; j < allNodes.length; j++) {
      const a = allNodes[i], b = allNodes[j];
      const mid = midpointLon(a.lon, b.lon);
      for (const occ of allNodes) {
        if (occ.name === a.name || occ.name === b.name) continue;
        const involves = [...new Set(tnpInvolved(a, b, occ))];
        if (!involves.length) continue;                  // เก็บเฉพาะที่มี TNP ร่วม (real-only อยู่ใน planetaryPictures เดิมแล้ว)
        const orb = dial90Distance(occ.lon, mid);
        if (orb <= ORB_PICTURE_DEG) {
          tnpPictures.push({
            pair: `${a.name}/${b.name}`, pairTh: `${a.nameTh}/${b.nameTh}`,
            occupant: occ.name, occupantTh: occ.nameTh,
            formula: `${a.name} + ${b.name} − ${occ.name} = แกนสมมาตร (มี TNP ร่วม)`,
            orbDeg: +orb.toFixed(3), involves,
            touchesPersonal: anyPersonal(a.name, b.name, occ.name),
            precision: "mean_element_fictitious",
          });
        }
      }
    }
  }
  tnpPictures.sort((x, y) => x.orbDeg - y.orbDeg || x.pair.localeCompare(y.pair) || x.occupant.localeCompare(y.occupant));

  // 9b) จุดไว (sensitiver Punkt) ที่มี TNP ร่วม (ผลรวม/ผลต่าง หรือถูก TNP กระตุ้น)
  const tnpSensitive: UranianTnpSensitive[] = [];
  for (let i = 0; i < allNodes.length; i++) {
    for (let j = i + 1; j < allNodes.length; j++) {
      const a = allNodes[i], b = allNodes[j];
      const sum = norm360(a.lon + b.lon);
      const diff = norm360(a.lon - b.lon);
      for (const [kind, pt] of [["sum", sum], ["difference", diff]] as const) {
        for (const q of allNodes) {
          if (q.name === a.name || q.name === b.name) continue;
          const involves = [...new Set(tnpInvolved(a, b, q))];
          if (!involves.length) continue;
          const orb = dial90Distance(q.lon, pt);
          if (orb <= ORB_SENSITIVE_DEG) {
            const ps = Math.floor(pt / 30);
            tnpSensitive.push({
              kind, a: a.name, b: b.name, aTh: a.nameTh, bTh: b.nameTh,
              pointLon: +pt.toFixed(4), pointSignTh: SIGN_TH[ps], pointSignDeg: +(pt - ps * 30).toFixed(4),
              activatedBy: q.name, activatedByTh: q.nameTh, orbDeg: +orb.toFixed(3),
              involves, touchesPersonal: anyPersonal(a.name, b.name, q.name),
              precision: "mean_element_fictitious",
            });
          }
        }
      }
    }
  }
  tnpSensitive.sort((x, y) => x.orbDeg - y.orbDeg || x.a.localeCompare(y.a) || x.b.localeCompare(y.b) || x.activatedBy.localeCompare(y.activatedBy));

  return {
    hasBirthTime: hasTime,
    degradeLevel: hasTime ? "full" : "partial",
    gender,
    points,
    personalPoints,
    nodeType: "mean",
    nodeMeanLon: +norm360(meanNode(dtUTC)).toFixed(4),
    nodeTrueLon: +trueNodeLon(dtUTC).toFixed(4),
    halbsummen,
    planetaryPictures: pictures.slice(0, MAX_PICTURES),
    fourPlanetPictures: fourPlanetPictures.slice(0, MAX_FOURPLANET),
    sensitivePoints: sensitive.slice(0, MAX_SENSITIVE),
    antiscia: antiscia.slice(0, MAX_ANTISCIA),
    declinationPairs: declinationPairs.slice(0, MAX_DECL),
    witteTransneptunians: WITTE_TNP,
    tnpPositionSource: "witte_pd_ephemeris_not_wired_phase1",
    // ── r391 · TNP ตำแหน่งจริง (additive) ──
    tnpPoints,
    tnpPlanetaryPictures: tnpPictures.slice(0, MAX_PICTURES),
    tnpSensitivePoints: tnpSensitive.slice(0, MAX_SENSITIVE),
    tnpPositionSourceKepler: TNP_POSITION_SOURCE,
    tnpPrecisionNote: TNP_PRECISION_NOTE,
    tnpNotComputable: TNP_NOT_COMPUTABLE,
    tnpElementsMissing: tnp.elementsMissing,
    excludedTransneptunians: EXCLUDED_TNP,
    orbPictureDeg: ORB_PICTURE_DEG,
    orbSensitiveDeg: ORB_SENSITIVE_DEG,
    orbAntisciaDeg: ORB_ANTISCIA_DEG,
    orbParallelDeg: ORB_PARALLEL_DEG,
    orbFourPlanetDeg: ORB_FOURPLANET_DEG,
  };
}
