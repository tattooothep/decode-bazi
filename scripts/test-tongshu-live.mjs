#!/usr/bin/env node
/**
 * test-tongshu-live.mjs · r413 · ทดสอบ tongshu-live.ts (คำนวณสด 4 ศาสตร์通書)
 *
 * ตรวจ "อิสระจาก tyme4ts" ด้วยกฎตำราจริง (ไม่ใช่เทียบตัวเอง):
 *   A1 normalize ครบ — ทุกค่าเป็นอักษรตัวเต็มที่ star-dict-th.ts รู้จัก (ป้ายไทยไม่หาย)
 *   A2 建除 424 วัน = สูตรตำรา (dayBranch − monthBranch 節氣) + 疊建 ที่วัน交節 ทั้ง 24+ จุด
 *   A3 黃黑道 424 วัน = 口訣ตำรา (寅申起子 卯酉起寅 辰戌起辰 巳亥起午 子午起申 丑未起戌)
 *   A4 28宿 424 วัน = ตรงวันสัปดาห์ 七曜 (虛昴星房=อาทิตย์ ฯลฯ) + ต่อเนื่องวันละ 1 ดวง
 *   A5 紫白日 424 วัน = เดินทีละ 1 ตลอด · สลับ順/逆 เฉพาะใกล้ 冬至/夏至 (สาย通書)
 *   B  ตาราง 24 節氣 2026 (疊建) + 冬至/夏至 + ข้ามปี 立春 2027
 *   C  spot-check 12 วัน (รวม 3 จุดที่เจ้านายให้: 05ก.ค.天牢 · 01ส.ค.玄武 · 07ส.ค.執)
 *   D  เทียบ cache จริง (shichen=4 ทั้งปี 2026): shape ModuleResult ต้องเป๊ะ byte เมื่อดาวตรงกัน
 *      + สถิติ % ที่ cache ผิด (ยืนยัน audit)
 *   E  computeTongshuLiveForRow: แถว shichen=0 (晚子時) ผูก 干支 วันถัดไป → ต้องได้ค่าวันถัดไป
 *   F  perf: 30 วัน × 12 ยาม ต้องเสร็จรวม < 50ms
 *
 * รัน: node scripts/test-tongshu-live.mjs   (respawn ใส่ --experimental-strip-types ให้เอง)
 */
import { spawnSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __file = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__file), "..");

if (!process.execArgv.some((a) => a.includes("strip-types"))) {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", __file, ...process.argv.slice(2)], { stdio: "inherit", cwd: ROOT });
  process.exit(r.status ?? 1);
}

const { computeTongshuLive, computeTongshuLiveForRow, buildTongshuModuleResults } =
  await import(path.join(ROOT, "src/lib/luck-engine/tongshu-live.ts"));
const tyme = await import("tyme4ts");

let PASS = 0, FAIL = 0;
const bad = [];
function check(name, cond, detail = "") {
  if (cond) { PASS++; }
  else { FAIL++; bad.push(`${name} ${detail}`); console.log(`  ❌ ${name} ${detail}`); }
}
function section(t) { console.log(`\n━━━ ${t} ━━━`); }

const BR = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const JIAN_CHU = ["建","除","滿","平","定","執","破","危","成","收","開","閉"];
const SPIRITS = ["青龍","明堂","天刑","朱雀","金匱","天德","白虎","玉堂","天牢","玄武","司命","勾陳"];
const XIU = ["角","亢","氐","房","心","尾","箕","斗","牛","女","虛","危","室","壁","奎","婁","胃","昴","畢","觜","參","井","鬼","柳","星","張","翼","軫"];
const SPIRIT_START = { 寅:"子", 申:"子", 卯:"寅", 酉:"寅", 辰:"辰", 戌:"辰", 巳:"午", 亥:"午", 子:"申", 午:"申", 丑:"戌", 未:"戌" };
const JIE = new Set(["立春","驚蟄","惊蛰","清明","立夏","芒種","芒种","小暑","立秋","白露","寒露","立冬","大雪","小寒"]);
// 七曜ของ 28宿 · 角=พฤหัส(木) → ลำดับ 木金土日月火水 · getUTCDay: 0=อาทิตย์
const XIU_WEEKDAY = [4, 5, 6, 0, 1, 2, 3];

function iso(d) { return d.toISOString().slice(0, 10); }
function* dateRange(fromISO, toISO) {
  const d = new Date(fromISO + "T00:00:00Z");
  const end = new Date(toISO + "T00:00:00Z");
  while (d <= end) { yield new Date(d); d.setUTCDate(d.getUTCDate() + 1); }
}

// ── เตรียมข้อมูล 424 วัน (2026-01-01 → 2027-02-28 · คลุมข้ามปี + 立春 2027) ──
const FROM = "2026-01-01", TO = "2027-02-28";
const days = [];
{
  let monthBrIdx = 0; // 1 ม.ค. 2026 อยู่หลัง大雪 ก่อน小寒 = 子月
  for (const d of dateRange(FROM, TO)) {
    const [y, m, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
    const sd = tyme.SolarDay.fromYmd(y, m, dd);
    const td = sd.getTermDay();
    const termName = td.getSolarTerm().getName();
    const isJieStart = JIE.has(termName) && td.getDayIndex() === 0;
    if (isJieStart) monthBrIdx = (monthBrIdx + 1) % 12;
    const live = computeTongshuLive(iso(d));
    days.push({ date: iso(d), y, m, dd, live, monthBr: BR[monthBrIdx], monthBrIdx,
      isJieStart, termName, weekday: d.getUTCDay(), dayBrIdx: BR.indexOf(live.dayGanZhi[1]) });
  }
}

// ═══ A1 · normalize ครบ (ตัวเต็มทั้งหมด → ป้ายไทยใน star-dict-th ไม่หาย) ═══
section("A1 · normalize ตัวย่อ→ตัวเต็ม ครบทุกวัน");
{
  let ok = true;
  for (const d of days) {
    if (!JIAN_CHU.includes(d.live.officer)) { ok = false; check("A1 officer", false, `${d.date} ${d.live.officer}`); }
    if (!SPIRITS.includes(d.live.spirit)) { ok = false; check("A1 spirit", false, `${d.date} ${d.live.spirit}`); }
    if (!XIU.includes(d.live.xiu)) { ok = false; check("A1 xiu", false, `${d.date} ${d.live.xiu}`); }
    if (!(d.live.nineStar >= 1 && d.live.nineStar <= 9)) { ok = false; check("A1 nine", false, `${d.date} ${d.live.nineStar}`); }
  }
  check(`A1 ทุกค่า ${days.length} วัน เป็นตัวเต็มในชุดที่ระบบรู้จัก`, ok);
}

// ═══ A2 · 建除 = สูตรตำรา + 疊建 ═══
section("A2 · 建除 424 วัน เทียบสูตรตำรา (รู้疊建)");
{
  let mismatch = 0;
  for (const d of days) {
    const expect = JIAN_CHU[(d.dayBrIdx - d.monthBrIdx + 12) % 12];
    if (d.live.officer !== expect) { mismatch++; if (mismatch <= 5) console.log(`    ${d.date} live=${d.live.officer} ตำรา=${expect} (${d.monthBr}月${d.live.dayGanZhi})`); }
  }
  check(`A2 建除 ตรงสูตรตำรา ${days.length}/${days.length} วัน`, mismatch === 0, `(พลาด ${mismatch})`);
  // 疊建: ทุกวัน交節 officer ต้องซ้ำกับวันก่อนหน้า
  let stackOk = 0, stackBad = 0;
  for (let i = 1; i < days.length; i++) {
    if (!days[i].isJieStart) continue;
    if (days[i].live.officer === days[i - 1].live.officer) stackOk++;
    else { stackBad++; console.log(`    疊建พลาด ${days[i].date} ${days[i].termName}: ${days[i - 1].live.officer}→${days[i].live.officer}`); }
  }
  check(`A2 疊建 ครบทุกวัน交節 (${stackOk} จุด)`, stackBad === 0 && stackOk >= 13);
}

// ═══ A3 · 黃黑道 = 口訣ตำรา ═══
section("A3 · 黃黑道 424 วัน เทียบ口訣 (青龍起 子寅辰午申戌)");
{
  let mismatch = 0;
  for (const d of days) {
    const startIdx = BR.indexOf(SPIRIT_START[d.monthBr]);
    const expect = SPIRITS[(d.dayBrIdx - startIdx + 12) % 12];
    if (d.live.spirit !== expect) { mismatch++; if (mismatch <= 5) console.log(`    ${d.date} live=${d.live.spirit} ตำรา=${expect} (${d.monthBr}月${d.live.dayGanZhi})`); }
  }
  check(`A3 黃黑道 ตรง口訣 ${days.length}/${days.length} วัน`, mismatch === 0, `(พลาด ${mismatch})`);
}

// ═══ A4 · 28宿 = 七曜 weekday + ต่อเนื่อง ═══
section("A4 · 28宿 424 วัน เทียบวันสัปดาห์七曜 + ต่อเนื่อง");
{
  let wdBad = 0, contBad = 0;
  for (let i = 0; i < days.length; i++) {
    const xi = XIU.indexOf(days[i].live.xiu);
    if (XIU_WEEKDAY[xi % 7] !== days[i].weekday) { wdBad++; if (wdBad <= 5) console.log(`    ${days[i].date} ${days[i].live.xiu} ไม่ตรงวันสัปดาห์`); }
    if (i > 0) {
      const prev = XIU.indexOf(days[i - 1].live.xiu);
      if ((prev + 1) % 28 !== xi) contBad++;
    }
  }
  check(`A4 28宿 ตรง七曜 ${days.length}/${days.length} วัน`, wdBad === 0, `(พลาด ${wdBad})`);
  check("A4 28宿 เดินต่อเนื่องวันละ 1 ดวง", contBad === 0, `(สะดุด ${contBad})`);
}

// ═══ A5 · 紫白日 เดินทีละ 1 · สลับทิศใกล้ 二至 ═══
section("A5 · 紫白日 424 วัน · 順/逆 สาย通書");
{
  /* จุดสลับ 順↔逆 ของสาย通書 มี "วันซ้ำ" ที่รอยต่อ (เช่น …8,9 | 9,8,7… ใกล้夏至) = ถูกตำรา
     นอกจุดสลับ ทุกวันต้องเดินทีละ 1 (mod 9) เท่านั้น */
  const flips = [], repeats = [];
  let stepBad = 0, dir = 0; // +1 順 · -1 逆
  for (let i = 1; i < days.length; i++) {
    const a = days[i - 1].live.nineStar, b = days[i].live.nineStar;
    const up = (a % 9) + 1 === b, down = ((a + 7) % 9) + 1 === b;
    if (!up && !down) {
      if (a === b) { repeats.push(days[i].date); continue; } // วันซ้ำที่รอยต่อเปลี่ยนเข็ม
      stepBad++; console.log(`    ${days[i].date} step แปลก ${a}→${b}`); continue;
    }
    const d2 = up ? 1 : -1;
    if (dir !== 0 && d2 !== dir) flips.push(days[i].date);
    dir = d2;
  }
  check("A5 เดินทีละ 1 ทุกวัน (mod 9 · ยกเว้นวันซ้ำที่รอยต่อ)", stepBad === 0, `(พลาด ${stepBad})`);
  const solstices = ["2025-12-21", "2026-06-21", "2026-12-22"].map((s) => new Date(s + "T00:00:00Z").getTime());
  const nearSolstice = (dt) => solstices.some((s) => Math.abs(new Date(dt + "T00:00:00Z").getTime() - s) <= 35 * 86400000);
  const turns = [...flips, ...repeats];
  check(`A5 จุดสลับ順逆 ${turns.length} จุด (${turns.join(", ")}) ทุกจุดใกล้ 冬至/夏至 ±35 วัน`, turns.length >= 2 && turns.length <= 5 && turns.every(nearSolstice));
  check("A5 วันซ้ำเกิดเฉพาะรอยต่อเปลี่ยนเข็ม (≤3 จุด)", repeats.length <= 3 && repeats.every(nearSolstice));
}

// ═══ B · ตาราง節氣 + ข้ามปี ═══
section("B · วัน交節ทั้งหมดในช่วง (疊建) + 冬至/夏至 + ข้ามปี");
{
  console.log("  วัน交節     節氣   ก่อน→วันนั้น (建除)   黃黑道   28宿  紫白");
  for (let i = 1; i < days.length; i++) {
    if (!days[i].isJieStart) continue;
    const p = days[i - 1], c = days[i];
    console.log(`  ${c.date}  ${c.termName}   ${p.live.officer}→${c.live.officer} ${p.live.officer === c.live.officer ? "疊✓" : "✗"}        ${c.live.spirit}   ${c.live.xiu}   ${c.live.nineStar}`);
  }
  const feb3 = days.find((d) => d.date === "2027-02-03"), feb4 = days.find((d) => d.date === "2027-02-04");
  check("B 立春 2027 疊建 (03→04 ก.พ. = 建建)", feb3.live.officer === "建" && feb4.live.officer === "建");
  const dec31 = days.find((d) => d.date === "2026-12-31"), jan1 = days.find((d) => d.date === "2027-01-01");
  check("B ข้ามปี 28宿 ต่อเนื่อง 31ธ.ค.→1ม.ค.", (XIU.indexOf(dec31.live.xiu) + 1) % 28 === XIU.indexOf(jan1.live.xiu));
}

// ═══ C · spot-check 12 วัน (รวม 3 จุดจากเจ้านาย) ═══
section("C · spot-check เทียบ通書จริง 12 วัน");
{
  const spots = ["2026-07-05","2026-07-06","2026-07-07","2026-08-01","2026-08-07","2026-06-21","2026-09-15","2026-12-21","2026-12-22","2027-01-01","2027-02-03","2027-02-04"];
  console.log("  วันที่        干支   建除  黃黑道  28宿  紫白");
  for (const s of spots) {
    const v = computeTongshuLive(s);
    console.log(`  ${s}   ${v.dayGanZhi}   ${v.officer}    ${v.spirit}    ${v.xiu}    ${v.nineStar}`);
  }
  check("C 2026-07-05 黃黑道 = 天牢 (ไม่ใช่金匱)", computeTongshuLive("2026-07-05").spirit === "天牢");
  check("C 2026-08-01 黃黑道 = 玄武", computeTongshuLive("2026-08-01").spirit === "玄武");
  check("C 2026-08-07 建除 = 執 (立秋疊)", computeTongshuLive("2026-08-07").officer === "執");
  check("C 2026-07-07 建除 = 閉 (小暑疊กับ 06)", computeTongshuLive("2026-07-07").officer === "閉" && computeTongshuLive("2026-07-06").officer === "閉");
}

// ═══ D · เทียบ cache จริง: shape เป๊ะ + สถิติ % ผิด ═══
section("D · เทียบ aj_ephemeris_cache (shichen=4 ปี 2026): shape + % ผิด");
try {
  const out = execSync(
    `docker exec decode-postgres psql -U decode_user decode_db -t -A -F'\t' -c "SELECT date::text, twelve_officers::text, twelve_spirits::text, twenty_eight::text, nine_stars::text FROM aj_ephemeris_cache WHERE date BETWEEN '2026-01-01' AND '2026-12-31' AND shichen=4 ORDER BY date"`,
    { maxBuffer: 64 * 1024 * 1024 }).toString().trim().split("\n").filter(Boolean);
  let n = 0, offBad = 0, spBad = 0, xiuBad = 0, nineBad = 0;
  let shapeChecked = { off: 0, sp: 0, xiu: 0, nine: 0 }, shapeBad = 0;
  const deepEq = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  const sortKeys = (o) => (o && typeof o === "object" && !Array.isArray(o))
    ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]))
    : (Array.isArray(o) ? o.map(sortKeys) : o);
  for (const line of out) {
    const [date, offJ, spJ, xiuJ, nineJ] = line.split("\t");
    const cache = { off: JSON.parse(offJ), sp: JSON.parse(spJ), xiu: JSON.parse(xiuJ), nine: JSON.parse(nineJ) };
    const live = computeTongshuLive(date);
    const mods = buildTongshuModuleResults(live);
    n++;
    if (cache.off.raw.officer !== live.officer) offBad++;
    else { shapeChecked.off++; if (!deepEq(cache.off, mods.twelve_officers)) { shapeBad++; if (shapeBad <= 3) console.log(`    shape ต่าง (officer) ${date}`); } }
    if (cache.sp.raw.spirit !== live.spirit) spBad++;
    else { shapeChecked.sp++; if (!deepEq(cache.sp, mods.twelve_spirits)) { shapeBad++; if (shapeBad <= 3) console.log(`    shape ต่าง (spirit) ${date}`); } }
    if (cache.xiu.raw.star !== live.xiu) xiuBad++;
    else { shapeChecked.xiu++; if (!deepEq(cache.xiu, mods.twenty_eight)) { shapeBad++; if (shapeBad <= 3) console.log(`    shape ต่าง (xiu) ${date}`); } }
    if (Number(cache.nine.raw.star) !== live.nineStar) nineBad++;
    else { shapeChecked.nine++; if (!deepEq(cache.nine, mods.nine_stars)) { shapeBad++; if (shapeBad <= 3) console.log(`    shape ต่าง (nine) ${date}`); } }
  }
  console.log(`  cache ${n} วัน · cacheผิด: 建除 ${offBad} (${(offBad / n * 100).toFixed(0)}%) · 黃黑道 ${spBad} (${(spBad / n * 100).toFixed(0)}%) · 28宿 ${xiuBad} (${(xiuBad / n * 100).toFixed(0)}%) · 紫白 ${nineBad} (${(nineBad / n * 100).toFixed(0)}%)`);
  check("D มีข้อมูล cache ปี 2026 พอเทียบ (≥180 วัน · cache เป็น rolling window)", n >= 180, `(${n})`);
  check(`D shape ModuleResult เป๊ะ byte ทุกครั้งที่ดาวตรงกัน (เช็ค ${shapeChecked.off + shapeChecked.sp + shapeChecked.xiu + shapeChecked.nine} ก้อน)`, shapeBad === 0 && (shapeChecked.off + shapeChecked.sp + shapeChecked.xiu + shapeChecked.nine) > 50);
  check("D ยืนยัน audit: cache 黃黑道 ผิดมาก (>60%)", spBad / n > 0.6, `(${(spBad / n * 100).toFixed(0)}%)`);
  check("D ยืนยัน audit: cache 紫白 ผิดส่วนใหญ่ (>70%)", nineBad / n > 0.7, `(${(nineBad / n * 100).toFixed(0)}%)`);
} catch (e) {
  check("D เทียบ cache (psql)", false, e.message.split("\n")[0]);
}

// ═══ E · computeTongshuLiveForRow (晚子時 shichen=0) ═══
section("E · แถว shichen=0 (晚子時) ผูก 干支 วันถัดไป");
{
  const v = computeTongshuLiveForRow("2026-07-05", "辛巳"); // cache row shichen=0 ของ 05 ก.ค. ใช้ day_pillar 辛巳 (=06 ก.ค.)
  check("E rowGz=辛巳 → ได้ค่าวัน 06 ก.ค. (閉/玄武)", v.date === "2026-07-06" && v.officer === "閉" && v.spirit === "玄武");
  const w = computeTongshuLiveForRow("2026-07-05", "庚辰");
  check("E rowGz=庚辰 → ได้ค่าวัน 05 ก.ค. เดิม", w.date === "2026-07-05" && w.spirit === "天牢");
  const x = computeTongshuLiveForRow("2026-07-05", "甲甲"); // 干支มั่ว → fail-safe วันเดิม
  check("E rowGz ไม่ตรงทั้งคู่ → fail-safe วันเดิม", x.date === "2026-07-05");
}

// ═══ F · perf ═══
section("F · perf 30 วัน × 12 ยาม (360 calls · memoized)");
{
  const t0 = performance.now();
  for (let day = 1; day <= 30; day++) {
    for (let sc = 0; sc < 12; sc++) {
      const d = computeTongshuLiveForRow(`2026-09-${String(day).padStart(2, "0")}`, null);
      buildTongshuModuleResults(d);
    }
  }
  const ms = performance.now() - t0;
  console.log(`  360 calls = ${ms.toFixed(1)}ms`);
  check("F รวม < 50ms", ms < 50, `(${ms.toFixed(1)}ms)`);
}

// ═══ สรุป ═══
console.log(`\n══════ ผลรวม: ✅ ${PASS} ผ่าน · ${FAIL ? "❌ " + FAIL + " ตก" : "0 ตก"} ══════`);
if (bad.length) { console.log(bad.map((b) => "  - " + b).join("\n")); process.exit(1); }
