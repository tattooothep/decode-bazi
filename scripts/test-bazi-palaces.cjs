/**
 * Standalone CJS test · 5 เรือนปาจื้อ (胎元/命宮/身宮/司令/小運)
 * โครงเดียวกับ test-bazi-calc.cjs · ใช้ tyme4ts คำนวณ 4 เสาจริง → ป้อนสูตรเรือน
 * เฟส 1-2 (27 พ.ค.): 胎元 + 命宮 + 身宮 · (司令/小運 เติมเฟสถัดไป)
 * golden: Five-Component School Comparison + สูตร命宮 卯安命節氣法 (เจ้านายยืนยัน + worked example)
 */
const tyme = require('tyme4ts');

function applyTST({ year, month, day, hour, minute, longitude, gmtOffsetHours = 7 }) {
  const standardMeridian = gmtOffsetHours * 15;
  const dt = new Date(Date.UTC(year, month - 1, day, hour - gmtOffsetHours, minute, 0));
  const dayOfYear = Math.floor((dt.getTime() - Date.UTC(dt.getUTCFullYear(), 0, 0)) / 86400000);
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const eotMin = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const totalMin = hour * 60 + minute + (longitude - standardMeridian) * 4 + eotMin;
  let h = Math.floor(totalMin / 60), m = Math.floor(totalMin - h * 60);
  if (h < 0) h += 24; if (h >= 24) h -= 24; if (m < 0) m += 60;
  return { appliedHour: h, appliedMinute: m };
}
function pillars(year, month, day, hour, minute) {
  const ec = tyme.SolarTime.fromYmdHms(year, month, day, hour, minute, 0).getLunarHour().getEightChar();
  return { year: ec.getYear().getName(), month: ec.getMonth().getName(), day: ec.getDay().getName(), hour: ec.getHour().getName() };
}

const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const Bi = {}; BRANCHES.forEach((b, i) => Bi[b] = i);

/* 胎元: 月干進一/月支進三 */
function conceptionPalace(mGZ) {
  return STEMS[(STEMS.indexOf(mGZ[0]) + 1) % 10] + BRANCHES[(Bi[mGZ[1]] + 3) % 12];
}
/* 五虎遁年起月 */
function tiger(ys, tb) {
  const start = { 甲: 2, 己: 2, 乙: 4, 庚: 4, 丙: 6, 辛: 6, 丁: 8, 壬: 8, 戊: 0, 癸: 0 }[ys];
  return STEMS[(start + ((Bi[tb] - 2 + 12) % 12)) % 10];
}
/* 命宮: 子平 卯安命節氣法 (4−M−H) · M=เดือน寅=1 · H=ยาม子=0 */
function lifePalaceBranch(mb, hb) {
  const M = ((Bi[mb] - 2 + 12) % 12) + 1;
  const H = Bi[hb];
  return BRANCHES[(((4 - M - H) % 12) + 12) % 12];
}
function lifePalace(ys, mb, hb) { const b = lifePalaceBranch(mb, hb); return tiger(ys, b) + b; }
function bodyPalace(ys, mb, hb) { const b = BRANCHES[(Bi[lifePalaceBranch(mb, hb)] + 6) % 12]; return tiger(ys, b) + b; }

/* 司令 子平真詮 half-open + 節氣 (ICT→BJT +1h) */
const SILING = { 子: [["壬", 10], ["癸", 20]], 丑: [["癸", 9], ["辛", 3], ["己", 18]], 寅: [["戊", 7], ["丙", 7], ["甲", 16]], 卯: [["甲", 10], ["乙", 20]], 辰: [["乙", 9], ["癸", 3], ["戊", 18]], 巳: [["戊", 7], ["庚", 7], ["丙", 16]], 午: [["丙", 9], ["己", 10], ["丁", 11]], 未: [["丁", 9], ["乙", 3], ["己", 18]], 申: [["戊", 7], ["壬", 7], ["庚", 16]], 酉: [["庚", 10], ["辛", 20]], 戌: [["辛", 9], ["丁", 3], ["戊", 18]], 亥: [["戊", 7], ["甲", 5], ["壬", 18]] };
function siLingDays(y, mo, d, h, mi) {
  const st = tyme.SolarTime.fromYmdHms(y, mo, d, h + 1, mi, 0);
  let term = st.getTerm();
  for (let i = 0; i < 3 && !term.isJie(); i++) term = term.next(-1);
  return st.subtract(term.getJulianDay().getSolarTime()) / 86400;
}
function siling(mb, days) { let acc = 0; for (const [s, n] of SILING[mb]) { if (days < acc + n) return s; acc += n; } return SILING[mb][SILING[mb].length - 1][0]; }
/* 小運 Option B: age1=時柱เอง · 陽男陰女順 / 陰男陽女逆 */
function minorLuckAge1(ys, hourGZ, gender) {
  const yang = STEMS.indexOf(ys) % 2 === 0;
  const forward = (yang && gender === "M") || (!yang && gender === "F");
  return { age1: hourGZ, dir: forward ? "順" : "逆" };
}

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = got === exp;
  console.log(`  ${ok ? '✅' : '❌'} ${label}: got ${got} · expect ${exp}`);
  if (ok) pass++; else fail++;
}

console.log("=== worked example ตำรา (命宮支) ===");
check("午月酉時→支", lifePalaceBranch("午", "酉"), "寅");
check("巳月未時→支", lifePalaceBranch("巳", "未"), "巳");

console.log("\n=== Aeaw 1984-12-31 13:15 Bangkok ===");
{
  const tst = applyTST({ year: 1984, month: 12, day: 31, hour: 13, minute: 15, longitude: 100.5018 });
  const p = pillars(1984, 12, 31, tst.appliedHour, tst.appliedMinute);
  console.log(`  4 เสา: 年${p.year} 月${p.month} 日${p.day} 時${p.hour}`);
  check("胎元", conceptionPalace(p.month), "丁卯");
  check("命宮", lifePalace(p.year[0], p.month[1], p.hour[1]), "乙亥");
  check("身宮", bodyPalace(p.year[0], p.month[1], p.hour[1]), "己巳");
  check("司令", siling(p.month[1], siLingDays(1984, 12, 31, 13, 15)), "癸");
  check("小運age1", minorLuckAge1(p.year[0], p.hour, "M").age1, "庚午");
}
console.log("\n=== Mai 1986-04-12 16:42 Bangkok ===");
{
  const tst = applyTST({ year: 1986, month: 4, day: 12, hour: 16, minute: 42, longitude: 100.5018 });
  const p = pillars(1986, 4, 12, tst.appliedHour, tst.appliedMinute);
  console.log(`  4 เสา: 年${p.year} 月${p.month} 日${p.day} 時${p.hour}`);
  check("胎元", conceptionPalace(p.month), "癸未");
  check("命宮", lifePalace(p.year[0], p.month[1], p.hour[1]), "癸巳");
  check("身宮", bodyPalace(p.year[0], p.month[1], p.hour[1]), "己亥");
  check("司令", siling(p.month[1], siLingDays(1986, 4, 12, 16, 42)), "乙");
  check("小運age1", minorLuckAge1(p.year[0], p.hour, "F").age1, "丙申");
}

console.log("\n=== 3 ดวงทดสอบ 司令 (แยกสำนัก 子平真詮 ≠ 三命通會) ===");
for (const [n, y, mo, d, h, mi, mb, exp] of [["巳1990", 1990, 5, 12, 9, 0, "巳", "戊"], ["午1995", 1995, 6, 15, 22, 42, "午", "己"], ["申1988", 1988, 8, 9, 8, 20, "申", "戊"]]) {
  check(`司令 ${n}`, siling(mb, siLingDays(y, mo, d, h, mi)), exp);
}

console.log(`\n[5 เรือนครบ 胎元+命宮+身宮+司令+小運] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
