/**
 * GOLDEN TEST · พิสูจน์ "ฐานตำแหน่งดาวยูเรเนียนแม่นจริง"  (audit r2j-5 Golden-A)
 * ════════════════════════════════════════════════════════════════════════════
 * เทียบ engine (uranianChart · astronomy-engine tropical) กับ ephemeris ภายนอกที่อ้างอิงได้
 *
 * ⚠️ กฎห้ามโกหก: reference ทุกค่ามาจาก "แหล่งภายนอกจริง" + cross-check ≥2 แหล่ง/ดวง
 *   - ค่าละเอียด (องศา°ลิปดา') = astro-charts.com (คำนวณด้วย Swiss Ephemeris · tropical apparent geocentric)
 *   - cross-check (ปัดองศา + Asc/MC + Rodden rating + UT) = astro.com/astro-databank + astrotheme
 *   - ดึงข้อมูล 2026-07-04
 *   - ⛔ ไม่มีการแต่งค่า reference ให้ test ผ่าน · ไม่ตรง = รายงานส่วนต่างตรง ๆ
 *
 * รัน:
 *   cd /root/decode-app && set -a && source .env.local && set +a && \
 *   npx tsx scripts/test-uranian-golden-astrodienst.mjs
 *
 * import อ่านอย่างเดียว: uranianChart จาก engine.ts (ห้ามแก้ engine)
 */
import { uranianChart } from "../src/lib/astro/uranian/engine.ts";

// ── helpers ────────────────────────────────────────────────────────────────
const SIGN = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sag","Cap","Aqu","Pisces"];
/** ราศี(0=Aries) + องศา + ลิปดา → ลองจิจูด tropical 0..360 */
const dms = (signIdx, deg, min) => signIdx * 30 + deg + min / 60;
const fmt = (lon) => {
  const s = Math.floor(lon / 30), d = lon - s * 30;
  const dd = Math.floor(d), mm = Math.round((d - dd) * 60);
  return `${SIGN[s]} ${String(dd).padStart(2, "0")}°${String(mm).padStart(2, "0")}'`;
};
/** ส่วนต่างเชิงมุมสั้นสุด (องศา · absolute) */
const angDiff = (a, b) => {
  let d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return d;
};

// ── ดวงอ้างอิง (3 ดวงดัง · Rodden AA/A · เวลาเกิดยืนยันได้) ────────────────────
// reference = ตำแหน่งจาก astro-charts.com (ละเอียด) · cross-check astro-databank/astrotheme
const CHARTS = [
  {
    name: "Albert Einstein",
    rodden: "AA (birth certificate)",
    // 1879-03-14 · 11:30 LMT Ulm · astro-databank: UT 10:50 (offset −0:40h) · 48n24 10e00
    //
    // ⚠️ ยุคก่อน standard time (เยอรมนีใช้ LMT ถึง 1893) → แต่ละแหล่ง "แปลง LMT→UT" ต่างกัน:
    //    • astro.com/astro-databank + astrotheme ใช้ UT=10:50 (LMT−0:40 · offset 10e00 ตรงตำรา)
    //    • astro-charts.com คำนวณด้วย UT ช้ากว่า ~13 นาที (Asc Cancer 8°43'/MC Pisces 9°04' · Moon 14°23')
    // reference ที่ใช้ทดสอบ = astrotheme (สอดคล้องกับ dtUTC=10:50 ที่ป้อน) · cross-check ปัดองศากับ astro-databank
    //    (Pluto ของ astrotheme parse เพี้ยน จึงใช้ค่าจาก astro-charts 24°44' + search summary "24° Taurus")
    // src: astrotheme.com/astrology/Albert_Einstein (องศา+มุม · UT 10:50) · astro.com/astro-databank/Einstein,_Albert (UT+AA rating)
    dtUTC: new Date("1879-03-14T10:50:00Z"),
    lat: 48.4, lng: 10.0, hasTime: true,
    note: "ก่อน standard time · UT=LMT−0:40=10:50 (astro-databank) · reference=astrotheme(UT 10:50)",
    ref: {
      Sun:     dms(11, 23, 30),  // Pisces 23°30'  (astrotheme)
      Moon:    dms(8, 14, 32),   // Sag 14°32'     (astrotheme · astro-charts ให้ 14°23' ด้วย UT ช้ากว่า)
      Mercury: dms(0, 3, 9),     // Aries 3°09'    (astrotheme)
      Venus:   dms(0, 16, 59),   // Aries 16°59'   (astrotheme)
      Mars:    dms(9, 26, 55),   // Cap 26°55'     (astrotheme)
      Jupiter: dms(10, 27, 29),  // Aqu 27°29'     (astrotheme)
      Saturn:  dms(0, 4, 11),    // Aries 4°11'    (astrotheme)
      Uranus:  dms(5, 1, 17),    // Virgo 1°17'    (astrotheme)
      Neptune: dms(1, 7, 52),    // Taurus 7°52'   (astrotheme)
      Pluto:   dms(1, 24, 44),   // Taurus 24°44'  (astro-charts + search · astrotheme parse เพี้ยน)
    },
    refAngle: { Meridian: dms(11, 12, 50), Ascendant: dms(3, 11, 38) }, // MC Pisces 12°50' · Asc Cancer 11°38' (astrotheme · UT 10:50)
  },
  {
    name: "John F. Kennedy",
    rodden: "A (memory/autobiography · Rodden)",
    // 1917-05-29 · 15:00 EST Brookline MA · EST=UTC−5 → UT 20:00 · 42n20 71w07
    // src: astro-charts.com + astrotheme (cross)
    dtUTC: new Date("1917-05-29T20:00:00Z"),
    lat: 42.333, lng: -71.121, hasTime: true,
    note: "standard time EST (UT ชัดเจน · ไม่มี DST พ.ค.1917)",
    ref: {
      Sun:     dms(2, 7, 51),    // Gemini 7°51'
      Moon:    dms(5, 17, 12),   // Virgo 17°12'
      Mercury: dms(1, 20, 36),   // Taurus 20°36'
      Venus:   dms(2, 16, 45),   // Gemini 16°45'
      Mars:    dms(1, 18, 26),   // Taurus 18°26'
      Jupiter: dms(1, 23, 3),    // Taurus 23°03'
      Saturn:  dms(3, 27, 10),   // Cancer 27°10'
      Uranus:  dms(10, 23, 43),  // Aqu 23°43'
      Neptune: dms(4, 2, 40),    // Leo 2°40'
      Pluto:   dms(3, 3, 16),    // Cancer 3°16'
    },
    refAngle: { Meridian: dms(3, 23, 46), Ascendant: dms(6, 20, 0) }, // MC Cancer 23°46' · Asc Libra 20°00'
  },
  {
    name: "Barack Obama",
    rodden: "AA (birth certificate)",
    // 1961-08-04 · 19:24 AHST Honolulu · AHST=UTC−10 → UT 1961-08-05 05:24 · 21n18 157w52
    // src: astro-charts.com + astro.com/astro-databank (Asc 18°07' Aqu · cross)
    dtUTC: new Date("1961-08-05T05:24:00Z"),
    lat: 21.3, lng: -157.867, hasTime: true,
    note: "standard time AHST (UT ชัดเจน)",
    ref: {
      Sun:     dms(4, 12, 33),   // Leo 12°33'
      Moon:    dms(2, 3, 21),    // Gemini 3°21'
      Mercury: dms(4, 2, 20),    // Leo 2°20'
      Venus:   dms(3, 1, 47),    // Cancer 1°47'
      Mars:    dms(5, 22, 35),   // Virgo 22°35'
      Jupiter: dms(10, 0, 52),   // Aqu 0°52'
      Saturn:  dms(9, 25, 20),   // Cap 25°20'
      Uranus:  dms(4, 25, 16),   // Leo 25°16'
      Neptune: dms(7, 8, 36),    // Scorpio 8°36'
      Pluto:   dms(5, 6, 59),    // Virgo 6°59'
    },
    refAngle: { Meridian: dms(7, 28, 54), Ascendant: dms(10, 18, 3) }, // MC Scorpio 28°54' · Asc Aqu 18°03' (astro-charts; astro-databank 18°07')
  },
];

const TOL_PLANET = 0.10;  // ดาว 10 ดวง — VSOP/astronomy-engine ปกติ < 1 arcmin
const TOL_ANGLE  = 0.25;  // Asc/MC — เผื่อ timezone/เขต/ปัดลิปดาของแหล่ง

// ── รัน ──────────────────────────────────────────────────────────────────────
let totalFail = 0, totalPlanetTests = 0, totalAngleTests = 0;
const perChartSummary = [];

for (const c of CHARTS) {
  console.log("\n" + "═".repeat(76));
  console.log(`  ${c.name}  ·  Rodden ${c.rodden}`);
  console.log(`  dtUTC=${c.dtUTC.toISOString()} · lat ${c.lat} · lng ${c.lng}`);
  console.log(`  ${c.note}`);
  console.log("═".repeat(76));

  const chart = uranianChart(c.dtUTC, c.lat, c.lng, c.hasTime, "M");
  const byName = Object.fromEntries(chart.points.map((p) => [p.name, p]));

  console.log("  ดาว           engine              reference           Δ(°)    dial90(eng)  ผล");
  console.log("  " + "─".repeat(74));

  const deltas = [];
  for (const key of ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto"]) {
    const p = byName[key];
    const refLon = c.ref[key];
    const d = angDiff(p.lon, refLon);
    deltas.push(d);
    totalPlanetTests++;
    const pass = d <= TOL_PLANET;
    if (!pass) totalFail++;
    console.log(
      `  ${key.padEnd(9)} ${fmt(p.lon).padEnd(18)} ${fmt(refLon).padEnd(18)} ` +
      `${d.toFixed(4).padStart(7)}  ${p.dial90.toFixed(3).padStart(9)}    ${pass ? "✅" : "❌ เกิน tol"}`
    );
  }

  // Asc/MC
  console.log("  " + "─".repeat(74));
  for (const key of ["Meridian","Ascendant"]) {
    const p = byName[key];
    const refLon = c.refAngle[key];
    if (!p || refLon == null) continue;
    const d = angDiff(p.lon, refLon);
    totalAngleTests++;
    const pass = d <= TOL_ANGLE;
    if (!pass) totalFail++;
    const label = key === "Meridian" ? "MC" : "Asc";
    console.log(
      `  ${label.padEnd(9)} ${fmt(p.lon).padEnd(18)} ${fmt(refLon).padEnd(18)} ` +
      `${d.toFixed(4).padStart(7)}  ${p.dial90.toFixed(3).padStart(9)}    ${pass ? "✅" : "❌ เกิน tol"}`
    );
  }

  // วิเคราะห์ระบบ vs สุ่ม (ดูจากดาว 10 ดวง)
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const maxD = Math.max(...deltas);
  // ทิศทาง (signed) เพื่อจับ offset ระบบ
  const signed = ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto"].map((k) => {
    let s = ((byName[k].lon - c.ref[k] + 540) % 360) - 180; return s;
  });
  const meanSigned = signed.reduce((a, b) => a + b, 0) / signed.length;
  perChartSummary.push({ name: c.name, mean, maxD, meanSigned });
  console.log("  " + "─".repeat(74));
  console.log(`  Δ เฉลี่ย(ดาว)=${mean.toFixed(4)}° · Δ สูงสุด=${maxD.toFixed(4)}° · offset เฉลี่ยแบบมีทิศ=${meanSigned.toFixed(4)}°`);
}

// ── สรุปรวม ──────────────────────────────────────────────────────────────────
console.log("\n" + "█".repeat(76));
console.log("  สรุปผล GOLDEN TEST (ฐานตำแหน่งดาวยูเรเนียน)");
console.log("█".repeat(76));
for (const s of perChartSummary) {
  console.log(`  ${s.name.padEnd(18)} Δดาวเฉลี่ย=${s.mean.toFixed(4)}° · Δสูงสุด=${s.maxD.toFixed(4)}° · offsetมีทิศ=${s.meanSigned.toFixed(4)}°`);
}
console.log("  " + "─".repeat(74));
console.log(`  ดาว: ผ่าน ${totalPlanetTests - (totalFail)} ... (นับรวมมุมด้านล่าง)`);
console.log(`  รวมทดสอบ: ${totalPlanetTests} ดาว + ${totalAngleTests} มุม (Asc/MC) = ${totalPlanetTests + totalAngleTests} รายการ`);
console.log(`  ไม่ผ่าน (เกิน tol): ${totalFail} รายการ`);
console.log(`  tol: ดาว ≤ ${TOL_PLANET}° · มุม ≤ ${TOL_ANGLE}°`);
console.log("█".repeat(76));
process.exit(totalFail > 0 ? 1 : 0);
