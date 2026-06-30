/**
 * โหราศาสตร์พระเวท (Vedic / Jyotish) — packet envelope (structured JSON)
 * ⚠️ engine คำนวณ → packet จัดรูป → render/AI แค่ตีความ (กฎข้อ 9)
 * ศัพท์ Vedic เท่านั้น (graha/rashi/bhava/nakshatra/dasha) + คำแปลไทย
 */
import { RASHI_TH, GRAHA_TH } from "./tables";
import type { VedicChart, MahaDasha, AntarDasha } from "./engine";

export type VedicPacket = {
  discipline: "vedic";
  packetVersion: "vedic-v1";
  hasBirthTime: boolean;
  degradeLevel: "full" | "minimal";
  data: {
    ayanamsa: { value: number; name: "Lahiri" };
    lagna: {
      sidLon: number; rashi: number; rashiTh: string; deg: number;
      nakshatra: string; pada: number;
    } | null;
    grahas: Array<{
      name: string; nameTh: string; sidLon: number; rashi: number; rashiTh: string;
      deg: number; house: number | null; nakshatra: string; pada: number;
      retro: boolean; dignity: string; combust: boolean;
    }>;
    bhavas: Array<{ house: number; sign: number; signTh: string; lord: string }> | null;
    moonNakshatra: { name: string; pada: number; lord: string };
    vimshottari: {
      startLord: string;
      balanceYears: number;
      mahadasha: MahaDasha[];
      currentMaha: MahaDasha | null;
      currentAntar: AntarDasha | null;
    };
  };
  notAvailable: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function buildVedicPacket(chart: VedicChart): VedicPacket {
  const notAvailable: string[] = [];
  // ไม่มีเวลาเกิด: ลัคนา/ภพ ทำไม่ได้ + จันทร์เคลื่อน ~13°/วัน → ฤกษ์จันทร์/ทศา (Vimshottari) ไม่แน่นอน (E1)
  if (!chart.hasTime) notAvailable.push("lagna", "bhavas", "grahaHouse", "moonNakshatra(จันทร์ไม่แน่นอน)", "vimshottariDasha(พึ่งฤกษ์จันทร์)");

  const lagna = chart.lagna
    ? {
        sidLon: r4(chart.lagna.sidLon),
        rashi: chart.lagna.rashi,
        rashiTh: RASHI_TH[chart.lagna.rashi],
        deg: r2(chart.lagna.rashiDeg),
        nakshatra: chart.lagna.nakshatra.name,
        pada: chart.lagna.nakshatra.pada,
      }
    : null;

  const grahas = chart.grahas.map((g) => ({
    name: g.name,
    nameTh: g.nameTh,
    sidLon: r4(g.sidLon),
    rashi: g.rashi,
    rashiTh: RASHI_TH[g.rashi],
    deg: r2(g.rashiDeg),
    house: g.house,
    nakshatra: g.nakshatra.name,
    pada: g.nakshatra.pada,
    retro: g.retro,
    dignity: g.dignity,
    combust: g.combust,
  }));

  const bhavas = chart.bhavas
    ? chart.bhavas.map((b) => ({
        house: b.house,
        sign: b.sign,
        signTh: RASHI_TH[b.sign],
        lord: GRAHA_TH[b.lord],
      }))
    : null;

  return {
    discipline: "vedic",
    packetVersion: "vedic-v1",
    hasBirthTime: chart.hasTime,
    degradeLevel: chart.degradeLevel,
    data: {
      ayanamsa: { value: r4(chart.ayanamsa), name: "Lahiri" },
      lagna,
      grahas,
      bhavas,
      moonNakshatra: {
        name: chart.moonNakshatra.name,
        pada: chart.moonNakshatra.pada,
        lord: chart.moonNakshatra.lord,
      },
      vimshottari: {
        startLord: chart.vimshottari.startLord,
        balanceYears: r2(chart.vimshottari.balanceYears),
        mahadasha: chart.vimshottari.mahadasha,
        currentMaha: chart.vimshottari.currentMaha,
        currentAntar: chart.vimshottari.currentAntar,
      },
    },
    notAvailable,
  };
}
