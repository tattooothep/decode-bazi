/* test-datepick-r367.mjs · ตงกง module + สถานที่จัดงาน (พิกัดจริง + ยามคาบเส้น)
   รัน: node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-datepick-r367.mjs
   ครอบ: donggong caps/boost · module OFF = overlay เดิม (snapshot vs backup) ·
         tian_xing รับพิกัดจริง · TST boundary warning · validate พิกัด · regression · perf */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

import { dongGong } from "../src/lib/donggong.ts";
import { computeDongGong, DONGGONG_ACTIVITY_ALIASES } from "../src/lib/luck-engine/modules/dong-gong.ts";
import { combineScores } from "../src/lib/luck-engine/combineScores.ts";
import { computeTianXing } from "../src/lib/luck-engine/modules/tian-xing.ts";
import { normalizeEventLocation, buildTstBoundaryWarning, tstShichenAt } from "../src/lib/luck-engine/event-location.ts";
import { applyTST } from "../src/lib/tyme-tst.ts";

let pass = 0, fail = 0;
function ok(cond, name, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const STEMS = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const GANZHI60 = Array.from({ length: 60 }, (_, i) => STEMS[i % 10] + BRANCHES[i % 12]);

function findVerdict(pred) {
  for (const mb of BRANCHES) for (const db of BRANCHES) for (const gz of GANZHI60) {
    if (gz[1] !== db) continue;
    const dg = dongGong(mb, db, gz);
    if (dg && !dg.missing && pred(dg)) return { mb, db, gz, dg };
  }
  return null;
}

function mockSlot(dg, { date = "2026-07-10", shichen = 4 } = {}) {
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
    donggong: dg, zodiacClash: [], people: [],
    modules: { ze_ri: zeRi }, scoring: undefined, display: undefined,
  };
}

/* ═══ 1 · ตงกง module ═══ */
console.log("\n[1] ตงกง 董公 module");
const daxiong = findVerdict((d) => d.verdict === "大凶");
ok(!!daxiong, "หาวัน 大凶 เจอในตำรา", "");
if (daxiong) {
  const slot = mockSlot(daxiong.dg);
  const mr = computeDongGong(slot, "動土");
  ok(mr.status === "ready" && mr.score.normalized === 20 && mr.pass === false,
    "大凶 → normalized 20 · pass false", JSON.stringify(mr.score));
  const cap = (mr.caps || []).find((c) => c.code === "DONGGONG_DAXIONG_CAP");
  ok(!!cap && cap.type === "max" && cap.value === 30, "大凶 → cap max 30 (DONGGONG_DAXIONG_CAP)");
  // ผ่าน combineScores ทางเดียวกับ module อื่น → finalScore ≤ 30 แม้ ze_ri ให้ 80
  const scoring = combineScores({ ze_ri: slot.modules.ze_ri, dong_gong: mr }, ["ze_ri", "dong_gong"], "動土");
  ok(scoring.finalScore <= 30, `大凶 finalScore ≤ 30 (ได้ ${scoring.finalScore})`);
  ok(scoring.caps.some((c) => c.code === "DONGGONG_DAXIONG_CAP"), "cap ไหลเข้า scoring.caps ผ่าน combineScores");
  ok(scoring.reasonsDown.some((r) => String(r.code).startsWith("DONGGONG")), "reason ไทยตงกงติดใน reasonsDown");
}
const xiong = findVerdict((d) => d.verdict === "凶" || d.verdict === "不利");
if (xiong) {
  const mr = computeDongGong(mockSlot(xiong.dg), "出行");
  const cap = (mr.caps || []).find((c) => c.code === "DONGGONG_XIONG_CAP");
  ok(mr.score.normalized === 35 && !!cap && cap.value === 45, "凶/不利 → normalized 35 · cap 45");
}
const jiMatch = findVerdict((d) => d.verdict !== "大凶" && (d.ji || []).some((x) => DONGGONG_ACTIVITY_ALIASES["動土"].includes(x)));
ok(!!jiMatch, "หาวัน ji ตรงกิจกรรม 動土 เจอ");
if (jiMatch) {
  const mr = computeDongGong(mockSlot(jiMatch.dg), "動土");
  ok((mr.caps || []).some((c) => c.code === "DONGGONG_JI_CAP" && c.value === 45), "ji-match → cap 45 (DONGGONG_JI_CAP)");
  const sc = combineScores({ ze_ri: mockSlot(jiMatch.dg).modules.ze_ri, dong_gong: mr }, ["ze_ri", "dong_gong"], "動土");
  ok(sc.finalScore <= 45, `ji-match finalScore ≤ 45 (ได้ ${sc.finalScore})`);
}
const good = findVerdict((d) => d.level === "top" || d.level === "good");
if (good) {
  const mr = computeDongGong(mockSlot(good.dg), "祭祀");
  const upSum = (mr.reasons.up || []).reduce((s, r) => s + Math.max(0, r.delta || 0), 0);
  ok(upSum >= 8 && upSum <= 14, `วันดี boost bounded 8..14 (ได้ +${upSum})`);
  ok(!(mr.caps || []).length, "วันดีไม่มี cap");
  ok((mr.reasons.up || []).some((r) => r.thai.includes(good.dg.verdictTh)), "reason อ้างข้อความตงกงจริง (verdictTh)");
}
const yiMatch = findVerdict((d) => (d.level === "top" || d.level === "good") && (d.yi || []).some((x) => DONGGONG_ACTIVITY_ALIASES["婚姻"].includes(x)));
if (yiMatch) {
  const mr = computeDongGong(mockSlot(yiMatch.dg), "婚姻");
  ok((mr.reasons.up || []).some((r) => r.code === "DONGGONG_YI_MATCH" && r.delta === 6), "yi-match → +6 (DONGGONG_YI_MATCH)");
}
// missing → zero-effect
{
  const mr = computeDongGong(mockSlot(null), "動土");
  ok(mr.status === "missing", "donggong null → status missing (combineScores ข้าม · zero-effect)");
  const sc = combineScores({ ze_ri: mockSlot(null).modules.ze_ri, dong_gong: mr }, ["ze_ri", "dong_gong"], "動土");
  ok(sc.finalScore === 80, `missing ไม่กระทบคะแนน (ze_ri 80 → ${sc.finalScore})`);
}

/* ═══ 2 · module OFF = overlay เดิม byte-identical (snapshot vs backup) ═══ */
console.log("\n[2] module OFF → เส้นทาง overlay เดิมไม่เปลี่ยน (snapshot)");
const BACKUP = "/root/backups/datepick-r367-20260703-081545";
const curRoute = readFileSync("src/app/api/auspicious/route.ts", "utf8");
const bakRoute = readFileSync(`${BACKUP}/route.ts`, "utf8");
function extractFn(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return null;
  let depth = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}
ok(extractFn(curRoute, "applyDongGongOverlay") === extractFn(bakRoute, "applyDongGongOverlay"),
  "applyDongGongOverlay byte-identical กับ backup (path เดิมไม่ถูกแตะ)");
ok(/dongGongModuleActive\s*\?\s*applyDongGongBoost\(c\)\s*:\s*applyDongGongOverlay\(c, activeModuleKeys, resolvedActivityType\)/.test(curRoute.replace(/\n\s*/g, " ")),
  "dispatch: module off → applyDongGongOverlay เดิม · module on → boost (ไม่นับซ้ำ)");
// aliases ที่ย้ายไฟล์ ค่าต้องเท่าตาราง backup ทุกตัว
{
  const m = bakRoute.match(/const DONGGONG_ACTIVITY_ALIASES[^=]*=\s*({[\s\S]*?});/);
  const bakAliases = vm.runInNewContext(`(${m[1]})`);
  ok(JSON.stringify(bakAliases) === JSON.stringify(DONGGONG_ACTIVITY_ALIASES), "DONGGONG_ACTIVITY_ALIASES ค่าเดิมทุกตัวหลังย้ายไฟล์");
}
// overlay-only ผลลัพธ์เดิม: verdict delta table ยังอยู่ + hideDongGong เดิมเมื่อ module off
ok(curRoute.includes("DONGGONG_VERDICT_DELTA"), "ตาราง overlay delta ยังอยู่ครบ");

/* ═══ 3 · tian_xing รับพิกัดจริง ═══ */
console.log("\n[3] tian_xing ใช้พิกัดสถานที่งานจริง");
{
  const BKK = [13.75, 100.5], CM = [18.79, 98.98];
  let diff = 0, thrown = 0;
  for (let i = 0; i < 10; i++) {
    const slot = mockSlot(null, { date: `2026-07-${String(10 + i).padStart(2, "0")}`, shichen: (i * 3) % 12 });
    try {
      const a = computeTianXing(slot, BKK[0], BKK[1]);
      const b = computeTianXing(slot, CM[0], CM[1]);
      if (i === 0) {
        ok(a.raw.lat === BKK[0] && a.raw.lng === BKK[1] && b.raw.lat === CM[0] && b.raw.lng === CM[1],
          "computeTianXing รับ lat/lng ที่ส่งจริง (raw.lat/raw.lng)");
      }
      if (a.raw.ascendantDeg !== b.raw.ascendantDeg) diff++;
    } catch (e) { thrown++; }
  }
  ok(thrown === 0, "ไม่ throw ทั้ง 10 slot × 2 พิกัด");
  ok(diff >= 1, `ascendant ต่างกัน กทม vs เชียงใหม่ (${diff}/10 slot)`);
  // default ยังเป็น BKK (backward compat)
  const d = computeTianXing(mockSlot(null));
  ok(d.raw.lat === 13.75 && d.raw.lng === 100.5, "ไม่ส่งพิกัด → default Bangkok เดิม");
}

/* ═══ 4 · ยามคาบเส้น TST ณ สถานที่งาน ═══ */
console.log("\n[4] TST boundary warning");
{
  // slot กึ่งกลาง 08:58 กทม (UTC 01:28-02:28 → mid 01:58 UTC = 08:58 กทม) · cache ยาม辰(4)
  // @lng105 TST≈08:53 → ห่างขอบยาม 09:00 ~7 นาที → เตือน · @lng98.98 TST≈08:29 กลางยาม → ไม่เตือน
  const base = { startUtc: "2026-07-10 01:28:00", endUtc: "2026-07-10 02:28:00", cacheShichen: 4 };
  const at105 = buildTstBoundaryWarning({ ...base, loc: { lat: 15, lng: 105, place: "อุบลราชธานี", source: "user" } });
  ok(!!at105 && at105.code === "TST_HOUR_BOUNDARY", "08:58 กทม @lng105 → ใกล้ขอบยาม → เตือน", JSON.stringify(at105));
  const at9898 = buildTstBoundaryWarning({ ...base, loc: { lat: 18.79, lng: 98.98, place: "เชียงใหม่", source: "user" } });
  ok(at9898 === null, "08:58 กทม @lng98.98 → TST ~08:29 กลางยาม → ไม่เตือน", JSON.stringify(at9898));
  // ยามเปลี่ยนจริง: lng ตะวันออกไกลขึ้น → TST ข้ามเข้า巳
  const at110 = buildTstBoundaryWarning({ ...base, loc: { lat: 15, lng: 110, place: "ทะเลจีนใต้", source: "user" } });
  ok(!!at110 && at110.thai.includes("ยาม辰") && at110.thai.includes("ยาม巳"), "@lng110 ยามเปลี่ยน辰→巳 → เตือนพร้อมคู่ยาม", at110?.thai || "");
  ok(at110.delta === 0 && at110.severity === "warning", "เตือนอย่างเดียว · delta 0 · ไม่แตะคะแนน");
  // cross-check คณิต TST กับ applyTST ตรง ๆ
  const t = applyTST({ year: 2026, month: 7, day: 10, hour: 8, minute: 55, longitude: 105, gmtOffsetHours: 7 });
  const shifted = ((t.appliedHour * 60 + t.appliedMinute + 60) % 1440 + 1440) % 1440;
  const s = tstShichenAt(2026, 7, 10, 8, 55, 105);
  ok(s.shichen === Math.floor(shifted / 120) % 12 && s.minIntoShichen === shifted % 120,
    "tstShichenAt ตรงกับ applyTST (Layer 0 เดิม) เป๊ะ");
  // กลางยามที่กทมเอง (slot ปกติ mid = กลางยาม) ต้องไม่เตือน
  const mid = buildTstBoundaryWarning({ startUtc: "2026-07-10 00:00:00", endUtc: "2026-07-10 02:00:00", cacheShichen: 4, loc: { lat: 13.7563, lng: 100.5018, place: "กรุงเทพมหานคร", source: "default_bkk" } });
  ok(mid === null, "slot ปกติ (กลางยาม) ที่กทม → ไม่เตือน (ไม่มี false alarm)");
}

/* ═══ 5 · validate พิกัด (server) ═══ */
console.log("\n[5] validate eventLat/eventLng");
{
  const a = normalizeEventLocation({});
  ok(a.source === "default_bkk" && a.lat === 13.7563 && a.lng === 100.5018, "ไม่ส่งพิกัด → default กรุงเทพ");
  const b = normalizeEventLocation({ eventLat: 999, eventLng: 98.98, eventPlace: "x" });
  ok(b.source === "fallback_invalid" && b.lat === 13.7563 && !!b.note, "lat 999 → fallback กทม + note (เอกสาร: เลือก fallback ไม่ใช่ 400)");
  const c = normalizeEventLocation({ eventLat: "abc", eventLng: null });
  ok(c.source === "fallback_invalid", "lat ไม่ใช่ตัวเลข → fallback กทม");
  const d = normalizeEventLocation({ eventLat: 18.79, eventLng: 98.98, eventPlace: "เชียงใหม่" });
  ok(d.source === "user" && d.lat === 18.79 && d.place === "เชียงใหม่", "พิกัดถูก → ใช้ของ user");
}

/* ═══ 6 · cache key มีพิกัด + สถานะ dong_gong ═══ */
console.log("\n[6] cache key");
{
  ok(/dgm:\s*dgModule/.test(curRoute) && /el:\s*Math\.round\(evLoc\.lat \* 100\) \/ 100/.test(curRoute),
    "cacheKey มี dgm + พิกัดปัด 2 ตำแหน่ง (additive)");
  ok(curRoute.includes('m: (body.activeModules || []).slice().sort()'), "activeModules (รวม dong_gong) ยังอยู่ใน key เดิม");
}

/* ═══ 7 · regression ═══ */
console.log("\n[7] regression");
{
  const out = execFileSync("node", ["scripts/test-bazi-calc.cjs"], { encoding: "utf8" });
  ok(/2\/2 passed/.test(out), "test-bazi-calc.cjs 2/2");
  // syntax check ทุก inline <script> ใน datepick.html
  const html = readFileSync("public/datepick.html", "utf8");
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let synErr = 0;
  for (const [i, code] of scripts.entries()) {
    try { new vm.Script(code); } catch (e) { synErr++; console.log(`    script #${i}: ${e.message}`); }
  }
  ok(scripts.length > 0 && synErr === 0, `datepick.html inline scripts ${scripts.length} บล็อก syntax ผ่านหมด`);
  ok(html.includes('data-filter="donggong"') && html.includes("hk_datepick_event_loc"), "UI: toggle ตงกง + persist สถานที่ ครบ");
}

/* ═══ 8 · perf: TST check บน top-50 ═══ */
console.log("\n[8] perf");
{
  const loc = { lat: 18.79, lng: 98.98, place: "เชียงใหม่", source: "user" };
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) {
    buildTstBoundaryWarning({ startUtc: `2026-07-${String((i % 28) + 1).padStart(2, "0")} ${String(i % 24).padStart(2, "0")}:00:00`, endUtc: null, cacheShichen: i % 12, loc });
  }
  const ms = performance.now() - t0;
  ok(ms < 50, `TST check 50 slots = ${ms.toFixed(2)}ms (< 50ms)`);
  console.log(`    ⏱ ${ms.toFixed(3)}ms / 50 slots`);
}

console.log(`\n═══ ผลรวม: ${pass} passed · ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
