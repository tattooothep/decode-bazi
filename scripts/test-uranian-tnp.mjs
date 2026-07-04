// ศาสตร์ที่ 6 · ทดสอบเครื่องคำนวณตำแหน่งทรานส์เนปจูน Witte (r391-tnp · Kepler mean-element)
// run: node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-uranian-tnp.mjs
import {
  witteTnpPositions, tnpPosition, solveEccentricAnomaly, decimalYearUTC,
  TNP_ELEMENTS, TNP_NOT_COMPUTABLE, TNP_POSITION_SOURCE, TNP_PRECISION_NOTE,
} from "../src/lib/astro/uranian/tnp-kepler.ts";
import { uranianChart } from "../src/lib/astro/uranian/engine.ts";
import { buildUranianPacket } from "../src/lib/astro/uranian/packet.ts";
import { renderUranianPrompt } from "../src/lib/astro/uranian/render.ts";
import { computeUranianAuslosung } from "../src/lib/astro/uranian/auslosung.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("✓ " + m); } else { fail++; console.error("✗ " + m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const SIGN = ["เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์", "ตุล", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน"];
const LEO = 4, PISCES = 11, LIBRA = 6;

// ── ดวงเอี๊ยว (Aeaw 1984-12-31 13:15 Bangkok · golden) → UTC 06:15 ──
const aeawUTC = new Date(Date.UTC(1984, 11, 31, 6, 15, 0));
const LAT = 13.7563, LNG = 100.5018;

console.log("\n=== 1) Kepler solver golden (mean → eccentric [Newton] → true) ===");
// e=0 → E=M ทันที
ok(near(solveEccentricAnomaly(1.2345, 0), 1.2345, 1e-12), "e=0 → E=M (วงกลม · degenerate ถูก)");
// round-trip: M = E − e·sinE (สมการเคปเลอร์) สำหรับหลายค่า e/M
for (const e of [0.0, 0.1, 0.3, 0.6, 0.9]) {
  for (const M of [0.3, 1.0, Math.PI / 2, 2.5, 3.0]) {
    const E = solveEccentricAnomaly(M, e);
    ok(near(E - e * Math.sin(E), M, 1e-9), `Kepler round-trip e=${e} M=${M.toFixed(2)} → E−e·sinE=M`);
  }
}
// decimalYearUTC
ok(near(decimalYearUTC(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), 2000, 1e-9), "decimalYearUTC(2000-01-01)=2000");
ok(Math.abs(decimalYearUTC(new Date(Date.UTC(2000, 6, 2, 0, 0, 0))) - 2000.5) < 0.01, "decimalYearUTC กลางปี ≈ .5");

console.log("\n=== 2) golden เทียบตาราง Witte เอง (บทความ PD · verbatim) ===");
const cup = TNP_ELEMENTS.find((e) => e.name === "Cupido");
const had = TNP_ELEMENTS.find((e) => e.name === "Hades");
const kro = TNP_ELEMENTS.find((e) => e.name === "Kronos");
// Cupido "Lauf 1923-24" (บท 19): 8 มิ.ย. = 16°07'♌ · 10 พ.ย. = 19°19'♌ (geozentrisch)
const cJun = tnpPosition(cup, new Date(Date.UTC(1923, 5, 8, 12, 0, 0)));
const cNov = tnpPosition(cup, new Date(Date.UTC(1923, 10, 10, 12, 0, 0)));
ok(cJun.sign === LEO && Math.abs(cJun.signDeg - 16.12) < 1.0, `Cupido 8มิ.ย.1923 = ${cJun.signDeg.toFixed(2)}°สิงห์ ≈ Witte 16°07'♌ (±1°)`);
ok(cNov.sign === LEO && Math.abs(cNov.signDeg - 19.32) < 1.0, `Cupido 10พ.ย.1923 = ${cNov.signDeg.toFixed(2)}°สิงห์ ≈ Witte 19°19'♌ (±1°)`);
ok(cNov.lon > cJun.lon, "Cupido มิ.ย.→พ.ย. 1923 เคลื่อนไปข้างหน้า (loop geocentric)");
// Kronos ตัวอย่าง Friedrich Ebert (บท 27): 1870 = 27°10'♓
const kEbert = tnpPosition(kro, new Date(Date.UTC(1871, 1, 4, 12, 0, 0)));
ok(kEbert.sign === PISCES && Math.abs(kEbert.signDeg - 27.17) < 1.0, `Kronos 1871 = ${kEbert.signDeg.toFixed(2)}°มีน ≈ Witte 27°10'♓ (±1°)`);
// Hades anchor (บท 40 · Napoleon 1769): heliocentric ต้องตรง 203.97° เป๊ะ (จุดยึด)
const hNap = tnpPosition(had, new Date(Date.UTC(1769, 7, 15, 12, 0, 0)));
ok(Math.abs(hNap.helioLon - 203.97) < 0.15, `Hades helioLon 1769 = ${hNap.helioLon.toFixed(2)}° ≈ anchor Witte 203,97° (Napoleon)`);
ok(hNap.sign === LIBRA, `Hades 1769 geocentric = ${hNap.signDeg.toFixed(2)}°ตุล (≈ Witte "Ort des Hades 23°58'♎")`);
// Kepler 3rd law self-consistency (a^1.5 = T · ยืนยัน a & T เป็นคู่ที่สอดคล้องของ Witte)
for (const el of TNP_ELEMENTS) {
  ok(Math.abs(Math.pow(el.a, 1.5) - el.periodYears) / el.periodYears < 0.01, `${el.name}: a^1.5=${Math.pow(el.a, 1.5).toFixed(1)} ≈ T=${el.periodYears} (Kepler 3rd law สอดคล้อง)`);
}

console.log("\n=== 3) 4 ดวง Witte · 3 คำนวณได้ + Zeus ขาด element (ห้ามเดา) ===");
const P = witteTnpPositions(aeawUTC);
ok(P.computed.length === 3, `คำนวณได้ 3 ดวง (Cupido/Hades/Kronos) · ได้ ${P.computed.length}`);
ok(P.computed.every((p) => p.lon >= 0 && p.lon < 360 && p.sign >= 0 && p.sign <= 11), "ทุกดวง lon∈[0,360) + ราศีถูกช่วง");
ok(P.computed.every((p) => Number.isFinite(p.dial90) && p.dial90 >= 0 && p.dial90 < 90), "dial90 ∈ [0,90)");
ok(P.computed.every((p) => p.precision === "mean_element_fictitious"), "ทุกดวงติดป้าย precision = mean_element_fictitious");
ok(P.notComputable.length === 1 && P.notComputable[0].name === "Zeus", "Zeus อยู่ใน notComputable (ตาราง element หาย)");
ok(P.notComputable[0].missing.some((m) => /a |Entfernung/.test(m)) && P.notComputable[0].missing.some((m) => /anchor/.test(m)), "Zeus ระบุ element ที่ขาด (a/anchor ฯลฯ · ไม่แต่งตัวเลข)");
// element ที่ขาดของ 3 ดวง (Exzentrizität + ω) ต้องประกาศตรง ๆ
ok(TNP_ELEMENTS.every((el) => el.missing.some((m) => /Exzentri/.test(m))), "ทุกดวงประกาศว่า e (Exzentrizität) ไม่มีในคัมภีร์ (ใช้ e=0 Kreislinie)");
ok(TNP_ELEMENTS.every((el) => el.eccentricity === 0 && el.eccentricityGiven === false), "e=0 + eccentricityGiven=false (โมเดลวงกลมของ Witte เอง)");
ok(had.inclGiven && had.nodeGiven && Math.abs(had.nodeDeg - 162) < 0.01, "Hades มี i(1°03')+Ω(12°♍=162°) จากบท 39 (given=true)");
ok(!cup.nodeGiven && !cup.inclGiven && !kro.nodeGiven, "Cupido/Kronos: Ω/i ไม่มีในคัมภีร์ → given=false (ไม่เดา · i=0)");

console.log("\n=== 4) deterministic (รัน 2 ครั้งเท่ากันเป๊ะ · ไม่มี Date.now/Math.random) ===");
ok(JSON.stringify(witteTnpPositions(aeawUTC)) === JSON.stringify(witteTnpPositions(aeawUTC)), "witteTnpPositions deterministic");
ok(JSON.stringify(uranianChart(aeawUTC, LAT, LNG, true, "M").tnpPoints) === JSON.stringify(uranianChart(aeawUTC, LAT, LNG, true, "M").tnpPoints), "chart.tnpPoints deterministic");

console.log("\n=== 5) guard Sieggrün ไม่หลุด (solver เฉพาะ 4 ดวง Witte) ===");
const blobAll = JSON.stringify({ P, elements: TNP_ELEMENTS, notComp: TNP_NOT_COMPUTABLE });
ok(!/Apollon|Admetos|Vulkanus|Poseidon/.test(blobAll), "ไม่มี Apollon/Admetos/Vulkanus/Poseidon (Lefeldt/Sieggrün) ใน engine TNP");
ok(TNP_ELEMENTS.every((el) => ["Cupido", "Hades", "Kronos"].includes(el.name)), "TNP_ELEMENTS = เฉพาะ Cupido/Hades/Kronos");

console.log("\n=== 6) precision note มี + ห้ามอวดเกินจริง ===");
ok(TNP_POSITION_SOURCE === "witte_pd_kepler_mean_element_r391", "source label = witte_pd_kepler_mean_element_r391");
ok(/mean-element|fictitious|วงกลม/.test(TNP_PRECISION_NOTE) && /±1[–-]2°|องศา/.test(TNP_PRECISION_NOTE), "precisionNote ระบุ mean-element + ~±1–2° (ไม่ใช่ดาวจริงวินาที)");

console.log("\n=== 7) wire เข้า chart/packet/render/auslosung (additive · ไม่กระทบของเดิม) ===");
const chart = uranianChart(aeawUTC, LAT, LNG, true, "M");
ok(chart.tnpPoints.length === 3, "chart.tnpPoints = 3 ดวง");
ok(chart.points.length === 12, "chart.points ยัง 12 (10 ดาว+MC+Asc · additive ไม่ปน)");
ok(chart.tnpPositionSource === "witte_pd_ephemeris_not_wired_phase1", "tnpPositionSource ลิเทอรัลเดิมคงไว้ (backward-compat · dial ไม่พัง)");
ok(chart.tnpPositionSourceKepler === TNP_POSITION_SOURCE, "tnpPositionSourceKepler = ป้ายเฟส 2");
ok(chart.tnpPlanetaryPictures.every((pic) => pic.involves.length >= 1 && pic.involves.every((n) => ["Cupido", "Hades", "Kronos"].includes(n))), "tnpPlanetaryPictures ทุกอันมี TNP ร่วม (Cupido/Hades/Kronos)");
ok(chart.tnpSensitivePoints.every((sp) => sp.involves.length >= 1), "tnpSensitivePoints ทุกอันมี TNP ร่วม");
const packet = buildUranianPacket(chart);
ok(packet.data.tnpPoints.length === 3 && packet.tnpPositionSourceKepler === TNP_POSITION_SOURCE, "packet เผย tnpPoints + source เฟส 2");
ok(packet.notAvailable.includes("zeus_position") && !packet.notAvailable.includes("witteTransneptunianPositions"), "packet.notAvailable = zeus_position เท่านั้น (Cupido/Hades/Kronos คำนวณแล้ว · เลิกป้ายเหมาทั้งก้อน · r392)");
const prompt = renderUranianPrompt(packet);
ok(/คิวปิโด/.test(prompt) && /ฮาเดส/.test(prompt) && /โครนอส/.test(prompt), "render prompt โชว์ตำแหน่ง Cupido/Hades/Kronos (ไทย)");
ok(/เซอุส/.test(prompt) && /ยังคำนวณตำแหน่งไม่ได้/.test(prompt), "render prompt: Zeus ยังคำนวณไม่ได้ (แจ้งตรง ๆ)");
ok(/mean-element|±1[–-]2°/.test(prompt), "render prompt มี precision note (ห้ามยึดองศา)");
ok(!/(Halbsumme|ครึ่งผลรวม)\s+\S*(Apollon|Admetos|Vulkanus|Poseidon)/.test(prompt), "prompt: ไม่มี Lefeldt ในภาพดาว");
// auslosung
const aus = computeUranianAuslosung(chart, aeawUTC, "2026-01-01", "2026-12-31");
ok(Array.isArray(aus.tnpActivations), "auslosung มี tnpActivations (ดาวจรจริงแตะจุด TNP กำเนิด)");
ok(Array.isArray(aus.tnpMoverContacts), "auslosung มี tnpMoverContacts (TNP เป็นตัวกระตุ้นช้า)");
const ausBlob = JSON.stringify({ events: aus.events, groups: aus.groups });
ok(!/Cupido|Hades|Kronos|Zeus/.test(ausBlob), "events/groups เดิม ไม่มี TNP ปน (แยก precision · regression ไม่พัง)");
ok(aus.tnpActivations.every((e) => ["Cupido", "Hades", "Kronos"].includes(e.natalTarget)), "tnpActivations: target = จุด TNP กำเนิด เท่านั้น");
ok(aus.tnpMoverContacts.every((e) => ["Cupido", "Hades", "Kronos"].includes(e.mover)), "tnpMoverContacts: mover = TNP เท่านั้น");

console.log("\n=== 8) รายงานตำแหน่ง TNP ดวงเอี๊ยว (Aeaw 1984) ===");
for (const p of P.computed) console.log(`   ${p.nameTh} = ${p.signDeg.toFixed(2)}° ${SIGN[p.sign]} (lon ${p.lon}°)`);
console.log(`   เซอุส (Zeus) = คำนวณไม่ได้ (element หาย)`);

console.log(`\n=== URANIAN TNP (r391): ${pass} passed · ${fail} failed ===`);
if (fail) process.exit(1);
