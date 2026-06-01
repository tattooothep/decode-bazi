/**
 * Wrapper 4 · Useful God 5-rank
 *
 * คืน top 5 yongshen ตาม DM พร้อม priority + reason
 *
 * Source: hourkey-useful-god-ranks.json (verified 10 stems)
 */

const S = require('./shared');
const { ELEMENT_NAME, TEN_GOD_NAME } = require('./narrative');

const PRIORITY_REASON = {
  1: { en:'Primary · most needed', th:'อันดับหนึ่ง · ขาดไม่ได้',  zh:'首要' },
  2: { en:'Secondary · strong support', th:'อันดับสอง · เสริมแกร่ง', zh:'次要' },
  3: { en:'Tertiary · useful boost', th:'อันดับสาม · เสริมพลัง',   zh:'第三' },
  4: { en:'Supportive · mild', th:'สนับสนุน · เบา',                zh:'輔助' },
  5: { en:'Optional · niche', th:'เลือกได้ · เฉพาะกรณี',           zh:'備用' },
};

function getUsefulGod(dayMaster) {
  const ranks = S.USEFUL_GOD_RANKS[dayMaster];
  if (!ranks) return { error: `unknown DM ${dayMaster}` };
  const result = ranks.map((stem, i) => {
    const element = S.STEM_ELEMENT[stem];
    const polarity = S.STEM_POLARITY[stem];
    const tenGod = S.tenGod(dayMaster, stem);
    return {
      rank: i + 1,
      stem,
      element,
      elementName: ELEMENT_NAME[element],
      polarity,
      tenGod,
      tenGodName: tenGod ? TEN_GOD_NAME[tenGod] : null,
      priority: PRIORITY_REASON[i + 1],
    };
  });
  return {
    dayMaster,
    dmElement: S.STEM_ELEMENT[dayMaster],
    ranks: result,
    summary: {
      primary: result[0].stem,
      primaryElement: result[0].element,
      friendlyElements: [...new Set(result.map(r => r.element))],
    },
  };
}

// ─── unit tests ──────────────────────────────────────────────
function testCases() {
  console.log('=== Useful God unit tests ===');

  // Aeaw 己 → 乙·戊·己·丙·丁
  const r1 = getUsefulGod('己');
  console.log('  DM 己 ranks:', r1.ranks.map(r => r.stem).join(' · '));
  console.log('   expect 乙 戊 己 丙 丁 ·',
    r1.ranks[0].stem==='乙' && r1.ranks[1].stem==='戊' && r1.ranks[2].stem==='己' ? '✓' : '✗');

  // 甲 DM
  const r2 = getUsefulGod('甲');
  console.log('  DM 甲 ranks:', r2.ranks.map(r => r.stem).join(' · '));
  console.log('   primary tenGod:', r2.ranks[0].tenGod);

  // ทุก stem
  console.log('\n  All 10 stems coverage:');
  for (const stem of S.STEMS) {
    const r = getUsefulGod(stem);
    console.log(`   ${stem} → top:${r.ranks[0].stem}(${r.ranks[0].tenGod})`);
  }

  return r1.ranks.length === 5 && r1.ranks[0].stem === '乙';
}

function runAll() {
  const ok = testCases();
  console.log('\n→ Wrapper 4 tests:', ok ? '✅ ALL PASS' : '❌ FAIL');
  return ok;
}

module.exports = { getUsefulGod, runAll };

if (require.main === module) runAll();
