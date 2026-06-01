/**
 * Decode Fan Yin / Fu Yin Detector v1.0
 * 
 * 反吟 Fan Yin = Total opposition (stem clash + branch clash with natal pillar)
 * 伏吟 Fu Yin  = Total repetition (same stem + same branch as natal pillar)
 * 
 * These are CRITICAL classical concepts that Voytek shows but Hourkey + 
 * basic Decode currently miss. Both indicate major life events during transit.
 * 
 * Source: Classical 子平真詮 + verified against bazi-calculator.com output
 */

// 5 stem clash pairs (天干相沖)
const STEM_CLASH = {
  '甲': '庚', '庚': '甲',  // Wood vs Metal
  '乙': '辛', '辛': '乙',
  '丙': '壬', '壬': '丙',  // Fire vs Water
  '丁': '癸', '癸': '丁',
  // Note: 戊己 Earth pair don't clash (central element)
};

// 6 branch clash pairs (地支相沖)
const BRANCH_CLASH = {
  '子': '午', '午': '子',
  '丑': '未', '未': '丑',
  '寅': '申', '申': '寅',
  '卯': '酉', '酉': '卯',
  '辰': '戌', '戌': '辰',
  '巳': '亥', '亥': '巳'
};

/**
 * Detect Fan Yin (反吟) — total opposition
 * @param {Object} natal - {stem, branch}
 * @param {Object} transit - {stem, branch}
 * @returns {boolean}
 */
function isFanYin(natal, transit) {
  const stemClashes = STEM_CLASH[natal.stem] === transit.stem;
  const branchClashes = BRANCH_CLASH[natal.branch] === transit.branch;
  return stemClashes && branchClashes;
}

/**
 * Detect Fu Yin (伏吟) — total repetition
 */
function isFuYin(natal, transit) {
  return natal.stem === transit.stem && natal.branch === transit.branch;
}

/**
 * Detect partial — useful for nuance
 */
function getYinType(natal, transit) {
  const stemClash = STEM_CLASH[natal.stem] === transit.stem;
  const branchClash = BRANCH_CLASH[natal.branch] === transit.branch;
  const stemSame = natal.stem === transit.stem;
  const branchSame = natal.branch === transit.branch;
  
  if (stemClash && branchClash) return { type: 'fan_yin', severity: 'critical', label: '反吟 Fan Yin (full opposition)' };
  if (stemSame && branchSame)   return { type: 'fu_yin',  severity: 'critical', label: '伏吟 Fu Yin (full repetition)' };
  if (stemClash && branchSame)  return { type: 'half_yin', severity: 'moderate', label: 'Half Fan Yin (stem clash + branch repeat)' };
  if (stemSame && branchClash)  return { type: 'half_yin', severity: 'moderate', label: 'Half Yin (stem repeat + branch clash)' };
  if (stemClash)                return { type: 'stem_clash_only', severity: 'minor', label: 'Stem clash' };
  if (branchClash)              return { type: 'branch_clash_only', severity: 'minor', label: 'Branch clash' };
  return null;
}

/**
 * Scan all 4 natal pillars against a transit pillar
 * Returns which natal pillars are activated and how
 */
function scanPillarsAgainstTransit(natalPillars, transit) {
  const results = {};
  for (const pos of ['year', 'month', 'day', 'hour']) {
    if (!natalPillars[pos]) continue;
    const yinType = getYinType(natalPillars[pos], transit);
    if (yinType) {
      results[pos] = {
        natal: `${natalPillars[pos].stem}${natalPillars[pos].branch}`,
        transit: `${transit.stem}${transit.branch}`,
        ...yinType
      };
    }
  }
  return results;
}

// Aeaw test — natal 甲子/丙子/己亥/辛未, current LP 辛巳 (age 42-52)
function testWithAeaw() {
  const aeaw = {
    year:  { stem: '甲', branch: '子' },
    month: { stem: '丙', branch: '子' },
    day:   { stem: '己', branch: '亥' },
    hour:  { stem: '辛', branch: '未' }
  };
  
  console.log('=== Aeaw Yin Detection Tests ===\n');
  
  // Test 1: Current Luck Pillar 辛巳 vs natal
  console.log('Test 1: LP 辛巳 (Aeaw age 42-52) vs natal:');
  const lp = { stem: '辛', branch: '巳' };
  const lpResults = scanPillarsAgainstTransit(aeaw, lp);
  console.log(JSON.stringify(lpResults, null, 2));
  console.log('  → 辛巳 vs Day 己亥: 巳-亥 branch clash. Stem 辛 vs 己 = no clash');
  console.log('  → 辛巳 vs Hour 辛未: 辛 same stem. Branch 巳 vs 未 = no clash');
  console.log('  Verdict: Branch clash with Day pillar = relationship/health upheaval potential\n');
  
  // Test 2: 2026 Liu Nian 丙午 vs natal
  console.log('Test 2: 2026 丙午 vs natal:');
  const ln2026 = { stem: '丙', branch: '午' };
  console.log(JSON.stringify(scanPillarsAgainstTransit(aeaw, ln2026), null, 2));
  console.log('  → 丙午 vs Month 丙子: 丙 same stem + 午-子 branch clash');
  console.log('  → 丙午 vs Year 甲子: 午-子 branch clash');
  console.log('  Verdict: Half-Yin with Month pillar (stem repeat + branch clash)\n');
  
  // Test 3: Hypothetical 壬午 year (would be 2002 or 2062)
  console.log('Test 3: Hypothetical 壬午 (would clash 丙子 fully):');
  const fanYin = { stem: '壬', branch: '午' };
  console.log(JSON.stringify(scanPillarsAgainstTransit(aeaw, fanYin), null, 2));
  console.log('  → 壬午 vs Month 丙子: 壬-丙 stem clash + 午-子 branch clash = FAN YIN\n');
  
  // Test 4: Find Aeaw's Fu Yin years (when his own pillars repeat)
  console.log('Test 4: When does Aeaw experience Fu Yin?');
  console.log('  • Year 甲子 repeats: 1924, 1984 (birth!), 2044, 2104');
  console.log('  • Month 丙子 occurs Dec each year when year stem allows: 1996, 2056');
  console.log('  • Day 己亥: every ~60 days');
  console.log('  • Hour 辛未: 13:00-14:59 on 己/甲 days');
}

module.exports = {
  isFanYin,
  isFuYin,
  getYinType,
  scanPillarsAgainstTransit,
  STEM_CLASH,
  BRANCH_CLASH
};

if (require.main === module) testWithAeaw();
