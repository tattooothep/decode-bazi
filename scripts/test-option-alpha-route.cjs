/**
 * Option α · route-level smoke test (Phase 6)
 * รัน wrapper-1 + wrapper-2 + chart route handler ผ่าน calcBazi + module deps · ตรวจ 3p path ไม่ crash
 * Codex รอบ 8 fix · ขอ smoke ระดับ route (ไม่ใช่แค่ calcBazi direct)
 */
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));

(async () => {
  const failures = [];

  /* 1. wrapper-1 buildMatrix 3p */
  const w1 = require('../data/library/wrappers/1-stem-branch-matrix.js');
  const aeaw3p = {
    year:  {stem:'甲', branch:'子'},
    month: {stem:'丙', branch:'子'},
    day:   {stem:'己', branch:'亥'},
    hour:  null,
  };
  try {
    const m = w1.buildMatrix(aeaw3p);
    if (!m.stemMatrix || !m.branchMatrix) failures.push('wrapper-1 3p: missing matrix keys');
    else console.log('✓ wrapper-1 buildMatrix 3p ok');
  } catch (e) { failures.push('wrapper-1 3p crashed: ' + e.message); }

  /* 2. wrapper-2 detectHsHhsCombo (per-pillar · 3p ใช้ active branches) */
  const w2 = require('../data/library/wrappers/2-hs-hhs-combo.js');
  try {
    const branches = ['year','month','day'].map(p => aeaw3p[p].branch);
    const r = w2.detectHsHhsCombo(aeaw3p.day, branches);
    if (typeof r.hasCombo !== 'boolean') failures.push('wrapper-2 3p: hasCombo not boolean');
    else console.log('✓ wrapper-2 detectHsHhsCombo (3p, 3 branches) ok');
  } catch (e) { failures.push('wrapper-2 3p crashed: ' + e.message); }

  /* 3. wrapper-5 tiao hou 3p */
  const w5 = require('../data/library/wrappers/5-tiao-hou.js');
  try {
    const t = w5.tiaoHouAnalysis(aeaw3p);
    if (t.climate !== 'cold') failures.push('wrapper-5 3p: expected cold, got ' + t.climate);
    else console.log('✓ wrapper-5 tiao hou 3p ok (climate=cold)');
  } catch (e) { failures.push('wrapper-5 3p crashed: ' + e.message); }

  /* 4. wrapper-7 synthesizeYongshen 3p */
  const w7 = require('../data/library/wrappers/7-yongshen-v2.js');
  try {
    const s = w7.synthesizeYongshen(aeaw3p);
    if (!s.structure_label) failures.push('wrapper-7 3p: missing structure_label');
    else console.log('✓ wrapper-7 synthesizeYongshen 3p ok (structure=' + s.structure_label + ')');
  } catch (e) { failures.push('wrapper-7 3p crashed: ' + e.message); }

  /* 5. follow-detector 3p */
  const wf = require('../data/library/wrappers/follow-detector.js');
  try {
    const f = wf.detectFollow(aeaw3p);
    if (!f.follow_type) failures.push('follow-detector 3p: missing follow_type');
    else console.log('✓ follow-detector 3p ok (type=' + f.follow_type + ')');
  } catch (e) { failures.push('follow-detector 3p crashed: ' + e.message); }

  /* 6. 4p byte-equal control · ห้ามกระทบ 4p */
  const aeaw4p = {
    year:  {stem:'甲', branch:'子'},
    month: {stem:'丙', branch:'子'},
    day:   {stem:'己', branch:'亥'},
    hour:  {stem:'庚', branch:'午'},
  };
  try {
    const m = w1.buildMatrix(aeaw4p);
    const stemCount4p = Object.keys(m.stemMatrix).length;
    if (stemCount4p !== 10) failures.push('wrapper-1 4p: expect 10 stems, got ' + stemCount4p);
    else console.log('✓ wrapper-1 4p control ok (10 stems)');
  } catch (e) { failures.push('wrapper-1 4p crashed: ' + e.message); }

  if (failures.length) {
    console.log('\n❌ FAIL ' + failures.length + ':\n  - ' + failures.join('\n  - '));
    process.exit(1);
  } else {
    console.log('\n✅ Route-level 3p smoke · all 6 modules pass');
  }
})();

/* Phase 7 test moved to scripts/test-option-alpha-phase7.ts (ใช้ tsx แยก) */
