/**
 * Decode Border Case Detector v1.0
 * 
 * Voytek's unique feature: Warns when birth time falls within ±60 minutes
 * of a solar term boundary, meaning month pillar (or year pillar near 立春)
 * could be EITHER side. User must verify with classical reference.
 * 
 * Critical for accuracy — Hourkey and most apps silently pick a side without warning.
 */

const SOLAR_TERMS_2026 = [
  { name: '立春', date: '2026-02-04T10:46:00+08:00', is_jie: true },
  { name: '雨水', date: '2026-02-19T06:34:00+08:00', is_jie: false },
  { name: '驚蟄', date: '2026-03-06T04:43:00+08:00', is_jie: true },
  { name: '春分', date: '2026-03-21T05:33:00+08:00', is_jie: false },
  { name: '清明', date: '2026-04-05T09:23:00+08:00', is_jie: true },
  { name: '穀雨', date: '2026-04-20T16:24:00+08:00', is_jie: false },
  { name: '立夏', date: '2026-05-05T18:46:00+07:00', is_jie: true },
  { name: '小滿', date: '2026-05-21T05:36:00+08:00', is_jie: false },
  { name: '芒種', date: '2026-06-05T22:48:00+08:00', is_jie: true },
];

/**
 * Find nearest solar term to birth time
 */
function findNearestTerm(birthTime, terms) {
  let nearest = null;
  let minDistMs = Infinity;
  
  for (const term of terms) {
    const termTime = new Date(term.date);
    const distMs = Math.abs(birthTime.getTime() - termTime.getTime());
    if (distMs < minDistMs) {
      minDistMs = distMs;
      nearest = { ...term, time: termTime, distance_minutes: distMs / 60000 };
    }
  }
  return nearest;
}

/**
 * Check if birth time is in border case zone
 * @param {Date} birthTime - True solar time of birth
 * @param {number} toleranceMin - How close to boundary triggers warning (default 60)
 * @returns {Object}
 */
function checkBorderCase(birthTime, toleranceMin = 60) {
  const nearest = findNearestTerm(birthTime, SOLAR_TERMS_2026);
  if (!nearest) return { is_border: false };
  
  const isBorder = nearest.distance_minutes < toleranceMin;
  const beforeTerm = birthTime.getTime() < nearest.time.getTime();
  
  return {
    is_border: isBorder,
    nearest_term: nearest.name,
    distance_minutes: Math.round(nearest.distance_minutes),
    side: beforeTerm ? 'before' : 'after',
    is_jie: nearest.is_jie,
    affects: nearest.is_jie ? 'month_pillar' : 'qi_phase_only',
    warning: isBorder 
      ? `Border case: ${Math.round(nearest.distance_minutes)} min ${beforeTerm ? 'before' : 'after'} ${nearest.name}. ${nearest.is_jie ? 'Month pillar may shift!' : 'Qi phase shift only.'}`
      : null,
    severity: isBorder && nearest.is_jie ? 'high' : isBorder ? 'low' : 'none'
  };
}

// Test with example birth — May 5 2026 19:34 Nonthaburi (Voytek test case)
function runTests() {
  console.log('=== Border Case Detection Tests ===\n');
  
  // Convert RST 19:19 to Date object
  const rstBirth = new Date('2026-05-05T19:19:00+07:00');
  console.log(`Test 1: Birth at RST 19:19 May 5 2026 (Voytek default)`);
  const result1 = checkBorderCase(rstBirth);
  console.log(JSON.stringify(result1, null, 2));
  console.log();
  
  // Test 2: Far from any boundary
  const safeBirth = new Date('2026-05-15T12:00:00+07:00');
  console.log(`Test 2: Birth far from boundary (May 15)`);
  console.log(JSON.stringify(checkBorderCase(safeBirth), null, 2));
  console.log();
  
  // Test 3: Aeaw himself (born Dec 31 1984 13:15 → RST ~12:53)
  console.log(`Test 3: Aeaw birth 1984-12-31 13:15 RST (would need 1984 solar terms)`);
  console.log('  Aeaw born Dec 31 → near 小寒 boundary (~Jan 5-6)');
  console.log('  Distance from 小寒: ~5-6 days = SAFE, no border case');
  console.log('  Distance from 冬至 (Dec 22): ~9 days = SAFE');
  console.log();
  
  // Test 4: Edge case Feb 4 birth (立春 boundary = year pillar shift!)
  const feb4Edge = new Date('2026-02-04T11:00:00+08:00');  // 14 min after 立春
  console.log(`Test 4: Born Feb 4 2026 11:00 (just after 立春 10:46)`);
  console.log(JSON.stringify(checkBorderCase(feb4Edge), null, 2));
  console.log('  → CRITICAL: Year pillar 丙午 (2026) NOT 乙巳 (2025) by 14 min');
}

module.exports = { checkBorderCase, findNearestTerm };

if (require.main === module) runTests();
