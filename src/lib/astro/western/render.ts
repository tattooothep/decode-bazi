/**
 * Western render — แปลง packet เป็นข้อความ structured (ไทยนำ) ให้ AI อ่านแล้วตีความ
 * ════════════════════════════════════════════════════════════════════════
 * หลักการ (กฎข้อ 9): engine บอกตำแหน่งดาว/เรือน/มุม/ฐานะ "ตรงๆ" → AI ตีความเอง
 * ⚠️ ไทยนำเสมอ · ห้ามใช้ศัพท์ศาสตร์อื่น (ห้าม 廟旺/用神/格局 หรือศัพท์ปาจื้อ/ฉีเหมิน)
 *    ใช้คำโหราศาสตร์ตะวันตกตรงๆ เท่านั้น (ลัคนา/ราศี/เรือน/มุม/ฐานะดาว)
 * deterministic — แค่ประกอบสตริง ไม่มีการสุ่ม
 */
import type { WesternPacket } from "./packet";

/** ฐานะดาว → คำไทยอธิบายตรงๆ (ไม่ยืมศัพท์ศาสตร์อื่น) */
const DIGNITY_TH: Record<string, string> = {
  rulership: "ครองราศี (เป็นเจ้าเรือนของราศีนี้ · กำลังแรง)",
  exaltation: "ราศีส่งเสริม (exaltation · ทำงานได้ดีเป็นพิเศษ)",
  detriment: "ราศีตรงข้ามเจ้าเรือน (detriment · ทำงานฝืน)",
  fall: "ราศีตกต่ำ (fall · กำลังอ่อน)",
};

/** ชนิดมุม → คำไทย */
const ASPECT_TH: Record<string, string> = {
  conjunction: "ทับซ้อน (0°)",
  sextile: "หกสิบองศา (60°)",
  square: "ฉาก/ขัดแย้ง (90°)",
  trine: "ตรีโกณ/ราบรื่น (120°)",
  opposition: "เล็ง/ปะทะ (180°)",
};

const ELEMENT_TH: Record<string, string> = { fire: "ไฟ", earth: "ดิน", air: "ลม", water: "น้ำ" };
const MODALITY_TH: Record<string, string> = { cardinal: "จร (cardinal)", fixed: "คงที่ (fixed)", mutable: "ผันแปร (mutable)" };

/** จัดองศาเป็นข้อความ เช่น 29°48' */
function fmtDeg(signDeg: number): string {
  const d = Math.floor(signDeg);
  const m = Math.round((signDeg - d) * 60);
  // กันกรณีปัดเป็น 60'
  if (m === 60) return `${d + 1}°00'`;
  return `${d}°${String(m).padStart(2, "0")}'`;
}

/**
 * สร้างข้อความ prompt สำหรับ AI
 * @param packet  Western packet
 * @param lang    ภาษา (รองรับ "th" เป็นหลัก) — ค่าอื่นยังคืนไทยนำ
 */
export function renderWesternPrompt(packet: WesternPacket, lang: string = "th"): string {
  void lang; // ไทยนำเสมอ (ตามกฎ) · param ไว้ขยายภายหลัง
  const d = packet.data;
  const L: string[] = [];

  L.push("===== ผังโหราศาสตร์ตะวันตก (Western · ระบบราศีเขตร้อน tropical) =====");
  L.push("ข้อมูลทั้งหมดด้านล่างคำนวณจากตำแหน่งดาราศาสตร์จริง (deterministic) — โปรดตีความตามหลักโหราศาสตร์ตะวันตก");
  L.push(`ระบบเรือน: whole-sign (เรือน = ราศี) · เวลาเกิด: ${packet.hasBirthTime ? "มีเวลาแม่น" : "ไม่มีเวลาเกิด (ผังบางส่วน)"}`);
  if (!packet.hasBirthTime) {
    L.push("⚠️ ไม่มีเวลาเกิด → ไม่มีลัคนา/กลางฟ้า/เรือน · ตำแหน่งจันทร์อาจคลาดเคลื่อน (ติดธง) · ตีความเฉพาะตำแหน่งดาวในราศีและมุมสัมพันธ์");
  }
  L.push("");

  // ── จุดสำคัญ: ลัคนา / กลางฟ้า ──
  if (d.ascendant) {
    L.push(`ลัคนา (Ascendant): ราศี${d.ascendant.signTh} ${fmtDeg(d.ascendant.signDeg)}`);
  } else {
    L.push("ลัคนา (Ascendant): ไม่มีข้อมูล (ขาดเวลาเกิด)");
  }
  if (d.mc) {
    L.push(`กลางฟ้า (MC/Midheaven): ราศี${d.mc.signTh} ${fmtDeg(d.mc.signDeg)}`);
  } else {
    L.push("กลางฟ้า (MC): ไม่มีข้อมูล (ขาดเวลาเกิด)");
  }
  L.push("");

  // ── ตำแหน่งดาว ──
  L.push("— ตำแหน่งดาว (ราศี · องศา · เรือน · ฐานะ) —");
  for (const p of d.planets) {
    const parts: string[] = [];
    parts.push(`${p.nameTh}: ราศี${p.signTh} ${fmtDeg(p.signDeg)}`);
    if (p.house !== null) parts.push(`เรือนที่ ${p.house}`);
    if (p.retro) parts.push("เดินถอย (พักร์/retrograde)");
    if (p.dignity) parts.push(DIGNITY_TH[p.dignity]);
    if (p.uncertain) parts.push("⚠️ ตำแหน่งอาจคลาด (ขาดเวลาเกิด)");
    L.push("  • " + parts.join(" · "));
  }
  L.push("");

  // ── เรือนทั้ง 12 (whole-sign) ──
  if (d.houses) {
    L.push("— เรือนทั้ง 12 (whole-sign · เรือน = ราศี) —");
    L.push("  " + d.houses.map((h) => `เรือน${h.house}=ราศี${h.signTh}`).join(" · "));
    L.push("");
  }

  // ── มุมสัมพันธ์ ──
  L.push("— มุมสัมพันธ์ระหว่างดาว (aspects · orb = องศาคลาดจากมุมพอดี) —");
  if (d.aspects.length === 0) {
    L.push("  (ไม่พบมุมสัมพันธ์ในเกณฑ์ orb)");
  } else {
    // เรียงมุมตาม orb ใกล้สุดก่อน (แม่นกว่า = สำคัญกว่า)
    const sorted = [...d.aspects].sort((a, b) => a.orb - b.orb);
    for (const a of sorted) {
      const nameA = pName(d, a.a);
      const nameB = pName(d, a.b);
      const dir = a.applying ? "กำลังเข้าหา (applying)" : "กำลังแยกออก (separating)";
      L.push(`  • ${nameA} ${ASPECT_TH[a.type] ?? a.type} ${nameB} · คลาด ${a.orb}° · ${dir}`);
    }
  }
  L.push("");

  // ── ภาพรวมธาตุ / คุณภาพราศี / กลุ่มดาว ──
  L.push("— ภาพรวมผัง (นับจากดาวจริง 10 ดวง) —");
  const e = d.shape.elements;
  L.push(`  สมดุลธาตุ: ไฟ ${e.fire} · ดิน ${e.earth} · ลม ${e.air} · น้ำ ${e.water}`);
  const m = d.shape.modalities;
  L.push(`  คุณภาพราศี: ${MODALITY_TH.cardinal} ${m.cardinal} · ${MODALITY_TH.fixed} ${m.fixed} · ${MODALITY_TH.mutable} ${m.mutable}`);
  if (d.shape.stellium.length > 0) {
    for (const s of d.shape.stellium) {
      const names = s.planets.map((n) => pName(d, n)).join(", ");
      L.push(`  กลุ่มดาวกระจุก (stellium): ${s.count} ดวงในราศี${s.signTh} → ${names}`);
    }
  } else {
    L.push("  กลุ่มดาวกระจุก (stellium): ไม่มี");
  }
  L.push("");
  L.push("===== จบข้อมูลผัง · โปรดตีความเป็นภาษาไทยตามหลักโหราศาสตร์ตะวันตก =====");

  return L.join("\n");
}

/** หาชื่อไทยของดาวจาก key (fallback = key) */
function pName(d: WesternPacket["data"], key: string): string {
  return d.planets.find((p) => p.name === key)?.nameTh ?? key;
}
