/**
 * โหราศาสตร์พระเวท (Vedic / Jyotish) — render prompt (ไทยนำ · deterministic)
 * ⚠️ ใช้ศัพท์ Vedic เท่านั้น: graha/rashi/bhava/nakshatra/dasha (+คำแปลไทย)
 *    ห้ามปนศัพท์ศาสตร์อื่น (廟旺/用神/zodiac tropical ฯลฯ)
 * engine คำนวณ → render จัดเป็นข้อความ → AI ตีความ (กฎข้อ 9)
 */
import type { VedicPacket } from "./packet";

const DIGNITY_TH: Record<string, string> = {
  exalted: "อุจ (exalted)",
  debilitated: "นิจ (debilitated)",
  own: "เกษตร/เจ้าเรือนตน (own sign)",
  neutral: "ปกติ (neutral)",
};

const fmt = (n: number, d = 2) => n.toFixed(d);

export function renderVedicPrompt(packet: VedicPacket, lang: "th" | "en" = "th"): string {
  const d = packet.data;
  const L: string[] = [];

  L.push("=== ผังโหราศาสตร์พระเวท (Vedic / Jyotish · สิทธานต์สายดาวจักรราศี sidereal) ===");
  L.push(`ระบบอายนางศะ (ayanamsa): ${d.ayanamsa.name} = ${fmt(d.ayanamsa.value, 4)}°`);
  L.push(`ข้อมูลเวลาเกิด: ${packet.hasBirthTime ? "มีเวลาเกิด (ผังสมบูรณ์)" : "ไม่มีเวลาเกิด (ติดธง: ลัคนา/เรือนคำนวณไม่ได้ · จันทร์เคลื่อน ~13°/วัน อาจคลาด ±)"}`);
  L.push(`ระดับข้อมูล: ${packet.degradeLevel}`);
  L.push("");

  // ลัคนา (Lagna)
  if (d.lagna) {
    L.push(`ลัคนา (Lagna): ราศี${d.lagna.rashiTh} (${d.lagna.rashi}) · ${fmt(d.lagna.deg)}° · ฤกษ์ (nakshatra) ${d.lagna.nakshatra} บาท ${d.lagna.pada}`);
  } else {
    L.push("ลัคนา (Lagna): ไม่มี (ขาดเวลาเกิด)");
  }
  L.push("");

  // กราหะ (Grahas / นพเคราะห์)
  L.push("--- กราหะ (grahas · นพเคราะห์) · ตำแหน่งสายดาวจักรราศี (sidereal) ---");
  for (const g of d.grahas) {
    const parts = [
      `${g.nameTh} (${g.name})`,
      `ราศี${g.rashiTh} ${fmt(g.deg)}°`,
      `ฤกษ์ ${g.nakshatra} บาท ${g.pada}`,
      g.house != null ? `เรือน (bhava) ${g.house}` : "เรือน —",
      `ฐานะ ${DIGNITY_TH[g.dignity] ?? g.dignity}`,
    ];
    if (g.retro) parts.push("พักร์ (retrograde)");
    if (g.combust) parts.push("อัสตงคต (combust · ใกล้อาทิตย์)");
    L.push("• " + parts.join(" · "));
  }
  L.push("");

  // ภาวะ (Bhavas / เรือน)
  if (d.bhavas) {
    L.push("--- ภาวะ (bhavas · 12 เรือน · whole-sign) ---");
    L.push(
      d.bhavas
        .map((b) => `เรือน${b.house}=ราศี${b.signTh}(เจ้าเรือน ${b.lord})`)
        .join(" · "),
    );
    L.push("");
  }

  // ฤกษ์จันทร์ + วิมโศตตรีทศา (Vimshottari dasha)
  L.push("--- ทศา (dasha) ---");
  L.push(`ฤกษ์จันทร์ (Moon nakshatra): ${d.moonNakshatra.name} บาท ${d.moonNakshatra.pada} · เจ้าฤกษ์ ${d.moonNakshatra.lord}`);
  const v = d.vimshottari;
  L.push(`วิมโศตตรีทศา (Vimshottari): เจ้าทศาเริ่ม ${v.startLord} · เศษทศาแรก ${fmt(v.balanceYears)} ปี`);
  if (v.currentMaha) {
    L.push(
      `มหาทศาปัจจุบัน (mahadasha): ${v.currentMaha.lord} ` +
        `(ช่วงปี ${fmt(v.currentMaha.startYear, 1)}–${fmt(v.currentMaha.endYear, 1)} · อายุ ${fmt(v.currentMaha.ageStart, 1)}–${fmt(v.currentMaha.ageEnd, 1)})`,
    );
  }
  if (v.currentAntar) {
    L.push(
      `อันตรทศาปัจจุบัน (antardasha · ทศาย่อย): ${v.currentAntar.lord} ` +
        `(ช่วงปี ${fmt(v.currentAntar.startYear, 1)}–${fmt(v.currentAntar.endYear, 1)})`,
    );
  }
  L.push("");
  L.push("ลำดับมหาทศาทั้งหมด (mahadasha sequence):");
  for (const m of v.mahadasha) {
    L.push(
      `  ${m.lord}: ปี ${fmt(m.startYear, 1)}–${fmt(m.endYear, 1)} (อายุ ${fmt(m.ageStart, 1)}–${fmt(m.ageEnd, 1)})`,
    );
  }

  if (packet.notAvailable.length) {
    L.push("");
    L.push(`ข้อมูลที่คำนวณไม่ได้: ${packet.notAvailable.join(", ")}`);
  }

  L.push("");
  L.push("หมายเหตุ: ทุกค่าข้างต้นคำนวณด้วย engine (ดาวจริง + ตารางตำรา Jyotish) แบบ deterministic · AI มีหน้าที่ตีความเป็นภาษาไทยเท่านั้น ห้ามแก้ตัวเลข");

  return L.join("\n");
}
