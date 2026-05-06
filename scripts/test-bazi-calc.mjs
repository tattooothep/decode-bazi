/**
 * Regression test · Layer 0 helper
 * เทียบ Aeaw 1984-12-31 13:15 Bangkok (lng 100.5018) กับ Voytek
 * Expected: Hour 庚午 · Day 己亥 · Month 丙子 · Year 甲子
 */

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Use tsx runtime to load .ts file
const cases = [
  {
    name: "Aeaw 1984-12-31 13:15 Bangkok",
    input: { date: "1984-12-31", time: "13:15", longitude: 100.5018, gender: "M" },
    expect: {
      hour:  "庚午",
      day:   "己亥",
      month: "丙子",
      year:  "甲子",
    },
  },
  {
    name: "Mai 1986-04-12 16:42 Bangkok",
    input: { date: "1986-04-12", time: "16:42", longitude: 100.5018, gender: "F" },
    expect: {
      hour:  "丙申",
      day:   "丙戌",
      month: "壬辰",
      year:  "丙寅",
    },
  },
];

const { calcBazi } = await import("../src/lib/bazi-calc.ts").catch(async () => {
  // Fallback: compile via esbuild on the fly (Node 22 supports --experimental-strip-types)
  const { calcBazi } = await import("../src/lib/bazi-calc.ts");
  return { calcBazi };
});

let pass = 0, fail = 0;
for (const c of cases) {
  const r = await calcBazi(c.input);
  const got = r.pillarsZh;
  const ok =
    got.hour === c.expect.hour &&
    got.day === c.expect.day &&
    got.month === c.expect.month &&
    got.year === c.expect.year;
  console.log(`\n${ok ? "✅" : "❌"} ${c.name}`);
  console.log(`  expect: H ${c.expect.hour} · D ${c.expect.day} · M ${c.expect.month} · Y ${c.expect.year}`);
  console.log(`  got:    H ${got.hour} · D ${got.day} · M ${got.month} · Y ${got.year}`);
  console.log(`  TST:    ${r.tst.appliedTimeStr} (shift ${r.tst.totalShiftMin} min)`);
  console.log(`  ge_ju:  ${r.geJu.structure}`);
  if (ok) pass++; else fail++;
}

console.log(`\n${pass}/${cases.length} passed`);
process.exit(fail === 0 ? 0 : 1);
