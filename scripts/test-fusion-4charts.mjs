// ทดสอบ fusion5 กลุ่ม 4 ดวง: buildSciencePrompt + PAIR_INTERACTION ทุกคู่ + PAIR_TIMING หลายคน + cap 118K
// run: npx tsx scripts/test-fusion-4charts.mjs
import { buildSciencePrompt, FUSION_PANEL_PROMPT_MAX_CHARS } from "../src/lib/fusion5/build-prompt.ts";
import { renderPairInteractionPacket } from "../src/lib/fusion5/pair-interactions.ts";
import { renderPairTimingBlock } from "../src/lib/fusion5/multi-year.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { cond ? pass++ : (fail++, console.log(`❌ ${name} ${detail}`)); cond && console.log(`✅ ${name}`); };

// golden Aeaw + Mai + 2 สังเคราะห์ (มีเวลาเกิดครบ · ชื่อไม่ซ้ำกันใน prompt)
const AEAW = { name: "เอี๋ยว", dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "M" };
const MAI = { name: "ไหมมี่", dtUTC: new Date("1986-04-08T17:04:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F" };
const SYN1 = { name: "สมหวัง", dtUTC: new Date("1991-07-15T02:30:00Z"), lat: 18.7883, lng: 98.9853, hasTime: true, gender: "M" };
const SYN2 = { name: "สายฝน", dtUTC: new Date("1995-11-03T13:45:00Z"), lat: 7.8804, lng: 98.3923, hasTime: true, gender: "F" };
const ALL4 = [AEAW, MAI, SYN1, SYN2];
const SCIS = ["western", "vedic", "ziwei", "qizheng"];
const CAP = FUSION_PANEL_PROMPT_MAX_CHARS;
ok("cap = 118000", CAP === 118000, String(CAP));

const Q = "ปี 2026 ทั้งกลุ่มนี้ร่วมหุ้นทำธุรกิจกันดีไหม ใครหนุนใคร ใครชนกับใคร";
const REF = new Date("2026-07-01T00:00:00Z");

// 1) pair packet: 2 ดวง = 1 บล็อกเดิม (ไม่มีหัว 'คู่') · 3 ดวง = 3 คู่ · 4 ดวง = 6 คู่
for (const sci of SCIS) {
  const p2 = renderPairInteractionPacket(sci, [AEAW, MAI], REF);
  ok(`${sci}: pair 2 ดวงมีบล็อก + ไม่มีหัวรายคู่`, p2.includes("PAIR_INTERACTION_PACKET") && !p2.includes("--- คู่ "));
  const p3 = renderPairInteractionPacket(sci, [AEAW, MAI, SYN1], REF);
  ok(`${sci}: 3 ดวง = 3 คู่`, p3.includes("3 คู่") && (p3.match(/--- คู่ /g) || []).length === 3, `${(p3.match(/--- คู่ /g) || []).length}`);
  const p4 = renderPairInteractionPacket(sci, ALL4, REF);
  ok(`${sci}: 4 ดวง = 6 คู่ + หัวบอก "6 คู่"`, p4.includes("6 คู่") && (p4.match(/--- คู่ /g) || []).length === 6, `${(p4.match(/--- คู่ /g) || []).length}`);
  ok(`${sci}: 2 ดวง deterministic (byte-identical)`, renderPairInteractionPacket(sci, [AEAW, MAI], REF) === p2);
}

// 2) PAIR_TIMING 4 ดวง: มีชื่อ ≥3 คนในบล็อก
for (const sci of SCIS) {
  const blk = renderPairTimingBlock(sci, ALL4, 2026);
  const people = ALL4.filter((b) => blk.includes(`${b.name}:`)).length;
  ok(`${sci}: PAIR_TIMING มีเหตุการณ์ ≥3 คน (ได้ ${people})`, blk.includes("PAIR_TIMING_PACKET ปี 2026") && people >= 3, blk.slice(0, 220));
}

// 3) เต็มสาย buildSciencePrompt 1-4 ดวง: ≤118K · 4 ดวงมีชื่อครบ + ป้ายคู่ ≥3
const sizes = {};
for (const sci of SCIS) {
  sizes[sci] = {};
  for (const n of [1, 2, 3, 4]) {
    const births = ALL4.slice(0, n);
    const prompt = buildSciencePrompt(sci, births, Q, "th", REF);
    sizes[sci][n] = prompt.length;
    ok(`${sci}: prompt ${n} ดวง ≤118K`, prompt.length <= CAP, `${prompt.length}`);
    if (n === 4) {
      const missing = ALL4.filter((b) => !prompt.includes(b.name)).map((b) => b.name);
      ok(`${sci}: prompt 4 ดวงมีชื่อครบ 4 คน`, missing.length === 0, `ขาด: ${missing.join(",")}`);
      const pairLabels = (prompt.match(/คู่ /g) || []).length;
      ok(`${sci}: prompt 4 ดวงมีป้าย "คู่ " ≥3`, pairLabels >= 3, `${pairLabels}`);
      ok(`${sci}: prompt 4 ดวงมี PAIR_TIMING`, prompt.includes("PAIR_TIMING_PACKET ปี 2026"));
    }
  }
}

console.log("\n📏 ขนาด prompt ต่อศาสตร์ (chars):");
console.log("ศาสตร์    | 1 ดวง | 2 ดวง | 3 ดวง | 4 ดวง");
for (const sci of SCIS) {
  console.log(`${sci.padEnd(9)} | ${String(sizes[sci][1]).padStart(6)} | ${String(sizes[sci][2]).padStart(6)} | ${String(sizes[sci][3]).padStart(6)} | ${String(sizes[sci][4]).padStart(6)}`);
}

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
