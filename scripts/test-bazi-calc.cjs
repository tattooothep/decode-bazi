/**
 * Standalone CJS test · ใช้ tyme4ts + applyTST logic ลอกจาก src/lib
 * Verifies: TST → tyme4ts pillar = Voytek expected
 */

const tyme = require('tyme4ts');

function applyTST({ year, month, day, hour, minute, longitude, gmtOffsetHours = 7 }) {
  const standardMeridian = gmtOffsetHours * 15;
  const dt = new Date(Date.UTC(year, month - 1, day, hour - gmtOffsetHours, minute, 0));
  const dayOfYear = Math.floor((dt.getTime() - Date.UTC(dt.getUTCFullYear(),0,0)) / 86400000);
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const eotMin = 229.18 * (
    0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2*gamma) - 0.040849 * Math.sin(2*gamma)
  );
  const longitudeShiftMin = (longitude - standardMeridian) * 4;
  const totalShiftMin = longitudeShiftMin + eotMin;
  const totalMin = hour * 60 + minute + totalShiftMin;
  let appliedHour = Math.floor(totalMin / 60);
  let appliedMinute = Math.floor(totalMin - appliedHour * 60);
  if (appliedHour < 0) appliedHour += 24;
  if (appliedHour >= 24) appliedHour -= 24;
  if (appliedMinute < 0) appliedMinute += 60;
  return {
    appliedHour, appliedMinute,
    appliedTimeStr: `${String(appliedHour).padStart(2,'0')}:${String(appliedMinute).padStart(2,'0')}`,
    longitudeShiftMin: Math.round(longitudeShiftMin*10)/10,
    eotMin: Math.round(eotMin*10)/10,
    totalShiftMin: Math.round(totalShiftMin*10)/10,
  };
}

function pillarsAt(year, month, day, hour, minute) {
  const ec = tyme.SolarTime.fromYmdHms(year, month, day, hour, minute, 0).getLunarHour().getEightChar();
  return {
    year: ec.getYear().getName(),
    month: ec.getMonth().getName(),
    day: ec.getDay().getName(),
    hour: ec.getHour().getName(),
  };
}

const cases = [
  {
    name: "Aeaw 1984-12-31 13:15 Bangkok",
    input: { year: 1984, month: 12, day: 31, hour: 13, minute: 15, longitude: 100.5018 },
    expect: { hour: "庚午", day: "己亥", month: "丙子", year: "甲子" },
  },
  {
    name: "Mai 1986-04-12 16:42 Bangkok",
    input: { year: 1986, month: 4, day: 12, hour: 16, minute: 42, longitude: 100.5018 },
    expect: { hour: "丙申", day: "丙戌", month: "壬辰", year: "丙寅" },
  },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const tst = applyTST(c.input);
  const p = pillarsAt(c.input.year, c.input.month, c.input.day, tst.appliedHour, tst.appliedMinute);
  const ok = p.hour === c.expect.hour && p.day === c.expect.day && p.month === c.expect.month && p.year === c.expect.year;
  console.log(`\n${ok ? '✅' : '❌'} ${c.name}`);
  console.log(`  TST:    ${tst.appliedTimeStr} (shift ${tst.totalShiftMin} min · lng-corr ${tst.longitudeShiftMin} · eot ${tst.eotMin})`);
  console.log(`  expect: H ${c.expect.hour} · D ${c.expect.day} · M ${c.expect.month} · Y ${c.expect.year}`);
  console.log(`  got:    H ${p.hour} · D ${p.day} · M ${p.month} · Y ${p.year}`);
  if (ok) pass++; else fail++;
}

console.log(`\n${pass}/${cases.length} passed`);
process.exit(fail === 0 ? 0 : 1);
