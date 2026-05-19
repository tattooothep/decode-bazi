/**
 * Wrapper 5 · Tiao Hou Climate Analysis (調候)
 *
 * map ดวง → 4 climates: cold (frozen) · damp · scorched · dry
 * คืน regulating element + bridge element + heater/cooler list
 *
 * Source: sesheta-crisis-detection.json (alias เป็น Tiao Hou)
 */

const S = require('./shared');
const { CRISIS_NAME, ELEMENT_NAME } = require('./narrative');

/* 19 พ.ค. Option α (Codex-approved) · 4p byte-equal · 3p filters hour */
function activePositions(natal) {
  return ['year','month','day','hour'].filter(p => natal[p]);
}

// Map climate → regulating element
const CLIMATE_REGULATOR = {
  cold:     'fire',   // หนาว → ใช้ไฟอุ่น
  damp:     'fire',   // ชื้น → ใช้ไฟตาก
  scorched: 'water',  // ร้อน → ใช้น้ำดับ
  dry:      'water',  // แห้ง → ใช้น้ำหล่อ
};

// Bridge element (ตัวกลางทำให้ regulator ทำงานได้ดี)
const CLIMATE_BRIDGE = {
  cold:     'wood',   // ไม้เลี้ยงไฟ
  damp:     'wood',   // ไม้สะกัดดินชื้น
  scorched: 'metal',  // ทองทำให้น้ำเย็น
  dry:      'metal',  // ทองเก็บความชื้น
};

const TIER_DESCRIPTIONS = {
  SSS: { en:'Critical · life-altering', th:'วิกฤต · เปลี่ยนชีวิต',  zh:'極度' },
  SS:  { en:'Severe · strong impact',   th:'รุนแรง · กระทบมาก',    zh:'嚴重' },
  S:   { en:'Significant · noticeable', th:'สำคัญ · สังเกตได้',    zh:'顯著' },
  A:   { en:'Mild · minor adjustment',  th:'อ่อน · ปรับเล็กน้อย',  zh:'輕微' },
};

function detectClimate(natal) {
  const monthBranch = natal.month.branch;
  // หา climate จาก month branch
  for (const [climate, branches] of Object.entries(S.CRISIS_SEASON)) {
    if (branches.includes(monthBranch)) {
      return climate;
    }
  }
  return null;
}

function elementCounts(natal) {
  const positions = activePositions(natal);
  const counts = { wood:0, fire:0, earth:0, metal:0, water:0 };
  for (const pos of positions) {
    counts[S.STEM_ELEMENT[natal[pos].stem]]++;
    counts[S.BRANCH_ELEMENT[natal[pos].branch]]++;
  }
  return counts;
}

function severityFromCounts(climate, counts) {
  // Severity ขึ้นกับว่า "อิทธิพลปัญหา" มากไหม
  if (climate === 'cold')     return counts.water * 1 + (counts.wood < 2 ? 1 : 0);
  if (climate === 'damp')     return counts.earth * 1 + counts.water * 1;
  if (climate === 'scorched') return counts.fire * 1 + counts.wood * 1;
  if (climate === 'dry')      return counts.metal * 1 + (counts.water < 2 ? 1 : 0);
  return 0;
}

function tierFromSeverity(score) {
  if (score >= 6) return 'SSS';
  if (score >= 4) return 'SS';
  if (score >= 2) return 'S';
  return 'A';
}

function tiaoHouAnalysis(natal) {
  const climate = detectClimate(natal);
  if (!climate) {
    return {
      climate: null,
      severity: 0,
      tier: 'A',
      neutral: true,
      message: { en:'Balanced climate · no special adjustment needed',
                 th:'สภาพอากาศสมดุล · ไม่ต้องปรับพิเศษ',
                 zh:'氣候平衡' },
    };
  }
  const counts = elementCounts(natal);
  const severity = severityFromCounts(climate, counts);
  const tier = tierFromSeverity(severity);
  const regulator = CLIMATE_REGULATOR[climate];
  const bridge = CLIMATE_BRIDGE[climate];
  // หา heater/cooler list ที่เหมาะ (เฉพาะของ regulator element)
  const list = regulator === 'fire'
    ? S.HEATER
    : regulator === 'water'
    ? S.COOLER
    : [];

  return {
    climate,
    climateName: CRISIS_NAME[climate],
    severity,
    tier,
    tierDesc: TIER_DESCRIPTIONS[tier],
    regulator,
    regulatorName: ELEMENT_NAME[regulator],
    bridge,
    bridgeName: ELEMENT_NAME[bridge],
    activeList: list,
    counts,
    monthBranch: natal.month.branch,
  };
}

// ─── unit tests ──────────────────────────────────────────────
function testCases() {
  console.log('=== Tiao Hou unit tests ===');

  // Aeaw 月=子 (winter) → cold → fire
  const aeaw = {year:{stem:'甲',branch:'子'},month:{stem:'丙',branch:'子'},day:{stem:'己',branch:'亥'},hour:{stem:'辛',branch:'未'}};
  const r1 = tiaoHouAnalysis(aeaw);
  console.log('  Aeaw 月=子: climate =', r1.climate, '· tier =', r1.tier, '· regulator =', r1.regulator);
  console.log('   expect cold/fire ·', r1.climate==='cold' && r1.regulator==='fire' ? '✓' : '✗');

  // Mai 月=辰 (damp earth) → damp → fire
  const mai = {year:{stem:'丙',branch:'寅'},month:{stem:'壬',branch:'辰'},day:{stem:'丙',branch:'戌'},hour:{stem:'丙',branch:'申'}};
  const r2 = tiaoHouAnalysis(mai);
  console.log('  Mai 月=辰: climate =', r2.climate, '· tier =', r2.tier, '· regulator =', r2.regulator);
  console.log('   expect damp/fire ·', r2.climate==='damp' && r2.regulator==='fire' ? '✓' : '✗');

  // 2026-05-06 月=巳 (summer) → scorched → water
  const today = {year:{stem:'丙',branch:'午'},month:{stem:'癸',branch:'巳'},day:{stem:'庚',branch:'辰'},hour:{stem:'庚',branch:'辰'}};
  const r3 = tiaoHouAnalysis(today);
  console.log('  2026-05-06 月=巳: climate =', r3.climate, '· tier =', r3.tier, '· regulator =', r3.regulator);
  console.log('   expect scorched/water ·', r3.climate==='scorched' && r3.regulator==='water' ? '✓' : '✗');

  // Neutral case (月=寅 spring · ไม่อยู่ใน 4 crisis)
  const neutral = {year:{stem:'甲',branch:'寅'},month:{stem:'丙',branch:'寅'},day:{stem:'戊',branch:'寅'},hour:{stem:'壬',branch:'寅'}};
  const r4 = tiaoHouAnalysis(neutral);
  console.log('  Neutral 月=寅: climate =', r4.climate, '· neutral =', r4.neutral);

  return r1.regulator==='fire' && r2.regulator==='fire' && r3.regulator==='water';
}

function runAll() {
  const ok = testCases();
  console.log('\n→ Wrapper 5 tests:', ok ? '✅ ALL PASS' : '❌ FAIL');
  return ok;
}

module.exports = { tiaoHouAnalysis, runAll };

if (require.main === module) runAll();
