// เทส 天星 · เขตเวลาเกิด + ค่าดาราศาสตร์จริงต่อดาว (23 ก.ค. 2569)
// รัน: npx tsx scripts/test-tianxing-tz-horizon.mts
// คุมอะไร:
//  1) เกิดเวลานาฬิกาเดียวกัน คนละเขตเวลา (Tokyo +9 vs Bangkok +7) → ลัคนา/ตำแหน่งดาวต้องต่างกันจริง
//  2) elat ของจันทร์ต้องไม่เป็น 0 (จันทร์เอียงจากสุริยวิถีถึง ±5°) — จับกรณีส่งเลขหลอก
//  3) altDeg ∈ [-90,90] · azDeg ∈ [0,360) ทุกดาวจริง
//  4) 4 ดาวเงา (羅睺/計都/月孛/紫氣) ห้ามมี mag/altDeg/azDeg เด็ดขาด
//  5) mag/phaseFrac/ringTilt อยู่ในพิสัยที่เป็นไปได้ + deterministic (เรียกซ้ำได้ค่าเดิม)
import assert from "node:assert/strict";
import { tianxingReading } from "../src/lib/tianxing/index";

const SHADOW = ["Rahu", "Ketu", "Yuebo", "Ziqi"]; // 羅睺/計都/月孛/紫氣 = จุดคำนวณ ไม่ใช่วัตถุจริง
const REAL = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];

/** เวลานาฬิกาเกิด + ออฟเซ็ตเขตเวลา → เวลาสากล (แบบเดียวกับที่ route ทำ) */
function birthUtc(wall: string, offsetHours: number): Date {
  return new Date(Date.parse(`${wall}Z`) - offsetHours * 3600_000);
}

function run(round: number) {
  // ── 1) เขตเวลาเกิดคนละโซน ต้องได้ฟ้าคนละใบ ─────────────────────────────
  // เกิด 1990-06-15 08:00 · โตเกียว (tz+9 · 35.68N 139.77E) vs กรุงเทพ (tz+7 · 13.76N 100.50E)
  const tokyo = tianxingReading(birthUtc("1990-06-15T08:00:00", 9), 35.6762, 139.6503);
  const bangkok = tianxingReading(birthUtc("1990-06-15T08:00:00", 7), 13.7563, 100.5018);
  assert.notEqual(tokyo.dtUTC, bangkok.dtUTC, "เวลาสากลต้องต่างกัน 2 ชม.");
  assert.equal(
    new Date(bangkok.dtUTC).getTime() - new Date(tokyo.dtUTC).getTime(),
    2 * 3600_000,
    "Bangkok(+7) ต้องช้ากว่า Tokyo(+9) 2 ชม. เมื่อนาฬิกาบอกเวลาเดียวกัน"
  );
  assert.notEqual(tokyo.ascendant.lonTrop, bangkok.ascendant.lonTrop, "ลัคนาต้องต่างกัน");
  assert.ok(
    Math.abs(tokyo.ascendant.lonTrop - bangkok.ascendant.lonTrop) > 1,
    `ลัคนาต้องต่างกันเกิน 1° (ได้ ${tokyo.ascendant.lonTrop} vs ${bangkok.ascendant.lonTrop})`
  );

  // เขตเวลาผิด = ฟ้าผิด แม้พิกัดเดียวกัน (พิสูจน์ว่าบั๊ก +07:00 ตายตัวมีผลจริง)
  const tokyoWrongTz = tianxingReading(birthUtc("1990-06-15T08:00:00", 7), 35.6762, 139.6503);
  assert.notEqual(tokyoWrongTz.ascendant.lonTrop, tokyo.ascendant.lonTrop, "พิกัดเดียวกันแต่ tz ต่าง → ลัคนาต้องต่าง");
  const moonRight = tokyo.stars.find((s) => s.key === "Moon")!;
  const moonWrong = tokyoWrongTz.stars.find((s) => s.key === "Moon")!;
  assert.notEqual(moonRight.lonTrop, moonWrong.lonTrop, "ตำแหน่งจันทร์ต้องต่างเมื่อเขตเวลาต่าง");

  // ── 2) elat ของจันทร์ ต้องมีจริง ไม่ใช่ 0 ───────────────────────────────
  for (const r of [tokyo, bangkok]) {
    const moon = r.stars.find((s) => s.key === "Moon")!;
    assert.ok(typeof moon.elat === "number", "จันทร์ต้องมี elat");
    assert.notEqual(moon.elat, 0, "elat จันทร์ต้องไม่เป็น 0");
    assert.ok(Math.abs(moon.elat!) > 0.01 && Math.abs(moon.elat!) <= 5.5, `elat จันทร์ต้องอยู่ ±5.5° (ได้ ${moon.elat})`);
  }

  // ── 3) alt/az อยู่ในพิสัย + ค่าอื่นสมเหตุผล ────────────────────────────
  for (const key of REAL) {
    const s = tokyo.stars.find((x) => x.key === key)!;
    assert.ok(s, `ต้องมีดาว ${key}`);
    assert.ok(typeof s.altDeg === "number", `${key} ต้องมี altDeg`);
    assert.ok(typeof s.azDeg === "number", `${key} ต้องมี azDeg`);
    assert.ok(s.altDeg! >= -90 && s.altDeg! <= 90, `${key} altDeg ต้องอยู่ -90..90 (ได้ ${s.altDeg})`);
    assert.ok(s.azDeg! >= 0 && s.azDeg! < 360, `${key} azDeg ต้องอยู่ 0..360 (ได้ ${s.azDeg})`);
    assert.ok(typeof s.elat === "number" && Math.abs(s.elat!) <= 90, `${key} ต้องมี elat ในพิสัย`);
    assert.ok(typeof s.mag === "number" && s.mag! > -30 && s.mag! < 30, `${key} ต้องมี mag จริง (ได้ ${s.mag})`);
  }
  // ดวงอาทิตย์ต้องสว่างที่สุดเสมอ (sanity ของ mag)
  const sunMag = tokyo.stars.find((s) => s.key === "Sun")!.mag!;
  for (const key of REAL.filter((k) => k !== "Sun")) {
    assert.ok(sunMag < tokyo.stars.find((s) => s.key === key)!.mag!, `mag ดวงอาทิตย์ต้องน้อยกว่า ${key}`);
  }
  // phaseFrac เฉพาะจันทร์ · ringTilt เฉพาะเสาร์
  const moonT = tokyo.stars.find((s) => s.key === "Moon")!;
  assert.ok(typeof moonT.phaseFrac === "number" && moonT.phaseFrac! >= 0 && moonT.phaseFrac! <= 1, "phaseFrac จันทร์ต้องอยู่ 0..1");
  for (const key of REAL.filter((k) => k !== "Moon")) {
    assert.equal(tokyo.stars.find((s) => s.key === key)!.phaseFrac, undefined, `${key} ต้องไม่มี phaseFrac`);
  }
  const saturn = tokyo.stars.find((s) => s.key === "Saturn")!;
  assert.ok(typeof saturn.ringTilt === "number" && Math.abs(saturn.ringTilt!) <= 30, "ringTilt เสาร์ต้องอยู่ ±30°");
  for (const key of REAL.filter((k) => k !== "Saturn")) {
    assert.equal(tokyo.stars.find((s) => s.key === key)!.ringTilt, undefined, `${key} ต้องไม่มี ringTilt`);
  }

  // ── 4) ดาวเงา ห้ามมีค่าที่วัดจากวัตถุจริง ──────────────────────────────
  for (const key of SHADOW) {
    const s = tokyo.stars.find((x) => x.key === key)!;
    assert.ok(s, `ต้องมี ${key}`);
    assert.equal(s.mag, undefined, `${key} เป็นจุดคำนวณ ห้ามมี mag`);
    assert.equal(s.altDeg, undefined, `${key} เป็นจุดคำนวณ ห้ามมี altDeg`);
    assert.equal(s.azDeg, undefined, `${key} เป็นจุดคำนวณ ห้ามมี azDeg`);
    assert.equal(s.phaseFrac, undefined, `${key} ห้ามมี phaseFrac`);
    assert.equal(s.ringTilt, undefined, `${key} ห้ามมี ringTilt`);
  }
  // 羅睺/計都 อยู่บนสุริยวิถีตามนิยาม → elat = 0 · 月孛/紫氣 ไม่นิยาม → ไม่ส่ง
  assert.equal(tokyo.stars.find((s) => s.key === "Rahu")!.elat, 0, "羅睺 elat = 0 ตามนิยาม");
  assert.equal(tokyo.stars.find((s) => s.key === "Ketu")!.elat, 0, "計都 elat = 0 ตามนิยาม");
  assert.equal(tokyo.stars.find((s) => s.key === "Yuebo")!.elat, undefined, "月孛 ไม่มีนิยาม elat → ต้องไม่ส่ง");
  assert.equal(tokyo.stars.find((s) => s.key === "Ziqi")!.elat, undefined, "紫氣 ไม่มีนิยาม elat → ต้องไม่ส่ง");

  // ── 5) alt/az ต้องผูกกับพิกัดจริง (คนละที่ เวลาสากลเดียวกัน = คนละมุมเงย) ──
  const sameInstant = new Date(Date.UTC(1990, 5, 14, 23, 0, 0));
  const atTokyo = tianxingReading(sameInstant, 35.6762, 139.6503);
  const atBangkok = tianxingReading(sameInstant, 13.7563, 100.5018);
  const sunTk = atTokyo.stars.find((s) => s.key === "Sun")!;
  const sunBk = atBangkok.stars.find((s) => s.key === "Sun")!;
  assert.notEqual(sunTk.altDeg, sunBk.altDeg, "มุมเงยดวงอาทิตย์ต้องต่างกันตามพิกัด");
  assert.equal(sunTk.lonTrop, sunBk.lonTrop, "ลองจิจูดสุริยวิถีเป็น geocentric → ต้องเท่ากันที่เวลาเดียวกัน");

  // deterministic — เรียกซ้ำต้องได้เท่าเดิม
  const again = tianxingReading(birthUtc("1990-06-15T08:00:00", 9), 35.6762, 139.6503);
  assert.deepEqual(again.stars, tokyo.stars, "engine ต้อง deterministic");

  console.log(`รอบ ${round}: ผ่าน · ลัคนาโตเกียว ${tokyo.ascendant.lonTrop}° vs กรุงเทพ ${bangkok.ascendant.lonTrop}°` +
    ` · จันทร์ elat ${moonT.elat}° alt ${moonT.altDeg}° az ${moonT.azDeg}° mag ${moonT.mag} เฟส ${moonT.phaseFrac}` +
    ` · เสาร์ ringTilt ${saturn.ringTilt}°`);
}

for (let i = 1; i <= 3; i++) run(i);
console.log("ผ่านครบ 3 รอบ ✅");
