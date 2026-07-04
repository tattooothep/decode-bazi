/**
 * Uranian render — แปลง packet เป็นข้อความ structured (ไทยนำ) ให้ AI อ่านแล้วตีความด้วยวิธีของ Witte
 * ════════════════════════════════════════════════════════════════════════
 * หลักการ (กฎข้อ 9): engine บอกจุดกึ่งกลาง/ภาพดาว/จุดไว ตรงๆ → AI ตีความโดย
 *   อ้างประโยคความหมาย verbatim ของ Witte ในคัมภีร์เท่านั้น (แปลไทยจาก verbatim ได้เพราะ PD)
 * ⚠️ ไทยนำเสมอ · ใช้ศัพท์ยูเรเนียน (Halbsumme/Planetenbild/sensitive Punkte/Meridian/Sonnenbogen)
 *    ห้ามปนศัพท์จีน (用神/廟旺/主星/四化) หรือพระเวท (graha/dasha)
 * หมายเหตุ: เครื่องหมายคำพูดในข้อความ prompt ใช้ «» (กันชนกับ delimiter สตริง)
 */
import type { UranianPacket } from "./packet";

const SIGN_TH = ["เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์", "ตุล", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน"];

/** r388 · ป้ายที่มา „การอ่านเชิงวิธี" 3 ภาษา (ความซื่อสัตย์ภายใน · ไม่ยัดใส่ทุกคำตอบผู้ใช้) */
export const METHOD_READING_LABEL = {
  th: "การอ่านเชิงวิธี (ระบบสังเคราะห์ · เรียบเรียงตามระบบ Hamburg School — ไม่ใช่ถ้อยคำ Witte verbatim)",
  en: "method reading (synthesized system layer, arranged per Hamburg School — not Witte's verbatim wording)",
  zh: "方法解讀（系統綜合層 · 依漢堡學派整理 — 非 Witte 原文）",
} as const;

function fmtDeg(signDeg: number): string {
  const d = Math.floor(signDeg);
  const m = Math.round((signDeg - d) * 60);
  if (m === 60) return `${d + 1}°00'`;
  return `${d}°${String(m).padStart(2, "0")}'`;
}
function fmtLon(lon: number): string {
  const L = ((lon % 360) + 360) % 360;
  const s = Math.floor(L / 30);
  return `ราศี${SIGN_TH[s]} ${fmtDeg(L - s * 30)}`;
}

/** สร้าง prompt สำหรับ AI (โหราศาสตร์ยูเรเนียน · Hamburger Schule) */
export function renderUranianPrompt(packet: UranianPacket, lang = "th"): string {
  void lang; // ไทยนำเสมอ
  const d = packet.data;
  const L: string[] = [];

  L.push("===== ผังโหราศาสตร์ยูเรเนียน (Uranian · Hamburger Schule · วิธี Alfred Witte) =====");
  L.push("ตำแหน่งดาวจริง 10 ดวง = ราศีเขตร้อน (tropical) คำนวณจากดาราศาสตร์จริง (deterministic) เดียวกับผังตะวันตก");
  L.push(`เวลาเกิด: ${packet.hasBirthTime ? "มีเวลาแม่น (มี Meridian/Aszendent)" : "ไม่มีเวลาเกิด (ไม่มี Meridian/Aszendent · จันทร์อาจคลาด)"}`);
  L.push(`orb ภาพดาว (Planetenbild) = ${packet.orbPictureDeg}° บนหน้าปัด 90° · orb จุดไว (sensitiver Punkt) = ${packet.orbSensitiveDeg}°`);
  L.push("");

  // ── กฎการอ่าน (เข้ม · ตาม 01-source-policy-conclusion) ──
  L.push("— กฎการอ่าน (บังคับ · ยูเรเนียน) —");
  L.push("1) อ่านด้วยวิธีของ Witte เท่านั้น: ครึ่งผลรวม (Halbsumme) + แกนสมมาตร (Symmetrieachse) + ภาพดาว (Planetenbild) + จุดไว (sensitive Punkte) + การกระตุ้น (Auslösung: Sonne=วัน/Mond=ชั่วโมง/Meridian=นาที) + Sonnenbogen");
  L.push("2) ความหมายคู่ดาว/ภาพดาว: มี 2 ชั้น (ก) ถ้าคัมภีร์ Witte verbatim (10-witte-canon-de.md · หมวด F/H/I) ครอบคลุมคู่นั้น → ยก verbatim นำก่อนเสมอ พร้อมอ้างบท/วารสาร (AR/AB)/ปี เช่น «(บท 40 · Hades)» (ข) คู่อื่น → อ่านจากพจนานุกรมภาพดาว «การอ่านเชิงวิธี» (11-method-reading-uranian.md) ได้เลย ตอบคำอ่านไทยเป็นเนื้อความปกติ (ไม่ต้องยัดป้ายกำกับในทุกประโยค)");
  L.push("3) พจนานุกรม «การอ่านเชิงวิธี» = สำนวนไทยของระบบเราเอง เรียบเรียงตามระบบ Hamburg School (วิธี Witte PD + ความหมายดาวสาธารณะ) → ⛔ ห้ามลอกถ้อยคำจาก Regelwerk / Ebertin (CSI/COSI) / Brummund / Niggemann / Aich (มีลิขสิทธิ์) และ ⛔ ห้ามแต่งคู่/ความหมายนอกพจนานุกรมนี้ขึ้นเอง · ถ้าผู้ใช้ถามที่มา จึงบอกว่าเป็น «การอ่านเชิงวิธีของระบบ ไม่ใช่ verbatim Witte»");
  L.push("4) อ่านความหมายของทุกคู่ดาวที่ engine ส่งมาได้ (ครึ่งผลรวม/ภาพดาว/จุดไว) — ไม่ต้องตอบ «เรขาคณิตอย่างเดียว» อีกต่อไป · ใช้พจนานุกรม + สมการ 3 ทิศ (A/B=C ⟺ A/C=B ⟺ B/C=A) รวมเป็นธีมเดียว · คู่ที่พจนานุกรมยังไม่มีจริง ๆ จึงอธิบายเชิงเรขาคณิต");
  L.push("5) ทรานส์เนปจูนที่ใช้ได้ = เฉพาะ Cupido/Hades/Kronos/Zeus (Witte เขียนเอง · PD) · ⛔ ห้ามใช้ Apollon/Admetos/Vulkanus/Poseidon และห้ามใช้การตีความ Pluto สำนัก Hamburg หลังสงคราม");
  L.push("6) เฟสนี้ยังไม่ได้คำนวณตำแหน่ง Cupido/Hades/Kronos/Zeus → ห้ามระบุองศา/ราศี/จุดกึ่งกลางของมันเอง · อ้างได้เฉพาะความหมายตามคัมภีร์หมวด H เมื่อผู้ใช้ถามเรื่องที่ตรง (แต่งงาน/ครอบครัว=Cupido · โรค/ความตาย/ผู้หญิงโดดเดี่ยว=Hades · ผู้ปกครอง=Kronos · สงคราม=Zeus)");
  L.push("7) NO_PERCENT: ห้ามให้คะแนน/เปอร์เซ็นต์ · ตัวเลข orb คือระยะเชิงมุมจริง ใช้จัดลำดับความคม ไม่ใช่คะแนนทำนาย");
  L.push("8) สัญลักษณ์ดาว/องศาในต้นฉบับ Fraktur ของ Witte OCR เพี้ยนได้ → ถ้าจะยกตัวเลของศาจากตัวอย่าง (บท 12/30/31/44) ให้เตือนว่าเป็นค่าโดยประมาณต้องเทียบสแกน");
  L.push("");

  // ── ตำแหน่งดาว/จุด บนหน้าปัด 90° ──
  L.push("— ตำแหน่งดาว/จุด (ราศี · องศา · ตำแหน่งบนหน้าปัด 90°) —");
  for (const p of d.points) {
    const parts = [`${p.nameTh} (${p.nameDe}): ราศี${p.signTh} ${fmtDeg(p.signDeg)}`, `dial90=${p.dial90.toFixed(2)}°`];
    if (p.uncertain) parts.push("⚠️ ตำแหน่งอาจคลาด (ขาดเวลาเกิด)");
    L.push("  • " + parts.join(" · "));
  }
  if (!packet.hasBirthTime) {
    L.push("  (ไม่มี Meridian/Aszendent เพราะขาดเวลาเกิด — อ่านได้เฉพาะครึ่งผลรวม/ภาพดาว/จุดไว ระหว่างดาว-ดาว)");
  }
  L.push("");

  // ── ภาพดาว (Planetenbild) ที่ยิงเข้า orb ──
  L.push("— ภาพดาว (Planetenbild · ดาวตกบนครึ่งผลรวมของอีกสองดาว ภายใน orb) —");
  if (!d.planetaryPictures.length) {
    L.push("  ไม่พบภาพดาวที่แน่นภายใน orb ที่กำหนด → ห้ามสร้างภาพดาวเพิ่มเองจากองศา");
  } else {
    L.push("  รูปแบบ: occupant ตกบนแกนสมมาตร a|b คือ a + b − occupant · ยิ่ง orb แคบยิ่งคม");
    for (const pic of d.planetaryPictures.slice(0, 40)) {
      L.push(`  • ${pic.occupantTh} บนครึ่งผลรวม ${pic.pairTh} (${pic.pair}) · orb ${pic.orbDeg.toFixed(2)}°`);
    }
  }
  L.push("");

  // ── จุดไว (sensitive Punkte) ที่ถูกกระตุ้น ──
  L.push("— จุดไว (sensitive Punkte · ผลรวม a+b หรือผลต่าง a−b ถูกดาว/จุดอื่นกระตุ้น) —");
  if (!d.sensitivePoints.length) {
    L.push("  ไม่พบจุดไวที่ถูกกระตุ้นแน่นภายใน orb → ห้ามคำนวณจุดไวเพิ่มเอง");
  } else {
    for (const sp of d.sensitivePoints.slice(0, 40)) {
      const op = sp.kind === "sum" ? "+" : "−";
      L.push(`  • ${sp.activatedByTh} ตกบนจุด${sp.kind === "sum" ? "ผลรวม" : "ผลต่าง"} (${sp.aTh} ${op} ${sp.bTh}) ที่ ${fmtLon(sp.pointLon)} · orb ${sp.orbDeg.toFixed(2)}°`);
    }
  }
  L.push("");

  // ── ทรานส์เนปจูนของ Witte (เฟส 1 = ชื่อ+ความหมายเท่านั้น) ──
  L.push("— ทรานส์เนปจูนของ Witte (PD · ยังไม่คำนวณตำแหน่งในเฟสนี้ · อ้างความหมายจากคัมภีร์หมวด H เท่านั้น) —");
  for (const t of d.witteTransneptunians) {
    L.push(`  • ${t.nameTh} (${t.nameDe}) — เจ้าราศี ${t.rulerSignDe} · แหล่งความหมาย: ${t.canonRef}`);
  }
  L.push(`  ⛔ ตัดออกจากศาสตร์นี้ (ลิขสิทธิ์ Sieggrün หลังสงคราม): ${packet.excludedTransneptunians.join(" / ")}`);
  L.push("");

  // ── ที่มาความหมายเชิงวิธี (ภายใน · ไม่ต้องแปะทุกคำตอบผู้ใช้ · i18n 3 ภาษา) ──
  // ── ชั้นการกระตุ้น (Auslösung · จับวัน/เดือน) — r389 ──
  if (packet.auslosung) {
    const au = packet.auslosung;
    L.push("");
    L.push(`— ชั้นการกระตุ้น (Auslösung · จับ "ตกวัน/เดือนไหน") · ช่วง ${au.targetFromISO.slice(0, 10)}..${au.targetToISO.slice(0, 10)} · อายุ ${au.ageAtFrom.toFixed(1)}–${au.ageAtTo.toFixed(1)} ปี · ส่วนโค้งอาทิตย์ ${au.solarArcDegAtFrom.toFixed(2)}°→${au.solarArcDegAtTo.toFixed(2)}° —`);
    L.push("  วิธี: จุดไวกำเนิดถูก 'ปลุกเป็นเหตุการณ์' เมื่อ ดาวจร/ส่วนโค้งอาทิตย์/ดวงก้าวหน้า วิ่งมาแตะมุมแข็ง (0/45/90/135/180) · orb แคบ = วันคมสุด · NO_PERCENT (orb คือความคม ไม่ใช่คะแนน) · ตอบวัน/เดือนได้จากรายการนี้เท่านั้น ห้ามเดาวันเอง");
    if (!au.groups.length) {
      L.push("  (ไม่พบการกระตุ้นแน่นในช่วงนี้ → บอกตรง ๆ ว่าช่วงนี้ไม่มีวันเด่น อย่าแต่งวัน)");
    }
    for (const g of au.groups.slice(0, 8)) {
      const natalSharp = g.natalOrbArcmin ? ` · คมในผังกำเนิด ${g.natalOrbArcmin.toFixed(1)}′` : "";
      L.push(`  ▸ จุดไว: ${g.targetTh}${g.formula ? ` (${g.formula})` : ""} ที่ ${g.signTh} ${g.signDeg.toFixed(2)}°${natalSharp}`);
      for (const e of g.events.slice(0, 5)) {
        L.push(`      • ${e.dateISO} · ${e.moverTh} ${e.aspectTh} · orb ${e.orbArcmin.toFixed(1)}′`);
      }
    }
    L.push("  ⛔ ทรานส์เนปจูน (Cupido/Hades/Zeus/Kronos) ยังไม่คำนวณตำแหน่ง → ห้ามใช้เป็นตัวกระตุ้น/directed (รอ ephemeris)");
  }

  L.push("— ที่มาความหมายเชิงวิธี (ภายใน · integrity) —");
  L.push(`  TH: ${METHOD_READING_LABEL.th}`);
  L.push(`  EN: ${METHOD_READING_LABEL.en}`);
  L.push(`  ZH: ${METHOD_READING_LABEL.zh}`);
  L.push("");
  L.push("===== จบข้อมูลผัง · ตีความเป็นภาษาผู้ถาม: Witte verbatim นำก่อน (อ้างบท) · คู่อื่นใช้พจนานุกรมการอ่านเชิงวิธี =====");
  return L.join("\n");
}
