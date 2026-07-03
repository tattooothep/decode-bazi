/**
 * HUNT 1 · Jupiter-Saturn Great Conjunctions 1800-2100 vs วง 60 ปี (ganzhi) + 三合 trigon
 * READ-ONLY research · ใช้ engine จริง: astro-core/ephemeris (eclipticLon) + tyme4ts (立春 year pillar)
 * run: npx tsx scripts/research/hunt1-jusat-ganzhi.mjs
 */
import { eclipticLon, norm360 } from "../../src/lib/astro-core/ephemeris.ts";
import { wrap180 } from "../../src/lib/astro-core/events.ts";
import * as tyme from "tyme4ts";

const DAY = 86400000;

// f = separation Jupiter - Saturn (signed, -180..180) → conjunction เมื่อข้าม 0
const f = (t) => wrap180(eclipticLon("Jupiter", t) - eclipticLon("Saturn", t));

function bisect(t0, t1, iters = 60) {
  let a = t0, b = t1, fa = f(new Date(a));
  for (let i = 0; i < iters && b - a > 1000; i++) {
    const m = (a + b) / 2, fm = f(new Date(m));
    if ((fa <= 0 && fm <= 0) || (fa > 0 && fm > 0)) { a = m; fa = fm; } else { b = m; }
  }
  return new Date((a + b) / 2);
}

// scan 1800-2100 step 15 วัน (relative speed J-S ~0.08°/วัน · retro ทำ triple pass ได้)
const from = Date.UTC(1799, 0, 1), to = Date.UTC(2101, 0, 1);
const step = 15 * DAY;
const hits = [];
let prevT = from, prevV = f(new Date(prevT));
for (let t = from + step; t <= to; t += step) {
  const v = f(new Date(t));
  if (prevV === 0 || (prevV < 0 !== v < 0 && Math.abs(prevV - v) < 90)) {
    const d = bisect(prevT, t);
    hits.push(d);
  }
  prevT = t; prevV = v;
}

// ganzhi year (立春 boundary) via tyme4ts — ใช้เที่ยงวัน UTC ของวันนั้น (ปีเปลี่ยนที่立春 · ห่างขอบพอ)
const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
function ganzhiOf(d) {
  const ec = tyme.SolarTime.fromYmdHms(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 12, 0, 0)
    .getLunarHour().getEightChar();
  return ec.getYear().getName();
}
function jiaziIndex(name) {
  const s = STEMS.indexOf(name[0]), b = BRANCHES.indexOf(name[1]);
  for (let i = 0; i < 60; i++) if (i % 10 === s && i % 12 === b) return i;
  return -1;
}
const SIGNS = ["Ari♈","Tau♉","Gem♊","Can♋","Leo♌","Vir♍","Lib♎","Sco♏","Sag♐","Cap♑","Aqu♒","Pis♓"];
const SIGN_ELEM = ["ไฟ","ดิน","ลม","น้ำ","ไฟ","ดิน","ลม","น้ำ","ไฟ","ดิน","ลม","น้ำ"]; // western triplicity
// 三合 ของ branch จีน (จัดกลุ่ม 120°): 申子辰น้ำ 亥卯未ไม้ 寅午戌ไฟ 巳酉丑ทอง
const SANHE = { 申: "น้ำ", 子: "น้ำ", 辰: "น้ำ", 亥: "ไม้", 卯: "ไม้", 未: "ไม้", 寅: "ไฟ", 午: "ไฟ", 戌: "ไฟ", 巳: "ทอง", 酉: "ทอง", 丑: "ทอง" };

const rows = hits.filter(d => d.getTime() >= Date.UTC(1800, 0, 1)).map(d => {
  const lon = norm360(eclipticLon("Jupiter", d));
  const gz = ganzhiOf(d);
  return { date: d, lon, gz, gzIdx: jiaziIndex(gz), sign: Math.floor(lon / 30) };
});

console.log("=== ALL zero-crossings (รวม triple-pass ช่วง retro) ===");
for (const r of rows) {
  console.log(`${r.date.toISOString().slice(0, 10)}  lon=${r.lon.toFixed(2).padStart(7)}°  ${SIGNS[r.sign]} (${SIGN_ELEM[r.sign]})  ปี=${r.gz}(#${r.gzIdx})  三合กิ่ง=${SANHE[r.gz[1]]}`);
}

// cluster triple conjunctions เป็น "synodic event" เดียว (hits ห่าง <1.5 ปี = passage เดียว)
const events = [];
for (const r of rows) {
  const last = events[events.length - 1];
  if (last && (r.date - last.members[last.members.length - 1].date) < 1.5 * 365.25 * DAY) last.members.push(r);
  else events.push({ members: [r] });
}
for (const e of events) {
  const mid = e.members[Math.floor((e.members.length - 1) / 2)];
  e.rep = mid; // ตัวแทน = hit กลาง (exact ที่สุดของ passage)
}

console.log(`\n=== Synodic events (cluster triple → 1) : ${events.length} ครั้ง ===`);
console.log("date        lon°      sign     ganzhi  Δt(ปี)   Δlon(°ไปข้างหน้า)   Δganzhi(ตำแหน่ง)");
let prev = null;
const dts = [], dlons = [], dgz3 = [];
for (const e of events) {
  const r = e.rep;
  let dt = "", dlon = "", dgz = "";
  if (prev) {
    const yrs = (r.date - prev.date) / (365.25 * DAY);
    const step = norm360(r.lon - prev.lon);
    const gzShift = ((r.gzIdx - prev.gzIdx) % 60 + 60) % 60;
    dts.push(yrs); dlons.push(step);
    dt = yrs.toFixed(3); dlon = step.toFixed(2); dgz = String(gzShift);
  }
  console.log(`${r.date.toISOString().slice(0, 10)}  ${r.lon.toFixed(2).padStart(7)}  ${SIGNS[r.sign]}(${SIGN_ELEM[r.sign]})  ${r.gz}#${String(r.gzIdx).padStart(2)}   ${dt.padStart(6)}   ${dlon.padStart(7)}   ${dgz}`);
  prev = r;
}

// (a) mean interval
const meanDt = dts.reduce((a, b) => a + b, 0) / dts.length;
// (c) mean angular step ไปข้างหน้า (242.7 = -117.3 mod 360) → เทียบ 三合 120°
const meanStep = dlons.reduce((a, b) => a + b, 0) / dlons.length;
// (b) หลัง 3 conj (≈59.6 ปี) ganzhi เลื่อนกี่ตำแหน่ง
console.log("\n=== 3-conjunction cycle vs วง 60 ปี ===");
for (let i = 0; i + 3 < events.length; i++) {
  const a = events[i].rep, b = events[i + 3].rep;
  const yrs = (b.date - a.date) / (365.25 * DAY);
  const gzShift = ((b.gzIdx - a.gzIdx) % 60 + 60) % 60;
  const shifted = gzShift > 30 ? gzShift - 60 : gzShift; // ตีความเป็น -/+
  const lonShift = wrap180(b.lon - a.lon);
  dgz3.push(shifted);
  console.log(`${a.gz}#${String(a.gzIdx).padStart(2)} (${a.date.toISOString().slice(0, 10)}) → ${b.gz}#${String(b.gzIdx).padStart(2)} (${b.date.toISOString().slice(0, 10)})  Δ=${yrs.toFixed(2)}ปี  ganzhiเลื่อน=${shifted}  Δlon=${lonShift.toFixed(2)}°`);
}
const meanGz3 = dgz3.reduce((a, b) => a + b, 0) / dgz3.length;
const mean3 = meanDt * 3;

console.log("\n=== SUMMARY ===");
console.log(`จำนวน synodic events 1800-2100: ${events.length}`);
console.log(`mean interval = ${meanDt.toFixed(4)} ปี (ทฤษฎี ~19.86)`);
console.log(`mean 3-conj cycle = ${mean3.toFixed(3)} ปี vs วง 60 ปี → drift = ${(60 - mean3).toFixed(3)} ปี/รอบ`);
console.log(`mean ganzhi shift ต่อ 3 conj = ${meanGz3.toFixed(3)} ตำแหน่ง (ลบ = ถอยหลังในวง 60)`);
console.log(`ครบรอบ ganzhi กลับที่เดิม (drift 1 ตำแหน่ง/3conj) ≈ ${(mean3 / Math.abs(meanGz3) * 60 / 60).toFixed(1)}x60 = ${(60 / Math.abs(meanGz3) * mean3 / 60).toFixed(0)} รอบ 3-conj ≈ ${(60 / Math.abs(meanGz3) * mean3).toFixed(0)} ปี`);
console.log(`mean angular step = +${meanStep.toFixed(3)}° (= -${(360 - meanStep).toFixed(3)}° mod 360) vs 三合 ideal 120°/240°`);
console.log(`deviation จาก 120° trigon = ${(Math.abs(360 - meanStep) - 120).toFixed(3)}° ต่อ conj → trigon เลื่อนราศีครบ 30° ใน ${(30 / Math.abs(Math.abs(360 - meanStep) - 120) * meanDt).toFixed(0)} ปี`);

// element run: conj อยู่ธาตุ(triplicity)เดิมกี่ครั้งติด
console.log("\n=== Element (triplicity) sequence ===");
console.log(events.map(e => `${e.rep.date.getUTCFullYear()}:${SIGN_ELEM[e.rep.sign]}`).join(" "));
