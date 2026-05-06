/**
 * Follow detector · sensitivity dry-run
 * ห้ามแก้ production · เขียน scenarios แยก
 *
 * Scenarios:
 *   Base : threshold 35% (production ปัจจุบัน)
 *   A    : threshold 30%
 *   B    : threshold 30% + DM month-phase = extreme weak (絕/胎/死/病) → bump false_follow
 */
const S = require('../data/library/wrappers/shared.js');
const { detectFollow } = require('../data/library/wrappers/follow-detector.js');

const EXTREME_WEAK_PHASES = ['絕','胎','死','病'];

// Reuse detector logic but with overrideable threshold + phase factor
function dmRootCount(natal) {
  const dmEl = S.STEM_ELEMENT[natal.day.stem];
  let count = 0;
  for (const pos of ['year','month','day','hour']) {
    const hidden = S.HIDDEN_STEMS[natal[pos].branch] || {};
    for (const slot of ['main','middle','residual']) {
      if (hidden[slot] && S.STEM_ELEMENT[hidden[slot]] === dmEl) count++;
    }
  }
  return count;
}
function elementCounts(natal) {
  const c = { wood:0,fire:0,earth:0,metal:0,water:0 };
  for (const pos of ['year','month','day','hour']) {
    if (pos !== 'day') c[S.STEM_ELEMENT[natal[pos].stem]] += 1;
    c[S.BRANCH_ELEMENT[natal[pos].branch]] += 1;
    const hidden = S.HIDDEN_STEMS[natal[pos].branch] || {};
    for (const slot of ['main','middle','residual']) {
      if (hidden[slot]) c[S.STEM_ELEMENT[hidden[slot]]] += 0.4;
    }
  }
  return c;
}
function resourceExists(natal) {
  const dmEl = S.STEM_ELEMENT[natal.day.stem];
  const resourceEl = Object.entries(S.ELEMENT_PRODUCES).find(([_,v]) => v === dmEl)?.[0];
  if (!resourceEl) return false;
  for (const pos of ['year','month','hour']) {
    if (S.STEM_ELEMENT[natal[pos].stem] === resourceEl) return true;
    const hidden = S.HIDDEN_STEMS[natal[pos].branch] || {};
    if (hidden.main && S.STEM_ELEMENT[hidden.main] === resourceEl) return true;
  }
  return false;
}
function biJieExists(natal) {
  const dmEl = S.STEM_ELEMENT[natal.day.stem];
  for (const pos of ['year','month','hour']) {
    if (S.STEM_ELEMENT[natal[pos].stem] === dmEl) return true;
    const hidden = S.HIDDEN_STEMS[natal[pos].branch] || {};
    if (hidden.main && S.STEM_ELEMENT[hidden.main] === dmEl) return true;
  }
  return false;
}
function dmMonthPhase(natal) {
  return S.twelvePhase(natal.day.stem, natal.month.branch) || '—';
}
function dominantShare(natal) {
  const counts = elementCounts(natal);
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  const dmEl = S.STEM_ELEMENT[natal.day.stem];
  let topShare = 0;
  for (const [el, n] of Object.entries(counts)) {
    if (el === dmEl) continue;
    const share = n / total;
    if (share > topShare) topShare = share;
  }
  return Math.round(topShare * 100);
}
function dmShare(natal) {
  const counts = elementCounts(natal);
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  return Math.round((counts[S.STEM_ELEMENT[natal.day.stem]] / total) * 100);
}

// Override classifier per scenario
function classify(natal, opts) {
  const root = dmRootCount(natal);
  const resource = resourceExists(natal);
  const biJie = biJieExists(natal);
  const dom = dominantShare(natal);
  const dms = dmShare(natal);
  const phase = dmMonthPhase(natal);
  const phaseExtremeWeak = EXTREME_WEAK_PHASES.includes(phase);
  const hasSubtle = root > 0 || resource || biJie;

  let type, conf;
  if (root === 0 && !resource && !biJie && dom >= 55 && dms <= 8) {
    type = 'true_follow'; conf = Math.min(95, 50 + dom);
  } else if (dms <= 12 && dom >= opts.followLowerBound && hasSubtle) {
    type = 'false_follow'; conf = 50 + Math.min(30, (dom - opts.followLowerBound));
  } else if (root >= 1 && dom < opts.followLowerBound) {
    type = 'weak_normal'; conf = 70;
  } else if (dom >= opts.followLowerBound && dom < 55) {
    type = 'ambiguous'; conf = 40;
  } else {
    type = 'weak_normal'; conf = 50;
  }

  // Scenario B: extreme weak phase boost
  if (opts.usePhaseFactor && phaseExtremeWeak && dms <= 12 && dom >= opts.followLowerBound && (resource || biJie || root === 1)) {
    if (type === 'weak_normal' || type === 'ambiguous') {
      type = 'false_follow';
      conf = Math.min(85, conf + 20);
    } else if (type === 'false_follow') {
      conf = Math.min(90, conf + 15);
    }
  }

  return { type, conf, root, resource, biJie, dom, dms, phase, phaseExtremeWeak };
}

const CHARTS = [
  { id:'Aeaw',     pillars:{ year:{stem:'甲',branch:'子'}, month:{stem:'丙',branch:'子'}, day:{stem:'己',branch:'亥'}, hour:{stem:'庚',branch:'午'} } },
  { id:'NightNew', pillars:{ year:{stem:'甲',branch:'子'}, month:{stem:'丙',branch:'子'}, day:{stem:'己',branch:'亥'}, hour:{stem:'庚',branch:'午'} } },
  { id:'Pun',      pillars:{ year:{stem:'甲',branch:'辰'}, month:{stem:'庚',branch:'午'}, day:{stem:'壬',branch:'寅'}, hour:{stem:'乙',branch:'巳'} } },
  { id:'Mai',      pillars:{ year:{stem:'丙',branch:'寅'}, month:{stem:'壬',branch:'辰'}, day:{stem:'丙',branch:'戌'}, hour:{stem:'丙',branch:'申'} } },
  { id:'Keng',     pillars:{ year:{stem:'丁',branch:'卯'}, month:{stem:'丁',branch:'未'}, day:{stem:'戊',branch:'寅'}, hour:{stem:'癸',branch:'亥'} } },
  { id:'Shogun',   pillars:{ year:{stem:'甲',branch:'辰'}, month:{stem:'壬',branch:'申'}, day:{stem:'壬',branch:'申'}, hour:{stem:'乙',branch:'巳'} } },
  { id:'p1',       pillars:{ year:{stem:'己',branch:'巳'}, month:{stem:'丁',branch:'丑'}, day:{stem:'庚',branch:'辰'}, hour:{stem:'辛',branch:'巳'} } },
  { id:'p2',       pillars:{ year:{stem:'庚',branch:'午'}, month:{stem:'戊',branch:'寅'}, day:{stem:'辛',branch:'亥'}, hour:{stem:'癸',branch:'巳'} } },
  { id:'Tik',      pillars:{ year:{stem:'乙',branch:'丑'}, month:{stem:'己',branch:'丑'}, day:{stem:'乙',branch:'卯'}, hour:{stem:'己',branch:'卯'} } },
  { id:'AubMax6',  pillars:{ year:{stem:'癸',branch:'卯'}, month:{stem:'丁',branch:'巳'}, day:{stem:'辛',branch:'酉'}, hour:{stem:'甲',branch:'午'} } },
  { id:'AubMax7',  pillars:{ year:{stem:'癸',branch:'卯'}, month:{stem:'戊',branch:'午'}, day:{stem:'辛',branch:'卯'}, hour:{stem:'甲',branch:'午'} } },
  { id:'Pa',       pillars:{ year:{stem:'甲',branch:'辰'}, month:{stem:'甲',branch:'戌'}, day:{stem:'甲',branch:'寅'}, hour:{stem:'乙',branch:'巳'} } },
  { id:'Dohk1950', pillars:{ year:{stem:'庚',branch:'寅'}, month:{stem:'壬',branch:'午'}, day:{stem:'戊',branch:'戌'}, hour:{stem:'戊',branch:'午'} } },
  { id:'Dohk1967', pillars:{ year:{stem:'丁',branch:'未'}, month:{stem:'庚',branch:'戌'}, day:{stem:'癸',branch:'酉'}, hour:{stem:'戊',branch:'午'} } },
  { id:'Hokf1987', pillars:{ year:{stem:'丁',branch:'卯'}, month:{stem:'庚',branch:'戌'}, day:{stem:'戊',branch:'午'}, hour:{stem:'戊',branch:'午'} } },
];

const SCENARIOS = {
  Base: { followLowerBound: 35, usePhaseFactor: false },
  A:    { followLowerBound: 30, usePhaseFactor: false },
  B:    { followLowerBound: 30, usePhaseFactor: true  },
};

console.log('═══ PUN FIELD-LEVEL (production · current) ═══');
const pun = CHARTS.find(c => c.id === 'Pun');
const punFull = detectFollow(pun.pillars);
console.log(JSON.stringify(punFull, null, 2));

console.log('\n═══ SENSITIVITY · 15 charts × 3 scenarios ═══');
const header = 'chart        | DM | base                        | A (≥30%)                    | B (≥30% +phase)             | dom% dm% root res biJie phase     changed';
console.log(header);
console.log('-'.repeat(header.length));

let changedA = 0, changedB = 0;
for (const c of CHARTS) {
  const b = classify(c.pillars, SCENARIOS.Base);
  const a = classify(c.pillars, SCENARIOS.A);
  const x = classify(c.pillars, SCENARIOS.B);
  const ch = (b.type !== a.type ? 'A' : '') + (b.type !== x.type ? 'B' : '');
  if (b.type !== a.type) changedA++;
  if (b.type !== x.type) changedB++;
  const fmt = (r) => `${r.type}/${r.conf}`.padEnd(28);
  console.log(`${c.id.padEnd(12)} | ${c.pillars.day.stem}  | ${fmt(b)} | ${fmt(a)} | ${fmt(x)} | ${String(b.dom).padStart(3)}% ${String(b.dms).padStart(3)}% ${b.root}    ${b.resource?'Y':'·'}   ${b.biJie?'Y':'·'}     ${b.phase.padEnd(4)}${b.phaseExtremeWeak?'⚠':' '} ${ch}`);
}

console.log('\n═══ SUMMARY ═══');
console.log(`  Charts changed Base→A: ${changedA}/15`);
console.log(`  Charts changed Base→B: ${changedB}/15`);
console.log('');

// Distribution per scenario
for (const [name, opts] of Object.entries(SCENARIOS)) {
  const dist = { true_follow:0, false_follow:0, weak_normal:0, ambiguous:0 };
  for (const c of CHARTS) dist[classify(c.pillars, opts).type]++;
  console.log(`  ${name.padEnd(5)}: true=${dist.true_follow} false=${dist.false_follow} weak=${dist.weak_normal} amb=${dist.ambiguous}`);
}

// Pun specific
console.log('\n═══ PUN COMPARISON ═══');
const punB = classify(pun.pillars, SCENARIOS.Base);
const punA = classify(pun.pillars, SCENARIOS.A);
const punX = classify(pun.pillars, SCENARIOS.B);
console.log(`  Base : ${punB.type} (conf ${punB.conf}) · phase=${punB.phase}`);
console.log(`  A    : ${punA.type} (conf ${punA.conf})`);
console.log(`  B    : ${punX.type} (conf ${punX.conf})`);
console.log(`  Voytek: false-extreme-weak`);

// Aeaw specific
console.log('\n═══ AEAW COMPARISON ═══');
const aeaw = CHARTS.find(c => c.id === 'Aeaw');
const aB = classify(aeaw.pillars, SCENARIOS.Base);
const aA = classify(aeaw.pillars, SCENARIOS.A);
const aX = classify(aeaw.pillars, SCENARIOS.B);
console.log(`  Base : ${aB.type} (conf ${aB.conf}) · phase=${aB.phase}`);
console.log(`  A    : ${aA.type} (conf ${aA.conf})`);
console.log(`  B    : ${aX.type} (conf ${aX.conf})`);
console.log(`  DB   : 從財格 (engine wrapper 3)`);
