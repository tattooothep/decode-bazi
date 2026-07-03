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

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
