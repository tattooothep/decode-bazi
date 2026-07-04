/**
 * ภาพพื้นดวง "สะอาด" แบบวงล้อ 3 ศาสตร์ (Clean natal wheels · หนังสือคัมภีร์ชะตา)
 * ════════════════════════════════════════════════════════════════════════════
 * คืนค่าเป็น inline SVG string (viewBox สี่เหลี่ยมจัตุรัส · พื้นโปร่ง = พิมพ์ PDF บนขาวได้ ·
 * theme-neutral · ไม่มี <script> · ไม่มี external asset) เพื่อฝังตรงในหน้าหนังสือ/หน้าเว็บ
 *
 * ⚠️ ไฟล์นี้ "อ่าน" engine อย่างเดียว — เรียก westernChart / qizhengNatal / uranianChart แล้ววาด
 *    ไม่แตะ engine/route/html/ไฟล์อื่น · additive · deterministic (ไม่มี Date.now/Math.random)
 *
 * 3 ผังวงล้อ (contract):
 *   - westernChartSvg  : วงกลม 12 ราศี (tropical) + ดาว 10 + ราหู/เกตุ + แกน Asc/MC + เส้นแอสเปกต์เบา
 *   - qizhengChartSvg  : วงล้อ 七政四餘 (sidereal · ดาวจริง 7 + 四餘) + เรือน命宮 สไตล์จีน
 *   - uranianChartSvg  : หน้าปัด 90° (dial 90°) — ดาววางที่ dial90×4 เห็นภาพดาว (Planetenbild) ทับมุมแข็ง
 *
 * แนว polar/arc: reuse จาก public/uranian.html (dial 90°) + public/tianxing.html (zodiac wheel)
 */
import { westernChart } from "../astro/western/engine";
import { qizhengNatal } from "../astro/qizheng/engine";
import { uranianChart } from "../astro/uranian/engine";

/** ข้อมูลเกิด (contract — เรียกตามนี้เป๊ะ) */
export type Birth = {
  dtUTC: Date;
  lat: number;
  lng: number;
  hasTime: boolean;
  gender: string;
};

/* ─────────────────────────── helper ทั่วไป ─────────────────────────── */

const VB = 600;              // viewBox สี่เหลี่ยมจัตุรัส 600×600
const CX = 300, CY = 300;    // จุดศูนย์กลาง

const norm360 = (d: number) => ((d % 360) + 360) % 360;
const f2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** escape ข้อความก่อนยัดใน SVG (กัน &<>"' หลุด markup) */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** เพศ "M"|"F" จาก string อิสระ (DB เก็บ F/M/male/female) — kept aligned กับ gender mapping r105 */
function toGender(g: string): "M" | "F" {
  return String(g || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M";
}

/**
 * polar สำหรับวงล้อราศี (zodiac wheel · แนว tianxing.html)
 * 0° เมษ อยู่ซ้าย (9 นาฬิกา) · ลองจิจูดเพิ่ม = ทวนเข็ม (ขนบผังโหราศาสตร์)
 *   x = cx − R·cos(lon) · y = cy − R·sin(lon)
 */
function zpt(lonDeg: number, R: number): [number, number] {
  const a = (lonDeg * Math.PI) / 180;
  return [CX - R * Math.cos(a), CY - R * Math.sin(a)];
}

/**
 * polar สำหรับหน้าปัด 90° (dial 90° · แนว uranian.html)
 * dial 0 อยู่บนสุด (12 นาฬิกา) · เพิ่ม = ตามเข็ม · มุมจอ = dial90×4
 *   x = cx + R·sin(θ) · y = cy − R·cos(θ)
 */
function dpt(dial90: number, R: number): [number, number] {
  const a = ((dial90 * 4) * Math.PI) / 180;
  return [CX + R * Math.sin(a), CY - R * Math.cos(a)];
}

/**
 * กระจายรัศมีกันดาวทับกัน (radius stagger · แนว uranian.html/tianxing.html)
 * @param angs  มุมจอของแต่ละดาว (องศา 0-360 · monotonic ตามลองจิจูด/dial)
 * @param radii ชั้นรัศมีที่ให้เลือก (ชั้นแรก = นอกสุด)
 * @param minSep มุมจอต่ำสุดที่ถือว่าชนกัน (องศา)
 */
function staggerRadii(angs: number[], radii: number[], minSep: number): number[] {
  const order = angs.map((_, i) => i).sort((a, b) => angs[a] - angs[b]);
  const placed: number[][] = radii.map(() => []);
  const out = angs.map(() => radii[0]);
  for (const i of order) {
    const ang = angs[i];
    let lvl = 0;
    for (let k = 0; k < radii.length; k++) {
      const clash = placed[k].some((a) => {
        let d = Math.abs(a - ang);
        if (d > 180) d = 360 - d;
        return d < minSep;
      });
      if (!clash) { lvl = k; break; }
      lvl = Math.min(k + 1, radii.length - 1);
    }
    placed[lvl].push(ang);
    out[i] = radii[lvl];
  }
  return out;
}

/** สัญลักษณ์ราศี 12 (index 0 = เมษ) — ใช้ทั้ง tropical (Western) และ sidereal (七政) */
const SIGN_GLYPH = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

/** สัญลักษณ์ดาวโหราศาสตร์ตะวันตก/ยูเรเนียน (key จาก engine) */
const PLANET_GLYPH: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
  Rahu: "☊", Ketu: "☋", Meridian: "Mc", Ascendant: "Asc",
};

/** อักษรจีนย่อดาว 七政四餘 (สไตล์จีน · single-char) */
const QZ_GLYPH: Record<string, string> = {
  Sun: "日", Moon: "月", Mercury: "水", Venus: "金", Mars: "火",
  Jupiter: "木", Saturn: "土", Rahu: "羅", Ketu: "計", Yuebo: "孛", Ziqi: "紫",
};

/* ── สีพิมพ์ได้บนขาว (theme-neutral · ไม่พึ่งพื้นเข้ม) ── */
const C_INK = "#2b2b33";      // เส้น/อักษรหลัก
const C_SOFT = "#8a8a95";     // เส้นรอง/tick
const C_RING = "#c9a24d";     // ทองอ่อน (วงแหวนราศี)
const C_NODE_FILL = "#ffffff";// ไส้ดาว (โปร่งพิมพ์บนขาว)
const C_HARMONY = "#3a8f6a";  // แอสเปกต์หนุน (trine/sextile)
const C_TENSE = "#c1583f";    // แอสเปกต์กด (square/opposition)
const C_PERSONAL = "#c9a24d"; // ไฮไลต์จุดส่วนตัว

/** เปิด/ปิด <svg> พื้นโปร่ง viewBox จัตุรัส */
function svgOpen(aria: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="100%" height="100%" role="img" aria-label="${esc(aria)}" font-family="'Noto Sans Thai','Noto Sans',system-ui,sans-serif">`;
}

/** วาดวงแหวนราศี 12 (เส้นแบ่งทุก 30° + tick ทุก 10° + สัญลักษณ์ราศี) — ใช้ร่วม Western/七政 */
function zodiacRing(rOuter: number, rInner: number, rGlyph: number, glyphFill: string): string {
  let s = "";
  s += `<circle cx="${CX}" cy="${CY}" r="${rOuter}" fill="none" stroke="${C_RING}" stroke-width="1.4"/>`;
  s += `<circle cx="${CX}" cy="${CY}" r="${rInner}" fill="none" stroke="${C_RING}" stroke-width="1"/>`;
  for (let d = 0; d < 360; d += 30) {
    const [x1, y1] = zpt(d, rInner);
    const [x2, y2] = zpt(d, rOuter);
    s += `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${C_RING}" stroke-width="1"/>`;
  }
  for (let d = 0; d < 360; d += 10) {
    if (d % 30 === 0) continue;
    const [x1, y1] = zpt(d, rInner);
    const [x2, y2] = zpt(d, rInner + (rOuter - rInner) * 0.42);
    s += `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${C_SOFT}" stroke-width="0.6" opacity="0.7"/>`;
  }
  for (let i = 0; i < 12; i++) {
    const [gx, gy] = zpt(i * 30 + 15, rGlyph);
    s += `<text x="${f2(gx)}" y="${f2(gy + 6)}" font-size="18" fill="${glyphFill}" text-anchor="middle">${SIGN_GLYPH[i]}</text>`;
  }
  return s;
}

/** วาดแกน (Asc/MC ฯลฯ) — เส้นผ่านศูนย์กลางถึงขอบ + ป้าย */
function axisLine(lon: number, rInner: number, rOuter: number, label: string): string {
  const [x1, y1] = zpt(lon, 0);
  const [x2, y2] = zpt(lon, rInner);
  const [lx, ly] = zpt(lon, rOuter + 12);
  return (
    `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${C_INK}" stroke-width="1.3"/>` +
    `<text x="${f2(lx)}" y="${f2(ly + 4)}" font-size="12" font-weight="700" fill="${C_INK}" text-anchor="middle">${esc(label)}</text>`
  );
}

/** โหนดดาว 1 ดวง (วงกลมไส้ขาว + สัญลักษณ์ + tick เข้าวงแหวน + องศาในราศี) */
function planetNode(
  lon: number, R: number, rTick: number, glyph: string, aria: string,
  signDeg: number, retro: boolean, personal: boolean,
): string {
  const [x, y] = zpt(lon, R);
  const [t1x, t1y] = zpt(lon, rTick);
  const [t2x, t2y] = zpt(lon, rTick - 8);
  let s = `<g role="listitem" aria-label="${esc(aria)}">`;
  s += `<line x1="${f2(t1x)}" y1="${f2(t1y)}" x2="${f2(t2x)}" y2="${f2(t2y)}" stroke="${C_SOFT}" stroke-width="0.8"/>`;
  if (personal) {
    s += `<circle cx="${f2(x)}" cy="${f2(y)}" r="16" fill="none" stroke="${C_PERSONAL}" stroke-width="1.1" stroke-dasharray="2.4 2.4"/>`;
  }
  s += `<circle cx="${f2(x)}" cy="${f2(y)}" r="12" fill="${C_NODE_FILL}" stroke="${C_INK}" stroke-width="1.4"/>`;
  s += `<text x="${f2(x)}" y="${f2(y + 5)}" font-size="14" fill="${C_INK}" text-anchor="middle">${esc(glyph)}</text>`;
  // ป้ายองศาในราศี + สัญลักษณ์พักร์ (retro) เล็ก ๆ ใต้ดาว
  const [dx, dy] = zpt(lon, R - 19);
  s += `<text x="${f2(dx)}" y="${f2(dy + 3)}" font-size="8.5" fill="${C_SOFT}" text-anchor="middle">${Math.floor(signDeg)}°${retro ? "℞" : ""}</text>`;
  s += `</g>`;
  return s;
}

/* ─────────────────────────── 1) Western ─────────────────────────── */

/**
 * ผังโหราศาสตร์ตะวันตก (tropical) แบบวงล้อสะอาด
 * - 12 ราศี (วงแหวน) + ดาว 10 + ราหู/เกตุ วางตามลองจิจูด tropical
 * - แกน Asc/MC (เมื่อมีเวลาเกิด) · ถ้าไม่มีเวลา = ไม่มี Asc/MC
 * - เส้นแอสเปกต์หลัก (เบา · หนุน=เขียว/กด=แดง) ในวงใน
 */
export function westernChartSvg(birth: Birth): string {
  const w = westernChart(birth.dtUTC, birth.lat, birth.lng, birth.hasTime, toGender(birth.gender));

  const R_OUTER = 288, R_INNER = 250, R_GLYPH = 269, R_TICK = 250;
  const R_LEVELS = [214, 188, 162];   // ชั้นดาว (กันชน)
  const R_ASPECT = 140;               // วงในสำหรับลากเส้นแอสเปกต์
  const PERSONAL = new Set(["Sun", "Moon"]);

  let s = svgOpen("Western natal chart wheel (tropical)");
  s += zodiacRing(R_OUTER, R_INNER, R_GLYPH, C_RING);
  s += `<circle cx="${CX}" cy="${CY}" r="${R_ASPECT}" fill="none" stroke="${C_SOFT}" stroke-width="0.7" opacity="0.6"/>`;

  // แกน Asc/MC (มีเมื่อมีเวลาเกิด)
  if (w.ascendant !== null) {
    s += axisLine(w.ascendant, R_INNER, R_OUTER, "Asc");
    s += axisLine(norm360(w.ascendant + 180), R_INNER, R_OUTER, "Dsc");
  }
  if (w.mc !== null) {
    s += axisLine(w.mc, R_INNER, R_OUTER, "MC");
    s += axisLine(norm360(w.mc + 180), R_INNER, R_OUTER, "IC");
  }

  // เส้นแอสเปกต์เบา (ลากระหว่างจุดดาวบนวง R_ASPECT)
  const lonByName = new Map(w.planets.map((p) => [p.name, p.lon]));
  const HARMONY = new Set(["trine", "sextile"]);
  const TENSE = new Set(["square", "opposition"]);
  for (const a of w.aspects) {
    const la = lonByName.get(a.a), lb = lonByName.get(a.b);
    if (la === undefined || lb === undefined) continue;
    let color = "", dash = "";
    if (HARMONY.has(a.type)) color = C_HARMONY;
    else if (TENSE.has(a.type)) { color = C_TENSE; dash = ' stroke-dasharray="4 3"'; }
    else continue; // conjunction = จุดเดียวกัน ไม่ลากเส้น
    const [x1, y1] = zpt(la, R_ASPECT);
    const [x2, y2] = zpt(lb, R_ASPECT);
    s += `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${color}" stroke-width="0.7" opacity="0.5"${dash}/>`;
  }

  // โหนดดาว (กันชนด้วย stagger)
  const angs = w.planets.map((p) => p.lon);
  const radii = staggerRadii(angs, R_LEVELS, 7);
  w.planets.forEach((p, i) => {
    const glyph = PLANET_GLYPH[p.name] || p.name.slice(0, 2);
    const aria = `${p.nameTh} ${SIGN_GLYPH[p.sign]} ${f2(p.signDeg)}°${p.retro ? " ℞" : ""}`;
    s += planetNode(p.lon, radii[i], R_TICK, glyph, aria, p.signDeg, p.retro, PERSONAL.has(p.name));
  });

  s += `<circle cx="${CX}" cy="${CY}" r="4" fill="${C_INK}"/>`;
  s += `</svg>`;
  return s;
}

/* ─────────────────────────── 2) 七政四餘 (Qizheng) ─────────────────────────── */

/**
 * ผัง 七政四餘 (sidereal) แบบวงล้อสะอาด สไตล์จีน
 * - วงล้อดาวจริง 7 政 + 四餘 (羅計孛紫) วางตามลองจิจูด sidereal
 * - วงแหวนราศี (sidereal) + แกน命宮 (ลัคนา · เมื่อมีเวลาเกิด)
 * - ไฮไลต์用神 (命主) · ดาวร้าย火土羅計 เส้นประ
 */
export function qizhengChartSvg(birth: Birth): string {
  const n = qizhengNatal(birth.dtUTC, birth.lat, birth.lng, birth.hasTime);
  const r = n.reading;

  const R_OUTER = 288, R_INNER = 250, R_GLYPH = 269, R_TICK = 250;
  const R_LEVELS = [214, 187, 160];
  const XIONG = new Set(["Mars", "Saturn", "Rahu", "Ketu"]);
  const yongKey = r.yongshen?.key;

  let s = svgOpen("Qizheng Sifu Yu natal wheel (sidereal)");
  s += zodiacRing(R_OUTER, R_INNER, R_GLYPH, C_RING);

  // แกน命宮 (ลัคนา sidereal) — มีเมื่อมีเวลาเกิด
  if (n.hasBirthTime && r.ascendant) {
    const ascLon = r.ascendant.lonSid;
    s += axisLine(ascLon, R_INNER, R_OUTER, "命");
    // เส้นแบ่ง 12 เรือน (whole-sign จากลัคนา) — เบา ๆ
    const ascSign = r.ascendant.sign;
    for (let h = 0; h < 12; h++) {
      const boundLon = ((ascSign + h) % 12) * 30; // ขอบราศี = ขอบเรือน (whole-sign)
      const [x1, y1] = zpt(boundLon, 90);
      const [x2, y2] = zpt(boundLon, R_INNER);
      s += `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${C_SOFT}" stroke-width="0.5" opacity="0.4"/>`;
    }
  }

  // โหนดดาว 七政四餘 (วางตาม lonSid)
  const angs = r.stars.map((st) => st.lonSid);
  const radii = staggerRadii(angs, R_LEVELS, 8);
  r.stars.forEach((st, i) => {
    const glyph = QZ_GLYPH[st.key] || st.zh?.slice(0, 1) || st.key.slice(0, 1);
    const isYong = st.key === yongKey;
    const isXiong = XIONG.has(st.key);
    const [x, y] = zpt(st.lonSid, radii[i]);
    const [t1x, t1y] = zpt(st.lonSid, R_TICK);
    const [t2x, t2y] = zpt(st.lonSid, R_TICK - 8);
    const aria = `${st.th} ${st.zh} ${SIGN_GLYPH[st.sign]} ${f2(st.deg)}° ${st.status || ""}`.trim();
    s += `<g role="listitem" aria-label="${esc(aria)}">`;
    s += `<line x1="${f2(t1x)}" y1="${f2(t1y)}" x2="${f2(t2x)}" y2="${f2(t2y)}" stroke="${C_SOFT}" stroke-width="0.8"/>`;
    if (isYong) {
      s += `<circle cx="${f2(x)}" cy="${f2(y)}" r="16.5" fill="none" stroke="${C_PERSONAL}" stroke-width="1.6"/>`;
    }
    const strokeDash = isXiong ? ' stroke-dasharray="3 2.2"' : "";
    s += `<circle cx="${f2(x)}" cy="${f2(y)}" r="12.5" fill="${C_NODE_FILL}" stroke="${isXiong ? C_TENSE : C_INK}" stroke-width="1.5"${strokeDash}/>`;
    s += `<text x="${f2(x)}" y="${f2(y + 5)}" font-size="14" fill="${isXiong ? C_TENSE : C_INK}" text-anchor="middle">${esc(glyph)}</text>`;
    const [dx, dy] = zpt(st.lonSid, radii[i] - 19.5);
    s += `<text x="${f2(dx)}" y="${f2(dy + 3)}" font-size="8.5" fill="${C_SOFT}" text-anchor="middle">${Math.floor(st.deg)}°${st.retro ? "逆" : ""}</text>`;
    s += `</g>`;
  });

  s += `<circle cx="${CX}" cy="${CY}" r="4" fill="${C_INK}"/>`;
  s += `</svg>`;
  return s;
}

/* ─────────────────────────── 3) Uranian dial 90° ─────────────────────────── */

/**
 * หน้าปัด 90° (dial 90°) โหราศาสตร์ยูเรเนียน แบบสะอาด
 * - พับ 360° เป็น 4 ควอดแรนต์บนหน้าปัดเดียว → ดาวที่ห่าง 90°/180°/270° ตกจุดเดียวกัน (มุมแข็ง)
 * - ดาววางที่ dial90 (มุมจอ = dial90×4) · เห็นภาพดาว (Planetenbild) ทับกันด้วยตา
 * - ไฮไลต์จุดส่วนตัว (☉/MC/Asc) ด้วยวงประ
 */
export function uranianChartSvg(birth: Birth): string {
  const u = uranianChart(birth.dtUTC, birth.lat, birth.lng, birth.hasTime, toGender(birth.gender));

  const R_OUTER = 288, R_INNER = 250;
  const R_LEVELS = [214, 187, 160, 133];
  const PERSONAL = new Set(["Sun", "Meridian", "Ascendant"]);

  let s = svgOpen("Uranian 90 degree dial");
  // วงหน้าปัด
  s += `<circle cx="${CX}" cy="${CY}" r="${R_OUTER}" fill="none" stroke="${C_RING}" stroke-width="1.4"/>`;
  s += `<circle cx="${CX}" cy="${CY}" r="${R_INNER}" fill="none" stroke="${C_RING}" stroke-width="1"/>`;

  // สเกลหน้าปัด 0..90 (tick ทุก 1° เล็ก · ทุก 5° กลาง · ตัวเลขทุก 15°)
  for (let v = 0; v < 90; v += 1) {
    const major5 = v % 5 === 0;
    const [x1, y1] = dpt(v, R_INNER);
    const [x2, y2] = dpt(v, R_INNER + (major5 ? 12 : 6));
    s += `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${major5 ? C_RING : C_SOFT}" stroke-width="${major5 ? 0.9 : 0.5}" opacity="${major5 ? 1 : 0.7}"/>`;
  }
  for (let v = 0; v < 90; v += 15) {
    const [lx, ly] = dpt(v, R_OUTER + 13);
    s += `<text x="${f2(lx)}" y="${f2(ly + 4)}" font-size="11" fill="${C_INK}" text-anchor="middle">${v}°</text>`;
  }
  // เส้นกากบาทแกนแข็ง (0/90 บนจอ = dial 0 และ dial 22.5×... จริง ๆ แกนจอ 4 ทิศ)
  for (const v of [0, 22.5, 45, 67.5]) {
    const [x1, y1] = dpt(v, 0);
    const [x2, y2] = dpt(v, R_INNER);
    s += `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${C_SOFT}" stroke-width="0.5" opacity="0.35"/>`;
  }

  // โหนดดาว (วางตาม dial90 · มุมจอ = dial90×4 · กันชน)
  const angs = u.points.map((p) => (p.dial90 * 4) % 360);
  const radii = staggerRadii(angs, R_LEVELS, 11);
  u.points.forEach((p, i) => {
    const glyph = PLANET_GLYPH[p.name] || p.name.slice(0, 2);
    const personal = PERSONAL.has(p.name);
    const [x, y] = dpt(p.dial90, radii[i]);
    const [t1x, t1y] = dpt(p.dial90, R_INNER);
    const [t2x, t2y] = dpt(p.dial90, R_INNER - 8);
    const aria = `${p.nameTh} · dial ${f2(p.dial90)}° · ${SIGN_GLYPH[p.sign]} ${f2(p.signDeg)}°`;
    s += `<g role="listitem" aria-label="${esc(aria)}">`;
    s += `<line x1="${f2(t1x)}" y1="${f2(t1y)}" x2="${f2(t2x)}" y2="${f2(t2y)}" stroke="${C_SOFT}" stroke-width="0.8"/>`;
    if (personal) {
      s += `<circle cx="${f2(x)}" cy="${f2(y)}" r="16" fill="none" stroke="${C_PERSONAL}" stroke-width="1.1" stroke-dasharray="2.4 2.4"/>`;
    }
    s += `<circle cx="${f2(x)}" cy="${f2(y)}" r="12" fill="${C_NODE_FILL}" stroke="${C_INK}" stroke-width="1.4"/>`;
    s += `<text x="${f2(x)}" y="${f2(y + 5)}" font-size="14" fill="${C_INK}" text-anchor="middle">${esc(glyph)}</text>`;
    const [dx, dy] = dpt(p.dial90, radii[i] - 19);
    s += `<text x="${f2(dx)}" y="${f2(dy + 3)}" font-size="8.5" fill="${C_SOFT}" text-anchor="middle">${f2(p.dial90)}</text>`;
    s += `</g>`;
  });

  s += `<circle cx="${CX}" cy="${CY}" r="4" fill="${C_INK}"/>`;
  s += `</svg>`;
  return s;
}
