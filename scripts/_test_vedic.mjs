/**
 * ทดสอบ Vedic engine (sidereal Lahiri) · deterministic
 * รัน: npx tsx scripts/_test_vedic.mjs
 */
import { vedicChart } from "../src/lib/astro/vedic/engine.ts";
import { buildVedicPacket } from "../src/lib/astro/vedic/packet.ts";
import { renderVedicPrompt } from "../src/lib/astro/vedic/render.ts";

function show(label, dtUTC, lat, lng) {
  console.log("\n############################################################");
  console.log("# " + label);
  console.log("############################################################");
  const chart = vedicChart(new Date(dtUTC), lat, lng, true);
  const packet = buildVedicPacket(chart);
  console.log(renderVedicPrompt(packet, "th"));

  // สรุป golden (ค่าที่ engine คำนวณ — ใช้เทียบ astro.com Lahiri)
  const sun = packet.data.grahas.find((g) => g.name === "Sun");
  const moon = packet.data.grahas.find((g) => g.name === "Moon");
  console.log("\n--- GOLDEN (engine output · เทียบ astro.com sidereal=Lahiri) ---");
  console.log("Lagna rashi      :", packet.data.lagna ? `${packet.data.lagna.rashiTh} (${packet.data.lagna.deg.toFixed(2)}°)` : "—");
  console.log("Sun rashi        :", sun ? `${sun.rashiTh} (${sun.deg.toFixed(2)}°)` : "—");
  console.log("Moon rashi       :", moon ? `${moon.rashiTh} (${moon.deg.toFixed(2)}°)` : "—");
  console.log("Moon nakshatra   :", `${packet.data.moonNakshatra.name} pada ${packet.data.moonNakshatra.pada} (lord ${packet.data.moonNakshatra.lord})`);
  console.log("Current mahadasha:", packet.data.vimshottari.currentMaha ? packet.data.vimshottari.currentMaha.lord : "—");
  console.log("Current antardasa:", packet.data.vimshottari.currentAntar ? packet.data.vimshottari.currentAntar.lord : "—");
}

// เคส 1: 08/04/1986 00:04 ชลบุรี = 1986-04-07T17:04:00Z
show("เคส1 · 1986-04-07T17:04:00Z (08/04/1986 00:04 ชลบุรี) lat13.36 lng100.98", "1986-04-07T17:04:00Z", 13.36, 100.98);

// เคส 2: 1984-12-31T06:15:00Z (31/12/1984 13:15 กทม) lat13.75 lng100.5
show("เคส2 · 1984-12-31T06:15:00Z (31/12/1984 13:15 กทม) lat13.75 lng100.5", "1984-12-31T06:15:00Z", 13.75, 100.5);
