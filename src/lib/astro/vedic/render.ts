/**
 * โหราศาสตร์พระเวท (Vedic / Jyotish) — render prompt (ไทยนำ · deterministic)
 * ⚠️ ใช้ศัพท์ Vedic เท่านั้น: graha/rashi/bhava/nakshatra/dasha (+คำแปลไทย)
 *    ห้ามปนศัพท์ศาสตร์อื่น (廟旺/用神/zodiac tropical ฯลฯ)
 * engine คำนวณ → render จัดเป็นข้อความ → AI ตีความ (กฎข้อ 9)
 */
import type { VedicPacket } from "./packet";

const DIGNITY_TH: Record<string, string> = {
  exalted: "อุจ (exalted)",
  moolatrikona: "มูลตรีโกณ (moolatrikona)",
  debilitated: "นิจ (debilitated)",
  own: "เกษตร/เจ้าเรือนตน (own sign)",
  friend: "ราศีมิตร (friend sign)",
  enemy: "ราศีศัตรู (enemy sign)",
  neutral: "ปกติ (neutral)",
};

const REL_TH: Record<string, string> = {
  self: "ตนเอง",
  friend: "มิตร",
  neutral: "กลาง",
  enemy: "ศัตรู",
  not_applicable: "ไม่ล็อกต่างสำนัก",
};

const fmt = (n: number, d = 2) => n.toFixed(d);
const fmtMaybe = (n: number | null | undefined, d = 2) => n == null ? "—" : fmt(n, d);

function vargaLine(label: string, rows: VedicPacket["data"]["vargas"]["navamsaD9"]): string {
  return `${label}: ` + rows.map((p) => {
    const dignity = p.dignity ? ` · ${DIGNITY_TH[p.dignity] ?? p.dignity}` : "";
    const vg = p.vargottama ? " · vargottama" : "";
    return `${p.nameTh}=${p.rashiTh} ${fmt(p.deg)}°${dignity}${vg}`;
  }).join(" | ");
}

export function renderVedicPrompt(packet: VedicPacket, lang: "th" | "en" = "th"): string {
  const d = packet.data;
  const L: string[] = [];

  L.push("=== ผังโหราศาสตร์พระเวท (Vedic / Jyotish · สิทธานต์สายดาวจักรราศี sidereal) ===");
  L.push(`ระบบอายนางศะ (ayanamsa): ${d.ayanamsa.name} = ${fmt(d.ayanamsa.value, 4)}°`);
  L.push(`ข้อมูลเวลาเกิด: ${packet.hasBirthTime ? "มีเวลาเกิด (ผังสมบูรณ์)" : "ไม่มีเวลาเกิด (ติดธง: ลัคนา/เรือนคำนวณไม่ได้ · จันทร์เคลื่อน ~13°/วัน อาจคลาด ±)"}`);
  L.push(`ระดับข้อมูล: ${packet.degradeLevel}`);
  if (!packet.hasBirthTime) {
    L.push(`NO_TIME_METADATA: birthTimeMode=${packet.birthTimeMode} · anchorTime=${packet.anchorTime?.localTime || "none"} (${packet.anchorTime?.purpose || "real_birth_time"}) · moonUncertainty=${packet.moonUncertainty ? "true" : "false"}`);
    L.push(`NO_TIME_TIMING_CONFIDENCE: moonNakshatra=${packet.timingConfidence.moonNakshatra} · vimshottari=${packet.timingConfidence.vimshottari} · gocharaFromMoon=${packet.timingConfidence.gocharaFromMoon}`);
    L.push(`CHANDRA_LAGNA_MODE: enabled=${packet.chandraLagnaMode.enabled ? "true" : "false"} · status=${packet.chandraLagnaMode.status} · moonRashi=${packet.chandraLagnaMode.moonRashiTh} · confidence=${packet.chandraLagnaMode.confidence} · usage=${packet.chandraLagnaMode.usage}`);
    L.push(`CHANDRA_LAGNA_CAUTION: ${packet.chandraLagnaMode.caution}`);
    L.push(`NO_TIME_ALLOWED: ${packet.allowedFieldsWhenNoTime.join(", ")}`);
    L.push(`NO_TIME_FORBIDDEN: ${packet.forbiddenFieldsWhenNoTime.join(", ")} · ห้ามนำ field เหล่านี้ไปฟันธงเมื่อไม่มีเวลาเกิด`);
  }
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
    const d9 = d.vargas.navamsaD9.find((x) => x.name === g.name);
    const d10 = d.vargas.dashamsaD10.find((x) => x.name === g.name);
    const parts = [
      `${g.nameTh} (${g.name})`,
      `ราศี${g.rashiTh} ${fmt(g.deg)}°`,
      `ฤกษ์ ${g.nakshatra} บาท ${g.pada}`,
      g.house != null ? `เรือน (bhava) ${g.house}` : "เรือน —",
      `ฐานะ ${DIGNITY_TH[g.dignity] ?? g.dignity}`,
      `เจ้าราศี ${g.rashiLordTh} (${REL_TH[g.rashiLordRelation] ?? g.rashiLordRelation})`,
    ];
    if (d9) parts.push(`D9 ${d9.rashiTh}${d9.vargottama ? " vargottama" : ""}`);
    if (d10) parts.push(`D10 ${d10.rashiTh}`);
    if (g.retro) parts.push("พักร์ (retrograde)");
    if (g.combustion.limitDeg != null) parts.push(`ระยะอาทิตย์ ${fmtMaybe(g.combustion.orbFromSun)}°/limit ${fmtMaybe(g.combustion.limitDeg)}°`);
    if (g.combust) parts.push("อัสตงคต (combust · ใกล้อาทิตย์)");
    L.push("• " + parts.join(" · "));
  }
  L.push("");

  L.push("--- วรรคย่อย (varga) ที่ engine คำนวณแล้ว ---");
  L.push(vargaLine("D9 Navamsa / นวางศ์", d.vargas.navamsaD9));
  L.push(vargaLine("D10 Dashamsa / ทศางศ์", d.vargas.dashamsaD10));
  L.push(`ชุด varga ครบใน structured packet: ${Object.keys(d.vargas.shodasha).join(", ")}`);
  L.push("หมายเหตุ: varga ใน packet นี้เป็นตำแหน่ง deterministic; ใช้ยืนยัน/ปรับน้ำหนักเท่านั้น ห้ามแต่ง varga นอก structured packet");
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

  L.push("--- ดฤษฏิ (drishti · aspect table ของ Vedic ตาม Parashari) ---");
  if (d.drishti.length) {
    L.push("รายการนี้คือ aspect table ที่ engine คำนวณแล้ว · ห้ามตอบว่าไม่มี aspect table");
    for (const x of d.drishti) {
      L.push(`• ${x.fromTh} (${x.from}) จากราศี${x.fromRashiTh} มอง ${x.toTh} (${x.to}) ที่ราศี${x.toRashiTh} · ตำแหน่งที่ ${x.aspectHouse} จากกัน`);
    }
  } else {
    L.push("ไม่มี drishti สำคัญตามรายการที่ packet คำนวณ");
  }
  L.push("");

  L.push("--- Yoga candidates ที่ engine ตรวจได้ ---");
  if (d.yogaCandidates.length) {
    for (const y of d.yogaCandidates) {
      const cautions = y.cautions.length ? ` · ระวัง: ${y.cautions.join(", ")}` : "";
      L.push(`• ${y.name} [${y.status}] · หลักฐาน: ${y.evidence.join(" + ")}${cautions}`);
    }
  } else {
    L.push("ไม่มี yoga candidate ในชุดกฎที่ engine ตรวจได้ตอนนี้");
  }
  L.push("");

  L.push("--- Shadbala (normalized-sixfold-v1 · คะแนนกำลังดาว 0-100) ---");
  L.push(
    d.shadbala.planets
      .map((p) => `${p.grahaTh}=${p.score}/${p.band} [sth=${p.components.sthana}, dig=${p.components.dig}, kala=${p.components.kala}, che=${p.components.cheshta}, nai=${p.components.naisargika}, drik=${p.components.drik}]`)
      .join(" | "),
  );
  L.push("");

  L.push("--- Ashtakavarga (BAV/SAV · bindu) ---");
  L.push(`Sarvashtakavarga total=${d.ashtakavarga.sarvaTotal}: ` + d.ashtakavarga.sarvaByRashi.map((x) => `${x.rashiTh}=${x.bindu}`).join(" | "));
  L.push("Bhinna totals: " + d.ashtakavarga.planets.map((p) => `${p.grahaTh}=${p.totalBindus}`).join(" | "));
  L.push("");

  // ฤกษ์จันทร์ + วิมโศตตรีทศา (Vimshottari dasha)
  L.push("--- ทศา (dasha) ---");
  if (packet.timingConfidence.vimshottari !== "firm") {
    L.push("⚠️ ไม่มีเวลาเกิด → Moon nakshatra และ Vimshottari ด้านล่างเป็น reference-only จาก noon anchor ห้ามใช้เป็นแกนฟันจังหวะชีวิตแบบแน่นอน");
  }
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

  L.push("");
  L.push("--- โคจรอ้างอิง (gochara / transit) ---");
  L.push(`วันอ้างอิง: ${d.gochara.refDate} · ayanamsa ${d.gochara.ayanamsa.name} ${fmt(d.gochara.ayanamsa.value, 4)}°`);
  if (!packet.hasBirthTime && packet.chandraLagnaMode.enabled) {
    L.push(`หมายเหตุ Chandra Lagna: จากจันทร์เดิมให้อ่านเป็นฐานประกอบเท่านั้น (${packet.chandraLagnaMode.moonRashiTh}) · ไม่ใช่ลัคนาเกิดจริง`);
  }
  for (const g of d.gochara.grahas) {
    const parts = [
      `${g.nameTh} (${g.name})`,
      `ราศี${g.rashiTh} ${fmt(g.deg)}°`,
      `จากจันทร์เดิมเรือน ${g.houseFromMoon}`,
      g.houseFromLagna != null ? `จากลัคนาเดิมเรือน ${g.houseFromLagna}` : "จากลัคนาเดิม —",
      `ฐานะ ${DIGNITY_TH[g.dignity] ?? g.dignity}`,
    ];
    if (g.retro) parts.push("พักร์");
    if (g.combust) parts.push(`อัสตงคต orb ${fmtMaybe(g.combustion.orbFromSun)}°`);
    L.push("• " + parts.join(" · "));
  }
  if (d.gochara.hitsToNatal.length) {
    L.push("gochara hits to natal:");
    for (const h of d.gochara.hitsToNatal.slice(0, 40)) {
      L.push(`  • ${h.transitTh}จร → ${h.natalTh}เดิม · ${h.relation} · ตำแหน่งที่ ${h.aspectHouse}`);
    }
  }

  // --- TIMING_TIMELINE ปีเป้าหมาย (เฟส 2: ทศา 3 ชั้น + gochara segment + sade sati + varshaphala) ---
  const tl = d.timingTimeline;
  if (tl) {
    L.push("");
    L.push(`--- TIMING_TIMELINE ปี ${tl.targetYear} (วันที่ = เวลาไทย · คำนวณจริงทั้งปี ไม่ใช่ snapshot) ---`);
    L.push(tl.coverageNote);
    L.push("TIMING_GUARD: จังหวะรายเดือน/รายช่วงของปีเป้าหมายให้อ้างจากรายการด้านล่างเท่านั้น ห้ามประมาณวันเอง");
    if (tl.dashaTimeline.length) {
      L.push("[ทศา 3 ชั้นตลอดปี (maha→antar→pratyantar)]");
      for (const r of tl.dashaTimeline) {
        L.push(`  • ${r.fromISO} → ${r.toISO}: ${r.mahaTh}–${r.antarTh}–${r.pratyantarTh} (${r.maha}/${r.antar}/${r.pratyantar})`);
      }
    }
    if (tl.transitSegments.length) {
      L.push("[ดาวจรรายช่วงราศี + ashtakavarga bindu (BAV ของดาวนั้นในราศีที่เหยียบ / SAV ราศี)]");
      for (const s of tl.transitSegments) {
        L.push(`  • ${s.grahaTh}: ${s.fromISO} → ${s.toISO} ราศี${s.rashiTh} · เรือนจากจันทร์ ${s.houseFromMoon}${s.houseFromLagna ? ` · จากลัคนา ${s.houseFromLagna}` : ""} · bindu ${s.bavBindus ?? "-"}/8 · SAV ${s.sarvaBindus}${s.retroAtIngress ? " · เข้าแบบถอย" : ""}`);
      }
    }
    L.push(`[Sade Sati] จันทร์กำเนิดราศี${tl.sadeSati.natalMoonRashiTh} · ปีนี้${tl.sadeSati.activeAnyTimeInYear ? "มีช่วง active:" : "ไม่ active"}`);
    for (const p of tl.sadeSati.phases) {
      L.push(`  • ${p.fromISO} → ${p.toISO}: ${p.phaseTh}`);
    }
    if (tl.varshaphala) {
      const vp = tl.varshaphala;
      L.push(`[Varshaphala ${tl.targetYear}] เริ่มปีสุริยคติ ${vp.dateISO}${vp.uncertainNoBirthTime ? " (ไม่ทราบเวลาเกิด → instant คลาด ±12 ชม. อ่านเป็นแนวโน้ม)" : ""}${vp.munthaRashiTh ? ` · Muntha ราศี${vp.munthaRashiTh}` : ""}`);
      L.push("  ดาว ณ วันเริ่มปี: " + vp.grahas.map((g) => `${g.nameTh}@ราศี${g.rashiTh}${g.retro ? "R" : ""}`).join(" · "));
    }
  }

  if (packet.notAvailable.length) {
    L.push("");
    L.push(`ข้อมูลที่ยังไม่ได้คำนวณจริงใน packet นี้: ${packet.notAvailable.join(", ")}`);
  }

  L.push("");
  L.push("หมายเหตุ: ทุกค่าข้างต้นคำนวณด้วย engine (ดาวจริง + ตารางตำรา Jyotish) แบบ deterministic · AI มีหน้าที่ตีความเป็นภาษาไทยเท่านั้น ห้ามแก้ตัวเลข");

  return L.join("\n");
}
