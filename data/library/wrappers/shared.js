/**
 * Shared lookup tables · ใช้ใน 6 wrappers
 * Single source of truth · ห้ามให้แต่ละ wrapper ประกาศซ้ำ
 */

const STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

const STEM_ELEMENT = {
  甲:'wood', 乙:'wood',
  丙:'fire', 丁:'fire',
  戊:'earth', 己:'earth',
  庚:'metal', 辛:'metal',
  壬:'water', 癸:'water',
};

const BRANCH_ELEMENT = {
  子:'water', 亥:'water',
  寅:'wood',  卯:'wood',
  巳:'fire',  午:'fire',
  申:'metal', 酉:'metal',
  辰:'earth', 戌:'earth', 丑:'earth', 未:'earth',
};

const STEM_POLARITY = {
  甲:'yang',乙:'yin',丙:'yang',丁:'yin',戊:'yang',己:'yin',庚:'yang',辛:'yin',壬:'yang',癸:'yin'
};

const BRANCH_POLARITY = {
  子:'yang',丑:'yin',寅:'yang',卯:'yin',辰:'yang',巳:'yin',午:'yang',未:'yin',申:'yang',酉:'yin',戌:'yang',亥:'yin'
};

// 12 branches → hidden stems (main, middle, residual)
// from sesheta-bazi-lookup-tables.json (verified 12/12 against classical)
const HIDDEN_STEMS = {
  子: { main: '癸', middle: null, residual: null },
  丑: { main: '己', middle: '癸', residual: '辛' },
  寅: { main: '甲', middle: '丙', residual: '戊' },
  卯: { main: '乙', middle: null, residual: null },
  辰: { main: '戊', middle: '乙', residual: '癸' },
  巳: { main: '丙', middle: '戊', residual: '庚' },
  午: { main: '丁', middle: '己', residual: null },
  未: { main: '己', middle: '丁', residual: '乙' },
  申: { main: '庚', middle: '壬', residual: '戊' },
  酉: { main: '辛', middle: null, residual: null },
  戌: { main: '戊', middle: '辛', residual: '丁' },
  亥: { main: '壬', middle: '甲', residual: null },
};

// 5 stem combinations (5合) + transformation element + required branches
const STEM_COMBOS = {
  '甲己': { transformsTo: 'earth', requiredBranches: ['辰','午','戌','丑','未'], partner1: '甲', partner2: '己' },
  '乙庚': { transformsTo: 'metal', requiredBranches: ['丑','未','酉','申'],     partner1: '乙', partner2: '庚' },
  '丙辛': { transformsTo: 'water', requiredBranches: ['子','辰','申','亥'],     partner1: '丙', partner2: '辛' },
  '丁壬': { transformsTo: 'wood',  requiredBranches: ['亥','卯','寅','未'],     partner1: '丁', partner2: '壬' },
  '戊癸': { transformsTo: 'fire',  requiredBranches: ['寅','午','戌','巳'],     partner1: '戊', partner2: '癸' },
};

// Ten Gods table: dayMaster -> targetStem -> god code
// Generated from classical rule:
//   same element + same polarity = 比肩 (Friend)
//   same element + diff polarity = 劫財 (Rob Wealth)
//   produced (output) + same pol = 食神 (Eating God)
//   produced (output) + diff pol = 傷官 (Hurting Officer)
//   wealth (DM controls) + same pol = 偏財 (Indirect Wealth)
//   wealth (DM controls) + diff pol = 正財 (Direct Wealth)
//   officer (controls DM) + same pol = 七殺 (Seven Killings)
//   officer (controls DM) + diff pol = 正官 (Direct Officer)
//   resource (produces DM) + same pol = 偏印 (Indirect Resource)
//   resource (produces DM) + diff pol = 正印 (Direct Resource)
const ELEMENT_PRODUCES = { wood:'fire', fire:'earth', earth:'metal', metal:'water', water:'wood' };
const ELEMENT_CONTROLS = { wood:'earth', earth:'water', water:'fire', fire:'metal', metal:'wood' };

function tenGod(dayMaster, targetStem) {
  const dmEl = STEM_ELEMENT[dayMaster];
  const tEl  = STEM_ELEMENT[targetStem];
  const dmPol = STEM_POLARITY[dayMaster];
  const tPol  = STEM_POLARITY[targetStem];
  const samePol = dmPol === tPol;

  if (dmEl === tEl)                           return samePol ? '比肩' : '劫財';
  if (ELEMENT_PRODUCES[dmEl] === tEl)         return samePol ? '食神' : '傷官';  // DM produces target
  if (ELEMENT_CONTROLS[dmEl] === tEl)         return samePol ? '偏財' : '正財';  // DM controls target
  if (ELEMENT_CONTROLS[tEl] === dmEl)         return samePol ? '七殺' : '正官';  // target controls DM
  if (ELEMENT_PRODUCES[tEl] === dmEl)         return samePol ? '偏印' : '正印';  // target produces DM
  return null;
}

// Useful God 5-rank per DM (from sesheta-useful-god-ranks.json · verified)
const USEFUL_GOD_RANKS = {
  甲: ['甲','乙','庚','壬','癸'],
  乙: ['甲','乙','辛','壬','癸'],
  丙: ['丙','丁','甲','乙','壬'],
  丁: ['甲','乙','丙','丁','癸'],
  戊: ['己','戊','丙','丁','甲'],
  己: ['乙','戊','己','丙','丁'],
  庚: ['丙','戊','己','辛','庚'],
  辛: ['庚','辛','戊','己','丁'],
  壬: ['庚','辛','壬','癸','戊'],
  癸: ['庚','辛','壬','癸','己'],
};

// Branch interaction tables (classical)
const SIX_CLASH = {
  子:'午',午:'子', 丑:'未',未:'丑', 寅:'申',申:'寅',
  卯:'酉',酉:'卯', 辰:'戌',戌:'辰', 巳:'亥',亥:'巳',
};

const SIX_HE = {  // 六合
  子:'丑',丑:'子', 寅:'亥',亥:'寅', 卯:'戌',戌:'卯',
  辰:'酉',酉:'辰', 巳:'申',申:'巳', 午:'未',未:'午',
};

const SIX_HARM = {  // 六害
  子:'未',未:'子', 丑:'午',午:'丑', 寅:'巳',巳:'寅',
  卯:'辰',辰:'卯', 申:'亥',亥:'申', 酉:'戌',戌:'酉',
};

const SIX_DESTROY = {  // 六破
  子:'酉',酉:'子', 丑:'辰',辰:'丑', 寅:'亥',亥:'寅',
  卯:'午',午:'卯', 巳:'申',申:'巳', 未:'戌',戌:'未',
};

const SAN_HE = [  // 三合 trinity
  { branches:['申','子','辰'], element:'water' },
  { branches:['亥','卯','未'], element:'wood'  },
  { branches:['寅','午','戌'], element:'fire'  },
  { branches:['巳','酉','丑'], element:'metal' },
];

const SAN_HUI = [  // 三會 directional
  { branches:['寅','卯','辰'], element:'wood'  },
  { branches:['巳','午','未'], element:'fire'  },
  { branches:['申','酉','戌'], element:'metal' },
  { branches:['亥','子','丑'], element:'water' },
];

// Crisis season (Tiao Hou)
const CRISIS_SEASON = {
  cold:     ['子','亥','丑'],   // winter → need fire
  damp:     ['辰','丑','酉'],   // wet earth → need fire
  scorched: ['巳','午','未'],   // summer → need water
  dry:      ['戌','未','酉','申'],   // autumn dry → need water (added 申 · Voytek-aligned 6 พ.ค.)
};

// Heater / cooler list (bridge elements)
const HEATER = ['丙','丁','午','巳'];     // strong fire
const COOLER = ['壬','癸','子','亥'];     // strong water

// Strength: 12 phases multipliers (Sesheta)
const TWELVE_PHASE_MULT = {
  '帝旺':1.5, '臨官':1.4, '長生':1.3, '冠帶':1.2, '沐浴':1.1,
  '養':0.7, '胎':0.6, '絕':0.5, '墓':0.6, '死':0.7, '病':0.8, '衰':0.9,
};

// Stem 12-phase anchor index (in branch order, starting 寅 for 甲)
// Yang stems go forward, Yin stems go backward
const STEM_ANCHOR = {
  甲:{ start:'亥', dir:1 }, 丙:{ start:'寅', dir:1 }, 戊:{ start:'寅', dir:1 },
  庚:{ start:'巳', dir:1 }, 壬:{ start:'申', dir:1 },
  乙:{ start:'午', dir:-1}, 丁:{ start:'酉', dir:-1}, 己:{ start:'酉', dir:-1},
  辛:{ start:'子', dir:-1}, 癸:{ start:'卯', dir:-1},
};
const PHASE_ORDER = ['長生','沐浴','冠帶','臨官','帝旺','衰','病','死','墓','絕','胎','養'];

function twelvePhase(stem, branch) {
  const anchor = STEM_ANCHOR[stem];
  if (!anchor) return null;
  const startIdx = BRANCHES.indexOf(anchor.start);
  const branchIdx = BRANCHES.indexOf(branch);
  let offset = (branchIdx - startIdx) * anchor.dir;
  offset = ((offset % 12) + 12) % 12;
  return PHASE_ORDER[offset];
}

// Position weights (Sesheta scoring engine)
const POSITION_WEIGHT = { year:0.8, month:1.6, day:1.0, hour:0.9 };

module.exports = {
  STEMS, BRANCHES,
  STEM_ELEMENT, BRANCH_ELEMENT,
  STEM_POLARITY, BRANCH_POLARITY,
  HIDDEN_STEMS, STEM_COMBOS,
  ELEMENT_PRODUCES, ELEMENT_CONTROLS,
  tenGod, twelvePhase,
  USEFUL_GOD_RANKS,
  SIX_CLASH, SIX_HE, SIX_HARM, SIX_DESTROY, SAN_HE, SAN_HUI,
  CRISIS_SEASON, HEATER, COOLER,
  TWELVE_PHASE_MULT, POSITION_WEIGHT,
  STEM_ANCHOR, PHASE_ORDER,
};
