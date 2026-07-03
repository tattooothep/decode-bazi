// r369 · ทดสอบ Cross-Science Resonance Layer (deterministic engine ก่อน AI)
// run: npx tsx scripts/test-fusion5-resonance.mjs   (ต้องผ่าน 3 รอบก่อนส่งงาน)
import {
  buildResonance, renderResonanceBlockTh, clusterByMonth, clusterEclipseByMonth, findConflicts,
  RESONANCE_THEMES,
} from "../src/lib/fusion5/resonance.ts";
import { buildJudgePrompt, FUSION_PANEL_PROMPT_MAX_CHARS } from "../src/lib/fusion5/build-prompt.ts";
import { westernChart } from "../src/lib/astro/western/engine.ts";
import { buildWesternTimeline } from "../src/lib/astro/western/timeline.ts";
import { vedicChart } from "../src/lib/astro/vedic/engine.ts";
import { buildVedicTimeline } from "../src/lib/astro/vedic/timeline.ts";
import { ziweiChart } from "../src/lib/astro/ziwei/engine.ts";
import { qizhengNatal } from "../src/lib/astro/qizheng/engine.ts";
import { buildQizhengTimeline } from "../src/lib/astro/qizheng/timeline.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name} ${detail}`); } };

const YEAR = 2026;
const SCIS = ["western", "vedic", "ziwei", "qizheng"];
const AEAW = { name: "เอี๊ยว", dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "M" };
const REF = new Date("2026-07-01T00:00:00Z");

// ===== 1) golden Aeaw · R1 =====
const t1 = Date.now();
const res = buildResonance([AEAW], SCIS, YEAR, REF);
const ms1 = Date.now() - t1;
const P = res.perPerson[0];
ok("โครงสร้าง resonance_v1 + 1 คน", res.version === "resonance_v1" && res.perPerson.length === 1 && !P.skippedNote);

// western: profection ทั้ง 2 ช่วงอายุ (golden ตาม spec: เรือน6 อายุ41 + เรือน7 อายุ42)
const wHouses = P.r1.entries.filter((e) => e.science === "western").map((e) => `${e.house}@${(e.evidence.match(/อายุ (\d+)/) || [])[1]}`).sort();
ok("R1 western profection เรือน6(อายุ41) + เรือน7(อายุ42)", JSON.stringify(wHouses) === JSON.stringify(["6@41", "7@42"]), JSON.stringify(wHouses));

// vedic: เทียบกับ engine เอง (consistency ไม่ hardcode)
{
  const chart = vedicChart(AEAW.dtUTC, AEAW.lat, AEAW.lng, true, new Date(Date.UTC(YEAR, 6, 1)));
  const tl = buildVedicTimeline(chart, YEAR);
  const expHouse = ((tl.varshaphala.munthaRashi - chart.lagna.rashi + 12) % 12) + 1;
  const vEntry = P.r1.entries.find((e) => e.science === "vedic");
  ok(`R1 vedic Muntha house = engine เอง (เรือน${expHouse})`, vEntry && vEntry.house === expHouse, JSON.stringify(vEntry));
  ok("R1 vedic theme ตรงตารางเรือน", vEntry && RESONANCE_THEMES[vEntry.themeKey].house === expHouse);
}

// ziwei: เทียบกับ engine เอง
{
  const chart = ziweiChart(AEAW.dtUTC, AEAW.lat, AEAW.lng, "M", true, { refDate: new Date(Date.UTC(YEAR, 6, 1)) });
  const zEntry = P.r1.entries.find((e) => e.science === "ziwei");
  ok(`R1 ziwei 流年命宮ตกวัง natal ${chart.liuNian.mingPalaceName} ตาม engine`, zEntry && zEntry.evidence.includes(chart.liuNian.mingPalaceName), JSON.stringify(zEntry));
}

// R1 resonant: อย่างน้อยธีม "คู่ครอง" (western เรือน7 + vedic เรือน7) สำหรับ golden ปี 2026
ok("R1 resonant มีธีมที่ ≥2 ศาสตร์ตรงกัน (partner)", P.r1.resonant.some((r) => r.themeKey === "partner" && r.sciences.includes("western") && r.sciences.includes("vedic")), JSON.stringify(P.r1.resonant.map((r) => r.themeKey)));

// ===== 2) R2 · Saturn 2026-05-06 =====
{
  const chart = westernChart(AEAW.dtUTC, AEAW.lat, AEAW.lng, true, "M");
  const tl = buildWesternTimeline(chart, { dtUTC: AEAW.dtUTC, lat: AEAW.lat, lng: AEAW.lng }, YEAR);
  const satMay = tl.transitHits.filter((h) => h.transit === "Saturn" && h.month === 5);
  ok("western engine มี Saturn exact เดือน 5 (รวม 2026-05-06)", satMay.some((h) => h.dateISO === "2026-05-06"), JSON.stringify(satMay.map((h) => h.dateISO)));
  const natal = qizhengNatal(AEAW.dtUTC, AEAW.lat, AEAW.lng, true);
  const qtl = buildQizhengTimeline(natal.reading, YEAR, AEAW.lat, AEAW.lng);
  const qSatMay = qtl.hits.filter((h) => h.starZh === "土" && h.month === 5);
  if (qSatMay.length) {
    ok("R2 cluster เดือน5 Saturn (western+qizheng)", P.r2.some((c) => c.month === 5 && c.planet === "Saturn" && c.sciences.includes("western") && c.sciences.includes("qizheng")), JSON.stringify(P.r2));
  } else {
    console.log("ℹ️ qizheng ไม่มี 土 hit เดือน 5 ปีนี้ → เช็ค cluster logic ด้วย fixture สังเคราะห์แทน (ตาม spec)");
    ok("R2 ไม่มี cluster Saturn เดือน5 เพราะ qizheng ไม่มี hit (สอดคล้อง)", !P.r2.some((c) => c.month === 5 && c.planet === "Saturn"));
  }
}

// ===== 3) unit test clusterByMonth / clusterEclipseByMonth / findConflicts ด้วย fixture สังเคราะห์ =====
{
  const ev = (science, month, planet, dateISO, polarity = "neutral") => ({ science, month, planet, dateISO, evidence: `${science} ${planet} ${dateISO}`, polarity });
  const fix = [
    ev("western", 5, "Saturn", "2026-05-06", "malefic"),
    ev("qizheng", 5, "Saturn", "2026-05-12", "malefic"),
    ev("vedic", 5, "Saturn", "2026-05-20"),
    ev("western", 6, "Jupiter", "2026-06-01", "benefic"), // เดือน 6 มีศาสตร์เดียว → ไม่เป็น cluster
    ev("western", 7, "Mars", "2026-07-02"),
    ev("qizheng", 8, "Mars", "2026-08-02"),               // ดาวเดียวกันแต่คนละเดือน → ไม่ cluster
  ];
  const c = clusterByMonth(fix);
  ok("fixture: Saturn เดือน5 cluster 3 ศาสตร์", c.length === 1 && c[0].month === 5 && c[0].planet === "Saturn" && c[0].sciences.length === 3);
  ok("fixture: เรียง evidence ตามลำดับศาสตร์+วัน", c[0].evidences[0].science === "western" && c[0].evidences[1].science === "vedic" && c[0].evidences[2].science === "qizheng");
  ok("fixture: ศาสตร์เดียว/คนละเดือนไม่ถูกนับ", !c.some((x) => x.planet === "Jupiter" || x.planet === "Mars"));
  const e3 = clusterEclipseByMonth([
    { science: "western", month: 5, dateISO: "2026-05-24", evidence: "คราส" },
    { science: "qizheng", month: 5, dateISO: "2026-05-24", evidence: "羅睺" },
    { science: "western", month: 9, dateISO: "2026-09-01", evidence: "ราหูจร" }, // ศาสตร์เดียว → ตก
  ]);
  ok("fixture R3: เดือน5 ≥2 ศาสตร์ · เดือน9 ศาสตร์เดียวตก", e3.length === 1 && e3[0].month === 5 && e3[0].sciences.length === 2);
  const cf = findConflicts([
    ev("western", 5, "Saturn", "2026-05-06", "malefic"),
    ev("qizheng", 5, "Mars", "2026-05-07", "benefic"),
    ev("western", 6, "Jupiter", "2026-06-01", "benefic"),
    ev("western", 6, "Saturn", "2026-06-09", "malefic"), // ศาสตร์เดียวมีทั้งดีทั้งร้าย → ไม่ conflict
  ]);
  ok("fixture CONFLICT: เดือน5 qizheng ดี vs western ร้าย · เดือน6 ไม่ conflict", cf.length === 1 && cf[0].month === 5 && cf[0].beneficScience === "qizheng" && cf[0].maleficScience === "western", JSON.stringify(cf));
}

// ===== 4) deterministic (2 รอบ JSON เท่ากัน · ไม่นับ computeMs) =====
{
  const a = buildResonance([AEAW], SCIS, YEAR, REF);
  const b = buildResonance([AEAW], SCIS, YEAR, REF);
  const strip = (x) => { const y = JSON.parse(JSON.stringify(x)); delete y.computeMs; return JSON.stringify(y); };
  ok("deterministic: รัน 2 รอบผลเหมือนกันทุกตัวอักษร", strip(a) === strip(b));
}

// ===== 5) no-time → ข้าม + note =====
{
  const NT = { ...AEAW, name: "ไม่มีเวลา", hasTime: false };
  const r = buildResonance([AEAW, NT], SCIS, YEAR, REF);
  ok("no-time ถูกข้ามพร้อม note · คนมีเวลายังคำนวณ", r.perPerson.length === 2 && !r.perPerson[0].skippedNote && /ไม่ทราบเวลาเกิด/.test(r.perPerson[1].skippedNote || ""), JSON.stringify(r.perPerson[1].skippedNote));
}

// ===== 6) performance 1 และ 4 ดวง =====
{
  const B = { name: "บี", dtUTC: new Date("1986-04-08T17:04:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F" };
  const C = { name: "ซี", dtUTC: new Date("1990-06-15T02:30:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "M" };
  const D = { name: "ดี", dtUTC: new Date("1995-11-20T10:00:00Z"), lat: 18.7883, lng: 98.9853, hasTime: true, gender: "F" };
  const t4 = Date.now();
  const r4 = buildResonance([AEAW, B, C, D], SCIS, YEAR, REF);
  const ms4 = Date.now() - t4;
  const computed = r4.perPerson.filter((p) => !p.skippedNote).length;
  console.log(`⏱ perf: 1 ดวง ${ms1}ms · 4 ดวง ${ms4}ms (คำนวณจริง ${computed}/4 · ที่เหลือ=เกินงบเวลา 8s ถ้ามี)`);
  ok("perf: 1 ดวงมีผล + 4 ดวงอย่างน้อยดวงแรก (focus) มีผลเสมอ", !res.perPerson[0].skippedNote && !r4.perPerson[0].skippedNote);
  ok("perf: 4 ดวงเสร็จใน 30s (sanity)", ms4 < 30_000, `${ms4}ms`);
}

// ===== 7) renderResonanceBlockTh ≤ 3000 =====
{
  const blk = renderResonanceBlockTh(res);
  ok(`render block ≤3000 chars (จริง ${blk.length})`, blk.length <= 3000);
  ok("block มีหัว RESONANCE_PACKET + ท้ายกำกับ", blk.startsWith("=== RESONANCE_PACKET") && blk.includes("END_RESONANCE_PACKET"));
  // บังคับ path ตัดงบ: ยัด resonance สังเคราะห์ก้อนโต
  const fat = {
    ...res,
    perPerson: Array.from({ length: 4 }, (_, i) => ({
      ...res.perPerson[0],
      name: `คนที่${i + 1}`,
      r2: Array.from({ length: 6 }, (_, m) => ({ month: m + 1, planet: "Saturn", planetTh: "เสาร์(土)", sciences: ["western", "qizheng"], evidences: Array.from({ length: 4 }, (_, k) => ({ science: k % 2 ? "qizheng" : "western", dateISO: "2026-01-01", evidence: "หลักฐานยาวๆ ".repeat(12) })) })),
    })),
  };
  const fatBlk = renderResonanceBlockTh(fat);
  ok(`block ก้อนโตถูกตัดเหลือ ≤3000 (จริง ${fatBlk.length})`, fatBlk.length <= 3000 && fatBlk.includes("END_RESONANCE_PACKET"));
}

// ===== 8) judge prompt + resonance block ≤ cap + มีคำสั่งเปิดหัวข้อ =====
{
  const blk = renderResonanceBlockTh(res);
  const panels = [
    { science: "western", reply: "คำตอบ western ".repeat(600) },
    { science: "qizheng", reply: "คำตอบ qizheng ".repeat(600) },
    { science: "vedic", reply: "คำตอบ vedic ".repeat(600) },
  ];
  const births = [{ name: AEAW.name, dtUTC: AEAW.dtUTC, lat: AEAW.lat, lng: AEAW.lng, hasTime: true, gender: "M" }];
  const jp = buildJudgePrompt(panels, births, "ปี 2026 เป็นอย่างไร", "th", blk);
  ok(`judge prompt ≤ cap ${FUSION_PANEL_PROMPT_MAX_CHARS} (จริง ${jp.length})`, jp.length <= FUSION_PANEL_PROMPT_MAX_CHARS);
  ok("judge prompt มี RESONANCE_PACKET + คำสั่งเปิดหัวข้อ", jp.includes("RESONANCE_PACKET") && jp.includes("## จุดที่หลายศาสตร์ยืนยันตรงกัน"));
  const jpNo = buildJudgePrompt(panels, births, "ปี 2026 เป็นอย่างไร", "th");
  ok("ไม่ส่ง block = prompt เดิมไม่มี RESONANCE (backward-compatible)", !jpNo.includes("RESONANCE_PACKET"));
}

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
