/**
 * chart-carry.ts · 18 พ.ค. 2026
 *
 * 拱·夾 (Carry / Bracketing) detection · classical sifu-grade
 * Sources: 三命通會 (Sancai Tonghui) · 神峰通考 (Shenfeng Tongkao) · 命理探源
 *
 * 4 classical types (18 พ.ค. · Codex round 1 · ลบ 夾合 ออก):
 *   虛拱 (xuGong)  · 2 ใน 3 ของ 三合 · กิ่งกลาง (cardinal 子卯午酉) ไม่ในผัง
 *   夾庫 (jiaKu)   · 2 กิ่งคีบ · กิ่งกลาง ∈ {辰戌丑未} · คลังธาตุ
 *   夾祿 (jiaLu)   · 2 กิ่งคีบ · กิ่งกลาง = 祿ของ DM · strict ถ้า 日時 same DM stem
 *   夾貴 (jiaGui)  · 2 กิ่งคีบ · กิ่งกลาง ∈ 天乙貴人ของ DM · strict ถ้า 日時 same DM stem
 *
 * Activation:
 *   - ถ้า LP / 流年 / 流月 / 流日 branch == virtualBranch → activated
 *   - ถ้า沖virtualBranch (LP/year/etc.) ในขณะที่ผังมี virtual → brokenBy
 *
 * 用神 role:
 *   - tenGod ของ virtualBranch hidden main stem vs DM
 *   - jishen/yongshen tagged ถ้าธาตุของ virtualBranch ตรง yongshen[] / jishen[]
 */

const BRANCH_ORDER = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const BRANCH_EL: Record<string,string> = {
  子:'water', 丑:'earth', 寅:'wood',  卯:'wood',
  辰:'earth', 巳:'fire',  午:'fire',  未:'earth',
  申:'metal', 酉:'metal', 戌:'earth', 亥:'water',
};
const SAN_HE_SETS: Array<[string,string,string]> = [
  ['申','子','辰'], ['亥','卯','未'], ['寅','午','戌'], ['巳','酉','丑'],
];
const TOMB_BRANCHES = new Set(['辰','戌','丑','未']);
const STEM_EL: Record<string,string> = {
  甲:'wood',乙:'wood',丙:'fire',丁:'fire',戊:'earth',
  己:'earth',庚:'metal',辛:'metal',壬:'water',癸:'water',
};
const STEM_YIN_YANG: Record<string,'yang'|'yin'> = {
  甲:'yang',乙:'yin',丙:'yang',丁:'yin',戊:'yang',
  己:'yin',庚:'yang',辛:'yin',壬:'yang',癸:'yin',
};
const HIDDEN_STEMS: Record<string,{ main: string; middle?: string; residual?: string }> = {
  子:{main:'癸'},
  丑:{main:'己',middle:'癸',residual:'辛'},
  寅:{main:'甲',middle:'丙',residual:'戊'},
  卯:{main:'乙'},
  辰:{main:'戊',middle:'乙',residual:'癸'},
  巳:{main:'丙',middle:'戊',residual:'庚'},
  午:{main:'丁',middle:'己'},
  未:{main:'己',middle:'丁',residual:'乙'},
  申:{main:'庚',middle:'壬',residual:'戊'},
  酉:{main:'辛'},
  戌:{main:'戊',middle:'辛',residual:'丁'},
  亥:{main:'壬',middle:'甲'},
};
/* 祿神 lookup: DM stem → 祿 branch */
const LU_BY_STEM: Record<string,string> = {
  甲:'寅', 乙:'卯', 丙:'巳', 丁:'午', 戊:'巳',
  己:'午', 庚:'申', 辛:'酉', 壬:'亥', 癸:'子',
};
/* 天乙貴人 lookup */
const TIAN_YI: Record<string,string[]> = {
  甲:['丑','未'],戊:['丑','未'],庚:['丑','未'],
  乙:['申','子'],己:['申','子'],
  丙:['酉','亥'],丁:['酉','亥'],
  辛:['寅','午'],壬:['卯','巳'],癸:['卯','巳'],
};
/* 六合 (six-combine) · branch pairs */
const LIU_HE: Record<string,string> = {
  子:'丑', 丑:'子',
  寅:'亥', 亥:'寅',
  卯:'戌', 戌:'卯',
  辰:'酉', 酉:'辰',
  巳:'申', 申:'巳',
  午:'未', 未:'午',
};
/* 六沖 (clash) · branch opposite (idx ± 6) */
function clashOf(b: string): string {
  const idx = BRANCH_ORDER.indexOf(b);
  if (idx < 0) return '';
  return BRANCH_ORDER[(idx + 6) % 12];
}

/* ten god label · DM stem vs other stem · classical 10 gods */
function tenGodOf(dmStem: string, otherStem: string): string {
  const dmEl = STEM_EL[dmStem];
  const otEl = STEM_EL[otherStem];
  if (!dmEl || !otEl) return '';
  const dmY = STEM_YIN_YANG[dmStem];
  const otY = STEM_YIN_YANG[otherStem];
  const samePolarity = dmY === otY;
  /* 5-element relations */
  const PRODUCES: Record<string,string> = {wood:'fire',fire:'earth',earth:'metal',metal:'water',water:'wood'};
  const CONTROLS: Record<string,string> = {wood:'earth',earth:'water',water:'fire',fire:'metal',metal:'wood'};
  if (otEl === dmEl)        return samePolarity ? '比肩' : '劫財';
  if (PRODUCES[otEl] === dmEl) return samePolarity ? '偏印' : '正印';
  if (PRODUCES[dmEl] === otEl) return samePolarity ? '食神' : '傷官';
  if (CONTROLS[dmEl] === otEl) return samePolarity ? '偏財' : '正財';
  if (CONTROLS[otEl] === dmEl) return samePolarity ? '七殺' : '正官';
  return '';
}

export type Pillar = { stem: string; branch: string };
export type Pillars = { year: Pillar; month: Pillar; day: Pillar; hour: Pillar | null };

export interface CarryInfo {
  type: '虛拱' | '夾庫' | '夾祿' | '夾貴';
  type_th: string;
  type_en: string;
  sourcePillars: string[];      /* 'year'|'month'|'day'|'hour' · 2 pillars ที่สร้าง carry */
  sourceBranches: string[];     /* กิ่งที่คีบ */
  virtualBranch: string;        /* กิ่งที่ "ถูกคีบ" · ไม่อยู่ในผัง */
  virtualElement: string;
  hiddenStems: string[];        /* main+middle+residual ของ virtualBranch */
  tenGod: string;               /* 10-god ของ main hidden stem เทียบ DM */
  role: 'useful' | 'jishen' | 'neutral';
  activatedBy: string[];        /* ['LP_2025','Year_2026'] · empty ถ้ายังไม่ active */
  brokenBy: string[];           /* ['沖_LP','刑_Year'] · empty ถ้ายังไม่เสีย */
  confidence: number;           /* 0..1 · ขึ้นกับความใกล้ของ source pillars */
  strict: boolean;              /* true ถ้าเข้าเงื่อนไข 格 classical · strict pair (日時 same stem) */
  note_th: string;
  note_en: string;
}

export interface CarryDetectOpts {
  yongshenElements?: string[];   /* ['fire','earth','wood'] · ของช่วยจาก wrapper-7 */
  jishenElements?: string[];     /* ['water','metal'] */
  luckPillarBranch?: string;     /* 辰 ของ大運ปัจจุบัน · เพื่อ activation */
  annualBranch?: string;         /* 流年 */
  monthBranch?: string;          /* 流月 */
}

const PILLAR_NAMES = ['year','month','day','hour'] as const;
type PillarName = typeof PILLAR_NAMES[number];

function adjacencyConfidence(p1: PillarName, p2: PillarName): number {
  const i1 = PILLAR_NAMES.indexOf(p1);
  const i2 = PILLAR_NAMES.indexOf(p2);
  const dist = Math.abs(i1 - i2);
  if (dist === 1) return 0.90; /* ติดกัน · year-month, month-day, day-hour */
  if (dist === 2) return 0.65; /* ห่าง 1 · year-day, month-hour */
  return 0;                     /* 18 พ.ค. · Codex flag #2 · drop year-hour (dist 3) */
}

/* 18 พ.ค. · Codex flag #3 · 拱祿/拱貴格 strict conditions
 * ตำรา 三命通會·卷六 拱祿拱貴 + 神峰通考 拱祿拱貴二格:
 * - 日時 pair (D+H) · ส่วนใหญ่
 * - same DM stem · กิ่งคีบ祿/貴
 * - virtualBranch ต้องไม่อยู่ในผังเลย
 * - ห้ามมี 刑沖破害空亡 ของ virtualBranch ในผัง */
function isStrictPair(p1: PillarName, p2: PillarName, dayStem: string, otherStem: string): boolean {
  const dayHourPair = (p1 === 'day' && p2 === 'hour') || (p1 === 'hour' && p2 === 'day');
  if (!dayHourPair) return false;
  return dayStem === otherStem;
}

/** Main detector */
export function detectCarries(pillars: Pillars, opts: CarryDetectOpts = {}): CarryInfo[] {
  /* 19 พ.ค. Option α · 3p (hour=null): carry image ตาม classical ต้องมี hour pillar
   * เพราะ "拱·夾" คำนวณจากการมี 4 pillars · ถ้าขาด hour → return [] */
  if (!pillars.hour) return [];
  const dmStem = pillars.day.stem;
  const dmEl = STEM_EL[dmStem];
  const branches: Record<PillarName, string> = {
    year:  pillars.year.branch,
    month: pillars.month.branch,
    day:   pillars.day.branch,
    hour:  pillars.hour.branch,
  };
  const branchSet = new Set(Object.values(branches));
  const yongshen = new Set(opts.yongshenElements || []);
  const jishen   = new Set(opts.jishenElements || []);
  const tianYiSet = new Set(TIAN_YI[dmStem] || []);
  const luBranch = LU_BY_STEM[dmStem] || '';
  const dmBranchHe = LIU_HE[branches.day] || '';
  const carries: CarryInfo[] = [];
  const seen = new Set<string>(); /* dedup ตาม virtualBranch+sourcePillars */

  /* ─── 1. 虛拱 · 三合 missing cardinal (กิ่งกลาง子卯午酉) ─── */
  for (const set of SAN_HE_SETS) {
    const [a, cardinal, c] = set;
    if (branchSet.has(cardinal)) continue;
    const aPillars: PillarName[] = [];
    const cPillars: PillarName[] = [];
    for (const p of PILLAR_NAMES) {
      if (branches[p] === a) aPillars.push(p);
      if (branches[p] === c) cPillars.push(p);
    }
    if (!aPillars.length || !cPillars.length) continue;
    let best = { p1: aPillars[0], p2: cPillars[0], conf: 0 };
    for (const p1 of aPillars) for (const p2 of cPillars) {
      const conf = adjacencyConfidence(p1, p2);
      if (conf > best.conf) best = { p1, p2, conf };
    }
    if (best.conf <= 0) continue; /* drop year-hour */
    pushCarry(carries, seen, buildCarry({
      type: '虛拱', virtualBranch: cardinal, sourcePillars: [best.p1, best.p2], sourceBranches: [a, c],
      confidence: best.conf, dmStem, dmEl, opts, tianYiSet, luBranch, dmBranchHe, jishen, yongshen,
      strict: false, pillarsObj: pillars,
    }));
  }

  /* ─── 2-4. 夾 · 2 pillars + middle branch idx diff = 2 (drop 夾合 · Codex flag #2) ─── */
  for (let i = 0; i < PILLAR_NAMES.length; i++) {
    for (let j = i + 1; j < PILLAR_NAMES.length; j++) {
      const p1 = PILLAR_NAMES[i], p2 = PILLAR_NAMES[j];
      const conf = adjacencyConfidence(p1, p2);
      if (conf <= 0) continue; /* drop year-hour (dist 3) */
      const b1 = branches[p1], b2 = branches[p2];
      const idx1 = BRANCH_ORDER.indexOf(b1);
      const idx2 = BRANCH_ORDER.indexOf(b2);
      if (idx1 < 0 || idx2 < 0) continue;
      const diff = Math.abs(idx1 - idx2);
      const isAdjacent2 = diff === 2 || diff === 10;
      if (!isAdjacent2) continue;
      const middleIdx = (Math.min(idx1, idx2) + 1 + 12) % 12;
      let middle: string;
      if (diff === 10) {
        const wrapMiddle = (Math.max(idx1, idx2) + 1) % 12;
        middle = BRANCH_ORDER[wrapMiddle];
      } else {
        middle = BRANCH_ORDER[middleIdx];
      }
      if (branchSet.has(middle)) continue;
      let kind: CarryInfo['type'] | null = null;
      if (middle === luBranch)         kind = '夾祿';
      else if (tianYiSet.has(middle))  kind = '夾貴';
      else if (TOMB_BRANCHES.has(middle)) kind = '夾庫';
      if (!kind) continue;
      /* Codex flag #3 · strict 拱祿/拱貴格 = 日時 same DM stem */
      const otherP: PillarName = (p1 === 'day' || p2 === 'day') ? (p1 === 'day' ? p2 : p1) : p2;
      const otherStem = pillars[otherP]!.stem;  /* 3p early return ก่อน · safe */
      const strict = (kind === '夾祿' || kind === '夾貴')
        ? isStrictPair(p1, p2, dmStem, otherStem)
        : false;
      pushCarry(carries, seen, buildCarry({
        type: kind, virtualBranch: middle, sourcePillars: [p1, p2], sourceBranches: [b1, b2],
        confidence: conf, dmStem, dmEl, opts, tianYiSet, luBranch, dmBranchHe, jishen, yongshen,
        strict, pillarsObj: pillars,
      }));
    }
  }
  return carries.sort((a, b) => (Number(b.strict) - Number(a.strict)) || (b.confidence - a.confidence));
}

interface BuildCarryArgs {
  type: CarryInfo['type'];
  virtualBranch: string;
  sourcePillars: string[];
  sourceBranches: string[];
  confidence: number;
  dmStem: string;
  dmEl: string;
  opts: CarryDetectOpts;
  tianYiSet: Set<string>;
  luBranch: string;
  dmBranchHe: string;
  jishen: Set<string>;
  yongshen: Set<string>;
  strict: boolean;
  pillarsObj: Pillars;
}

function buildCarry(a: BuildCarryArgs): CarryInfo {
  const hidden = HIDDEN_STEMS[a.virtualBranch] || { main: '' };
  const hiddenList = [hidden.main, hidden.middle, hidden.residual].filter(Boolean) as string[];
  const tenGod = hidden.main ? tenGodOf(a.dmStem, hidden.main) : '';
  const vEl = BRANCH_EL[a.virtualBranch] || '';
  let role: CarryInfo['role'] = 'neutral';
  if (a.yongshen.has(vEl)) role = 'useful';
  else if (a.jishen.has(vEl)) role = 'jishen';
  /* activation · LP/year/month/day branch = virtualBranch */
  const activated: string[] = [];
  if (a.opts.luckPillarBranch === a.virtualBranch) activated.push('LP');
  if (a.opts.annualBranch === a.virtualBranch) activated.push('Year');
  if (a.opts.monthBranch === a.virtualBranch) activated.push('Month');
  /* broken · 沖virtualBranch ใน LP/year/month หรือผังมี沖virtualBranch อยู่แล้ว */
  const vClash = clashOf(a.virtualBranch);
  const broken: string[] = [];
  if (vClash) {
    if (a.opts.luckPillarBranch === vClash) broken.push('沖_LP');
    if (a.opts.annualBranch === vClash) broken.push('沖_Year');
    if (a.opts.monthBranch === vClash) broken.push('沖_Month');
    /* Codex flag #3 · ผังเองมีกิ่งที่ 沖virtualBranch → 拱格พัง */
    for (const pn of PILLAR_NAMES) {
      const ppn = a.pillarsObj[pn];
      if (ppn && ppn.branch === vClash) { broken.push(`沖_${pn}`); break; }
    }
  }
  const TYPE_TH: Record<CarryInfo['type'], string> = {
    '虛拱':'三合คีบกลาง·ขาดกิ่งกลาง',
    '夾庫':'คีบคลังธาตุ',
    '夾祿':'คีบทรัพย์ (祿)',
    '夾貴':'คีบขุนนาง (貴人)',
  };
  const TYPE_EN: Record<CarryInfo['type'], string> = {
    '虛拱':'San He carry (missing cardinal)',
    '夾庫':'Bracketing Storage',
    '夾祿':'Bracketing Lu (prosperity)',
    '夾貴':'Bracketing Nobleman',
  };
  const strictTag_th = a.strict ? ' · 拱格' : ' · 象 (อ่อน)';
  const strictTag_en = a.strict ? ' · classical 格' : ' · 象 (weak)';
  const note_th = `${TYPE_TH[a.type]} · ${a.sourceBranches.join('-')} คีบ ${a.virtualBranch}${tenGod ? ` (${tenGod})` : ''}${strictTag_th}${role === 'useful' ? ' · 用神' : role === 'jishen' ? ' · 忌神' : ''}${activated.length ? ` · เปิดโดย ${activated.join(',')}` : ''}${broken.length ? ` · 沖โดย ${broken.join(',')}` : ''}`;
  const note_en = `${TYPE_EN[a.type]} · ${a.sourceBranches.join('-')} brackets ${a.virtualBranch}${tenGod ? ` (${tenGod})` : ''}${strictTag_en}${role === 'useful' ? ' · useful' : role === 'jishen' ? ' · harmful' : ''}${activated.length ? ` · activated by ${activated.join(',')}` : ''}${broken.length ? ` · clashed by ${broken.join(',')}` : ''}`;
  return {
    type: a.type,
    type_th: TYPE_TH[a.type],
    type_en: TYPE_EN[a.type],
    sourcePillars: a.sourcePillars,
    sourceBranches: a.sourceBranches,
    virtualBranch: a.virtualBranch,
    virtualElement: vEl,
    hiddenStems: hiddenList,
    tenGod,
    role,
    activatedBy: activated,
    brokenBy: broken,
    confidence: a.confidence,
    strict: a.strict,
    note_th,
    note_en,
  };
}

function pushCarry(arr: CarryInfo[], seen: Set<string>, c: CarryInfo) {
  const k = c.type + '|' + c.virtualBranch + '|' + c.sourcePillars.join(',');
  if (seen.has(k)) return;
  seen.add(k);
  arr.push(c);
}
