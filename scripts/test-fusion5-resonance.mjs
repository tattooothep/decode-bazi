// r369 · ทดสอบ Cross-Science Resonance Layer (deterministic engine ก่อน AI)
// r370 · เพิ่มชุดทดสอบ Resonance v2 (R4 ดวงคู่ / R5 สะพานธาตุ / R6 ปีชง 3 อารยธรรม)
// run: npx tsx scripts/test-fusion5-resonance.mjs   (ต้องผ่าน 3 รอบก่อนส่งงาน)
import {
  buildResonance, renderResonanceBlockTh, clusterByMonth, clusterEclipseByMonth, findConflicts,
  RESONANCE_THEMES, RESONANCE_BLOCK_MAX_CHARS, R4_DIMENSIONS, r4Resolve, resParseYongshen, resParsePillars,
} from "../src/lib/fusion5/resonance.ts";
import { ashtakoota } from "../src/lib/astro/vedic/ashtakoota.ts";
import { buildJudgePrompt, FUSION_PANEL_PROMPT_MAX_CHARS } from "../src/lib/fusion5/build-prompt.ts";
import { westernChart } from "../src/lib/astro/western/engine.ts";
import { buildWesternTimeline } from "../src/lib/astro/western/timeline.ts";
import { vedicChart } from "../src/lib/astro/vedic/engine.ts";
import { buildVedicTimeline } from "../src/lib/astro/vedic/timeline.ts";
import { ziweiChart } from "../src/lib/astro/ziwei/engine.ts";
import { qizhengNatal } from "../src/lib/astro/qizheng/engine.ts";
import { buildQizhengTimeline } from "../src/lib/astro/qizheng/timeline.ts";
import { uranianChart } from "../src/lib/astro/uranian/engine.ts";
import { computeUranianAuslosung } from "../src/lib/astro/uranian/auslosung.ts";

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

// ===== 7) renderResonanceBlockTh ≤ cap (r370: cap ตาม spec = 4500 · อ่านจาก engine ตรง) =====
{
  const blk = renderResonanceBlockTh(res);
  ok(`render block ≤${RESONANCE_BLOCK_MAX_CHARS} chars (จริง ${blk.length})`, blk.length <= RESONANCE_BLOCK_MAX_CHARS);
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
  ok(`block ก้อนโตถูกตัดเหลือ ≤${RESONANCE_BLOCK_MAX_CHARS} (จริง ${fatBlk.length})`, fatBlk.length <= RESONANCE_BLOCK_MAX_CHARS && fatBlk.includes("END_RESONANCE_PACKET"));
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

/* ████████████ r370 · Resonance v2 (R4 / R5 / R6) ████████████ */

// golden: เอี๊ยว + DB fields จริง (bazi_pillars golden AGENTS.md · yongshen shape ตรง DB {top3:[{element}],climate})
const AEAW_DB = {
  ...AEAW,
  baziPillars: { pillars: { year: { stem: "甲", branch: "子" }, month: { stem: "丙", branch: "子" }, day: { stem: "己", branch: "亥" }, hour: { stem: "庚", branch: "午" } } },
  yongshen: { top3: [{ stem: "丙", element: "fire", finalScore: 9 }, { stem: "丁", element: "fire", finalScore: 8 }, { stem: "甲", element: "wood", finalScore: 5 }], climate: "cold" },
};
const MAI = { name: "ใหม่", dtUTC: new Date("1986-04-08T17:04:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F" };

// ===== 9) R6 ปีชง 3 อารยธรรม · golden เอี๊ยว 1984-12-31 ปี 2026 =====
{
  const r = buildResonance([AEAW_DB], SCIS, YEAR, REF);
  const r6 = r.perPerson[0].r6;
  ok("R6 ganzhi ปีเป้าหมาย 2026 = 丙午", r6 && r6.targetGanzhi === "丙午", JSON.stringify(r6?.targetGanzhi));
  ok("R6 จีน: ปีเกิด甲子(กิ่ง子) จาก bazi_pillars + 子午沖 = ปีชงเต็ม", r6 && r6.birthYearBranch === "子" && r6.birthYearSource === "bazi_pillars" && r6.relations.includes("沖"), JSON.stringify({ b: r6?.birthYearBranch, rel: r6?.relations }));
  const bz = r6?.votes.find((v) => v.system === "bazi");
  ok("R6 จีนโหวต heavy=true + rationale มี 子午沖", !!bz && bz.heavy === true && bz.rationale.includes("子午沖"), JSON.stringify(bz));
  // western: เทียบกับ engine ตรง (ไม่ hardcode วัน) — Saturn hard aspect → Sun/Moon/Asc
  const wchart = westernChart(AEAW.dtUTC, AEAW.lat, AEAW.lng, true, "M");
  const wtl = buildWesternTimeline(wchart, AEAW, YEAR);
  const satHard = wtl.transitHits.filter((h) => h.transit === "Saturn" && ["conjunction", "square", "opposition"].includes(h.aspect) && ["Sun", "Moon", "Ascendant"].includes(h.natal));
  const wv = r6?.votes.find((v) => v.system === "western");
  ok("R6 western: Saturn sq Sun 2026 มีจริง ≥2 pass (พ.ค.+ต.ค. ตาม engine)", satHard.length >= 2 && satHard.some((h) => h.dateISO.slice(5, 7) === "05") && satHard.some((h) => h.dateISO.slice(5, 7) === "10"), JSON.stringify(satHard.map((h) => h.dateISO)));
  ok("R6 western vote heavy + dates ตรง engine เป๊ะ", !!wv && wv.heavy === true && JSON.stringify(wv.dates) === JSON.stringify(satHard.map((h) => h.dateISO)), JSON.stringify(wv?.dates));
  const vv = r6?.votes.find((v) => v.system === "vedic");
  ok("R6 vedic: SadeSati โหวตเป็น boolean (ไม่ null · ซื่อตรง)", !!vv && typeof vv.heavy === "boolean", JSON.stringify(vv));
  ok("R6 golden รวม ≥2 เสียงบอกปีหนัก (จีน+western อย่างน้อย)", (r6?.voiceCount || 0) >= 2, `voiceCount=${r6?.voiceCount}`);
  // ไม่ส่ง bazi_pillars → fallback tyme lunar year (เกิด 31 ธ.ค. 1984 ก่อนตรุษจีน 1985 → ปีจันทรคติ 1984 = 甲子 กิ่ง子 เท่ากัน)
  const r6b = buildResonance([AEAW], SCIS, YEAR, REF).perPerson[0].r6;
  ok("R6 fallback tyme lunar: เกิดก่อนตรุษจีน → กิ่ง子 เท่า bazi_pillars", !!r6b && r6b.birthYearBranch === "子" && r6b.birthYearSource === "tyme_lunar", JSON.stringify({ b: r6b?.birthYearBranch, s: r6b?.birthYearSource }));
}

// ===== 10) R5 สะพานธาตุ =====
{
  const r = buildResonance([AEAW_DB], SCIS, YEAR, REF);
  const r5 = r.perPerson[0].r5;
  ok("R5 อ่าน yongshen shape DB จริง → ธาตุไฟ (fire) source=db_yongshen", !!r5 && r5.source === "db_yongshen" && r5.neededElement === "fire" && r5.neededElements.join(",") === "fire,wood", JSON.stringify({ el: r5?.neededElement, els: r5?.neededElements }));
  ok("R5 日干己 → dayMasterElement=earth (STEM_EL)", r5?.dayMasterElement === "earth", JSON.stringify(r5?.dayMasterElement));
  const wEv = r5?.evidence.find((e) => e.science === "western");
  const qEv = r5?.evidence.find((e) => e.science === "qizheng");
  const zEv = r5?.evidence.find((e) => e.science === "ziwei");
  ok("R5 มีหลักฐาน western + qizheng (effect ไม่ null) + ziwei ข้ามซื่อสัตย์ (null)", !!wEv && wEv.effect !== null && !!qEv && qEv.effect !== null && !!zEv && zEv.effect === null, JSON.stringify(r5?.evidence.map((e) => [e.science, e.effect])));
  // qizheng ต้องตรง engine เอง: 流年 Mars(火) เรือน/สถานะ
  const natal = qizhengNatal(AEAW.dtUTC, AEAW.lat, AEAW.lng, true);
  const qtl = buildQizhengTimeline(natal.reading, YEAR, AEAW.lat, AEAW.lng);
  const mars = qtl.liuNianStars.find((s) => s.key === "Mars");
  ok("R5 qizheng ตรง engine: 流年火 เรือน+สถานะ อยู่ใน detail", !!mars && !!qEv && qEv.detail.includes(`เรือน${mars.house}`) && qEv.detail.includes(mars.status), JSON.stringify({ detail: qEv?.detail, engine: mars && { h: mars.house, st: mars.status } }));
  ok("R5 summary ระบุหนุน/ตัด + ปี", !!r5 && /ถูกหนุน \d+ ระบบ \/ ถูกตัด \d+ ระบบ/.test(r5.summaryTh) && r5.summaryTh.includes("2026"), r5?.summaryTh);
  // ไม่มี yongshen ใน DB → fallback สุภาพ ไม่เดา
  const rNo = buildResonance([AEAW], SCIS, YEAR, REF).perPerson[0].r5;
  ok("R5 ไม่มี yongshen → source=missing + ข้อความสุภาพ ไม่เดาธาตุ", !!rNo && rNo.source === "missing" && rNo.neededElement === null && /ข้าม/.test(rNo.summaryTh), JSON.stringify(rNo?.summaryTh));
  // ธาตุทอง (Venus) = ดาวเร็วนอกชุด timeline → western ต้องตอบ "ไม่มีข้อมูล" ไม่ใช่ "ไม่มีมุม"
  const rMetal = buildResonance([{ ...AEAW, yongshen: { top3: [{ stem: "庚", element: "metal", finalScore: 7 }] } }], SCIS, YEAR, REF).perPerson[0].r5;
  const wMetal = rMetal?.evidence.find((e) => e.science === "western");
  ok("R5 ธาตุทอง(金星Venus)ไม่อยู่ในชุด transit timeline → western effect=null (ซื่อสัตย์)", !!wMetal && wMetal.effect === null && wMetal.detail.includes("ไม่มีข้อมูล"), JSON.stringify(wMetal));
  // parser unit: shape DB / array / string
  ok("resParseYongshen รับ 3 shape: {top3}/array/中文", JSON.stringify(resParseYongshen({ top3: [{ element: "water" }] })) === '["water"]' && JSON.stringify(resParseYongshen(["wood", "wood"])) === '["wood"]' && JSON.stringify(resParseYongshen("金")) === '["metal"]');
}

// ===== 11) R4 เสียงสะท้อนดวงคู่ · golden เอี๊ยว×ใหม่ =====
{
  const t2s = Date.now();
  const r = buildResonance([AEAW_DB, MAI], SCIS, YEAR, REF);
  const ms2 = Date.now() - t2s;
  ok("R4 คู่เดียว (2 ดวง = 1 คู่) + ไม่ skip", Array.isArray(r.r4Pairs) && r.r4Pairs.length === 1 && !r.r4Pairs[0].skippedNote, JSON.stringify(r.r4Pairs?.map((p) => p.skippedNote)));
  const pair = r.r4Pairs[0];
  ok("R4 ครบ 4 มิติตามตาราง R4_DIMENSIONS", pair.dimensions.length === 4 && pair.dimensions.every((d) => R4_DIMENSIONS[d.key]), JSON.stringify(pair.dimensions.map((d) => d.key)));
  ok("R4 ทุกมิติมีโหวตจริง (ไม่ null) จาก ≥2 ระบบ", pair.dimensions.every((d) => d.votes.filter((v) => v.vote !== null).length >= 2), JSON.stringify(pair.dimensions.map((d) => [d.key, d.votes.map((v) => `${v.system}:${v.vote}`)])));
  // ashtakoota ต้องตรง engine เอง (bride=ใหม่ F · groom=เอี๊ยว — กติกา Guna Milan เดียวกับ pair-interactions)
  const refMid = new Date(Date.UTC(YEAR, 6, 1));
  const A = vedicChart(AEAW.dtUTC, AEAW.lat, AEAW.lng, true, refMid);
  const B = vedicChart(MAI.dtUTC, MAI.lat, MAI.lng, true, refMid);
  const mA = A.grahas.find((g) => g.name === "Moon"), mB = B.grahas.find((g) => g.name === "Moon");
  const ak = ashtakoota(
    { nakshatraIndex: mB.nakshatra.index, rashi: mB.rashi, rashiDeg: mB.rashiDeg },
    { nakshatraIndex: mA.nakshatra.index, rashi: mA.rashi, rashiDeg: mA.rashiDeg },
  );
  const kuta = (k) => ak.kutas.find((x) => x.key === k).score;
  const vMind = pair.dimensions.find((d) => d.key === "mind").votes.find((v) => v.system === "vedic");
  const vComm = pair.dimensions.find((d) => d.key === "comm").votes.find((v) => v.system === "vedic");
  const vAttr = pair.dimensions.find((d) => d.key === "attract").votes.find((v) => v.system === "vedic");
  const vStab = pair.dimensions.find((d) => d.key === "stable").votes.find((v) => v.system === "vedic");
  ok("R4 vedic mind = graha_maitri+bhakoot ตรง engine เป๊ะ", vMind?.metrics?.grahaMaitri === kuta("grahaMaitri") && vMind?.metrics?.rasi === kuta("rasi"), JSON.stringify({ vote: vMind?.metrics, engine: { gm: kuta("grahaMaitri"), rasi: kuta("rasi") } }));
  ok("R4 vedic comm = vashya+dina(tara) ตรง engine เป๊ะ", vComm?.metrics?.vashya === kuta("vashya") && vComm?.metrics?.dina === kuta("dina"), JSON.stringify(vComm?.metrics));
  ok("R4 vedic attract = yoni ตรง engine · stable = nadi+rajju ตรง engine", vAttr?.metrics?.yoni === kuta("yoni") && vStab?.metrics?.nadi === kuta("nadi") && vStab?.metrics?.rajju === ak.rajju.score, JSON.stringify({ yoni: [vAttr?.metrics?.yoni, kuta("yoni")], nadi: [vStab?.metrics?.nadi, kuta("nadi")], rajju: [vStab?.metrics?.rajju, ak.rajju.score] }));
  // เกณฑ์โหวต kuta deterministic: ≥ครึ่ง=ดี · <1/4=ตึง · ระหว่าง=กลาง — เช็ค vote ตรงกับ metrics ของตัวเอง
  const kutaRule = (s, m) => (s >= m / 2 ? "good" : s < m / 4 ? "tense" : "mid");
  ok("R4 vedic vote สอดคล้องเกณฑ์ครึ่ง/เศษหนึ่งส่วนสี่ทุกมิติ", [vMind, vComm, vAttr, vStab].every((v) => v && v.vote === kutaRule(v.metrics.sum, v.metrics.max)), JSON.stringify([vMind, vComm, vAttr, vStab].map((v) => [v?.metrics?.sum, v?.metrics?.max, v?.vote])));
  // deterministic 2 รอบ
  const strip = (x) => { const y = JSON.parse(JSON.stringify(x)); delete y.computeMs; return JSON.stringify(y); };
  ok("R4 deterministic: รันคู่ 2 รอบผลเหมือนกันทุกตัวอักษร", strip(r) === strip(buildResonance([AEAW_DB, MAI], SCIS, YEAR, REF)));
  ok(`perf r370: 2 ดวง (1 คู่ R4+R5+R6) ≤3s (จริง ${ms2}ms)`, ms2 <= 3_000);
  // มิติจิตใจ bazi ไม่มี pillars ฝั่งใหม่ → โหวต null "ไม่มีข้อมูล" (ห้ามเดา)
  const bMind = pair.dimensions.find((d) => d.key === "mind").votes.find((v) => v.system === "bazi");
  ok("R4 bazi ไม่มี bazi_pillars ฝั่งหนึ่ง → โหวต null ระบุไม่มีข้อมูล", !!bMind && bMind.vote === null && bMind.evidence.includes("ไม่มีข้อมูล"), JSON.stringify(bMind));
}

// ===== 12) R4 bazi votes จาก pillars ทั้งคู่ (fixture ตำรา · deterministic) =====
{
  // ใหม่(สมมุติ pillars): วัน甲寅 → เทียบเอี๊ยว 己亥: ก้าน己×甲=天干五合 · กิ่ง亥×寅=六合+六破 → ดี2:ตึง1 = good
  const MAI_PILLARS = { ...MAI, baziPillars: { pillars: { year: { stem: "丙", branch: "寅" }, month: { stem: "壬", branch: "辰" }, day: { stem: "甲", branch: "寅" } } } };
  const r = buildResonance([AEAW_DB, MAI_PILLARS], SCIS, YEAR, REF);
  const dims = r.r4Pairs[0].dimensions;
  const bMind = dims.find((d) => d.key === "mind").votes.find((v) => v.system === "bazi");
  ok("R4 bazi 日支亥×寅 (六合+六破) + 己甲五合 → vote=good", !!bMind && bMind.vote === "good" && bMind.evidence.includes("六合") && bMind.evidence.includes("天干五合"), JSON.stringify(bMind));
  // ปี 子×寅 ไม่มีปฏิกิริยาเด่น → mid
  const bStab = dims.find((d) => d.key === "stable").votes.find((v) => v.system === "bazi");
  ok("R4 bazi ปี子×寅 ไม่มีปฏิกิริยาเด่น → vote=mid", !!bStab && bStab.vote === "mid", JSON.stringify(bStab));
  ok("resParsePillars รับทั้ง {pillars:{...}} และแบน + ปัดค่าที่ไม่ใช่干支", !!resParsePillars({ pillars: { day: { stem: "己", branch: "亥" } } })?.day && !!resParsePillars({ day: { stem: "己", branch: "亥" } })?.day && resParsePillars({ day: { stem: "X", branch: "Y" } }) === null);
}

// ===== 13) r4Resolve fixture (กติกาสะท้อน/ขัด) =====
{
  const v = (system, vote) => ({ system, vote, evidence: "" });
  ok("r4Resolve: ดี+ดี → สะท้อน good", JSON.stringify(r4Resolve([v("western", "good"), v("vedic", "good")])) === '{"resonance":"good","conflict":false}');
  ok("r4Resolve: ดี vs ตึง → conflict + ไม่มีสะท้อน", JSON.stringify(r4Resolve([v("western", "good"), v("vedic", "tense")])) === '{"resonance":null,"conflict":true}');
  ok("r4Resolve: ดี2+ตึง2 (สวนชัดสองฝั่ง) → resonance null + conflict", JSON.stringify(r4Resolve([v("western", "good"), v("vedic", "good"), v("bazi", "tense"), v("ziwei", "tense")])) === '{"resonance":null,"conflict":true}');
  ok("r4Resolve: กลาง+กลาง → สะท้อน mid · โหวตเดี่ยว/มี null → ไม่สะท้อน", JSON.stringify(r4Resolve([v("western", "mid"), v("vedic", "mid")])) === '{"resonance":"mid","conflict":false}' && r4Resolve([v("western", "good"), v("vedic", null)]).resonance === null);
}

// ===== 14) render รวม R4/R5/R6 + no-time + perf 4 ดวง =====
{
  const B = { name: "บี", dtUTC: new Date("1986-04-08T17:04:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F" };
  const C = { name: "ซี", dtUTC: new Date("1990-06-15T02:30:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "M" };
  const D = { name: "ดี", dtUTC: new Date("1995-11-20T10:00:00Z"), lat: 18.7883, lng: 98.9853, hasTime: true, gender: "F" };
  const r2p = buildResonance([AEAW_DB, MAI], SCIS, YEAR, REF);
  const blk = renderResonanceBlockTh(r2p);
  ok("render มี R5 + R6 + หัวคู่ R4 + มิติไทย", blk.includes("R5 สะพานธาตุ") && blk.includes("R6 ปีชง 丙午") && blk.includes("· R4 มิติความเข้ากัน") && blk.includes("อารมณ์-จิตใจ:"), blk.slice(0, 200));
  ok(`render 2 ดวง ≤${RESONANCE_BLOCK_MAX_CHARS} (จริง ${blk.length})`, blk.length <= RESONANCE_BLOCK_MAX_CHARS);
  // no-time: คู่ที่มีฝ่ายถูกข้าม → R4 pair ติด skippedNote (ไม่เดา)
  const rNT = buildResonance([AEAW_DB, { ...MAI, name: "ไม่มีเวลา", hasTime: false }], SCIS, YEAR, REF);
  ok("R4 คู่กับคนไม่มีเวลาเกิด → skippedNote (ห้ามเดา)", rNT.r4Pairs.length === 1 && /ข้ามคู่นี้/.test(rNT.r4Pairs[0].skippedNote || "") && rNT.r4Pairs[0].dimensions.length === 0, JSON.stringify(rNT.r4Pairs[0].skippedNote));
  const t4s = Date.now();
  const r4p = buildResonance([AEAW_DB, B, C, D], SCIS, YEAR, REF);
  const ms4v2 = Date.now() - t4s;
  ok("R4 กลุ่ม 4 ดวง = 6 คู่ครบ i<j", (r4p.r4Pairs || []).length === 6, `pairs=${r4p.r4Pairs?.length}`);
  ok(`perf r370: 4 ดวง (6 คู่) ≤6s (จริง ${ms4v2}ms)`, ms4v2 <= 6_000);
  const blk4 = renderResonanceBlockTh(r4p);
  ok(`render 4 ดวง+6 คู่ ถูกตัดฉลาด ≤${RESONANCE_BLOCK_MAX_CHARS} (จริง ${blk4.length}) + หัวท้ายครบ`, blk4.length <= RESONANCE_BLOCK_MAX_CHARS && blk4.startsWith("=== RESONANCE_PACKET") && blk4.includes("END_RESONANCE_PACKET"));
}

/* ████████████ Resonance v3 · independence: structural vs independent (กัน overcount R2/R3) ████████████ */

// ===== 15) v3 fixture สังเคราะห์ทั้งสองแบบ + ลำดับ independent มาก่อน =====
{
  const ev = (science, month, planet, dateISO) => ({ science, month, planet, dateISO, evidence: `${science} ${planet} ${dateISO}`, polarity: "neutral" });
  const c = clusterByMonth([
    ev("western", 3, "Sun", "2026-03-21"),  // เดือน節氣จีน ↔ ตำแหน่ง Sun ตะวันตก (สังเคราะห์ — วัดอาทิตย์ชิ้นเดียวกัน)
    ev("qizheng", 3, "Sun", "2026-03-20"),
    ev("western", 5, "Saturn", "2026-05-06"),
    ev("qizheng", 5, "Saturn", "2026-05-12"),
    ev("western", 8, "Uranus", "2026-08-01"),
    ev("vedic", 8, "Uranus", "2026-08-09"),
  ]);
  ok("v3 R2 Sun-driven ทั้งคู่ → structural", c.length === 3 && c.some((x) => x.planet === "Sun" && x.month === 3 && x.independence === "structural"), JSON.stringify(c.map((x) => [x.planet, x.independence])));
  ok("v3 R2 Saturn/Uranus → independent (ดาวที่ปฏิทินตัวนับมองไม่เห็น)", c.filter((x) => x.independence === "independent").map((x) => x.planet).sort().join(",") === "Saturn,Uranus");
  ok("v3 ลำดับ: independent มาก่อน structural แม้เดือนหลัง", c[0].independence === "independent" && c[1].independence === "independent" && c[2].independence === "structural" && c[2].planet === "Sun");
  const e3 = clusterEclipseByMonth([
    { science: "western", month: 7, dateISO: "2026-07-01", evidence: "sun-derived A", driver: "sun" },
    { science: "qizheng", month: 7, dateISO: "2026-07-01", evidence: "sun-derived B", driver: "sun" },
    { science: "western", month: 2, dateISO: "2026-02-17", evidence: "คราสสุริยะแตะจันทร์", driver: "eclipse" },
    { science: "qizheng", month: 2, dateISO: "2026-02-17", evidence: "羅睺沖命度", driver: "node" },
  ]);
  ok("v3 R3 คราส/ราหู → independent · driver sun ทั้งหมด → structural + อิสระมาก่อน", e3.length === 2 && e3[0].month === 2 && e3[0].independence === "independent" && e3[1].month === 7 && e3[1].independence === "structural", JSON.stringify(e3.map((x) => [x.month, x.independence])));
  // driver ไม่ระบุ (caller เก่า/jsonb เก่า) → independent (พฤติกรรมเท่าเดิม ไม่ลดชั้นของจริง)
  const e3legacy = clusterEclipseByMonth([
    { science: "western", month: 4, dateISO: "2026-04-01", evidence: "a" },
    { science: "qizheng", month: 4, dateISO: "2026-04-02", evidence: "b" },
  ]);
  ok("v3 R3 driver ไม่ระบุ (backward) → independent", e3legacy.length === 1 && e3legacy[0].independence === "independent");
}

// ===== 16) v3 golden เอี๊ยว 2026: ของจริงไม่ถูกลดชั้น + R6 ไม่แตะ (3 เสียงครบ) + deterministic =====
{
  const r = buildResonance([AEAW_DB], SCIS, YEAR, REF);
  const p0 = r.perPerson[0];
  ok("v3 golden: R2/R3 จริงทุก cluster = independent (collector ไม่มี event Sun-driven — นับไม่ตก)", p0.r2.every((c) => c.independence === "independent") && p0.r3.every((c) => c.independence === "independent"), JSON.stringify({ r2: p0.r2.map((c) => [c.planet, c.independence]), r3: p0.r3.map((c) => [c.month, c.independence]) }));
  const r6 = p0.r6;
  ok("v3 R6 ไม่แตะ: golden 丙午 ครบ 3 ระบบ + ≥2 เสียง + จีนมี沖", !!r6 && r6.targetGanzhi === "丙午" && r6.votes.length === 3 && r6.voiceCount >= 2 && r6.relations.includes("沖"), JSON.stringify({ v: r6?.voiceCount, rel: r6?.relations }));
  const strip = (x) => { const y = JSON.parse(JSON.stringify(x)); delete y.computeMs; return JSON.stringify(y); };
  ok("v3 deterministic: รัน 2 รอบผลเหมือนกันทุกตัวอักษร (รวม independence)", strip(r) === strip(buildResonance([AEAW_DB], SCIS, YEAR, REF)));
}

// ===== 17) v3 render: แยกกลุ่ม 🥇/ℹ️ + structural เป็นรายละเอียดรอง + cap เดิม =====
{
  const mk = (planet, month, independence) => ({
    month, planet, planetTh: planet === "Sun" ? "อาทิตย์(日)" : "เสาร์(土)", independence,
    sciences: ["western", "qizheng"],
    evidences: [
      { science: "western", dateISO: `2026-${String(month).padStart(2, "0")}-06`, evidence: `western ${planet} m${month}` },
      { science: "qizheng", dateISO: `2026-${String(month).padStart(2, "0")}-12`, evidence: `qizheng ${planet} m${month}` },
    ],
  });
  const synth = { ...res, perPerson: [{ ...res.perPerson[0], r2: [mk("Saturn", 5, "independent"), mk("Sun", 3, "structural")], r3: [] }] };
  const blk = renderResonanceBlockTh(synth);
  ok("v3 render: มีหัวกลุ่ม 🥇 ยืนยันอิสระ (นาฬิกาคนละเรือน)", blk.includes("R2 🥇 ยืนยันอิสระ (นาฬิกาคนละเรือน):"));
  ok("v3 render: structural แยกกลุ่ม ℹ️ วัดของชิ้นเดียวกัน ไม่นับเป็นหลักฐานซ้ำ", blk.includes("R2 ℹ️ พ้องเชิงโครงสร้าง (วัดของชิ้นเดียวกัน — ไม่นับเป็นหลักฐานซ้ำ):") && blk.indexOf("🥇") < blk.indexOf("พ้องเชิงโครงสร้าง"));
  ok(`v3 render ≤ cap เดิม ${RESONANCE_BLOCK_MAX_CHARS} (จริง ${blk.length})`, blk.length <= RESONANCE_BLOCK_MAX_CHARS && blk.includes("END_RESONANCE_PACKET"));
  // r2 เก่าใน jsonb (ไม่มี field independence) → render เป็นอิสระตามเดิม ไม่พัง
  const legacy = { ...res, perPerson: [{ ...res.perPerson[0], r2: [{ month: 5, planet: "Saturn", planetTh: "เสาร์(土)", sciences: ["western", "qizheng"], evidences: [{ science: "western", dateISO: "2026-05-06", evidence: "x" }] }], r3: [] }] };
  const blkL = renderResonanceBlockTh(legacy);
  ok("v3 render jsonb เก่า (ไม่มี independence) → นับเป็นอิสระ ไม่พัง", blkL.includes("R2 🥇 ยืนยันอิสระ") && !blkL.includes("พ้องเชิงโครงสร้าง"));
}

/* ████████████ r400 · ยูเรเนียนเข้า R6 (เสียงอารยธรรมที่ 4 · directed/progressed) — Guard B: ไม่แตะ R2 ████████████ */

// helper: กรอง R6 uranian hits จาก engine ตรง (เทียบกับ vote ที่ resonance ผลิต · ไม่ hardcode วัน)
const R6U_METHODS = new Set(["solar_arc", "prog_sun", "prog_mc"]);
const R6U_MOVERS = new Set(["Saturn", "Sun", "Meridian"]);
const R6U_TARGETS = new Set(["Sun", "Meridian", "Ascendant"]);
const R6U_ASPECTS = new Set([0, 90, 180]);
const engineUranianR6Hits = (dt, lat, lng, year) => {
  const uc = uranianChart(dt, lat, lng, true, "M");
  const aus = computeUranianAuslosung(uc, dt, `${year}-01-01`, `${year}-12-31`);
  return aus.events.filter((e) => R6U_METHODS.has(e.method) && R6U_MOVERS.has(e.mover) && e.natalTargetKind === "point" && R6U_TARGETS.has(e.natalTarget) && R6U_ASPECTS.has(e.aspect));
};

const SCIS_U = ["western", "vedic", "ziwei", "qizheng", "uranian"];

// ===== 18) ยูเรเนียนเป็น vote ที่ 4 ใน R6 เมื่อผู้ใช้เลือกศาสตร์นี้ · golden เอี๊ยว 2026 =====
{
  const r = buildResonance([AEAW_DB], SCIS_U, YEAR, REF);
  const p0 = r.perPerson[0];
  const r6 = p0.r6;
  ok("r400 RESONANCE_SCIENCES + res.sciences รวม uranian เมื่อเลือก", r.sciences.includes("uranian"), JSON.stringify(r.sciences));
  const uv = r6?.votes.find((v) => v.system === "uranian");
  ok("r400 R6 มี vote system=uranian + votes.length=4", !!uv && r6.votes.length === 4, JSON.stringify(r6?.votes.map((v) => v.system)));
  ok("r400 R6 uranian heavy เป็น boolean (ไม่ null · คำนวณจริงเมื่อเลือก)", !!uv && typeof uv.heavy === "boolean", JSON.stringify(uv));
  // เทียบ vote heavy กับ engine ตรง (คมสุด/orb — ไม่ hardcode)
  const eHits = engineUranianR6Hits(AEAW.dtUTC, AEAW.lat, AEAW.lng, YEAR);
  ok("r400 R6 uranian heavy = (engine มี hit directed/prog เสาร์/☉/Meridian → ☉/MC/Asc มุมแข็ง)", !!uv && uv.heavy === (eHits.length > 0), JSON.stringify({ vote: uv?.heavy, engineHits: eHits.length, sample: eHits.slice(0, 3).map((h) => `${h.method}:${h.mover}${h.aspect}${h.natalTarget}@${h.dateISO}`) }));
  // golden 3 อารยธรรมเดิมไม่พัง
  ok("r400 golden 3 อารยธรรมเดิมคงอยู่: 丙午 + จีน沖 + western heavy", r6?.targetGanzhi === "丙午" && r6.relations.includes("沖") && r6.votes.find((v) => v.system === "western")?.heavy === true, JSON.stringify({ gz: r6?.targetGanzhi, rel: r6?.relations }));
}

// ===== 19) Guard B: ยูเรเนียน "ไม่เข้า R2/R3/R1/R5/CONFLICT" (กัน overcount ดาวจร ephemeris เดียวกับ western) =====
{
  const r = buildResonance([AEAW_DB], SCIS_U, YEAR, REF);
  const p0 = r.perPerson[0];
  const anyUranianCluster = [...p0.r2, ...p0.r3].some((c) => c.sciences.includes("uranian"));
  ok("r400 Guard B: ไม่มี cluster R2/R3 ใดมีศาสตร์ uranian", !anyUranianCluster, JSON.stringify({ r2: p0.r2.map((c) => c.sciences), r3: p0.r3.map((c) => c.sciences) }));
  const anyUranianR1 = p0.r1.entries.some((e) => e.science === "uranian");
  ok("r400 Guard B: ไม่มี R1 entry uranian · ไม่มี conflict/R5 evidence uranian", !anyUranianR1 && !p0.conflicts.some((c) => c.beneficScience === "uranian" || c.maleficScience === "uranian") && !(p0.r5?.evidence || []).some((e) => e.science === "uranian"));
  // เทียบกับกรณีไม่เลือก uranian: R2/R3/R1 ต้องเหมือนเดิมเป๊ะ (additive · ไม่กระทบชั้นอื่น)
  const rNo = buildResonance([AEAW_DB], SCIS, YEAR, REF).perPerson[0];
  const stripR6 = (p) => JSON.stringify({ r1: p.r1, r2: p.r2, r3: p.r3, conflicts: p.conflicts, r5: p.r5 });
  ok("r400 additive: เลือก/ไม่เลือก uranian → R1/R2/R3/CONFLICT/R5 เหมือนกันเป๊ะ", stripR6(p0) === stripR6(rNo));
  ok("r400 ไม่เลือก uranian → R6 คง 3 votes (backward)", rNo.r6?.votes.length === 3 && !rNo.r6.votes.some((v) => v.system === "uranian"));
}

// ===== 20) render R6 มีบรรทัดยูเรเนียน + voiceCount/votes.length dynamic + deterministic + cap =====
{
  const r = buildResonance([AEAW_DB], SCIS_U, YEAR, REF);
  const blk = renderResonanceBlockTh(r);
  ok("r400 render R6 มีป้าย ยูเรเนียน(directed/ก้าวหน้า) + /4", blk.includes("ยูเรเนียน(directed/ก้าวหน้า)=") && /→ \d\/4 เสียงบอกปีหนัก/.test(blk), blk.split("\n").filter((l) => l.includes("R6 ปีชง"))[0]);
  ok(`r400 render ≤ cap ${RESONANCE_BLOCK_MAX_CHARS} (จริง ${blk.length}) + หัวท้ายครบ`, blk.length <= RESONANCE_BLOCK_MAX_CHARS && blk.startsWith("=== RESONANCE_PACKET") && blk.includes("END_RESONANCE_PACKET"));
  const strip = (x) => { const y = JSON.parse(JSON.stringify(x)); delete y.computeMs; return JSON.stringify(y); };
  ok("r400 deterministic: uranian R6 รัน 2 รอบเท่ากันทุกตัวอักษร", strip(r) === strip(buildResonance([AEAW_DB], SCIS_U, YEAR, REF)));
}

// ===== 21) ตัวอย่างจริง: หาปีที่ยูเรเนียนร่วมเสียง R6 ของเอี๊ยว (directed/prog ปลุกจุดส่วนตัว) =====
{
  const firedYears = [];
  for (let y = 2020; y <= 2035; y++) {
    const r6 = buildResonance([AEAW_DB], SCIS_U, y, REF).perPerson[0].r6;
    const uv = r6?.votes.find((v) => v.system === "uranian");
    if (uv?.heavy) firedYears.push({ y, voiceCount: r6.voiceCount, ev: uv.dates.slice(0, 2) });
  }
  console.log(`ℹ️ เอี๊ยว · ปีที่ยูเรเนียนร่วมเสียง R6 (2020-2035): ${firedYears.length ? firedYears.map((f) => `${f.y}(${f.voiceCount}เสียง·${f.ev.join(",")})`).join(" · ") : "ไม่มีปีที่ปลุก (นาฬิกาทุติยภูมิเคลื่อนช้า)"}`);
  ok("r400 ตัวอย่างจริง: มีอย่างน้อย 1 ปีใน 2020-2035 ที่ยูเรเนียนร่วมเสียง (พิสูจน์ voice ที่ 4 ทำงานจริง)", firedYears.length >= 1, `firedYears=${firedYears.map((f) => f.y).join(",")}`);
}

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
