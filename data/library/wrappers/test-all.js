/**
 * Run all 6 wrapper unit tests
 * Usage: node test-all.js
 */

const w1 = require('./1-stem-branch-matrix');
const w2 = require('./2-hs-hhs-combo');
const w3 = require('./3-ge-ju');
const w4 = require('./4-useful-god');
const w5 = require('./5-tiao-hou');
const w6 = require('./6-strength-yongshen');

console.log('═══════════════════════════════════════════════════════');
console.log('  6 WRAPPER · UNIT TEST RUNNER');
console.log('═══════════════════════════════════════════════════════');

const results = [];
results.push(['1. Stem/Branch Matrix', w1.runAll()]);
results.push(['2. HS+HHS Combination', w2.runAll()]);
results.push(['3. Ge Ju Inference',    w3.runAll()]);
results.push(['4. Useful God 5-rank',  w4.runAll()]);
results.push(['5. Tiao Hou Climate',   w5.runAll()]);
results.push(['6. Strength + Yongshen Bridge', w6.runAll()]);

console.log('\n═══════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════');
let pass = 0;
for (const [name, ok] of results) {
  console.log(`  ${ok ? '✅' : '❌'}  ${name}`);
  if (ok) pass++;
}
console.log(`\n  ${pass}/${results.length} wrapper passed\n`);
process.exit(pass === results.length ? 0 : 1);
