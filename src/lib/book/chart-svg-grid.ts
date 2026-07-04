/**
 * chart-svg-grid.ts · "ภาพพื้นดวงสะอาด" 3 ศาสตร์ (สำหรับหนังสือคัมภีร์ชะตา)
 *
 * ส่งออก 3 ฟังก์ชัน คืน inline SVG string (deterministic · ไม่มี <script> ·
 * ไม่มี external asset · พื้นหลังโปร่ง เหมาะพิมพ์ PDF · theme-neutral):
 *   - baziChartSvg(birth)  → ตารางปาจื้อ 八字 (4 คอลัมน์ × 天干/地支/藏干 · ลงสีธาตุ)
 *   - ziweiChartSvg(birth) → ผัง 12 宮 จื่อเวย 紫微 (4×4 fixed-branch · ไฮไลต์ 命宮)
 *   - vedicChartSvg(birth) → ผัง South Indian 12 เรือน (fixed-sign · ไฮไลต์ลัคน์)
 *
 * ⚠️ ไฟล์นี้ additive/isolated · import engine อ่านอย่างเดียว (ห้ามแก้ engine/route/html)
 * ⚠️ ปาจื้อ: mirror ตรรกะ 4p/3p ของ src/lib/bazi-calc.ts (Layer 0-1: applyTST + tyme4ts)
 *    แบบ synchronous เพื่อให้เข้าสัญญา sync-return-string · ผ่าน golden Aeaw/Mai
 */

import { SolarTime } from "tyme4ts";
import { applyTST } from "../tyme-tst";
import { ziweiChart } from "../astro/ziwei/engine";
import { vedicChart } from "../astro/vedic/engine";
import { GRAHA_TH, RASHI_TH, type GrahaKey } from "../astro/vedic/tables";
import {
  STEM_ELEMENT,
  ELEMENT_ZH,
  HIDDEN_STEMS,
  type BaziElement,
} from "../bazi-stem-strength";

/* ───────────────────────── สัญญา input ───────────────────────── */
export interface BookBirth {
  dtUTC: Date;
  lat: number;
  lng: number;
  hasTime: boolean;
  gender: string;
}

/* ───────────────────────── util พื้นฐาน ───────────────────────── */

/** escape ข้อความก่อนยัดใน SVG (กัน XSS · & < > " ') */
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** map gender string → "M" | "F" (สอดคล้องกฎ r105: charAt(0)==='f' → F) */
function normGender(g: string): "M" | "F" {
  return String(g || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M";
}

/** เขตเวลามาตรฐานจากลองจิจูด (เดียวกับ ziwei/vedic engine: round(lng/15)) */
function stdOffset(lng: number): number {
  return Math.round(lng / 15);
}

/** เวลาท้องถิ่น (civil) จาก dtUTC + offset ชั่วโมง */
function localCivil(dtUTC: Date, gmtOffsetHours: number) {
  const d = new Date(dtUTC.getTime() + gmtOffsetHours * 3_600_000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
  };
}

const FONT = "'Noto Sans Thai', system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_CJK = "'Noto Serif SC', 'Songti SC', 'Noto Sans CJK SC', serif";

/* สีธาตุ (จาก public/chart.html · opaque bg เพื่อพิมพ์บนพื้นขาว/PDF ได้) */
const ELEMENT_COLORS: Record<BaziElement, { main: string; deep: string; bg: string }> = {
  wood: { main: "#8fc37c", deep: "#3f6b2f", bg: "#eaf4e4" },
  fire: { main: "#e26b5d", deep: "#b03a2e", bg: "#fbe8e5" },
  earth: { main: "#d4a85a", deep: "#8a6d2a", bg: "#f7efdd" },
  metal: { main: "#c8b88a", deep: "#9a8e6a", bg: "#f5f1e5" },
  water: { main: "#7ba8c8", deep: "#3a5a72", bg: "#e6eef5" },
};

/** ธาตุของกิ่งดิน (地支) · เดียวกับ chart.html BRANCH_EL */
const BRANCH_ELEMENT: Record<string, BaziElement> = {
  子: "water", 丑: "earth", 寅: "wood", 卯: "wood", 辰: "earth", 巳: "fire",
  午: "fire", 未: "earth", 申: "metal", 酉: "metal", 戌: "earth", 亥: "water",
};

const ELEMENT_TH: Record<BaziElement, string> = {
  wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ",
};

function stemColor(stem: string) {
  const el = STEM_ELEMENT[stem];
  return el ? ELEMENT_COLORS[el] : ELEMENT_COLORS.earth;
}
function branchColor(branch: string) {
  const el = BRANCH_ELEMENT[branch];
  return el ? ELEMENT_COLORS[el] : ELEMENT_COLORS.earth;
}

/* helper สร้าง element SVG */
function rect(x: number, y: number, w: number, h: number, opt: {
  fill?: string; stroke?: string; sw?: number; rx?: number;
} = {}): string {
  const { fill = "none", stroke = "#c9c2b4", sw = 1, rx = 8 } = opt;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}
function text(x: number, y: number, s: string, opt: {
  size?: number; fill?: string; anchor?: string; weight?: number | string; font?: string; opacity?: number;
} = {}): string {
  const { size = 14, fill = "#3a3630", anchor = "middle", weight = 400, font = FONT, opacity = 1 } = opt;
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}">${esc(s)}</text>`;
}

function svgWrap(vb: number, inner: string, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}" width="100%" role="img" aria-label="${esc(title)}" font-family="${FONT}">${inner}</svg>`;
}

/* ───────────────────────── ปาจื้อ 八字 ───────────────────────── */

type Pillar4 = { stem: string; branch: string };
type BaziGrid = {
  year: Pillar4; month: Pillar4; day: Pillar4;
  hour: Pillar4 | null; hasTime: boolean; dayMaster: string;
};

/**
 * คำนวณ 4 เสา แบบ synchronous · mirror bazi-calc.ts (4p: TST+tyme4ts · 3p: noon anchor)
 * ⚠️ อ่านตรรกะจาก Layer 0-1 มา reuse เท่านั้น (ไม่แก้ engine) · golden Aeaw 甲子/丙子/己亥/庚午
 */
function computeBaziGrid(birth: BookBirth): BaziGrid {
  const offset = stdOffset(birth.lng);
  const loc = localCivil(birth.dtUTC, offset);

  if (!birth.hasTime) {
    // 3p: noon anchor (ทิ้ง hour · honest null) — mirror bazi-calc 3-pillar path
    const st = SolarTime.fromYmdHms(loc.y, loc.m, loc.d, 12, 0, 0);
    const ec = st.getLunarHour().getEightChar();
    const yp = ec.getYear().getName();
    const mp = ec.getMonth().getName();
    const dp = ec.getDay().getName();
    return {
      year: { stem: yp[0], branch: yp[1] },
      month: { stem: mp[0], branch: mp[1] },
      day: { stem: dp[0], branch: dp[1] },
      hour: null,
      hasTime: false,
      dayMaster: dp[0],
    };
  }

  // 4p: apply TST (default useTst=true · dayBoundary 23:00) — mirror bazi-calc 4-pillar path
  const tst = applyTST({
    year: loc.y, month: loc.m, day: loc.d, hour: loc.h, minute: loc.mi,
    longitude: birth.lng, gmtOffsetHours: offset,
  });
  let sy = loc.y, sm = loc.m, sd = loc.d;
  if (tst.appliedDayShift !== 0) {
    const shifted = new Date(Date.UTC(loc.y, loc.m - 1, loc.d + tst.appliedDayShift, 12, 0, 0));
    sy = shifted.getUTCFullYear(); sm = shifted.getUTCMonth() + 1; sd = shifted.getUTCDate();
  }
  const st = SolarTime.fromYmdHms(sy, sm, sd, tst.appliedHour, tst.appliedMinute, 0);
  const ec = st.getLunarHour().getEightChar();
  const yp = ec.getYear().getName();
  const mp = ec.getMonth().getName();
  const dp = ec.getDay().getName();
  const hp = ec.getHour().getName();
  return {
    year: { stem: yp[0], branch: yp[1] },
    month: { stem: mp[0], branch: mp[1] },
    day: { stem: dp[0], branch: dp[1] },
    hour: { stem: hp[0], branch: hp[1] },
    hasTime: true,
    dayMaster: dp[0],
  };
}

/** ปาจื้อ 八字 · 4 คอลัมน์ (ปี/เดือน/วัน/ยาม) × 天干/地支/藏干 · ลงสีธาตุ */
export function baziChartSvg(birth: BookBirth): string {
  const g = computeBaziGrid(birth);
  const VB = 600;
  const cols: { key: string; th: string; zh: string; p: Pillar4 | null }[] = [
    { key: "year", th: "ปี", zh: "年", p: g.year },
    { key: "month", th: "เดือน", zh: "月", p: g.month },
    { key: "day", th: "วัน", zh: "日", p: g.day },
    { key: "hour", th: "ยาม", zh: "時", p: g.hour },
  ];

  const startX = 26;
  const labelW = 92;
  const colW = 118; // 26 + 92 + 4*118 = 590
  const dataX0 = startX + labelW;

  const headerY = 74;   // แถบหัวคอลัมน์
  const rowH = 150;
  const rowTop = 96;    // เริ่มแถวข้อมูลแถวแรก
  const rows = [
    { th: "ก้านฟ้า", zh: "天干" },
    { th: "กิ่งดิน", zh: "地支" },
    { th: "ก้านแฝง", zh: "藏干" },
  ];

  const parts: string[] = [];
  // พื้นหลังขาว (ยังคงพิมพ์ PDF ได้ · ถ้าต้องการโปร่งให้ผู้เรียกถอด rect นี้)
  parts.push(`<rect x="0" y="0" width="${VB}" height="${VB}" fill="#ffffff"/>`);

  // หัวเรื่อง
  parts.push(text(VB / 2, 40, "八字 · ผังพื้นปาจื้อ", { size: 26, weight: 700, fill: "#4a4436", font: FONT_CJK }));
  parts.push(text(VB / 2, 60, `ธาตุประจำวัน (日主): ${g.dayMaster} ${ELEMENT_ZH[STEM_ELEMENT[g.dayMaster]] || ""} · ${ELEMENT_TH[STEM_ELEMENT[g.dayMaster]] || ""}`, { size: 13, fill: "#7a7364" }));

  // หัวคอลัมน์
  cols.forEach((c, i) => {
    const cx = dataX0 + i * colW + colW / 2;
    parts.push(text(cx, headerY, `${c.th}`, { size: 15, weight: 700, fill: "#4a4436" }));
    parts.push(text(cx, headerY + 15, c.zh, { size: 12, fill: "#9a9384", font: FONT_CJK }));
  });

  // ป้ายแถว (ซ้าย)
  rows.forEach((r, ri) => {
    const cy = rowTop + ri * rowH + rowH / 2;
    parts.push(text(startX + labelW - 12, cy - 6, r.th, { size: 14, weight: 600, fill: "#5a5446", anchor: "end" }));
    parts.push(text(startX + labelW - 12, cy + 12, r.zh, { size: 12, fill: "#9a9384", anchor: "end", font: FONT_CJK }));
  });

  // เซลล์ข้อมูล
  cols.forEach((c, ci) => {
    const x = dataX0 + ci * colW + 6;
    const w = colW - 12;

    // ── 天干 (ก้านฟ้า) ──
    {
      const y = rowTop + 6, h = rowH - 12;
      const cx = x + w / 2, cyBase = y + h / 2;
      if (!c.p) {
        parts.push(rect(x, y, w, h, { fill: "#f3f0ea", stroke: "#d8d2c4", rx: 12 }));
        parts.push(text(cx, cyBase + 14, "?", { size: 46, weight: 700, fill: "#b8b1a2", font: FONT_CJK }));
      } else {
        const col = stemColor(c.p.stem);
        const el = STEM_ELEMENT[c.p.stem];
        parts.push(rect(x, y, w, h, { fill: col.bg, stroke: col.main, sw: 1.6, rx: 12 }));
        parts.push(text(cx, cyBase + 4, c.p.stem, { size: 54, weight: 700, fill: col.deep, font: FONT_CJK }));
        parts.push(text(cx, y + h - 20, `${ELEMENT_TH[el]} · ${ELEMENT_ZH[el]}`, { size: 12, fill: col.deep }));
      }
    }

    // ── 地支 (กิ่งดิน) ──
    {
      const y = rowTop + rowH + 6, h = rowH - 12;
      const cx = x + w / 2, cyBase = y + h / 2;
      if (!c.p) {
        parts.push(rect(x, y, w, h, { fill: "#f3f0ea", stroke: "#d8d2c4", rx: 12 }));
        parts.push(text(cx, cyBase + 14, "?", { size: 46, weight: 700, fill: "#b8b1a2", font: FONT_CJK }));
      } else {
        const col = branchColor(c.p.branch);
        const el = BRANCH_ELEMENT[c.p.branch];
        parts.push(rect(x, y, w, h, { fill: col.bg, stroke: col.main, sw: 1.6, rx: 12 }));
        parts.push(text(cx, cyBase + 4, c.p.branch, { size: 54, weight: 700, fill: col.deep, font: FONT_CJK }));
        parts.push(text(cx, y + h - 20, `${ELEMENT_TH[el]} · ${ELEMENT_ZH[el]}`, { size: 12, fill: col.deep }));
      }
    }

    // ── 藏干 (ก้านแฝง) ──
    {
      const y = rowTop + 2 * rowH + 6, h = rowH - 12;
      const cx = x + w / 2;
      parts.push(rect(x, y, w, h, { fill: "#faf8f4", stroke: "#d8d2c4", rx: 12 }));
      const hidden = c.p ? (HIDDEN_STEMS[c.p.branch] || []) : [];
      if (!c.p) {
        parts.push(text(cx, y + h / 2 + 6, "?", { size: 30, weight: 700, fill: "#b8b1a2", font: FONT_CJK }));
      } else {
        const n = hidden.length || 1;
        const gap = Math.min(40, (h - 30) / n);
        const startYY = y + h / 2 - ((n - 1) * gap) / 2;
        hidden.forEach((hs, hi) => {
          const col = stemColor(hs);
          const yy = startYY + hi * gap;
          parts.push(text(cx - 14, yy + 7, hs, { size: 24, weight: 700, fill: col.deep, font: FONT_CJK }));
          parts.push(text(cx + 16, yy + 6, ELEMENT_TH[STEM_ELEMENT[hs]], { size: 12, fill: col.deep, anchor: "start" }));
        });
      }
    }
  });

  return svgWrap(VB, parts.join(""), "ผังพื้นปาจื้อ 八字");
}

/* ───────────────────────── จื่อเวย 紫微 命盤 ───────────────────────── */

/* ตำแหน่งกิ่ง (地支) บนตาราง 4×4 มาตรฐานจื่อเวย (寅 มุมล่างซ้าย · เดินตามเข็ม)
 *   巳 午 未 申
 *   辰       酉
 *   卯       戌
 *   寅 丑 子 亥
 * ค่า = [col, row] (col 0=ซ้าย, row 0=บน) */
const ZIWEI_BRANCH_CELL: Record<string, [number, number]> = {
  巳: [0, 0], 午: [1, 0], 未: [2, 0], 申: [3, 0],
  辰: [0, 1], 酉: [3, 1],
  卯: [0, 2], 戌: [3, 2],
  寅: [0, 3], 丑: [1, 3], 子: [2, 3], 亥: [3, 3],
};

/** จื่อเวย 紫微 · 12 宮 (4×4 fixed-branch · เว้นกลาง) · ไฮไลต์ 命宮 · แสดง 主星 */
export function ziweiChartSvg(birth: BookBirth): string {
  const chart = ziweiChart(
    birth.dtUTC, birth.lat, birth.lng, normGender(birth.gender), birth.hasTime,
    { gmtOffsetHours: stdOffset(birth.lng) },
  );
  const VB = 600;
  const pad = 18;
  const cell = (VB - pad * 2) / 4; // ขนาดช่อง
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${VB}" height="${VB}" fill="#ffffff"/>`);

  const cellXY = (col: number, row: number) => ({ x: pad + col * cell, y: pad + row * cell });

  // แผงกลาง 2×2
  const c0 = cellXY(1, 1);
  const cw = cell * 2;
  parts.push(rect(c0.x, c0.y, cw, cw, { fill: "#faf7f1", stroke: "#d8cfb8", sw: 1.4, rx: 10 }));
  const midX = c0.x + cw / 2;
  parts.push(text(midX, c0.y + 40, "紫微斗數", { size: 26, weight: 700, fill: "#4a4436", font: FONT_CJK }));
  parts.push(text(midX, c0.y + 62, "命盤 · ผังพื้นจื่อเวย", { size: 13, fill: "#7a7364" }));
  if (chart.hasTime && chart.mingGong && chart.wuxingJu) {
    parts.push(text(midX, c0.y + cw / 2 + 6, `五行局: ${chart.wuxingJu.name}`, { size: 15, weight: 600, fill: "#5a5446", font: FONT_CJK }));
    parts.push(text(midX, c0.y + cw / 2 + 30, `命宮 ${chart.mingGong.ganzhi}`, { size: 15, weight: 600, fill: "#8a6d2a", font: FONT_CJK }));
    parts.push(text(midX, c0.y + cw - 46, `ปีเกิด ${chart.yearStem}${chart.yearBranch} · ยาม ${chart.hourBranch ?? "?"}`, { size: 12, fill: "#7a7364", font: FONT_CJK }));
    parts.push(text(midX, c0.y + cw - 26, `เพศ ${normGender(birth.gender) === "F" ? "หญิง" : "ชาย"}`, { size: 12, fill: "#7a7364" }));
  } else {
    parts.push(text(midX, c0.y + cw / 2 + 8, "ไม่ทราบเวลาเกิด", { size: 14, weight: 600, fill: "#b03a2e" }));
    parts.push(text(midX, c0.y + cw / 2 + 30, "ตั้ง 12 宮 ไม่ได้", { size: 12, fill: "#7a7364" }));
  }

  // วาดช่องกิ่งดิน 12 ช่อง
  const BRANCHES12 = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  for (const branch of BRANCHES12) {
    const [col, row] = ZIWEI_BRANCH_CELL[branch];
    const { x, y } = cellXY(col, row);
    const pal = chart.palaces.find((p) => p.branch === branch) || null;
    const isMing = pal?.name === "命宮";
    const isShen = pal?.isShenGong;
    parts.push(rect(x + 2, y + 2, cell - 4, cell - 4, {
      fill: isMing ? "#f7efdd" : "#ffffff",
      stroke: isMing ? "#d4a85a" : "#d8d2c4",
      sw: isMing ? 2.2 : 1,
      rx: 8,
    }));

    // กิ่งดิน + ก้าน (มุมล่างซ้าย)
    parts.push(text(x + 10, y + cell - 12, `${pal ? pal.stem : ""}${branch}`, { size: 13, weight: 600, fill: "#9a9384", anchor: "start", font: FONT_CJK }));
    // ชื่อเรือน (มุมล่างขวา)
    if (pal) {
      parts.push(text(x + cell - 10, y + cell - 12, pal.name, { size: 13, weight: 700, fill: isMing ? "#8a6d2a" : "#5a5446", anchor: "end", font: FONT_CJK }));
      // 大限 ช่วงอายุ (มุมบนขวา)
      parts.push(text(x + cell - 10, y + 20, `${pal.daXian.ageStart}-${pal.daXian.ageEnd}`, { size: 10, fill: "#b0a897", anchor: "end" }));
      if (isShen) parts.push(text(x + 10, y + 20, "身", { size: 12, weight: 700, fill: "#b03a2e", anchor: "start", font: FONT_CJK }));
      // 主星 (แถวกลาง · เรียงลง)
      const majors = pal.majorStars;
      if (majors.length) {
        const gap = Math.min(26, (cell - 56) / majors.length);
        const sy0 = y + cell / 2 - ((majors.length - 1) * gap) / 2 - 2;
        majors.forEach((s, si) => {
          const bright = s.brightness ? `·${s.brightness}` : "";
          parts.push(text(x + cell / 2, sy0 + si * gap, `${s.name}${bright}`, { size: 15, weight: 700, fill: "#4a4436", font: FONT_CJK }));
        });
      } else {
        parts.push(text(x + cell / 2, y + cell / 2, "—", { size: 14, fill: "#c9c2b4" }));
      }
    }
  }

  return svgWrap(VB, parts.join(""), "ผังพื้นจื่อเวย 紫微命盤");
}

/* ───────────────────────── แขก Vedic · South Indian ───────────────────────── */

/* ตำแหน่งราศี (rashi 0=เมษ) บนตาราง South Indian 4×4 (มีน มุมบนซ้าย · เดินตามเข็ม)
 *   มีน(11) เมษ(0)  พฤษภ(1) เมถุน(2)
 *   กุมภ์(10)              กรกฎ(3)
 *   มังกร(9)               สิงห์(4)
 *   ธนู(8)  พิจิก(7) ตุล(6) กันย์(5)
 * ค่า = [col, row] */
const VEDIC_RASHI_CELL: Record<number, [number, number]> = {
  11: [0, 0], 0: [1, 0], 1: [2, 0], 2: [3, 0],
  10: [0, 1], 3: [3, 1],
  9: [0, 2], 4: [3, 2],
  8: [0, 3], 7: [1, 3], 6: [2, 3], 5: [3, 3],
};

/* อักษรย่อไทยของกราหะ */
const GRAHA_ABBR: Record<GrahaKey, string> = {
  Sun: "อา", Moon: "จ", Mars: "อ", Mercury: "พ", Jupiter: "พฤ",
  Venus: "ศ", Saturn: "ส", Rahu: "ราหู", Ketu: "เกตุ",
};

/** Vedic · ผัง South Indian 12 เรือน (fixed-sign) · กราหะ sidereal · ไฮไลต์ลัคน์ */
export function vedicChartSvg(birth: BookBirth): string {
  const chart = vedicChart(birth.dtUTC, birth.lat, birth.lng, birth.hasTime);
  const VB = 600;
  const pad = 18;
  const cell = (VB - pad * 2) / 4;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${VB}" height="${VB}" fill="#ffffff"/>`);

  const cellXY = (col: number, row: number) => ({ x: pad + col * cell, y: pad + row * cell });
  const lagnaRashi = chart.lagna ? chart.lagna.rashi : null;

  // จัดกลุ่มกราหะตามราศี
  const byRashi = new Map<number, string[]>();
  for (const gr of chart.grahas) {
    const abbr = GRAHA_ABBR[gr.name] + (gr.retro ? "℞" : "");
    const arr = byRashi.get(gr.rashi) || [];
    arr.push(abbr);
    byRashi.set(gr.rashi, arr);
  }

  // แผงกลาง 2×2
  const c0 = cellXY(1, 1);
  const cw = cell * 2;
  parts.push(rect(c0.x, c0.y, cw, cw, { fill: "#faf7f1", stroke: "#d8cfb8", sw: 1.4, rx: 10 }));
  const midX = c0.x + cw / 2;
  parts.push(text(midX, c0.y + 40, "โหราศาสตร์พระเวท", { size: 22, weight: 700, fill: "#4a4436" }));
  parts.push(text(midX, c0.y + 62, "Vedic · ผัง South Indian", { size: 13, fill: "#7a7364" }));
  if (chart.hasTime && chart.lagna) {
    parts.push(text(midX, c0.y + cw / 2 + 8, `ลัคน์ (Lagna): ${RASHI_TH[chart.lagna.rashi]}`, { size: 15, weight: 600, fill: "#8a6d2a" }));
    parts.push(text(midX, c0.y + cw / 2 + 32, `ฤกษ์จันทร์: ${chart.moonNakshatra.name}`, { size: 12, fill: "#7a7364" }));
  } else {
    parts.push(text(midX, c0.y + cw / 2 + 8, "ไม่ทราบเวลาเกิด", { size: 14, weight: 600, fill: "#b03a2e" }));
    parts.push(text(midX, c0.y + cw / 2 + 30, "ตั้งลัคน์/เรือนไม่ได้ (แสดงราศีกราหะ)", { size: 11, fill: "#7a7364" }));
  }

  // วาด 12 ช่องราศี
  for (let rashi = 0; rashi < 12; rashi++) {
    const [col, row] = VEDIC_RASHI_CELL[rashi];
    const { x, y } = cellXY(col, row);
    const isLagna = lagnaRashi === rashi;
    parts.push(rect(x + 2, y + 2, cell - 4, cell - 4, {
      fill: isLagna ? "#f7efdd" : "#ffffff",
      stroke: isLagna ? "#d4a85a" : "#d8d2c4",
      sw: isLagna ? 2.2 : 1,
      rx: 8,
    }));

    // ชื่อราศี (มุมบนซ้าย)
    parts.push(text(x + 10, y + 20, RASHI_TH[rashi], { size: 12, weight: 600, fill: "#9a9384", anchor: "start" }));
    // เลขเรือน (มุมบนขวา · เมื่อมีลัคน์)
    if (lagnaRashi !== null) {
      const house = ((rashi - lagnaRashi + 12) % 12) + 1;
      parts.push(text(x + cell - 10, y + 20, `${house}`, { size: 12, weight: 700, fill: isLagna ? "#8a6d2a" : "#b0a897", anchor: "end" }));
    }
    // ป้ายลัคน์
    if (isLagna) parts.push(text(x + 10, y + cell - 12, "ลัคน์", { size: 11, weight: 700, fill: "#b03a2e", anchor: "start" }));

    // กราหะในราศี (แถวกลาง)
    const gs = byRashi.get(rashi) || [];
    if (gs.length) {
      // จัด 2 คอลัมน์ถ้าเยอะ
      const perLine = gs.length > 3 ? Math.ceil(gs.length / 2) : gs.length;
      const lines: string[] = [];
      for (let i = 0; i < gs.length; i += perLine) lines.push(gs.slice(i, i + perLine).join("  "));
      const gap = 22;
      const sy0 = y + cell / 2 - ((lines.length - 1) * gap) / 2 + 2;
      lines.forEach((ln, li) => {
        parts.push(text(x + cell / 2, sy0 + li * gap, ln, { size: 15, weight: 700, fill: "#4a4436" }));
      });
    }
  }

  return svgWrap(VB, parts.join(""), "ผังพื้นโหราศาสตร์พระเวท South Indian");
}
