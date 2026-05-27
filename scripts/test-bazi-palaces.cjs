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
}
console.log("\n=== Mai 1986-04-12 16:42 Bangkok ===");
{
  const tst = applyTST({ year: 1986, month: 4, day: 12, hour: 16, minute: 42, longitude: 100.5018 });
  const p = pillars(1986, 4, 12, tst.appliedHour, tst.appliedMinute);
  console.log(`  4 เสา: 年${p.year} 月${p.month} 日${p.day} 時${p.hour}`);
  check("胎元", conceptionPalace(p.month), "癸未");
  check("命宮", lifePalace(p.year[0], p.month[1], p.hour[1]), "癸巳");
  check("身宮", bodyPalace(p.year[0], p.month[1], p.hour[1]), "己亥");
}

console.log(`\n[5 เรือน · เฟส 胎元+命宮+身宮] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
