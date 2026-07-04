/**
 * Uranian packet — แปลง UranianChart เป็น envelope มาตรฐาน { discipline, packetVersion, data, notAvailable }
 * ════════════════════════════════════════════════════════════════════════
 * deterministic ล้วน — แค่จัดรูป ไม่คำนวณดาราศาสตร์เพิ่ม (โครงเดียวกับ western/vedic/qizheng packet)
 */
import type {
  UranianChart,
  UranianPoint,
  UranianHalbsumme,
  UranianPlanetaryPicture,
  UranianSensitivePoint,
  UranianAntiscion,
  UranianDeclPair,
  UranianFourPlanetPicture,
  UranianTnpPicture,
  UranianTnpSensitive,
  Gender,
  WITTE_TNP,
} from "./engine";
import type { TnpPosition, TNP_NOT_COMPUTABLE, TNP_POSITION_SOURCE } from "./tnp-kepler";
import type { UranianAuslosung } from "./auslosung";

export type UranianPacket = {
  discipline: "uranian";
  packetVersion: "uranian-v1";
  hasBirthTime: boolean;
  birthTimeMode: "known" | "unknown_noon_anchor";
  degradeLevel: "full" | "partial";
  gender: Gender;
  moonUncertainty: boolean;
  forbiddenFieldsWhenNoTime: string[];
  allowedFieldsWhenNoTime: string[];
  orbPictureDeg: number;
  orbSensitiveDeg: number;
  orbPictureSecondaryDeg: number;          // r399 · orb ชั้นรอง 45°/135° ภาพดาว
  orbSensitiveSecondaryDeg: number;        // r399 · orb ชั้นรอง 45°/135° จุดไว
  orbAntisciaDeg: number;                  // r390
  orbParallelDeg: number;                  // r390
  orbFourPlanetDeg: number;                // r390
  tnpPositionSource: "witte_pd_ephemeris_not_wired_phase1"; // backward-compat literal (คงเดิม)
  tnpPositionSourceKepler: typeof TNP_POSITION_SOURCE;      // r391 · ป้ายเฟส 2 (Kepler mean-element คำนวณแล้ว)
  tnpPrecisionNote: string;                                 // r391 · ความแม่น mean-element (~±1–2° · ห้ามยึดองศาเป๊ะ)
  excludedTransneptunians: readonly string[];
  data: {
    points: UranianPoint[];
    personalPoints: UranianPoint[];       // ☉☽Asc MC Node AriesPoint — เป้าไวหลักชั้น Auslösung
    halbsummen: UranianHalbsumme[];
    planetaryPictures: UranianPlanetaryPicture[];
    fourPlanetPictures: UranianFourPlanetPicture[]; // r390 · ภาพดาว 4 ดวง (Vierergestirn)
    sensitivePoints: UranianSensitivePoint[];
    antiscia: UranianAntiscion[];         // r390 · จุดกระจก (Spiegelpunkte)
    declinationPairs: UranianDeclPair[];  // r390 · parallel/contra-parallel
    witteTransneptunians: typeof WITTE_TNP;
    // ── r391 · ตำแหน่ง TNP จริง (additive · Cupido/Hades/Kronos · Zeus ขาด element) ──
    tnpPoints: TnpPosition[];
    tnpPlanetaryPictures: UranianTnpPicture[];
    tnpSensitivePoints: UranianTnpSensitive[];
    tnpNotComputable: typeof TNP_NOT_COMPUTABLE;
    tnpElementsMissing: Array<{ name: string; missing: string[] }>;
  };
  nodeType: "mean";
  nodeMeanLon: number;                      // r390
  nodeTrueLon: number;                      // r390 · true/osculating node
  auslosung: UranianAuslosung | null;      // ชั้นเวลา (จับวัน/เดือน) — null ถ้าไม่ได้ขอช่วงเป้าหมาย (additive · render.ts ไม่อ่าน field นี้)
  notAvailable: string[];
};

const FORBIDDEN_FIELDS_NO_TIME = ["meridian", "ascendant", "meridianPictures", "meridianSensitivePoints", "houses"];
const ALLOWED_FIELDS_NO_TIME = [
  "planetHalbsummen",       // ครึ่งผลรวมดาว-ดาว ไม่ต้องใช้เวลา
  "planetPlanetaryPictures",
  "planetSensitivePoints",
  "planetDialPositions",
];

export function buildUranianPacket(chart: UranianChart, auslosung: UranianAuslosung | null = null): UranianPacket {
  const notAvailable: string[] = [];
  if (!chart.hasBirthTime) notAvailable.push("meridian", "ascendant");
  // r392: เลิกดัน "witteTransneptunianPositions" เหมาทั้งก้อน — Cupido/Hades/Kronos คำนวณตำแหน่งได้แล้ว (r391 · Kepler
  //   mean-element ~±1–2° ใน data.tnpPoints) · เหลือเฉพาะดวงที่ยัง "คำนวณไม่ได้จริง" (Zeus · element หายจากคลัง Witte)
  //   → ป้าย notAvailable ตรงกับ prose/JSON (กันอาการ "ผังส่งไม่ครบ" ที่เกิดจาก JSON ขัด prose)
  for (const z of chart.tnpNotComputable) {
    notAvailable.push(`${z.name.toLowerCase()}_position`); // เช่น "zeus_position" (precision อยู่ใน tnpPrecisionNote)
  }

  return {
    discipline: "uranian",
    packetVersion: "uranian-v1",
    hasBirthTime: chart.hasBirthTime,
    birthTimeMode: chart.hasBirthTime ? "known" : "unknown_noon_anchor",
    degradeLevel: chart.degradeLevel,
    gender: chart.gender,
    moonUncertainty: !chart.hasBirthTime,
    forbiddenFieldsWhenNoTime: chart.hasBirthTime ? [] : FORBIDDEN_FIELDS_NO_TIME,
    allowedFieldsWhenNoTime: chart.hasBirthTime ? [] : ALLOWED_FIELDS_NO_TIME,
    orbPictureDeg: chart.orbPictureDeg,
    orbSensitiveDeg: chart.orbSensitiveDeg,
    orbPictureSecondaryDeg: chart.orbPictureSecondaryDeg,
    orbSensitiveSecondaryDeg: chart.orbSensitiveSecondaryDeg,
    orbAntisciaDeg: chart.orbAntisciaDeg,
    orbParallelDeg: chart.orbParallelDeg,
    orbFourPlanetDeg: chart.orbFourPlanetDeg,
    tnpPositionSource: chart.tnpPositionSource,
    tnpPositionSourceKepler: chart.tnpPositionSourceKepler,
    tnpPrecisionNote: chart.tnpPrecisionNote,
    excludedTransneptunians: chart.excludedTransneptunians,
    data: {
      points: chart.points,
      personalPoints: chart.personalPoints,
      halbsummen: chart.halbsummen,
      planetaryPictures: chart.planetaryPictures,
      fourPlanetPictures: chart.fourPlanetPictures,
      sensitivePoints: chart.sensitivePoints,
      antiscia: chart.antiscia,
      declinationPairs: chart.declinationPairs,
      witteTransneptunians: chart.witteTransneptunians,
      tnpPoints: chart.tnpPoints,
      tnpPlanetaryPictures: chart.tnpPlanetaryPictures,
      tnpSensitivePoints: chart.tnpSensitivePoints,
      tnpNotComputable: chart.tnpNotComputable,
      tnpElementsMissing: chart.tnpElementsMissing,
    },
    nodeType: chart.nodeType,
    nodeMeanLon: chart.nodeMeanLon,
    nodeTrueLon: chart.nodeTrueLon,
    auslosung,
    notAvailable,
  };
}
