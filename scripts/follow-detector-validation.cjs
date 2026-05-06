/**
 * Follow detector · read-only validation
 * Test 15 charts · report distribution + per-case evidence
 * - DB profiles 4 (ผ่าน calcBazi)
 * - fixtures 2 (Mai/เคง)
 * - external charts 9 (Pun/โชกุน/ติก/ป๊า/AubMax6/7/ดหก50/67/หกฟ87)
 *
 * Rule: ถ้า confidence < 80 = inspect_only
 *       ห้าม use เปลี่ยน Yongshen
 */
const { detectFollow } = require('../data/library/wrappers/follow-detector.js');

// natal pillars สำหรับ 15 charts (ใช้ pillars ที่ verify แล้วจาก session ที่ผ่านมา)
const CHARTS = [
  // DB profiles (4)
  { id:'Aeaw',     ctx:'DB',      pillars:{ year:{stem:'甲',branch:'子'}, month:{stem:'丙',branch:'子'}, day:{stem:'己',branch:'亥'}, hour:{stem:'庚',branch:'午'} } },
  { id:'NightNew', ctx:'DB(dup)', pillars:{ year:{stem:'甲',branch:'子'}, month:{stem:'丙',branch:'子'}, day:{stem:'己',branch:'亥'}, hour:{stem:'庚',branch:'午'} }, note:'birth_datetime ซ้ำ Aeaw bug suspect' },
  { id:'p1',       ctx:'DB',      pillars:{ year:{stem:'己',branch:'巳'}, month:{stem:'丁',branch:'丑'}, day:{stem:'庚',branch:'辰'}, hour:{stem:'辛',branch:'巳'} } },
  { id:'p2',       ctx:'DB',      pillars:{ year:{stem:'庚',branch:'午'}, month:{stem:'戊',branch:'寅'}, day:{stem:'辛',branch:'亥'}, hour:{stem:'癸',branch:'巳'} } },
  // fixtures (2)
  { id:'Mai',      ctx:'fixture', pillars:{ year:{stem:'丙',branch:'寅'}, month:{stem:'壬',branch:'辰'}, day:{stem:'丙',branch:'戌'}, hour:{stem:'丙',branch:'申'} } },
  { id:'Keng',     ctx:'fixture', pillars:{ year:{stem:'丁',branch:'卯'}, month:{stem:'丁',branch:'未'}, day:{stem:'戊',branch:'寅'}, hour:{stem:'癸',branch:'亥'} } },
  // external charts from session (9)
  { id:'Pun',         ctx:'session', pillars:{ year:{stem:'甲',branch:'辰'}, month:{stem:'庚',branch:'午'}, day:{stem:'壬',branch:'寅'}, hour:{stem:'乙',branch:'巳'} }, note:'Voytek: false-extreme-weak' },
  { id:'Shogun',      ctx:'session', pillars:{ year:{stem:'甲',branch:'辰'}, month:{stem:'壬',branch:'申'}, day:{stem:'壬',branch:'申'}, hour:{stem:'乙',branch:'巳'} } },
  { id:'Tik',         ctx:'session', pillars:{ year:{stem:'乙',branch:'丑'}, month:{stem:'己',branch:'丑'}, day:{stem:'乙',branch:'卯'}, hour:{stem:'己',branch:'卯'} } },
  { id:'Pa',          ctx:'session', pillars:{ year:{stem:'甲',branch:'辰'}, month:{stem:'甲',branch:'戌'}, day:{stem:'甲',branch:'寅'}, hour:{stem:'乙',branch:'巳'} } },
  { id:'AubMax6',     ctx:'session', pillars:{ year:{stem:'癸',branch:'卯'}, month:{stem:'丁',branch:'巳'}, day:{stem:'辛',branch:'酉'}, hour:{stem:'甲',branch:'午'} } },
  { id:'AubMax7',     ctx:'session', pillars:{ year:{stem:'癸',branch:'卯'}, month:{stem:'戊',branch:'午'}, day:{stem:'辛',branch:'卯'}, hour:{stem:'甲',branch:'午'} } },
  { id:'Dohk1950',    ctx:'session', pillars:{ year:{stem:'庚',branch:'寅'}, month:{stem:'壬',branch:'午'}, day:{stem:'戊',branch:'戌'}, hour:{stem:'戊',branch:'午'} } },
  { id:'Dohk1967',    ctx:'session', pillars:{ year:{stem:'丁',branch:'未'}, month:{stem:'庚',branch:'戌'}, day:{stem:'癸',branch:'酉'}, hour:{stem:'戊',branch:'午'} } },
  { id:'Hokf1987',    ctx:'session', pillars:{ year:{stem:'丁',branch:'卯'}, month:{stem:'庚',branch:'戌'}, day:{stem:'戊',branch:'午'}, hour:{stem:'戊',branch:'午'} } },
];

console.log('═══ FOLLOW DETECTOR · READ-ONLY VALIDATION ═══');
console.log('Total charts:', CHARTS.length, '· Rule: confidence < 80 = inspect_only\n');

const dist = { true_follow: 0, false_follow: 0, weak_normal: 0, ambiguous: 0 };
const inspectOnly = [];
const rows = [];

for (const c of CHARTS) {
  const r = detectFollow(c.pillars);
  dist[r.follow_type]++;
  const isInspect = r.confidence < 80;
  if (isInspect) inspectOnly.push(c.id);
  rows.push({ id: c.id, ctx: c.ctx, dm: c.pillars.day.stem, ...r, isInspect, note: c.note });
}

// Per-case detail
console.log('━━━ PER-CASE EVIDENCE ━━━');
for (const r of rows) {
  console.log(`▶ ${r.id.padEnd(11)} [${r.ctx}] DM=${r.dm}`);
  console.log(`  type=${r.follow_type.padEnd(13)} cand=${String(r.follow_candidate).padEnd(5)} conf=${String(r.confidence).padStart(3)}${r.isInspect ? ' 🔵 inspect-only' : ''}`);
  console.log(`  dm_root=${r.evidence.dm_root}  dom=${r.evidence.dominant_force.element}/${r.evidence.dominant_force.share_pct}%  dm_share=${r.evidence.dominant_force.dm_share_pct}%  month=${r.evidence.month_command.role_for_dm}`);
  console.log(`  resource=${r.evidence.resource_presence.count}  bi_jie=${r.evidence.bi_jie_presence.count}  blockers=${r.evidence.blockers.length}`);
  if (r.evidence.blockers.length) {
    for (const b of r.evidence.blockers) console.log('    · ' + b);
  }
  if (r.note) console.log('  📝 ' + r.note);
  console.log('');
}

// Distribution
console.log('━━━ DISTRIBUTION (15 charts) ━━━');
console.log(`  true_follow  : ${dist.true_follow}`);
console.log(`  false_follow : ${dist.false_follow}`);
console.log(`  weak_normal  : ${dist.weak_normal}`);
console.log(`  ambiguous    : ${dist.ambiguous}`);

// Inspect-only flag
console.log('');
console.log('━━━ INSPECT-ONLY (confidence < 80) ━━━');
if (inspectOnly.length === 0) {
  console.log('  (ไม่มี · ทุกเคส confidence ≥ 80)');
} else {
  console.log(`  ${inspectOnly.length}/15 charts: ${inspectOnly.join(', ')}`);
}

// Final reminder
console.log('');
console.log('━━━ RULE ━━━');
console.log('  🔒 ห้ามใช้ followAnalysis เปลี่ยน Yongshen จนกว่าจะอนุมัติ');
console.log('  🔒 followAnalysis = เครื่องเตือน · ไม่ใช่เครื่องตัดสิน');
console.log('  🔒 confidence < 80 = inspect-only · human review');
console.log('');
console.log('━━━ EDGE CASE NOTE (6 พ.ค. 2026) ━━━');
console.log('  Pun may be false-follow candidate due to extreme weak phase (DM 壬 in 午=胎),');
console.log('  but global threshold 30 causes too many false alarms (Mai/Keng/Pa/Dohk1950).');
console.log('  Production stays Base threshold 35. Pun = manual inspect.');
