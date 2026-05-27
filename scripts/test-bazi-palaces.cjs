/**
 * Standalone CJS test · 5 เรือนปาจื้อ (胎元/命宮/身宮/司令/小運)
 * โครงเดียวกับ test-bazi-calc.cjs · ใช้ tyme4ts คำนวณ 4 เสาจริง → ป้อนสูตรเรือน
 * เฟส 1 (27 พ.ค.): 胎元 เท่านั้น · เรือนอื่นเติมเมื่อ implement (命宮 รอซินแสฟันธงนับยาม)
 * golden: ไฟล์ Five-Component School Comparison (Aeaw/Mai)
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
function monthPillar(year, month, day, hour, minute) {
  const ec = tyme.SolarTime.fromYmdHms(year, month, day, hour, minute, 0).getLunarHour().getEightChar();
  return ec.getMonth().getName();
}

/* ── 胎元: 月干進一位、月支進三位 (子平 · ทุกสำนักตรงกัน) ── */
const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
function conceptionPalace(monthGZ) {
  const ms = monthGZ[0], mb = monthGZ[1];
  const s = STEMS[(STEMS.indexOf(ms) + 1) % 10];
  const b = BRANCHES[(BRANCHES.indexOf(mb) + 3) % 12];
  return s + b;
}

const cases = [
  { name: "Aeaw 1984-12-31 13:15 Bangkok", input: { year: 1984, month: 12, day: 31, hour: 13, minute: 15, longitude: 100.5018 }, taiYuan: "丁卯" },
  { name: "Mai 1986-04-12 16:42 Bangkok", input: { year: 1986, month: 4, day: 12, hour: 16, minute: 42, longitude: 100.5018 }, taiYuan: "癸未" },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const tst = applyTST(c.input);
  const mGZ = monthPillar(c.input.year, c.input.month, c.input.day, tst.appliedHour, tst.appliedMinute);
  const tai = conceptionPalace(mGZ);
  const ok = tai === c.taiYuan;
  console.log(`\n${ok ? '✅' : '❌'} ${c.name}`);
  console.log(`  เสาเดือน(tyme4ts): ${mGZ}`);
  console.log(`  胎元: got ${tai} · expect ${c.taiYuan}`);
  if (ok) pass++; else fail++;
}
console.log(`\n[胎元] ${pass}/${cases.length} passed`);
process.exit(fail === 0 ? 0 : 1);
