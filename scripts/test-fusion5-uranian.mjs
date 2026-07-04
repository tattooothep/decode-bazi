// ศาสตร์ที่ 6 · ทดสอบยูเรเนียน (Uranian / Hamburger Schule · Witte) — เฟส 1 แผงอ่าน
// run: node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-fusion5-uranian.mjs
import { DISCIPLINES, availableSciences, computeYam } from "../src/lib/fusion5/disciplines.ts";
import { uranianChart, midpointLon, dial90Distance, WITTE_TNP, EXCLUDED_TNP } from "../src/lib/astro/uranian/engine.ts";
import { buildUranianPacket } from "../src/lib/astro/uranian/packet.ts";
import { renderUranianPrompt } from "../src/lib/astro/uranian/render.ts";
import { buildSciencePrompt, FUSION_PANEL_PROMPT_MAX_CHARS, loadCanonBundle } from "../src/lib/fusion5/build-prompt.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("✓ " + m); } else { fail++; console.error("✗ " + m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ── ดวงเอี๊ยว (Aeaw 1984-12-31 13:15 Bangkok · golden ปาจื้อ) → UTC 06:15 ──
const aeawUTC = new Date(Date.UTC(1984, 11, 31, 6, 15, 0));
const LAT = 13.7563, LNG = 100.5018;
const mkBirth = (hasTime = true) => ({ name: "เอี๊ยว", dtUTC: aeawUTC, lat: LAT, lng: LNG, hasTime, gender: "M" });

console.log("\n=== 1) disciplines: registry 6 ศาสตร์ + computeYam ===");
ok(DISCIPLINES.uranian && DISCIPLINES.uranian.available === true, "DISCIPLINES.uranian มีจริง + available");
ok(DISCIPLINES.uranian.defaultModel === "claude-max-cli", "uranian defaultModel = claude-max-cli");
ok(DISCIPLINES.uranian.needsBirthTime === false, "uranian needsBirthTime = false (degraded no-time ได้)");
ok(DISCIPLINES.uranian.costYam === 12, "uranian costYam = 12");
ok(/Halbsumme/.test(DISCIPLINES.uranian.termGuard) && /ห้ามปนศัพท์จีน/.test(DISCIPLINES.uranian.termGuard), "termGuard ระบุ Halbsumme + ห้ามปนศัพท์จีน");
const avail = availableSciences();
ok(avail.includes("uranian") && avail.length === 6, "availableSciences มี uranian ครบ 6 ศาสตร์");
// computeYam: 1 ดวง เดี่ยว = costYam · 2 ศาสตร์ = + judge 5
ok(computeYam(["uranian"], 1) === 12, "computeYam([uranian],1) = 12");
ok(computeYam(["uranian", "western"], 1) === 12 + 10 + 5, "computeYam([uranian,western],1) = 12+10+judge5 = 27");
ok(computeYam(["bazi", "qizheng", "ziwei", "western", "vedic", "uranian"], 1) === 10 + 15 + 12 + 10 + 10 + 12 + 5, "computeYam 6 ศาสตร์ 1 ดวง ถูก (รวม judge)");

console.log("\n=== 2) engine: จุดกึ่งกลาง (Halbsumme) golden + dial 90° ===");
ok(near(midpointLon(0, 90), 45), "mid(0°,90°) = 45°");
ok(near(midpointLon(350, 10), 0), "mid(350°,10°) = 0° (wrap ข้ามศูนย์)");
ok(near(midpointLon(10, 350), 0), "mid(10°,350°) = 0° (สลับลำดับ = เดิม)");
ok(near(midpointLon(120, 240), 180), "mid(120°,240°) = 180°");
// dial 90°: ครอบ 0/90/180/270 = ระยะเดียวกัน
ok(near(dial90Distance(45, 45), 0), "dial90Distance(45,45) = 0");
ok(near(dial90Distance(135, 45), 0), "dial90Distance(135,45) = 0 (ห่าง 90° = ทับบน dial)");
ok(near(dial90Distance(225, 45), 0), "dial90Distance(225,45) = 0 (ห่าง 180°)");
ok(near(dial90Distance(46, 45), 1), "dial90Distance(46,45) = 1°");
ok(near(dial90Distance(44.5, 45), 0.5), "dial90Distance(44.5,45) = 0.5°");

console.log("\n=== 2b) engine: planetary picture ยิงถูก orb + no throw + deterministic ===");
let chart;
try { chart = uranianChart(aeawUTC, LAT, LNG, true, "M"); ok(true, "uranianChart (มีเวลา) ไม่ throw"); }
catch (e) { ok(false, "uranianChart throw: " + e.message); }
ok(chart.points.length === 12, "มีจุด 12 (ดาวจริง 10 + Meridian + Aszendent)");
// ทุก planetary picture ต้อง orb ≤ orb ของชั้นตัวเอง (hard=orbPictureDeg · secondary=orbPictureSecondaryDeg) + มี tier
let picOk = chart.planetaryPictures.every((p) =>
  (p.tier === "hard" || p.tier === "secondary") &&
  p.orbDeg <= (p.tier === "hard" ? chart.orbPictureDeg : chart.orbPictureSecondaryDeg) + 1e-9);
ok(picOk, "ทุก planetary picture มี tier + orb ≤ orb ของชั้นตัวเอง (hard 1.5° / secondary 1.0°)");
// ตรวจภาพดาว: hard → occupant ตรงแกน 0/90/180 (dial90≤orb) · secondary → occupant ที่ 45°/135° (|dial90−45|≤orb) (recompute)
let pointByName = Object.fromEntries(chart.points.map((p) => [p.name, p]));
let picRecheck = chart.planetaryPictures.every((p) => {
  const [a, b] = p.pair.split("/");
  const mid = midpointLon(pointByName[a].lon, pointByName[b].lon);
  const dd = dial90Distance(pointByName[p.occupant].lon, mid);
  return p.tier === "hard"
    ? dd <= chart.orbPictureDeg + 1e-6
    : Math.abs(dd - 45) <= chart.orbPictureSecondaryDeg + 1e-6;
});
ok(picRecheck, "ภาพดาวทุกอันตรวจซ้ำ: hard=แกน 0/90/180 · secondary=มุม 45°/135° (แยกชั้นถูกต้อง)");
// deterministic: รันซ้ำได้ผลเท่ากัน
const chart2 = uranianChart(aeawUTC, LAT, LNG, true, "M");
ok(JSON.stringify(chart) === JSON.stringify(chart2), "uranianChart deterministic (รัน 2 ครั้งเท่ากัน)");

console.log("\n=== 2c) engine: no-time degraded ===");
const chartNoTime = uranianChart(aeawUTC, LAT, LNG, false, "M");
ok(chartNoTime.points.length === 10, "no-time = มีเฉพาะดาวจริง 10 (ไม่มี Meridian/Aszendent)");
ok(chartNoTime.degradeLevel === "partial", "no-time degradeLevel = partial");
ok(chartNoTime.points.some((p) => p.name === "Moon" && p.uncertain), "no-time: จันทร์ติดธง uncertain");

console.log("\n=== 3) packet + render: ไม่ throw + กฎเข้ม + ไม่มีดาว Lefeldt หลุด ===");
let packet, prompt;
try { packet = buildUranianPacket(chart); ok(true, "buildUranianPacket ไม่ throw"); }
catch (e) { ok(false, "buildUranianPacket throw: " + e.message); }
ok(packet.discipline === "uranian" && packet.packetVersion === "uranian-v1", "packet discipline/version ถูก");
ok(packet.notAvailable.includes("zeus_position") && !packet.notAvailable.includes("witteTransneptunianPositions"), "packet แจ้งเฉพาะ zeus_position (Cupido/Hades/Kronos คำนวณแล้ว r391 · เลิกป้ายเหมาทั้งก้อน · r392)");
try { prompt = renderUranianPrompt(packet); ok(true, "renderUranianPrompt ไม่ throw"); }
catch (e) { ok(false, "renderUranianPrompt throw: " + e.message); }
// no-time render ไม่ throw
try { renderUranianPrompt(buildUranianPacket(chartNoTime)); ok(true, "render no-time ไม่ throw"); }
catch (e) { ok(false, "render no-time throw: " + e.message); }
ok(/Halbsumme/.test(prompt) && /Planetenbild/.test(prompt) && /sensitive Punkte/.test(prompt), "prompt มีนิยาม Halbsumme/Planetenbild/sensitive Punkte");
ok(/verbatim/.test(prompt) && /Regelwerk/.test(prompt), "prompt มีกฎ verbatim + ห้ามลอก Regelwerk");
ok(/NO_PERCENT/.test(prompt), "prompt มี NO_PERCENT");
ok(/Cupido/.test(prompt) && /Hades/.test(prompt) && /Kronos/.test(prompt) && /Zeus/.test(prompt), "prompt มี TNP Witte 4 ดวง (Cupido/Hades/Kronos/Zeus)");
// ⛔ ดาว Lefeldt/Sieggrün ต้องปรากฏได้เฉพาะในบรรทัด «ตัดออก» เท่านั้น — ต้องไม่ถูกใช้เป็น body/picture
for (const bad of EXCLUDED_TNP) {
  ok(!chart.points.some((p) => p.name === bad), `engine points ไม่มี ${bad} (Lefeldt)`);
  ok(!WITTE_TNP.some((t) => t.name === bad), `WITTE_TNP ไม่มี ${bad}`);
}
ok(!/(Halbsumme|ครึ่งผลรวม)\s+\S*(Apollon|Admetos|Vulkanus|Poseidon)/.test(prompt), "ไม่มีดาว Lefeldt ในภาพดาว/ครึ่งผลรวม");

console.log("\n=== 3b) build-prompt: canon register + section splitter + budget 1-4 ดวง ===");
const bundle = loadCanonBundle("uranian");
ok(bundle.sourceMap.some((r) => r.file === "10-witte-canon-de.md" && r.licenseClass === "public_domain" && r.mode === "verbatim"), "SOURCE_MAP: 10-witte-canon-de.md = public_domain/verbatim");
ok(bundle.text.length > 0, "คัมภีร์ยูเรเนียนโหลดได้ (bundle.text ไม่ว่าง)");
// section splitter: method+tnp เสมอ (มีนิยาม Halbsumme + Hades)
ok(/Halbsumme/.test(bundle.text), "canon default มีหมวด A (Halbsumme)");
ok(/Hades/.test(bundle.text), "canon default มีหมวด H (ทรานส์เนปจูน)");

const questions = [
  "ช่วยดูภาพรวมชีวิตหน่อย",
  "ปีนี้การงานเป็นยังไง",
  "เรื่องความรัก คู่ครองเป็นแบบไหน",
];
let budgetOk = true, hasCanon = true;
for (const q of questions) {
  for (let n = 1; n <= 4; n++) {
    const births = Array.from({ length: n }, (_, i) => ({ ...mkBirth(true), name: "ดวง" + (i + 1) }));
    const p = buildSciencePrompt("uranian", births, q, "th", new Date("2026-06-30T00:00:00Z"));
    if (p.length > FUSION_PANEL_PROMPT_MAX_CHARS) budgetOk = false;
    if (!/Halbsumme/.test(p) || !/ผังโหราศาสตร์ยูเรเนียน/.test(p)) hasCanon = false;
  }
}
ok(budgetOk, `uranian: prompt 1-4 ดวง × ${questions.length} คำถาม ≤ ${FUSION_PANEL_PROMPT_MAX_CHARS}`);
ok(hasCanon, "uranian: ทุก prompt มีคัมภีร์ (Halbsumme) + หัวผังยูเรเนียน");
// no-time prompt ก็ต้องรอด + มี no-time guard
const pNoTime = buildSciencePrompt("uranian", [mkBirth(false)], "ดูภาพรวม", "th", new Date("2026-06-30T00:00:00Z"));
ok(pNoTime.length <= FUSION_PANEL_PROMPT_MAX_CHARS && /no-time/.test(pNoTime), "uranian no-time prompt ≤ budget + มี no-time guard");
// ดาว Lefeldt: ปรากฏได้เฉพาะในบรรทัด "ข้อห้าม/ตัดออก" (คัมภีร์+กฎ) — ห้ามอยู่ในบรรทัดข้อมูลคำนวณ (จุด/ภาพดาว/จุดไว)
const LEFELDT = /Apollon|Admetos|Vulkanus|Poseidon/;
const PROHIBIT = /⛔|ห้าม|ตัดออก|excluded|ลิขสิทธิ์|Sieggrün|หลังสงคราม|ไม่รวม|not\s|ยังไม่ PD|1946|1951|1959/;
const leakLines = pNoTime.split("\n").filter((ln) => LEFELDT.test(ln) && !PROHIBIT.test(ln));
ok(leakLines.length === 0, "prompt เต็ม: ดาว Lefeldt ปรากฏเฉพาะบรรทัดข้อห้าม/ตัดออก (ไม่หลุดเข้าข้อมูลคำนวณ)" + (leakLines.length ? " · leak: " + leakLines[0].slice(0, 60) : ""));
// ยืนยันเจาะจง: ข้อมูลคำนวณใน STRUCTURED_CHART_PACKET (จุด/ภาพดาว/จุดไว/TNP Witte) ต้องไม่มีดาว Lefeldt
// (ยกเว้น field excludedTransneptunians ที่จงใจ list ไว้เป็น guard)
const spRaw = (pNoTime.split("STRUCTURED_CHART_PACKET:")[1] || "").trim().split("\n")[0];
let spJson = null;
try { spJson = JSON.parse(spRaw); } catch { /* compact packet บรรทัดเดียว */ }
ok(spJson && spJson.discipline === "uranian", "STRUCTURED_CHART_PACKET parse เป็น uranian packet ได้");
const computedStr = JSON.stringify(spJson?.data || {});
ok(!LEFELDT.test(computedStr), "STRUCTURED_CHART_PACKET.data (จุด/ภาพดาว/จุดไว/TNP) ไม่มีดาว Lefeldt");

console.log(`\n=== FUSION5 URANIAN (ศาสตร์ที่ 6): ${pass} passed · ${fail} failed ===`);
if (fail) process.exit(1);
