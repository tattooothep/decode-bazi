// ศาสตร์ที่ 6 · ทดสอบชั้นกระตุ้น/จับเวลา ยูเรเนียน (Auslösung · r389)
// run: node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-fusion5-uranian-auslosung.mjs
import { uranianChart, midpointLon, dial90Distance, WITTE_TNP, EXCLUDED_TNP } from "../src/lib/astro/uranian/engine.ts";
import {
  computeUranianAuslosung, nearestHardAspect, HARD_ASPECTS,
  AUSLOSUNG_MAX_EVENTS, AUSLOSUNG_MAX_GROUPS, AUSLOSUNG_MAX_PER_GROUP,
} from "../src/lib/astro/uranian/auslosung.ts";
import { buildUranianPacket } from "../src/lib/astro/uranian/packet.ts";
import { renderUranianPrompt } from "../src/lib/astro/uranian/render.ts";
import { meanNode, eclipticLon } from "../src/lib/astro-core/ephemeris.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("✓ " + m); } else { fail++; console.error("✗ " + m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ── ดวงเอี๊ยว (Aeaw 1984-12-31 13:15 Bangkok · golden) → UTC 06:15 ──
const aeawUTC = new Date(Date.UTC(1984, 11, 31, 6, 15, 0));
const LAT = 13.7563, LNG = 100.5018;
const chart = uranianChart(aeawUTC, LAT, LNG, true, "M");
const chartNoTime = uranianChart(aeawUTC, LAT, LNG, false, "M");
const noonUTC = (iso) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12));

console.log("\n=== 1) engine: จุดส่วนตัว (Node/AriesPoint) เข้า chart · ของเดิมไม่กระทบ ===");
ok(chart.points.length === 12, "points ยังคง 12 (ดาว10+Meridian+Asc) — ภาพดาว/จุดไวเดิมไม่กระทบ (regression compat)");
ok(chart.personalPoints.length === 10, "personalPoints = 10 จุด (☉☽Asc MC Node AriesPoint + แกนสี่ทิศ Krebs/Waage/Steinbock + LocationPoint · r392)");
ok(JSON.stringify(chart.personalPoints.map((p) => p.name)) === JSON.stringify(["Sun", "Moon", "Meridian", "Ascendant", "Node", "AriesPoint", "CancerPoint", "LibraPoint", "CapricornPoint", "LocationPoint"]), "personalPoints ลำดับ/ชื่อถูก (r392 · เพิ่มแกนสี่ทิศ+LocationPoint)");
const aries = chart.personalPoints.find((p) => p.name === "AriesPoint");
ok(near(aries.lon, 0) && near(aries.dial90, 0) && aries.sign === 0, "AriesPoint: lon 0° · dial90 0° · ราศีเมษ");
const node = chart.personalPoints.find((p) => p.name === "Node");
ok(near(node.lon, ((meanNode(aeawUTC) % 360) + 360) % 360, 1e-3), "Node lon = astro-core.meanNode (mean Mondknoten · ระบุชัด)");
ok(chart.nodeType === "mean", "chart.nodeType = mean");
ok(chartNoTime.personalPoints.length === 7 && !chartNoTime.personalPoints.some((p) => p.name === "Meridian" || p.name === "Ascendant" || p.name === "LocationPoint"), "no-time: personalPoints 7 (ตัด Meridian/Asc/LocationPoint · แกนสี่ทิศคงอยู่ ไม่ใช้เวลาเกิด · r392)");
// golden midpoint เดิมยังถูก (พิสูจน์ engine.ts ไม่พัง)
ok(near(midpointLon(0, 90), 45) && near(midpointLon(350, 10), 0) && near(dial90Distance(135, 45), 0), "golden midpoint/dial90 เดิมยังถูก");

console.log("\n=== 2) nearestHardAspect: 5 มุมแข็ง (0/45/90/135/180) + แกนจุดกึ่งกลาง ===");
ok(JSON.stringify([...HARD_ASPECTS]) === JSON.stringify([0, 45, 90, 135, 180]), "HARD_ASPECTS = [0,45,90,135,180]");
ok(nearestHardAspect(100, 100).aspect === 0 && near(nearestHardAspect(100, 100).orbDeg, 0), "0° ทับ");
ok(nearestHardAspect(145, 100).aspect === 45 && near(nearestHardAspect(145, 100).orbDeg, 0), "45° กึ่งเหลี่ยม");
ok(nearestHardAspect(190, 100).aspect === 90 && near(nearestHardAspect(190, 100).orbDeg, 0), "90° ฉาก");
ok(nearestHardAspect(235, 100).aspect === 135 && near(nearestHardAspect(235, 100).orbDeg, 0), "135° เหลี่ยมครึ่ง");
ok(nearestHardAspect(280, 100).aspect === 180 && near(nearestHardAspect(280, 100).orbDeg, 0), "180° เล็ง");
ok(near(nearestHardAspect(100.4, 100).orbDeg, 0.4, 1e-9), "orb ที่ 0.4° คำนวณถูก");
// จุดกึ่งกลาง (แกน 2 ปลาย): mover ที่ mid+180 = ทับปลายไกล → aspect 180 orb 0
ok(nearestHardAspect(292 + 180, 292).aspect === 180 && near(nearestHardAspect(292 + 180, 292).orbDeg, 0), "แกนจุดกึ่งกลาง: 5 มุมเทียบ mid ครอบปลาย mid+180");

console.log("\n=== 3) arc math: อายุ 41 → ส่วนโค้งอาทิตย์ ~41° · ☉เคลื่อน ~1°/ปี ===");
const aus = computeUranianAuslosung(chart, aeawUTC, "2026-01-01", "2026-12-31");
ok(Math.abs(aus.ageAtFrom - 41.0) < 0.06, `ageAtFrom ≈ 41 (ได้ ${aus.ageAtFrom})`);
ok(Math.abs(aus.solarArcDegAtFrom - aus.ageAtFrom) < 2.0, `ส่วนโค้งอาทิตย์ ≈ อายุ (arc ${aus.solarArcDegAtFrom}° vs อายุ ${aus.ageAtFrom}) — สูตรจริง Sun เร็ว ~1.019°/วันช่วงใกล้ perihelion`);
ok(aus.solarArcDegAtFrom > 40 && aus.solarArcDegAtFrom < 43, `arc(อายุ41) อยู่ราว 41-42° (ได้ ${aus.solarArcDegAtFrom})`);
const arcRate = aus.solarArcDegAtTo - aus.solarArcDegAtFrom;      // ต่อ ~1 ปี
ok(arcRate > 0.9 && arcRate < 1.1, `☉เคลื่อน (secondary) ~1°/ปี (ได้ ${arcRate.toFixed(3)}°/ปี)`);
ok(aus.solarArcDegAtTo > aus.solarArcDegAtFrom, "ส่วนโค้งอาทิตย์เพิ่ม monotonic");

console.log("\n=== 4) transit hit วันรู้ค่า (fixture · เทียบ ephemeris โดยตรง) ===");
const transitEvents = aus.events.filter((e) => e.method === "transit");
ok(transitEvents.length > 0, "มี event ดาวจร");
// recompute ทุก transit event เทียบตำแหน่งดาวจริง ณ เที่ยงวันของวันนั้น — orb ต้องตรง (พิสูจน์ไม่ได้เดา)
let fixtureOk = true, worstDelta = 0;
for (const e of transitEvents) {
  const lon = eclipticLon(e.mover, noonUTC(e.dateISO));
  const orbArcmin = nearestHardAspect(lon, e.natalTargetLon).orbDeg * 60;
  const delta = Math.abs(orbArcmin - e.orbArcmin);
  worstDelta = Math.max(worstDelta, delta);
  if (delta > 0.2) fixtureOk = false;
}
ok(fixtureOk, `ทุก transit orb ตรงกับ ephemeris จริง (คลาดสูงสุด ${worstDelta.toFixed(3)}′ ≤ 0.2′)`);
// orb ทุก transit ≤ limit (fast 30′ / slow 60′)
const FAST = new Set(["Sun", "Mercury", "Venus", "Mars"]);
ok(transitEvents.every((e) => e.orbArcmin <= (FAST.has(e.mover) ? 30 : 60) + 1e-6), "ทุก transit orb ≤ limit (เร็ว 30′ · ช้า 60′)");
ok(transitEvents.every((e) => HARD_ASPECTS.includes(e.aspect)), "ทุก transit aspect ∈ {0,45,90,135,180}");

console.log("\n=== 5) directed/progressed: ชั้นเวลา 3 แบบทำงาน + คณิตแม่น (bisect exact) ===");
ok(aus.methodCounts.transit > 0, "methodCounts.transit > 0");
ok(aus.methods.includes("solar_arc") && aus.methods.includes("prog_sun") && aus.methods.includes("prog_moon") && aus.methods.includes("prog_mc"), "methods มีครบ transit/solar_arc/prog_sun/prog_moon/prog_mc (มีเวลาเกิด)");
const timing = aus.events.filter((e) => e.method !== "transit");
ok(aus.methodCounts.solar_arc + aus.methodCounts.prog_mc + aus.methodCounts.prog_moon > 0, "ชั้นเวลา (directed/progressed) ผลิต event จริง (arc/prog_mc/prog_moon)");
ok(timing.every((e) => e.orbArcmin < 5), "directed/progressed ทุก event orb คม (<5′ · bisect ลู่เข้า = ไม่เดา)");
ok(timing.every((e) => HARD_ASPECTS.includes(e.aspect)), "directed/progressed aspect ∈ {0,45,90,135,180}");
// prog_mc มีเฉพาะมีเวลาเกิด — no-time ต้องไม่มี
const ausNoTime = computeUranianAuslosung(chartNoTime, aeawUTC, "2026-01-01", "2026-12-31");
ok(!ausNoTime.methods.includes("prog_mc") && ausNoTime.methodCounts.prog_mc === 0, "no-time: ไม่มี Meridian เคลื่อน (prog_mc)");
ok(ausNoTime.events.length >= 0 && ausNoTime.groups.every((g) => g.targetKind !== "midpoint" || true), "no-time: compute ไม่ throw");

console.log("\n=== 6) TNP รอ swisseph + ไม่มีดาวต้องห้ามหลุด ===");
ok(aus.notAvailable.includes("witteTransneptunianPositions"), "notAvailable: TNP Witte ยังไม่คำนวณตำแหน่ง (รอ swisseph เฟส 2)");
ok(aus.notAvailable.includes("transitMoon"), "notAvailable: transitMoon (จันทร์จร snapshot=สุ่ม · ตัดจงใจ)");
ok(!transitEvents.some((e) => e.mover === "Moon"), "ดาวจร: ไม่มีจันทร์ (ตัดออก)");
const BAD = /Cupido|Hades|Kronos|Zeus|Apollon|Admetos|Vulkanus|Poseidon/;
const blob = JSON.stringify({ events: aus.events, groups: aus.groups });
ok(!BAD.test(blob), "ไม่มี TNP/Lefeldt หลุดเป็น mover/target (ยัง notAvailable)");
ok(WITTE_TNP.length === 4 && !EXCLUDED_TNP.some((n) => BAD.test(n) && blob.includes(n)), "Cupido/Hades/Kronos/Zeus + Lefeldt ไม่ถูกคำนวณตำแหน่งในชั้นเวลา");

console.log("\n=== 7) deterministic (รัน 2 ครั้งเท่ากันเป๊ะ · ไม่มี Date.now ใน logic) ===");
const aus2 = computeUranianAuslosung(chart, aeawUTC, "2026-01-01", "2026-12-31");
ok(JSON.stringify(aus) === JSON.stringify(aus2), "computeUranianAuslosung deterministic ×2");

console.log("\n=== 8) packet integration (additive · render เดิมไม่พัง) ===");
const packetWith = buildUranianPacket(chart, aus);
const packetNone = buildUranianPacket(chart);
ok(packetWith.auslosung && packetWith.auslosung.version === "uranian-auslosung-v1", "packet(chart,aus).auslosung มีจริง");
ok(packetNone.auslosung === null, "packet(chart).auslosung = null (additive · caller เดิมไม่พัง)");
ok(packetWith.data.personalPoints.length === 10 && packetWith.nodeType === "mean", "packet.data.personalPoints=10 + nodeType=mean (r392)");
let renderOk = true;
try { const p = renderUranianPrompt(packetWith); if (!/Halbsumme/.test(p)) renderOk = false; } catch { renderOk = false; }
ok(renderOk, "renderUranianPrompt(packet+auslosung) ไม่ throw + ยังมี Halbsumme (render.ts เดิมเข้ากันได้)");

console.log("\n=== 9) cap + จัดกลุ่มตามจุดไวกำเนิด ===");
ok(aus.events.length <= AUSLOSUNG_MAX_EVENTS, `events ≤ ${AUSLOSUNG_MAX_EVENTS}`);
ok(aus.groups.length <= AUSLOSUNG_MAX_GROUPS, `groups ≤ ${AUSLOSUNG_MAX_GROUPS}`);
ok(aus.groups.every((g) => g.events.length <= AUSLOSUNG_MAX_PER_GROUP), `แต่ละกลุ่ม ≤ ${AUSLOSUNG_MAX_PER_GROUP} event`);
// เรียงตามวัน (flat) — คัดคมสุดทั้งช่วง ไม่ใช่แค่ต้นปี
const dates = aus.events.map((e) => e.dateISO);
ok(JSON.stringify(dates) === JSON.stringify([...dates].sort()), "events เรียงตามวัน (ascending)");
ok(dates[dates.length - 1] > "2026-06-01", "คัดคมทั้งปี (มี event หลังกลางปี ไม่ใช่แค่ ม.ค.)");

console.log("\n=== 10) ตัวอย่างจริง: จุดเมริเดียน/จันทร์+เนปจูน (natal orb 0.059°) ถูกปลุกปี 2026 ===");
const gMN = aus.groups.find((g) => g.targetKey === "Moon+Neptune" && g.targetKind === "sum");
ok(!!gMN, "กลุ่ม ☽+♆ (จุดผลรวม) โผล่ในกลุ่มเด่น (จัดตามความคม natal)");
if (gMN) {
  ok(/เมริเดียน/.test(gMN.formula) && /0\.059/.test(gMN.formula), `formula ระบุ natal เมริเดียนทับ orb 0.059° (${gMN.formula})`);
  ok(gMN.signTh === "มังกร" && Math.abs(gMN.signDeg - 22.38) < 0.1, `อยู่ราศีมังกร ~22°23' (ได้ ${gMN.signTh} ${gMN.signDeg}°)`);
  ok(gMN.events.length > 0 && gMN.events.every((e) => HARD_ASPECTS.includes(e.aspect)), "มีวันถูกปลุกจริง + ทุก event มุมแข็งถูกต้อง");
  console.log("  วันที่ถูกปลุก (จากผังจริง):");
  for (const e of gMN.events) console.log(`    ${e.dateISO} · ${e.moverTh} ${e.aspectTh} · orb ${e.orbArcmin}′ ${e.applying ? "เข้าหา" : "แยกออก"}`);
}

console.log(`\n=== FUSION5 URANIAN AUSLÖSUNG (r389): ${pass} passed · ${fail} failed ===`);
if (fail) process.exit(1);
