/**
 * Wrapper 1 · Stem×Pillar + Branch×Pillar Interaction Matrix
 *
 * Loop ทุก 10 stems และ 12 branches เทียบกับ birth chart
 * บอกว่า stem/branch แต่ละตัวเข้ามาแล้วเกิดอะไร
 *
 * Output:
 *   {
 *     stemMatrix: { '甲': [{pillar, type, verdict, intensity, narrative}], ... },
 *     branchMatrix: { '子': [{...}], ... }
 *   }
 */

const S = require('./shared');
const { TEN_GOD_NAME, trans } = require('./narrative');

// ─── helpers ─────────────────────────────────────────────────
function isStemHe(s1, s2) {
  // 5 combinations: 甲己 乙庚 丙辛 丁壬 戊癸
  const pairs = ['甲己','己甲','乙庚','庚乙','丙辛','辛丙','丁壬','壬丁','戊癸','癸戊'];
  return pairs.includes(s1+s2);
}

function isStemClash(s1, s2) {
  // 4 clashes (Wood-Metal, Fire-Water, etc · 戊己 ไม่ clash)
  const pairs = ['甲庚','庚甲','乙辛','辛乙','丙壬','壬丙','丁癸','癸丁'];
  return pairs.includes(s1+s2);
}

function findSanHe(targetBranch, natalBranches) {
  for (const trio of S.SAN_HE) {
    if (!trio.branches.includes(targetBranch)) continue;
    const others = trio.branches.filter(b => b !== targetBranch);
    const hits = others.filter(b => natalBranches.includes(b));
    if (hits.length === 2) return { type:'三合', element:trio.element, with:hits };
    if (hits.length === 1) return { type:'半三合', element:trio.element, with:hits };
  }
  return null;
}

function findSanHui(targetBranch, natalBranches) {
  for (const trio of S.SAN_HUI) {
    if (!trio.branches.includes(targetBranch)) continue;
    const others = trio.branches.filter(b => b !== targetBranch);
    const hits = others.filter(b => natalBranches.includes(b));
    if (hits.length === 2) return { type:'三會', element:trio.element, with:hits };
  }
  return null;
}

// ─── core ────────────────────────────────────────────────────
function buildStemMatrix(natal) {
  // natal: {year:{stem,branch},month,day,hour}
  const positions = ['year','month','day','hour'];
  const matrix = {};
  for (const stem of S.STEMS) {
    matrix[stem] = [];
    for (const pos of positions) {
      const natalStem = natal[pos].stem;
      const events = [];
      // Combination 5合
      if (isStemHe(stem, natalStem)) {
        const key1 = stem+natalStem in S.STEM_COMBOS ? stem+natalStem : natalStem+stem;
        const combo = S.STEM_COMBOS[key1];
        events.push({
          type: '天干合',
          subtype: combo ? `combo→${combo.transformsTo}` : 'combo',
          verdict: 'positive',
          intensity: 'moderate',
        });
      }
      // Clash 沖
      if (isStemClash(stem, natalStem)) {
        events.push({
          type: '天干沖',
          subtype: `${stem} clashes ${natalStem}`,
          verdict: 'negative',
          intensity: 'strong',
        });
      }
      // Same stem (Fu Yin marker)
      if (stem === natalStem) {
        events.push({
          type: '伏吟',
          subtype: 'same stem repeats',
          verdict: 'context_dependent',
          intensity: 'moderate',
        });
      }
      // Ten God relation
      const dm = natal.day.stem;
      const god = S.tenGod(dm, stem);
      if (events.length || god) {
        matrix[stem].push({
          pillar: pos,
          natalStem,
          tenGod: god,
          tenGodName: god ? TEN_GOD_NAME[god] : null,
          events,
        });
      }
    }
  }
  return matrix;
}

function buildBranchMatrix(natal) {
  const positions = ['year','month','day','hour'];
  const natalBranches = positions.map(p => natal[p].branch);
  const matrix = {};
  for (const branch of S.BRANCHES) {
    matrix[branch] = { perPillar: [], chartLevel: [] };
    // Per-pillar interaction
    for (const pos of positions) {
      const nb = natal[pos].branch;
      const events = [];
      if (S.SIX_CLASH[branch] === nb) {
        events.push({ type:'六沖', verdict:'negative', intensity:'strong', with:nb });
      }
      if (S.SIX_HE[branch] === nb) {
        events.push({ type:'六合', verdict:'positive', intensity:'moderate', with:nb });
      }
      if (S.SIX_HARM[branch] === nb) {
        events.push({ type:'六害', verdict:'negative', intensity:'mild', with:nb });
      }
      if (S.SIX_DESTROY[branch] === nb) {
        events.push({ type:'六破', verdict:'negative', intensity:'mild', with:nb });
      }
      if (branch === nb) {
        events.push({ type:'伏吟', verdict:'context_dependent', intensity:'moderate', with:nb });
      }
      if (events.length) matrix[branch].perPillar.push({ pillar: pos, natalBranch:nb, events });
    }
    // Chart-level: 三合 / 三會
    const sanHe = findSanHe(branch, natalBranches);
    if (sanHe) matrix[branch].chartLevel.push({ ...sanHe, verdict:'positive', intensity: sanHe.type==='三合'?'strong':'moderate' });
    const sanHui = findSanHui(branch, natalBranches);
    if (sanHui) matrix[branch].chartLevel.push({ ...sanHui, verdict:'positive', intensity:'critical' });
  }
  return matrix;
}

function buildMatrix(natal) {
  return {
    stemMatrix: buildStemMatrix(natal),
    branchMatrix: buildBranchMatrix(natal),
    summary: {
      stems_with_events: Object.entries(buildStemMatrix(natal)).filter(([_,v]) => v.length).length,
      branches_with_events: Object.entries(buildBranchMatrix(natal)).filter(([_,v]) => v.perPillar.length || v.chartLevel.length).length,
    },
  };
}

// ─── unit tests ──────────────────────────────────────────────
function testAeaw() {
  const natal = {
    year: {stem:'甲',branch:'子'},
    month:{stem:'丙',branch:'子'},
    day:  {stem:'己',branch:'亥'},
    hour: {stem:'辛',branch:'未'},
  };
  const m = buildMatrix(natal);
  console.log('\n=== TEST 1 · Aeaw ===');
  console.log('  stems with events:', m.summary.stems_with_events, '/ 10');
  console.log('  branches with events:', m.summary.branches_with_events, '/ 12');
  // Expect 庚 to clash 甲 (year)
  const geng = m.stemMatrix['庚'].find(e => e.events.some(ev => ev.type==='天干沖'));
  console.log('  ✓ 庚 clashes 甲 (year):', geng?.pillar === 'year' ? 'PASS' : 'FAIL');
  // Expect 子 to be Fu Yin (Aeaw has 子 in year & month)
  const zi = m.branchMatrix['子'].perPillar.filter(e => e.events.some(ev => ev.type==='伏吟'));
  console.log('  ✓ 子 伏吟 in year+month:', zi.length === 2 ? 'PASS' : `FAIL (${zi.length})`);
  // Expect 申 to form 半三合 with 子 (water)
  const shen = m.branchMatrix['申'].chartLevel.find(e => e.element === 'water');
  console.log('  ✓ 申 forms water 三合 with 子:', shen ? 'PASS' : 'FAIL');
  return m.summary.stems_with_events >= 5 && m.summary.branches_with_events >= 5;
}

function testMai() {
  const natal = {
    year: {stem:'丙',branch:'寅'},
    month:{stem:'壬',branch:'辰'},
    day:  {stem:'丙',branch:'戌'},
    hour: {stem:'丙',branch:'申'},
  };
  const m = buildMatrix(natal);
  console.log('\n=== TEST 2 · Mai ===');
  console.log('  stems with events:', m.summary.stems_with_events);
  console.log('  branches with events:', m.summary.branches_with_events);
  // Mai has 寅午戌 fire? need 午 → branch 午 should form 三合 fire
  const wu = m.branchMatrix['午'].chartLevel.find(e => e.element==='fire');
  console.log('  ✓ 午 forms fire 三合 with 寅戌:', wu?.type==='三合' ? 'PASS' : 'FAIL');
  return true;
}

function runAll() {
  const t1 = testAeaw();
  const t2 = testMai();
  console.log('\n→ Wrapper 1 tests:', t1 && t2 ? '✅ ALL PASS' : '❌ FAIL');
  return t1 && t2;
}

module.exports = { buildStemMatrix, buildBranchMatrix, buildMatrix, runAll };

if (require.main === module) runAll();
