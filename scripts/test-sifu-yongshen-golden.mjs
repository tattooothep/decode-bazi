/* Golden baseline: 用神/喜/忌 + structure.label/confidence ของดวงอ้างอิง
 * วัตถุประสงค์: จับ regression — Phase 1-4 (anti-sycophancy / confidence / evidence-trace / YONG_LOCK)
 *   ต้องไม่ทำให้ usefulGods + structure.label/confidence ของดวงเดิม "เปลี่ยนค่า"
 * ไม่พึ่ง DB user จริง (synthetic birth input เท่านั้น)
 * รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-sifu-yongshen-golden.mjs
 */
import { calcBazi } from "../src/lib/bazi-calc.ts";
import { buildChartExtensions } from "../src/lib/chart-extensions.ts";
import { buildStructuredChartPacket } from "../src/lib/chart-packet.ts";

let pass = 0, fail = 0;
function ok(desc, cond, got) {
  console.log(`${cond ? "✓" : "✗"} ${desc}${cond ? "" : `  → got: ${got}`}`);
  cond ? pass++ : fail++;
}

async function buildFor({ date, time, gender = "F", longitude = 100.5018 }) {
  const calc = await calcBazi({
    date, time, longitude, gmtOffsetHours: 7, gender,
    dayBoundary: "00:00", birthTimeKnown: true,
  });
  const birthDate = new Date(`${date}T${time}:00+07:00`);
  const today = new Date("2026-06-09T12:00:00+07:00");
  const ageNow = 2026 - Number(date.slice(0, 4));
  const ext = buildChartExtensions(
    calc.pillars, today, gender, birthDate, ageNow,
    calc.geJu.structure, calc.strength.percent,
    calc.yongshen[0]?.element, calc.yongshen.map((x) => x.element),
  );
  const packet = buildStructuredChartPacket(
    calc, ext, calc.dayMaster, ageNow, {}, null, gender, null,
    { dayBoundary: "00:00", dayBoundarySource: "explicit" },
  );
  return { calc, packet };
}

const pillarStr = (pl) =>
  `${pl.year.stem}${pl.year.branch}/${pl.month.stem}${pl.month.branch}/${pl.day.stem}${pl.day.branch}/${pl.hour.stem}${pl.hour.branch}`;

function snap(label, calc, packet) {
  const u = packet.usefulGods, s = packet.structure;
  console.log(`\n— ${label} — ${pillarStr(calc.pillars)}`);
  console.log(`  structure : ${s?.label} (confidence=${s?.confidence})`);
  console.log(`  用神 yong : ${JSON.stringify(u.yong)} · 喜=${JSON.stringify(u.xi)} · 忌=${JSON.stringify(u.ji)}`);
  return { pillars: pillarStr(calc.pillars), yong: u.yong, xi: u.xi, ji: u.ji, label: s?.label, confidence: s?.confidence };
}

// reverse malika3: 庚午/戊寅/丁未/甲辰 (女命 丁火 · 辰時 08:00) → หาวันใน 1990 เดือน寅
async function findMalika() {
  for (let mon = 2; mon <= 3; mon++) {
    const maxd = mon === 2 ? 28 : 31;
    for (let day = 1; day <= maxd; day++) {
      const date = `1990-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const calc = await calcBazi({
        date, time: "08:00", longitude: 100.5018, gmtOffsetHours: 7,
        gender: "F", dayBoundary: "00:00", birthTimeKnown: true,
      });
      if (pillarStr(calc.pillars) === "庚午/戊寅/丁未/甲辰") return { date, time: "08:00" };
    }
  }
  return null;
}

const baseline = {};

{
  const { calc, packet } = await buildFor({ date: "1984-12-31", time: "13:15", gender: "F" });
  baseline.aeaw = snap("Aeaw", calc, packet);
}
{
  const { calc, packet } = await buildFor({ date: "1986-04-12", time: "16:42", gender: "F" });
  baseline.mai = snap("Mai", calc, packet);
}
{
  const found = await findMalika();
  ok("malika3 birth reverse-found (1990 寅月 辰時)", !!found, "not found");
  if (found) {
    const { calc, packet } = await buildFor({ ...found, gender: "F" });
    ok("malika3 pillars = 庚午/戊寅/丁未/甲辰", pillarStr(calc.pillars) === "庚午/戊寅/丁未/甲辰", pillarStr(calc.pillars));
    baseline.malika = { birth: found, ...snap(`malika3 (${found.date} ${found.time})`, calc, packet) };
  }
}

console.log("\n===== BASELINE SNAPSHOT =====");
console.log(JSON.stringify(baseline, null, 2));

/* ── GOLDEN ASSERT · ล็อกค่า ณ 9 มิ.ย. 2026 (ก่อน Phase 1-4) ──
 * ถ้า Phase ใดทำให้ usefulGods/label/confidence ของดวงเดิม "เปลี่ยน" = regression = ห้าม
 * (Phase 2 จะ "เพิ่ม" field confidence ใหม่ได้ แต่ห้ามแก้ค่า yong/xi/ji/label/confidence เดิม) */
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const GOLDEN = {
  aeaw:   { pillars: "甲子/丙子/己亥/庚午", yong: ["fire"], xi: ["wood"], ji: ["earth", "metal", "water"], label: "假從財格", confidence: "moderate" },
  mai:    { pillars: "丙寅/壬辰/丙戌/丙申", yong: ["fire"], xi: ["wood"], ji: ["earth", "metal", "water"], label: "雜氣正印格", confidence: "moderate" },
  malika: { pillars: "庚午/戊寅/丁未/甲辰", yong: ["wood"], xi: ["earth"], ji: ["fire", "metal", "water"], label: "正印格", confidence: "moderate" },
};
console.log("\n===== GOLDEN ASSERT =====");
for (const k of Object.keys(GOLDEN)) {
  const g = GOLDEN[k], b = baseline[k] || {};
  for (const f of ["pillars", "yong", "xi", "ji", "label", "confidence"]) {
    ok(`${k}.${f} == golden`, eq(b[f], g[f]), JSON.stringify(b[f]));
  }
}
console.log(`\n=== ${pass}/${pass + fail} ${fail ? "❌ FAIL" : "✅ PASS"} ===`);
process.exit(fail ? 1 : 0);
