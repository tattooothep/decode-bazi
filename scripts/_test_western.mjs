/**
 * ทดสอบ Western engine — พิมพ์ผังของ Aeaw
 *   1984-12-31T06:15:00Z (= 31 ธ.ค. 1984 เวลา 13:15 กรุงเทพฯ · UTC+7) · lat 13.75 lng 100.5
 * รัน: npx tsx scripts/_test_western.mjs
 *
 * deterministic — รันกี่ครั้งผลต้องเท่ากันเป๊ะ
 */
import { westernChart, SIGN_TH } from "../src/lib/astro/western/engine.ts";
import { buildWesternPacket } from "../src/lib/astro/western/packet.ts";
import { renderWesternPrompt } from "../src/lib/astro/western/render.ts";

const dtUTC = new Date("1984-12-31T06:15:00Z");
const lat = 13.75, lng = 100.5;

const chart = westernChart(dtUTC, lat, lng, true);
const packet = buildWesternPacket(chart);
const prompt = renderWesternPrompt(packet, "th");

const fmtDeg = (sd) => {
  const d = Math.floor(sd), m = Math.round((sd - d) * 60);
  return `${d}°${String(m).padStart(2, "0")}'`;
};

console.log("════════════════════════════════════════════════════════");
console.log(" WESTERN CHART · Aeaw · 31/12/1984 13:15 Bangkok (UTC+7)");
console.log(" dtUTC =", dtUTC.toISOString(), "| lat", lat, "lng", lng);
console.log("════════════════════════════════════════════════════════");
console.log("degradeLevel:", chart.degradeLevel, "| houseSystem:", chart.houseSystem);
console.log("ลัคนา (Asc):", chart.ascendant !== null
  ? `ราศี${SIGN_TH[Math.floor(chart.ascendant / 30)]} ${fmtDeg(chart.ascendant % 30)} (lon ${chart.ascendant})`
  : "—");
console.log("กลางฟ้า (MC):", chart.mc !== null
  ? `ราศี${SIGN_TH[Math.floor(chart.mc / 30)]} ${fmtDeg(chart.mc % 30)} (lon ${chart.mc})`
  : "—");
console.log("เพศเจ้าชะตา:", chart.gender, "| sect:", chart.sect ?? "—");
console.log("จุดโชค (Part of Fortune):", chart.partOfFortune
  ? `ราศี${SIGN_TH[chart.partOfFortune.sign]} ${fmtDeg(chart.partOfFortune.signDeg)} เรือน ${chart.partOfFortune.house} (lon ${chart.partOfFortune.lon})`
  : "—");
console.log("");
console.log("ดาว:");
for (const p of chart.planets) {
  console.log(
    `  ${p.nameTh.padEnd(18)} ราศี${SIGN_TH[p.sign].padEnd(6)} ${fmtDeg(p.signDeg).padEnd(8)}` +
    ` เรือน ${p.house ?? "-"}${p.retro ? "  ℞" : "   "}` +
    `${p.dignity ? "  [" + p.dignity + "]" : ""}${p.uncertain ? "  ⚠️" : ""}`,
  );
}
console.log("");
console.log("มุมสัมพันธ์ (เรียงตาม orb):");
for (const a of [...chart.aspects].sort((x, y) => x.orb - y.orb)) {
  console.log(`  ${a.a} ${a.type} ${a.b} · orb ${a.orb}° · ${a.applying ? "applying" : "separating"}`);
}
console.log("");
console.log("ภาพรวม:", JSON.stringify(chart.shape));
console.log("");
console.log("───────────── PACKET (envelope) ─────────────");
console.log(JSON.stringify(packet, null, 2));
console.log("");
console.log("───────────── RENDER PROMPT (ไทยนำ) ─────────────");
console.log(prompt);

console.log("");
console.log("═══════════ GOLDEN (verify ภายหลังกับ astro.com) ═══════════");
console.log("ผัง: 31 Dec 1984, 13:15, Bangkok · tropical · Whole-sign");
console.log("ANCHOR (มั่นใจสูง · ผู้สั่งระบุ + ดาราศาสตร์):");
console.log("  • ลัคนา (Asc)  ≈ ราศีเมษ ~29°  → engine ได้ เมษ 28°54' ✓");
console.log("  • อาทิตย์ (Sun) ≈ ราศีมังกร ~9-10° → engine ได้ มังกร 9°46' ✓");
console.log("ค่าที่ engine คำนวณ — ต้องเปิด astro.com (31 Dec 1984, 13:15, Bangkok, Whole-sign)");
console.log("เทียบให้ตรง ±1° ก่อนใช้งานจริง:");
console.log("  • จันทร์ (Moon)  = ราศีเมษ 20°56'  (เรือน 1)");
console.log("  • พุธ (Mercury)  = ราศีธนู 17°22'");
console.log("  • ศุกร์ (Venus)  = ราศีกุมภ์ 25°31'");
console.log("  • อังคาร (Mars)  = ราศีมีน 4°34'");
console.log("  • พฤหัส (Jupiter)= ราศีมังกร 21°17'");
console.log("  • เสาร์ (Saturn) = ราศีพิจิก 24°40'");
console.log("  • MC (กลางฟ้า)   = ราศีมังกร 22°19'");
console.log("  • North Node     = ราศีพฤษภ 25°11'");
console.log("  • stellium       = มังกร (Sun+Jupiter+Neptune)");
console.log("major aspects ที่ควรเช็ค: Mercury☌Uranus, Mars△Pluto, Saturn☌Ketu/☍Rahu");
console.log("หมายเหตุ: ผ่าน = Asc ราศีเมษ & Sun ราศีมังกร ตรงแน่ + ดาวที่เหลือตรง astro.com ±1°");
