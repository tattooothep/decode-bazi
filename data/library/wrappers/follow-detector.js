/**
 * Follow / 從格 detector · read-only · ไม่ override Yongshen
 *
 * Returns:
 *   {
 *     follow_candidate, follow_type, confidence (0-100),
 *     evidence: { dm_root, resource_presence, bi_jie_presence,
 *                 month_command, dominant_force, hidden_stem_support,
 *                 clashes_or_combos, blockers },
 *     recommendation: "inspect_only"
 *   }
 *
 * Categories:
 *   true_follow   - DM ลอยจริง · ไม่มี resource/bi_jie support · dominant force ครอบ
 *   false_follow  - DM ดูอ่อนมาก · แต่มี subtle resource/root → ไม่ควร follow
 *   weak_normal   - อ่อนตามปกติ · ใช้ resource/parallel เป็น yongshen ได้
 *   ambiguous     - ขัดแย้งหรือ borderline · ต้อง human inspect
 */
const S = require('./shared.js');

function dmRootCount(natal) {
  const dmStem = natal.day.stem;
  const dmEl = S.STEM_ELEMENT[dmStem];
  let count = 0;
  for (const pos of ['year','month','day','hour']) {
    const branch = natal[pos].branch;
    const hidden = S.HIDDEN_STEMS[branch];
    if (!hidden) continue;
    for (const slot of ['main','middle','residual']) {
      const stem = hidden[slot];
      if (!stem) continue;
      if (S.STEM_ELEMENT[stem] === dmEl) count++;
    }
  }
  return count;
}

function elementCounts(natal) {
  const c = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const pos of ['year','month','day','hour']) {
    const stem = natal[pos].stem;
    const branch = natal[pos].branch;
    if (pos !== 'day') c[S.STEM_ELEMENT[stem]] += 1;        // skip day stem (DM self)
    c[S.BRANCH_ELEMENT[branch]] += 1;
    const hidden = S.HIDDEN_STEMS[branch] || {};
    for (const slot of ['main','middle','residual']) {
      const h = hidden[slot];
      if (h) c[S.STEM_ELEMENT[h]] += 0.4;
    }
  }
  return c;
}

function resourcePresence(natal) {
  const dmEl = S.STEM_ELEMENT[natal.day.stem];
  const resourceEl = Object.entries(S.ELEMENT_PRODUCES).find(([_,v]) => v === dmEl)?.[0];
  if (!resourceEl) return { exists: false, count: 0, source: [] };
  const sources = [];
  for (const pos of ['year','month','hour']) {
    if (S.STEM_ELEMENT[natal[pos].stem] === resourceEl) sources.push(`${pos}.stem`);
    const hidden = S.HIDDEN_STEMS[natal[pos].branch] || {};
    if (hidden.main && S.STEM_ELEMENT[hidden.main] === resourceEl) sources.push(`${pos}.branch.main`);
  }
  return { exists: sources.length > 0, count: sources.length, source: sources };
}

function biJiePresence(natal) {
  const dmEl = S.STEM_ELEMENT[natal.day.stem];
  const sources = [];
  for (const pos of ['year','month','hour']) {
    if (S.STEM_ELEMENT[natal[pos].stem] === dmEl) sources.push(`${pos}.stem`);
    const hidden = S.HIDDEN_STEMS[natal[pos].branch] || {};
    if (hidden.main && S.STEM_ELEMENT[hidden.main] === dmEl) sources.push(`${pos}.branch.main`);
  }
  return { exists: sources.length > 0, count: sources.length, source: sources };
}

function monthCommand(natal) {
  const monthBranch = natal.month.branch;
  const monthEl = S.BRANCH_ELEMENT[monthBranch];
  const dmEl = S.STEM_ELEMENT[natal.day.stem];
  let supports;
  if (monthEl === dmEl) supports = 'parallel';
  else if (S.ELEMENT_PRODUCES[monthEl] === dmEl) supports = 'resource';
  else if (S.ELEMENT_PRODUCES[dmEl] === monthEl) supports = 'output';
  else if (S.ELEMENT_CONTROLS[dmEl] === monthEl) supports = 'wealth';
  else if (S.ELEMENT_CONTROLS[monthEl] === dmEl) supports = 'officer';
  else supports = 'unknown';
  return { branch: monthBranch, element: monthEl, role_for_dm: supports };
}

function dominantForce(natal) {
  const counts = elementCounts(natal);
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  const dmEl = S.STEM_ELEMENT[natal.day.stem];
  let topEl = null, topShare = 0;
  for (const [el, n] of Object.entries(counts)) {
    if (el === dmEl) continue;
    const share = n / total;
    if (share > topShare) { topShare = share; topEl = el; }
  }
  return { element: topEl, share_pct: Math.round(topShare * 100), dm_share_pct: Math.round((counts[dmEl] / total) * 100) };
}

function clashesOrCombos(natal) {
  const branches = ['year','month','day','hour'].map(p => natal[p].branch);
  const events = [];
  for (let i = 0; i < branches.length; i++) {
    for (let j = i+1; j < branches.length; j++) {
      if (S.SIX_CLASH[branches[i]] === branches[j]) events.push({ type: '六沖', pair: [branches[i], branches[j]] });
      if (S.SIX_HE[branches[i]] === branches[j]) events.push({ type: '六合', pair: [branches[i], branches[j]] });
    }
  }
  return events;
}

function detectFollow(natal) {
  const root = dmRootCount(natal);
  const resource = resourcePresence(natal);
  const biJie = biJiePresence(natal);
  const month = monthCommand(natal);
  const dom = dominantForce(natal);
  const counts = elementCounts(natal);
  const clashes = clashesOrCombos(natal);

  // hidden stem support of DM element (any pillar)
  const hiddenSupport = root;
  // blockers = ปัจจัยที่ขวาง follow
  const blockers = [];
  if (resource.exists) blockers.push(`resource ${resource.count}× (${resource.source.join(',')})`);
  if (biJie.exists) blockers.push(`bi_jie ${biJie.count}× (${biJie.source.join(',')})`);
  if (month.role_for_dm === 'resource' || month.role_for_dm === 'parallel') {
    blockers.push(`month_command supports DM as ${month.role_for_dm}`);
  }
  if (root > 1) blockers.push(`dm root ${root} hidden`);

  const evidence = {
    dm_root: root,
    resource_presence: resource,
    bi_jie_presence: biJie,
    month_command: month,
    dominant_force: dom,
    hidden_stem_support: hiddenSupport,
    clashes_or_combos: clashes,
    blockers,
  };

  // Categorization
  // - true_follow:  root=0 · no resource · no bi_jie · dominant >= 55% · DM share <= 8%
  // - false_follow: DM ดูอ่อน (share <= 12%) + dominant >= 35% + มี subtle support → "ดู follow แต่ไม่ follow"
  // - weak_normal:  มี root/resource ชัด · dominant < 35%
  // - ambiguous:    borderline หรือขัดแย้ง
  let follow_type, follow_candidate, confidence;
  const dmShare = dom.dm_share_pct;
  const hasSubtleSupport = root > 0 || resource.exists || biJie.exists;

  if (root === 0 && !resource.exists && !biJie.exists && dom.share_pct >= 55 && dmShare <= 8) {
    follow_type = 'true_follow';
    follow_candidate = true;
    confidence = Math.min(95, 50 + dom.share_pct);
  } else if (dmShare <= 12 && dom.share_pct >= 35 && hasSubtleSupport) {
    follow_type = 'false_follow';
    follow_candidate = true;
    confidence = 50 + Math.min(30, blockers.length * 8 + (dom.share_pct - 35));
  } else if (root >= 1 && dom.share_pct < 35) {
    follow_type = 'weak_normal';
    follow_candidate = false;
    confidence = 70;
  } else if (dom.share_pct >= 35 && dom.share_pct < 55) {
    follow_type = 'ambiguous';
    follow_candidate = false;
    confidence = 40;
  } else {
    follow_type = 'weak_normal';
    follow_candidate = false;
    confidence = 50;
  }

  // ── Targeted Rule T (approved 2026-05-06) ──
  // surgical fix สำหรับเคสแบบ Pun · DM ใน extreme weak phase {胎,絕}
  // dm_share ≤ 6% · blockers ≤ 2 → bump weak_normal → false_follow · cap conf 75
  // ห้าม override Yongshen · recommendation ยัง inspect_only
  const TARGET_PHASES_T = ['胎', '絕'];
  const monthPhase = S.twelvePhase ? S.twelvePhase(natal.day.stem, natal.month.branch) : null;
  const blockerSum = root + resource.count + biJie.count;
  if (
    monthPhase &&
    TARGET_PHASES_T.includes(monthPhase) &&
    dom.dm_share_pct <= 6 &&
    blockerSum <= 2 &&
    follow_type === 'weak_normal'
  ) {
    follow_type = 'false_follow';
    follow_candidate = true;
    confidence = Math.min(75, confidence + 10);
    evidence.targeted_rule_T = {
      fired: true,
      reason: `DM in extreme-weak phase ${monthPhase} · dm_share ${dom.dm_share_pct}% · blockers ${blockerSum}`,
      cap: 75,
    };
  }

  return {
    follow_candidate,
    follow_type,
    confidence,
    evidence,
    recommendation: 'inspect_only',
  };
}

module.exports = { detectFollow };
