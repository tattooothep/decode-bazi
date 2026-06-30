/**
 * Western packet — แปลง WesternChart เป็น envelope มาตรฐานสำหรับส่งให้ชั้นถัดไป
 * ════════════════════════════════════════════════════════════════════════
 * โครงสร้างเดียวกับ packet ศาสตร์อื่น: { discipline, packetVersion, data, notAvailable }
 * deterministic ล้วน — แค่จัดรูป ไม่คำนวณดาราศาสตร์เพิ่ม
 */
import { SIGN_TH, type WesternChart, type Dignity, type Element, type Modality, type Gender, type Sect, type WesternPoint } from "./engine";

export type WesternPacketPlanet = {
  name: string;
  nameTh: string;
  sign: number;
  signTh: string;
  signDeg: number;
  house: number | null;
  retro: boolean;
  dignity: Dignity | null;
  uncertain?: boolean;
};

/** ตำแหน่งจุดสำคัญ (ลัคนา/กลางฟ้า) — null เมื่อไม่มีเวลาเกิด */
export type WesternPacketAngle = {
  lon: number;
  sign: number;
  signTh: string;
  signDeg: number;
} | null;

export type WesternPacket = {
  discipline: "western";
  packetVersion: "western-v1";
  hasBirthTime: boolean;
  degradeLevel: "full" | "partial";
  gender: Gender;
  sect: Sect;
  data: {
    ascendant: WesternPacketAngle;
    mc: WesternPacketAngle;
    partOfFortune: WesternPoint;
    planets: WesternPacketPlanet[];
    houses: { house: number; sign: number; signTh: string; cuspLon: number }[] | null;
    aspects: { a: string; b: string; type: string; angleTh: string; orb: number; applying: boolean }[];
    shape: {
      elements: Record<Element, number>;
      modalities: Record<Modality, number>;
      stellium: { sign: number; signTh: string; count: number; planets: string[] }[];
    };
  };
  notAvailable: string[];
};

/** ทำ angle object จาก longitude (null → null) */
function angle(lon: number | null): WesternPacketAngle {
  if (lon === null) return null;
  const sign = Math.floor(((lon % 360) + 360) % 360 / 30);
  return { lon, sign, signTh: SIGN_TH[sign], signDeg: +(lon - sign * 30).toFixed(4) };
}

/** สร้าง envelope packet จากผัง */
export function buildWesternPacket(chart: WesternChart): WesternPacket {
  // สิ่งที่ใช้ไม่ได้เมื่อขาดเวลาเกิด (ลัคนา/กลางฟ้า/เรือน/จุดโชค/sect ต้องใช้การหมุนของโลก)
  const notAvailable: string[] = [];
  if (!chart.hasBirthTime) notAvailable.push("ascendant", "mc", "houses", "partOfFortune", "sect");

  return {
    discipline: "western",
    packetVersion: "western-v1",
    hasBirthTime: chart.hasBirthTime,
    degradeLevel: chart.degradeLevel,
    gender: chart.gender,
    sect: chart.sect,
    data: {
      ascendant: angle(chart.ascendant),
      mc: angle(chart.mc),
      partOfFortune: chart.partOfFortune,
      planets: chart.planets.map((p) => ({
        name: p.name,
        nameTh: p.nameTh,
        sign: p.sign,
        signTh: SIGN_TH[p.sign],
        signDeg: p.signDeg,
        house: p.house,
        retro: p.retro,
        dignity: p.dignity,
        ...(p.uncertain ? { uncertain: true } : {}),
      })),
      houses: chart.houses
        ? chart.houses.map((h) => ({
            house: h.house,
            sign: h.sign,
            signTh: SIGN_TH[h.sign],
            cuspLon: h.cuspLon,
          }))
        : null,
      aspects: chart.aspects.map((a) => ({
        a: a.a,
        b: a.b,
        type: a.type,
        angleTh: a.angleTh,
        orb: a.orb,
        applying: a.applying,
      })),
      shape: chart.shape,
    },
    notAvailable,
  };
}
