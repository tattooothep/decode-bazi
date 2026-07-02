// ทดสอบ Western TIMING_TIMELINE เต็มสาย (chart→timeline→packet→render→buildSciencePrompt)
// run: npx tsx scripts/test-western-timeline.mjs
import { westernChart } from "../src/lib/astro/western/engine.ts";
import { buildWesternTimeline } from "../src/lib/astro/western/timeline.ts";
import { buildWesternPacket } from "../src/lib/astro/western/packet.ts";
import { renderWesternPrompt } from "../src/lib/astro/western/render.ts";
import { buildSciencePrompt } from "../src/lib/fusion5/build-prompt.ts";
import { bodyLon, wrap180 } from "../src/lib/astro-core/events.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
};

// golden Aeaw: 1984-12-31 13:15 กรุงเทพ (= 06:15 UTC)
const birth = { dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018 };
const TARGET = 2026;

const t0 = Date.now();
const chart = westernChart(birth.dtUTC, birth.lat, birth.lng, true, "M", new Date("2026-07-01T00:00:00Z"));
const tl = buildWesternTimeline(chart, birth, TARGET);
const elapsed = Date.now() - t0;
console.log(`เวลาคำนวณ chart+timeline: ${elapsed}ms`);
ok("performance < 15s", elapsed < 15000, `${elapsed}ms`);

// 1) โครงครบ
ok("มี transitHits > 10 จุด", tl.transitHits.length > 10, `got ${tl.transitHits.length}`);
ok("มี solarReturn", !!tl.solarReturn);
ok("มี profection 2 ช่วง (ก่อน/หลังวันเกิด)", tl.profection?.segments.length === 2);
ok("มี progressed", !!tl.progressed);
ok("มีคราส 4 จุด (2026)", tl.eclipses.length === 4, `got ${tl.eclipses.length}`);
ok("มี stations", tl.stations.length >= 8, `got ${tl.stations.length}`);

// 2) ทุก hit อยู่ในปีเป้าหมาย + เรียงวัน + วันแม่นจริง
const inYear = tl.transitHits.every((h) => h.dateISO.startsWith("2026"));
ok("hit ทุกจุดอยู่ปี 2026", inYear);
const sorted = [...tl.transitHits].every((h, i, a) => i === 0 || a[i - 1].dateISO <= h.dateISO);
ok("hit เรียงตามวัน", sorted);
const natalMap = new Map(chart.planets.map((p) => [p.name, p.lon]));
const ANGLE = { conjunction: 0, square: 90, trine: 120, opposition: 180 };
let exactOk = true, exactDetail = "";
for (const h of tl.transitHits.filter((x) => x.natalKind === "planet").slice(0, 20)) {
  const lonAtHit = bodyLon(h.transit, new Date(h.dateISO + "T05:00:00Z")); // เที่ยงไทยของวันนั้น
  const sep = Math.abs(wrap180(lonAtHit - natalMap.get(h.natal)));
  const err = Math.abs(sep - ANGLE[h.aspect]);
  if (err > 0.6) { exactOk = false; exactDetail += `${h.transit}-${h.aspect}-${h.natal}@${h.dateISO} err=${err.toFixed(2)} `; } // ดาวเร็วสุด Mars ~0.7°/วัน · เช็คแบบหยาบระดับวัน
}
ok("วันที่ hit แม่นระดับวัน (spot-check 20 จุด)", exactOk, exactDetail);

// 3) profection เลขคณิตถูก: เกิด 31 ธ.ค. 1984 → วันเกิดปี 2026 อายุ 42 → เรือน (42 mod 12)+1 = 7
const segAfter = tl.profection.segments[1];
ok("profection อายุ 42 → เรือน 7", segAfter.age === 42 && segAfter.profectedHouse === 7, JSON.stringify(segAfter));
const segBefore = tl.profection.segments[0];
ok("ก่อนวันเกิด อายุ 41 → เรือน 6", segBefore.age === 41 && segBefore.profectedHouse === 6, JSON.stringify(segBefore));

// 4) packet + coverage สลับสถานะถูก
const packet = buildWesternPacket(chart, tl);
ok("coverage exactTransitWindows=in_packet_target_year", packet.timingCoverage.exactTransitWindows === "in_packet_target_year");
ok("unsupported ไม่มี solarReturnChart/annualProfection/secondaryProgressions/eclipseHits แล้ว",
  !packet.unsupportedSpecialtyPackets.some((x) => ["solarReturnChart", "annualProfection", "secondaryProgressions", "eclipseHits"].includes(x)),
  JSON.stringify(packet.unsupportedSpecialtyPackets));
const packetNoTl = buildWesternPacket(chart, null);
ok("ไม่มี timeline → coverage เดิม + notAvailable ติดธง",
  packetNoTl.timingCoverage.exactTransitWindows === "not_in_packet" && packetNoTl.notAvailable.includes("timingTimeline"));

// 5) render มี section timeline
const rendered = renderWesternPrompt(packet);
ok("render มี TIMING_TIMELINE", rendered.includes("TIMING_TIMELINE ปี 2026"));
ok("render มี Solar Return + Profection + Progression", rendered.includes("[Solar Return 2026]") && rendered.includes("[Annual Profection]") && rendered.includes("[Secondary Progressions"));
console.log(`ขนาด render: ${rendered.length} chars`);

// 6) เต็มสาย buildSciencePrompt: คำถามปี 2026 → timeline ปี 2026 · ต้องไม่เกิน cap
const t1 = Date.now();
const prompt = buildSciencePrompt("western", [{ name: "ป๊า", dtUTC: birth.dtUTC, lat: birth.lat, lng: birth.lng, hasTime: true, gender: "M" }], "สุขภาพปี 2026 ต้องระวังเดือนไหนบ้าง", "th");
console.log(`เวลา buildSciencePrompt: ${Date.now() - t1}ms · ขนาด prompt: ${prompt.length} chars`);
ok("prompt มี TIMING_TIMELINE ปี 2026", prompt.includes("TIMING_TIMELINE ปี 2026"));
ok("prompt ไม่เกิน 78K", prompt.length <= 78000, `${prompt.length}`);

// 7) no-time: profection ปิด + SR ติดธง + ไม่มี Asc target
const chartNT = westernChart(birth.dtUTC, birth.lat, birth.lng, false, "M", new Date("2026-07-01T00:00:00Z"));
const tlNT = buildWesternTimeline(chartNT, birth, TARGET);
ok("no-time: profection ปิด", tlNT.profection === null);
ok("no-time: SR ติดธง uncertain", tlNT.solarReturn?.uncertainNoBirthTime === true);
ok("no-time: ไม่มี hit ไปที่ลัคนา/MC", !tlNT.transitHits.some((h) => h.natalKind === "angle"));

// 8) determinism
const tl2 = buildWesternTimeline(chart, birth, TARGET);
ok("deterministic", JSON.stringify(tl2.transitHits) === JSON.stringify(tl.transitHits));

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
