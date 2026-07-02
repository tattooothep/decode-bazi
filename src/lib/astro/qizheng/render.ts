/**
 * astro/qizheng · render packet → prompt (ไทยนำ · ให้ AI ตีความ)
 * ⚠️ ศัพท์เฉพาะ 七政四餘 (命主/廟旺/恩用仇難/格局/12宮) — ห้ามปนปาจื้อ(用神/十神)/Western(house สากล)
 */
import type { QizhengPacket } from "./packet";

export function renderQizhengPrompt(p: QizhengPacket, lang: "th" | "en" | "zh" = "th"): string {
  const d = p.data;
  const L: string[] = [];
  L.push(`【ผังดวง 七政四餘 (ดาวจริงบนฟ้า)】 — packetVersion=${p.packetVersion}`);
  if (!p.hasBirthTime) L.push(`⚠️ ดวงนี้ไม่ระบุเวลาเกิด → ไม่มีลัคนา/命宮/命度/度主/身主/12宮 (อ่านได้เฉพาะดาว+廟旺+格局ระดับวัน)`);
  if (p.hasBirthTime) {
    L.push(`命宮(ลัคนา): ${d.ascendant.signTh} ${d.ascendant.deg}° · 宿${d.ascendant.shu}${d.ascendant.shuDeg}° · 命主(เจ้าราศีลัคนา): ${d.ascendant.rulerTh} สถานะ${d.yongshen.status}`);
    L.push(`命度/度主: ${d.mingDegree.signTh} ${d.mingDegree.deg}° · 宿${d.mingDegree.shu}${d.mingDegree.shuDeg}°(${d.mingDegree.shuTh || "—"}) → 度主 ${d.mingDegree.lordZh} ${d.mingDegree.lordTh} สถานะ${d.mingDegree.lordStatus} · เทียบ命主=${d.mingDegree.relationToMing}`);
    L.push(`身宮/身主(月為身): จันทร์อยู่${d.shenDegree.signTh} ${d.shenDegree.deg}° · 宿${d.shenDegree.shu}${d.shenDegree.shuDeg}°(${d.shenDegree.shuTh || "—"}) → 身主 ${d.shenDegree.lordZh} ${d.shenDegree.lordTh} สถานะ${d.shenDegree.lordStatus} · เทียบ命主=${d.shenDegree.relationToMing}`);
  }
  L.push(`\nดาว 7政+4餘 (廟旺):`);
  for (const s of d.stars) L.push(`  ${s.zh} ${s.th} · ราศี${s.signTh} ${s.signDeg}° · 宿${s.shu}${s.shuDeg}° · ${s.status}${s.retro ? " (พักร์)" : ""}`);
  if (p.hasBirthTime) {
    L.push(`\n恩星(หนุน命主): ${d.enStars.join("、") || "—"} · 用星(命主ระบายไป): ${d.yongStars.join("、") || "—"} · 仇星: ${d.chouStars.join("、") || "—"} · 難星(ขัด命主): ${d.nanStars.join("、") || "—"}`);
    if (d.geju.length) L.push(`格局: ${d.geju.map((g) => g.th + (g.good ? "(ดี)" : "(ระวัง)")).join(" · ")}`);
  } else {
    L.push(`\n命主/恩用仇難/格局: ปิดใช้งาน เพราะต้องใช้เวลาเกิดเพื่อตั้ง命宮 ห้ามอนุมานจากดาวลอย`);
  }
  if (d.houses12.length) {
    L.push(`\n【12 เรือนชีวิต — 先看其宮後看其主】`);
    for (const h of d.houses12) {
      const mk = h.level === "good" ? "⭐เด่น" : h.level === "weak" ? "⚠ระวัง" : "ปานกลาง";
      L.push(`  เรือน${h.house} ${h.zh}(${h.domain}) [${mk}] — ราศี${h.signTh} เจ้าเรือน=${h.rulerTh}(${h.rulerStatus}) ตกเรือน${h.rulerInHouse}${h.starsInHouse.length ? " · มีดาว:" + h.starsInHouse.join("+") : ""}`);
    }
  }
  if (d.transit.length) {
    L.push(`\n【ดาวจร 流年 แบบย่อ — 木(โอกาส)/土(ภาระ) เทียบเรือนเกิด】`);
    for (const t of d.transit) L.push(`  ${t.year}: ${t.note}`);
  }
  if (d.xingXian) {
    const x = d.xingXian;
    const c = x.current;
    L.push(`\n【行限/限度主 — 洞微百六限 timing】`);
    L.push(`  วันอ้างอิง ${x.refDateISO} · ปีเป้าหมาย ${x.targetYear} · อายุ虚歲 ${x.nominalAge} (อายุจริง ~${x.actualAge})`);
    L.push(`  出命限: ${x.chuMingAge}歲 · method=${x.chuMingMethod} · confidence=${x.methodConfidence}`);
    L.push(`  行限ปัจจุบัน: ${c.segment.zh}(${c.segment.domain}) อายุ ${c.segment.ageStart}–${c.segment.ageEnd} · เดินมา ${c.elapsedYears} ปี · ${c.degreeInPalace}° ในเรือน${c.segment.signTh}`);
    L.push(`  限度: 宿${c.limitShu.zh}${c.limitShu.deg}°(${c.limitShu.th}) → 限度主 ${c.limitDegreeLord.zh} ${c.limitDegreeLord.th} สถานะ${c.limitDegreeLord.natalStatus} · เทียบ命主=${c.limitDegreeLord.relationToMing} · อยู่เรือน${c.limitDegreeLord.natalHouse ?? "—"}ในพื้นดวง`);
    L.push(`  限宮主: ${c.limitPalaceLord.th} สถานะ${c.limitPalaceLord.status} · อยู่เรือน${c.limitPalaceLord.natalHouse}ในพื้นดวง · tone=${c.tone} · ${c.note}`);
    L.push(`  洞微百六限: supplied=${x.dongweiHundredSix.supplied} · cycleYears=${x.dongweiHundredSix.cycleYears} · ${x.dongweiHundredSix.note}`);
  }
  const tl = d.timingTimeline;
  if (tl) {
    L.push(`\n【TIMING_TIMELINE ปี ${tl.targetYear} — 流年ครบดวง + 流月太陽過宮 + วันชนจุดสำคัญ (เวลาไทย · คำนวณจริง)】`);
    L.push(`  ${tl.coverageNote}`);
    L.push("  TIMING_GUARD: จังหวะรายเดือน/วันของปีเป้าหมายให้อ้างจากรายการนี้เท่านั้น ห้ามประมาณเอง");
    L.push("  [流年 ดาวจรครบดวง (กลางปี · เทียบเรือนเกิด + เทียบ命主)]");
    for (const s of tl.liuNianStars) {
      L.push(`  • ${s.zh} ${s.th}จร → เรือน${s.house} ${s.houseZh} (ราศี${s.signTh} ${s.deg}°) · ${s.status}${s.retro ? " พักร์" : ""} · เทียบ命主=${s.relationToMing}`);
    }
    L.push("  [流月 太陽過宮 — ขอบเดือนสุริยคติจริง + ดาวเร็วรายเดือน]");
    for (const m of tl.months) {
      L.push(`  • เดือน${m.month}: ${m.fromISO} → ${m.toISO} · 日→เรือน${m.sunHouse} ${m.sunHouseZh} (${m.sunSignTh}) · ${m.fastStars.map((f) => `${f.zh}→เรือน${f.house}${f.houseZh}`).join(" · ")}`);
    }
    if (tl.hits.length) {
      L.push("  [วันแม่นดาวจรชนจุดสำคัญ (ทับ=同宮同度 · เล็ง=對照)]");
      for (const h of tl.hits) {
        L.push(`  • ${h.dateISO} (เดือน ${h.month}): ${h.starZh} ${h.starTh}จร ${h.aspect} ${h.target}${h.retro ? " ·พักร์" : ""} · ดาวนี้เทียบ命主=${h.relationToMing}`);
      }
    } else {
      L.push("  [วันแม่น] ไม่มี木土羅計火ชน命度/身度/命主ในปีนี้");
    }
  }
  if (p.notAvailable.length) L.push(`\nข้อมูลที่ยังไม่ได้คำนวณจริงใน packet นี้: ${p.notAvailable.join("、")} · 七政四餘 ไม่มี 四化(祿權科忌) แบบ紫微斗數; ถ้าจะพูดเรื่องดาวแปลง ให้ใช้คำว่า 化曜 และต้องมี field จริงเท่านั้น`);
  L.push(`\nสรุป engine: ${d.verdictTh} (ระดับ ${d.level})`);
  L.push(`\n⟦คำสั่ง⟧ คุณคือซินแส 七政四餘 (โหราศาสตร์ดาวจริงสายจีน/果老星宗) · อ่านเฉพาะจากผังนี้ · ใช้ศัพท์ 命宮/命主/命度/度主/身主/廟旺/恩用仇難/格局/เรือน12/行限/限度主/洞微百六限 · ห้ามใช้ศัพท์ปาจื้อ(用神十神), ฝรั่ง, หรือ紫微 四化(祿權科忌) · field ไหนไม่มีให้บอกว่าไม่มี ห้ามเดา · ไทยนำ`);
  return L.join("\n");
}
