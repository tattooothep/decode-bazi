// r399 · ยืนยัน 3 งาน: (1) กลุ่ม 2/3/4 ดวง ทุกดวงมี STRUCTURED_CHART_PACKET ครบ (JSON parse ได้) + ≤118K + ไม่มี tail-cut ตัด packet
//   (2) คัมภีร์แม่บท verbatim ไม่ถูกตัดเงียบ (โผล่ใน SOURCE_MAP หรือ /truncated โปร่งใส)  (3) Q&A judge ได้ MULTI_YEAR เมื่อถามช่วงปี
// run: npx tsx scripts/test-fusion5-group-packet-r399.mjs
import { buildSciencePrompt, buildJudgePrompt, resolveFusionTimingReference, FUSION_PANEL_PROMPT_MAX_CHARS as CAP } from "../src/lib/fusion5/build-prompt.ts";
import { renderMultiYearBlock, resolveFusionYearRange } from "../src/lib/fusion5/multi-year.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}${detail && !cond ? " · " + detail : ""}`); };

const A = [
  { name: "เอี๋ยว", dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "M" },
  { name: "ไหมมี่", dtUTC: new Date("1986-04-08T17:04:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F" },
  { name: "สมหวัง", dtUTC: new Date("1991-07-15T02:30:00Z"), lat: 18.7883, lng: 98.9853, hasTime: true, gender: "M" },
  { name: "สายฝน", dtUTC: new Date("1995-11-03T13:45:00Z"), lat: 7.8804, lng: 98.3923, hasTime: true, gender: "F" },
];
const SCIS = ["western", "vedic", "ziwei", "qizheng", "uranian"];
const Q = "ปี 2026 กลุ่มนี้ร่วมหุ้นทำธุรกิจดีไหม ใครหนุนใครชนใคร";
const REF = new Date("2026-07-01T00:00:00Z");

function validPackets(prompt, n) {
  const parts = prompt.split(/=== ผังดวง คนที่ \d+/).slice(1);
  let count = 0;
  for (let i = 0; i < parts.length && i < n; i++) {
    const m = parts[i].indexOf("STRUCTURED_CHART_PACKET:\n");
    if (m < 0) continue;
    let j = parts[i].slice(m + "STRUCTURED_CHART_PACKET:\n".length)
      .split(/\n=== |\n\[PAIR|\nPAIR_INTERACTION|\n=== ดูคู่|\n=== MULTI_YEAR|\n=== PAIR_TIMING/)[0].trim();
    try { JSON.parse(j); count++; } catch { /* invalid */ }
  }
  return count;
}

// งาน 1 · กลุ่ม 2/3/4 ดวง ทุกศาสตร์
for (const sci of SCIS) {
  for (const n of [2, 3, 4]) {
    const p = buildSciencePrompt(sci, A.slice(0, n), Q, "th", REF);
    ok(`${sci} n=${n}: ≤118K`, p.length <= CAP, `${p.length}`);
    ok(`${sci} n=${n}: ทุกดวง packet ครบ (JSON valid)`, validPackets(p, n) === n, `${validPackets(p, n)}/${n}`);
    ok(`${sci} n=${n}: ไม่มี tail-cut ตัดกลาง prompt`, !p.includes("TRUNCATED_NONCRITICAL_PREFIX_FOR_PROMPT_CAP"));
  }
  // n=1 ไม่ compact (guard births≥2)
  const p1 = buildSciencePrompt(sci, [A[0]], Q, "th", REF);
  ok(`${sci} n=1: ไม่บีบ prose (compact เฉพาะกลุ่ม)`, !p1.includes("CHART_PROSE_TRUNCATED_FOR_GROUP_BUDGET") && p1.length <= CAP);
}

// งาน 2 · คัมภีร์แม่บทโผล่ใน SOURCE_MAP (ไม่ถูกตัดเงียบ) — โปร่งใส
const MASTER = {
  western: ["02-lilly-houses", "tetrabiblos-core"],
  vedic: ["vedic-core", "02-bphs-dasha-yoga"],
  ziwei: ["ziwei-quanshu-core", "07-quanshu-xingyuan-wenda"],
};
for (const [sci, masters] of Object.entries(MASTER)) {
  const p = buildSciencePrompt(sci, [A[0]], "ช่วยดูดวงโดยรวมของฉัน", "th", REF);
  const sm = (p.match(/SOURCE_MAP:.*/) || [""])[0];
  for (const m of masters) ok(`${sci}: master "${m}" อยู่ใน SOURCE_MAP (ไม่ตัดเงียบ)`, sm.includes(m));
}

// งาน 3 · Q&A judge ได้ MULTI_YEAR เมื่อถามช่วงปี · ไม่ถามช่วงปี = ไม่มี (backward compatible)
const okPanels = [{ science: "western", reply: "..." }, { science: "vedic", reply: "..." }];
function buildMY(question) {
  const timingRef = resolveFusionTimingReference(question, REF);
  const yr = resolveFusionYearRange(question, timingRef.refDate);
  if (!yr) return undefined;
  const parts = [];
  const scis = okPanels.map((x) => x.science).filter((s) => s !== "bazi");
  outer: for (const b of [A[0]]) {
    const like = { name: b.name, dtUTC: b.dtUTC, lat: b.lat, lng: b.lng, hasTime: b.hasTime, gender: b.gender };
    for (const s of scis) { try { const blk = renderMultiYearBlock(s, like, yr.startYear, yr.endYear); if (blk && blk.trim()) parts.push(blk.trim()); } catch { /**/ } if (parts.join("\n").length > 5500) break outer; }
  }
  return parts.length ? parts.join("\n\n").slice(0, 6000) : undefined;
}
{
  const qYear = "ปี 2016 ถึง 2026 ปีไหนหนักปีไหนเบา";
  const myb = buildMY(qYear);
  const jp = buildJudgePrompt(okPanels, [A[0]], qYear, "th", undefined, undefined, myb);
  ok("Q&A judge: คำถามช่วงปี → มี MULTI_YEAR", jp.includes("=== MULTI_YEAR (ไทม์ไลน์หลายปี") && jp.includes("MULTI_YEAR_TIMELINE"));
  ok("Q&A judge: MULTI_YEAR ≤118K", jp.length <= CAP, `${jp.length}`);

  const qNo = "ดวงโดยรวมเป็นยังไง";
  const jp2 = buildJudgePrompt(okPanels, [A[0]], qNo, "th", undefined, undefined, buildMY(qNo));
  ok("Q&A judge: ไม่ถามช่วงปี → ไม่มี MULTI_YEAR (เดิม)", !jp2.includes("=== MULTI_YEAR (ไทม์ไลน์หลายปี"));
}

console.log(`\n=== r399 group-packet + canon-priority + judge-multiyear: ${pass} passed · ${fail} failed ===`);
process.exit(fail ? 1 : 0);
