/**
 * Follow detector · TARGETED rule dry-run (NOT applied to production)
 *
 * Rule (Scenario T):
 *   trigger เฉพาะ DM ใน {胎, 絕} extreme weak phase
 *   AND dm_share <= 6
 *   AND (root + resource_count + bi_jie_count) <= 1
 *   → bump เป็น false_follow
 *   → cap confidence ≤ 75 (ห้ามถึง 80 = auto-trust threshold)
 *
 * Reference: Base threshold 35 ยังเป็น production
 * Goal: ครอบ Pun · ไม่ noise Mai/Keng/Pa/Dohk1950 · Aeaw ไม่เกิน 75
 */
const S = require('../data/library/wrappers/shared.js');
const { detectFollow } = require('../data/library/wrappers/follow-detector.js');

const TARGET_PHASES = ['胎','絕'];
const CONF_CAP = 75;

function applyTargetedRule(natal, prod) {
  const phase = S.twelvePhase(natal.day.stem, natal.month.branch);
  const dmShare = prod.evidence.dominant_force.dm_share_pct;
  const root = prod.evidence.dm_root;
  const resource = prod.evidence.resource_presence.count;
  const biJie = prod.evidence.bi_jie_presence.count;
  const blockerSum = root + resource + biJie;

  const triggers = TARGET_PHASES.includes(phase) && dmShare <= 6 && blockerSum <= 2;

  if (triggers && prod.follow_type !== 'true_follow') {
    return {
      ...prod,
      follow_type: 'false_follow',
      follow_candidate: true,
      confidence: Math.min(CONF_CAP, prod.confidence + 10),
      _targeted_rule_fired: true,
      _phase: phase,
      _blocker_sum: blockerSum,
    };
  }
  return { ...prod, _targeted_rule_fired: false, _phase: phase, _blocker_sum: blockerSum };
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

console.log('═══ TARGETED RULE T · DRY-RUN (NOT applied) ═══');
console.log('Trigger: phase ∈ {胎,絕} + dm_share ≤ 6 + (root+res+biJie) ≤ 2');
console.log('Cap    : confidence ≤ 75');
console.log('');

const header = 'chart        | DM | phase | dm% | root|res|biJ | base                  | targeted              | fired? | over75?';
console.log(header);
console.log('-'.repeat(header.length));

let firedCount = 0, autoTrustRisk = 0;
const summary = [];
for (const c of CHARTS) {
  const prod = detectFollow(c.pillars);
  const t = applyTargetedRule(c.pillars, prod);
  if (t._targeted_rule_fired) firedCount++;
  if (t.confidence >= 80) autoTrustRisk++;
  const fmt = (r) => `${r.follow_type}/${r.confidence}`.padEnd(22);
  console.log(
    `${c.id.padEnd(12)} | ${c.pillars.day.stem}  | ${t._phase.padEnd(4)} | ${String(prod.evidence.dominant_force.dm_share_pct).padStart(3)} | ${prod.evidence.dm_root}   |${prod.evidence.resource_presence.count}  |${prod.evidence.bi_jie_presence.count}    | ${fmt(prod)} | ${fmt(t)} | ${t._targeted_rule_fired ? '🔥 yes' : '·    '} | ${t.confidence >= 80 ? '⚠ YES' : ' no'}`
  );
  summary.push({ id: c.id, base: prod.follow_type, targeted: t.follow_type, fired: t._targeted_rule_fired, conf: t.confidence });
}

console.log('');
console.log('━━━ SUMMARY ━━━');
console.log(`  Rule fired         : ${firedCount}/15 charts`);
console.log(`  Auto-trust risk    : ${autoTrustRisk}/15 (conf ≥ 80)`);
console.log('');
console.log('  Per chart:');
for (const s of summary) {
  const change = s.base !== s.targeted ? ' 🔄 changed' : '';
  console.log(`    ${s.id.padEnd(12)} ${s.base.padEnd(13)} → ${s.targeted.padEnd(13)} (conf ${s.conf})${change}`);
}

console.log('');
console.log('━━━ ACCEPTANCE CRITERIA ━━━');
const punFired = summary.find(s => s.id === 'Pun')?.fired;
const aeawConf = summary.find(s => s.id === 'Aeaw')?.conf;
const aeawSafe = aeawConf < 80;
const noiseChanged = summary.filter(s => ['Mai','Keng','Pa','Dohk1950'].includes(s.id) && s.base !== s.targeted).length;
console.log(`  ✓ Pun bumped to false_follow      : ${punFired ? '✅' : '❌'}`);
console.log(`  ✓ Aeaw confidence < 80 (no auto)  : ${aeawSafe ? '✅' : '❌'} (got ${aeawConf})`);
console.log(`  ✓ Mai/Keng/Pa/Dohk1950 not noise  : ${noiseChanged === 0 ? '✅' : '❌ ('+noiseChanged+' changed)'}`);
console.log('');
console.log('🔒 Rule status: DRY-RUN ONLY · NOT applied to production · awaiting approval');
