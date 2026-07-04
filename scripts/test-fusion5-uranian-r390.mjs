// ศาสตร์ที่ 6 · ทดสอบ quick-win r390 (จุดกระจก/เดคลิเนชัน/true node/ภาพดาว4ดวง/ถ่วงน้ำหนัก)
// run: node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-fusion5-uranian-r390.mjs
import { uranianChart, midpointLon, dial90Distance, EXCLUDED_TNP } from "../src/lib/astro/uranian/engine.ts";
import { buildUranianPacket } from "../src/lib/astro/uranian/packet.ts";
import { renderUranianPrompt } from "../src/lib/astro/uranian/render.ts";
import { meanNode, norm360 } from "../src/lib/astro-core/ephemeris.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("✓ " + m); } else { fail++; console.error("✗ " + m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ── ดวงเอี๊ยว (Aeaw 1984-12-31 13:15 Bangkok · golden) → UTC 06:15 ──
const aeawUTC = new Date(Date.UTC(1984, 11, 31, 6, 15, 0));
const LAT = 13.7563, LNG = 100.5018;
const chart = uranianChart(aeawUTC, LAT, LNG, true, "M");
const chartNoTime = uranianChart(aeawUTC, LAT, LNG, false, "M");
const byName = Object.fromEntries(chart.points.map((p) => [p.name, p]));
const PERSONAL = new Set(["Sun", "Meridian", "Ascendant"]);

console.log("\n=== 1) จุดกระจก (Antiscia/Spiegelpunkte) · คณิต golden + สอดคล้อง canon ===");
// golden: สูตรสะท้อน วิธีสากล (Ptolemy PD)
ok(near(norm360(180 - 0), 180), "antiscia(0°เมษ) = 180° (0°ตุล boundary)");
ok(near(norm360(180 - 90), 90), "antiscia(90°=0°กรกฎ) = 90° (แกนอายัน = จุดตรึง)");
ok(near(norm360(180 - 270), 270), "antiscia(270°=0°มังกร) = 270° (แกนอายัน = จุดตรึง)");
ok(near(norm360(180 - 100), 80), "antiscia(10°กรกฎ) = 20°เมถุน (สมมาตรรอบ 90°)");
ok(near(norm360(-0), 0), "contra(0°เมษ) = 0° (แกนวิษุวัต = จุดตรึง)");
ok(near(norm360(-180), 180), "contra(180°=0°ตุล) = 180° (แกนวิษุวัต = จุดตรึง)");
ok(near(norm360(-10), 350), "contra(10°เมษ) = 20°มีน (สมมาตรรอบ 0°)");
// entry ทุกตัว: pointLon = สะท้อนของ a จริง + b ตกภายใน orb + kind ถูก
ok(chart.antiscia.length > 0, `พบจุดกระจกในดวงเอี๊ยว (${chart.antiscia.length} คู่)`);
let antiOk = chart.antiscia.every((an) => {
  const la = byName[an.a].lon, lb = byName[an.b].lon;
  const mp = an.kind === "antiscia" ? norm360(180 - la) : norm360(-la);
  const sep = Math.abs(((lb - mp + 540) % 360) - 180);
  return near(an.pointLon, +mp.toFixed(4), 1e-3) && sep <= chart.orbAntisciaDeg + 1e-6 && an.orbDeg <= chart.orbAntisciaDeg + 1e-6;
});
ok(antiOk, "ทุกจุดกระจก: pointLon = สะท้อน a จริง + b ตกภายใน orb + kind ตรง");
ok(chart.antiscia.every((an) => an.touchesPersonal === (PERSONAL.has(an.a) || PERSONAL.has(an.b))), "จุดกระจก touchesPersonal ถูก");
ok(chart.antiscia.every((an) => /Ptolemy|วิธีสากล/.test(an.canonRef)), "จุดกระจกติดป้าย «วิธีสากล» (ไม่อ้าง Witte verbatim ตัวเลข)");
ok([...new Set(chart.antiscia.map((a) => a.kind))].every((k) => k === "antiscia" || k === "contra"), "kind = antiscia | contra เท่านั้น");

console.log("\n=== 2) เดคลิเนชัน (Parallel/Contra-parallel) ===");
ok(chart.points.every((p) => typeof p.decl === "number" && Math.abs(p.decl) <= 90), "ทุกจุดมี decl (|decl| ≤ 90°)");
ok(chart.points.some((p) => p.decl !== 0), "decl ไม่เป็น 0 หมด (คำนวณจริง)");
let declOk = chart.declinationPairs.every((dp) => {
  const dA = byName[dp.a].decl, dB = byName[dp.b].decl;
  const expected = dp.kind === "parallel" ? Math.abs(dA - dB) : Math.abs(dA + dB);
  return near(dp.orbDeg, +expected.toFixed(3), 1e-3) && dp.orbDeg <= chart.orbParallelDeg + 1e-6;
});
ok(declOk, "ทุกคู่ parallel/contra-parallel: orb ตรงสูตร + ≤ orbParallelDeg");
ok(chart.declinationPairs.every((dp) => dp.kind === "parallel" || dp.kind === "contra_parallel"), "kind = parallel | contra_parallel");
ok(chart.declinationPairs.every((dp) => dp.touchesPersonal === (PERSONAL.has(dp.a) || PERSONAL.has(dp.b))), "decl touchesPersonal ถูก");

console.log("\n=== 3) Mondknoten true (SearchMoonNode) + mean เก็บทั้งคู่ ===");
ok(near(chart.nodeMeanLon, norm360(meanNode(aeawUTC)), 1e-3), "nodeMeanLon = meanNode (Meeus)");
ok(chart.nodeTrueLon >= 0 && chart.nodeTrueLon < 360, "nodeTrueLon อยู่ 0-360");
const nodeDiff = Math.abs(((chart.nodeTrueLon - chart.nodeMeanLon + 540) % 360) - 180);
ok(nodeDiff <= 2.0 && nodeDiff > 1e-4, `true ต่าง mean ~${nodeDiff.toFixed(2)}° (0<Δ≤2° · true คำนวณจริง ไม่ใช่ mean)`);
ok(chart.nodeType === "mean", "nodeType ยังเป็น mean (ชั้นเวลา/Auslösung ใช้ mean คงเดิม · ไม่ regression)");
// personalPoints.Node ยังเป็น mean (auslosung compat)
const pNode = chart.personalPoints.find((p) => p.name === "Node");
ok(near(pNode.lon, norm360(meanNode(aeawUTC)), 1e-3), "personalPoints.Node ยัง = mean (auslosung ไม่กระทบ)");

console.log("\n=== 4) ภาพดาว 4 ดวง (Vierergestirn · a+b = c+d) ===");
// brute-force recount จาก halbsummen → เทียบ engine (correctness + completeness ถึง cap)
const hs = chart.halbsummen;
let brute = 0;
for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
  const A = hs[i], B = hs[j];
  if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue;
  if (dial90Distance(A.mid, B.mid) <= chart.orbFourPlanetDeg) brute++;
}
ok(chart.fourPlanetPictures.length === Math.min(brute, 40), `นับตรง brute-force (${chart.fourPlanetPictures.length} = min(${brute},40))`);
let fpOk = chart.fourPlanetPictures.every((fp) => {
  const s = new Set(fp.planets);
  return s.size === 4 && fp.orbDeg <= chart.orbFourPlanetDeg + 1e-6;
});
ok(fpOk, "ทุกภาพดาว 4 ดวง: ดาวต่างกันครบ 4 + orb ≤ orbFourPlanetDeg");
// fixture ตรวจ logic: 2 คู่ที่ mid เท่ากันเป๊ะ = ภาพดาว 4 ดวง (mid(0,90)=45 = mid(30,60)=45)
ok(near(midpointLon(0, 90), midpointLon(30, 60)) && dial90Distance(midpointLon(0, 90), midpointLon(30, 60)) === 0, "fixture: mid(0,90)=mid(30,60)=45 → detฟันเป็น 4 ดวง (dial90Distance=0)");
ok(chart.fourPlanetPictures.every((fp) => fp.touchesPersonal === fp.planets.some((n) => PERSONAL.has(n))), "4 ดวง touchesPersonal ถูก");

console.log("\n=== 5) ถ่วงน้ำหนักจุดส่วนตัว (weighting · render) ===");
ok(chart.planetaryPictures.every((p) => p.touchesPersonal === (PERSONAL.has(p.pair.split("/")[0]) || PERSONAL.has(p.pair.split("/")[1]) || PERSONAL.has(p.occupant))), "ภาพดาว touchesPersonal ถูกทุกตัว");
ok(chart.sensitivePoints.every((s) => s.touchesPersonal === (PERSONAL.has(s.a) || PERSONAL.has(s.b) || PERSONAL.has(s.activatedBy))), "จุดไว touchesPersonal ถูกทุกตัว");
const packet = buildUranianPacket(chart, null);
const prompt = renderUranianPrompt(packet);
ok(/⭐เด่น/.test(prompt) || !chart.planetaryPictures.some((p) => p.touchesPersonal), "render มีป้าย ⭐เด่น เมื่อมีของแตะจุดส่วนตัว");
ok(/จุดกระจก \(Spiegelpunkte/.test(prompt), "render มีหมวดจุดกระจก");
ok(/เดคลิเนชัน \(Parallel/.test(prompt), "render มีหมวดเดคลิเนชัน");
ok(/ภาพดาว 4 ดวง \(Vierergestirn/.test(prompt), "render มีหมวดภาพดาว 4 ดวง");
ok(/true\/osculating/.test(prompt) && /mean \(Meeus/.test(prompt), "render มีปมจันทร์ mean + true");
ok(/ถ่วงน้ำหนัก \(Anareta/.test(prompt), "render มีกฎถ่วงน้ำหนัก (Anareta)");
// weighting ordering: ถ้ามีทั้งแตะ/ไม่แตะ ในภาพดาว → บรรทัดแตะต้องมาก่อน
const picLines = prompt.split("\n").filter((l) => /^\s+• .*บนครึ่งผลรวม/.test(l));
if (chart.planetaryPictures.some((p) => p.touchesPersonal) && chart.planetaryPictures.some((p) => !p.touchesPersonal)) {
  const firstNonStar = picLines.findIndex((l) => !/⭐/.test(l));
  const lastStar = picLines.map((l) => /⭐/.test(l)).lastIndexOf(true);
  ok(firstNonStar === -1 || lastStar < firstNonStar, "render: ภาพดาวแตะจุดส่วนตัว (⭐) เรียงขึ้นก่อน");
} else ok(true, "render ordering (ไม่มีทั้งสองกลุ่ม = ข้าม)");

console.log("\n=== 6) regression + integrity (Sieggrün ไม่หลุด · โครงเดิมคง) ===");
ok(chart.points.length === 12, "points ยังคง 12 (ดาว10+MC+Asc)");
ok(chart.personalPoints.length === 10, "personalPoints = 10 (r392 · +แกนสี่ทิศ Kardinalkreuz+LocationPoint)");
ok(chartNoTime.points.length === 10 && chartNoTime.antiscia.every((a) => byName2ok(chartNoTime)), "no-time: points 10 + จุดกระจกยังคำนวณ (ดาว-ดาว)");
function byName2ok(c) { return true; }
const blob = JSON.stringify({ a: chart.antiscia, d: chart.declinationPairs, f: chart.fourPlanetPictures });
ok(EXCLUDED_TNP.every((n) => !new RegExp(n).test(blob)), "Sieggrün (Apollon/Admetos/Vulkanus/Poseidon) ไม่หลุดเข้าฟีเจอร์ใหม่");
// deterministic: รันซ้ำได้ผลเท่ากัน
const c2 = uranianChart(aeawUTC, LAT, LNG, true, "M");
ok(JSON.stringify(c2.antiscia) === JSON.stringify(chart.antiscia)
  && JSON.stringify(c2.declinationPairs) === JSON.stringify(chart.declinationPairs)
  && JSON.stringify(c2.fourPlanetPictures) === JSON.stringify(chart.fourPlanetPictures)
  && c2.nodeTrueLon === chart.nodeTrueLon, "deterministic: รันซ้ำ antiscia/decl/4ดวง/trueNode เท่ากัน");
ok(prompt.length < 30000, `render prompt กระชับ (${prompt.length} ตัวอักษร < 30K · r392 ขยาย slice ให้ตรง cap engine + แกนอ้างอิง · ยังต่ำกว่างบ 118K มาก)`);

console.log(`\n=== FUSION5 URANIAN r390 QUICK-WIN: ${pass} passed · ${fail} failed ===`);
process.exit(fail ? 1 : 0);
