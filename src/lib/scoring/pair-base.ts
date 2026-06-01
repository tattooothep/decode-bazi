/**
 * POST /api/network/score
 *
 * Body: {
 *   self:   { day:{stem,branch}, year:{stem,branch}, month:{stem,branch}, hour:{stem,branch} },
 *   others: [ { id, day, year, month, hour } ]
 * }
 *
 * Returns: {
 *   scores: { [id]: { day, week, month, year, luck } },
 *   tags:   { [id]: string[] }
 * }
 *
 * Logic: stem 合/沖 + branch 六合/三合/沖/刑/害/破 + element 生/克/比 → × tf weight
 * Source: data/hourkey-v8/decode-interaction-matrix.json (scoring_weights · interaction tables)
 */
// pair-base.ts · extracted 18 พ.ค. จาก /api/network/score · Single Source of Truth (อากง 10 rules)

export type Pillar = { stem: string; branch: string };
export type Pillars = { day: Pillar; year?: Pillar; month?: Pillar; hour?: Pillar };
export type Person = Pillars & { id?: string };

export const STEM_ELEMENT: Record<string, string> = {
  '甲':'wood','乙':'wood','丙':'fire','丁':'fire','戊':'earth','己':'earth',
  '庚':'metal','辛':'metal','壬':'water','癸':'water'
};
export const BRANCH_ELEMENT: Record<string, string> = {
  '子':'water','丑':'earth','寅':'wood','卯':'wood','辰':'earth','巳':'fire',
  '午':'fire','未':'earth','申':'metal','酉':'metal','戌':'earth','亥':'water'
};

export const STEM_HE: Record<string, string> = {
  '甲':'己','己':'甲','乙':'庚','庚':'乙',
  '丙':'辛','辛':'丙','丁':'壬','壬':'丁','戊':'癸','癸':'戊'
};
export const STEM_CLASH: Record<string, string> = {
  '甲':'庚','庚':'甲','乙':'辛','辛':'乙',
  '丙':'壬','壬':'丙','丁':'癸','癸':'丁'
};

export const LIU_HE: Record<string, string> = {
  '子':'丑','丑':'子','寅':'亥','亥':'寅',
  '卯':'戌','戌':'卯','辰':'酉','酉':'辰',
  '巳':'申','申':'巳','午':'未','未':'午'
};
export const SAN_HE_GROUPS: { branches: string[]; element: string }[] = [
  { branches:['申','子','辰'], element:'water' },
  { branches:['寅','午','戌'], element:'fire'  },
  { branches:['巳','酉','丑'], element:'metal' },
  { branches:['亥','卯','未'], element:'wood'  },
];
/* 三會 · พลังฤดูทั้ง ๔ ทิศ · แรงกว่า 三合 */
export const SAN_HUI_GROUPS: { branches: string[]; element: string }[] = [
  { branches:['寅','卯','辰'], element:'wood'  },
  { branches:['巳','午','未'], element:'fire'  },
  { branches:['申','酉','戌'], element:'metal' },
  { branches:['亥','子','丑'], element:'water' },
];
/* 天合化 · 5 คู่ stem ที่หลอมแล้วเป็นธาตุใหม่ */
export const STEM_HE_TRANSFORM: Record<string, string> = {
  '甲己':'earth', '己甲':'earth',
  '乙庚':'metal', '庚乙':'metal',
  '丙辛':'water', '辛丙':'water',
  '丁壬':'wood',  '壬丁':'wood',
  '戊癸':'fire',  '癸戊':'fire',
};
/* 六合 transformed element (ส่วนใหญ่ไม่ transform เด่นเท่า 三合 · เก็บไว้สำหรับ tag) */
export const LIU_HE_TRANSFORM: Record<string, string> = {
  '子丑':'earth', '丑子':'earth',
  '寅亥':'wood',  '亥寅':'wood',
  '卯戌':'fire',  '戌卯':'fire',
  '辰酉':'metal', '酉辰':'metal',
  '巳申':'water', '申巳':'water',
  '午未':'fire',  '未午':'fire',
};
export const BRANCH_CLASH: Record<string, string> = {
  '子':'午','午':'子','丑':'未','未':'丑',
  '寅':'申','申':'寅','卯':'酉','酉':'卯',
  '辰':'戌','戌':'辰','巳':'亥','亥':'巳'
};
export const LIU_HAI: Record<string, string> = {
  '子':'未','未':'子','丑':'午','午':'丑',
  '寅':'巳','巳':'寅','卯':'辰','辰':'卯',
  '申':'亥','亥':'申','酉':'戌','戌':'酉'
};
export const LIU_PO: Record<string, string> = {
  '子':'酉','酉':'子','卯':'午','午':'卯',
  '寅':'亥','亥':'寅','巳':'申','申':'巳',
  '辰':'丑','丑':'辰','戌':'未','未':'戌'
};
export const XING_TRIPLES: string[][] = [['寅','巳','申'],['丑','戌','未']];
export const XING_PAIRS: string[][] = [['子','卯']];
export const XING_SELF: string[] = ['辰','午','酉','亥'];

/* tf weights · จาก decode-interaction-matrix.json metadata.scoring_weights */
export const TF_WEIGHT: Record<string, number> = {
  day:   0.15,  // liu_ri
  week:  0.18,  // (avg liu_ri+liu_yue/2 ≈ ผมประมาณ)
  month: 0.20,  // liu_yue
  year:  0.25,  // liu_nian
  luck:  0.30,  // da_yun
};

/* Element relations: 生 (productive +), 克 (controlling -), 比 (same =0) */
export const ELEM_PRODUCES: Record<string, string> = {
  wood:'fire', fire:'earth', earth:'metal', metal:'water', water:'wood'
};
export const ELEM_CONTROLS: Record<string, string> = {
  wood:'earth', earth:'water', water:'fire', fire:'metal', metal:'wood'
};

/* Score weights — base (สูงสุด ±100 ก่อน tf modifier) */
export const W = {
  STEM_HE: 22,         // 合 stems
  STEM_CLASH: -28,     // 沖 stems
  LIU_HE: 18,          // 六合 branches
  SAN_HE_FULL: 32,     // 三合 ครบ 3
  SAN_HE_PARTIAL: 14,  // 三合 ครึ่ง (2 ใน 3)
  BRANCH_CLASH: -22,   // 沖 branches
  LIU_HAI: -10,        // 害
  LIU_PO: -7,          // 破
  XING_TRIPLE: -16,    // 刑 (寅巳申, 丑戌未)
  XING_PAIR: -12,      // 刑 (子卯)
  XING_SELF: -6,       // 自刑
  ELEM_PRODUCES: 8,    // 生 (A → B)
  ELEM_PRODUCED: 12,   // 被生 (A ← B · cleaner support)
  ELEM_CONTROLS: -6,   // 克 (A → B)
  ELEM_CONTROLLED: -10,// 被克 (A ← B)
  ELEM_SAME: 4,        // 比 (same element · 比肩)
  /* 🎯 User-specific layer · ตามตำราจีน wrapper-6 yongshen */
  YONGSHEN_PRIMARY: 18,   // 用神 ลำดับ 1 ตรงกับ DM ของคู่
  YONGSHEN_SECONDARY: 12, // 用神 ลำดับ 2-3
  JISHEN_PENALTY: -10,    // 忌神 ตรงกับ DM ของคู่
  /* 📜 อากง · 10 rules · ตำราคลาสสิก */
  SAN_HUI_FULL: 35,       // 三會 ฤดูเต็ม
  SAN_HUI_PARTIAL: 16,    // 半三會
  JISHEN_HEAVY: -18,      // 忌神 อยู่ที่เดือน + DM อ่อน (เลวกว่าปกติ)
  CHONG_KILLS_JISHEN: 11, // 沖ทำลาย忌神 → กลับเป็นบวก
  YONGSHEN_UNCERTAIN_CAP: 8, // ย่งเสินยังไม่ชัด · cap bonus
  /* 📜 อากง 9 ข้อใหม่ (15 พ.ค.) · context-aware sanhe/sanhui */
  SAN_HE_PARTIAL_TO_YONGSHEN: 18,
  SAN_HE_PARTIAL_TO_XISHEN: 12,
  SAN_HE_PARTIAL_NEUTRAL: 6,
  SAN_HE_PARTIAL_TO_JISHEN: -16,
  SAN_HE_PARTIAL_TO_JISHEN_HEAVY: -25,
  /* Caps */
  SINGLE_INTERACTION_CAP: 45,
  CATEGORY_CAP_BRANCH: 70,
  CATEGORY_CAP_DM: 50,
  STABILITY_PENALTY: -8,  // ถ้าบวกมาจาก clash เยอะ
};

export function safeStem(p?: Pillar): string { return (p && p.stem) || ''; }
export function safeBranch(p?: Pillar): string { return (p && p.branch) || ''; }
export function getBranches(person: Person): string[] {
  return ['year','month','day','hour']
    .map(k => safeBranch((person as any)[k]))
    .filter(Boolean);
}

/**
 * Compute pair base score (raw · before tf modifier)
 * ใช้ day stem + 4 branches เป็นหลัก + yongshen/jishen layer (user-specific)
 */
export function pairBaseScore(
  a: Person, b: Person,
  selfYongshen?: string[],   /* ['fire','wood'] · จาก wrapper-6 */
  selfJishen?: string[],     /* ['water','metal'] · ตรงข้าม */
  opts?: {
    selfStrengthUncertain?: boolean;  // strength confidence ต่ำ · cap +8
    selfDmWeak?: boolean;              // DM อ่อน · 忌神 ทวีคูณ
    jishenInMonth?: boolean;           // 忌神 อยู่ที่เดือน + DM อ่อน
    structureYongshen?: string[];      // 從格 yongshen override
    aYongshen?: any;                   // 📜 wrapper-7 yongshen v2 ของ a · อากง 15 พ.ค.
    bYongshen?: any;                   // 📜 wrapper-7 yongshen v2 ของ b
  },
): { score: number; tags: string[]; flags: string[]; bd: { bonus: number; penalty: number; base: number; events: string[] } } {
  let score = 0;
  const tags: string[] = [];
  const flags: string[] = [];   /* 📜 compound_flags · บันทึกตรรกะที่ใช้ */
  const adjustmentEvents: Array<{ label: string; weight: number }> = [];
  const aDay = a.day, bDay = b.day;
  if (!aDay || !bDay) return { score: 0, tags: [], flags: [], bd: { bonus:0, penalty:0, base:0, events:[] } };

  /* 📜 ใช้ structure yongshen override ถ้ามี (rule 10) */
  let effectiveYongshen = selfYongshen || [];
  if (opts?.structureYongshen && opts.structureYongshen.length) {
    effectiveYongshen = opts.structureYongshen;
    flags.push('structure_override');
  }

  /* 1. stem-stem (day) + 天合化 transform · rule 3-5 */
  let stemHeOccurred = false;
  let transformedElement: string | null = null;
  if (STEM_HE[aDay.stem] === bDay.stem) {
    stemHeOccurred = true;
    const transKey = aDay.stem + bDay.stem;
    transformedElement = STEM_HE_TRANSFORM[transKey] || null;
    tags.push('合');
    if (transformedElement && effectiveYongshen.includes(transformedElement)) {
      /* rule 3: 合化用神 = full + */
      score += W.STEM_HE;
      flags.push('合化用神');
      tags.push('合化用神');
    } else if (transformedElement && selfJishen && selfJishen.includes(transformedElement)) {
      /* rule 5: 合化忌神 = 0~-12 · กลับเป็นโทษ */
      score += -12;
      flags.push('合化忌神');
      tags.push('合化忌神');
    } else if (transformedElement) {
      /* rule 4: 合化เฉย = positive × 0.5 */
      score += Math.round(W.STEM_HE * 0.5);
      flags.push('合化neutral');
      tags.push('合化เฉย');
    } else {
      score += W.STEM_HE;  /* default ไม่มี transform · ใช้ค่าปกติ */
    }
  }
  if (STEM_CLASH[aDay.stem] === bDay.stem) { score += W.STEM_CLASH; tags.push('沖'); }

  /* 📜 Phase 1 · Four Pillars stem matching · year-year · month-month · hour-hour
   * weight reduced เพราะไม่ใช่ day pillar (primary) · 60-70% ของ day weight */
  const otherPillars = ['year','month','hour'] as const;
  const PILLAR_WEIGHT_RATIO: Record<string, number> = { year:0.6, month:0.7, hour:0.6 };
  for (const k of otherPillars) {
    const aP = (a as any)[k] as Pillar | undefined;
    const bP = (b as any)[k] as Pillar | undefined;
    if (!aP || !bP || !aP.stem || !bP.stem) continue;
    const ratio = PILLAR_WEIGHT_RATIO[k] || 0.6;
    /* 天合 cross-pillar */
    if (STEM_HE[aP.stem] === bP.stem) {
      const v = Math.round(W.STEM_HE * ratio);
      score += v;
      tags.push(`${k}合`);
    }
    /* 天剋 cross-pillar */
    if (STEM_CLASH[aP.stem] === bP.stem) {
      const v = Math.round(W.STEM_CLASH * ratio);
      score += v;
      tags.push(`${k}剋`);
    }
  }

  /* 2. branch-branch (day-day · primary) */
  if (LIU_HE[aDay.branch] === bDay.branch) { score += W.LIU_HE; tags.push('六合'); }
  /* 沖 ของ day branch · ดูว่าทำลาย忌神 ไหม (rule 6) */
  let dayClashHandled = false;
  if (BRANCH_CLASH[aDay.branch] === bDay.branch) {
    const bBranchElem = BRANCH_ELEMENT[bDay.branch];
    if (bBranchElem && selfJishen && selfJishen.includes(bBranchElem)) {
      /* rule 6: 沖ทำลาย忌神 · ใช้ +11 (range 8-14) */
      score += W.CHONG_KILLS_JISHEN;
      tags.push('沖去忌神 ⚠');
      flags.push('沖去忌神');
      dayClashHandled = true;
    } else {
      score += W.BRANCH_CLASH;
      tags.push('沖');
    }
  }
  if (LIU_HAI[aDay.branch] === bDay.branch) { score += W.LIU_HAI; tags.push('害'); }
  if (LIU_PO[aDay.branch] === bDay.branch) { score += W.LIU_PO; tags.push('破'); }
  /* 刑 */
  for (const trip of XING_TRIPLES) {
    if (trip.includes(aDay.branch) && trip.includes(bDay.branch) && aDay.branch !== bDay.branch) {
      score += W.XING_TRIPLE; tags.push('刑'); break;
    }
  }
  for (const pair of XING_PAIRS) {
    if (pair.includes(aDay.branch) && pair.includes(bDay.branch) && aDay.branch !== bDay.branch) {
      score += W.XING_PAIR; tags.push('刑'); break;
    }
  }
  if (XING_SELF.includes(aDay.branch) && aDay.branch === bDay.branch) {
    score += W.XING_SELF; tags.push('自刑');
  }

  /* 📜 #4 · Cross-pillar branch interactions · year-year, month-month, hour-hour
   * weight ratio ลดลง · 50-60% ของ day branch (primary) */
  const BR_RATIO: Record<string, number> = { year:0.5, month:0.6, hour:0.5 };
  for (const k of otherPillars) {
    const aP = (a as any)[k] as Pillar | undefined;
    const bP = (b as any)[k] as Pillar | undefined;
    if (!aP || !bP || !aP.branch || !bP.branch) continue;
    const r = BR_RATIO[k] || 0.5;
    if (LIU_HE[aP.branch] === bP.branch) {
      score += Math.round(W.LIU_HE * r);
      tags.push(`${k}六合`);
    }
    if (BRANCH_CLASH[aP.branch] === bP.branch) {
      score += Math.round(W.BRANCH_CLASH * r);
      tags.push(`${k}沖`);
    }
    if (LIU_HAI[aP.branch] === bP.branch) {
      score += Math.round(W.LIU_HAI * r);
      tags.push(`${k}害`);
    }
    if (LIU_PO[aP.branch] === bP.branch) {
      score += Math.round(W.LIU_PO * r);
      tags.push(`${k}破`);
    }
  }

  /* 3. 三會 first (rule 1: แรงกว่า) · then 三合 · 📜 อากง: ใช้ resulting element vs yongshen */
  const aB = getBranches(a), bB = getBranches(b);
  let sanGroupMatched = false;

  /* helper · score sanhe/sanhui by resulting element vs context */
  function scoreSanByElement(resultEl: string, isFull: boolean, type: '三會'|'三合'): number {
    /* rank vs yongshen/jishen · context-aware (ข้อ 3+4) */
    if (effectiveYongshen[0] === resultEl) {
      const w = isFull ? (type==='三會' ? W.SAN_HUI_FULL : W.SAN_HE_FULL) : W.SAN_HE_PARTIAL_TO_YONGSHEN;
      flags.push(`${type}_to_yongshen`);
      return w;
    }
    if (effectiveYongshen.slice(1,3).includes(resultEl)) {
      const w = isFull ? Math.round((type==='三會' ? W.SAN_HUI_FULL : W.SAN_HE_FULL) * 0.7) : W.SAN_HE_PARTIAL_TO_XISHEN;
      flags.push(`${type}_to_xishen`);
      return w;
    }
    if (selfJishen && selfJishen[0] === resultEl) {
      /* primary jishen · heavy penalty */
      flags.push(`${type}_to_jishen_heavy`);
      return isFull ? -Math.round((type==='三會' ? W.SAN_HUI_FULL : W.SAN_HE_FULL) * 0.8) : W.SAN_HE_PARTIAL_TO_JISHEN_HEAVY;
    }
    if (selfJishen && selfJishen.includes(resultEl)) {
      flags.push(`${type}_to_jishen`);
      return isFull ? -Math.round((type==='三會' ? W.SAN_HUI_FULL : W.SAN_HE_FULL) * 0.55) : W.SAN_HE_PARTIAL_TO_JISHEN;
    }
    /* neutral */
    flags.push(`${type}_neutral`);
    return isFull ? Math.round((type==='三會' ? W.SAN_HUI_FULL : W.SAN_HE_FULL) * 0.35) : W.SAN_HE_PARTIAL_NEUTRAL;
  }

  /* 三會 */
  for (const grp of SAN_HUI_GROUPS) {
    const hits = grp.branches.filter(g => aB.includes(g) || bB.includes(g));
    const aHits = grp.branches.filter(g => aB.includes(g));
    const bHits = grp.branches.filter(g => bB.includes(g));
    if (hits.length === 3 && aHits.length >= 1 && bHits.length >= 1) {
      score += scoreSanByElement(grp.element, true, '三會');
      if (!tags.includes('三會')) tags.push('三會');
      flags.push('san_hui_full');
      sanGroupMatched = true;
      break;
    } else if (hits.length === 2 && aHits.length >= 1 && bHits.length >= 1) {
      score += scoreSanByElement(grp.element, false, '三會');
      if (!tags.includes('半三會')) tags.push('半三會');
      flags.push('san_hui_partial');
      sanGroupMatched = true;
      break;
    }
  }
  /* 三合 (only if 三會 ไม่ match) */
  if (!sanGroupMatched) {
    for (const grp of SAN_HE_GROUPS) {
      const hits = grp.branches.filter(g => aB.includes(g) || bB.includes(g));
      const aHits = grp.branches.filter(g => aB.includes(g));
      const bHits = grp.branches.filter(g => bB.includes(g));
      if (hits.length === 3 && aHits.length >= 1 && bHits.length >= 1) {
        score += scoreSanByElement(grp.element, true, '三合');
        if (!tags.includes('三合')) tags.push('三合');
        break;
      } else if (hits.length === 2 && aHits.length >= 1 && bHits.length >= 1) {
        score += scoreSanByElement(grp.element, false, '三合');
        if (!tags.includes('半合')) tags.push('半合');
        break;
      }
    }
  }

  /* 4. element cycle (day stem) · rule 7: 貪合忘剋 = suppress 克 if 天合 */
  const aElem = STEM_ELEMENT[aDay.stem];
  const bElem = STEM_ELEMENT[bDay.stem];
  if (aElem && bElem) {
    const isControlRel = ELEM_CONTROLS[aElem] === bElem || ELEM_CONTROLS[bElem] === aElem;
    if (stemHeOccurred && isControlRel) {
      /* rule 7: 貪合忘剋 · 合 ทำให้ 克 หยุดทำงาน · skip Layer 4 ทั้งกรณี 克 */
      flags.push('貪合忘剋');
      tags.push('貪合忘剋');
    } else {
      if (aElem === bElem) { score += W.ELEM_SAME; tags.push('比'); }
      else if (ELEM_PRODUCES[aElem] === bElem) { score += W.ELEM_PRODUCES; tags.push('生'); }
      else if (ELEM_PRODUCES[bElem] === aElem) { score += W.ELEM_PRODUCED; tags.push('被生'); }
      else if (ELEM_CONTROLS[aElem] === bElem) { score += W.ELEM_CONTROLS; tags.push('克'); }
      else if (ELEM_CONTROLS[bElem] === aElem) { score += W.ELEM_CONTROLLED; tags.push('被克'); }
    }
  }

  /* 5. 🎯 用神/忌神 layer · ใช้ effectiveYongshen (รวม structure override) */
  let yongshenBonus = 0;
  if (bElem && effectiveYongshen.length) {
    if (effectiveYongshen[0] === bElem) {
      yongshenBonus = W.YONGSHEN_PRIMARY;
      tags.push('用神');
    } else if (effectiveYongshen.slice(1, 3).includes(bElem)) {
      yongshenBonus = W.YONGSHEN_SECONDARY;
      tags.push('用神·รอง');
    }
  }
  /* rule 9: yongshen uncertain · cap +8 */
  if (yongshenBonus > 0 && opts?.selfStrengthUncertain) {
    yongshenBonus = Math.min(yongshenBonus, W.YONGSHEN_UNCERTAIN_CAP);
    flags.push('yongshen_uncertain_cap');
    tags.push('ย่งเสินยังไม่ชัด');
  }
  score += yongshenBonus;

  /* 忌神 · rule 8: 忌神แรง = -18 ถ้า jishenInMonth + DMWeak */
  if (bElem && selfJishen && selfJishen.length && selfJishen.includes(bElem)) {
    if (opts?.jishenInMonth && opts?.selfDmWeak) {
      score += W.JISHEN_HEAVY;
      tags.push('忌神แรง');
      flags.push('jishen_heavy');
    } else {
      score += W.JISHEN_PENALTY;
      tags.push('忌神');
    }
  }

  /* 📜 อากงอาม่า · Context-aware corrections (หลัง mechanical) */
  const _bBranches = getBranches(b);
  const _bStems = (['year','month','day','hour'] as const).map(k => (b as any)[k]?.stem).filter(Boolean);

  /* 1. TIAOHOU_NEEDED_FIRE · self ต้องการไฟ + other มีไฟใน chart */
  if (effectiveYongshen.includes('fire')) {
    let fireCount = 0;
    _bBranches.forEach((br: string) => { if (BRANCH_ELEMENT[br]==='fire') fireCount++; });
    _bStems.forEach((st: string) => { if (STEM_ELEMENT[st]==='fire') fireCount++; });
    if (fireCount >= 1) {
      const tiaohou = Math.min(22, 8 + fireCount * 4);
      /* discount ถ้า TiaoHou กับ Yongshen เป็นธาตุเดียว (ตำราอากง #7) */
      const discountedTiaohou = effectiveYongshen[0] === 'fire' ? Math.round(tiaohou * 0.65) : tiaohou;
      score += discountedTiaohou;
      tags.push('調候·火助');
      adjustmentEvents.push({ label: '調候·火助', weight: discountedTiaohou });
      flags.push('tiaohou_fire_correction');
    }
  }

  /* 2. YONGSHEN_BRANCH_SUPPORT · other มี root ของ yongshen */
  if (effectiveYongshen.length) {
    let supportCount = 0;
    _bBranches.forEach((br: string) => {
      if (effectiveYongshen.includes(BRANCH_ELEMENT[br])) supportCount++;
    });
    if (supportCount >= 1) {
      const support = Math.min(18, supportCount * 6);
      score += support;
      tags.push('用神·根');
      adjustmentEvents.push({ label: '用神·根', weight: support });
      flags.push('yongshen_branch_support');
    }
  }

  /* 3. MIXED_CLASH · clash ที่ branch เป็น yongshen → ไม่ลบสุดโต่ง */
  const mixedSafeClash = (aP_branch: string, bP_branch: string) => {
    if (BRANCH_CLASH[aP_branch] !== bP_branch) return null;
    const aEl = BRANCH_ELEMENT[aP_branch];
    const bEl = BRANCH_ELEMENT[bP_branch];
    const ysHit = effectiveYongshen.includes(aEl) || effectiveYongshen.includes(bEl);
    const jsHit = (selfJishen||[]).includes(aEl) || (selfJishen||[]).includes(bEl);
    return { ysHit, jsHit };
  };
  const dayMix = mixedSafeClash(aDay.branch, bDay.branch);
  if (dayMix && dayMix.ysHit && dayMix.jsHit) {
    /* clash ทั้งกระทบ ys และทำลาย js → mixed · ผ่อนคลาย +12 */
    score += 12;
    tags.push('沖·ผสม·พอชดเชย');
    adjustmentEvents.push({ label: '沖·ผสม·พอชดเชย', weight: 12 });
    flags.push('mixed_clash_balanced');
  } else if (dayMix && dayMix.ysHit && !dayMix.jsHit) {
    /* clash ทำลาย yongshen ตรงๆ → ลงโทษเพิ่ม */
    score -= 6;
    tags.push('沖去用神 ⚠⚠');
    adjustmentEvents.push({ label: '沖去用神 ⚠⚠', weight: -6 });
    flags.push('clash_destroys_yongshen');
  }

  /* 4. 生 correction · ถ้า self DM อ่อน · 生 = drain (เสียพลัง) */
  if (opts?.selfDmWeak && tags.includes('生')) {
    score -= 6;
    tags.push('生·เสียพลัง');
    adjustmentEvents.push({ label: '生·เสียพลัง', weight: -6 });
    flags.push('weak_dm_drain');
  }

  /* 5. multiple clashes → stronger stability penalty */
  const _clashCount = tags.filter((t: string) => /沖|刑|破|害/.test(t)).length;
  if (_clashCount >= 3) {
    score += -8;  /* additional · -10..-16 total when combined with existing penalty */
    adjustmentEvents.push({ label: 'multi clash', weight: -8 });
    flags.push('multi_clash_penalty');
  }

  /* 📜 อากง ข้อ 6 · Caps · กันคะแนนระเบิด */
  /* SINGLE_INTERACTION_CAP applied per-interaction (already implicit · weights < 35) */
  /* Category cap: split branch vs DM */
  function applyCaps(rawScore: number): number {
    /* If extreme >85 or <-85 · soften */
    if (rawScore > 85) return Math.round(85 + (rawScore - 85) * 0.3);
    if (rawScore < -85) return Math.round(-85 + (rawScore + 85) * 0.3);
    return rawScore;
  }

  /* 📜 อากง ข้อ 8 · Stability penalty · positive จาก clash เยอะ = ไม่นิ่ง */
  const clashTags = tags.filter(t => /沖|刑|破|害/.test(t));
  const positiveTags = tags.filter(t => /合|三/.test(t));
  if (score > 20 && clashTags.length >= 2 && positiveTags.length >= 2) {
    score += W.STABILITY_PENALTY;
    tags.push('แรงขับ·ไม่นิ่ง');
    adjustmentEvents.push({ label: 'แรงขับ·ไม่นิ่ง', weight: W.STABILITY_PENALTY });
    flags.push('stability_penalty');
  }

  /* 📜 Structure resonance · wrapper-7 v2 · อากง 15 พ.ค. 2026
   * - same structure_label   → +5 結構共鳴
   * - a.primary ∩ b.primary  → +4 同用神
   * - a.primary ∩ b.xishen   → +5 B·助A用神
   * - a.primary ∩ b.jishen   → -6 B·剋A用神
   * - b.primary ∩ a.jishen   → -4 A·剋B用神 (asymmetric · less weight)
   */
  const ay = opts?.aYongshen, by = opts?.bYongshen;
  if (ay && by) {
    if (ay.structure_label && ay.structure_label === by.structure_label) {
      score += 5; tags.push('結構共鳴'); flags.push('structure_resonance');
    }
    const aP = new Set(ay.primary_yongshen || []);
    const bP = new Set(by.primary_yongshen || []);
    const aJ = new Set(ay.jishen || []);
    const bJ = new Set(by.jishen || []);
    const bX = new Set(by.xishen || []);
    const intersect = (s1: Set<any>, s2: Set<any>) => [...s1].some(v => s2.has(v));
    if (intersect(aP, bP)) { score += 4; tags.push('同用神'); flags.push('same_yongshen'); }
    if (intersect(aP, bX)) { score += 5; tags.push('B·助A用神'); flags.push('b_supports_a_yongshen'); }
    if (intersect(aP, bJ)) { score -= 6; tags.push('B·剋A用神'); flags.push('b_harms_a_yongshen'); }
    if (intersect(bP, aJ)) { score -= 4; tags.push('A·剋B用神'); flags.push('a_harms_b_yongshen'); }
  }

  const beforeCap = score;
  score = applyCaps(score);
  const capDelta = score - beforeCap;
  if (capDelta !== 0) {
    adjustmentEvents.push({ label: 'cap/soften', weight: capDelta });
  }

  /* 📜 อากง ข้อ 9 · Mechanical vs Context-aware split
   * mechanical = ดูแค่ tags ที่เกิด (sum weights)
   * context = score ที่ผ่าน yongshen filter + caps + stability */
  const mechanicalScore = tags.length;  /* แค่นับ tag · simple metric */

  /* 📊 Post-process · split score เป็น bonus/penalty จาก tags array */
  const TAG_WEIGHT: Record<string, number> = {
    '合': W.STEM_HE, '合化用神': W.STEM_HE, '合化เฉย': Math.round(W.STEM_HE * 0.5), '合化忌神': -12,
    '沖': W.BRANCH_CLASH, '六合': W.LIU_HE, '害': W.LIU_HAI, '破': W.LIU_PO,
    '刑': W.XING_TRIPLE, '自刑': W.XING_SELF,
    '三會': W.SAN_HUI_FULL, '半三會': W.SAN_HUI_PARTIAL, '三合': W.SAN_HE_FULL, '半合': W.SAN_HE_PARTIAL,
    '比': W.ELEM_SAME, '生': W.ELEM_PRODUCES, '被生': W.ELEM_PRODUCED, '克': W.ELEM_CONTROLS, '被克': W.ELEM_CONTROLLED,
    '用神': W.YONGSHEN_PRIMARY, '用神·รอง': W.YONGSHEN_SECONDARY, '忌神': W.JISHEN_PENALTY, '忌神แรง': W.JISHEN_HEAVY,
    '沖去忌神 ⚠': W.CHONG_KILLS_JISHEN, 'ย่งเสินยังไม่ชัด': 0, '貪合忘剋': 0,
    /* Phase 1 · cross-pillar stem */
    /* wrapper-7 v2 resonance */
    '結構共鳴': 5, '同用神': 4, 'B·助A用神': 5, 'B·剋A用神': -6, 'A·剋B用神': -4,
    'year合': Math.round(W.STEM_HE * 0.6), 'year剋': Math.round(W.STEM_CLASH * 0.6),
    'month合': Math.round(W.STEM_HE * 0.7), 'month剋': Math.round(W.STEM_CLASH * 0.7),
    'hour合': Math.round(W.STEM_HE * 0.6), 'hour剋': Math.round(W.STEM_CLASH * 0.6),
    /* #4 · Cross-pillar branch */
    'year六合': Math.round(W.LIU_HE * 0.5),     'year沖': Math.round(W.BRANCH_CLASH * 0.5),
    'year害':  Math.round(W.LIU_HAI * 0.5),    'year破': Math.round(W.LIU_PO * 0.5),
    'month六合': Math.round(W.LIU_HE * 0.6),    'month沖': Math.round(W.BRANCH_CLASH * 0.6),
    'month害':  Math.round(W.LIU_HAI * 0.6),   'month破': Math.round(W.LIU_PO * 0.6),
    'hour六合': Math.round(W.LIU_HE * 0.5),     'hour沖': Math.round(W.BRANCH_CLASH * 0.5),
    'hour害':  Math.round(W.LIU_HAI * 0.5),    'hour破': Math.round(W.LIU_PO * 0.5),
  };
  let bonus = 0, penalty = 0;
  const events: string[] = [];
  tags.forEach(t => {
    const w = TAG_WEIGHT[t];
    if (w == null) return;
    if (w > 0) bonus += w;
    else penalty += -w;
    events.push(t + (w >= 0 ? ` +${w}` : ` ${w}`));
  });
  const bd = { bonus, penalty, base: 50, events, mechanical: mechanicalScore, context_aware: score };
  function contextTagWeight(t: string): number | undefined {
    if (t === '半合') {
      if (flags.includes('三合_to_yongshen')) return W.SAN_HE_PARTIAL_TO_YONGSHEN;
      if (flags.includes('三合_to_xishen')) return W.SAN_HE_PARTIAL_TO_XISHEN;
      if (flags.includes('三合_to_jishen_heavy')) return W.SAN_HE_PARTIAL_TO_JISHEN_HEAVY;
      if (flags.includes('三合_to_jishen')) return W.SAN_HE_PARTIAL_TO_JISHEN;
      if (flags.includes('三合_neutral')) return W.SAN_HE_PARTIAL_NEUTRAL;
    }
    if (t === '半三會') {
      if (flags.includes('三會_to_yongshen')) return W.SAN_HE_PARTIAL_TO_YONGSHEN;
      if (flags.includes('三會_to_xishen')) return W.SAN_HE_PARTIAL_TO_XISHEN;
      if (flags.includes('三會_to_jishen_heavy')) return W.SAN_HE_PARTIAL_TO_JISHEN_HEAVY;
      if (flags.includes('三會_to_jishen')) return W.SAN_HE_PARTIAL_TO_JISHEN;
      if (flags.includes('三會_neutral')) return W.SAN_HE_PARTIAL_NEUTRAL;
    }
    if (t === '三合') {
      if (flags.includes('三合_to_yongshen')) return W.SAN_HE_FULL;
      if (flags.includes('三合_to_xishen')) return Math.round(W.SAN_HE_FULL * 0.7);
      if (flags.includes('三合_to_jishen_heavy')) return -Math.round(W.SAN_HE_FULL * 0.8);
      if (flags.includes('三合_to_jishen')) return -Math.round(W.SAN_HE_FULL * 0.55);
      if (flags.includes('三合_neutral')) return Math.round(W.SAN_HE_FULL * 0.35);
    }
    if (t === '三會') {
      if (flags.includes('三會_to_yongshen')) return W.SAN_HUI_FULL;
      if (flags.includes('三會_to_xishen')) return Math.round(W.SAN_HUI_FULL * 0.7);
      if (flags.includes('三會_to_jishen_heavy')) return -Math.round(W.SAN_HUI_FULL * 0.8);
      if (flags.includes('三會_to_jishen')) return -Math.round(W.SAN_HUI_FULL * 0.55);
      if (flags.includes('三會_neutral')) return Math.round(W.SAN_HUI_FULL * 0.35);
    }
    return TAG_WEIGHT[t];
  }
  bonus = 0; penalty = 0; events.length = 0;
  tags.forEach(t => {
    const w = contextTagWeight(t);
    if (w == null) return;
    if (w > 0) bonus += w;
    else penalty += -w;
    events.push(t + (w >= 0 ? ` +${w}` : ` ${w}`));
  });
  for (const ev of adjustmentEvents) {
    if (!ev.weight) continue;
    if (ev.weight > 0) bonus += ev.weight;
    else penalty += -ev.weight;
    events.push(ev.label + (ev.weight >= 0 ? ` +${ev.weight}` : ` ${ev.weight}`));
  }
  const eventSum = bonus - penalty;
  const remainder = score - eventSum;
  if (remainder !== 0) {
    if (remainder > 0) bonus += remainder;
    else penalty += -remainder;
    events.push('context remainder' + (remainder >= 0 ? ` +${remainder}` : ` ${remainder}`));
  }
  bd.bonus = bonus;
  bd.penalty = penalty;
  bd.events = events;
  return { score, tags, flags, bd };
}

/**
 * Compute timeframe-modulated score
 * raw [-100..100] × (1 + tf_weight) → clamp [-100..100]
 * tf bigger = relationship matters more (less noisy than month-to-month)
 */
export function modulateByTf(raw: number, tf: keyof typeof TF_WEIGHT): number {
  const w = TF_WEIGHT[tf] || 0.2;
  /* base 0.85 · scale by tf weight (0.15..0.30) ทำให้ tf longer มีค่าโดดเด่นกว่า */
  const m = 0.85 + w;
  const v = Math.round(raw * m);
  return Math.max(-100, Math.min(100, v));
}

/* ═══════════════════════════════════════════════════════════
 * 18 พ.ค. 2026 · computeUserDayScore wrapper
 * Single Source of Truth · ใช้ใน /api/today + /api/calendar
 * เปลี่ยน day pillar (壬辰) → "person ของวัน" แล้วเรียก pairBaseScore
 * คืน score 0-100 (normalized · 50 = neutral)
 * ═══════════════════════════════════════════════════════════ */
export function computeUserDayScore(
  userPillars: Pillars,
  dayPillar: string,                /* "壬辰" */
  yongshen?: string[],              /* ['fire','wood'] */
  jishen?: string[],                /* ['water','metal'] */
  opts?: {
    selfStrengthUncertain?: boolean;
    selfDmWeak?: boolean;
    jishenInMonth?: boolean;
    structureYongshen?: string[];
  },
): {
  score: number;          /* 0-100 (normalized · 50 = neutral) */
  raw: number;            /* -100..+100 (จาก pairBaseScore) */
  label: string;          /* 大吉 / 吉 / 中和 / 凶 / 大凶 */
  level: 'best' | 'good' | 'ok' | 'caution' | 'avoid';
  tags: string[];
  flags: string[];
  breakdown: { bonus: number; penalty: number; base: number; events: string[] };
} {
  if (!dayPillar || dayPillar.length < 2 || !userPillars?.day?.stem) {
    return { score: 50, raw: 0, label: '中和', level: 'ok', tags: [], flags: [], breakdown: { bonus:0, penalty:0, base:0, events:[] } };
  }
  const dayPerson: Person = { day: { stem: dayPillar[0], branch: dayPillar[1] } };
  const result = pairBaseScore(userPillars, dayPerson, yongshen, jishen, opts);
  /* normalize raw -100..+100 → 0..100 (50 = neutral) */
  const score = Math.max(0, Math.min(100, Math.round(50 + result.score * 0.5)));
  let label = '中和'; let level: 'best'|'good'|'ok'|'caution'|'avoid' = 'ok';
  if (score >= 80)      { label = '大吉'; level = 'best'; }
  else if (score >= 65) { label = '吉';   level = 'good'; }
  else if (score >= 45) { label = '中和'; level = 'ok'; }
  else if (score >= 30) { label = '凶';   level = 'caution'; }
  else                  { label = '大凶'; level = 'avoid'; }
  return { score, raw: result.score, label, level, tags: result.tags, flags: result.flags, breakdown: result.bd };
}
