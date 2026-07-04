/**
 * fusion5 · เฟส 6: ② คำถามข้ามหลายปี (ปีช่วง เช่น "2016-2026") + ① ชั้นเวลาโหมดดูคู่
 * แบบย่อ (compact) — คุมงบ prompt: ต่อปีเก็บเฉพาะเหตุการณ์น้ำหนักสูง · reuse timeline engine ที่ golden แล้วทั้งหมด
 * deterministic ล้วน · AI ห้ามเดาปี/เดือนนอกรายการ
 */
import { westernChart, type Gender } from "../astro/western/engine";
import { buildWesternTimeline } from "../astro/western/timeline";
import { vedicChart } from "../astro/vedic/engine";
import { buildVedicTimeline } from "../astro/vedic/timeline";
import { ziweiChart } from "../astro/ziwei/engine";
import { buildZiweiOverlay } from "../astro/ziwei/overlay";
import { qizhengNatal } from "../astro/qizheng/engine";
import { buildQizhengTimeline } from "../astro/qizheng/timeline";
import type { ScienceId } from "./disciplines";

export type FusionBirthLike = { name?: string; dtUTC: Date; lat: number; lng: number; hasTime: boolean; gender: Gender };

const MAX_RANGE_YEARS = 12;

/** จับ "ช่วงปี" จากคำถาม: 2016-2026 · 2016 ถึง 2026 · X ปีที่ผ่านมา/ข้างหน้า */
export function resolveFusionYearRange(question: string, now = new Date()): { startYear: number; endYear: number; label: string } | null {
  const text = String(question || "");
  const nowYear = new Date(now.getTime() + 7 * 3600 * 1000).getUTCFullYear();
  const normYear = (y: number) => (y > 2400 ? y - 543 : y); // พ.ศ. → ค.ศ.
  const m = text.match(/(?:^|[^\d])((?:19|20|25)\d{2})\s*(?:-|–|~|ถึง|จนถึง|ไปจนถึง|to)\s*((?:19|20|25)\d{2})(?:[^\d]|$)/i);
  if (m) {
    let a = normYear(+m[1]), b = normYear(+m[2]);
    if (a > b) [a, b] = [b, a];
    if (b - a >= 1 && b - a <= MAX_RANGE_YEARS) return { startYear: a, endYear: b, label: `ช่วงปีจากคำถาม ${a}-${b}` };
  }
  const back = text.match(/(\d{1,2})\s*ปีที่ผ่านมา|past\s+(\d{1,2})\s+years|last\s+(\d{1,2})\s+years/i);
  if (back) {
    const n = Math.min(MAX_RANGE_YEARS, +(back[1] || back[2] || back[3]));
    if (n >= 2) return { startYear: nowYear - n, endYear: nowYear, label: `${n} ปีที่ผ่านมา (${nowYear - n}-${nowYear})` };
  }
  const fwd = text.match(/(\d{1,2})\s*ปีข้างหน้า|next\s+(\d{1,2})\s+years/i);
  if (fwd) {
    const n = Math.min(MAX_RANGE_YEARS, +(fwd[1] || fwd[2]));
    if (n >= 2) return { startYear: nowYear, endYear: nowYear + n, label: `${n} ปีข้างหน้า (${nowYear}-${nowYear + n})` };
  }
  return null;
}

/** สรุปย่อรายปีของศาสตร์ที่เลือก (ต่อ 1 ดวง) — คุมขนาด ~2-5 บรรทัด/ปี */
export function renderMultiYearBlock(science: ScienceId, b: FusionBirthLike, startYear: number, endYear: number): string {
  // ยูเรเนียน (เฟส 1) = แผงอ่าน natal เท่านั้น · ยังไม่ทำชั้นเวลารายปี (roadmap เฟส 2) → ไม่ส่งบล็อก multi-year เปล่า
  if (science === "uranian") return "";
  const L: string[] = [];
  L.push(`=== MULTI_YEAR_TIMELINE ${startYear}-${endYear}${b.name ? ` · ${b.name}` : ""} (สรุปย่อรายปี · คำนวณจริงทุกปี · เวลาไทย) ===`);
  L.push("ใช้บล็อกนี้เทียบ 'ปีไหนหนัก/ปีไหนเบา' · รายละเอียดรายเดือนของปีเป้าหมายหลักอยู่ใน TIMING_TIMELINE ของผัง · ห้ามเดาปีนอกรายการ");
  try {
    if (science === "western") {
      const chart = westernChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender);
      for (let y = startYear; y <= endYear; y++) {
        const tl = buildWesternTimeline(chart, { dtUTC: b.dtUTC, lat: b.lat, lng: b.lng }, y);
        const hard = tl.transitHits.filter((h) => ["Saturn", "Pluto", "Uranus", "Neptune"].includes(h.transit) && ["conjunction", "opposition", "square"].includes(h.aspect) && ["Sun", "Moon", "Ascendant", "MC"].includes(h.natal));
        const ecl = tl.eclipses.filter((e) => e.hitNatal);
        const prof = tl.profection?.segments[1];
        L.push(`  ${y}: ดาวหนักชนจุดหลัก ${hard.length} ครั้ง${hard.length ? ` (${hard.slice(0, 4).map((h) => `${h.dateISO} ${h.transitTh}${h.aspectTh.split(" ")[0]}${h.natalTh}`).join(" · ")}${hard.length > 4 ? " …" : ""})` : ""}${ecl.length ? ` · คราสแตะดวง ${ecl.map((e) => `${e.dateISO}→${e.hitNatal!.nameTh}`).join(",")}` : ""}${prof ? ` · profection เรือน${prof.profectedHouse}(${prof.lordOfYearTh})` : ""}`);
      }
    } else if (science === "vedic") {
      const chart = vedicChart(b.dtUTC, b.lat, b.lng, b.hasTime, new Date(Date.UTC(endYear, 6, 1)));
      for (let y = startYear; y <= endYear; y++) {
        const tl = buildVedicTimeline(chart, y);
        const antars = [...new Set(tl.dashaTimeline.map((r) => `${r.mahaTh}–${r.antarTh}`))];
        const sat = tl.transitSegments.filter((s) => s.graha === "Saturn").map((s) => `เรือน${s.houseFromMoon}จากจันทร์`);
        const ss = tl.sadeSati.activeAnyTimeInYear ? " · SadeSati✔" : "";
        L.push(`  ${y}: ทศา ${antars.join(", ")} · เสาร์จร ${[...new Set(sat)].join("→")}${ss}`);
      }
    } else if (science === "ziwei") {
      for (let y = startYear; y <= endYear; y++) {
        const refDate = new Date(Date.UTC(y, 6, 1));
        const chart = ziweiChart(b.dtUTC, b.lat, b.lng, b.gender, b.hasTime, { refDate });
        if (!chart.liuNian) continue;
        const ov = buildZiweiOverlay(chart, b.dtUTC, Math.round(b.lng / 15), y);
        const ji = chart.liuNian.siHua.find((s) => s.type === "忌");
        L.push(`  ${y} (${chart.liuNian.ganzhi}): 流年命宮=${chart.liuNian.mingPalaceName} · 化忌→${ji?.star || "-"}@${ji?.palaceName || "-"}${ov?.currentDaXian ? ` · 大限${ov.currentDaXian.natalPalaceName}(${ov.currentDaXian.ageStart}-${ov.currentDaXian.ageEnd})` : ""}`);
      }
    } else if (science === "qizheng") {
      const natal = qizhengNatal(b.dtUTC, b.lat, b.lng, b.hasTime);
      if (natal.hasBirthTime) {
        for (let y = startYear; y <= endYear; y++) {
          const tl = buildQizhengTimeline(natal.reading, y, b.lat, b.lng);
          const jup = tl.liuNianStars.find((s) => s.key === "Jupiter"), sat = tl.liuNianStars.find((s) => s.key === "Saturn");
          const badHits = tl.hits.filter((h) => ["難星", "仇星"].includes(h.relationToMing));
          L.push(`  ${y}: 木→เรือน${jup?.house}${jup?.houseZh} · 土→เรือน${sat?.house}${sat?.houseZh}${badHits.length ? ` · ดาวร้ายชนจุดสำคัญ ${badHits.slice(0, 3).map((h) => `${h.dateISO} ${h.starZh}${h.aspect.slice(0, 3)}${h.target}`).join(" · ")}` : ""}`);
        }
      }
    }
  } catch {
    L.push("  (คำนวณ multi-year ไม่สำเร็จบางปี — ใช้ TIMING_TIMELINE ปีเป้าหมายหลักแทน)");
  }
  return L.join("\n");
}

/** ① PAIR_TIMING: ปฏิทินร่วมของคู่/กลุ่ม (2-4 ดวง) ในปีเป้าหมาย — เดือนไหนใครหนัก เดือนไหนชนกันหลายคน */
export function renderPairTimingBlock(science: ScienceId, births: FusionBirthLike[], targetYear: number): string {
  if (births.length < 2) return "";
  if (science === "uranian") return ""; // เฟส 1 ยูเรเนียน = แผงอ่าน natal · ยังไม่ทำชั้นเวลาคู่/กลุ่ม (roadmap เฟส 2)
  const group = births.length > 2;
  const L: string[] = [];
  L.push(`=== PAIR_TIMING_PACKET ปี ${targetYear} (จังหวะเวลาของ${group ? `ทั้งกลุ่ม ${births.length} ดวง` : "ทั้งคู่"} · คำนวณจริง · เวลาไทย) ===`);
  L.push(group
    ? `ใช้ตอบ 'ช่วงไหนเหมาะ/ไม่เหมาะสำหรับทั้งกลุ่ม' · เดือนที่มีแรงกดพร้อมกัน ≥2 คน = ช่วงต้องเลี่ยงเรื่องใหญ่ร่วมกัน · ห้ามเดาเดือนนอกรายการ`
    : "ใช้ตอบ 'ช่วงไหนเหมาะ/ไม่เหมาะสำหรับทั้งคู่' · เดือนที่ทั้งสองมีแรงกด = ช่วงต้องเลี่ยงเรื่องใหญ่ร่วมกัน · ห้ามเดาเดือนนอกรายการ");
  try {
    const monthEvents: Record<string, string[]>[] = births.map(() => ({}));
    births.forEach((b, i) => {
      const push = (month: number, label: string) => {
        const k = String(month);
        (monthEvents[i][k] ??= []).push(label);
      };
      if (science === "western") {
        const chart = westernChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender);
        const tl = buildWesternTimeline(chart, { dtUTC: b.dtUTC, lat: b.lat, lng: b.lng }, targetYear);
        for (const h of tl.transitHits.filter((x) => ["Saturn", "Pluto", "Uranus", "Neptune", "Mars"].includes(x.transit) && x.aspect !== "trine")) push(h.month, `${h.transitTh}${h.aspectTh.split(" ")[0]}${h.natalTh}(${h.dateISO})`);
        for (const e of tl.eclipses.filter((x) => x.hitNatal)) push(e.month, `คราสแตะ${e.hitNatal!.nameTh}(${e.dateISO})`);
      } else if (science === "vedic") {
        const chart = vedicChart(b.dtUTC, b.lat, b.lng, b.hasTime, new Date(Date.UTC(targetYear, 6, 1)));
        const tl = buildVedicTimeline(chart, targetYear);
        for (const r of tl.dashaTimeline) push(+r.fromISO.slice(5, 7), `เริ่ม${r.mahaTh}–${r.antarTh}–${r.pratyantarTh}(${r.fromISO})`);
        for (const p of tl.sadeSati.phases) push(+p.fromISO.slice(5, 7), `SadeSati:${p.phaseTh}`);
      } else if (science === "ziwei") {
        const chart = ziweiChart(b.dtUTC, b.lat, b.lng, b.gender, b.hasTime, { refDate: new Date(Date.UTC(targetYear, 6, 1)) });
        if (chart.liuYue) for (const m of chart.liuYue.monthPalaces) push(m.lunarMonth, `流月命宮=${m.mingPalaceName}`);
      } else if (science === "qizheng") {
        const natal = qizhengNatal(b.dtUTC, b.lat, b.lng, b.hasTime);
        if (natal.hasBirthTime) {
          const tl = buildQizhengTimeline(natal.reading, targetYear, b.lat, b.lng);
          for (const h of tl.hits) push(h.month, `${h.starZh}${h.aspect.slice(0, 3)}${h.target}(${h.dateISO})${["難星", "仇星"].includes(h.relationToMing) ? "⚠" : ""}`);
        }
      }
    });
    const nameOf = (i: number) => births[i].name || `คนที่${i + 1}`;
    // กลุ่ม >2 ดวง: จำกัด 2 เหตุการณ์/คน/เดือน คุมงบ prompt · 2 ดวงคง 3 เหตุการณ์เดิม (output เดิมไม่เปลี่ยน)
    const perPersonCap = group ? 2 : 3;
    for (let m = 1; m <= 12; m++) {
      const lists = births.map((_, i) => monthEvents[i][String(m)] || []);
      const activeCount = lists.filter((x) => x.length).length;
      if (!activeCount) continue;
      const clash = activeCount >= 2 ? (group ? ` ★ชนกัน ${activeCount} คน` : " ★ชนกันทั้งคู่") : "";
      const parts = lists
        .map((x, i) => (x.length ? `${nameOf(i)}: ${x.slice(0, perPersonCap).join(", ")}` : ""))
        .filter(Boolean);
      L.push(`  เดือน ${m}${clash}: ${parts.join(" · ")}`);
    }
    if (L.length === 2) L.push(`  (ปีนี้ไม่มีเหตุการณ์เด่นของ${group ? "ทั้งกลุ่ม" : "ทั้งคู่"}ในศาสตร์นี้ — อ่านจากพื้นดวง${group ? "ร่วม" : "คู่"}เป็นหลัก)`);
  } catch {
    L.push("  (คำนวณ pair timing ไม่สำเร็จ — ใช้ TIMING_TIMELINE รายคนแทน)");
  }
  return L.join("\n");
}
