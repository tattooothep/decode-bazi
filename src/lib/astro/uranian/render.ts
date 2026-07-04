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
  L.push("2) ความหมายของภาพดาว/คู่ดาว = อ้างประโยค verbatim ของ Witte ในคัมภีร์ที่แนบเท่านั้น (แปลไทยจากตัวบท verbatim ได้เพราะเป็น PD) · ทุกครั้งต้องอ้างบท/วารสาร (AR/AB)/ปี เช่น «(บท 40 · Hades)»");
  L.push("3) ⛔ ห้ามแต่ง lookup «ดาว A + ดาว B = ความหมาย X» ขึ้นเอง · ห้ามลอกจาก Regelwerk / Ebertin (CSI) / Brummund / Niggemann / Aich (ทั้งหมดมีลิขสิทธิ์)");
  L.push("4) คู่/ภาพดาวใดที่คัมภีร์ Witte (PD) ไม่ครอบคลุมความหมาย = พูดตรงๆ ว่า «ตำรา Witte PD ไม่ครอบคลุมคู่นี้» แล้วอธิบายได้เฉพาะเรขาคณิต (ดาวใดตกบนครึ่งผลรวมของใคร) ห้ามเดาความหมาย");
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

  L.push("===== จบข้อมูลผัง · โปรดตีความเป็นภาษาไทยด้วยวิธี Witte + อ้างประโยค verbatim ในคัมภีร์เท่านั้น =====");
  return L.join("\n");
}
