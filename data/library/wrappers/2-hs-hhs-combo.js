/**
 * Wrapper 2 · HS + HHS Combination Detector
 *
 * เช็คว่า heavenly stem ของ pillar + main hidden stem ของ branch
 * รวมแล้วเกิด 5 stem combination ไหม
 *
 * Voytek แสดง "HS+HHS combination: fire/water/wood/etc" ทุก pillar
 * Decode ทำเหมือนกัน + บอก verdict + เหตุผล
 */

const S = require('./shared');
const { ELEMENT_NAME } = require('./narrative');

function detectHsHhsCombo(pillar, allChartBranches = []) {
  // pillar: {stem, branch}
  const hs  = pillar.stem;
  const hhs = S.HIDDEN_STEMS[pillar.branch]?.main;
  if (!hhs) return { hasCombo: false, reason: 'no main hidden stem' };

  // Check if HS + HHS form one of 5 combinations
  const key1 = hs + hhs;
  const key2 = hhs + hs;
  const combo = S.STEM_COMBOS[key1] || S.STEM_COMBOS[key2];
  if (!combo) {
    return { hasCombo:false, hs, hhs, reason:'not a combo pair' };
  }

  // Check if branch is in allowedBranches
  // → Voytek แสดงผลแม้ไม่ครบ allowedBranches (ถือเป็น "tendency")
  // เราคืน 2 levels: comboFormed (perfect) vs tendency (partial)
  const allBranches = allChartBranches.length ? allChartBranches : [pillar.branch];
  const branchSupported = combo.requiredBranches.some(b => allBranches.includes(b));

  return {
    hasCombo: true,
    hs,
    hhs,
    transformsTo: combo.transformsTo,
    transformsToName: ELEMENT_NAME[combo.transformsTo],
    branchSupported,
    strength: branchSupported ? 'transformation' : 'tendency',
    verdict: 'positive', // combo เป็นบวกเสมอตามคลาสสิก
    intensity: branchSupported ? 'strong' : 'mild',
    reason: branchSupported
      ? `${hs}+${hhs} 5合 → ${combo.transformsTo} (branches support)`
      : `${hs}+${hhs} 5合 tendency → ${combo.transformsTo} (no support branches)`,
  };
}

function buildHsHhsForChart(natal) {
  const positions = ['year','month','day','hour'];
  const branches = positions.map(p => natal[p].branch);
  const result = {};
  for (const pos of positions) {
    result[pos] = detectHsHhsCombo(natal[pos], branches);
  }
  result.summary = {
    combos_found: positions.filter(p => result[p].hasCombo).length,
    transformations: positions.filter(p => result[p].strength === 'transformation').length,
  };
  return result;
}

// ─── unit tests ──────────────────────────────────────────────
function testCases() {
  console.log('=== HS+HHS unit tests ===');

  // Test 1: 甲子 → HS=甲, HHS(子)=癸 → no combo
  const t1 = detectHsHhsCombo({stem:'甲',branch:'子'});
  console.log('  甲子: hasCombo =', t1.hasCombo, '(expect false)', t1.hasCombo===false?'✓':'✗');

  // Test 2: 丙子 → HS=丙, HHS(子)=癸 → no combo
  const t2 = detectHsHhsCombo({stem:'丙',branch:'子'});
  console.log('  丙子: hasCombo =', t2.hasCombo, '(expect false)', t2.hasCombo===false?'✓':'✗');

  // Test 3: 戊午 → HS=戊, HHS(午)=丁 → no (戊癸 needs 癸)
  const t3 = detectHsHhsCombo({stem:'戊',branch:'午'});
  console.log('  戊午: hasCombo =', t3.hasCombo, '(expect false)', t3.hasCombo===false?'✓':'✗');

  // Test 4: 丙申 → HS=丙, HHS(申)=庚 → no
  const t4 = detectHsHhsCombo({stem:'丙',branch:'申'});
  console.log('  丙申: hasCombo =', t4.hasCombo, '(expect false · 丙辛 not 丙庚)', t4.hasCombo===false?'✓':'✗');

  // Test 5: 丙辛 directly → HS=丙, HHS=辛 if branch=酉 → 丙+辛→水
  const t5 = detectHsHhsCombo({stem:'丙',branch:'酉'}, ['子','酉','辰','申']);
  console.log('  丙酉 with branches[子,酉,辰,申]: hasCombo =', t5.hasCombo,
    '· transformsTo =', t5.transformsTo,
    '· strength =', t5.strength,
    t5.hasCombo && t5.transformsTo==='water' ? '✓' : '✗');

  // Test 6: 戊巳 → HS=戊, HHS(巳)=丙 → no (戊癸)
  const t6 = detectHsHhsCombo({stem:'戊',branch:'巳'});
  console.log('  戊巳: hasCombo =', t6.hasCombo, '(expect false)', t6.hasCombo===false?'✓':'✗');

  // Test 7: 庚辰 → HS=庚, HHS(辰)=戊 → no (乙庚 not 戊庚)
  const t7 = detectHsHhsCombo({stem:'庚',branch:'辰'});
  console.log('  庚辰: hasCombo =', t7.hasCombo, '(expect false)', t7.hasCombo===false?'✓':'✗');

  // Test 8: full chart Aeaw — expect at least 1 combo (丙辛) might appear
  const aeaw = {
    year:{stem:'甲',branch:'子'},
    month:{stem:'丙',branch:'子'},
    day:{stem:'己',branch:'亥'},
    hour:{stem:'辛',branch:'未'},
  };
  const aeawResult = buildHsHhsForChart(aeaw);
  console.log('\n=== Aeaw chart ===');
  for (const p of ['year','month','day','hour']) {
    const r = aeawResult[p];
    console.log(`  ${p} ${aeaw[p].stem}${aeaw[p].branch}: combo=${r.hasCombo}${r.hasCombo?` → ${r.transformsTo} (${r.strength})`:''}`);
  }
  console.log('  summary:', aeawResult.summary);

  return t1.hasCombo===false && t5.hasCombo===true && t5.transformsTo==='water';
}

function runAll() {
  const ok = testCases();
  console.log('\n→ Wrapper 2 tests:', ok ? '✅ ALL PASS' : '❌ FAIL');
  return ok;
}

module.exports = { detectHsHhsCombo, buildHsHhsForChart, runAll };

if (require.main === module) runAll();
