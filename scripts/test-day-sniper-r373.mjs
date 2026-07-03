// r373 · ทดสอบ Day Sniper engine (GOLDEN BLIND — วันคาดหวังคำนวณอิสระจาก tyme ในเทสต์เอง ไม่ hardcode จากคำอ่านซินแส)
// run: npx tsx scripts/test-day-sniper-r373.mjs   (ต้องผ่าน 3 รอบก่อนส่งงาน)
import {
  buildDaySniper, scanDays, resolveTargets, resolveSniperTopic, resolveDaySniperRange,
  dayGanzhiOf, relationsVsPillar, findMoonAspectHits, renderDaySniperTh,
  DAY_SNIPER_BLOCK_MAX_CHARS, DAY_SNIPER_MAX_FLAGGED,
} from "../src/lib/fusion5/day-sniper.ts";
import { buildJudgePrompt, FUSION_PANEL_PROMPT_MAX_CHARS, resolveFusionTimingReference } from "../src/lib/fusion5/build-prompt.ts";
import { westernChart } from "../src/lib/astro/western/engine.ts";
import { eclipticLon } from "../src/lib/astro-core/ephemeris.ts";
import { wrap180 } from "../src/lib/astro-core/events.ts";
import { SolarTime } from "tyme4ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name} ${detail}`); } };

// golden เอี๊ยว (AGENTS.md golden reference · pillars ตาม Voytek: 甲子/丙子/己亥/庚午) — shape เดียวกับ DB profiles.bazi_pillars
const AEAW = {
  name: "เอี๊ยว", dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "M",
  baziPillars: { pillars: { year: { stem: "甲", branch: "子" }, month: { stem: "丙", branch: "子" }, day: { stem: "己", branch: "亥" }, hour: { stem: "庚", branch: "午" } } },
};

// helper อิสระ: day ganzhi ตรงจาก tyme (ไม่ผ่าน engine ที่ทดสอบ)
const tymeGanzhi = (dateISO) => {
  const [y, m, d] = dateISO.split("-").map(Number);
  return SolarTime.fromYmdHms(y, m, d, 12, 0, 0).getLunarHour().getEightChar().getDay().getName();
};
const eachDay = (fromISO, toISO) => {
  const out = [];
  for (let t = Date.parse(fromISO); t <= Date.parse(toISO); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

// ===== 0) topic resolver + A-relations หน่วยย่อย =====
ok("topic: สุขภาพ", resolveSniperTopic("ช่วงนี้สุขภาพผมต้องระวังอะไรไหม") === "health");
ok("topic: generic", resolveSniperTopic("ดวงโดยรวมเป็นยังไง") === "generic");
{
  const dayT = { pillarKey: "day", stem: "己", branch: "亥", labelTh: "เสาวัน" };
  const chong = relationsVsPillar("辛", "巳", dayT);
  ok("A: 巳 วัน 沖 เสาวัน亥 (canon 六沖)", chong.some((r) => r.rule === "沖" && r.strength === "strong_warning"), JSON.stringify(chong));
  const fuyin = relationsVsPillar("己", "亥", dayT);
  ok("A: 己亥 วัน = 伏吟 เสาวัน己亥 (三命通會)", fuyin.some((r) => r.rule === "伏吟" && r.strength === "strong_warning"), JSON.stringify(fuyin));
  ok("A: 亥×亥 มี 自刑 ด้วย (辰午酉亥)", fuyin.some((r) => r.rule === "刑"), JSON.stringify(fuyin));
  const he = relationsVsPillar("甲", "寅", dayT);
  ok("A: 寅 วัน 六合 เสาวัน亥 (並對為合)", he.some((r) => r.rule === "六合" && r.strength === "positive"));
  const sanhe = relationsVsPillar("乙", "卯", dayT);
  ok("A: 卯 วัน 三合半 กับ 亥 (亥卯未)", sanhe.some((r) => r.rule === "三合半" && r.strength === "positive"));
}

// ===== 1) GOLDEN BLIND · พ.ค. 2026 topic สุขภาพ (เป้า = เสาวัน己亥) =====
console.log("\n--- golden blind: 2026-05-01..05-31 · สุขภาพ ---");
const t1 = Date.now();
const may = scanDays(AEAW, "เดือนพฤษภาคม 2026 สุขภาพผมต้องระวังวันไหน", "2026-05-01", "2026-05-31");
const msMay = Date.now() - t1;
ok("scan พ.ค. ครบ 31 วัน", may.scannedDays === 31, String(may.scannedDays));
ok("topic = health · เป้าปาจื้อ = เสาวัน己亥", may.targets.topicKey === "health" && may.targets.bazi.length === 1 && may.targets.bazi[0].stem === "己" && may.targets.bazi[0].branch === "亥");

// วัน 巳 ใน พ.ค. 2026 คำนวณอิสระจาก tyme ในเทสต์ (BLIND — ไม่ hardcode)
const siDays = eachDay("2026-05-01", "2026-05-31").filter((d) => tymeGanzhi(d)[1] === "巳");
ok(`พบวัน 巳 ใน พ.ค. อิสระจาก tyme (${siDays.join(",")})`, siDays.length >= 2);
// ทุกวัน 巳 ที่ engine ติดธง ต้องอ้าง 沖 · และวัน 巳 ทุกวันควรติดธงอย่างน้อยเหลือง (沖 = สัญญาณแรงเดี่ยว)
const flaggedMap = new Map(may.days.map((d) => [d.dateISO, d]));
for (const d of siDays) {
  const f = flaggedMap.get(d);
  ok(`วัน巳 ${d} ติดธง + อ้าง 沖`, !!f && f.a.some((r) => r.rule === "沖"), f ? JSON.stringify(f.a.map((r) => r.rule)) : "ไม่ติดธง");
}
// ⭐ ข้อยืนยันหลัก: ≥2 วันแดงในหน้าต่าง 5-17 พ.ค. และมีวันแดงที่อ้าง 沖 (เข็มอิสระ ≥2)
const redWin = may.days.filter((d) => d.flag === "red" && d.dateISO >= "2026-05-05" && d.dateISO <= "2026-05-17");
ok(`≥2 วันแดงใน 5-17 พ.ค. (ได้ ${redWin.map((d) => d.dateISO).join(",")})`, redWin.length >= 2);
const redChong = redWin.filter((d) => d.a.some((r) => r.rule === "沖"));
ok("มีวันแดงในหน้าต่างที่อ้าง 沖 + เข็มอิสระ ≥2", redChong.length >= 1 && redChong.every((d) => d.needles.length >= 2), JSON.stringify(redWin.map((d) => ({ d: d.dateISO, n: d.needles }))));
// วันแดงที่อ้าง沖 ต้องเป็นวัน巳จริงตาม tyme (พิสูจน์ว่า A มาจากปฏิทิน 60 จริง)
ok("วันแดงอ้าง沖 = วัน巳 จริงตาม tyme", redChong.every((d) => siDays.includes(d.dateISO)), JSON.stringify(redChong.map((d) => d.dateISO)));
console.log("   วันธงทั้งหมด:", may.days.map((d) => `${d.dateISO}${d.flag === "red" ? "🔴" : d.flag === "green" ? "🟢" : "🟡"}[${d.needles.join("+")}]`).join(" "));

// ===== 2) GOLDEN BLIND · พ.ย.-ธ.ค. 2026: 伏吟 + Uranus□Mars =====
console.log("\n--- golden blind: 2026-11-01..12-07 · 伏吟 + C ---");
const nov = scanDays(AEAW, "ปลายปี 2026 สุขภาพต้องระวังช่วงไหน", "2026-11-01", "2026-12-07");
// หา 己亥 อิสระจาก tyme (เกิดทุก 60 วัน — ต้องมี 1 วันในช่วง 37 วัน? ไม่จำเป็น · แต่ช่วงนี้มีจริง)
const jihaiDays = eachDay("2026-11-01", "2026-12-07").filter((d) => tymeGanzhi(d) === "己亥");
ok(`พบวัน 己亥 ในช่วง (${jihaiDays.join(",")})`, jihaiDays.length >= 1);
for (const d of jihaiDays) {
  const f = nov.days.find((x) => x.dateISO === d);
  ok(`วัน己亥 ${d} ติดธง + อ้าง 伏吟`, !!f && f.a.some((r) => r.rule === "伏吟"), f ? JSON.stringify(f.a.map((r) => r.rule)) : "ไม่ติดธง");
}
// 4 พ.ย. 2026 Uranus square natal Mars ต้องโผล่เป็นเข็ม C (Mars อยู่ในเป้า health)
const nov4 = nov.days.find((d) => d.dateISO === "2026-11-04");
ok("2026-11-04 มีเข็ม C ยูเรนัส□อังคาร", !!nov4 && nov4.c.some((h) => h.transit === "Uranus" && h.natal === "Mars" && h.aspect === "square"), nov4 ? JSON.stringify(nov4.c) : "วันไม่ติดธง");

// ===== 3) Moon-hit finder accuracy · bisect อิสระในเทสต์ vs engine ±30 นาที =====
console.log("\n--- moon finder accuracy ---");
{
  const chart = westernChart(AEAW.dtUTC, AEAW.lat, AEAW.lng, true, "M");
  const sunLon = chart.planets.find((p) => p.name === "Sun").lon;
  // อิสระ: scan หยาบ 30 นาที + bisect เอง หา "จันทร์ทับอาทิตย์กำเนิด" ครั้งแรกใน พ.ค. 2026 (UTC)
  const from = Date.parse("2026-05-01T00:00:00Z"), to = Date.parse("2026-05-31T00:00:00Z");
  const f = (ms) => wrap180(eclipticLon("Moon", new Date(ms)) - sunLon);
  let expectMs = null;
  let prev = f(from);
  for (let t = from + 1800_000; t <= to && expectMs === null; t += 1800_000) {
    const cur = f(t);
    if ((prev < 0) !== (cur < 0) && Math.abs(prev - cur) < 90) {
      let a = t - 1800_000, b = t;
      for (let i = 0; i < 40 && b - a > 1000; i++) {
        const m = (a + b) / 2;
        if ((f(a) <= 0) === (f(m) <= 0)) a = m; else b = m;
      }
      expectMs = (a + b) / 2;
    }
    prev = cur;
  }
  const hits = findMoonAspectHits(sunLon, [0], from, to);
  const engineHit = hits.find((h) => Math.abs(h.ms - expectMs) < 6 * 3600_000);
  ok("engine เจอจันทร์☌อาทิตย์กำเนิดใกล้ instant อิสระ", expectMs !== null && !!engineHit);
  const diffMin = engineHit ? Math.abs(engineHit.ms - expectMs) / 60000 : Infinity;
  ok(`ตรงกัน ±30 นาที (ต่าง ${diffMin.toFixed(2)} นาที)`, diffMin <= 30);
  // จันทร์ 1 รอบ ~27.3 วัน → เดือนเดียวมุมทับ 1-2 ครั้ง
  ok("จำนวน hit ทับในเดือน สมเหตุผล (1-2)", hits.length >= 1 && hits.length <= 2, String(hits.length));
}

// ===== 4) determinism ×2 =====
const dsA = buildDaySniper([AEAW], "เดือนพฤษภาคม 2026 สุขภาพ", "2026-05-01", "2026-05-31");
const dsB = buildDaySniper([AEAW], "เดือนพฤษภาคม 2026 สุขภาพ", "2026-05-01", "2026-05-31");
const strip = (x) => JSON.stringify(x, (k, v) => (k === "computeMs" ? 0 : v));
ok("deterministic ×2 (byte-identical ยกเว้น computeMs)", strip(dsA) === strip(dsB));

// ===== 5) perf · 92 วัน 1 คน ≤4s =====
const t5 = Date.now();
const full = scanDays(AEAW, "ดวงโดยรวมครึ่งปีหลัง", "2026-06-01", "2026-08-31");
const ms92 = Date.now() - t5;
ok(`perf 92 วัน 1 คน ≤4s (จริง ${ms92}ms · scan ${full.scannedDays} วัน)`, ms92 <= 4000 && full.scannedDays === 92);
console.log(`   [perf] scan 31 วัน ${msMay}ms · 92 วัน ${ms92}ms · buildDaySniper ${dsA.computeMs}ms`);
ok("cap ≤20 วันต่อคน", full.days.length <= DAY_SNIPER_MAX_FLAGGED && may.days.length <= DAY_SNIPER_MAX_FLAGGED);

// ===== 6) no-time birth · จันทร์/เสายังทำงาน · ตัดลัคนา =====
{
  const noTime = { ...AEAW, name: "เอี๊ยวไม่รู้เวลา", hasTime: false, baziPillars: { pillars: { year: { stem: "甲", branch: "子" }, month: { stem: "丙", branch: "子" }, day: { stem: "己", branch: "亥" }, hour: null } } };
  const p = scanDays(noTime, "เดือนพฤษภาคม 2026 สุขภาพ", "2026-05-01", "2026-05-31");
  ok("no-time: ไม่ถูกข้าม + เสาวันยังเป็นเป้า", !p.skippedNote && p.targets.bazi.some((t) => t.pillarKey === "day"));
  ok("no-time: ตัดลัคนา/เจ้าเรือนออก + มีโน้ตบอก", !p.targets.western.some((t) => t.name === "Ascendant") && p.targets.notes.some((n) => n.includes("ลัคนา")));
  ok("no-time: จันทร์ยังยิงได้ (มี B ในวันธงอย่างน้อย 1 วัน)", p.days.some((d) => d.b.length > 0));
  // generic + ไม่มีเสายาม: ไม่พังเมื่อ hour null
  const g = scanDays(noTime, "ดวงรวมๆ", "2026-05-01", "2026-05-14");
  ok("no-time generic: เป้าเสา 3 เสา (ไม่มีเสายาม) ไม่พัง", !g.skippedNote && g.targets.bazi.length === 3);
}

// ===== 7) render + caps + judge prompt wiring =====
{
  const block = renderDaySniperTh(dsA);
  ok("render มี header ตาม spec", block.startsWith("=== DAY_SNIPER (คำนวณจริง ห้ามเลื่อนวันเอง) ==="));
  ok(`render ≤${DAY_SNIPER_BLOCK_MAX_CHARS} ตัวอักษร (จริง ${block.length})`, block.length <= DAY_SNIPER_BLOCK_MAX_CHARS);
  ok("render มีโน้ตคู่เข็มอิสระ + ห้ามแต่งวัน", block.includes("นาฬิกาอิสระจริง") && block.includes("ห้ามแต่งวันเพิ่ม"));
  // สองคน (คนที่ 2 = ไหมมี่ golden AGENTS.md) — ต้อง render ทั้งคู่
  const MAI = { name: "ไหมมี่", dtUTC: new Date("1986-04-12T09:42:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F", baziPillars: { pillars: { year: { stem: "丙", branch: "寅" }, month: { stem: "壬", branch: "辰" }, day: { stem: "丙", branch: "戌" }, hour: { stem: "丙", branch: "申" } } } };
  const ds2 = buildDaySniper([AEAW, MAI], "ปี 2026 คู่เราต้องระวังช่วงไหน", "2026-05-01", "2026-07-31");
  ok("2 คน: perPerson 2 + คนแรกไม่ถูกข้าม", ds2.perPerson.length === 2 && !ds2.perPerson[0].skippedNote);
  const block2 = renderDaySniperTh(ds2);
  ok(`render 2 คน ≤cap (จริง ${block2.length})`, block2.length <= DAY_SNIPER_BLOCK_MAX_CHARS && block2.includes("เอี๊ยว") );
  // judge prompt: ใส่ day sniper block + คำสั่งบังคับ + อยู่ใต้ cap รวม
  const panels = [{ science: "bazi", reply: "คำตอบ bazi ทดสอบ" }, { science: "western", reply: "คำตอบ western ทดสอบ" }];
  const births = [{ name: "เอี๊ยว", dtUTC: AEAW.dtUTC, lat: AEAW.lat, lng: AEAW.lng, hasTime: true, gender: "M", timezone: "Asia/Bangkok" }];
  const jp = buildJudgePrompt(panels, births, "สุขภาพเดือนพฤษภาคม 2026", "th", undefined, block);
  ok("judge prompt มี DAY_SNIPER + คำสั่ง 'ห้ามแต่งวันเพิ่ม'", jp.includes("=== DAY_SNIPER") && jp.includes("ถ้ามี DAY_SNIPER ให้ระบุวันที่เป๊ะในคำตอบ พร้อมบอกว่าหลักฐานกี่เข็มอิสระ · ห้ามแต่งวันเพิ่ม"));
  ok(`judge prompt ≤ FUSION_PANEL_PROMPT_MAX_CHARS (${jp.length}/${FUSION_PANEL_PROMPT_MAX_CHARS})`, jp.length <= FUSION_PANEL_PROMPT_MAX_CHARS);
}

// ===== 8) resolveDaySniperRange =====
{
  const tr = resolveFusionTimingReference("เดือนพฤษภาคม 2026 สุขภาพ", new Date("2026-07-03T05:00:00Z"));
  const r = resolveDaySniperRange("เดือนพฤษภาคม 2026 สุขภาพ", tr);
  ok("range: เดือนที่ระบุ → เริ่ม 1 พ.ค. ปีเป้าหมาย", r.fromISO === "2026-05-01", JSON.stringify(r));
  const tr2 = resolveFusionTimingReference("ดวงรวมปีหน้า", new Date("2026-07-03T05:00:00Z"));
  const r2 = resolveDaySniperRange("ดวงรวมปีหน้า", tr2);
  const span2 = (Date.parse(r2.toISO) - Date.parse(r2.fromISO)) / 86400000 + 1;
  ok(`range: default 92 วันคร่อม refDate (${r2.fromISO}→${r2.toISO})`, span2 === 92 && r2.fromISO <= "2027-07-01" && r2.toISO >= "2027-07-01");
  const tr3 = resolveFusionTimingReference("15/05/2026 เซ็นสัญญาดีไหม", new Date("2026-07-03T05:00:00Z"));
  const r3 = resolveDaySniperRange("15/05/2026 เซ็นสัญญาดีไหม", tr3);
  ok("range: วันที่ระบุ → คร่อมวันนั้น (−14 วัน)", r3.fromISO === "2026-05-01", JSON.stringify(r3));
  // clamp >92 วัน
  const big = scanDays(AEAW, "ดวงรวม", "2026-01-01", "2026-12-31");
  ok("scanDays clamp ≤92 วัน", big.scannedDays === 92, String(big.scannedDays));
}

// ===== 9) missing pillars → เข็ม A ปิดอย่างซื่อตรง =====
{
  const noPillars = { ...AEAW, name: "ไม่มีเสา", baziPillars: null };
  const p = scanDays(noPillars, "สุขภาพ", "2026-05-01", "2026-05-31");
  ok("ไม่มี bazi_pillars: เข็ม A ปิด + โน้ตแจ้ง (ไม่คำนวณเสาเอง)", p.targets.bazi.length === 0 && p.targets.notes.some((n) => n.includes("bazi_pillars")));
  ok("ไม่มี A: วันแดงต้องมาจาก B+C เท่านั้น", p.days.filter((d) => d.flag === "red").every((d) => !d.needles.includes("A")));
}

console.log(`\n=== DAY SNIPER r373: ${pass} passed · ${fail} failed ===`);
process.exit(fail ? 1 : 0);
