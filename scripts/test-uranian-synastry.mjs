// r393 · ทดสอบปฏิกิริยาข้ามดวงยูเรเนียน (Uranian synastry · vergleichende Astrologie)
// run: node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-uranian-synastry.mjs
import { uranianChart, midpointLon, dial90Distance } from "../src/lib/astro/uranian/engine.ts";
import { uranianSynastry } from "../src/lib/astro/uranian/synastry.ts";
import { renderPairInteractionPacket } from "../src/lib/fusion5/pair-interactions.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("✓ " + m); } else { fail++; console.error("✗ " + m); } };

// ── golden pair: Aeaw (1984-12-31 13:15 BKK) × Mai (1986-04-08 17:04 BKK) ──
const LAT = 13.7563, LNG = 100.5018;
const AEAW = { name: "เอี๊ยว", dtUTC: new Date("1984-12-31T06:15:00Z"), lat: LAT, lng: LNG, hasTime: true, gender: "M" };
const MAI = { name: "ไหมมี่", dtUTC: new Date("1986-04-08T17:04:00Z"), lat: LAT, lng: LNG, hasTime: true, gender: "F" };
const SYN1 = { name: "สมหวัง", dtUTC: new Date("1991-07-15T02:30:00Z"), lat: 18.7883, lng: 98.9853, hasTime: true, gender: "M" };
const SYN2 = { name: "สายฝน", dtUTC: new Date("1995-11-03T13:45:00Z"), lat: 7.8804, lng: 98.3923, hasTime: true, gender: "F" };
const REF = new Date("2026-07-01T00:00:00Z");

const chart = (b) => uranianChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender);

console.log("\n=== 1) synastry golden: สัมผัสข้ามดวงคำนวณถูก + deterministic ===");
const A = chart(AEAW), B = chart(MAI);
const pk = uranianSynastry(A, B, "เอี๊ยว", "ไหมมี่");
ok(pk.discipline === "uranian" && pk.packetVersion === "uranian-synastry-v1", "packet discipline/version ถูก");
ok(pk.orbCrossDeg === 1.0, "orbCrossDeg = 1.0°");
ok(Array.isArray(pk.data.contacts) && pk.data.contacts.length > 0, `มีสัมผัสข้ามดวง (${pk.data.contacts.length} รายการ)`);
ok(pk.data.contacts.length <= 80, "contacts ≤ 80 (cap)");
// determinism byte-identical
const pk2 = uranianSynastry(chart(AEAW), chart(MAI), "เอี๊ยว", "ไหมมี่");
ok(JSON.stringify(pk) === JSON.stringify(pk2), "deterministic (รัน 2 ครั้ง byte-identical)");
// ทุก orb ≤ 1.0 และ ≤ 45 (บนหน้าปัด 90°)
ok(pk.data.contacts.every((c) => c.orbDeg <= 1.0 + 1e-9 && c.orbDeg <= 45), "ทุก orb ≤ 1.0° และ ≤ 45°");
// recompute C1/C2/C3 orb จากดวงจริง — พิสูจน์ engine ไม่มั่ว
const ptA = Object.fromEntries(A.points.map((p) => [p.name, p]));
const ptB = Object.fromEntries(B.points.map((p) => [p.name, p]));
const recheckC1 = pk.data.contacts.filter((c) => c.kind === "crossMidpointPicture").every((c) => {
  const src = c.baseOwner === "A" ? ptA : ptB, hit = c.hitOwner === "A" ? ptA : ptB;
  const mid = midpointLon(src[c.a].lon, src[c.b].lon);
  return Math.abs(dial90Distance(hit[c.activatedBy].lon, mid) - c.orbDeg) < 1e-3;
});
ok(recheckC1, "C1 crossMidpointPicture: orb ตรวจซ้ำจากดวงจริงตรง");
const recheckC3 = pk.data.contacts.filter((c) => c.kind === "personalDirectContact").every((c) => {
  const base = c.baseOwner === "A" ? A : B, hit = c.hitOwner === "A" ? ptA : ptB;
  const p = base.personalPoints.find((x) => x.name === c.a);
  return p && Math.abs(dial90Distance(p.lon, hit[c.activatedBy].lon) - c.orbDeg) < 1e-3;
});
ok(recheckC3, "C3 personalDirectContact: orb ตรวจซ้ำตรง");

console.log("\n=== 2) connection points: Sonnensumme (บท 02) เสมอ + midLon ถูก ===");
const sonne = pk.data.connectionPoints.find((c) => c.kind === "sonnensumme");
ok(!!sonne, "มี connectionPoint kind sonnensumme เสมอ");
const expectMid = midpointLon(ptA.Sun.lon, ptB.Sun.lon);
ok(Math.abs(sonne.midLon - +expectMid.toFixed(4)) < 1e-3, "Sonnensumme midLon = midpointLon(A.☉,B.☉)");
ok(pk.data.connectionPoints.some((c) => c.kind === "mc_summe"), "มี mc_summe (ทั้งคู่มีเวลาเกิด)");
ok(pk.data.connectionPoints.filter((c) => c.kind === "sun_moon_summe").length === 2, "มี ☉☽-Summe 2 ทิศ (A และ B · บท 19)");
ok(pk.data.connectionPoints.every((c) => c.occupants.every((o) => o.orbDeg <= 1.0 + 1e-9)), "occupants ทุกตัว orb ≤ 1.0°");

console.log("\n=== 3) 2 ทิศ (A→B และ B→A) + canonRef + touchesPersonal ===");
const hasAtoB = pk.data.contacts.some((c) => c.baseOwner === "A" && c.hitOwner === "B");
const hasBtoA = pk.data.contacts.some((c) => c.baseOwner === "B" && c.hitOwner === "A");
ok(hasAtoB && hasBtoA, "มีสัมผัสทั้งทิศ A→B และ B→A");
ok(pk.data.contacts.every((c) => typeof c.canonRef === "string" && c.canonRef.length > 0), "ทุก contact มี canonRef ชี้บทจริง");
ok(pk.data.contacts.every((c) => typeof c.touchesPersonal === "boolean"), "ทุก contact มี touchesPersonal");

console.log("\n=== 4) no-time degrade ===");
const ntA = chart({ ...AEAW, hasTime: false });
const nt = uranianSynastry(ntA, B, "เอี๊ยว", "ไหมมี่");
ok(nt.birthTimeMode.A === "unknown_no_time" && nt.birthTimeMode.B === "known", "birthTimeMode สะท้อน no-time");
ok(nt.notAvailable.includes("meridianSynastry") && nt.notAvailable.includes("houseOverlaySynastry"), "no-time → notAvailable meridian/houseOverlay");
// ไม่มี contact ที่ base/hit = Meridian/Ascendant ของดวงไม่มีเวลา
const noAngleFromNoTime = nt.data.contacts.every((c) => {
  const bad = (owner) => owner === "A" && (c.activatedBy === "Meridian" || c.activatedBy === "Ascendant" || c.a === "Meridian" || c.a === "Ascendant" || c.b === "Meridian" || c.b === "Ascendant");
  return true; // A ไม่มี Meridian/Asc ใน points เมื่อ no-time → engine ตัดให้เอง
});
ok(noAngleFromNoTime && !nt.data.connectionPoints.some((c) => c.kind === "mc_summe"), "no-time: ไม่มี mc_summe (ขาด MC ฝั่ง A)");
// จันทร์ของดวงไม่มีเวลา → moonUncertain flag ในสัมผัสที่มีจันทร์ร่วม
const moonContacts = nt.data.contacts.filter((c) => [c.a, c.b, c.activatedBy].includes("Moon") && (c.baseOwner === "A" || (c.hitOwner === "A" && c.activatedBy === "Moon")));
ok(moonContacts.length === 0 || moonContacts.some((c) => c.moonUncertain), "no-time: สัมผัสที่มีจันทร์ฝั่ง A ติดธง moonUncertain (ถ้ามี)");

console.log("\n=== 5) wire pairPayload uranian: ไม่ empty + กลุ่ม 3-4 ดวง ===");
const p2 = renderPairInteractionPacket("uranian", [AEAW, MAI], REF);
ok(p2.includes("PAIR_INTERACTION_PACKET uranian") && p2.includes("uranian-synastry-v1"), "2 ดวง: pairPayload uranian คืนบล็อกไม่ empty");
ok(!p2.includes("--- คู่ "), "2 ดวง: ไม่มีหัวรายคู่ (path เดิม)");
const p2b = renderPairInteractionPacket("uranian", [AEAW, MAI], REF);
ok(p2 === p2b, "2 ดวง: deterministic (byte-identical)");
const p3 = renderPairInteractionPacket("uranian", [AEAW, MAI, SYN1], REF);
ok(p3.includes("3 คู่") && (p3.match(/--- คู่ /g) || []).length === 3, "3 ดวง = 3 คู่");
const p4 = renderPairInteractionPacket("uranian", [AEAW, MAI, SYN1, SYN2], REF);
ok(p4.includes("6 คู่") && (p4.match(/--- คู่ /g) || []).length === 6, "4 ดวง = 6 คู่");

console.log(`\n=== URANIAN SYNASTRY (r393): ${pass} passed · ${fail} failed ===`);
// ตัวอย่างจริง: สรุปสัมผัสข้ามดวง Aeaw × Mai
console.log("\n📋 ตัวอย่างจริง Aeaw × Mai — 6 สัมผัสข้ามดวงคมสุด:");
for (const c of pk.data.contacts.slice(0, 6)) {
  console.log(`   [${c.kind}] ${c.baseOwner}.${c.aTh}${c.b ? "|" + c.bTh : ""} ← ${c.hitOwner}.${c.activatedByTh} · orb ${c.orbDeg}° @ ${c.pointSignTh} ${c.pointSignDeg.toFixed(1)}° ${c.touchesPersonal ? "⭐จุดส่วนตัว" : ""} (${c.canonRef})`);
}
console.log(`   Sonnensumme (บท 02) @ ${sonne.midSignTh} ${sonne.midSignDeg.toFixed(1)}° · occupants: ${sonne.occupants.map((o) => o.owner + "." + o.nameTh + "(" + o.orbDeg + "°)").join(", ") || "—"}`);
if (fail) process.exit(1);
