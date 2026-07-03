/**
 * HUNT 4 · 28宿 (距星 จริง · ecliptic-of-date) vs 27 nakshatra (13°20' เท่ากัน · sidereal Lahiri)
 * ณ วันนี้ — 宿ไหนซ้อน nakshatra ไหนมากสุด + offset ขอบ
 * run: npx tsx scripts/research/hunt4-xiu28-nakshatra.mjs
 */
import { xiuBoundaries, XIU28 } from "../../src/lib/tianxing/xiu28.ts";
import { NAKSHATRAS, NAKSHATRA_SPAN } from "../../src/lib/astro/vedic/tables.ts";
import { lahiriAyanamsa } from "../../src/lib/astro-core/ayanamsa.ts";

const norm360 = (d) => ((d % 360) + 360) % 360;
const today = new Date("2026-07-03T00:00:00Z");
const ay = lahiriAyanamsa(today);
const xb = xiuBoundaries(today); // tropical (ecliptic-of-date) ของ距星 28 ดวง

console.log(`วันที่ ${today.toISOString().slice(0, 10)} · Lahiri ayanamsa = ${ay.toFixed(4)}°`);
console.log(`ขอบ nakshatra i (sidereal) = i×13.3333° → tropical = +ayanamsa\n`);

// overlap ระหว่างช่วง [a0,a1) กับ [b0,b1) บนวงกลม
function overlap(a0, a1, b0, b1) {
  // ทำงานใน frame เริ่มที่ a0
  const A = norm360(a1 - a0);
  const s = norm360(b0 - a0), e = s + norm360(b1 - b0);
  const lo = Math.max(0, s), hi = Math.min(A, e);
  let ov = Math.max(0, hi - lo);
  // เผื่อ b wrap มาอีกด้าน
  const s2 = s - 360, e2 = s2 + norm360(b1 - b0);
  ov = Math.max(ov, Math.max(0, Math.min(A, e2) - Math.max(0, s2)));
  return ov;
}

const rows = [];
let sumOff = 0, nOff = 0;
console.log("宿     距星     tropical°   sidereal°   กว้าง°   nakshatra หลัก (overlap°/สัดส่วน)      รอง");
for (let i = 0; i < 28; i++) {
  const t0 = xb[i], t1 = xb[(i + 1) % 28];
  const s0 = norm360(t0 - ay), s1 = norm360(t1 - ay); // sidereal ขอบ宿
  const width = norm360(t1 - t0);
  // overlap กับ nakshatra ทุกอัน (sidereal frame)
  const ovs = NAKSHATRAS.map((nk, j) => ({
    j, name: nk.name, ov: overlap(s0, s0 + width, j * NAKSHATRA_SPAN, (j + 1) * NAKSHATRA_SPAN),
  })).filter(o => o.ov > 0.01).sort((a, b) => b.ov - a.ov);
  const main = ovs[0], second = ovs[1];
  // offset ขอบ: ขอบ宿 เทียบขอบ nakshatra หลัก (start-start · wrap ±)
  let off = norm360(s0 - main.j * NAKSHATRA_SPAN); if (off > 180) off -= 360;
  sumOff += off; nOff++;
  rows.push({ i, off, main: main.name });
  console.log(
    `${XIU28[i].zh}  ${XIU28[i].star.padEnd(7)} ${t0.toFixed(2).padStart(8)}  ${s0.toFixed(2).padStart(8)}  ${width.toFixed(2).padStart(6)}   ` +
    `${main.name.padEnd(17)} (${main.ov.toFixed(2).padStart(5)}°/${(main.ov / width * 100).toFixed(0).padStart(3)}%)   ` +
    (second ? `${second.name} (${second.ov.toFixed(2)}°)` : "-")
  );
}

console.log(`\nmean offset (ขอบ宿ต้น − ขอบ nakshatra หลัก · sidereal) = ${(sumOff / nOff).toFixed(2)}°`);
const uniq = new Set(rows.map(r => r.main));
console.log(`nakshatra ที่เป็น "หลัก" ของอย่างน้อย 1 宿: ${uniq.size}/27 → ตกหล่น: ${NAKSHATRAS.filter(n => !uniq.has(n.name)).map(n => n.name).join(", ") || "ไม่มี"}`);
// 宿 ที่แชร์ nakshatra หลักเดียวกัน (28→27 ต้องมีคู่ทับ)
const byNk = {};
for (const r of rows) (byNk[r.main] ||= []).push(XIU28[r.i].zh);
const shared = Object.entries(byNk).filter(([, v]) => v.length > 1);
console.log(`nakshatra ที่ถูก 2宿+ แย่งเป็นหลัก: ${shared.map(([k, v]) => `${k}←[${v.join("")}]`).join(" · ") || "ไม่มี"}`);
// กว้างสุด/แคบสุด (ความไม่เท่าของ宿 vs ระบบเท่ากันของ nakshatra)
const widths = rows.map((r, i) => ({ zh: XIU28[i].zh, w: norm360(xb[(i + 1) % 28] - xb[i]) })).sort((a, b) => b.w - a.w);
console.log(`宿กว้างสุด: ${widths[0].zh}=${widths[0].w.toFixed(2)}° · แคบสุด: ${widths[27].zh}=${widths[27].w.toFixed(2)}° (nakshatra คงที่ 13.33°)`);
