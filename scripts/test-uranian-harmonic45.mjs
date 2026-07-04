// ศาสตร์ที่ 6 · ทดสอบ r399 · ชั้นรอง 45°/135° (Halbquadrat/Eineinhalbquadrat) ในผังกำเนิด (natal Planetenbild)
//   หนุนโดยคัมภีร์: Witte บท 44 „alle durch 45° teilbaren Aspekte" + Grundregel #4 (0/45/90/135/180)
//   + ตัวอย่างไกเซอร์ บท 30 (Merkur–Uranus 135° = „größter Feind" ในผังกำเนิด)
//   เป้า: natal จับมุมชุดเดียวกับชั้นเวลา (Auslösung nearestHardAspect [0,45,90,135,180]) — 3 ชั้นตรงกัน
// run: node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-uranian-harmonic45.mjs
import { uranianChart, midpointLon, dial90Distance } from "../src/lib/astro/uranian/engine.ts";
import { buildUranianPacket } from "../src/lib/astro/uranian/packet.ts";
import { renderUranianPrompt } from "../src/lib/astro/uranian/render.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("✓ " + m); } else { fail++; console.error("✗ " + m); } };

// ── ดวงเอี๊ยว (Aeaw 1984-12-31 13:15 Bangkok · golden ปาจื้อ) → UTC 06:15 ──
const aeawUTC = new Date(Date.UTC(1984, 11, 31, 6, 15, 0));
const LAT = 13.7563, LNG = 100.5018;
const chart = uranianChart(aeawUTC, LAT, LNG, true, "M");
const pointByName = Object.fromEntries(chart.points.map((p) => [p.name, p]));

console.log("\n=== 1) engine: มี orb ชั้นรอง + แคบกว่าแกนหลัก ===");
ok(chart.orbPictureSecondaryDeg > 0 && chart.orbPictureSecondaryDeg < chart.orbPictureDeg,
  `orb ภาพดาวชั้นรอง (${chart.orbPictureSecondaryDeg}°) แคบกว่าแกนหลัก (${chart.orbPictureDeg}°)`);
ok(chart.orbSensitiveSecondaryDeg > 0 && chart.orbSensitiveSecondaryDeg < chart.orbSensitiveDeg,
  `orb จุดไวชั้นรอง (${chart.orbSensitiveSecondaryDeg}°) แคบกว่าแกนหลัก (${chart.orbSensitiveDeg}°)`);

console.log("\n=== 2) ภาพดาว: ทุกอันมี tier ∈ {hard,secondary} + แยกชั้นถูกต้อง ===");
ok(chart.planetaryPictures.every((p) => p.tier === "hard" || p.tier === "secondary"),
  "ภาพดาวทุกอันมี field tier");
// hard → occupant ตรงแกน 0/90/180 (dial90 ≤ orb) · secondary → occupant ที่ 45°/135° (|dial90−45| ≤ orb)
const picTierOk = chart.planetaryPictures.every((p) => {
  const [a, b] = p.pair.split("/");
  const mid = midpointLon(pointByName[a].lon, pointByName[b].lon);
  const dd = dial90Distance(pointByName[p.occupant].lon, mid);
  return p.tier === "hard"
    ? dd <= chart.orbPictureDeg + 1e-6
    : Math.abs(dd - 45) <= chart.orbPictureSecondaryDeg + 1e-6 && dd > chart.orbPictureDeg; // ต้องไม่ทับชั้น hard
});
ok(picTierOk, "hard=แกน 0/90/180 · secondary=มุม 45°/135° (window ไม่ทับกัน)");

console.log("\n=== 3) จุดไว: ทุกอันมี tier + แยกชั้นถูกต้อง ===");
ok(chart.sensitivePoints.every((s) => s.tier === "hard" || s.tier === "secondary"),
  "จุดไวทุกอันมี field tier");
const sensTierOk = chart.sensitivePoints.every((s) => {
  const dd = dial90Distance(pointByName[s.activatedBy].lon, s.pointLon);
  return s.tier === "hard"
    ? dd <= chart.orbSensitiveDeg + 1e-6
    : Math.abs(dd - 45) <= chart.orbSensitiveSecondaryDeg + 1e-6 && dd > chart.orbSensitiveDeg;
});
ok(sensTierOk, "จุดไว: hard=0/90/180 · secondary=45°/135° (window ไม่ทับกัน)");

console.log("\n=== 4) hard เรียงนำหน้า secondary (แยกชั้นในลำดับ · slice ตัด secondary ก่อน) ===");
const picFirstSec = chart.planetaryPictures.findIndex((p) => p.tier === "secondary");
const picLastHard = chart.planetaryPictures.map((p) => p.tier).lastIndexOf("hard");
ok(picFirstSec === -1 || picLastHard === -1 || picLastHard < picFirstSec,
  "ภาพดาว: hard ทุกตัวมาก่อน secondary");
const sensFirstSec = chart.sensitivePoints.findIndex((s) => s.tier === "secondary");
const sensLastHard = chart.sensitivePoints.map((s) => s.tier).lastIndexOf("hard");
ok(sensFirstSec === -1 || sensLastHard === -1 || sensLastHard < sensFirstSec,
  "จุดไว: hard ทุกตัวมาก่อน secondary");

console.log("\n=== 5) ⭐ ถ่วงน้ำหนักจุดส่วนตัวเดิมยังทำงาน (ทั้ง hard/secondary) ===");
ok(chart.planetaryPictures.every((p) => typeof p.touchesPersonal === "boolean"),
  "ภาพดาวทุกอัน (รวม secondary) ยังมี touchesPersonal");

console.log("\n=== 6) ดวงเอี๊ยว: รายงานคู่ที่มีมุม 45°/135° (secondary) ===");
const secPics = chart.planetaryPictures.filter((p) => p.tier === "secondary");
const secSens = chart.sensitivePoints.filter((s) => s.tier === "secondary");
console.log(`  ภาพดาวชั้นรอง (45/135): ${secPics.length} อัน`);
for (const p of secPics.slice(0, 12)) {
  console.log(`    · ${p.occupantTh} บน ${p.pairTh} · orb ${p.orbDeg.toFixed(2)}° จากมุม 45°/135°${p.touchesPersonal ? " ⭐" : ""}`);
}
console.log(`  จุดไวชั้นรอง (45/135): ${secSens.length} อัน`);
for (const s of secSens.slice(0, 8)) {
  console.log(`    · ${s.activatedByTh} → (${s.aTh}${s.kind === "sum" ? "+" : "−"}${s.bTh}) · orb ${s.orbDeg.toFixed(2)}°${s.touchesPersonal ? " ⭐" : ""}`);
}
ok(true, `ดวงเอี๊ยว: ภาพดาว hard ${chart.planetaryPictures.length - secPics.length} + secondary ${secPics.length} · จุดไว hard ${chart.sensitivePoints.length - secSens.length} + secondary ${secSens.length}`);

console.log("\n=== 7) เคสสังเคราะห์: occupant ที่ 45° จากแกน → ต้องจับเป็น secondary ===");
// สร้างไม่ได้ตรงจาก uranianChart (ตำแหน่งดาวจริง) → พิสูจน์ทางคณิต: dial90Distance ที่ 45 = จุด secondary
ok(Math.abs(dial90Distance(45, 0) - 45) < 1e-9, "dial90Distance(45°,แกน0°) = 45 → semisquare = ชั้น secondary");
ok(Math.abs(dial90Distance(135, 0) - 45) < 1e-9, "dial90Distance(135°,แกน0°) = 45 → sesquiquadrate = ชั้น secondary");
ok(dial90Distance(46, 0) > chart.orbPictureDeg && Math.abs(dial90Distance(46, 0) - 45) <= chart.orbPictureSecondaryDeg,
  "occupant 46° จากแกน = ในกรอบ secondary (ห่าง 1° จาก 45) · ไม่ใช่ hard");

console.log("\n=== 8) render + packet: ป้ายชั้นรอง + orb ชั้นรอง ปรากฏใน prompt ===");
const packet = buildUranianPacket(chart);
ok(packet.orbPictureSecondaryDeg === chart.orbPictureSecondaryDeg, "packet ส่งผ่าน orbPictureSecondaryDeg");
ok(packet.orbSensitiveSecondaryDeg === chart.orbSensitiveSecondaryDeg, "packet ส่งผ่าน orbSensitiveSecondaryDeg");
const prompt = renderUranianPrompt(packet, "th");
ok(/ชั้นรอง 45°\/135°/.test(prompt), "prompt ระบุ ‘ชั้นรอง 45°/135°’ ในส่วนหัว/กฎ");
ok(/Halbquadrat\/Eineinhalbquadrat/.test(prompt), "prompt อ้างศัพท์ Halbquadrat/Eineinhalbquadrat");
ok(/บท 44/.test(prompt) || /alle durch 45/.test(prompt), "prompt อ้างคัมภีร์ บท 44 (alle durch 45° teilbaren Aspekte)");
// ถ้ามี secondary จริง ต้องมีป้าย ⟨ชั้นรอง⟩ ในบรรทัดรายการ
if (secPics.length + secSens.length > 0) {
  ok(/⟨ชั้นรอง 45°\/135°/.test(prompt), "prompt ติดป้าย ⟨ชั้นรอง⟩ ในบรรทัดภาพดาว/จุดไวที่เป็น secondary จริง");
} else {
  ok(true, "ดวงนี้ไม่มี secondary ในรายการ (ป้ายบรรทัดจึงไม่โผล่ · ยอมรับได้)");
}

console.log("\n=== 9) deterministic (รัน 2 ครั้งเท่ากัน) ===");
const chart2 = uranianChart(aeawUTC, LAT, LNG, true, "M");
ok(JSON.stringify(chart) === JSON.stringify(chart2), "uranianChart deterministic หลังเพิ่มชั้นรอง");

console.log(`\n${fail === 0 ? "✅" : "❌"} harmonic45: ${pass} ผ่าน / ${fail} ล้ม`);
process.exit(fail === 0 ? 0 : 1);
