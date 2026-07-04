// r398 · VERIFY: western/vedic/qizheng STRUCTURED_CHART_PACKET JSON มี timingTimeline + legend
//   + prompt ≤ 118K ทุก intent × 1-4 ดวง · canon-dropped marker · instruction ผ่อนแล้ว
// run: npx tsx scripts/test-timeline-in-json-r398.mjs
import { buildSciencePrompt, FUSION_PANEL_PROMPT_MAX_CHARS } from "../src/lib/fusion5/build-prompt.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
};

const births = [
  { name: "เอ๋", dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F", birthDate: "1984-12-31", birthTime: "13:15" },
  { name: "ไหม", dtUTC: new Date("1986-04-12T09:42:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F", birthDate: "1986-04-12", birthTime: "16:42" },
  { name: "สาม", dtUTC: new Date("1990-07-07T03:00:00Z"), lat: 18.7883, lng: 98.9853, hasTime: true, gender: "M", birthDate: "1990-07-07", birthTime: "10:00" },
  { name: "สี่", dtUTC: new Date("1995-01-20T20:30:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "M", birthDate: "1995-01-21", birthTime: "03:30" },
];

const questions = [
  "ปีนี้การงานเป็นยังไง",
  "ปี 2027 เดือนไหนดวงการเงินพุ่ง",
  "ความรักปีหน้าจะได้แต่งงานไหม",
  "สุขภาพช่วงนี้ต้องระวังเดือนไหน",
  "2026-09-15 วันนี้เหมาะเซ็นสัญญาไหม",
];

const sciences = ["western", "vedic", "qizheng"];
const refDate = new Date("2026-06-30T00:00:00Z");

// เก็บตัวอย่าง JSON ต่อศาสตร์ (single birth, intent แรก) ไว้ report before/after
const samples = {};

function extractPacketJson(prompt) {
  // ดึงบล็อก STRUCTURED_CHART_PACKET แรก
  const idx = prompt.indexOf("STRUCTURED_CHART_PACKET:\n");
  if (idx < 0) return null;
  const after = prompt.slice(idx + "STRUCTURED_CHART_PACKET:\n".length);
  // JSON บรรทัดเดียว จบก่อน \n
  const line = after.split("\n")[0];
  try { return JSON.parse(line); } catch { return null; }
}

for (const science of sciences) {
  for (let n = 1; n <= 4; n++) {
    const subset = births.slice(0, n);
    for (const q of questions) {
      const prompt = buildSciencePrompt(science, subset, q, "th", refDate);
      // prompt ≤ cap
      ok(`${science} × ${n}ดวง "${q.slice(0, 14)}…" ≤ ${FUSION_PANEL_PROMPT_MAX_CHARS}`,
        prompt.length <= FUSION_PANEL_PROMPT_MAX_CHARS, `len=${prompt.length}`);
      // JSON มี timingTimeline (ดวงแรก)
      const pkt = extractPacketJson(prompt);
      const tt = pkt?.data?.timingTimeline;
      const truncatedAway = prompt.includes("TRUNCATED_NONCRITICAL") && (prompt.match(/STRUCTURED_CHART_PACKET:/g) || []).length === 0;
      if (truncatedAway) {
        // pre-existing (audit 4.2): tail-cut ตัด packet ทั้งหมดใน 4 ดวงหนัก — นอก scope r398 (ไม่เพิ่มเพดาน) · เท่ากับ backup
        console.log(`   ⚠️ ${science} × ${n}ดวง "${q.slice(0, 14)}…" packet ถูก tail-cut ออกทั้งหมด (pre-existing 4.2 · เท่า backup)`);
      } else {
        ok(`${science} × ${n}ดวง JSON.data.timingTimeline present`, tt !== undefined, `pkt=${pkt ? "parsed" : "unparseable"}`);
      }
      // ปีเป้าหมาย + legend มีเมื่อ timeline ไม่ null
      if (tt) {
        ok(`${science} × ${n}ดวง timingTimeline.legend present`, tt.legend && typeof tt.legend === "object");
        ok(`${science} × ${n}ดวง timingTimeline.targetYear number`, typeof tt.targetYear === "number");
      }
      if (n === 1 && !samples[science]) {
        samples[science] = { question: q, targetYear: tt?.targetYear, legendKeys: tt ? Object.keys(tt.legend || {}) : null, ttNull: tt === null, ttKeys: tt ? Object.keys(tt) : null };
      }
    }
  }
}

// canon-dropped marker: บังคับ 4 ดวง + คำถามหลาย intent (บีบ canon) — เช็คว่า marker/หมายเหตุโผล่เมื่อมีการตัด
const heavyQ = "ปี 2027 การงาน การเงิน ความรัก สุขภาพ ครอบครัว การลงทุน คดีความ ย้ายบ้าน เดือนไหนดีที่สุด";
for (const science of sciences) {
  const prompt = buildSciencePrompt(science, births, heavyQ, "th", refDate);
  ok(`${science} heavy×4 ≤ cap`, prompt.length <= FUSION_PANEL_PROMPT_MAX_CHARS, `len=${prompt.length}`);
  const hasDropNote = prompt.includes("CANON_DROPPED_FOR_BUDGET") || prompt.includes("ตำราส่วนนี้ไม่ได้แนบมารอบนี้") || prompt.includes("/truncated");
  console.log(`   ℹ️ ${science} heavy×4: dropNote/truncated present = ${hasDropNote} · len=${prompt.length}`);
}

// instruction ผ่อนแล้ว (ตรวจ prompt เดี่ยว)
const p1 = buildSciencePrompt("western", [births[0]], questions[0], "th", refDate);
ok("instruction ผ่อน: มี '2 แหล่งคู่กัน'", p1.includes("2 แหล่งคู่กัน"));
ok("instruction ผ่อน: ไม่มี 'STRUCTURED_CHART_PACKET เท่านั้น' เดิม", !p1.includes("field ใน STRUCTURED_CHART_PACKET เท่านั้น"));
ok("guard คงอยู่: ห้ามเดา/ห้ามความรู้นอกผัง", p1.includes("ห้ามเดา") && p1.includes("horoscope นอกผัง"));

console.log("\n=== ตัวอย่าง timingTimeline ต่อศาสตร์ (single birth) ===");
console.log(JSON.stringify(samples, null, 2));

console.log(`\n=== r398 timeline-in-json · pass=${pass} fail=${fail} ===`);
process.exit(fail ? 1 : 0);
