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
const POLARITY_TH: Record<string, string> = { masculine: "พลังส่งออก/masculine", feminine: "พลังรับเข้า/feminine" };
const HIDDEN_CONTACT_TH: Record<string, string> = {
  antiscia: "antiscia จุดสะท้อนเงา",
  contra_antiscia: "contra-antiscia จุดสะท้อนตรงข้าม",
  parallel: "parallel declination (คล้ายทับซ้อน)",
  contraparallel: "contra-parallel declination (คล้ายเล็ง)",
};
const FIXED_STAR_CONTACT_TH: Record<string, string> = {
  conjunction: "ทับซ้อน",
  opposition: "เล็ง",
  parallel: "parallel declination",
  contraparallel: "contra-parallel declination",
};
const PATTERN_TH: Record<string, string> = {
  t_square: "T-Square",
  grand_trine: "Grand Trine",
  yod: "Yod",
  kite: "Kite",
};

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

  const SECT_TH: Record<string, string> = {
    day: "กลางวัน (day sect · อาทิตย์อยู่เหนือขอบฟ้า)",
    night: "กลางคืน (night sect · อาทิตย์อยู่ใต้ขอบฟ้า)",
  };

  L.push("===== ผังโหราศาสตร์ตะวันตก (Western · ระบบราศีเขตร้อน tropical) =====");
  L.push("ข้อมูลทั้งหมดด้านล่างคำนวณจากตำแหน่งดาราศาสตร์จริง (deterministic) — โปรดตีความตามหลักโหราศาสตร์ตะวันตก");
  L.push(`ระบบเรือน: whole-sign (เรือน = ราศี) · เวลาเกิด: ${packet.hasBirthTime ? "มีเวลาแม่น" : "ไม่มีเวลาเกิด (ผังบางส่วน)"}`);
  L.push(`เพศเจ้าชะตา: ${packet.gender === "F" ? "หญิง (F)" : "ชาย (M)"} · sect ของดวง: ${packet.sect ? SECT_TH[packet.sect] : "ไม่มีข้อมูล (ขาดเวลาเกิด)"}`);
  L.push("ข้อห้าม: ห้ามคำนวณ term/face/triplicity, fixed stars, antiscia, declination หรือ transits เองจาก raw degree; ใช้เฉพาะ field ที่ packet ส่งมาเท่านั้น");
  L.push("ตัวเลข weight/score ใน packet เป็นดัชนีภายในเพื่อจัดลำดับหลักฐานเท่านั้น ห้ามตอบผู้ใช้เป็นคะแนนหรือเปอร์เซ็นต์");
  L.push(`TIMING_COVERAGE: transits=${packet.timingCoverage.transits} · returnCycles=${packet.timingCoverage.returnCycles} · exactTransitWindows=${packet.timingCoverage.exactTransitWindows} · solarReturn=${packet.timingCoverage.solarReturn} · secondaryProgressions=${packet.timingCoverage.secondaryProgressions} · annualProfection=${packet.timingCoverage.annualProfection} · eclipses=${packet.timingCoverage.eclipses} · retrogradeStations=${packet.timingCoverage.retrogradeStations} · rectification=${packet.timingCoverage.rectification}`);
  L.push(packet.data.timingTimeline
    ? "TIMING_GUARD: จังหวะเวลาปีเป้าหมายให้อ้างจาก TIMING_TIMELINE (วันที่คำนวณจริง) เท่านั้น · ห้ามประมาณวัน/เดือนเองนอกเหนือจากรายการ · ถ้าถามปีอื่นที่ไม่ใช่ปีเป้าหมาย ให้บอกว่า timeline ของปีนั้นยังไม่ได้ส่งมา"
    : "TIMING_GUARD: ถ้าผู้ใช้ถามวัน/เดือน/ปีที่ไม่ได้อยู่ใน packet ให้ฟันธงจากข้อมูลที่มีเท่านั้น และต้องบอกชัดว่าชั้น exact transit window/solar return/profection ยังไม่ได้ส่งมา ห้ามแต่งวันแน่นอนเอง");
  L.push("RECTIFICATION_GUARD: ถ้าไม่มีเวลาเกิด ห้ามเดาลัคนา/เรือน/จุดโชค/lots/sect เอง ต้องอ่านแบบ no-time หรือขอ workflow rectification แยก");
  if (!packet.hasBirthTime) {
    L.push("⚠️ ไม่มีเวลาเกิด → ไม่มีลัคนา/กลางฟ้า/เรือน · ตำแหน่งจันทร์อาจคลาดเคลื่อน (ติดธง) · ตีความเฉพาะตำแหน่งดาวในราศีและมุมสัมพันธ์");
    L.push(`NO_TIME_METADATA: birthTimeMode=${packet.birthTimeMode} · anchorTime=${packet.anchorTime?.localTime || "none"} (${packet.anchorTime?.purpose || "real_birth_time"}) · moonUncertainty=${packet.moonUncertainty ? "true" : "false"}`);
    L.push(`NO_TIME_ALLOWED: ${packet.allowedFieldsWhenNoTime.join(", ")}`);
    L.push(`NO_TIME_FORBIDDEN: ${packet.forbiddenFieldsWhenNoTime.join(", ")} · ถ้า field เหล่านี้ไม่มี/ถูกห้าม ห้ามนำไปฟันธง`);
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
  // จุดโชค (Part of Fortune) — ใช้ดูการเงิน/ลาภ/ความมั่งคั่ง; formula label ใช้ตาม packet
  if (d.partOfFortune) {
    const pof = d.partOfFortune;
    L.push(`จุดโชค (Part of Fortune · การเงิน/ลาภ/ความเป็นอยู่): ราศี${pof.signTh} ${fmtDeg(pof.signDeg)} · เรือนที่ ${pof.house}`);
    if (packet.partOfFortuneFormula === "sect_reversed") L.push("  สูตรจุดโชคใน packet: sect-reversed (day=Asc+Moon-Sun, night=Asc+Sun-Moon) · ใช้ตาม packet และอย่าสับสนว่าเป็นสูตร Ptolemy/Lilly แบบเดียวกันทั้งหมด");
  } else {
    L.push("จุดโชค (Part of Fortune): ไม่มีข้อมูล (ขาดเวลาเกิด/ลัคนา)");
  }
  L.push("— Lots เพิ่มเติม (ใช้เป็นหลักฐานรองตามหัวข้อ ห้ามให้กลบดาว/เรือนหลัก) —");
  if (!d.lots.length) {
    L.push("  ไม่มี lots เพิ่มเติมใน packet (มักเกิดจากขาดเวลาเกิด/ลัคนา) → ห้ามคำนวณเอง");
  } else {
    for (const lot of d.lots) {
      L.push(`  • ${lot.nameTh} (${lot.key}): ราศี${lot.signTh} ${fmtDeg(lot.signDeg)} · เรือนที่ ${lot.house} · formula ${lot.formula} · source=${lot.source}`);
    }
  }
  if (d.chartRuler) {
    const cr = d.chartRuler;
    const loc = cr.planet ? `อยู่ราศี${cr.planet.signTh} ${fmtDeg(cr.planet.signDeg)}${cr.planet.house ? ` · เรือนที่ ${cr.planet.house}` : ""}` : "ไม่พบดาวเจ้าใน packet";
    L.push(`เจ้าดวง (Chart ruler): ลัคนาราศี${cr.signTh} → ${cr.rulerTh} (${cr.ruler}) · ${loc}`);
  } else {
    L.push("เจ้าดวง (Chart ruler): ไม่มีข้อมูล (ขาดลัคนา)");
  }
  L.push("");

  // หมายเหตุตัวแทนคู่ครองตามเพศ (Ptolemy Tetrabiblos Book 4)
  if (packet.gender === "F") {
    L.push("หมายเหตุคู่ครอง: เจ้าชะตาเป็นหญิง (F) → ใช้ \"อาทิตย์\" เป็นตัวแทนคู่ครอง (สามี) · ดูราศี/เรือน/ฐานะ/มุมของอาทิตย์ประกอบเรือน 7 (Ptolemy Tetrabiblos Book 4)");
  } else {
    L.push("หมายเหตุคู่ครอง: เจ้าชะตาเป็นชาย (M) → ใช้ \"จันทร์\" เป็นตัวแทนคู่ครอง (ภรรยา) · ดูราศี/เรือน/ฐานะ/มุมของจันทร์ประกอบเรือน 7 (Ptolemy Tetrabiblos Book 4)");
  }
  L.push("");

  // ── ตำแหน่งดาว ──
  L.push("— ตำแหน่งดาว (ราศี · องศา · เรือน · ฐานะ) —");
  for (const p of d.planets) {
    const parts: string[] = [];
    parts.push(`${p.nameTh}: ราศี${p.signTh} ${fmtDeg(p.signDeg)}`);
    if (p.house !== null) parts.push(`เรือนที่ ${p.house}`);
    parts.push(`declination ${p.declination >= 0 ? "+" : ""}${p.declination.toFixed(2)}°`);
    if (p.retro) parts.push("เดินถอย (พักร์/retrograde)");
    if (p.dignity) parts.push(DIGNITY_TH[p.dignity]);
    const md = p.minorDignity;
    const minor: string[] = [];
    if (md.activeTriplicityLord) minor.push(`triplicity ruler=${pName(d, md.activeTriplicityLord)}`);
    else minor.push(`triplicity day/night=${pName(d, md.triplicityDayLord)}/${pName(d, md.triplicityNightLord)}`);
    minor.push(`term=${pName(d, md.termLord)}`);
    minor.push(`face=${pName(d, md.faceLord)}`);
    if (md.score > 0) minor.push("ฐานะย่อยหนุน");
    else if (md.score < 0) minor.push("ฐานะย่อยกด");
    else minor.push("ฐานะย่อยเป็นกลาง");
    if (md.peregrine) minor.push("peregrine");
    parts.push(`minor dignities: ${minor.join(" · ")}`);
    parts.push(`antiscia ${fmtLon(p.antisciaLon)} · contra ${fmtLon(p.contraAntisciaLon)}`);
    if (p.uncertain) parts.push("⚠️ ตำแหน่งอาจคลาด (ขาดเวลาเกิด)");
    L.push("  • " + parts.join(" · "));
  }
  L.push("");

  // ── antiscia / declination contacts ──
  L.push("— จุดซ่อน/declination ที่ packet คำนวณให้ —");
  if (!d.hiddenContacts.length) {
    L.push("  (ไม่พบ antiscia/contra-antiscia หรือ parallel/contraparallel ใน orb 1°)");
  } else {
    for (const c of d.hiddenContacts.slice(0, 24)) {
      L.push(`  • ${pName(d, c.a)} ↔ ${pName(d, c.b)} · ${HIDDEN_CONTACT_TH[c.type] || c.type} · orb ${c.orb}°`);
    }
  }
  L.push("");

  // ── fixed stars ──
  L.push("— Fixed stars —");
  if (!d.fixedStarHits.length) {
    L.push("  engine ตรวจ fixed-star catalog แล้ว แต่ไม่พบ hit แน่นใน orb ที่กำหนด → ห้ามอ่านชื่อ fixed star เพิ่มเองจากองศา");
  } else {
    L.push("  ใช้เฉพาะ fixed-star hit ที่ระบุด้านล่าง ห้ามเพิ่มชื่อดาวฤกษ์เอง");
    for (const h of d.fixedStarHits.slice(0, 24)) {
      L.push(`  • ${h.starTh} (${h.star}) ${FIXED_STAR_CONTACT_TH[h.contact] || h.contact} ${targetName(d, h.target)} · orb ${h.orb}° · nature ${h.nature.join("+")}`);
    }
  }
  L.push("");

  // ── transits ──
  L.push("— ดาวจรอ้างอิง (transits) —");
  if (!d.transits) {
    L.push("  ไม่มี transit packet → ถ้าถามปี/จังหวะเวลา ให้บอกว่าต้องคำนวณ transit เพิ่ม");
  } else {
    L.push(`  วันอ้างอิง: ${d.transits.refDate}`);
    if (!d.transits.aspectsToNatal.length) {
      L.push("  ไม่พบมุมดาวจรชนดาว/มุมกำเนิดใน orb ที่กำหนด");
    } else {
      for (const a of d.transits.aspectsToNatal.slice(0, 30)) {
        L.push(`  • ดาวจร ${pName(d, a.transit)} ${ASPECT_TH[a.type] ?? a.type} ${targetName(d, a.natal)} (${a.natalKind}) · orb ${a.orb}°`);
      }
    }
    if (d.timingSupport) {
      const activeRetro = d.timingSupport.retrogrades.filter((x) => x.retro).map((x) => x.planetTh).join(", ") || "ไม่มีดาวหลักที่พักร์ใน refDate";
      L.push(`  retrograde status: ${activeRetro}`);
      for (const r of d.timingSupport.returnCycles) {
        const asp = r.currentAspectToNatal ? ` · ตอนนี้ทำมุม ${ASPECT_TH[r.currentAspectToNatal.type] ?? r.currentAspectToNatal.type} orb ${r.currentAspectToNatal.orb}° กับตำแหน่งกำเนิด` : "";
        L.push(`  • ${r.planetTh} return cycle: อายุ ณ refDate ${r.ageAtRefDate} · รอบประมาณ ${r.currentCycleNumber} · return ก่อนหน้าอายุ ~${r.previousApproxAge} / ถัดไป ~${r.nextApproxAge} · orb ถึง return ${r.orbToReturn}°${asp}`);
      }
    }
  }
  L.push("");

  // ── TIMING_TIMELINE: จังหวะเวลาปีเป้าหมาย (คำนวณจริงทั้งปี · เฟส 1) ──
  const tl = d.timingTimeline;
  if (tl) {
    L.push(`— TIMING_TIMELINE ปี ${tl.targetYear} (วันที่ทั้งหมด = เวลาไทย · คำนวณ deterministic ทั้งปี ไม่ใช่ snapshot) —`);
    L.push(`  ${tl.coverageNote}`);
    if (tl.transitHits.length) {
      L.push("  [วันมุม exact ดาวจร→จุดกำเนิด] (retro=ดาวถอยตอนชน · pass x/y = ครั้งที่ x จาก y ครั้งเพราะเดินหน้า-ถอย-เดินหน้า)");
      for (const h of tl.transitHits) {
        L.push(`  • ${h.dateISO} (เดือน ${h.month}): ${h.transitTh}จร ${h.aspectTh} ${h.natalTh}กำเนิด${h.retro ? " ·R" : ""}${h.passesTotal > 1 ? ` · pass ${h.pass}/${h.passesTotal}` : ""}`);
      }
      if (tl.transitHitsDropped > 0) L.push(`  (คัดออก ${tl.transitHitsDropped} จุดน้ำหนักรอง — ถ้าจำเป็นต้องละเอียดกว่านี้ให้บอกผู้ใช้ว่ามีจุดรองที่ไม่ได้แสดง)`);
    } else {
      L.push("  ไม่มีมุม exact ของดาวช้าต่อจุดหลักในปีนี้ (ปีเบาเชิง transit)");
    }
    if (tl.ingresses.length) {
      L.push("  [ดาวช้าย้ายราศี (ฉากหลังปี)] " + tl.ingresses.map((x) => `${x.dateISO} ${x.bodyTh}→ราศี${x.toSignTh}${x.retro ? "(ถอย)" : ""}`).join(" · "));
    }
    if (tl.stations.length) {
      L.push("  [วันดาวหยุดเปลี่ยนทิศ (station)] " + tl.stations.map((x) => `${x.dateISO} ${x.bodyTh}${x.type === "station_retrograde" ? "เริ่มถอย" : "กลับเดินหน้า"}@ราศี${x.signTh}`).join(" · "));
    }
    if (tl.eclipses.length) {
      L.push("  [คราสปีนี้] " + tl.eclipses.map((x) => `${x.dateISO} ${x.kind === "solar" ? "สุริยคราส" : "จันทรคราส"}(${x.subtype})@ราศี${x.signTh}${x.hitNatal ? ` → ${x.hitNatal.aspect === "conjunction" ? "ทับ" : "เล็ง"}${x.hitNatal.nameTh}กำเนิด orb ${x.hitNatal.orb}°` : ""}`).join(" · "));
    }
    if (tl.solarReturn) {
      const sr = tl.solarReturn;
      L.push(`  [Solar Return ${tl.targetYear}] วันที่ ${sr.dateISO}${sr.uncertainNoBirthTime ? " (ไม่ทราบเวลาเกิด → instant คลาดได้ ±12 ชม. · จันทร์ SR ไม่แน่น)" : ""}`);
      if (sr.ascendant) L.push(`    ลัคนา SR: ราศี${sr.ascendant.signTh} ${sr.ascendant.signDeg}° · MC SR: ${sr.mc ? `ราศี${sr.mc.signTh}` : "-"}`);
      L.push("    ดาว SR: " + sr.planets.map((p) => `${p.nameTh}@ราศี${p.signTh}${p.retro ? "R" : ""}${p.natalHouse ? `(เรือนกำเนิด${p.natalHouse})` : ""}`).join(" · "));
    }
    if (tl.profection) {
      L.push("  [Annual Profection]");
      for (const s of tl.profection.segments) {
        L.push(`    ${s.fromISO} → ${s.toISO} (อายุ ${s.age}): เรือน profection ที่ ${s.profectedHouse} ราศี${s.profectedSignTh} · Lord of Year = ${s.lordOfYearTh}${s.lordNatalSignTh ? ` (กำเนิดอยู่ราศี${s.lordNatalSignTh}${s.lordNatalHouse ? ` เรือน${s.lordNatalHouse}` : ""})` : ""}`);
      }
    }
    if (tl.progressed) {
      L.push(`  [Secondary Progressions ณ กลางปี ${tl.targetYear}] ${tl.progressed.moonNote}`);
      L.push("    ตำแหน่ง progressed: " + tl.progressed.planets.map((p) => `${p.nameTh}@ราศี${p.signTh} ${p.signDeg}°`).join(" · "));
      if (tl.progressed.aspectsToNatal.length) {
        L.push("    มุม progressed→natal (orb ≤1°): " + tl.progressed.aspectsToNatal.map((a) => `${a.progressed} ${a.aspectTh} ${a.natal} (orb ${a.orb}°)`).join(" · "));
      }
    }
    L.push("");
  }

  // ── เรือนทั้ง 12 (whole-sign) ──
  if (d.houses) {
    L.push("— เรือนทั้ง 12 (whole-sign · เรือน = ราศี) —");
    L.push("  " + d.houses.map((h) => `เรือน${h.house}=ราศี${h.signTh}`).join(" · "));
    if (d.houseRulers) {
      L.push("  เจ้าเรือน: " + d.houseRulers.map((h) => `เรือน${h.house}=${h.rulerTh}${h.rulerPlanet?.house ? `(อยู่เรือน${h.rulerPlanet.house})` : ""}`).join(" · "));
    }
    L.push("");
  }

  // ── Topic lord matrix: บังคับให้ AI ลงรายละเอียดตามหัวข้อ ไม่ตอบกว้างเหมือนดวงทั่วไป ──
  L.push("— Topic lord matrix (หลักฐานตามหัวข้อชีวิต) —");
  L.push("  ใช้ matrix นี้ก่อนสรุปเรื่องงาน/เงิน/รัก/สุขภาพ เพื่อให้คำตอบเฉพาะเจ้าชะตาและไม่พูดกว้างเกินผัง");
  for (const row of d.topicLordMatrix) {
    L.push(`  ${row.labelTh} [${row.availability}]:`);
    if (!row.evidence.length) {
      L.push("    - ไม่มีหลักฐานเฉพาะหัวข้อนี้ใน packet");
      continue;
    }
    for (const ev of row.evidence) {
      const name = ev.planetTh ? `${ev.planetTh}${ev.planet ? ` (${ev.planet})` : ""}` : ev.lotTh ? `${ev.lotTh}${ev.lot ? ` (${ev.lot})` : ""}` : ev.role;
      const loc = ev.signTh ? `ราศี${ev.signTh}${typeof ev.signDeg === "number" ? ` ${fmtDeg(ev.signDeg)}` : ""}${ev.house ? ` · เรือน${ev.house}` : ""}` : ev.house ? `เรือน${ev.house}` : "ไม่มีตำแหน่งเรือน";
      const dig = ev.dignity ? ` · ${DIGNITY_TH[ev.dignity] || ev.dignity}` : typeof ev.minorScore === "number" ? ` · minorScore=${ev.minorScore}` : "";
      L.push(`    - ${ev.role}: ${name} · ${loc}${dig} · ${ev.reason}`);
    }
  }
  L.push("");

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

  // ── มุมย่อย + pattern ──
  L.push("— มุมย่อยและรูปทรงมุม (minor aspects / aspect patterns) —");
  if (!d.minorAspects.length) {
    L.push("  มุมย่อย: ไม่พบใน orb ที่กำหนด");
  } else {
    for (const a of d.minorAspects.slice(0, 24)) {
      const dir = a.applying ? "กำลังเข้าหา" : "กำลังแยกออก";
      L.push(`  • ${pName(d, a.a)} ${a.angleTh} ${pName(d, a.b)} · orb ${a.orb}° · ${dir}`);
    }
  }
  if (!d.aspectPatterns.length) {
    L.push("  aspect pattern: ไม่พบ T-Square / Grand Trine / Yod / Kite ตามเกณฑ์ engine");
  } else {
    for (const p of d.aspectPatterns) {
      const names = p.planets.map((n) => pName(d, n)).join(", ");
      const marker = p.apex ? ` · apex=${pName(d, p.apex)}` : p.focus ? ` · focus=${pName(d, p.focus)}` : "";
      L.push(`  • ${PATTERN_TH[p.type] || p.type}: ${names}${marker}`);
    }
  }
  L.push("");

  // ── ภาพรวมธาตุ / คุณภาพราศี / กลุ่มดาว ──
  L.push("— ภาพรวมผัง (นับจากดาวจริง 10 ดวง) —");
  const e = d.shape.elements;
  L.push(`  สมดุลธาตุ: ไฟ ${e.fire} · ดิน ${e.earth} · ลม ${e.air} · น้ำ ${e.water}`);
  const m = d.shape.modalities;
  L.push(`  คุณภาพราศี: ${MODALITY_TH.cardinal} ${m.cardinal} · ${MODALITY_TH.fixed} ${m.fixed} · ${MODALITY_TH.mutable} ${m.mutable}`);
  const pol = d.shape.polarities;
  L.push(`  polarity: ${POLARITY_TH.masculine} ${pol.masculine} · ${POLARITY_TH.feminine} ${pol.feminine}`);
  if (d.dominantPlanets.length) {
    L.push("  ดาวเด่น (dominant candidates · เรียงตาม internal rank): " + d.dominantPlanets.map((p) => `${p.nameTh} (${p.reasons.slice(0, 3).join("; ")})`).join(" | "));
  }
  if (d.dispositors.length) {
    L.push("  dispositors: " + d.dispositors.slice(0, 12).map((x) => `${x.planetTh}→${x.rulerTh}${x.rulerHouse ? `(เรือน${x.rulerHouse})` : ""}`).join(" · "));
  }
  if (d.shape.stellium.length > 0) {
    for (const s of d.shape.stellium) {
      const names = s.planets.map((n) => pName(d, n)).join(", ");
      L.push(`  กลุ่มดาวกระจุก (stellium): ${s.count} ดวงในราศี${s.signTh} → ${names}`);
    }
  } else {
    L.push("  กลุ่มดาวกระจุก (stellium): ไม่มี");
  }
  L.push("");
  L.push("— หัวข้อขั้นสูงที่ต้องมี packet เฉพาะเพิ่มเติม —");
  L.push("  ยังไม่ควรฟันธงจากผัง natal/transit นี้อย่างเดียว: " + packet.unsupportedSpecialtyPackets.join(", "));
  L.push("");
  L.push("===== จบข้อมูลผัง · โปรดตีความเป็นภาษาไทยตามหลักโหราศาสตร์ตะวันตก =====");

  return L.join("\n");
}

/** หาชื่อไทยของดาวจาก key (fallback = key) */
function pName(d: WesternPacket["data"], key: string): string {
  return d.planets.find((p) => p.name === key)?.nameTh ?? key;
}

function targetName(d: WesternPacket["data"], key: string): string {
  if (key === "Ascendant") return "ลัคนา";
  if (key === "MC") return "กลางฟ้า";
  if (key === "Part of Fortune") return "จุดโชค";
  return pName(d, key);
}

function fmtLon(lon: number): string {
  const L = ((lon % 360) + 360) % 360;
  const sign = Math.floor(L / 30);
  return `ราศี${["เมษ","พฤษภ","เมถุน","กรกฎ","สิงห์","กันย์","ตุล","พิจิก","ธนู","มังกร","กุมภ์","มีน"][sign]} ${fmtDeg(L - sign * 30)}`;
}
