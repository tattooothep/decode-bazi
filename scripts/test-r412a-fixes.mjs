/**
 * test-r412a-fixes.mjs — regression/unit tests สำหรับ 3 บั๊ก r412a (5 ก.ค. 2026)
 * ==============================================================================
 *   บั๊ก 1: goTianxing ทิ้งพิกัดสถานที่งาน (public/datepick.html)
 *   บั๊ก 2: "平" ถูกป้ายเป็น用神อ่อนแรง (src/lib/luck-engine/modules/tian-xing.ts)
 *   บั๊ก 3: 天德 หาย 4 เดือนกิ่ง 卯午酉子 (src/lib/luck-engine/modules/ze-ri.ts)
 *
 * รัน: node scripts/test-r412a-fixes.mjs
 * ต้องรันจาก root repo (/root/decode-app) · compile TS ชั่วคราวด้วย tsc ลง .test-build
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

let passCount = 0, failCount = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passCount++; }
  else { failCount++; failures.push(name + (detail ? ` — ${detail}` : "")); console.log(`  ❌ FAIL: ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n═══ ${t} ═══`); }

// =====================================================================
// Section 0 · compile TS modules (ze-ri + tian-xing) → CJS ชั่วคราว
// =====================================================================
section("0 · compile engine TS → CJS (tsc)");
const BUILD = path.join(ROOT, ".test-build-r412a");
fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(BUILD, { recursive: true });
const tsconfig = {
  compilerOptions: {
    target: "es2020", module: "commonjs", moduleResolution: "node",
    esModuleInterop: true, skipLibCheck: true, strict: false,
    rootDir: path.join(ROOT, "src"), outDir: path.join(BUILD, "out"),
    baseUrl: ROOT, paths: { "@/*": ["./src/*"] },
  },
  files: [
    path.join(ROOT, "src/lib/luck-engine/modules/ze-ri.ts"),
    path.join(ROOT, "src/lib/luck-engine/modules/tian-xing.ts"),
  ],
};
fs.writeFileSync(path.join(BUILD, "tsconfig.json"), JSON.stringify(tsconfig));
execFileSync(path.join(ROOT, "node_modules/.bin/tsc"), ["-p", path.join(BUILD, "tsconfig.json")], { stdio: "inherit" });
// ให้ compiled code หา node_modules (astronomy-engine) เจอ + alias @/ → out/
try { fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(BUILD, "node_modules"), "dir"); } catch (_) {}
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (typeof request === "string" && request.startsWith("@/"))
    request = path.join(BUILD, "out", request.slice(2));
  return origResolve.call(this, request, ...rest);
};
const { zeRiModule } = require(path.join(BUILD, "out/lib/luck-engine/modules/ze-ri.js"));
const { computeTianXing } = require(path.join(BUILD, "out/lib/luck-engine/modules/tian-xing.js"));
console.log("  compile OK · zeRiModule + computeTianXing loaded");

// =====================================================================
// helpers · สร้าง slot จริงตามโครง CandidateSlot (เท่าที่ engine ใช้)
// =====================================================================
const STEMS = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
// 協紀辨方書: 正丁二坤三壬四辛五乾六甲七癸八艮九丙十乙子巽丑庚 (坤=申 乾=亥 艮=寅 巽=巳)
const TIAN_DE = { "寅":"丁","卯":"申","辰":"壬","巳":"辛","午":"亥","未":"甲","申":"癸","酉":"寅","戌":"丙","亥":"乙","子":"巳","丑":"庚" };
const STEM_MONTHS = ["寅","辰","巳","未","申","戌","亥","丑"];
const BRANCH_MONTHS = ["卯","午","酉","子"];

function validDay(stem, branch) { // เสาวันต้อง parity ตรง (60甲子)
  return STEMS.indexOf(stem) % 2 === BRANCHES.indexOf(branch) % 2;
}
function dayWithStem(stem, avoidBranch) {
  const p = STEMS.indexOf(stem) % 2;
  const b = BRANCHES.find((x, i) => i % 2 === p && x !== avoidBranch);
  return { stem, branch: b };
}
function dayWithBranch(branch, avoidStem) {
  const p = BRANCHES.indexOf(branch) % 2;
  const s = STEMS.find((x, i) => i % 2 === p && x !== avoidStem);
  return { stem: s, branch };
}
function mkInput(monthBranch, day, activityType = "祭祀") {
  return {
    slot: {
      calendar: { gregorianDate: "2026-07-15", shichen: 5 },
      pillars: {
        year: { stem: "丙", branch: "午" },
        month: { stem: "庚", branch: monthBranch },
        day,
        hour: { stem: "甲", branch: "辰" },
      },
    },
    activityType, targetDirection: null,
  };
}

// =====================================================================
// Section 1 · 天德 unit: 12 เดือน × fire/no-fire (synthetic · engine จริง)
// =====================================================================
section("1 · 天德 unit 12 เดือน (zeRiModule.compute จริง)");
for (const mb of Object.keys(TIAN_DE)) {
  const td = TIAN_DE[mb];
  const isBranchMonth = BRANCHES.includes(td);
  // เคส fire
  const fireDay = isBranchMonth ? dayWithBranch(td) : dayWithStem(td);
  check(`fireDay valid 60甲子 (${mb}月 ${fireDay.stem}${fireDay.branch})`, validDay(fireDay.stem, fireDay.branch));
  const rFire = await zeRiModule.compute(mkInput(mb, fireDay));
  check(`${mb}月(天德=${td}) วัน${fireDay.stem}${fireDay.branch} ต้องได้ tian_de`, rFire.tags.includes("tian_de"), `tags=${rFire.tags}`);
  check(`${mb}月 raw.checks.tianDe=true`, rFire.raw.checks.tianDe === true);
  const upTd = rFire.reasons.up.find((x) => x.code === "TIAN_DE");
  check(`${mb}月 reason TIAN_DE delta=+18`, !!upTd && upTd.delta === 18);
  // เคส no-fire (วันที่ทั้งก้าน+กิ่งไม่ตรง天德)
  const noDay = isBranchMonth ? dayWithBranch(BRANCHES.find((b) => b !== td && !["申","亥","寅","巳"].includes(b) && BRANCHES.indexOf(b) % 2 === 0) || "子") : dayWithStem(STEMS.find((s) => s !== td) , td);
  if (noDay.stem === td || noDay.branch === td) throw new Error("fixture ผิด");
  const rNo = await zeRiModule.compute(mkInput(mb, noDay));
  check(`${mb}月 วัน${noDay.stem}${noDay.branch} ต้องไม่ได้ tian_de`, !rNo.tags.includes("tian_de"), `tags=${rNo.tags}`);
  check(`${mb}月 raw.checks.tianDe=false`, rNo.raw.checks.tianDe === false);
}
// เดือนก้าน 8 เดือน: พฤติกรรมใหม่ = เก่าเป๊ะ (td เป็นก้าน · day.branch เทียบก้านไม่มีทางแมตช์)
for (const mb of STEM_MONTHS) {
  check(`${mb}月 td=${TIAN_DE[mb]} เป็นก้าน → เงื่อนไข branch เพิ่มไม่มีผล (no regress โดยโครงสร้าง)`, STEMS.includes(TIAN_DE[mb]));
}
for (const mb of BRANCH_MONTHS) {
  check(`${mb}月 td=${TIAN_DE[mb]} เป็นกิ่ง → logic เก่า (stem-only) ไม่มีทาง fire = บั๊กที่แก้`, BRANCHES.includes(TIAN_DE[mb]));
}

// =====================================================================
// Section 2 · 天德 cross-check ทั้งปี 2026 (จันทรคติจริงจาก tyme4ts)
//   - 8 เดือนก้าน: เทียบ tyme4ts getGods (สำนักเดียวกัน)
//   - 4 เดือนกิ่ง: tyme4ts ไม่ให้天德รายวัน (สำนัก四隅=ทิศ) → เทียบตำรา協紀 坤申/乾亥/艮寅/巽巳
// =====================================================================
section("2 · 天德 cross-check ปี 2026 เต็มปี (tyme4ts + 協紀)");
const { SolarDay } = require("tyme4ts");
let stemChecked = 0, stemMismatch = [], tymeExtra = [], branchFired = {}, branchChecked = 0;
for (let m = 1; m <= 12; m++) {
  const days = new Date(2026, m, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const scd = SolarDay.fromYmd(2026, m, d).getSixtyCycleDay();
    const mb = scd.getMonth().getEarthBranch().getName();
    const ds = scd.getSixtyCycle().getHeavenStem().getName();
    const db = scd.getSixtyCycle().getEarthBranch().getName();
    const input = mkInput(mb, { stem: ds, branch: db });
    const r = await zeRiModule.compute(input);
    const oursFire = r.tags.includes("tian_de");
    const td = TIAN_DE[mb];
    if (STEM_MONTHS.includes(mb)) {
      stemChecked++;
      const tymeFire = scd.getGods().some((g) => g.getName() === "天德");
      // ours ⊆ tyme (ทุกวันที่เรา fire · tyme ต้อง fire ด้วย)
      if (oursFire && !tymeFire) stemMismatch.push(`2026-${m}-${d} ${mb}月 ${ds}${db}`);
      // tyme fire แต่เราไม่ fire → บันทึกไว้ (tyme table มี quirk ของสำนักตัวเอง)
      if (tymeFire && !oursFire) tymeExtra.push(`2026-${m}-${d} ${mb}月 ${ds}${db}`);
      // regress check: เดือนก้าน logic เก่า(stem-only) ต้อง = ใหม่
      check(`no-regress ${mb}月 2026-${m}-${d}`, oursFire === (ds === td), `ours=${oursFire} stemOnly=${ds === td}`);
    } else {
      branchChecked++;
      // เดือนกิ่ง: 協紀 mapping → fire เมื่อ日支 ∈ 申亥寅巳 ตรงตาราง
      const expect = db === td;
      check(`協紀 ${mb}月(天德=${td}) 2026-${m}-${d} วัน${ds}${db}`, oursFire === expect, `ours=${oursFire} expect=${expect}`);
      if (oursFire) branchFired[mb] = (branchFired[mb] || 0) + 1;
    }
  }
}
check("เดือนก้าน: ทุกวันที่เรา fire → tyme4ts fire ด้วย (ours ⊆ tyme)", stemMismatch.length === 0, stemMismatch.join(" · "));
for (const mb of BRANCH_MONTHS)
  check(`เดือนกิ่ง ${mb}月 มีวัน fire จริงในปี 2026 (เดิม=0 ตลอดปี)`, (branchFired[mb] || 0) > 0, `fired=${branchFired[mb] || 0}`);
console.log(`  เดือนก้านตรวจ ${stemChecked} วัน · เดือนกิ่งตรวจ ${branchChecked} วัน · เดือนกิ่ง fire: ${JSON.stringify(branchFired)}`);
if (tymeExtra.length) console.log(`  ℹ️ tyme4ts fire เกินสำนักเรา (table quirk · ไม่ใช่ regression): ${tymeExtra.join(" · ")}`);

// =====================================================================
// Section 3 · 平 ≠ 用神อ่อนแรง (สแกนวันจริงหลายเดือน/หลายยาม)
// =====================================================================
section("3 · 天星 用神=平 ต้องไม่ติดป้ายอ่อนแรง (สแกนหลายวัน/ยาม)");
const statusSeen = { "平": 0, weak: 0, strong: 0 };
const scanDates = [];
for (const m of [1, 3, 5, 7, 8, 9, 11, 12]) for (const d of [3, 9, 15, 21, 27]) scanDates.push(`2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
for (const date of scanDates) {
  for (const sc of [0, 2, 4, 6, 8, 10]) {
    const slot = { calendar: { gregorianDate: date, shichen: sc }, pillars: {} };
    const r = computeTianXing(slot); // default กทม
    const st = r.raw?.yongshen?.status;
    const weakReason = r.reasons.down.find((x) => x.code === "TX_YONG_WEAK");
    const strongReason = r.reasons.up.find((x) => x.code === "TX_YONG_STRONG");
    if (st === "平") {
      statusSeen["平"]++;
      check(`${date} sc${sc} 用神=平 ต้องไม่มี TX_YONG_WEAK`, !weakReason, weakReason && weakReason.thai);
      check(`${date} sc${sc} 用神=平 ต้องไม่มี TX_YONG_STRONG`, !strongReason);
    } else if (st === "落" || st === "陷") {
      statusSeen.weak++;
      check(`${date} sc${sc} 用神=${st} ยังต้องมี TX_YONG_WEAK delta -6`, !!weakReason && weakReason.delta === -6);
    } else if (["廟", "旺", "升殿", "樂"].includes(st)) {
      statusSeen.strong++;
      check(`${date} sc${sc} 用神=${st} ต้องมี TX_YONG_STRONG +8`, !!strongReason && strongReason.delta === 8);
    }
  }
}
check("สแกนเจอเคส 用神=平 จริงอย่างน้อย 1 slot", statusSeen["平"] > 0, JSON.stringify(statusSeen));
check("สแกนเจอเคส 落/陷 จริง (ยืนยันโทษ -6 ยังทำงาน)", statusSeen.weak > 0, JSON.stringify(statusSeen));
console.log(`  เจอ: 平=${statusSeen["平"]} · 落/陷=${statusSeen.weak} · ได้กำลัง=${statusSeen.strong} (จาก ${scanDates.length * 6} slots)`);

// =====================================================================
// Section 4 · goTianxing ใช้พิกัดสถานที่งานจริง (จำลอง DOM/vm จากโค้ดจริงใน datepick.html)
// =====================================================================
section("4 · goTianxing handoff พิกัดสถานที่งาน (vm + stub)");
const html = fs.readFileSync(path.join(ROOT, "public/datepick.html"), "utf8");
const fnMatch = html.match(/function goTianxing\(dtUTC, actName\)\{[\s\S]*?\n\}/);
check("พบ function goTianxing ใน datepick.html", !!fnMatch);
check("query string ไม่ hardcode กรุงเทพมหานคร แล้ว", !/encodeURIComponent\('กรุงเทพมหานคร'\)/.test(fnMatch?.[0] || ""));
check("goTianxing เรียก dpReadEventLocation", /dpReadEventLocation/.test(fnMatch?.[0] || ""));

function runGoTianxing(locProvider) {
  const captured = { session: null, href: null };
  const ctx = {
    sessionStorage: { setItem: (k, v) => { if (k === "hk_tianxing_handoff") captured.session = JSON.parse(v); } },
    location: {},
    Date, JSON, encodeURIComponent, isFinite, parseFloat,
  };
  Object.defineProperty(ctx.location, "href", { set(v) { captured.href = v; }, get() { return ""; } });
  if (locProvider !== undefined) ctx.dpReadEventLocation = locProvider;
  vm.createContext(ctx);
  vm.runInContext(fnMatch[0] + `\ngoTianxing('2026-09-15T03:00:00.000Z','แต่งงาน');`, ctx);
  return captured;
}
const LOCS = [
  { name: "เชียงใหม่", lat: 18.7883, lng: 98.9853 },
  { name: "ภูเก็ต", lat: 7.8804, lng: 98.3923 },
  { name: "ลอนดอน", lat: 51.5074, lng: -0.1278 },
];
for (const L of LOCS) {
  const cap = runGoTianxing(() => ({ place: L.name, lat: L.lat, lng: L.lng }));
  check(`handoff sessionStorage = ${L.name}`, cap.session && cap.session.lat === L.lat && cap.session.lng === L.lng && cap.session.place === L.name, JSON.stringify(cap.session));
  check(`URL query = ${L.name}`, cap.href && cap.href.includes(`lat=${L.lat}`) && cap.href.includes(`lng=${L.lng}`) && cap.href.includes(`place=${encodeURIComponent(L.name)}`), cap.href);
  check(`handoff activity คงเดิม (${L.name})`, cap.session && cap.session.activity && cap.session.activity.name === "แต่งงาน");
}
// ไม่กรอก → dpReadEventLocation คืน default กทม (พฤติกรรมจริงของฟังก์ชัน)
const capDefault = runGoTianxing(() => ({ place: "กรุงเทพมหานคร", lat: 13.7563, lng: 100.5018 }));
check("ไม่กรอกพิกัด → fallback กทม", capDefault.session && capDefault.session.lat === 13.7563 && capDefault.session.place === "กรุงเทพมหานคร", JSON.stringify(capDefault.session));
// ฟังก์ชันไม่มี (หน้าอื่น embed) → fallback กทม
const capMissing = runGoTianxing(undefined);
check("dpReadEventLocation ไม่มี → fallback กทม ไม่ crash", capMissing.session && capMissing.session.lat === 13.7563 && capMissing.href && capMissing.href.includes("lat=13.7563"), capMissing.href);
// ฟังก์ชัน throw → fallback กทม
const capThrow = runGoTianxing(() => { throw new Error("boom"); });
check("dpReadEventLocation throw → fallback กทม ไม่ crash", capThrow.session && capThrow.session.lat === 13.7563);
// คืนค่าเพี้ยน (NaN) → fallback กทม
const capNaN = runGoTianxing(() => ({ place: "x", lat: NaN, lng: 100 }));
check("พิกัด NaN → fallback กทม", capNaN.session && capNaN.session.lat === 13.7563);

// dpReadEventLocation ของจริง: ตรวจว่ามี fallback กทมในตัว (static)
check("dpReadEventLocation จริงมี EVENT_LOC_DEFAULT fallback", /return \{ \.\.\.EVENT_LOC_DEFAULT \}/.test(html));

// =====================================================================
// Section 5 · datepick.html inline JS ทุกก้อน syntax ผ่าน (vm.Script compile)
// =====================================================================
section("5 · datepick.html inline <script> syntax check");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
check("พบ inline script อย่างน้อย 1 ก้อน", scripts.length > 0, `count=${scripts.length}`);
let synErr = 0;
scripts.forEach((m, i) => {
  const body = m[1];
  if (!body.trim() || /application\/(ld\+)?json/.test(m[0])) return;
  try { new vm.Script(body); } catch (e) { synErr++; console.log(`  ❌ script #${i} syntax error: ${e.message}`); }
});
check("inline JS ทุกก้อน parse ผ่าน", synErr === 0, `${synErr} ก้อนพัง`);

// =====================================================================
// Summary
// =====================================================================
fs.rmSync(BUILD, { recursive: true, force: true });
console.log(`\n══════════════════════════════════════`);
console.log(`ผลรวม: ✅ ${passCount} ผ่าน · ❌ ${failCount} ตก`);
if (failures.length) { console.log("รายการตก:"); failures.slice(0, 30).forEach((f) => console.log("  - " + f)); }
process.exit(failCount === 0 ? 0 : 1);
