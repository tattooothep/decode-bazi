/**
 * 紫微斗數 render · ไทยนำ · ⚠️ ศัพท์紫微เท่านั้น
 *   อนุญาต: 主星 / 輔星 / 四化(祿權科忌) / 十二宮 / 大限 / 廟旺利陷平 / 五行局 / 三方四正
 *   ห้ามปน: 用神/喜忌(ปาจื้อ) · 恩用仇難(七政) · ศัพท์ฝรั่ง(house/aspect/transit)
 * — Ziwei engine
 */

import type { ZiweiPacket } from "./packet";

const SIHUA_TH: Record<string, string> = {
  祿: "化祿", 權: "化權", 科: "化科", 忌: "化忌",
};

const PALACE_TH: Record<string, string> = {
  命宮: "เรือนชะตา (命宮)", 兄弟: "เรือนพี่น้อง (兄弟)", 夫妻: "เรือนคู่ครอง (夫妻)",
  子女: "เรือนบุตร (子女)", 財帛: "เรือนทรัพย์ (財帛)", 疾厄: "เรือนสุขภาพ (疾厄)",
  遷移: "เรือนโยกย้าย (遷移)", 僕役: "เรือนบริวาร (僕役)", 官祿: "เรือนการงาน (官祿)",
  田宅: "เรือนอสังหา (田宅)", 福德: "เรือนวาสนา (福德)", 父母: "เรือนบิดามารดา (父母)",
};

export function renderZiweiPrompt(packet: ZiweiPacket, lang: "th" | "zh" | "en" = "th"): string {
  if (lang === "zh") return renderZh(packet);
  if (lang === "en") return renderEn(packet);
  return renderTh(packet);
}

function renderTh(p: ZiweiPacket): string {
  const d = p.data;
  const L: string[] = [];
  L.push("【ผังดวง 紫微斗數 (จื่อเวยโต่วซู่)】");
  L.push(`ปฏิทินจันทรคติ: ปี ${d.lunar.year} เดือน ${d.lunar.month}${d.lunar.isLeapMonth ? " (เดือนอธิกมาส 閏月)" : ""} วันที่ ${d.lunar.day} · ปีนักษัตร ${d.yearGanzhi}`);

  if (p.degradeLevel === "minimal" || !p.hasBirthTime) {
    L.push("");
    L.push("⚠️ ไม่ทราบเวลาเกิด — ตั้ง命宮และจัดดาวลง十二宮ไม่ได้ (紫微斗數ต้องใช้ชั่วยามเกิด)");
    L.push("ข้อมูลที่ให้ได้: 四化 ของปีเกิดเท่านั้น (ขึ้นกับ年干)");
    L.push("");
    L.push("四化 ปีเกิด:");
    for (const s of d.siHua) L.push(`  · ${s.star} ${SIHUA_TH[s.type] || s.type}`);
    return L.join("\n");
  }

  L.push(`命宮: ${d.mingGong!.ganzhi} (${d.mingGong!.branch}) · 身宮: ${d.shenGong!.branch} · 五行局: ${d.wuxingJu!.name} · 紫微สถิตที่ ${d.ziweiBranch}`);
  L.push("");
  L.push("【十二宮 安星】");
  for (const pal of d.palaces) {
    const tag = pal.isShenGong ? " ★身宮" : "";
    const majors = pal.majorStars.length
      ? pal.majorStars.map((s) => `${s.name}(${s.brightness})${siHuaTag(pal, s.name)}`).join(" ")
      : "— (ไม่มี主星 · ยืมดาวจาก對宮)";
    const minors = pal.minorStars.length ? " · 輔煞: " + pal.minorStars.map((s) => s.name).join(" ") : "";
    L.push(`${PALACE_TH[pal.name] || pal.name} [${pal.ganzhi}]${tag} · 大限 ${pal.daXian.ageStart}-${pal.daXian.ageEnd} ปี`);
    L.push(`    主星: ${majors}${minors}`);
  }
  L.push("");
  L.push("【四化 ปีเกิด】");
  for (const s of d.siHua) {
    const loc = s.palaceName ? ` → ตกที่ ${PALACE_TH[s.palaceName] || s.palaceName}` : "";
    L.push(`  · ${s.star} ${SIHUA_TH[s.type] || s.type}${loc}`);
  }
  if (d.daXianSiHua?.length) {
    L.push("");
    L.push("【大限四化 ตาม宮干】");
    for (const dx of d.daXianSiHua) {
      L.push(`  · ${PALACE_TH[dx.palaceName] || dx.palaceName} ${dx.ageStart}-${dx.ageEnd} ปี [${dx.stem}${dx.branch}] → ${formatSiHuaList(dx.siHua)}`);
    }
  }
  if (d.sanFangSiZheng) {
    L.push("");
    L.push("【三方四正 ของ命宮】");
    for (const z of d.sanFangSiZheng) L.push(`  · ${z.relation}: ${PALACE_TH[z.palaceName] || z.palaceName} (${z.branch})`);
  }
  if (d.liuNian) {
    L.push("");
    L.push(`【流年 ${d.liuNian.year} · ${d.liuNian.ganzhi}】流年命宮 = ${PALACE_TH[d.liuNian.mingPalaceName] || d.liuNian.mingPalaceName} (${d.liuNian.mingBranch})`);
    L.push(`  · 流年四化: ${formatSiHuaList(d.liuNian.siHua)}`);
    if (d.liuNian.annualStars?.length) {
      L.push(`  · 流年星: ${d.liuNian.annualStars.map((s) => `${s.star}→${PALACE_TH[s.palaceName] || s.palaceName}(${s.branch})`).join("、")}`);
    }
  }
  if (d.liuYue) {
    L.push("");
    L.push(`【流月 ${d.liuYue.year} · เดือนจันทรคติ ${d.liuYue.lunarMonth}${d.liuYue.isLeapMonth ? "閏" : ""} · ${d.liuYue.ganzhi}】流月命宮 = ${PALACE_TH[d.liuYue.mingPalaceName] || d.liuYue.mingPalaceName} (${d.liuYue.mingBranch})`);
    L.push(`  · 流月四化: ${formatSiHuaList(d.liuYue.siHua)}`);
    if (d.liuYue.monthlyStars?.length) {
      L.push(`  · 流月星: ${d.liuYue.monthlyStars.map((s) => `${s.star}→${PALACE_TH[s.palaceName] || s.palaceName}(${s.branch})`).join("、")}`);
    }
    L.push(`  · 流月命宮 12 เดือน: ${d.liuYue.monthPalaces.map((m) => `${m.lunarMonth}:${PALACE_TH[m.mingPalaceName] || m.mingPalaceName}(${m.mingBranch})`).join(" · ")}`);
  }
  if (d.liuRi) {
    L.push("");
    L.push(`【流日 ${d.liuRi.dateISO} · วันจันทรคติ ${d.liuRi.lunarDay} · ${d.liuRi.ganzhi}】流日命宮 = ${PALACE_TH[d.liuRi.mingPalaceName] || d.liuRi.mingPalaceName} (${d.liuRi.mingBranch})`);
    L.push(`  · 流日四化: ${formatSiHuaList(d.liuRi.siHua)}`);
    if (d.liuRi.dailyStars?.length) {
      L.push(`  · 流日星: ${d.liuRi.dailyStars.map((s) => `${s.star}→${PALACE_TH[s.palaceName] || s.palaceName}(${s.branch})`).join("、")}`);
    }
  }
  // ── เฟส 3 OVERLAY: 大限ปัจจุบัน + 疊宮 + 自化 + 借星 + 流昌曲 ──
  const ov = d.overlay;
  if (ov) {
    L.push("");
    L.push(`【OVERLAY ปี ${ov.targetYear}】${ov.coverageNote}`);
    if (ov.currentDaXian) {
      L.push(`  · 大限ปัจจุบัน (虛歲 ${ov.age.xuSui}): เดิน大限ที่宮${PALACE_TH[ov.currentDaXian.natalPalaceName] || ov.currentDaXian.natalPalaceName} ${ov.currentDaXian.ganzhi} (อายุ ${ov.currentDaXian.ageStart}-${ov.currentDaXian.ageEnd}) → ใช้大限四化ชุด宮นี้เป็นแกนทศวรรษ`);
    } else {
      L.push(`  · 大限ปัจจุบัน: ยังไม่เข้า大限แรก (虛歲 ${ov.age.xuSui} · 童限)`);
    }
    L.push("  · 疊宮 (natal×大限×流年 ต่อ地支เดียวกัน — ใช้ดูเรื่องไหนถูกกระตุ้นซ้ำหลายชั้น):");
    for (const r of ov.dieGong) {
      L.push(`    ${r.branch}: natal=${PALACE_TH[r.natalName] || r.natalName}${r.daXianName ? ` · 大限=${PALACE_TH[r.daXianName] || r.daXianName}` : ""}${r.liuNianName ? ` · 流年=${PALACE_TH[r.liuNianName] || r.liuNianName}` : ""}${r.majorStars.length ? ` · ดาว: ${r.majorStars.join("、")}` : " · (宮ว่าง)"}`);
    }
    if (ov.ziHua.length) {
      L.push(`  · 自化: ${ov.ziHua.map((z) => `${PALACE_TH[z.palaceName] || z.palaceName}(${z.stem}${z.branch}) ${z.star}自化${z.type}`).join("、")}`);
    } else {
      L.push("  · 自化: ไม่มี宮ที่自化ในผังนี้");
    }
    if (ov.jieXing.length) {
      L.push(`  · 借星安星 (宮ว่างยืม對宮): ${ov.jieXing.map((j) => `${PALACE_TH[j.palaceName] || j.palaceName}(${j.branch})←ยืม ${j.stars.join("、")} จาก${j.borrowedFromBranch}`).join(" · ")}`);
    }
    if (ov.liuChangQu.length) {
      L.push(`  · 流昌流曲: ${ov.liuChangQu.map((s) => `${s.star}→${PALACE_TH[s.palaceName] || s.palaceName}(${s.branch})`).join("、")}`);
    }
  }

  if (p.notAvailable?.length) L.push(`ข้อมูลที่ยังไม่มีใน packet: ${p.notAvailable.join("、")}`);
  L.push("");
  L.push("หมายเหตุ: บรรยายตามผัง安星นี้เท่านั้น · ใช้ศัพท์紫微斗數 (主星/四化/大限/流年/流月/流日/廟旺) · ห้ามเดาดาวหรือตำแหน่งเพิ่ม");
  return L.join("\n");
}

function siHuaTag(pal: ZiweiPacket["data"]["palaces"][number], star: string): string {
  const s = pal.siHua.find((x) => x.star === star);
  return s ? `[${SIHUA_TH[s.type] || s.type}]` : "";
}

function formatSiHuaList(items: ZiweiPacket["data"]["siHua"]): string {
  return (items || []).map((s) => {
    const loc = s.palaceName ? `@${PALACE_TH[s.palaceName] || s.palaceName}` : "@ไม่พบตำแหน่งใน packet";
    return `${s.star}${SIHUA_TH[s.type] || s.type}${loc}`;
  }).join("、") || "—";
}

function renderZh(p: ZiweiPacket): string {
  const d = p.data;
  const L: string[] = [];
  L.push("【紫微斗數命盤】");
  L.push(`農曆 ${d.lunar.year}年${d.lunar.month}月${d.lunar.isLeapMonth ? "(閏)" : ""}${d.lunar.day}日 · ${d.yearGanzhi}年`);
  if (p.degradeLevel === "minimal" || !p.hasBirthTime) {
    L.push("⚠️ 無出生時辰，無法定命宮排盤。僅提供生年四化：");
    for (const s of d.siHua) L.push(`  · ${s.star}化${s.type}`);
    return L.join("\n");
  }
  L.push(`命宮 ${d.mingGong!.ganzhi} · 身宮 ${d.shenGong!.branch} · ${d.wuxingJu!.name} · 紫微在${d.ziweiBranch}`);
  for (const pal of d.palaces) {
    const majors = pal.majorStars.map((s) => `${s.name}(${s.brightness})${siHuaTag(pal, s.name)}`).join(" ") || "—";
    const minors = pal.minorStars.map((s) => s.name).join(" ");
    L.push(`${pal.name}[${pal.ganzhi}]${pal.isShenGong ? "(身)" : ""} 大限${pal.daXian.ageStart}-${pal.daXian.ageEnd}: ${majors}${minors ? " | " + minors : ""}`);
  }
  L.push("四化：" + d.siHua.map((s) => `${s.star}化${s.type}`).join("、"));
  if (d.daXianSiHua?.length) L.push("大限四化：" + d.daXianSiHua.map((dx) => `${dx.palaceName}${dx.ageStart}-${dx.ageEnd}[${dx.stem}${dx.branch}]:${dx.siHua.map((s) => `${s.star}化${s.type}`).join("、")}`).join("；"));
  if (d.liuNian) {
    L.push(`流年${d.liuNian.year}${d.liuNian.ganzhi}：命宮${d.liuNian.mingPalaceName}(${d.liuNian.mingBranch})`);
    L.push("流年四化：" + d.liuNian.siHua.map((s) => `${s.star}化${s.type}`).join("、"));
    L.push("流年星：" + d.liuNian.annualStars.map((s) => `${s.star}@${s.palaceName}`).join("、"));
  }
  if (d.liuYue) {
    L.push(`流月${d.liuYue.year}年${d.liuYue.lunarMonth}月${d.liuYue.ganzhi}：命宮${d.liuYue.mingPalaceName}(${d.liuYue.mingBranch})`);
    L.push("流月四化：" + d.liuYue.siHua.map((s) => `${s.star}化${s.type}`).join("、"));
    L.push("流月星：" + d.liuYue.monthlyStars.map((s) => `${s.star}@${s.palaceName}`).join("、"));
  }
  if (d.liuRi) {
    L.push(`流日${d.liuRi.dateISO}${d.liuRi.ganzhi}：命宮${d.liuRi.mingPalaceName}(${d.liuRi.mingBranch})`);
    L.push("流日四化：" + d.liuRi.siHua.map((s) => `${s.star}化${s.type}`).join("、"));
    L.push("流日星：" + d.liuRi.dailyStars.map((s) => `${s.star}@${s.palaceName}`).join("、"));
  }
  if (p.notAvailable?.length) L.push("未提供：" + p.notAvailable.join("、"));
  return L.join("\n");
}

function renderEn(p: ZiweiPacket): string {
  const d = p.data;
  const L: string[] = [];
  L.push("[Zi Wei Dou Shu chart]");
  L.push(`Lunar ${d.lunar.year} month ${d.lunar.month}${d.lunar.isLeapMonth ? " (leap)" : ""} day ${d.lunar.day} · year ${d.yearGanzhi}`);
  if (p.degradeLevel === "minimal" || !p.hasBirthTime) {
    L.push("No birth time — Life Palace cannot be set. Year Si Hua only:");
    for (const s of d.siHua) L.push(`  · ${s.star} ${s.type}`);
    return L.join("\n");
  }
  L.push(`Life Palace ${d.mingGong!.ganzhi} · Body ${d.shenGong!.branch} · ${d.wuxingJu!.name} · Ziwei in ${d.ziweiBranch}`);
  for (const pal of d.palaces) {
    const majors = pal.majorStars.map((s) => `${s.name}(${s.brightness})${siHuaTag(pal, s.name)}`).join(" ") || "—";
    L.push(`${pal.name}[${pal.ganzhi}]${pal.isShenGong ? "(Body)" : ""} decade ${pal.daXian.ageStart}-${pal.daXian.ageEnd}: ${majors}`);
  }
  if (d.daXianSiHua?.length) {
    L.push("Decade transformations: " + d.daXianSiHua.map((dx) => `${dx.palaceName} ${dx.ageStart}-${dx.ageEnd}[${dx.stem}${dx.branch}]: ${dx.siHua.map((s) => `${s.star}${s.type}`).join(", ")}`).join("; "));
  }
  if (d.liuNian) {
    L.push(`Annual ${d.liuNian.year} ${d.liuNian.ganzhi}: annual Life Palace ${d.liuNian.mingPalaceName} (${d.liuNian.mingBranch})`);
    L.push("Annual transformations: " + d.liuNian.siHua.map((s) => `${s.star}${s.type}`).join(", "));
    L.push("Annual stars: " + d.liuNian.annualStars.map((s) => `${s.star}@${s.palaceName}`).join(", "));
  }
  if (d.liuYue) {
    L.push(`Monthly ${d.liuYue.year} lunar month ${d.liuYue.lunarMonth} ${d.liuYue.ganzhi}: monthly Life Palace ${d.liuYue.mingPalaceName} (${d.liuYue.mingBranch})`);
    L.push("Monthly transformations: " + d.liuYue.siHua.map((s) => `${s.star}${s.type}`).join(", "));
    L.push("Monthly stars: " + d.liuYue.monthlyStars.map((s) => `${s.star}@${s.palaceName}`).join(", "));
  }
  if (d.liuRi) {
    L.push(`Daily ${d.liuRi.dateISO} ${d.liuRi.ganzhi}: daily Life Palace ${d.liuRi.mingPalaceName} (${d.liuRi.mingBranch})`);
    L.push("Daily transformations: " + d.liuRi.siHua.map((s) => `${s.star}${s.type}`).join(", "));
    L.push("Daily stars: " + d.liuRi.dailyStars.map((s) => `${s.star}@${s.palaceName}`).join(", "));
  }
  if (p.notAvailable?.length) L.push("Not available in packet: " + p.notAvailable.join(", "));
  return L.join("\n");
}
