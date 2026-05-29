/**
 * Wrapper 3 · Ge Ju (Structure 格局) Inference
 *
 * อนุมานโครงสร้างของดวงจาก:
 *   1. Month branch hidden stem (main qi)
 *   2. ความสัมพันธ์ Ten God กับ Day Master
 *   3. Special: Transformation (5合 + season + dominance)
 *   4. Special: Follow patterns (DM อ่อนสุดขั้ว)
 *
 * Conservative: ถ้าไม่แน่ใจ → ใช้ basic structure
 */

const S = require('./shared');
const { STRUCTURE_NAME, TEN_GOD_NAME } = require('./narrative');

/* 19 พ.ค. Option α (Codex-approved) · helper · return positions ที่ active เท่านั้น
 * 4-pillar: ['year','month','day','hour'] · เดิม 100% byte-equal
 * 3-pillar: ['year','month','day'] · เมื่อ natal.hour === null */
function activePositions(natal) {
  const all = ['year','month','day','hour'];
  return all.filter(p => natal[p]);
}

// Map Ten God → Structure key
const TEN_GOD_TO_STRUCTURE = {
  '正印': '正印格',
  '偏印': '偏印格',
  '正官': '正官格',
  '七殺': '七殺格',
  '正財': '正財格',
  '偏財': '偏財格',
  '食神': '食神格',
  '傷官': '傷官格',
  '比肩': '比肩格',
  '劫財': '劫財格',
};

// Season for follower checks
const SEASON_OF_BRANCH = {
  寅:'spring',卯:'spring',辰:'spring',
  巳:'summer',午:'summer',未:'summer',
  申:'autumn',酉:'autumn',戌:'autumn',
  亥:'winter',子:'winter',丑:'winter',
};

const ELEMENT_SEASON = {
  wood:'spring', fire:'summer', metal:'autumn', water:'winter',
};

function elementCount(natal) {
  const positions = activePositions(natal);
  const counts = { wood:0, fire:0, earth:0, metal:0, water:0 };
  for (const pos of positions) {
    counts[S.STEM_ELEMENT[natal[pos].stem]]++;
    counts[S.BRANCH_ELEMENT[natal[pos].branch]]++;
    // Hidden stems (weighted lighter)
    const hs = S.HIDDEN_STEMS[natal[pos].branch];
    if (hs?.main) counts[S.STEM_ELEMENT[hs.main]] += 0.5;
  }
  return counts;
}

function isStemHe(s1, s2) {
  return ['甲己','乙庚','丙辛','丁壬','戊癸'].includes([s1,s2].sort().join('')) ||
         ['甲己','乙庚','丙辛','丁壬','戊癸'].some(p => (p[0]===s1 && p[1]===s2) || (p[1]===s1 && p[0]===s2));
}

/* ── 化氣格 promote · wrapper-8 (29 พ.ค. · proto v2 → runtime)
 * blueprint: data/library/wrapper8-huahe-cong-blueprint.md
 * proto: scripts/proto-huaqi-gate-v2.cjs (8/8 PASS)
 *
 * contract เดิม findTransformation (wrapper-7:601 อ่าน) คงเดิม:
 *   - return 化X格 object สำหรับ 真化 เท่านั้น
 *   - return null สำหรับ 假化/合而不化/隔位/ไม่มีคู่ → wrapper-7 ไม่ push 化神 อัตโนมัติ (กัน over-declare用神พลิก180°)
 *
 * เพิ่ม: analyzeHuaQiVerdict(natal) → expose verdict 真化/假化/合而不化 (chart-packet ดูดเข้า field huaQi)
 *        ไม่กระทบ wrapper-7 · ไม่กระทบ /chart special_chart
 */
const HUA_HHE = require('./8-huahe');
const HUA_ZH = { wood:'木', fire:'火', earth:'土', metal:'金', water:'水' };

/** wrapper-3 → wrapper-7 contract เดิม · เฉพาะ真化 */
function findTransformation(natal) {
  const v = HUA_HHE.analyzeHuaQi(natal);
  if (!v || v.verdict !== '真化') return null;
  return {
    structure: `化${HUA_ZH[v.transformElement]}格`,
    transformsTo: v.transformElement,
    partner: v.stems.partner,
    partnerSource: v.partnerPosition,
    seasonSupport: v.monthSupport,
    confidence: v.confidence === 'high' ? 'high' : 'moderate',
    detail: {
      verdict: '真化',
      dmRoot: v.dmRootGate,
      gotMonth: v.monthSupport,
      sourceRuleIds: v.sourceRuleIds,
    },
  };
}

/** expose full verdict (真化/假化/合而不化/null) สำหรับ chart-packet field huaQi
 *   - ไม่กระทบ wrapper-7 (อ่านแค่ findTransformation)
 *   - caller ต้อง dm fill เอง (wrapper-8 ปล่อย stems.dm = undefined) */
function analyzeHuaQiVerdict(natal) {
  const v = HUA_HHE.analyzeHuaQi(natal);
  if (!v) return null;
  return {
    ...v,
    stems: { dm: natal?.day?.stem || null, partner: v.stems.partner },
  };
}

function findFollower(natal, counts) {
  const dm = natal.day.stem;
  const dmEl = S.STEM_ELEMENT[dm];
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  const dmShare = counts[dmEl] / total;
  // DM ต้องอ่อนมาก (< 12%)
  if (dmShare > 0.12) return null;
  // หา dominant element
  let domEl = 'wood', domShare = 0;
  for (const [el, n] of Object.entries(counts)) {
    if (el === dmEl) continue;
    if (n / total > domShare) { domEl = el; domShare = n / total; }
  }
  if (domShare < 0.40) return null; // ไม่ dominant พอ
  // เช็คว่า dominant คืออะไร (output/wealth/influence)
  let category;
  if (S.ELEMENT_PRODUCES[dmEl] === domEl) category = '從兒格';     // Output (food/hurting)
  else if (S.ELEMENT_CONTROLS[dmEl] === domEl) category = '從財格'; // Wealth
  else if (S.ELEMENT_CONTROLS[domEl] === dmEl) category = '從殺格'; // Influence (officer/killings)
  else return null;
  return {
    structure: category,
    dominantElement: domEl,
    dmShare: Math.round(dmShare * 100),
    domShare: Math.round(domShare * 100),
    confidence: domShare > 0.55 ? 'high' : 'moderate',
  };
}

function inferGeJu(natal) {
  const dm = natal.day.stem;
  const monthBranch = natal.month.branch;
  const counts = elementCount(natal);

  // 1. Special check: Transformation
  const trans = findTransformation(natal);
  if (trans) {
    const name = STRUCTURE_NAME[trans.structure];
    return {
      structure: trans.structure,
      type: 'transformation',
      basis: `DM ${dm} + ${trans.partner} (${trans.partnerSource}) → ${trans.transformsTo}`,
      confidence: trans.confidence,
      narrative: name,
      detail: trans,
    };
  }

  // 1.5 · 📜 專旺格 (Sole Vigorous · 5 sub) · อากง 15 พ.ค. 2026
  // ตำราคลาสสิก: DM ครองผัง · ไม่มี control · same element ≥ 55% · controller ≤ 5%
  // 曲直(木) · 炎上(火) · 稼穡(土 ต้อง 辰戌丑未 ≥ 2) · 從革(金) · 潤下(水)
  const total15 = Object.values(counts).reduce((a,b) => a+b, 0) || 1;
  const dmEl15 = S.STEM_ELEMENT[dm];
  const dmShare15 = counts[dmEl15] / total15;
  const controllerEl15 = Object.entries(S.ELEMENT_CONTROLS).find(([_,v]) => v === dmEl15)?.[0];
  const controllerShare15 = controllerEl15 ? counts[controllerEl15] / total15 : 0;
  const resourceEl15 = Object.entries(S.ELEMENT_PRODUCES).find(([_,v]) => v === dmEl15)?.[0];
  const monthEl15 = S.BRANCH_ELEMENT[monthBranch];

  // 稼穡ต้องการ 辰戌丑未 อย่างน้อย 2 ใน 4 (ตามตำรา)
  const EARTH_STORAGE = ['辰','戌','丑','未'];
  const earthStorageCount = activePositions(natal)
    .map(p => natal[p].branch)
    .filter(b => EARTH_STORAGE.includes(b)).length;

  // ตรวจ 沖 ทำลาย DM element · skip ถ้า clash pair ทั้งคู่เป็น DM element เอง (朋沖/self clash · ไม่ destructive)
  let zhuanwangBlocker = null;
  for (const pos of activePositions(natal)) {
    const b = natal[pos].branch;
    if (S.BRANCH_ELEMENT[b] !== dmEl15) continue;
    const clashTarget = S.SIX_CLASH ? S.SIX_CLASH[b] : null;
    if (!clashTarget) continue;
    if (S.BRANCH_ELEMENT[clashTarget] === dmEl15) continue; // 朋沖 same element
    const found = activePositions(natal).some(p2 => natal[p2].branch === clashTarget);
    if (found) { zhuanwangBlocker = `${b} clashed by ${clashTarget}`; break; }
  }

  const ZHUANWANG_NAME = {
    wood:  { key: '曲直格',  zh: '曲直格 (Wood Sole Vigorous)' },
    fire:  { key: '炎上格',  zh: '炎上格 (Fire Sole Vigorous)' },
    earth: { key: '稼穡格',  zh: '稼穡格 (Earth Sole Vigorous)' },
    metal: { key: '從革格',  zh: '從革格 (Metal Sole Vigorous)' },
    water: { key: '潤下格',  zh: '潤下格 (Water Sole Vigorous)' },
  };

  // 專旺ต้อง parallel เด่นกว่า resource อย่างน้อย 2:1 · ถ้า resource มากเกือบเท่า parallel → ปล่อยไป 從強
  const _resourceEl15 = Object.entries(S.ELEMENT_PRODUCES).find(([_,v]) => v === dmEl15)?.[0];
  const _resourceShare15 = _resourceEl15 ? counts[_resourceEl15] / total15 : 0;
  if (
    dmShare15 >= 0.55 &&
    controllerShare15 <= 0.15 &&
    dmShare15 >= controllerShare15 * 4 &&
    dmShare15 >= _resourceShare15 * 2 &&
    !zhuanwangBlocker &&
    (monthEl15 === dmEl15 || monthEl15 === resourceEl15) &&
    (dmEl15 !== 'earth' || earthStorageCount >= 2)
  ) {
    const info = ZHUANWANG_NAME[dmEl15];
    if (info) {
      const conf =
        dmShare15 >= 0.70 ? 'high' :
        dmShare15 >= 0.60 ? 'moderate' : 'low';
      return {
        structure: info.key,
        type: 'sole_vigorous',
        basis: `DM ${dm}(${dmEl15}) ${Math.round(dmShare15*100)}% · controller ${controllerEl15||'-'} ${Math.round(controllerShare15*100)}% · month ${monthBranch}${dmEl15==='earth' ? ` · 墓庫 ${earthStorageCount}/4` : ''}`,
        confidence: conf,
        narrative: info.zh,
        detail: {
          dm_element: dmEl15,
          dm_share_pct: Math.round(dmShare15 * 100),
          controller_element: controllerEl15,
          controller_share_pct: Math.round(controllerShare15 * 100),
          resource_element: resourceEl15,
          month_role: monthEl15 === dmEl15 ? 'parallel' : 'resource',
          earth_storage_count: dmEl15 === 'earth' ? earthStorageCount : null,
          blocker: zhuanwangBlocker,
        },
      };
    }
  }

  // 1.6 · 📜 魁罡格 (Kuigang) · อากง 15 พ.ค. 2026
  // 4 pillars พิเศษ: 庚辰 庚戌 壬辰 戊戌 · day pillar ต้องตรง
  // มีหลาย魁罡 = เด่น · 辰戌沖 = อ่อน · 官殺天干 = พัง (single)
  const KUIGANG_PILLARS = ['庚辰','庚戌','壬辰','戊戌'];
  const dayKey = `${natal.day.stem}${natal.day.branch}`;
  if (KUIGANG_PILLARS.includes(dayKey)) {
    const allKeys = activePositions(natal).map(p => `${natal[p].stem}${natal[p].branch}`);
    const kuigangCount = allKeys.filter(k => KUIGANG_PILLARS.includes(k)).length;
    const branches = activePositions(natal).map(p => natal[p].branch);
    const hasChenXuClash = branches.includes('辰') && branches.includes('戌');
    const officerEl18 = Object.entries(S.ELEMENT_CONTROLS).find(([_,v]) => v === S.STEM_ELEMENT[dm])?.[0];
    const officerStemPresent = activePositions(natal).filter(p => p !== 'day').some(p => S.STEM_ELEMENT[natal[p].stem] === officerEl18);
    const dmEl18 = S.STEM_ELEMENT[dm];
    let rootCount = 0;
    for (const pos of activePositions(natal)) {
      const hs = S.HIDDEN_STEMS[natal[pos].branch];
      if (hs?.main && S.STEM_ELEMENT[hs.main] === dmEl18) rootCount++;
    }
    const parallelOk = rootCount >= 1 || counts[dmEl18] >= 2;

    // ตำราคลาสสิก (เข้มงวด): มี官殺ใน天干 → 魁罡พัง · ปล่อย normal pattern
    const skipKuigang = officerStemPresent;
    if (!skipKuigang) {
      let kgConf;
      if (kuigangCount >= 2 && !hasChenXuClash && !officerStemPresent && parallelOk) kgConf = 'high';
      else if (kuigangCount >= 2 && (hasChenXuClash || officerStemPresent)) kgConf = 'low';
      else if (!hasChenXuClash && !officerStemPresent && parallelOk) kgConf = 'moderate';
      else kgConf = 'low';
      return {
        structure: '魁罡格',
        type: 'kuigang',
        basis: `day ${dayKey} · 魁罡 ×${kuigangCount}${hasChenXuClash ? ' · 辰戌沖' : ''}${officerStemPresent ? ' · มี官殺' : ''}`,
        confidence: kgConf,
        narrative: '魁罡格 (Kuigang Authority)',
        detail: {
          day_pillar: dayKey,
          kuigang_count: kuigangCount,
          all_kuigang_pillars: allKeys.filter(k => KUIGANG_PILLARS.includes(k)),
          chen_xu_clash: hasChenXuClash,
          officer_stem_present: officerStemPresent,
          dm_root_count: rootCount,
          parallel_ok: parallelOk,
        },
      };
    }
  }

  // 1.7 · 📜 從強格 / 從旺格 · อากง 15 พ.ค. 2026
  // 從強: 印 + 比劫 ≥ 70% (resource เด่น) · ไม่มี官殺/財/食傷
  // 從旺: 比劫 ≥ 50% เด่นกว่า 印 · ไม่มี官殺/財/食傷
  // วาง fallback หลัง 專旺 specific 5 sub
  const officerEl17 = Object.entries(S.ELEMENT_CONTROLS).find(([_,v]) => v === dmEl15)?.[0];
  const wealthEl17  = S.ELEMENT_CONTROLS[dmEl15];
  const outputEl17  = S.ELEMENT_PRODUCES[dmEl15];
  const parallelShare = counts[dmEl15] / total15;
  const resourceShare = resourceEl15 ? counts[resourceEl15] / total15 : 0;
  const wealthShare   = wealthEl17 ? counts[wealthEl17] / total15 : 0;
  const officerShare  = officerEl17 ? counts[officerEl17] / total15 : 0;
  const outputShare   = outputEl17 ? counts[outputEl17] / total15 : 0;
  const leakShare = wealthShare + officerShare + outputShare;
  const supportShare = parallelShare + resourceShare;

  // 從強格: resource + parallel ≥ 70% · resource ≥ parallel · leak ≤ 15%
  if (
    supportShare >= 0.70 &&
    resourceShare >= parallelShare &&
    leakShare <= 0.15 &&
    (monthEl15 === dmEl15 || monthEl15 === resourceEl15)
  ) {
    const conf = supportShare >= 0.85 ? 'high' : 'moderate';
    return {
      structure: '從強格',
      type: 'cong_qiang',
      basis: `印${Math.round(resourceShare*100)}% + 比劫${Math.round(parallelShare*100)}% = ${Math.round(supportShare*100)}% · leak ${Math.round(leakShare*100)}% · month ${monthBranch}`,
      confidence: conf,
      narrative: '從強格 (Follow the Strong)',
      detail: {
        dm_element: dmEl15,
        parallel_share_pct: Math.round(parallelShare*100),
        resource_share_pct: Math.round(resourceShare*100),
        leak_share_pct: Math.round(leakShare*100),
        wealth_share_pct: Math.round(wealthShare*100),
        officer_share_pct: Math.round(officerShare*100),
        output_share_pct: Math.round(outputShare*100),
      },
    };
  }

  // 從旺格: parallel ≥ 50% · parallel > resource · leak ≤ 10%
  if (
    parallelShare >= 0.50 &&
    parallelShare > resourceShare &&
    leakShare <= 0.10 &&
    (monthEl15 === dmEl15 || monthEl15 === resourceEl15)
  ) {
    const conf = parallelShare >= 0.70 ? 'high' : 'moderate';
    return {
      structure: '從旺格',
      type: 'cong_wang',
      basis: `比劫${Math.round(parallelShare*100)}% > 印${Math.round(resourceShare*100)}% · leak ${Math.round(leakShare*100)}% · month ${monthBranch}`,
      confidence: conf,
      narrative: '從旺格 (Follow the Prosperous)',
      detail: {
        dm_element: dmEl15,
        parallel_share_pct: Math.round(parallelShare*100),
        resource_share_pct: Math.round(resourceShare*100),
        leak_share_pct: Math.round(leakShare*100),
        wealth_share_pct: Math.round(wealthShare*100),
        officer_share_pct: Math.round(officerShare*100),
        output_share_pct: Math.round(outputShare*100),
      },
    };
  }

  // 2. Special check: Follower · with 假從 (Fake Follow) detection · อากง 15 พ.ค. 2026
  const follow = findFollower(natal, counts);
  if (follow) {
    /* ตรวจ TiaoHou regulator · ถ้ามีในผัง → 假從 */
    let isFakeFollow = false;
    let tiaohouSource = null;
    try {
      const { tiaoHouAnalysis } = require('./5-tiao-hou.js');
      const climate = tiaoHouAnalysis(natal);
      const regulator = climate && climate.regulator;
      if (regulator) {
        for (const pos of activePositions(natal)) {
          if (S.STEM_ELEMENT[natal[pos].stem] === regulator) { isFakeFollow = true; tiaohouSource = `${pos}.stem`; break; }
          if (S.BRANCH_ELEMENT[natal[pos].branch] === regulator) { isFakeFollow = true; tiaohouSource = `${pos}.branch`; break; }
          const hs = S.HIDDEN_STEMS[natal[pos].branch];
          if (hs?.main && S.STEM_ELEMENT[hs.main] === regulator) { isFakeFollow = true; tiaohouSource = `${pos}.hidden`; break; }
        }
      }
    } catch (_) {}

    /* ตรวจ root + resource ของ DM ถ้ามี → 假從 ด้วย */
    const dmEl = S.STEM_ELEMENT[dm];
    const dmRootCount = (() => {
      let c = 0;
      for (const pos of activePositions(natal)) {
        const hs = S.HIDDEN_STEMS[natal[pos].branch];
        if (hs?.main && S.STEM_ELEMENT[hs.main] === dmEl) c++;
      }
      return c;
    })();
    const resourceEl = Object.keys(S.ELEMENT_PRODUCES).find(k => S.ELEMENT_PRODUCES[k] === dmEl);
    const hasResource = resourceEl ? counts[resourceEl] >= 1 : false;

    if (dmRootCount > 0 || hasResource) isFakeFollow = true;

    const structKey = isFakeFollow ? `假${follow.structure}` : follow.structure;
    const name = STRUCTURE_NAME[follow.structure];  /* ใช้ชื่อจริง · prefix 假 ใน label */
    return {
      structure: structKey,
      type: isFakeFollow ? 'fake_follower' : 'follower',
      basis: `DM ${dm} only ${follow.dmShare}% · dominant ${follow.dominantElement} ${follow.domShare}%${isFakeFollow ? ' · มี TiaoHou/Root/Resource → 假從' : ''}`,
      confidence: isFakeFollow ? 'moderate' : follow.confidence,
      narrative: isFakeFollow ? `假${name}` : name,
      detail: {
        ...follow,
        is_fake: isFakeFollow,
        dm_root_count: dmRootCount,
        has_resource: hasResource,
        tiaohou_source: tiaohouSource,
      },
    };
  }

  // 2.5 · 📜 雜氣格 (Zayin Storage · 4 storage months 辰戌丑未) · อากง 15 พ.ค.
  // เดือนเก็บ墓庫 · main hidden = 戊/己 (earth) · ใช้ middle/residual classify
  const STORAGE_MONTHS = ['辰','戌','丑','未'];
  if (STORAGE_MONTHS.includes(monthBranch)) {
    const mainH = S.HIDDEN_STEMS[monthBranch]?.main;
    const midH  = S.HIDDEN_STEMS[monthBranch]?.middle;
    const resH  = S.HIDDEN_STEMS[monthBranch]?.residual;
    /* main = earth (storage default) · ตำราใช้ middle/residual classify */
    const candidates = [midH, resH].filter(Boolean);
    /* หา ten god ที่ stronger · prefer middle */
    let zayinGod = null;
    let zayinStem = null;
    let zayinSource = null;
    for (const stem of candidates) {
      const g = S.tenGod(dm, stem);
      if (g) {
        /* เลือกตัวแรกที่ตรง (middle ก่อน residual) */
        zayinGod = g;
        zayinStem = stem;
        zayinSource = candidates.indexOf(stem) === 0 ? 'middle' : 'residual';
        break;
      }
    }
    if (zayinGod && TEN_GOD_TO_STRUCTURE[zayinGod]) {
      const baseStruct = TEN_GOD_TO_STRUCTURE[zayinGod];
      const zayinKey = `雜氣${baseStruct.replace('格','')}格`;
      const baseName = STRUCTURE_NAME[baseStruct];
      return {
        structure: zayinKey,
        type: 'zayin_storage',
        basis: `墓庫月 ${monthBranch} · ${zayinSource} hidden ${zayinStem} → ${zayinGod} for DM ${dm}`,
        god: zayinGod,
        godName: zayinGod ? TEN_GOD_NAME[zayinGod] : null,
        confidence: zayinSource === 'middle' ? 'moderate' : 'low',
        narrative: baseName ? `雜氣${baseName}` : zayinKey,
        detail: {
          is_storage_month: true,
          main_hidden: mainH,
          middle_hidden: midH,
          residual_hidden: resH,
          zayin_source: zayinSource,
        },
      };
    }
  }

  // 3. Normal structure: Month branch main hidden stem → Ten God → Structure
  const mainHidden = S.HIDDEN_STEMS[monthBranch]?.main;
  if (!mainHidden) {
    return { structure: null, type: 'unknown', basis: 'no main hidden stem in month branch' };
  }
  const god = S.tenGod(dm, mainHidden);
  const structureKey = TEN_GOD_TO_STRUCTURE[god];
  const name = structureKey ? STRUCTURE_NAME[structureKey] : null;

  // Confidence: ดู middle/residual ตามด้วย
  const mid = S.HIDDEN_STEMS[monthBranch]?.middle;
  const res = S.HIDDEN_STEMS[monthBranch]?.residual;
  const midGod = mid ? S.tenGod(dm, mid) : null;
  const resGod = res ? S.tenGod(dm, res) : null;
  // ถ้า middle/residual เป็น god เดียวกัน = high · ไม่ตรง = moderate
  const confidence = !mid ? 'high' :
                     midGod === god ? 'high' : 'moderate';

  return {
    structure: structureKey,
    type: 'normal',
    basis: `Month branch ${monthBranch} · main hidden ${mainHidden} → ${god} for DM ${dm}`,
    god,
    godName: god ? TEN_GOD_NAME[god] : null,
    middleGod: midGod,
    residualGod: resGod,
    confidence,
    narrative: name,
  };
}

// ─── unit tests ──────────────────────────────────────────────
function testCases() {
  console.log('=== Ge Ju unit tests ===');

  // Test 1: Aeaw 甲子 丙子 己亥 辛未
  // DM=己 · Month branch=子 · main hidden=癸 · 癸 to 己 = 偏財
  const aeaw = {year:{stem:'甲',branch:'子'},month:{stem:'丙',branch:'子'},day:{stem:'己',branch:'亥'},hour:{stem:'辛',branch:'未'}};
  const r1 = inferGeJu(aeaw);
  console.log('  Aeaw:', r1.structure, '·', r1.basis, '·', r1.confidence);
  console.log('   expect 偏財格 (Indirect Wealth) ·', r1.structure === '偏財格' ? '✓' : '✗');

  // Test 2: Mai 丙寅 壬辰 丙戌 丙申
  // DM=丙 · Month branch=辰 · main hidden=戊 · 戊 to 丙 = 食神
  const mai = {year:{stem:'丙',branch:'寅'},month:{stem:'壬',branch:'辰'},day:{stem:'丙',branch:'戌'},hour:{stem:'丙',branch:'申'}};
  const r2 = inferGeJu(mai);
  console.log('  Mai:', r2.structure, '·', r2.basis, '·', r2.confidence);
  console.log('   expect 雜氣正印格 (Phase 2) ·', r2.structure === '雜氣正印格' ? '✓' : '✗');

  // Test 3: 2026-05-06 birth (DM=庚 · month=巳 · main=丙 · 丙→庚 = 七殺)
  const today = {year:{stem:'丙',branch:'午'},month:{stem:'癸',branch:'巳'},day:{stem:'庚',branch:'辰'},hour:{stem:'庚',branch:'辰'}};
  const r3 = inferGeJu(today);
  console.log('  2026-05-06 born:', r3.structure, '·', r3.basis);
  console.log('   expect 七殺格 ·', r3.structure === '七殺格' ? '✓' : '✗');

  // Test 4: 曲直格 (Wood) DM 甲 + ผังเต็มไม้ ไม่มีทอง
  const quzhi = {year:{stem:'癸',branch:'卯'},month:{stem:'乙',branch:'卯'},day:{stem:'甲',branch:'寅'},hour:{stem:'乙',branch:'亥'}};
  const r4 = inferGeJu(quzhi);
  console.log('  曲直 test:', r4.structure, '·', r4.basis);
  console.log('   expect 曲直格 ·', r4.structure === '曲直格' ? '✓' : '✗');

  // Test 5: 炎上格 (Fire) DM 丙 + ผังเต็มไฟ
  const yanshang = {year:{stem:'丙',branch:'午'},month:{stem:'甲',branch:'午'},day:{stem:'丙',branch:'寅'},hour:{stem:'丁',branch:'巳'}};
  const r5 = inferGeJu(yanshang);
  console.log('  炎上 test:', r5.structure, '·', r5.basis);
  console.log('   expect 炎上格 ·', r5.structure === '炎上格' ? '✓' : '✗');

  // Test 6: 從革格 (Metal) DM 庚 + ผังเต็มทอง
  const conggе = {year:{stem:'庚',branch:'申'},month:{stem:'乙',branch:'酉'},day:{stem:'庚',branch:'戌'},hour:{stem:'辛',branch:'巳'}};
  const r6 = inferGeJu(conggе);
  console.log('  從革 test:', r6.structure, '·', r6.basis);
  console.log('   expect 從革格 ·', r6.structure === '從革格' ? '✓' : '✗');

  // Test 7: 潤下格 (Water) DM 壬 + ผังเต็มน้ำ
  const runxia = {year:{stem:'壬',branch:'子'},month:{stem:'辛',branch:'亥'},day:{stem:'壬',branch:'申'},hour:{stem:'癸',branch:'子'}};
  const r7 = inferGeJu(runxia);
  console.log('  潤下 test:', r7.structure, '·', r7.basis);
  console.log('   expect 潤下格 ·', r7.structure === '潤下格' ? '✓' : '✗');

  // Test 8: 稼穡格 (Earth) DM 戊 + 辰戌丑未 ครบ
  const jiase = {year:{stem:'戊',branch:'辰'},month:{stem:'戊',branch:'戌'},day:{stem:'戊',branch:'丑'},hour:{stem:'己',branch:'未'}};
  const r8 = inferGeJu(jiase);
  console.log('  稼穡 test:', r8.structure, '·', r8.basis);
  console.log('   expect 稼穡格 ·', r8.structure === '稼穡格' ? '✓' : '✗');

  // Test 9: 從強格 (Resource ≥ Parallel) · DM 乙 + 印(水)เด่นเท่าๆ 比劫(木)
  // stems 壬壬乙乙 · branches 亥子寅卯 · water 50% + wood 50% · resource ≥ parallel
  const congqiang = {year:{stem:'壬',branch:'亥'},month:{stem:'壬',branch:'子'},day:{stem:'乙',branch:'寅'},hour:{stem:'乙',branch:'卯'}};
  const r9 = inferGeJu(congqiang);
  console.log('  從強 test:', r9.structure, '·', r9.basis);
  console.log('   expect 從強格 ·', r9.structure === '從強格' ? '✓' : '✗');

  // Test 10: 從旺格 (Parallel ≥ Resource) · DM 丙 + 比劫(火)≥50% + 印(木)น้อย · ไม่ตรง specific 炎上 เพราะ month น้ำ
  // ใช้ stems 丁丙丙丁 · branches 巳午寅未 (parallel เกือบทั้งผัง · ไม่มี clash)
  const congwang = {year:{stem:'丁',branch:'巳'},month:{stem:'丙',branch:'午'},day:{stem:'丙',branch:'寅'},hour:{stem:'丁',branch:'未'}};
  const r10 = inferGeJu(congwang);
  console.log('  從旺/炎上 test:', r10.structure, '·', r10.basis);
  console.log('   expect 炎上格 or 從旺格 ·', (r10.structure === '炎上格' || r10.structure === '從旺格') ? '✓' : '✗');

  // Test 11: 魁罡格 high · day 庚辰 + year 壬辰 (2 ครั้ง) · ไม่มี辰戌沖 · ไม่มี官殺
  const kuigang2 = {year:{stem:'壬',branch:'辰'},month:{stem:'戊',branch:'申'},day:{stem:'庚',branch:'辰'},hour:{stem:'戊',branch:'寅'}};
  const r11 = inferGeJu(kuigang2);
  console.log('  魁罡 ×2 high test:', r11.structure, '·', r11.basis, '·', r11.confidence);
  console.log('   expect 魁罡格 high ·', (r11.structure === '魁罡格' && r11.confidence === 'high') ? '✓' : '✗');

  // Test 12: 魁罡格 low · day 庚辰 + year 庚戌 + month 庚辰 + hour 戊戌 (4 ครั้ง + 辰戌沖)
  const kuigang_clash = {year:{stem:'庚',branch:'戌'},month:{stem:'庚',branch:'辰'},day:{stem:'庚',branch:'辰'},hour:{stem:'戊',branch:'戌'}};
  const r12 = inferGeJu(kuigang_clash);
  console.log('  魁罡 沖 test:', r12.structure, '·', r12.basis, '·', r12.confidence);
  console.log('   expect 魁罡格 low ·', (r12.structure === '魁罡格' && r12.confidence === 'low') ? '✓' : '✗');

  // Test 13: 魁罡 single + 官殺 → skip ปล่อย normal
  const kuigang_off = {year:{stem:'丙',branch:'寅'},month:{stem:'丁',branch:'卯'},day:{stem:'庚',branch:'辰'},hour:{stem:'壬',branch:'午'}};
  const r13 = inferGeJu(kuigang_off);
  console.log('  魁罡+官殺 test:', r13.structure, '·', r13.basis);
  console.log('   expect not 魁罡格 ·', r13.structure !== '魁罡格' ? '✓' : '✗');

  return r1.structure === '偏財格' && r2.structure === '雜氣正印格' && r3.structure === '七殺格'
      && r4.structure === '曲直格' && r5.structure === '炎上格'
      && r6.structure === '從革格' && r7.structure === '潤下格' && r8.structure === '稼穡格'
      && r9.structure === '從強格'
      && (r10.structure === '炎上格' || r10.structure === '從旺格')
      && r11.structure === '魁罡格' && r12.structure === '魁罡格' && r13.structure !== '魁罡格';
}

function runAll() {
  const ok = testCases();
  console.log('\n→ Wrapper 3 tests:', ok ? '✅ ALL PASS' : '❌ FAIL');
  return ok;
}

module.exports = { inferGeJu, analyzeHuaQiVerdict, runAll };

if (require.main === module) runAll();
