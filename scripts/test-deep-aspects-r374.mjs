/* r374 มุมชั้นลึก — golden test
 * PART 1: western progressed→natal aspects + progressed-Moon monthly perfections
 * PART 2: bazi 拱/暗合 hidden combos (canon: data/library/bazi-interaction-master.md §6.4 + §6.9)
 * รัน: npx tsx scripts/test-deep-aspects-r374.mjs
 */
import * as tyme from "tyme4ts";
import { westernChart } from "../src/lib/astro/western/engine.ts";
import { buildWesternTimeline } from "../src/lib/astro/western/timeline.ts";
import { buildWesternPacket } from "../src/lib/astro/western/packet.ts";
import { renderWesternPrompt } from "../src/lib/astro/western/render.ts";
import { eclipticLon } from "../src/lib/astro-core/ephemeris.ts";
import { wrap180 } from "../src/lib/astro-core/events.ts";
import { calcBazi, getSolarTimeAtTST } from "../src/lib/bazi-calc.ts";
import { buildChartExtensions } from "../src/lib/chart-extensions.ts";
import { computeSiLingDays } from "../src/lib/chart-table.ts";
import { buildStructuredChartPacket, buildHiddenCombos, renderChartPrompt } from "../src/lib/chart-packet.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
};
const DAY_MS = 86400000;
const BKK_MS = 7 * 3600 * 1000;

/* ═══════════ PART 1 · western progressed (golden Aeaw 1984-12-31 13:15 กรุงเทพ) ═══════════ */
const birth = { dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018 };
const TARGET = 2026;
const chart = westernChart(birth.dtUTC, birth.lat, birth.lng, true, "M", new Date("2026-07-01T00:00:00Z"));
const tl = buildWesternTimeline(chart, birth, TARGET);

ok("P1: มี progressed", !!tl.progressed);
ok("P1: มี progressedAspects (field additive)", Array.isArray(tl.progressed?.progressedAspects));
ok("P1: มี moonPerfections (มีเวลาเกิด → เปิด)", Array.isArray(tl.progressed?.moonPerfections));

/* 1a) progressed Sun position ต้องตรง engine เดิม: คำนวณ progressed date เอง (day-per-year) แล้วเทียบ */
const midYear = new Date(Date.UTC(TARGET, 6, 1) - BKK_MS);
const ageYears = (midYear.getTime() - birth.dtUTC.getTime()) / DAY_MS / 365.2425;
const progDate = new Date(birth.dtUTC.getTime() + ageYears * DAY_MS);
const expSunLon = eclipticLon("Sun", progDate);
const engSun = tl.progressed.planets.find((p) => p.name === "Sun");
const engSunLon = engSun.sign * 30 + engSun.signDeg;
ok("P1: ตำแหน่ง progressed Sun ตรง engine (day-per-year)", Math.abs(wrap180(expSunLon - engSunLon)) < 0.02,
  `expected ${expSunLon.toFixed(3)} got ${engSunLon.toFixed(3)}`);

/* 1b) orb math ถูก: ทุก progressedAspect ต้อง |sep - angle| ≤ 1° เมื่อคำนวณตรงจาก ephemeris */
const ANGLE = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 };
const natalLon = new Map(chart.planets.map((p) => [p.name, p.lon]));
if (chart.ascendant !== null) natalLon.set("Ascendant", chart.ascendant);
if (chart.mc !== null) natalLon.set("MC", chart.mc);
let orbOk = true, orbDetail = "";
for (const a of tl.progressed.progressedAspects) {
  const pLon = eclipticLon(a.progressed, progDate);
  const sep = Math.abs(wrap180(pLon - natalLon.get(a.natal)));
  const err = Math.abs(Math.abs(sep - ANGLE[a.aspect]) - a.orb);
  if (err > 0.02 || a.orb > 1) { orbOk = false; orbDetail += `${a.progressed}-${a.aspect}-${a.natal} orb=${a.orb} err=${err.toFixed(3)} `; }
  if (!["Sun", "Moon", "Mercury", "Venus", "Mars"].includes(a.progressed)) { orbOk = false; orbDetail += `body ${a.progressed} นอกชุด 5 ดวงเร็ว `; }
}
ok(`P1: orb math progressedAspects ถูกทุกตัว (${tl.progressed.progressedAspects.length} มุม · ≤1°)`, orbOk, orbDetail);

/* 1c) moonPerfections: verify แต่ละ hit ด้วย direct computation — จันทร์ progressed ข้ามมุมพอดีภายในเดือนนั้นจริง */
const progMoonAt = (y, m) => { // ขอบเดือน (เวลาไทย) → จันทร์ progressed
  const t = new Date(Date.UTC(y, m, 1) - BKK_MS);
  const ay = (t.getTime() - birth.dtUTC.getTime()) / DAY_MS / 365.2425;
  return eclipticLon("Moon", new Date(birth.dtUTC.getTime() + ay * DAY_MS));
};
let mpOk = true, mpDetail = "";
for (const x of tl.progressed.moonPerfections) {
  const lon0 = progMoonAt(TARGET, x.month - 1);
  const lon1 = progMoonAt(TARGET, x.month);
  const tgt = natalLon.get(x.natal);
  const A = ANGLE[x.aspect];
  // ตรวจ offset ข้ามศูนย์ทั้งฝั่ง +A และ -A
  const crossed = [A, -A].some((s) => {
    const h0 = wrap180(lon0 - tgt - s), h1 = wrap180(lon1 - tgt - s);
    return Math.abs(h0) < 6 && Math.abs(h1) < 6 && h0 * h1 <= 0;
  });
  if (!crossed) { mpOk = false; mpDetail += `เดือน${x.month} ${x.aspect} ${x.natal} ไม่ข้ามมุมจริง `; }
}
ok(`P1: moonPerfections ทุกจุด verify ด้วย direct computation (${tl.progressed.moonPerfections.length} จุด)`, mpOk, mpDetail);
ok("P1: moonPerfections มีอย่างน้อย 1 จุด (จันทร์เดิน ~13°/ปี ควรชนอย่างน้อยหนึ่ง slot)", tl.progressed.moonPerfections.length >= 1,
  `got ${tl.progressed.moonPerfections.length}`);

/* 1d) deterministic */
const tl2 = buildWesternTimeline(chart, birth, TARGET);
ok("P1: deterministic (progressedAspects+moonPerfections)",
  JSON.stringify(tl2.progressed.progressedAspects) === JSON.stringify(tl.progressed.progressedAspects) &&
  JSON.stringify(tl2.progressed.moonPerfections) === JSON.stringify(tl.progressed.moonPerfections));

/* 1e) no-time → moonPerfections ปิด (จันทร์คลาด ±6° ≈ ±6 เดือน) */
const chartNT = westernChart(birth.dtUTC, birth.lat, birth.lng, false, "M", new Date("2026-07-01T00:00:00Z"));
const tlNT = buildWesternTimeline(chartNT, birth, TARGET);
ok("P1: no-time → moonPerfections ไม่ส่ง (undefined)", tlNT.progressed.moonPerfections === undefined);

/* 1f) render: subsection + guard + ขนาดโตไม่เกิน 2K */
const packetW = buildWesternPacket(chart, tl);
const rendered = renderWesternPrompt(packetW);
ok("P1: render มี [Progressed Aspects ปี 2026]", rendered.includes(`[Progressed Aspects ปี ${TARGET}]`));
ok("P1: render มี guard ชั้นพัฒนาการภายใน", rendered.includes("ชั้นพัฒนาการภายใน (secondary progression) · ความหมายเชิงกระบวนการชีวิต ไม่ใช่เหตุการณ์ฉับพลัน"));
const tlBase = JSON.parse(JSON.stringify(tl));
delete tlBase.progressed.progressedAspects;
delete tlBase.progressed.moonPerfections;
const renderedBase = renderWesternPrompt(buildWesternPacket(chart, tlBase));
const growthW = rendered.length - renderedBase.length;
console.log(`   ขนาด render western: ${renderedBase.length} → ${rendered.length} (+${growthW} chars)`);
ok("P1: western render โต ≤2K chars", growthW > 0 && growthW <= 2000, `+${growthW}`);
const newLines = rendered.split("\n").length - renderedBase.split("\n").length;
ok("P1: render เพิ่ม ≤15 บรรทัด", newLines <= 15, `+${newLines} lines`);

/* ═══════════ PART 2 · 拱/暗合 (canon §6.4+§6.9 bazi-interaction-master.md) ═══════════ */
/* golden เอี๊ยว 甲子/丙子/己亥/庚午 → กิ่ง 子子亥午
 *   拱 (คำนวณมือ): ตาราง§6.4 = 申辰/亥未/寅戌/巳丑 — เอี๊ยวมี {子,亥,午} ไม่มีคู่ไหนครบ → 0 拱
 *   暗合 (คำนวณมือ): ตาราง§6.9 = 寅丑/卯申/午亥 — เสาวัน亥 + เสายาม午 = 午亥暗合 (丁壬/己甲) → 1 จุด */
const pillarsAeaw = {
  year: { stem: "甲", branch: "子" }, month: { stem: "丙", branch: "子" },
  day: { stem: "己", branch: "亥" }, hour: { stem: "庚", branch: "午" },
};
const KEYS4 = ["year", "month", "day", "hour"];
const hcAeaw = buildHiddenCombos(pillarsAeaw, KEYS4, "午"); // ปีจร 2026 = 丙午
ok("P2: เอี๊ยว — 拱 = 0 (ไม่มีคู่ 申辰/亥未/寅戌/巳丑)", hcAeaw.filter((x) => x.kind === "gong").length === 0,
  JSON.stringify(hcAeaw.filter((x) => x.kind === "gong")));
const anheAeaw = hcAeaw.filter((x) => x.kind === "anhe");
ok("P2: เอี๊ยว — 暗合 = 1 จุด (午亥 เสาวัน×เสายาม)", anheAeaw.length === 1 &&
  anheAeaw[0].pair.slice().sort().join("") === "亥午".split("").sort().join("") &&
  anheAeaw[0].pillars.includes("day") && anheAeaw[0].pillars.includes("hour"),
  JSON.stringify(anheAeaw));
ok("P2: เอี๊ยว — 午亥暗合 ก้านซ่อน 丁壬+己甲 ตรงตาราง §6.9", anheAeaw[0]?.hiddenStemPairs?.join(",") === "丁壬,己甲",
  JSON.stringify(anheAeaw[0]?.hiddenStemPairs));

/* golden Mai 丙寅/壬辰/丙戌/丙申 → กิ่ง 寅辰戌申
 *   拱 (คำนวณมือ): 申(時)+辰(月) มี · ตัวกลาง子ไม่มี → 拱子(น้ำ) ✓ · 寅(年)+戌(日) มี · 午ไม่มี → 拱午(ไฟ) ✓ = 2 จุด
 *   暗合: คู่ที่มี = 寅辰/寅戌/寅申/辰戌/辰申/戌申 — ไม่มีใน 寅丑/卯申/午亥 → 0 */
const pillarsMai = {
  year: { stem: "丙", branch: "寅" }, month: { stem: "壬", branch: "辰" },
  day: { stem: "丙", branch: "戌" }, hour: { stem: "丙", branch: "申" },
};
const hcMai = buildHiddenCombos(pillarsMai, KEYS4, "午");
const gongMai = hcMai.filter((x) => x.kind === "gong");
ok("P2: Mai — 拱 = 2 จุด (申辰拱子 + 寅戌拱午)", gongMai.length === 2, JSON.stringify(gongMai.map((g) => g.pair.join("") + "→" + g.missingBranch)));
const gongZi = gongMai.find((g) => g.missingBranch === "子");
const gongWu = gongMai.find((g) => g.missingBranch === "午");
ok("P2: Mai — 申辰拱子 ธาตุน้ำ · เสายาม×เสาเดือน", !!gongZi && gongZi.element === "water" &&
  gongZi.pillars.includes("hour") && gongZi.pillars.includes("month"), JSON.stringify(gongZi));
ok("P2: Mai — 寅戌拱午 ธาตุไฟ · ปีจร丙午เติม午 = 填實ตอนนี้", !!gongWu && gongWu.element === "fire" && gongWu.annualFillsNow === true,
  JSON.stringify(gongWu));
ok("P2: Mai — 暗合 = 0", hcMai.filter((x) => x.kind === "anhe").length === 0);

/* กันเดา: ถ้ามีตัวกลางในดวงอยู่แล้ว ต้องไม่นับ拱 (เป็น半合/三合ของ engine เดิม) */
const hcWithMiddle = buildHiddenCombos({
  year: { stem: "甲", branch: "申" }, month: { stem: "丙", branch: "子" },
  day: { stem: "己", branch: "辰" }, hour: { stem: "庚", branch: "午" },
}, KEYS4, null);
ok("P2: 申子辰 ครบชุด → ไม่นับ拱 (มีตัว旺กลางแล้ว)", hcWithMiddle.filter((x) => x.kind === "gong" && x.missingBranch === "子").length === 0);

/* 3p (ไม่ทราบเวลาเกิด): เสายามไม่เข้าคำนวณ — เอี๊ยว 3 เสา 子子亥 → 午亥暗合 ต้องหาย */
const hc3p = buildHiddenCombos(pillarsAeaw, ["year", "month", "day"], null);
ok("P2: 3p ตัดเสายาม → เอี๊ยวไม่เหลือ暗合", hc3p.length === 0, JSON.stringify(hc3p));

/* ═══════════ PART 2b · full pipeline (calcBazi → ext → packet → render) golden เอี๊ยว ═══════════ */
async function computeStartAge(date, time, gender, longitude) {
  const { st } = await getSolarTimeAtTST({ date, time, longitude, gmtOffsetHours: 7, gender, dayBoundary: "00:00", birthTimeKnown: true });
  const g = gender === "F" ? tyme.Gender.WOMAN : tyme.Gender.MAN;
  const cl = tyme.ChildLimit.fromSolarTime(st, g);
  return Math.round((cl.getYearCount() + cl.getMonthCount() / 12 + cl.getDayCount() / 365.25) * 100) / 100;
}
const bA = { date: "1984-12-31", time: "13:15", longitude: 100.5018, gender: "M" };
const calc = await calcBazi({ date: bA.date, time: bA.time, longitude: bA.longitude, gmtOffsetHours: 7, gender: bA.gender, dayBoundary: "00:00", birthTimeKnown: true });
ok("P2b: golden pillars เอี๊ยว 甲子 丙子 己亥 庚午",
  `${calc.pillarsZh.year} ${calc.pillarsZh.month} ${calc.pillarsZh.day} ${calc.pillarsZh.hour}` === "甲子 丙子 己亥 庚午",
  `${calc.pillarsZh.year} ${calc.pillarsZh.month} ${calc.pillarsZh.day} ${calc.pillarsZh.hour}`);
const today = new Date("2026-07-03T12:00:00+07:00");
const birthDate = new Date(`${bA.date}T${bA.time}:00+07:00`);
const startAge = await computeStartAge(bA.date, bA.time, bA.gender, bA.longitude);
const ext = buildChartExtensions(calc.pillars, today, bA.gender, birthDate, startAge, calc.geJu.structure, calc.strength.percent, calc.yongshen[0]?.element, calc.yongshen.map((x) => x.element));
const [y, mo, d] = bA.date.split("-").map(Number);
const [h, mi] = bA.time.split(":").map(Number);
const ageNow = today.getUTCFullYear() - birthDate.getUTCFullYear();
const packet = buildStructuredChartPacket(calc, ext, calc.dayMaster, ageNow, {}, null, bA.gender, computeSiLingDays(y, mo, d, h, mi), { dayBoundary: "00:00", dayBoundarySource: "explicit" });

ok("P2b: packet.hiddenCombos = 1 จุด (午亥暗合)", packet.hiddenCombos?.length === 1 && packet.hiddenCombos[0].typeZh === "暗合",
  JSON.stringify(packet.hiddenCombos));
const prompt = renderChartPrompt(packet);
ok("P2b: render มี 【拱/暗合 มุมแฝง】 + guard ห้ามเดา", prompt.includes("【拱/暗合 มุมแฝง】") && prompt.includes("ห้าม AI เดาคู่拱/暗合เพิ่ม"));
ok("P2b: render ระบุ 暗合 เสาวัน↔เสายาม", /เสาวัน:亥 ↔ เสายาม:午 暗合|เสายาม:午 ↔ เสาวัน:亥 暗合/.test(prompt));

/* ขนาด: sifu packet render โต ≤1.5K */
const packetBase = { ...packet, hiddenCombos: undefined };
const promptBase = renderChartPrompt(packetBase);
const growthS = prompt.length - promptBase.length;
console.log(`   ขนาด render sifu packet: ${promptBase.length} → ${prompt.length} (+${growthS} chars)`);
ok("P2b: sifu render โต ≤1.5K chars", growthS > 0 && growthS <= 1500, `+${growthS}`);

/* 伏吟/反吟 filter r103 ไม่ถูกแตะ: เอี๊ยวต้องยังมี 反吟 natal เต็มเสา (年甲子↔時庚午) เท่าเดิม */
ok("P2b: 反吟เต็มเสา natal ของเอี๊ยวยังอยู่ (filter r103 ไม่ถูกแตะ)",
  packet.interactions.raw.some((it) => it.type === "反吟"),
  JSON.stringify(packet.interactions.raw.map((it) => it.type)));

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
