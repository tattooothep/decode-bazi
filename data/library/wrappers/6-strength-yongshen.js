/**
 * Wrapper 6 · Strength Scoring + Yongshen Bridge
 *
 * รวม:
 *   - 12 phases multiplier (帝旺 · 臨官 · ...)
 *   - Position weights (Month 1.6 · Day 1.0 · Hour 0.9 · Year 0.8)
 *   - Rooting count
 *   - Useful god alignment (จาก Wrapper 4)
 *   - Crisis bridge (จาก Wrapper 5)
 *
 * Output:
 *   { strength: {percent, level, polarity}, yongshenFinal: [...], confidence }
 */

const S = require('./shared');
const { getUsefulGod } = require('./4-useful-god');
const { tiaoHouAnalysis } = require('./5-tiao-hou');
const { STRENGTH_LABEL, ELEMENT_NAME } = require('./narrative');

/* 19 พ.ค. Option α (Codex-approved) · helper · 4p byte-equal · 3p filters hour */
function activePositions(natal) {
  return ['year','month','day','hour'].filter(p => natal[p]);
}

const STRENGTH_LEVELS = [
  { code: 'extremely_weak',   min: 0,   max: 20  },
  { code: 'very_weak',        min: 20,  max: 35  },
  { code: 'weak',             min: 35,  max: 45  },
  { code: 'slightly_weak',    min: 45,  max: 50  },
  { code: 'balanced',         min: 50,  max: 55  },
  { code: 'slightly_strong',  min: 55,  max: 65  },
  { code: 'strong',           min: 65,  max: 80  },
  { code: 'very_strong',      min: 80,  max: 92  },
  { code: 'extremely_strong', min: 92,  max: 101 },
];

function levelFromPercent(p) {
  for (const l of STRENGTH_LEVELS) {
    if (p >= l.min && p < l.max) return l.code;
  }
  return 'balanced';
}

function rootCount(stem, natal) {
  // Count how many branches contain hidden stems of same element as DM stem
  const dmEl = S.STEM_ELEMENT[stem];
  const positions = activePositions(natal);
  let count = 0;
  for (const pos of positions) {
    const branchEl = S.BRANCH_ELEMENT[natal[pos].branch];
    if (branchEl === dmEl) count++;
    // Check hidden stems too
    const hs = S.HIDDEN_STEMS[natal[pos].branch];
    if (hs?.middle && S.STEM_ELEMENT[hs.middle] === dmEl) count += 0.5;
    if (hs?.residual && S.STEM_ELEMENT[hs.residual] === dmEl) count += 0.3;
  }
  return Math.round(count * 10) / 10;
}

function computeStrength(natal) {
  const dm = natal.day.stem;
  const dmEl = S.STEM_ELEMENT[dm];
  const positions = activePositions(natal);

  // 1. Phase score (DM in each branch)
  let phaseScore = 0;
  for (const pos of positions) {
    const branch = natal[pos].branch;
    const phase = S.twelvePhase(dm, branch);
    const mult = S.TWELVE_PHASE_MULT[phase] || 1.0;
    const posWeight = S.POSITION_WEIGHT[pos];
    phaseScore += mult * posWeight;
  }
  // Normalize: max ~7.5 (1.5*4 weights) → /7.5*100
  const phasePct = (phaseScore / 7.5) * 100;

  // 2. Element ratio
  const counts = { wood:0, fire:0, earth:0, metal:0, water:0 };
  for (const pos of positions) {
    counts[S.STEM_ELEMENT[natal[pos].stem]]++;
    counts[S.BRANCH_ELEMENT[natal[pos].branch]]++;
    const hs = S.HIDDEN_STEMS[natal[pos].branch];
    if (hs?.main) counts[S.STEM_ELEMENT[hs.main]] += 0.5;
  }
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  const friendlyElements = [dmEl, Object.keys(S.ELEMENT_PRODUCES).find(k => S.ELEMENT_PRODUCES[k] === dmEl)]; /* HK_FIX_FRIENDLY_V1: เอา ELEMENT_PRODUCES[] ชั้นนอกออก → ได้ผู้ผลิต(印)ตรงๆ ไม่ใช่ dmEl ซ้ำ (ตามแม่แบบบรรทัด 173) */
  const friendlyShare = friendlyElements.reduce((s, el) => s + (counts[el] || 0), 0);
  const friendlyPct = (friendlyShare / total) * 100;

  // 3. Roots
  const roots = rootCount(dm, natal);
  const rootMult = roots === 0 ? 0.6 : roots <= 1 ? 1.0 : roots <= 2.5 ? 1.15 : 1.25;

  // Combine: weighted average
  const rawPct = (phasePct * 0.4 + friendlyPct * 0.4 + roots * 10 * 0.2) * rootMult;
  const percent = Math.round(Math.max(0, Math.min(100, rawPct)));
  const level = levelFromPercent(percent);

  // Polarity
  const polarity = percent >= 50 ? 'strong-side' : 'weak-side';

  return {
    percent,
    level,
    levelLabel: STRENGTH_LABEL[level],
    polarity,
    detail: {
      phaseScore: Math.round(phaseScore * 100) / 100,
      phasePct: Math.round(phasePct),
      friendlyPct: Math.round(friendlyPct),
      roots,
      rootMult,
      counts,
    },
  };
}

function bridgeYongshen(natal) {
  // 1. Get base 5-rank
  const dm = natal.day.stem;
  const ug = getUsefulGod(dm);
  // 2. Get climate adjustment
  const climate = tiaoHouAnalysis(natal);
  // 3. Get strength (อ่อน → ใช้ resource/parallel · แกร่ง → ใช้ wealth/officer/output)
  const strength = computeStrength(natal);

  // Adjust ranking based on strength + climate
  const adjusted = ug.ranks.map(r => ({ ...r, finalScore: 5 - r.rank, reason: ['base rank'] }));

  // Fix E (15 พ.ค.) · Expand to all 10 stems · เพิ่ม stem ที่ wrapper-4 ไม่ได้ list (เช่น 丙丁 ของ 乙)
  // ทำให้ climate regulator + strong-side output ใช้งานได้ครบ
  const ALL_STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const STEM_NAME_EN = {甲:'Jia',乙:'Yi',丙:'Bing',丁:'Ding',戊:'Wu',己:'Ji',庚:'Geng',辛:'Xin',壬:'Ren',癸:'Gui'};
  const presentStems = new Set(adjusted.map(r => r.stem));
  for (const stem of ALL_STEMS) {
    if (presentStems.has(stem)) continue;
    const element = S.STEM_ELEMENT[stem];
    const elementName = { en: element.charAt(0).toUpperCase()+element.slice(1), th: ({wood:'ไม้',fire:'ไฟ',earth:'ดิน',metal:'ทอง',water:'น้ำ'})[element], zh: ({wood:'木',fire:'火',earth:'土',metal:'金',water:'水'})[element] };
    adjusted.push({
      stem,
      rank: 99,
      element,
      elementName,
      polarity: 'yang',
      tenGod: '—',
      tenGodName: { en:'—', th:'—', zh:'—' },
      priority: { en:'expanded', th:'ส่วนเสริม', zh:'擴展' },
      finalScore: 0,
      reason: ['unranked'],
    });
  }

  // Boost climate regulator · regulator > bridge (tiebreaker fix · 14 พ.ค. 2026)
  // Fix A (15 พ.ค.) · skip bridge boost if bridge == DM element (circular)
  const dmElGlobal = S.STEM_ELEMENT[dm];
  if (climate.regulator) {
    for (const r of adjusted) {
      if (r.element === climate.regulator) {
        r.finalScore += 4;
        r.reason.push(`climate ${climate.climate} → ${climate.regulator}`);
      }
      if (r.element === climate.bridge && climate.bridge !== dmElGlobal) {
        r.finalScore += 1.5;
        r.reason.push(`climate bridge ${climate.bridge}`);
      }
    }
  }

  // HK_CONG_YONGSHEN_V1 (สเตป 4) · 從格 → 用財勢 ไม่ใช่扶抑用印 (子平真詮從財/從勢格)
  // ดวงพิเศษ(從): DM ตาม勢ที่เด่น → 用 ธาตุเด่น(財) + 食傷(生財) · 忌 印+比劫(ขวาง從)
  const _follow = require('./follow-detector').detectFollow(natal);
  const _dmEl0 = S.STEM_ELEMENT[dm];
  if (_follow && _follow.follow_candidate && _follow.evidence?.dominant_force?.element) {
    const followEl = _follow.evidence.dominant_force.element;        // ธาตุเด่น (財/勢)
    const outputEl0 = S.ELEMENT_PRODUCES[_dmEl0];                    // 食傷 (DM生 · 生財)
    const resourceEl0 = Object.keys(S.ELEMENT_PRODUCES).find(k => S.ELEMENT_PRODUCES[k] === _dmEl0); // 印
    for (const r of adjusted) {
      if (r.element === followEl)    { r.finalScore += 4; r.reason.push('從勢·用財/勢เด่น'); }
      if (r.element === outputEl0)   { r.finalScore += 2; r.reason.push('從·食傷生財'); }
      if (r.element === resourceEl0) { r.finalScore -= 4; r.reason.push('從·忌印(ขวาง從)'); }
      if (r.element === _dmEl0)      { r.finalScore -= 3; r.reason.push('從·忌比劫(夺財)'); }
    }
  } else if (strength.polarity === 'weak-side') {
    // boost resource (produces DM) + parallel (same as DM)
    const dmEl = S.STEM_ELEMENT[dm];
    const resourceEl = Object.keys(S.ELEMENT_PRODUCES).find(k => S.ELEMENT_PRODUCES[k] === dmEl);
    for (const r of adjusted) {
      if (r.element === dmEl) { r.finalScore += 1; r.reason.push('boost DM (weak)'); }
      if (r.element === resourceEl) { r.finalScore += 1.5; r.reason.push('boost resource (weak)'); }
    }
  } else {
    // boost wealth/officer/output
    // Fix B (15 พ.ค.) · output +0.8 → +2.5 (drain เด่นสำหรับ DM แกร่ง · ตำรา 滴天髓)
    const dmEl = S.STEM_ELEMENT[dm];
    const wealthEl = S.ELEMENT_CONTROLS[dmEl];
    const officerEl = Object.keys(S.ELEMENT_CONTROLS).find(k => S.ELEMENT_CONTROLS[k] === dmEl);
    const outputEl = S.ELEMENT_PRODUCES[dmEl];
    /* HK_STRONG_REDUCE_RESOURCE_V1 (สเตป 3) · 子平真詮「印多逢財·身強用財/食傷洩」
     * 身強 = 印/比劫 มีพอแล้ว → ลด resource(印)+parallel(比劫) ไม่ให้แย่ง用神洩克 */
    const resourceEl = Object.keys(S.ELEMENT_PRODUCES).find(k => S.ELEMENT_PRODUCES[k] === dmEl);
    for (const r of adjusted) {
      if (r.element === wealthEl)  { r.finalScore += 1.2; r.reason.push('boost wealth (strong)'); }
      if (r.element === officerEl) { r.finalScore += 1;   r.reason.push('boost officer (strong)'); }
      if (r.element === outputEl)  { r.finalScore += 2.5; r.reason.push('boost output·drain (strong)'); }
      if (r.element === resourceEl) { r.finalScore -= 2.5; r.reason.push('印旺ลด (strong·印多用財)'); }
      if (r.element === dmEl)       { r.finalScore -= 1;   r.reason.push('比劫ลด (strong)'); }
    }
  }

  adjusted.sort((a,b) => b.finalScore - a.finalScore);

  // School note · บอกแนวคิดที่ใช้ตามตำรา (เผื่อสำนักต่างกัน)
  const isWeak = strength.polarity === 'weak-side';
  const climLabel = climate.climate || '—';
  const top = adjusted[0];
  const schools_note = {
    method: isWeak ? 'classical_weak' : 'classical_strong',
    th: isWeak
      ? `ตำราคลาสสิก 子平真詮 · DM อ่อน → ใช้ resource (印) + parallel (比劫) เสริมแกร่ง · climate ${climLabel} → boost regulator`
      : `ตำรา 滴天髓 · DM แกร่ง → ใช้ output (食傷·drain) + wealth (財) + officer (官殺) ระบาย · climate ${climLabel} → boost regulator`,
    en: isWeak
      ? `Classical 子平真詮 · Weak DM → boost resource + parallel · climate ${climLabel} → regulator`
      : `滴天髓 school · Strong DM → boost output (drain) + wealth + officer · climate ${climLabel} → regulator`,
    zh: isWeak
      ? `子平真詮 · 弱DM → 印比助身 · 氣候 ${climLabel} → 調候用神`
      : `滴天髓 · 強DM → 食傷財官洩秀 · 氣候 ${climLabel} → 調候用神`,
    primary_pick_th: top ? `用神อันดับแรก: ${top.stem} (${top.element}) · ${top.reason.slice(-1)[0] || 'base rank'}` : '—',
    schools_note: 'หลายสำนัก/ตำราอาจให้คำตอบต่าง · ที่นี่ใช้ classical + 滴天髓 combo',
  };

  return {
    dayMaster: dm,
    strength,
    climate,
    yongshenFinal: adjusted.slice(0, 3).map(r => ({
      stem: r.stem,
      element: r.element,
      elementName: r.elementName,
      finalScore: Math.round(r.finalScore * 10) / 10,
      reason: r.reason,
    })),
    schools_note,
    confidence: strength.detail.roots > 0 ? 'high' : 'moderate',
  };
}

// ─── unit tests ──────────────────────────────────────────────
function testCases() {
  console.log('=== Strength + Yongshen Bridge unit tests ===');

  // Aeaw 己 (cold winter chart · weak)
  const aeaw = {year:{stem:'甲',branch:'子'},month:{stem:'丙',branch:'子'},day:{stem:'己',branch:'亥'},hour:{stem:'辛',branch:'未'}};
  const r1 = bridgeYongshen(aeaw);
  console.log('\n  Aeaw 己:');
  console.log('    strength:', r1.strength.percent, '% ·', r1.strength.level);
  console.log('    climate :', r1.climate.climate, '·', r1.climate.regulator);
  console.log('    top 3 yongshen:', r1.yongshenFinal.map(y => `${y.stem}(${y.element})`).join(' · '));

  // Mai 丙 (damp earth · strong fire dominant)
  const mai = {year:{stem:'丙',branch:'寅'},month:{stem:'壬',branch:'辰'},day:{stem:'丙',branch:'戌'},hour:{stem:'丙',branch:'申'}};
  const r2 = bridgeYongshen(mai);
  console.log('\n  Mai 丙:');
  console.log('    strength:', r2.strength.percent, '% ·', r2.strength.level);
  console.log('    climate :', r2.climate.climate, '·', r2.climate.regulator);
  console.log('    top 3 yongshen:', r2.yongshenFinal.map(y => `${y.stem}(${y.element})`).join(' · '));

  // 2026-05-06 庚 (scorched summer · should be balanced/strong)
  const today = {year:{stem:'丙',branch:'午'},month:{stem:'癸',branch:'巳'},day:{stem:'庚',branch:'辰'},hour:{stem:'庚',branch:'辰'}};
  const r3 = bridgeYongshen(today);
  console.log('\n  2026-05-06 庚:');
  console.log('    strength:', r3.strength.percent, '% ·', r3.strength.level);
  console.log('    climate :', r3.climate.climate, '·', r3.climate.regulator);
  console.log('    top 3 yongshen:', r3.yongshenFinal.map(y => `${y.stem}(${y.element})`).join(' · '));

  // Sanity: scores ใน range
  const okRange = r1.strength.percent >= 0 && r1.strength.percent <= 100 &&
                  r2.strength.percent >= 0 && r2.strength.percent <= 100 &&
                  r3.strength.percent >= 0 && r3.strength.percent <= 100;
  console.log('\n  All percents in [0,100]:', okRange ? '✓' : '✗');

  // Sanity: yongshen returned 3 items
  const ok3 = r1.yongshenFinal.length === 3 && r2.yongshenFinal.length === 3 && r3.yongshenFinal.length === 3;
  console.log('  Top 3 yongshen returned:', ok3 ? '✓' : '✗');

  return okRange && ok3;
}

function runAll() {
  const ok = testCases();
  console.log('\n→ Wrapper 6 tests:', ok ? '✅ ALL PASS' : '❌ FAIL');
  return ok;
}

module.exports = { computeStrength, bridgeYongshen, runAll };

if (require.main === module) runAll();
