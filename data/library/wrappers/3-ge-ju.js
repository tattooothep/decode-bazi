/**
 * Wrapper 3 · Ge Ju (Structure 格局) Inference
 *
 * อนุมานโครงสร้างของดวงจาก:
 *   1. Month branch hidden stem (main qi)
 *   2. ความสัมพันธ์ Ten God กับ Day Master
 *   3. Special: Transformation (5合 + season + dominance)
 *   4. Special: Follow patterns (DM อ่อนสุดขั้ว)
 *
 * Conservative: ถ้าไม่แน่ใจ → ใช้ basic structure
 */

const S = require('./shared');
const { STRUCTURE_NAME, TEN_GOD_NAME } = require('./narrative');

// Map Ten God → Structure key
const TEN_GOD_TO_STRUCTURE = {
  '正印': '正印格',
  '偏印': '偏印格',
  '正官': '正官格',
  '七殺': '七殺格',
  '正財': '正財格',
  '偏財': '偏財格',
  '食神': '食神格',
  '傷官': '傷官格',
  '比肩': '比肩格',
  '劫財': '劫財格',
};

// Season for follower checks
const SEASON_OF_BRANCH = {
  寅:'spring',卯:'spring',辰:'spring',
  巳:'summer',午:'summer',未:'summer',
  申:'autumn',酉:'autumn',戌:'autumn',
  亥:'winter',子:'winter',丑:'winter',
};

const ELEMENT_SEASON = {
  wood:'spring', fire:'summer', metal:'autumn', water:'winter',
};

function elementCount(natal) {
  const positions = ['year','month','day','hour'];
  const counts = { wood:0, fire:0, earth:0, metal:0, water:0 };
  for (const pos of positions) {
    counts[S.STEM_ELEMENT[natal[pos].stem]]++;
    counts[S.BRANCH_ELEMENT[natal[pos].branch]]++;
    // Hidden stems (weighted lighter)
    const hs = S.HIDDEN_STEMS[natal[pos].branch];
    if (hs?.main) counts[S.STEM_ELEMENT[hs.main]] += 0.5;
  }
  return counts;
}

function isStemHe(s1, s2) {
  return ['甲己','乙庚','丙辛','丁壬','戊癸'].includes([s1,s2].sort().join('')) ||
         ['甲己','乙庚','丙辛','丁壬','戊癸'].some(p => (p[0]===s1 && p[1]===s2) || (p[1]===s1 && p[0]===s2));
}

function findTransformation(natal) {
  // 化氣格 — DM combines with adjacent stem (month or hour) AND season supports
  const dm = natal.day.stem;
  const candidates = [
    { partner: natal.month.stem, source: 'month' },
    { partner: natal.hour.stem,  source: 'hour' },
  ];
  for (const c of candidates) {
    const key = [dm, c.partner].sort().join('');
    const possible = ['甲己','乙庚','丙辛','丁壬','戊癸'];
    if (!possible.includes(key)) continue;
    // หา transformsTo
    const STEM_PAIR_TO_ELEMENT = {
      '甲己':'earth', '乙庚':'metal', '丙辛':'water', '丁壬':'wood', '戊癸':'fire',
    };
    const transformsTo = STEM_PAIR_TO_ELEMENT[key];
    // ตรวจ season (ที่ classical: ต้องเกิดในเดือนของธาตุที่แปร)
    const monthBranch = natal.month.branch;
    const monthSeason = SEASON_OF_BRANCH[monthBranch];
    const transformSeason = ELEMENT_SEASON[transformsTo];
    const seasonMatch = monthSeason === transformSeason;
    if (seasonMatch) {
      const structKey = `化${{wood:'木',fire:'火',earth:'土',metal:'金',water:'水'}[transformsTo]}格`;
      return {
        structure: structKey,
        transformsTo,
        partner: c.partner,
        partnerSource: c.source,
        seasonSupport: true,
        confidence: 'high',
      };
    }
  }
  return null;
}

function findFollower(natal, counts) {
  const dm = natal.day.stem;
  const dmEl = S.STEM_ELEMENT[dm];
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  const dmShare = counts[dmEl] / total;
  // DM ต้องอ่อนมาก (< 12%)
  if (dmShare > 0.12) return null;
  // หา dominant element
  let domEl = 'wood', domShare = 0;
  for (const [el, n] of Object.entries(counts)) {
    if (el === dmEl) continue;
    if (n / total > domShare) { domEl = el; domShare = n / total; }
  }
  if (domShare < 0.40) return null; // ไม่ dominant พอ
  // เช็คว่า dominant คืออะไร (output/wealth/influence)
  let category;
  if (S.ELEMENT_PRODUCES[dmEl] === domEl) category = '從兒格';     // Output (food/hurting)
  else if (S.ELEMENT_CONTROLS[dmEl] === domEl) category = '從財格'; // Wealth
  else if (S.ELEMENT_CONTROLS[domEl] === dmEl) category = '從殺格'; // Influence (officer/killings)
  else return null;
  return {
    structure: category,
    dominantElement: domEl,
    dmShare: Math.round(dmShare * 100),
    domShare: Math.round(domShare * 100),
    confidence: domShare > 0.55 ? 'high' : 'moderate',
  };
}

function inferGeJu(natal) {
  const dm = natal.day.stem;
  const monthBranch = natal.month.branch;
  const counts = elementCount(natal);

  // 1. Special check: Transformation
  const trans = findTransformation(natal);
  if (trans) {
    const name = STRUCTURE_NAME[trans.structure];
    return {
      structure: trans.structure,
      type: 'transformation',
      basis: `DM ${dm} + ${trans.partner} (${trans.partnerSource}) → ${trans.transformsTo}`,
      confidence: trans.confidence,
      narrative: name,
      detail: trans,
    };
  }

  // 2. Special check: Follower
  const follow = findFollower(natal, counts);
  if (follow) {
    const name = STRUCTURE_NAME[follow.structure];
    return {
      structure: follow.structure,
      type: 'follower',
      basis: `DM ${dm} only ${follow.dmShare}% · dominant ${follow.dominantElement} ${follow.domShare}%`,
      confidence: follow.confidence,
      narrative: name,
      detail: follow,
    };
  }

  // 3. Normal structure: Month branch main hidden stem → Ten God → Structure
  const mainHidden = S.HIDDEN_STEMS[monthBranch]?.main;
  if (!mainHidden) {
    return { structure: null, type: 'unknown', basis: 'no main hidden stem in month branch' };
  }
  const god = S.tenGod(dm, mainHidden);
  const structureKey = TEN_GOD_TO_STRUCTURE[god];
  const name = structureKey ? STRUCTURE_NAME[structureKey] : null;

  // Confidence: ดู middle/residual ตามด้วย
  const mid = S.HIDDEN_STEMS[monthBranch]?.middle;
  const res = S.HIDDEN_STEMS[monthBranch]?.residual;
  const midGod = mid ? S.tenGod(dm, mid) : null;
  const resGod = res ? S.tenGod(dm, res) : null;
  // ถ้า middle/residual เป็น god เดียวกัน = high · ไม่ตรง = moderate
  const confidence = !mid ? 'high' :
                     midGod === god ? 'high' : 'moderate';

  return {
    structure: structureKey,
    type: 'normal',
    basis: `Month branch ${monthBranch} · main hidden ${mainHidden} → ${god} for DM ${dm}`,
    god,
    godName: god ? TEN_GOD_NAME[god] : null,
    middleGod: midGod,
    residualGod: resGod,
    confidence,
    narrative: name,
  };
}

// ─── unit tests ──────────────────────────────────────────────
function testCases() {
  console.log('=== Ge Ju unit tests ===');

  // Test 1: Aeaw 甲子 丙子 己亥 辛未
  // DM=己 · Month branch=子 · main hidden=癸 · 癸 to 己 = 偏財
  const aeaw = {year:{stem:'甲',branch:'子'},month:{stem:'丙',branch:'子'},day:{stem:'己',branch:'亥'},hour:{stem:'辛',branch:'未'}};
  const r1 = inferGeJu(aeaw);
  console.log('  Aeaw:', r1.structure, '·', r1.basis, '·', r1.confidence);
  console.log('   expect 偏財格 (Indirect Wealth) ·', r1.structure === '偏財格' ? '✓' : '✗');

  // Test 2: Mai 丙寅 壬辰 丙戌 丙申
  // DM=丙 · Month branch=辰 · main hidden=戊 · 戊 to 丙 = 食神
  const mai = {year:{stem:'丙',branch:'寅'},month:{stem:'壬',branch:'辰'},day:{stem:'丙',branch:'戌'},hour:{stem:'丙',branch:'申'}};
  const r2 = inferGeJu(mai);
  console.log('  Mai:', r2.structure, '·', r2.basis, '·', r2.confidence);
  console.log('   expect 食神格 ·', r2.structure === '食神格' ? '✓' : '✗');

  // Test 3: 2026-05-06 birth (DM=庚 · month=巳 · main=丙 · 丙→庚 = 七殺)
  const today = {year:{stem:'丙',branch:'午'},month:{stem:'癸',branch:'巳'},day:{stem:'庚',branch:'辰'},hour:{stem:'庚',branch:'辰'}};
  const r3 = inferGeJu(today);
  console.log('  2026-05-06 born:', r3.structure, '·', r3.basis);
  console.log('   expect 七殺格 ·', r3.structure === '七殺格' ? '✓' : '✗');

  return r1.structure === '偏財格' && r2.structure === '食神格' && r3.structure === '七殺格';
}

function runAll() {
  const ok = testCases();
  console.log('\n→ Wrapper 3 tests:', ok ? '✅ ALL PASS' : '❌ FAIL');
  return ok;
}

module.exports = { inferGeJu, runAll };

if (require.main === module) runAll();
