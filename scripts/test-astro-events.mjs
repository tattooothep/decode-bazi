// golden test astro-core/events — เทียบวันจริงบนท้องฟ้า (ห้ามลบ · รันก่อน/หลังแก้ timing layer)
// run: npx tsx scripts/test-astro-events.mjs   (หรือ node ผ่าน tsx loader ตาม _test_western.mjs)
import { findAspectHits, findIngresses, findStations, findReturnInstant, findEclipses, bodyLon, wrap180 } from "../src/lib/astro-core/events.ts";
import { eclipticLon, eclipticSpeed } from "../src/lib/astro-core/ephemeris.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
};
const iso = (d) => d.toISOString().slice(0, 10);
const within = (d, targetISO, days) => Math.abs(d.getTime() - new Date(targetISO + "T00:00:00Z").getTime()) <= days * 86400000;

const Y26_FROM = new Date("2026-01-01T00:00:00Z");
const Y26_TO = new Date("2026-12-31T23:59:59Z");

// 1) Ingress ที่รู้วันจริง: เสาร์กลับเข้าเมษรอบสอง ~13-14 ก.พ. 2026 · พฤหัสเข้าสิงห์ ~30 มิ.ย. 2026
const satIng = findIngresses("Saturn", Y26_FROM, Y26_TO, 0);
ok("Saturn ingress 2026 มีอย่างน้อย 1 ครั้ง", satIng.length >= 1, JSON.stringify(satIng.map((x) => iso(x.date))));
ok("Saturn เข้าเมษ (sign 0) ราว 13-14 ก.พ. 2026 (±3 วัน)",
  satIng.some((x) => x.toSign === 0 && within(x.date, "2026-02-14", 3)),
  JSON.stringify(satIng.map((x) => `${iso(x.date)}→${x.toSign}`)));
const jupIng = findIngresses("Jupiter", Y26_FROM, Y26_TO, 0);
ok("Jupiter เข้าสิงห์ (sign 4) ราว 30 มิ.ย. 2026 (±3 วัน)",
  jupIng.some((x) => x.toSign === 4 && within(x.date, "2026-06-30", 3)),
  JSON.stringify(jupIng.map((x) => `${iso(x.date)}→${x.toSign}`)));

// 2) คราสปี 2026 (วันจริง: สุริยคราส 17 ก.พ. + 12 ส.ค. · จันทรคราส 3 มี.ค. + 28 ส.ค.)
const ecl = findEclipses(Y26_FROM, Y26_TO);
const solar = ecl.filter((e) => e.kind === "solar");
const lunar = ecl.filter((e) => e.kind === "lunar");
ok("สุริยคราส 2026 = 2 ครั้ง (17 ก.พ. + 12 ส.ค.)",
  solar.length === 2 && within(solar[0].date, "2026-02-17", 1) && within(solar[1].date, "2026-08-12", 1),
  JSON.stringify(solar.map((e) => iso(e.date))));
ok("จันทรคราส 2026 ครบ (3 มี.ค. + 28 ส.ค.)",
  lunar.some((e) => within(e.date, "2026-03-03", 1)) && lunar.some((e) => within(e.date, "2026-08-28", 1)),
  JSON.stringify(lunar.map((e) => iso(e.date))));

// 3) มุม exact: ทุก hit ที่คืนมา ต้องแม่นจริง (|มุมจริง − มุมเป้า| < 0.02°)
const natalMoon = 123.456; // จุดสมมุติ
let exactOk = true, exactDetail = "";
for (const body of ["Saturn", "Jupiter", "Mars"]) {
  for (const angle of [0, 90, 180, 120]) {
    for (const h of findAspectHits(body, "Moon", natalMoon, angle, Y26_FROM, Y26_TO)) {
      const sep = Math.abs(wrap180(bodyLon(body, h.date) - natalMoon));
      const err = Math.abs(sep - angle);
      if (err > 0.02) { exactOk = false; exactDetail += `${body}@${angle}° ${iso(h.date)} err=${err.toFixed(4)} `; }
    }
  }
}
ok("aspect hits ทุกจุดแม่น < 0.02°", exactOk, exactDetail);

// 4) Station: ความเร็ว ณ วัน station ต้องใกล้ศูนย์ + มีเปลี่ยนทิศจริงรอบวันนั้น
let stOk = true, stDetail = "";
for (const body of ["Mercury", "Mars", "Saturn"]) {
  for (const s of findStations(body, Y26_FROM, Y26_TO)) {
    const v = Math.abs(eclipticSpeed(body, s.date));
    const before = eclipticSpeed(body, new Date(s.date.getTime() - 2 * 86400000));
    const after = eclipticSpeed(body, new Date(s.date.getTime() + 2 * 86400000));
    if (v > 0.02 || before < 0 === after < 0) { stOk = false; stDetail += `${body} ${iso(s.date)} v=${v.toFixed(4)} `; }
  }
}
const mercSt = findStations("Mercury", Y26_FROM, Y26_TO);
ok("Mercury station 2026 = 6 จุด (retro 3 รอบ × เข้า/ออก)", mercSt.length === 6, `got ${mercSt.length}`);
ok("station ทุกจุด ความเร็ว≈0 + เปลี่ยนทิศจริง", stOk, stDetail);

// 5) Solar return: Sun ณ instant ที่หาได้ ต้องเท่าลองจิจูดกำเนิดเป๊ะ
const natalSunLon = eclipticLon("Sun", new Date("1962-07-15T05:30:00Z"));
const sr = findReturnInstant("Sun", natalSunLon, new Date("2026-07-15T00:00:00Z"), 5);
ok("solar return 2026 เจอ instant", !!sr, "");
if (sr) {
  const err = Math.abs(wrap180(eclipticLon("Sun", sr) - natalSunLon));
  ok("solar return แม่น < 0.001°", err < 0.001, `err=${err}`);
}

// 6) Determinism: รันซ้ำได้ค่าเดิมทุก ms
const a1 = findAspectHits("Saturn", "Moon", natalMoon, 0, Y26_FROM, Y26_TO).map((h) => h.date.getTime()).join(",");
const a2 = findAspectHits("Saturn", "Moon", natalMoon, 0, Y26_FROM, Y26_TO).map((h) => h.date.getTime()).join(",");
ok("deterministic รันซ้ำค่าเดิม", a1 === a2);

// 7) เคสถอย: เสาร์ 2025-2026 ต้องมีทั้งเข้าเมษ→ถอยกลับมีน→เข้าเมษใหม่ (3 ingress ใน 18 เดือน)
const satLong = findIngresses("Saturn", new Date("2025-01-01T00:00:00Z"), new Date("2026-06-30T00:00:00Z"), 0);
ok("Saturn 2025-กลาง2026 ครบ 3 ingress (เข้าเมษ/ถอยกลับมีน/เข้าเมษ)",
  satLong.filter((x) => x.toSign === 0).length === 2 && satLong.filter((x) => x.toSign === 11).length === 1,
  JSON.stringify(satLong.map((x) => `${iso(x.date)}→${x.toSign}${x.retro ? "R" : ""}`)));

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
