// ทดสอบ Vedic TIMING_TIMELINE (ทศา 3 ชั้น + gochara segment + sade sati + varshaphala)
// run: npx tsx scripts/test-vedic-timeline.mjs
import { vedicChart, decimalYear } from "../src/lib/astro/vedic/engine.ts";
import { buildVedicTimeline } from "../src/lib/astro/vedic/timeline.ts";
import { buildVedicPacket } from "../src/lib/astro/vedic/packet.ts";
import { renderVedicPrompt } from "../src/lib/astro/vedic/render.ts";
import { buildSciencePrompt } from "../src/lib/fusion5/build-prompt.ts";
import { toSidereal } from "../src/lib/astro-core/ayanamsa.ts";
import { eclipticLon } from "../src/lib/astro-core/ephemeris.ts";
import { DASHA_YEARS, VIMSHOTTARI_TOTAL } from "../src/lib/astro/vedic/tables.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
};

// golden Aeaw: 1984-12-31 13:15 กรุงเทพ
const birth = { dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018 };
const TARGET = 2026;
const refDate = new Date("2026-07-01T00:00:00Z");

const t0 = Date.now();
const chart = vedicChart(birth.dtUTC, birth.lat, birth.lng, true, refDate);
const tl = buildVedicTimeline(chart, TARGET);
console.log(`เวลาคำนวณ: ${Date.now() - t0}ms`);
ok("performance < 15s", Date.now() - t0 < 15000);

// 1) ทศา: ปิดปีพอดี ไม่มีรู ไม่ซ้อน + ครอบทั้งปี
const rows = tl.dashaTimeline;
ok("มีทศา 3 ชั้น > 5 ช่วง", rows.length > 5, `got ${rows.length}`);
ok("ช่วงแรกเริ่มต้นปี", rows[0]?.fromISO === "2026-01-01", rows[0]?.fromISO);
ok("ช่วงท้ายจบสิ้นปี", rows[rows.length - 1]?.toISO === "2026-12-31", rows[rows.length - 1]?.toISO);
let contiguous = true, detail = "";
for (let i = 1; i < rows.length; i++) {
  const prevEnd = new Date(rows[i - 1].toISO), curStart = new Date(rows[i].fromISO);
  const gapDays = (curStart - prevEnd) / 86400000;
  if (gapDays < 0 || gapDays > 1.01) { contiguous = false; detail += `${rows[i - 1].toISO}→${rows[i].fromISO} `; }
}
ok("ทศาต่อเนื่องไม่มีรู/ไม่ซ้อน", contiguous, detail);

// 2) ทศาปัจจุบัน (1 ก.ค. 2026) ต้องตรงกับ engine เดิม (currentMaha/currentAntar)
const refDec = decimalYear(refDate);
const rowAtRef = rows.find((r) => new Date(r.fromISO) <= refDate && refDate <= new Date(r.toISO + "T23:59:59Z"));
ok("มีแถวทศาครอบวันอ้างอิง", !!rowAtRef);
ok("maha ตรง engine เดิม", rowAtRef?.maha === chart.vimshottari.currentMaha?.lord, `tl=${rowAtRef?.maha} engine=${chart.vimshottari.currentMaha?.lord}`);
ok("antar ตรง engine เดิม", rowAtRef?.antar === chart.vimshottari.currentAntar?.lord, `tl=${rowAtRef?.antar} engine=${chart.vimshottari.currentAntar?.lord}`);

// 3) สัดส่วนปรัตยันตร: รวมความยาวปรัตยันตรใน antar เดียว = ความยาว antar (เช็คสูตร arithmetic)
const antarLen = (m, a) => (DASHA_YEARS[m] * DASHA_YEARS[a]) / VIMSHOTTARI_TOTAL;
ok("สูตรสัดส่วนถูก (antar ของ maha ใดๆ รวม = maha เต็ม)",
  Math.abs(Object.keys(DASHA_YEARS).filter((k) => DASHA_YEARS[k] > 0).slice(0, 9).reduce((s, k) => s + antarLen("Saturn", k), 0) - DASHA_YEARS.Saturn) < 1e-9);

// 4) transit segments: ราศี ณ กลาง segment ต้องตรงกับ sidereal จริง
let segOk = true, segDetail = "";
for (const s of tl.transitSegments.filter((x) => ["Saturn", "Jupiter"].includes(x.graha))) {
  const mid = new Date((new Date(s.fromISO).getTime() + new Date(s.toISO).getTime()) / 2);
  const lon = s.graha === "Rahu" || s.graha === "Ketu" ? null : eclipticLon(s.graha, mid);
  if (lon != null) {
    const sidRashi = Math.floor(toSidereal(lon, mid) / 30);
    if (sidRashi !== s.rashi) { segOk = false; segDetail += `${s.graha}@${s.fromISO} tl=${s.rashi} จริง=${sidRashi} `; }
  }
}
ok("segment ราศีตรง sidereal จริง (เสาร์/พฤหัส)", segOk, segDetail);
ok("ทุกดาวมี segment ครอบทั้งปี", ["Saturn", "Jupiter", "Rahu", "Ketu", "Mars"].every((g) => {
  const segs = tl.transitSegments.filter((s) => s.graha === g);
  return segs.length && segs[0].fromISO === "2026-01-01" && segs[segs.length - 1].toISO === "2026-12-31";
}));

// 5) bindu ตรงกับ natal ashtakavarga
let binduOk = true;
for (const s of tl.transitSegments) {
  const p = chart.ashtakavarga.planets.find((x) => x.graha === s.graha);
  const expect = p ? p.bindusByRashi[s.rashi] : null;
  if ((s.bavBindus ?? null) !== (expect ?? null)) binduOk = false;
  if (s.sarvaBindus !== chart.ashtakavarga.sarvaByRashi[s.rashi]) binduOk = false;
}
ok("bindu BAV/SAV ตรงกับ natal ashtakavarga", binduOk);

// 6) sade sati สอดคล้อง: เฟสตรงกับเรือนจากจันทร์ของ segment เสาร์
const moonRashi = tl.sadeSati.natalMoonRashi;
let ssOk = true;
for (const p of tl.sadeSati.phases) {
  const seg = tl.transitSegments.find((s) => s.graha === "Saturn" && s.fromISO === p.fromISO);
  const h = seg ? seg.houseFromMoon : null;
  if (!((p.phase === "rising_12th" && h === 12) || (p.phase === "peak_1st" && h === 1) || (p.phase === "setting_2nd" && h === 2))) ssOk = false;
}
ok("sade sati เฟสตรงเรือนจากจันทร์", ssOk, JSON.stringify(tl.sadeSati));

// 7) varshaphala: sidereal Sun ณ instant = natal sidereal Sun (< 0.01°)
ok("มี varshaphala", !!tl.varshaphala);
if (tl.varshaphala) {
  const inst = new Date(tl.varshaphala.instantISO);
  const sidAt = toSidereal(eclipticLon("Sun", inst), inst);
  const natalSid = chart.grahas.find((g) => g.name === "Sun").sidLon;
  let diff = Math.abs(sidAt - natalSid); if (diff > 180) diff = 360 - diff;
  ok("varshaphala sidereal return แม่น < 0.01°", diff < 0.01, `diff=${diff}`);
  ok("Muntha = ลัคนา + ปีที่ผ่าน mod 12", tl.varshaphala.munthaRashi === (chart.lagna.rashi + (TARGET - 1984)) % 12);
}

// 8) packet + render + เต็มสาย
const packet = buildVedicPacket(chart, tl);
ok("packet มี timingTimeline", !!packet.data.timingTimeline);
ok("notAvailable ไม่มีธง timeline", !packet.notAvailable.some((x) => x.startsWith("timingTimeline")));
const rendered = renderVedicPrompt(packet);
ok("render มี TIMING_TIMELINE + Sade Sati + Varshaphala", rendered.includes("TIMING_TIMELINE ปี 2026") && rendered.includes("[Sade Sati]") && rendered.includes("[Varshaphala 2026]"));
const prompt = buildSciencePrompt("vedic", [{ name: "เทส", dtUTC: birth.dtUTC, lat: birth.lat, lng: birth.lng, hasTime: true, gender: "M" }], "การเงินปี 2026 เดือนไหนดีสุด", "th");
ok("เต็มสาย prompt มี TIMING_TIMELINE", prompt.includes("TIMING_TIMELINE ปี 2026"));
ok("prompt ไม่เกิน 118K (cap fusion5 4 ดวง)", prompt.length <= 118000, `${prompt.length}`);
console.log(`ขนาด prompt: ${prompt.length}`);

// 9) no-time: ทศายังคำนวณ (reference-only) + varshaphala ติดธง
const chartNT = vedicChart(birth.dtUTC, birth.lat, birth.lng, false, refDate);
const tlNT = buildVedicTimeline(chartNT, TARGET);
ok("no-time: varshaphala ติดธง uncertain", tlNT.varshaphala?.uncertainNoBirthTime === true);
ok("no-time: segment ไม่มีเรือนจากลัคนา", tlNT.transitSegments.every((s) => s.houseFromLagna === null));
ok("no-time: coverageNote เตือนห้ามฟันวันแม่น", tlNT.coverageNote.includes("ห้ามฟันวันแม่น"));

// 10) determinism
const tl2 = buildVedicTimeline(chart, TARGET);
ok("deterministic", JSON.stringify(tl2) === JSON.stringify(tl));

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
