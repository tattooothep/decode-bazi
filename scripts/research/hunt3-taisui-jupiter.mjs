/**
 * HUNT 3 · 太歲 (กิ่งปี idealized · วง 12) vs ดาวพฤหัสจริง (歲星) 1900-2100
 * ณ 立春 ของทุกปี: Jupiter ecliptic lon → "สถานี" 30° → เทียบกิ่งปี
 * 2 conventions:
 *   [A] 十二次 mapping (คลาสสิก · ทิศสวน zodiac): 星紀=丑 ที่ sidereal Cap … (歲星 อยู่次ไหน → 太歲=กิ่งนั้น per 漢 scheme)
 *   [B] direct: station k (sidereal Aries=0) → branch (子=0) ตรง ๆ ทั้ง 2 ทิศ หา offset คงที่เชิงประจักษ์
 * caveat: ใช้ sidereal (Lahiri) แทนขอบ十二次จริง (ขอบจริงอิง距星 · คลาดได้ ~ครึ่งราศี) + tropical แสดงเทียบ
 * run: npx tsx scripts/research/hunt3-taisui-jupiter.mjs
 */
import { eclipticLon, norm360 } from "../../src/lib/astro-core/ephemeris.ts";
import { wrap180 } from "../../src/lib/astro-core/events.ts";
import { lahiriAyanamsa } from "../../src/lib/astro-core/ayanamsa.ts";
import * as tyme from "tyme4ts";

const DAY = 86400000;
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";

// 立春 = Sun lon 315° (ช่วง ~3-5 ก.พ.)
function lichun(year) {
  const f = (t) => wrap180(eclipticLon("Sun", new Date(t)) - 315);
  let a = Date.UTC(year, 0, 25), b = Date.UTC(year, 1, 15);
  let fa = f(a);
  for (let i = 0; i < 55 && b - a > 60000; i++) {
    const m = (a + b) / 2, fm = f(m);
    if ((fa <= 0 && fm <= 0) || (fa > 0 && fm > 0)) { a = m; fa = fm; } else { b = m; }
  }
  return new Date((a + b) / 2);
}

// 十二次 → กิ่ง (ทิศสวน zodiac · มาตรฐานตำรา): sidereal sign index (Ari=0) → branch
// 降婁(Ari)=戌 大梁(Tau)=酉 實沈(Gem)=申 鶉首(Can)=未 鶉火(Leo)=午 鶉尾(Vir)=巳
// 壽星(Lib)=辰 大火(Sco)=卯 析木(Sag)=寅 星紀(Cap)=丑 玄枵(Aqu)=子 娵訾(Pis)=亥
const CI_BRANCH = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 11]; // index=sidereal sign · ค่า=branch idx (子=0)

function branchOfYear(y) {
  // กิ่งปีจีน: ปี ค.ศ. y (หลัง立春) → (y-4) mod 12 = idx (子=0) · ยืนยันด้วย tyme4ts
  const ec = tyme.SolarTime.fromYmdHms(y, 6, 1, 12, 0, 0).getLunarHour().getEightChar();
  const name = ec.getYear().getName();
  return BRANCHES.indexOf(name[1]);
}

const rows = [];
for (let y = 1900; y <= 2100; y++) {
  const lc = lichun(y);
  const lonTrop = eclipticLon("Jupiter", lc);
  const lonSid = norm360(lonTrop - lahiriAyanamsa(lc));
  const sidSign = Math.floor(lonSid / 30);
  const jupBranchCI = CI_BRANCH[sidSign];       // convention A: 歲星在次 → ตำรา: 太歲 = กิ่งของ次นั้น? (สวนทิศ built-in)
  const yb = branchOfYear(y);
  // offset A = (太歲จริง − กิ่งจาก十二次ของพฤหัส) mod 12
  const offA = ((yb - jupBranchCI) % 12 + 12) % 12;
  // convention B (direct·เดินตาม zodiac): jupiter station = sidSign → เทียบ (yb − sidSign) mod 12
  const offB = ((yb - sidSign) % 12 + 12) % 12;
  rows.push({ y, lc: lc.toISOString().slice(0, 10), lonTrop, lonSid, sidSign, jupBranchCI, yb, offA, offB });
}

console.log("ปี    立春        JupTrop°  JupSid°  次→กิ่ง  กิ่งปี  offA(十二次/counter)  offB(direct)");
for (const r of rows) {
  if (r.y % 5 === 0 || r.offA === 0)
    console.log(`${r.y}  ${r.lc}  ${r.lonTrop.toFixed(1).padStart(7)}  ${r.lonSid.toFixed(1).padStart(7)}   ${BRANCHES[r.jupBranchCI]}      ${BRANCHES[r.yb]}        ${String(r.offA).padStart(2)}                 ${String(r.offB).padStart(2)}`);
}

// ปีที่ offset A = 0 (歲星紀年แบบ十二次 ตรงกับกิ่งปีจริง)
const alignA = rows.filter(r => r.offA === 0).map(r => r.y);
const alignB = rows.filter(r => r.offB === 0).map(r => r.y);
console.log(`\nปีที่ convention A (十二次·counter-rotation) ตรง (offA=0): ${alignA.join(", ") || "ไม่มี"}`);
console.log(`ปีที่ convention B (direct sidereal sign=branch) ตรง (offB=0): ${alignB.join(", ") || "ไม่มี"}`);

// drift rate: นับจำนวนปีต่อการเลื่อน offset 1 ขั้น (unwrap offA)
let unwrapped = [rows[0].offA];
for (let i = 1; i < rows.length; i++) {
  let d = rows[i].offA - rows[i - 1].offA;
  if (d > 6) d -= 12; if (d < -6) d += 12;
  unwrapped.push(unwrapped[i - 1] + d);
}
const totalDrift = unwrapped[unwrapped.length - 1] - unwrapped[0];
console.log(`\ndrift รวม 1900→2100: ${totalDrift} ขั้น ใน 200 ปี → 1 ขั้นต่อ ${(200 / Math.abs(totalDrift)).toFixed(1)} ปี (ทฤษฎี 超辰: 1/(12/11.862-1) ≈ 85.7 ปี... เช็คจากข้อมูลจริงข้างบน)`);
console.log(`คาบพฤหัส sidereal 11.8618 ปี → เดินเกินปีละ ${(360 / 11.8618 - 30).toFixed(3)}° → 30° ใน ${(30 / (360 / 11.8618 - 30)).toFixed(1)} ปี`);

const r2026 = rows.find(r => r.y === 2026);
console.log(`\n2026: 立春 ${r2026.lc} · Jupiter trop=${r2026.lonTrop.toFixed(2)}° sid=${r2026.lonSid.toFixed(2)}° (sidereal sign ${r2026.sidSign} → 次กิ่ง=${BRANCHES[r2026.jupBranchCI]}) · กิ่งปีจริง=${BRANCHES[r2026.yb]}(午) · offA=${r2026.offA} · offB=${r2026.offB}`);

// หน้าต่าง alignment ถัดไปของ A หลัง 2026
const nextA = rows.filter(r => r.y > 2026 && r.offA === 0).map(r => r.y);
console.log(`หน้าต่างถัดไปที่ A ตรง: ${nextA.slice(0, 12).join(", ") || "ไม่มีใน 2100"}`);
/* ===== offB คือ convention จริงของ 歲星紀年 (ทั้งคู่เดินหน้า +1/ปี) =====
 * anchor ฮั่น: 歲在星紀(sid Cap=9) → 太歲在寅(2) → yb = sidSign+5 mod 12 → offB=5 = ตรง anchor โบราณเป๊ะ */
console.log("\n=== offB (direct · yb − sidSign mod 12) — 5 = ตรง anchor ฮั่น 歲在星紀→太歲在寅 ===");
const dist = {};
for (const r of rows) dist[r.offB] = (dist[r.offB] || 0) + 1;
console.log("distribution offB (201 ปี):", JSON.stringify(dist));
console.log("run-length offB:");
let start = rows[0].y, cur = rows[0].offB;
for (let i = 1; i <= rows.length; i++) {
  if (i === rows.length || rows[i].offB !== cur) {
    console.log(`  offB=${String(cur).padStart(2)} : ${start}-${rows[i - 1].y} (${rows[i - 1].y - start + 1} ปี)`);
    if (i < rows.length) { start = rows[i].y; cur = rows[i].offB; }
  }
}
const off5years = rows.filter(r => r.offB === 5).map(r => r.y);
console.log(`\nปีที่ offB=5 (ตรงสูตรฮั่นเป๊ะ): ${off5years[0]}-${off5years[off5years.length - 1]} รวม ${off5years.length} ปี (${off5years.join(",")})`);
console.log(`ตั้งแต่太初曆 104 BC เลิก超辰 → ถึง 1945 ≈ ${1945 + 104} ปี · 超辰ครบรอบ mod12 = 85.8×12 ≈ ${(85.8 * 12).toFixed(0)} ปี → ${((1945 + 104) / (85.8 * 12)).toFixed(2)} รอบ (ใกล้ 2 รอบพอดี = realign ช่วง 1900-1944)`);
