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
  Gender,
  WITTE_TNP,
} from "./engine";
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
  orbAntisciaDeg: number;                  // r390
  orbParallelDeg: number;                  // r390
  orbFourPlanetDeg: number;                // r390
  tnpPositionSource: "witte_pd_ephemeris_not_wired_phase1";
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
  // เฟส 1: ทรานส์เนปจูน Witte ยังไม่คำนวณตำแหน่ง (แจ้งตรง ๆ ให้ AI ไม่แต่งองศา)
  notAvailable.push("witteTransneptunianPositions");

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
    orbAntisciaDeg: chart.orbAntisciaDeg,
    orbParallelDeg: chart.orbParallelDeg,
    orbFourPlanetDeg: chart.orbFourPlanetDeg,
    tnpPositionSource: chart.tnpPositionSource,
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
    },
    nodeType: chart.nodeType,
    nodeMeanLon: chart.nodeMeanLon,
    nodeTrueLon: chart.nodeTrueLon,
    auslosung,
    notAvailable,
  };
}
