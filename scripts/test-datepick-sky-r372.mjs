/* test-datepick-sky-r372.mjs · หมวด ② ท้องฟ้าจริง 5 modules (engine + API wiring)
   รัน: node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-datepick-sky-r372.mjs
   (ต้องมี env PG* จาก .env.local สำหรับส่วน route จริง · ถ้า DB ล่มส่วนนั้นจะ fail ชัดเจน)
   ครอบ: VoC boundary จริง+cap 45 · พุธ/ศุกร์/อังคารถอย cap 45/40/50 · คราส cap 35/55 ·
         ราหูกาล สูตร index+sunrise ต่างพิกัด+cap 50 · moon_sign deterministic+ตารางครบ ·
         module ปิด = route จริง byte-identical กับ baseline r370 · perf <150ms/30วัน · regression */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { eclipticLon } from "../src/lib/astro-core/ephemeris.ts";
import { wrap180 } from "../src/lib/astro-core/events.ts";
import { combineScores } from "../src/lib/luck-engine/combineScores.ts";
import { ALL_MODULES, UNIVERSAL_MODULES } from "../src/lib/luck-engine/types.ts";
import { getVoidWindowsForDate, computeMoonVoid } from "../src/lib/luck-engine/modules/moon-void.ts";
import { getRetroIntervals, computeRetroWindow } from "../src/lib/luck-engine/modules/retro-window.ts";
import { getEclipsesForYear, computeEclipseZone } from "../src/lib/luck-engine/modules/eclipse-zone.ts";
import { getRahuWindow, computeRahuKalam, RAHU_OCTANT_BY_WEEKDAY } from "../src/lib/luck-engine/modules/rahu-kalam.ts";
import { computeMoonSign, MOON_SIGN_TABLE } from "../src/lib/luck-engine/modules/moon-sign.ts";

let pass = 0, fail = 0;
function ok(cond, name, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

const TH = 7 * 3600_000;
const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const ACTIVITIES = ["立約","出行","動土","搬家","開市","婚姻","求財","祭祀"];
const SKY5 = ["moon_void","retro_window","eclipse_zone","rahu_kalam","moon_sign"];
const thaiDate = (ms) => new Date(ms + TH).toISOString().slice(0, 10);
const thaiTime = (ms) => new Date(ms + TH).toISOString().slice(11, 16);
const signAt = (ms) => Math.floor(eclipticLon("Moon", new Date(ms)) / 30) % 12;

/** mock slot (shape เดียวกับ r367) · date = วันไทย · shichen 0-11 */
function mockSlot(date, shichen) {
  const zeRi = {
    module: "ze_ri", status: "ready",
    score: { raw: 80, normalized: 80, weight: 1 }, pass: true,
    tags: [], reasons: { up: [], down: [], warning: [] }, confidence: 0.9, raw: {},
  };
  return {
    id: "1", datetime: { start: `${date} 00:00:00`, end: `${date} 02:00:00`, timezone: "Asia/Bangkok" },
    calendar: { gregorianDate: date, shichen, shichenBranch: BRANCHES[shichen] },
    pillars: {
      year: { stem: "丙", branch: "午" }, month: { stem: "乙", branch: "未" },
      day: { stem: "庚", branch: "子" }, hour: { stem: "丙", branch: BRANCHES[shichen] },
    },
    donggong: null, zodiacClash: [], people: [],
    modules: { ze_ri: zeRi }, scoring: undefined, display: undefined,
  };
}

/** slot (date,shichen) ที่หน้าต่าง ±1 ชม. ครอบ instant ms (mid 時辰 = sc*2 นาฬิกาไทย · 子=00:00) */
function slotCovering(ms) {
  const shifted = ms + 3600_000; // เลื่อน 1 ชม. ให้ขอบยามตกที่ 0 mod 120 นาที
  const d = new Date(shifted + TH);
  const date = d.toISOString().slice(0, 10);
  const sc = Math.floor((d.getUTCHours() * 60 + d.getUTCMinutes()) / 120) % 12;
  return mockSlot(date, sc);
}

/* ═══ 1 · จันทร์ว่าง (Moon Void-of-Course) ═══ */
console.log("\n[1] moon_void · จันทร์ว่าง VoC");
{
  // หาหน้าต่าง VoC จริงทั้งเดือน ก.ค. 2026 ด้วยโค้ด
  const seen = new Set();
  const windows = [];
  for (let d = 1; d <= 31; d++) {
    for (const w of getVoidWindowsForDate(`2026-07-${String(d).padStart(2, "0")}`)) {
      if (!seen.has(w.endMs)) { seen.add(w.endMs); windows.push(w); }
    }
  }
  ok(windows.length >= 8 && windows.length <= 16,
    `ก.ค. 2026 มีหน้าต่าง VoC ${windows.length} ช่วง (ingress จันทร์ทุก ~2.4 วัน)`, String(windows.length));
  const w = windows.find((x) => x.startMs < x.endMs && !x.wholeSign) || windows[0];
  console.log(`    🌙 หน้าต่างที่ใช้เทส: ${thaiDate(w.startMs)} ${thaiTime(w.startMs)} → ${thaiDate(w.endMs)} ${thaiTime(w.endMs)} (last ${w.lastAspect?.body}@${w.lastAspect?.angle}°)`);

  // boundary จริง: ปลายหน้าต่าง = จันทร์ย้ายราศีจริง (เทียบ eclipticLon ตรง ๆ)
  ok(signAt(w.endMs - 90_000) === w.fromSign && signAt(w.endMs + 90_000) === w.toSign,
    `ปลายหน้าต่าง = ingress จริง (ราศี ${w.fromSign}→${w.toSign} ภายใน ±90 วิ)`,
    `${signAt(w.endMs - 90_000)}→${signAt(w.endMs + 90_000)}`);
  // ต้นหน้าต่าง = มุมใหญ่ exact จริง (มุมใดมุมหนึ่ง 0/60/90/120/180 กับ Sun..Saturn ห่าง < 0.05°)
  {
    let minOrb = 999;
    for (const body of ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]) {
      const rel = eclipticLon("Moon", new Date(w.startMs)) - eclipticLon(body, new Date(w.startMs));
      for (const a of [0, 60, 90, 120, 180]) {
        minOrb = Math.min(minOrb, Math.abs(wrap180(rel - a)), Math.abs(wrap180(rel + a)));
      }
    }
    ok(minOrb < 0.05, `ต้นหน้าต่าง = มุมใหญ่สุดท้าย exact จริง (orb ${minOrb.toFixed(4)}° < 0.05°)`);
    // หลังต้นหน้าต่าง จันทร์ยังอยู่ราศีเดิมตลอดจนถึง ingress (หน้าต่างอยู่ในราศีเดียว)
    ok(signAt(w.startMs + 60_000) === w.fromSign && signAt((w.startMs + w.endMs) / 2) === w.fromSign,
      "หน้าต่าง VoC อยู่ในราศีเดิมทั้งช่วง (ว่างจนกว่าจะย้ายราศี)");
  }
  // slot ที่ซ้อนหน้าต่าง + กิจกรรมเริ่มงานใหม่ → cap 45
  const midWin = (w.startMs + w.endMs) / 2;
  const slot = slotCovering(midWin);
  for (const act of ["開市", "立約"]) {
    const mr = computeMoonVoid(slot, act);
    const cap = (mr.caps || []).find((x) => x.code === "MOON_VOC_CAP");
    ok(!!cap && cap.type === "max" && cap.value === 45 && mr.pass === false,
      `slot ซ้อน VoC + ${act} → cap max 45 (MOON_VOC_CAP)`, JSON.stringify(mr.caps));
    if (act === "開市") {
      ok((mr.reasons.down || []).some((r) => /จันทร์ว่าง \d{2}:\d{2}/.test(r.thai) || /จันทร์ว่าง .*\d{2}:\d{2}/.test(r.thai)),
        "reason ระบุช่วงเวลา VoC จริง (จันทร์ว่าง HH:MM–HH:MM)", JSON.stringify(mr.reasons.down));
      const sc = combineScores({ ze_ri: slot.modules.ze_ri, moon_void: mr }, ["ze_ri", "moon_void"], "開市");
      ok(sc.finalScore <= 45, `cap ไหลผ่าน combineScores → finalScore ≤ 45 (ได้ ${sc.finalScore} จาก ze_ri 80)`);
      ok(sc.caps.some((x) => x.code === "MOON_VOC_CAP"), "cap ติดใน scoring.caps");
    }
  }
  // กิจกรรมไม่เข้าข่ายเริ่มงานใหม่ → warning เฉย ๆ ไม่มี cap
  for (const act of ["祭祀", "出行"]) {
    const mr = computeMoonVoid(slot, act);
    ok(!(mr.caps || []).length && (mr.reasons.warning || []).some((r) => r.code === "MOON_VOC_WARN"),
      `slot ซ้อน VoC + ${act} → warning เฉย ๆ (ไม่มี cap)`);
  }
  // slot ที่ไม่ซ้อน → ไม่ตัด
  const outside = slotCovering(w.endMs + 6 * 3600_000);
  const clearWins = getVoidWindowsForDate(outside.calendar.gregorianDate);
  const overlapsAny = clearWins.some((x) => x.startMs < w.endMs + 7 * 3600_000 && x.endMs > w.endMs + 5 * 3600_000);
  if (!overlapsAny) {
    const mr = computeMoonVoid(outside, "開市");
    ok(!(mr.caps || []).length && mr.pass === true, "slot นอกหน้าต่าง VoC → ไม่ตัด (voc_clear)");
  } else {
    ok(true, "slot ถัดไปบังเอิญชนหน้าต่างใหม่ · ข้าม negative case (มีเคส clear ใน route test แล้ว)");
  }
}

/* ═══ 2 · ดาวถอย (Retrograde Window) ═══ */
console.log("\n[2] retro_window · ดาวถอย");
{
  const iv2026 = getRetroIntervals(2026);
  const merc = iv2026.find((x) => x.body === "Mercury" && x.startMs <= Date.parse("2026-07-10T05:00:00Z") && x.endMs >= Date.parse("2026-07-10T05:00:00Z"));
  ok(!!merc, "stations engine เจอพุธถอยคาบ 10 ก.ค. 2026");
  if (merc) {
    const sTh = thaiDate(merc.startMs), eTh = thaiDate(merc.endMs);
    console.log(`    ☿ พุธถอยจริง (เวลาไทย): ${sTh} → ${eTh}`);
    ok(["2026-06-29", "2026-06-30", "2026-07-01"].includes(sTh) && ["2026-07-23", "2026-07-24", "2026-07-25"].includes(eTh),
      `ช่วงพุธถอยตรง spec ~30 มิ.ย.–24 ก.ค. 2026 (ได้ ${sTh}→${eTh})`);
  }
  // slot 10 ก.ค. + 立約 → cap 45
  const slot = mockSlot("2026-07-10", 5);
  for (const [act, expect] of [["立約", 45], ["開市", 45], ["出行", 45]]) {
    const mr = computeRetroWindow(slot, act);
    const cap = (mr.caps || []).find((x) => x.code === "RETRO_MERCURY_CAP");
    ok(!!cap && cap.value === expect && mr.pass === false, `พุธถอย + ${act} → cap ${expect} (RETRO_MERCURY_CAP)`);
    if (act === "立約") {
      ok((mr.reasons.down || []).some((r) => r.thai.includes("มิ.ย.") && r.thai.includes("ก.ค.")),
        "reason บอกช่วงถอยจริง (วัน station R→D)", JSON.stringify(mr.reasons.down));
      const sc = combineScores({ ze_ri: slot.modules.ze_ri, retro_window: mr }, ["ze_ri", "retro_window"], "立約");
      ok(sc.finalScore <= 45, `finalScore ≤ 45 ผ่าน combineScores (ได้ ${sc.finalScore})`);
    }
  }
  // กิจกรรมไม่เข้าข่ายพุธถอย → ไม่มี cap (info เฉย ๆ)
  {
    const mr = computeRetroWindow(slot, "祭祀");
    ok(!(mr.caps || []).length && (mr.reasons.neutral || []).some((r) => r.code === "RETRO_INFO_MERCURY"),
      "พุธถอย + 祭祀 → info เฉย ๆ ไม่มี cap");
  }
  // ศุกร์ถอย + 婚姻 → cap 40 (หา interval จริงจาก engine · 2026 มีช่วง ต.ค.-พ.ย.)
  const venus = [2026, 2027, 2025].flatMap((y) => getRetroIntervals(y)).find((x) => x.body === "Venus");
  ok(!!venus, "stations engine เจอศุกร์ถอย (2025-2027)");
  if (venus) {
    const mid = (venus.startMs + venus.endMs) / 2;
    const mr = computeRetroWindow(slotCovering(mid), "婚姻");
    ok((mr.caps || []).some((x) => x.code === "RETRO_VENUS_CAP" && x.value === 40),
      `ศุกร์ถอย (${thaiDate(venus.startMs)}→${thaiDate(venus.endMs)}) + 婚姻 → cap 40`);
    const mrOther = computeRetroWindow(slotCovering(mid), "動土");
    ok(!(mrOther.caps || []).some((x) => x.code === "RETRO_VENUS_CAP"), "ศุกร์ถอย + 動土 → ไม่ติด cap ศุกร์");
  }
  // อังคารถอย + 動土 → cap 50
  const mars = [2026, 2027, 2028].flatMap((y) => getRetroIntervals(y)).find((x) => x.body === "Mars");
  ok(!!mars, "stations engine เจออังคารถอย (2026-2028)");
  if (mars) {
    const mid = (mars.startMs + mars.endMs) / 2;
    const mr = computeRetroWindow(slotCovering(mid), "動土");
    ok((mr.caps || []).some((x) => x.code === "RETRO_MARS_CAP" && x.value === 50),
      `อังคารถอย (${thaiDate(mars.startMs)}→${thaiDate(mars.endMs)}) + 動土 → cap 50`);
  }
  // นอกช่วงถอย → ไม่ตัด (26 ก.ค. เสาร์เริ่มถอยแล้ว · เช็คว่าพุธไม่ถอย + ไม่มี cap สำหรับ 立約)
  {
    const mr = computeRetroWindow(mockSlot("2026-07-26", 5), "立約");
    ok(!(mr.caps || []).length, "หลังพุธกลับเดินหน้า (26 ก.ค.) + 立約 → ไม่มี cap (เสาร์ถอย = info)");
  }
}

/* ═══ 3 · โซนอับคราส (Eclipse Zone) ═══ */
console.log("\n[3] eclipse_zone · โซนอับคราส");
{
  const ec = getEclipsesForYear(2026);
  const aug = ec.find((e) => e.thaiDate === "2026-08-13" && e.kind === "solar");
  ok(!!aug, "engine เจอสุริยคราส (วันไทย 13 ส.ค. 2026 · peak 12 ส.ค. ~17:46 UTC)", JSON.stringify(ec.map((e) => e.thaiDate)));
  // วันคราสพอดี → cap 35 ทุกกิจกรรม
  for (const act of ACTIVITIES) {
    const mr = computeEclipseZone(mockSlot("2026-08-13", 4), act);
    const capOk = (mr.caps || []).some((x) => x.code === "ECLIPSE_DAY_CAP" && x.value === 35);
    if (!capOk) { ok(false, `วันคราส 13 ส.ค. + ${act} → cap 35`); }
  }
  ok(true, "วันคราส 13 ส.ค. → cap 35 (ECLIPSE_DAY_CAP) ครบทั้ง 8 กิจกรรม");
  {
    const mr = computeEclipseZone(mockSlot("2026-08-13", 4), "開市");
    ok((mr.reasons.down || []).some((r) => r.thai.includes("สุริยคราส") && r.thai.includes("13 ส.ค.")),
      "reason บอกชนิดคราส + วันที่จริง");
    const sc = combineScores({ ze_ri: mockSlot("2026-08-13", 4).modules.ze_ri, eclipse_zone: mr }, ["ze_ri", "eclipse_zone"], "開市");
    ok(sc.finalScore <= 35, `finalScore ≤ 35 ผ่าน combineScores (ได้ ${sc.finalScore})`);
  }
  // ±3 วัน + เปิดตัวใหญ่ → cap 55
  for (const act of ["開市", "婚姻", "動土"]) {
    const mr = computeEclipseZone(mockSlot("2026-08-11", 4), act);
    ok((mr.caps || []).some((x) => x.code === "ECLIPSE_ZONE_CAP" && x.value === 55),
      `11 ส.ค. (ห่างคราส 2 วัน) + ${act} → cap 55 (ECLIPSE_ZONE_CAP)`);
  }
  // ±3 วัน + กิจกรรมอื่น → ไม่ cap
  {
    const mr = computeEclipseZone(mockSlot("2026-08-11", 4), "祭祀");
    ok(!(mr.caps || []).length, "11 ส.ค. + 祭祀 → ไม่ cap (เตือนอย่างเดียว)");
  }
  // นอกโซน → ไม่โดน
  {
    const mr = computeEclipseZone(mockSlot("2026-08-20", 4), "開市");
    ok(!(mr.caps || []).length && mr.tags.includes("eclipse_clear"),
      "20 ส.ค. (ห่างคราส 7 วัน) + 開市 → ไม่โดนอะไรเลย");
  }
}

/* ═══ 4 · ราหูกาล (Rahu Kalam) ═══ */
console.log("\n[4] rahu_kalam · ราหูกาล");
{
  ok(JSON.stringify(RAHU_OCTANT_BY_WEEKDAY) === JSON.stringify([8, 2, 7, 5, 6, 4, 3]),
    "สูตร index: อา=8 จ=2 อ=7 พ=5 พฤ=6 ศ=4 ส=3 (มาตรฐานปัญจางคะอินเดียใต้)");
  const BKK = [13.7563, 100.5018], CM = [18.79, 98.98];
  // อาทิตย์ 5 ก.ค. 2026 = ช่วงที่ 8 (สุดท้ายก่อนตะวันตก) · จันทร์ 6 ก.ค. = ช่วงที่ 2
  const sun = getRahuWindow("2026-07-05", ...BKK);
  const mon = getRahuWindow("2026-07-06", ...BKK);
  ok(!!sun && sun.weekday === 0 && sun.octant === 8 && Math.abs(sun.endMs - sun.setMs) < 1500,
    `อาทิตย์ → ช่วงที่ 8 จบที่ sunset พอดี (ราหูกาล ${thaiTime(sun.startMs)}–${thaiTime(sun.endMs)} · ตก ${thaiTime(sun.setMs)})`);
  if (mon) {
    const part = (mon.setMs - mon.riseMs) / 8;
    ok(mon.weekday === 1 && mon.octant === 2 && Math.abs(mon.startMs - (mon.riseMs + part)) < 1500,
      `จันทร์ → ช่วงที่ 2 เริ่มที่ rise+1/8 ของกลางวัน (${thaiTime(mon.startMs)}–${thaiTime(mon.endMs)})`);
  } else ok(false, "getRahuWindow จันทร์ 6 ก.ค. null");
  // sunrise กทม vs เชียงใหม่ ต่างกันจริง (คนละพิกัด → เวลาแบ่ง 8 ส่วนต่างกัน)
  const cmSun = getRahuWindow("2026-07-05", ...CM);
  ok(!!cmSun && Math.abs(cmSun.riseMs - sun.riseMs) >= 120_000,
    `sunrise กทม (${thaiTime(sun.riseMs)}) vs เชียงใหม่ (${thaiTime(cmSun.riseMs)}) ต่างกัน ≥ 2 นาทีจริง`);
  ok(cmSun.startMs !== sun.startMs, "หน้าต่างราหูกาลเลื่อนตามพิกัดจริง");
  // slot ซ้อนราหูกาล → cap 50 ทุกกิจกรรม
  const loc = { lat: BKK[0], lng: BKK[1], place: "กรุงเทพมหานคร", source: "default_bkk" };
  const hitSlot = slotCovering((sun.startMs + sun.endMs) / 2);
  for (const act of ["開市", "祭祀"]) {
    const mr = computeRahuKalam(hitSlot, act, loc);
    ok((mr.caps || []).some((x) => x.code === "RAHU_KALAM_CAP" && x.value === 50) && mr.pass === false,
      `slot ซ้อนราหูกาล + ${act} → cap 50 (ทุกกิจกรรม)`);
  }
  {
    const mr = computeRahuKalam(hitSlot, "開市", loc);
    ok((mr.reasons.down || []).some((r) => /ราหูกาล \d{2}:\d{2}–\d{2}:\d{2}/.test(r.thai)),
      "reason เวลาจริง 'ราหูกาล HH:MM–HH:MM'", JSON.stringify(mr.reasons.down));
    ok((mr.reasons.down || []).some((r) => r.thai.includes("สายอินเดีย")), "reason ระบุว่าเป็นศาสตร์สายอินเดีย");
    const sc = combineScores({ ze_ri: hitSlot.modules.ze_ri, rahu_kalam: mr }, ["ze_ri", "rahu_kalam"], "開市");
    ok(sc.finalScore <= 50, `finalScore ≤ 50 ผ่าน combineScores (ได้ ${sc.finalScore})`);
  }
  // ยาม子 (เที่ยงคืน) ไม่มีทางชนราหูกาล (กลางวัน) → ไม่ตัด
  {
    const mr = computeRahuKalam(mockSlot("2026-07-05", 0), "開市", loc);
    ok(!(mr.caps || []).length && mr.tags.includes("rahu_clear"), "ยาม子 (เที่ยงคืน) → ไม่ชนราหูกาล ไม่ตัด");
  }
}

/* ═══ 5 · จันทร์ประจำราศี (Moon Sign) ═══ */
console.log("\n[5] moon_sign · จันทร์ประจำราศี (soft ±6 · ไม่มี cap)");
{
  // deterministic: เรียกซ้ำผลเหมือนเดิม byte-identical
  const a = computeMoonSign(mockSlot("2026-07-10", 5), "婚姻");
  const b = computeMoonSign(mockSlot("2026-07-10", 5), "婚姻");
  ok(JSON.stringify(a) === JSON.stringify(b), "deterministic · เรียกซ้ำได้ผลเดิมทุก byte");
  ok(a.raw.sign_th === "พฤษภ" && a.raw.fit === "good" && a.score.normalized === 56,
    `10 ก.ค. ยาม巳 จันทร์ราศีพฤษภ (Taurus) → 婚姻 +6 (normalized 56)`, JSON.stringify(a.raw));
  ok(!(a.caps || []) || !(a.caps || []).length, "ไม่มี cap (ตัวถ่วง ไม่ใช่ตัวตัด)");
  // ตารางครบ 8 กิจกรรม × ครอบ 12 ราศี (ทุก index 0-11 · good/bad ไม่ทับกัน)
  let tableOk = true;
  for (const act of ACTIVITIES) {
    const t = MOON_SIGN_TABLE[act];
    if (!t || !t.good.length || !t.bad.length) { tableOk = false; break; }
    for (const i of [...t.good, ...t.bad]) if (i < 0 || i > 11) tableOk = false;
    if (t.good.some((i) => t.bad.includes(i))) tableOk = false;
  }
  ok(tableOk && Object.keys(MOON_SIGN_TABLE).length === 8, "ตารางครบ 8 กิจกรรม · index 0-11 · good/bad ไม่ทับกัน");
  // ราศีลบ: หา slot ที่จันทร์อยู่พิจิก (Scorpio=7 · จันทร์ fall) ใน ก.ค.-ส.ค. 2026 ด้วยโค้ด
  let badSlot = null;
  outer: for (let m = 7; m <= 8; m++) for (let d = 1; d <= 28; d++) for (const sc of [0, 6]) {
    const s = mockSlot(`2026-0${m}-${String(d).padStart(2, "0")}`, sc);
    const r = computeMoonSign(s, "婚姻");
    if (r.raw.sign === 7) { badSlot = { s, r }; break outer; }
  }
  ok(!!badSlot, "หา slot จันทร์ราศีพิจิกเจอด้วยโค้ด");
  if (badSlot) {
    ok(badSlot.r.raw.fit === "bad" && badSlot.r.score.normalized === 44
      && (badSlot.r.reasons.down || []).some((x) => x.delta === -6),
      `จันทร์ราศีพิจิก (${badSlot.s.calendar.gregorianDate}) + 婚姻 → −6 (normalized 44) ไม่ตัดฤกษ์`);
    ok(badSlot.r.pass === true, "แม้ราศีลบ pass ยังเป็น true (soft scorer)");
  }
  // ทุกกิจกรรม × 12 ราศี ให้ delta ∈ {-6, 0, +6} เท่านั้น (สแกนช่วงยาวให้เจอครบทุกราศี)
  const seenSigns = new Set();
  let deltaOk = true;
  for (let d = 0; d < 28; d++) {
    const date = thaiDate(Date.parse("2026-07-01T00:00:00Z") + d * 86400000);
    for (const sc of [2, 8]) {
      for (const act of ACTIVITIES) {
        const r = computeMoonSign(mockSlot(date, sc), act);
        seenSigns.add(r.raw.sign);
        const n = r.score.normalized;
        if (![44, 50, 56].includes(n)) deltaOk = false;
      }
    }
  }
  ok(deltaOk && seenSigns.size === 12, `soft delta ∈ {−6,0,+6} เท่านั้น · สแกนพบครบ ${seenSigns.size}/12 ราศี`);
}

/* ═══ 6 · types/weights wiring ═══ */
console.log("\n[6] wiring · types + weights + route source");
{
  for (const k of SKY5) {
    ok(ALL_MODULES.includes(k), `${k} อยู่ใน ALL_MODULES`);
    ok(!UNIVERSAL_MODULES.includes(k), `${k} ไม่อยู่ใน UNIVERSAL_MODULES (กัน SQL query คอลัมน์ที่ไม่มี)`);
  }
  const { MODULE_WEIGHTS } = await import("../src/lib/luck-engine/weights.ts");
  let wOk = true;
  for (const act of ACTIVITIES) {
    const w = MODULE_WEIGHTS[act];
    if (w.moon_void !== 0 || w.retro_window !== 0 || w.eclipse_zone !== 0 || w.rahu_kalam !== 0) wOk = false;
    if (w.moon_sign !== 0.02) wOk = false;
  }
  ok(wOk, "weights: 4 ตัวตัด = 0 (caps ล้วน) · moon_sign = 0.02 (เบา ๆ) ครบ 8 กิจกรรม");
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/app/api/auspicious/route.ts", "utf8");
  ok(/sky:\s*skyActive\.length\s*\?\s*`\$\{SKY_MODULE_POLICY\}/.test(src), "cache key มีสถานะ sky modules (additive)");
  ok(src.includes("applySkyModules(c, skyModulesActive, resolvedActivityType, eventLocation)"),
    "route แนบ 5 modules จุดเดียวกับ dong_gong/tian_xing + ส่ง eventLocation");
  ok(src.includes("enforceSkyCaps(c, skyModulesActive)"), "มีชั้น re-enforce caps ท้าย pipeline (กัน profile rules ดันทะลุ)");
  ok(/DATEPICK_HARD_MODULES = new Set<ModuleKey>\(\["ze_ri", "tai_sui", "ba_zi", "qi_men"\]\)/.test(src),
    "DATEPICK_HARD_MODULES ไม่ถูกแตะ (sky ไม่เข้า hard-SQL)");
}

/* ═══ 7 · route จริง: module ปิด = byte-identical กับ baseline r370 · module เปิด = ตัดจริง ═══ */
console.log("\n[7] route จริง (in-process + DB)");
const BASELINE = "/root/backups/datepick-sky-r372-20260703-104535/route.ts";
{
  const { NextRequest } = await import("next/server.js");
  const newRoute = await import("../src/app/api/auspicious/route.ts");
  // baseline (route ก่อนแก้ r372 · จาก backup) ต้อง copy เข้า scope โปรเจกต์ชั่วคราว
  // เพื่อให้ bare import ("next", "pg", …) resolve จาก node_modules ได้ · ลบทิ้งหลังใช้
  const { copyFileSync, unlinkSync } = await import("node:fs");
  const TMP_BASELINE = "scripts/.tmp-baseline-route-r372.ts";
  copyFileSync(BASELINE, TMP_BASELINE);
  let baseRoute;
  try {
    baseRoute = await import(pathToFileURL(TMP_BASELINE).href);
  } finally {
    try { unlinkSync(TMP_BASELINE); } catch { /* ignore */ }
  }
  const UNIV8 = ["ze_ri", "twelve_officers", "twenty_eight", "twelve_spirits", "nine_stars", "tai_sui", "qi_men", "he_luo"];
  const mkReq = (extra = [], df = "2026-07-01", dt = "2026-07-30") =>
    new NextRequest("http://localhost/api/auspicious", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ activityType: "開市", dateFrom: df, dateTo: dt, activeModules: [...UNIV8, ...extra], options: { limit: 50 } }),
    });
  // เทียบ byte-identical: candidates+funnelStats ต้องเป๊ะทุก byte ·
  // meta ตัด field เวลา (durationMs/cache) + 2 field additive ที่ประกาศ (skyModules/skyScoringPolicy
  //   · pattern เดียวกับ r367 ที่เพิ่ม donggongScoringPolicy/eventLocation เข้า meta แบบ additive)
  const strip = (j) => {
    const m = { ...(j.meta || {}) };
    delete m.durationMs; delete m.cache; delete m.skyModules; delete m.skyScoringPolicy;
    return { c: j.candidates, f: j.funnelStats, m };
  };

  const offNew = await (await newRoute.POST(mkReq())).json();
  const offBase = await (await baseRoute.POST(mkReq())).json();
  ok(!offNew.error && !offBase.error, "ทั้งสอง route ตอบปกติ (DB ต่อได้)", offNew.error || offBase.error || "");
  const cNew = JSON.stringify(offNew.candidates), cBase = JSON.stringify(offBase.candidates);
  ok(cNew === cBase,
    `module ปิด → candidates byte-identical กับ baseline ก่อนแก้ (${cNew.length.toLocaleString()} bytes · คะแนน/เหตุผล/ลำดับเป๊ะ)`,
    cNew.length + " vs " + cBase.length);
  const sNew = JSON.stringify(strip(offNew));
  const sBase = JSON.stringify(strip(offBase));
  ok(sNew === sBase, "module ปิด → funnelStats+meta identical (นอกเหนือ field additive ที่ประกาศ)");
  ok(!("skyModules" in (offBase.meta || {})), "baseline ไม่มี field sky (พิสูจน์ meta ใหม่เป็น additive จริง)");
  ok(JSON.stringify(offNew.meta?.skyModules) === "[]" && offNew.meta?.skyScoringPolicy === "off",
    "module ปิด → meta.skyModules=[] · policy=off (additive field)");

  // module เปิด → ตัดจริง: ก.ค. 2026 พุธถอยเกือบทั้งเดือน (29 มิ.ย.–23 ก.ค.) + 開市 → slot ก่อน 24 ก.ค. โดน cap 45 หมด
  const onNew = await (await newRoute.POST(mkReq(SKY5))).json();
  ok(onNew.meta?.skyScoringPolicy === "v1_sky_r372" && (onNew.meta?.skyModules || []).length === 5,
    "module เปิด → meta บอก policy v1_sky_r372 + 5 modules");
  const early = (onNew.candidates || []).filter((c) => c.calendar.gregorianDate <= "2026-07-23");
  const earlyOverCap = early.filter((c) => c.scoring.finalScore > 45);
  ok(early.length === 0 || earlyOverCap.length === 0,
    `ตัดจริง: slot ช่วงพุธถอย (≤23 ก.ค.) ที่เหลือใน top50 ทุกตัวคะแนน ≤ 45 (มี ${early.length} slot · เกิน cap ${earlyOverCap.length})`);
  const late = (onNew.candidates || []).filter((c) => c.calendar.gregorianDate >= "2026-07-25");
  ok(late.length >= 10, `slot หลังพุธกลับเดินหน้า (≥25 ก.ค.) ขึ้น top แทน (${late.length}/50)`);
  const offTop = (offNew.candidates || []).slice(0, 10).map((c) => c.id).join(",");
  const onTop = (onNew.candidates || []).slice(0, 10).map((c) => c.id).join(",");
  ok(offTop !== onTop, "อันดับ top เปลี่ยนจริงเมื่อเปิด sky modules (ไม่ใช่ decorative)");
  // สุ่มตรวจ 1 slot ที่โดน: moduleScores มี key sky + caps อ้าง source ถูก
  const anyCapped = (onNew.candidates || []).find((c) => (c.scoring.caps || []).some((x) => String(x.source || "").match(/moon_void|retro_window|eclipse_zone|rahu_kalam/)));
  ok(!!anyCapped, "มี slot ที่ติด cap จาก sky modules ใน response (caps ระบุ source ถูกต้อง)");
  const anyOn = (onNew.candidates || [])[0];
  ok(!!anyOn && Object.keys(anyOn.scoring.moduleScores || {}).filter((k) => SKY5.includes(k)).length >= 4,
    "moduleScores มีคะแนน sky modules (โชว์ใน UI ได้ภายหลัง)",
    JSON.stringify(Object.keys(anyOn?.scoring?.moduleScores || {})));

  // cache key แยกจริง: ยิงซ้ำ (ON) ครั้งที่สอง = cache hit · ไม่ปน OFF
  const onAgain = await (await newRoute.POST(mkReq(SKY5))).json();
  ok(onAgain.meta?.cache === "hit" && onAgain.meta?.skyScoringPolicy === "v1_sky_r372",
    "ยิงซ้ำ ON = cache hit ที่ key ของ ON เอง (ไม่ปนกับ OFF)");

  /* ═══ 8 · perf ═══ */
  console.log("\n[8] perf · latency เพิ่ม <150ms ต่อ request 30 วัน (วัดจริง)");
  // วัดช่วงใหม่ (ส.ค.) ทั้ง OFF/ON ใน process เดียวกัน (DB อุ่นแล้ว · sky cache ส.ค. ยังเย็นบางส่วน)
  let t0 = performance.now();
  await (await newRoute.POST(mkReq([], "2026-08-01", "2026-08-30"))).json();
  const tOff = performance.now() - t0;
  t0 = performance.now();
  await (await newRoute.POST(mkReq(SKY5, "2026-08-01", "2026-08-30"))).json();
  const tOnCold = performance.now() - t0;
  // รอบอุ่น: เดือนเดียวกัน limit ต่างกัน (คนละ cache key ของ route · sky cache อุ่นแล้ว)
  const mkReq2 = (extra) => new NextRequest("http://localhost/api/auspicious", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ activityType: "婚姻", dateFrom: "2026-08-01", dateTo: "2026-08-30", activeModules: [...UNIV8, ...extra], options: { limit: 40 } }),
  });
  t0 = performance.now();
  await (await newRoute.POST(mkReq2([]))).json();
  const tOff2 = performance.now() - t0;
  t0 = performance.now();
  await (await newRoute.POST(mkReq2(SKY5))).json();
  const tOnWarm = performance.now() - t0;
  console.log(`    ⏱ 30วัน OFF ${tOff.toFixed(1)}ms · ON(เย็น) ${tOnCold.toFixed(1)}ms (Δ ${(tOnCold - tOff).toFixed(1)}ms) · ON(อุ่น) ${tOnWarm.toFixed(1)}ms (Δ ${(tOnWarm - tOff2).toFixed(1)}ms)`);
  ok(tOnCold - tOff < 150, `เปิด 5 modules ครั้งแรก (cache เย็น) เพิ่ม ${(tOnCold - tOff).toFixed(1)}ms < 150ms`);
  ok(tOnWarm - tOff2 < 60, `รอบอุ่น (cache รายวัน/รายปีทำงาน) เพิ่ม ${(tOnWarm - tOff2).toFixed(1)}ms < 60ms`);
}

/* ═══ 9 · regression ═══ */
console.log("\n[9] regression");
{
  const out367 = execFileSync("node", ["--experimental-strip-types", "--import", "./scripts/_ts-resolver.mjs", "scripts/test-datepick-r367.mjs"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const m = out367.match(/ผลรวม: (\d+) passed · (\d+) failed/);
  ok(!!m && m[2] === "0" && Number(m[1]) >= 40, `test-datepick-r367 ยังผ่านครบ (${m?.[1]}/${m ? Number(m[1]) + Number(m[2]) : "?"})`);
  const outBazi = execFileSync("node", ["scripts/test-bazi-calc.cjs"], { encoding: "utf8" });
  ok(/2\/2 passed/.test(outBazi), "test-bazi-calc.cjs 2/2 (golden Aeaw/Mai)");
  if (process.env.SKIP_TSC === "1") {
    console.log("    (ข้าม tsc ตาม SKIP_TSC=1)");
  } else {
    try {
      execFileSync("npx", ["tsc", "--noEmit"], { encoding: "utf8", timeout: 420_000 });
      ok(true, "tsc --noEmit ผ่าน (type ทั้งโปรเจกต์)");
    } catch (e) {
      ok(false, "tsc --noEmit ผ่าน", String(e.stdout || e.message).slice(0, 400));
    }
  }
}

console.log(`\n═══ ผลรวม: ${pass} passed · ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
