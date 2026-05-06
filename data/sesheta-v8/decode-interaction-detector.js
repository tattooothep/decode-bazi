/**
 * Decode Interaction Detector v1.0
 * 
 * Cross-pillar × transit activation engine
 * Reads decode-interaction-matrix.json + lookup tables
 * Returns structured activations with verdict, intensity, confidence,
 * domains, affected pillars, activated stars, tri-lingual narrative.
 * 
 * Usage:
 *   const { detectInteractions } = require('./decode-interaction-detector');
 *   const activations = detectInteractions(natalPillars, transitPillars, opts);
 */

const MATRIX = require('./decode-interaction-matrix.json');

// ============= CORE LOOKUP TABLES =============

const STEM_IDX = { '甲':0,'乙':1,'丙':2,'丁':3,'戊':4,'己':5,'庚':6,'辛':7,'壬':8,'癸':9 };
const BRANCH_IDX = { '子':0,'丑':1,'寅':2,'卯':3,'辰':4,'巳':5,'午':6,'未':7,'申':8,'酉':9,'戌':10,'亥':11 };
const STEM_ELEMENT = { '甲':'wood','乙':'wood','丙':'fire','丁':'fire','戊':'earth','己':'earth','庚':'metal','辛':'metal','壬':'water','癸':'water' };
const BRANCH_ELEMENT = { '子':'water','丑':'earth','寅':'wood','卯':'wood','辰':'earth','巳':'fire','午':'fire','未':'earth','申':'metal','酉':'metal','戌':'earth','亥':'water' };

const STEM_CLASH = {
  '甲':'庚','庚':'甲','乙':'辛','辛':'乙',
  '丙':'壬','壬':'丙','丁':'癸','癸':'丁'
};
const BRANCH_CLASH = {
  '子':'午','午':'子','丑':'未','未':'丑',
  '寅':'申','申':'寅','卯':'酉','酉':'卯',
  '辰':'戌','戌':'辰','巳':'亥','亥':'巳'
};
const STEM_HE = {
  '甲':{partner:'己',produces:'earth'}, '己':{partner:'甲',produces:'earth'},
  '乙':{partner:'庚',produces:'metal'}, '庚':{partner:'乙',produces:'metal'},
  '丙':{partner:'辛',produces:'water'}, '辛':{partner:'丙',produces:'water'},
  '丁':{partner:'壬',produces:'wood'},  '壬':{partner:'丁',produces:'wood'},
  '戊':{partner:'癸',produces:'fire'},  '癸':{partner:'戊',produces:'fire'}
};
const LIU_HE = {
  '子':'丑','丑':'子','寅':'亥','亥':'寅',
  '卯':'戌','戌':'卯','辰':'酉','酉':'辰',
  '巳':'申','申':'巳','午':'未','未':'午'
};
const SAN_HE_GROUPS = [
  {branches:['申','子','辰'], element:'water', peak:'子'},
  {branches:['寅','午','戌'], element:'fire',  peak:'午'},
  {branches:['巳','酉','丑'], element:'metal', peak:'酉'},
  {branches:['亥','卯','未'], element:'wood',  peak:'卯'}
];
const LIU_HAI = {
  '子':'未','未':'子','丑':'午','午':'丑',
  '寅':'巳','巳':'寅','卯':'辰','辰':'卯',
  '申':'亥','亥':'申','酉':'戌','戌':'酉'
};
const LIU_PO = {
  '子':'酉','酉':'子','丑':'辰','辰':'丑',
  '寅':'亥','亥':'寅','卯':'午','午':'卯',
  '巳':'申','申':'巳','未':'戌','戌':'未'
};
const SELF_PUNISH = ['辰','午','酉','亥'];
const KONG_WANG_BY_XUN = {
  0: ['戌','亥'], 1: ['申','酉'], 2: ['午','未'],
  3: ['辰','巳'], 4: ['寅','卯'], 5: ['子','丑']
};

// ============= UTILITY =============

function pillarKey(p) { return p ? p.stem + p.branch : null; }

function getXunIndex(stem, branch) {
  const s = STEM_IDX[stem], b = BRANCH_IDX[branch];
  if (s === undefined || b === undefined) return -1;
  // Find jia zi index (0-59) where pillar matches
  for (let i = 0; i < 60; i++) {
    if ((i % 10) === s && (i % 12) === b) return Math.floor(i / 10);
  }
  return -1;
}

function getKongWang(stem, branch) {
  const xun = getXunIndex(stem, branch);
  return xun >= 0 ? KONG_WANG_BY_XUN[xun] : [];
}

function sanHeGroupOf(branch) {
  return SAN_HE_GROUPS.find(g => g.branches.includes(branch));
}

// ============= INTERACTION PRIMITIVES =============

function checkStemClash(a, b)  { return STEM_CLASH[a] === b; }
function checkStemHe(a, b)     { return STEM_HE[a] && STEM_HE[a].partner === b; }
function checkBranchClash(a,b) { return BRANCH_CLASH[a] === b; }
function checkLiuHe(a, b)      { return LIU_HE[a] === b; }
function checkLiuHai(a, b)     { return LIU_HAI[a] === b; }
function checkLiuPo(a, b)      { return LIU_PO[a] === b; }

function checkBanSanHe(a, b) {
  const grpA = sanHeGroupOf(a);
  if (!grpA || a === b) return null;
  if (!grpA.branches.includes(b)) return null;
  const containsPeak = (a === grpA.peak) || (b === grpA.peak);
  return { element: grpA.element, peak: containsPeak };
}

function checkSanHui(branches) {
  const SAN_HUI = [
    {set:['寅','卯','辰'], element:'wood'},
    {set:['巳','午','未'], element:'fire'},
    {set:['申','酉','戌'], element:'metal'},
    {set:['亥','子','丑'], element:'water'}
  ];
  return SAN_HUI.find(s => s.set.every(b => branches.includes(b)));
}

function checkSanHe(branches) {
  return SAN_HE_GROUPS.find(g => g.branches.every(b => branches.includes(b)));
}

function getYinType(natal, transit) {
  if (!natal || !transit) return null;
  const stemClash = STEM_CLASH[natal.stem] === transit.stem;
  const branchClash = BRANCH_CLASH[natal.branch] === transit.branch;
  const stemSame = natal.stem === transit.stem;
  const branchSame = natal.branch === transit.branch;
  if (stemClash && branchClash) return 'fan_yin';
  if (stemSame && branchSame)   return 'fu_yin';
  if (stemClash && branchSame)  return 'half_fan_yin';
  if (stemSame && branchClash)  return 'half_fan_yin';
  return null;
}

function checkUngratefulPunishment(branches) {
  const set = ['寅','巳','申'];
  const present = set.filter(b => branches.includes(b));
  return present.length >= 2 ? present : null;
}

function checkEarthPunishment(branches) {
  const set = ['丑','戌','未'];
  const present = set.filter(b => branches.includes(b));
  return present.length >= 2 ? present : null;
}

// ============= USEFUL GOD =============

const CONTROLS = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood'
};
const PRODUCES = {
  wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood'
};

function elementRelationToDM(elem, dmElement) {
  if (elem === dmElement) return 'companion';
  if (PRODUCES[elem] === dmElement) return 'resource';
  if (PRODUCES[dmElement] === elem) return 'output';
  if (CONTROLS[dmElement] === elem) return 'wealth';
  if (CONTROLS[elem] === dmElement) return 'officer';
  return 'unknown';
}

function isUsefulGod(elem, opts) {
  return opts.usefulGodElements && opts.usefulGodElements.includes(elem);
}

function isUnfavorable(elem, opts) {
  return opts.unfavorableElements && opts.unfavorableElements.includes(elem);
}

// ============= DOMAIN MAPPING =============

const NATAL_DOMAIN_MAP = {
  year:  ['elders', 'ancestry', 'social_standing', 'reputation'],
  month: ['career', 'structure', 'parents', 'youth_authority'],
  day:   ['spouse', 'self', 'health', 'private_life'],
  hour:  ['children', 'team', 'creative_output', 'legacy']
};

// ============= NARRATIVE GENERATION =============

function pickInteractionDef(natalPos, transitLayer, triggerType) {
  const interaction = MATRIX.interactions.find(i =>
    (i.natal_position === natalPos || i.natal_position === 'any') &&
    (i.transit_layer === transitLayer)
  );
  if (!interaction) return null;
  const rule = interaction.trigger_rules.find(r => r.type === triggerType);
  return rule ? { interaction, rule } : { interaction, rule: null };
}

function intensityScore(label) {
  return MATRIX.verdict_taxonomy.intensity_score_map[label] || 0.5;
}

// ============= DETECTION ENGINE =============

function detectPairTriggers(natal, transit, layer, natalPos, opts) {
  const triggers = [];
  if (!natal || !transit) return triggers;
  
  // Stem-level
  if (checkStemClash(natal.stem, transit.stem)) {
    triggers.push({ type: 'stem_clash', element: STEM_ELEMENT[transit.stem] });
  }
  if (checkStemHe(natal.stem, transit.stem)) {
    triggers.push({ type: 'stem_he', element: STEM_HE[natal.stem].produces });
  }
  
  // Branch-level
  if (checkBranchClash(natal.branch, transit.branch)) {
    triggers.push({ type: 'branch_clash', element: BRANCH_ELEMENT[transit.branch] });
  }
  if (checkLiuHe(natal.branch, transit.branch)) {
    triggers.push({ type: 'liu_he' });
  }
  if (checkLiuHai(natal.branch, transit.branch)) {
    triggers.push({ type: 'liu_hai' });
  }
  if (checkLiuPo(natal.branch, transit.branch)) {
    triggers.push({ type: 'liu_po' });
  }
  const banHe = checkBanSanHe(natal.branch, transit.branch);
  if (banHe) {
    triggers.push({ type: 'ban_san_he', element: banHe.element, peak: banHe.peak });
  }
  
  // Yin-level
  const yin = getYinType(natal, transit);
  if (yin) triggers.push({ type: yin });
  
  // Useful god / unfavorable
  if (opts.dmElement) {
    const stemElem = STEM_ELEMENT[transit.stem];
    const branchElem = BRANCH_ELEMENT[transit.branch];
    if (isUsefulGod(stemElem, opts) || isUsefulGod(branchElem, opts)) {
      triggers.push({ type: 'yongshen_arrival', element: isUsefulGod(stemElem, opts) ? stemElem : branchElem });
    }
    if (isUnfavorable(stemElem, opts) || isUnfavorable(branchElem, opts)) {
      triggers.push({ type: 'jishen_arrival', element: isUnfavorable(stemElem, opts) ? stemElem : branchElem });
    }
  }
  
  // Kong Wang collision (transit branch lands on natal void)
  if (opts.kongWangVoids && opts.kongWangVoids.includes(transit.branch)) {
    triggers.push({ type: 'kong_wang_hit' });
  }
  
  return triggers;
}

function buildActivation(natalPos, transitLayer, transitPillar, trigger, opts) {
  const def = pickInteractionDef(natalPos, transitLayer, trigger.type);
  
  let verdict = 'neutral';
  let intensity = 'moderate';
  let domains = NATAL_DOMAIN_MAP[natalPos] ? [...NATAL_DOMAIN_MAP[natalPos].slice(0,2)] : [];
  let narrative = { th: '', en: '', zh: '' };
  
  if (def && def.rule) {
    verdict = def.rule.verdict || 'neutral';
    intensity = def.rule.intensity || 'moderate';
    if (def.rule.domains) domains = def.rule.domains;
    narrative = {
      th: def.rule.narrative_th || '',
      en: def.rule.narrative_en || '',
      zh: def.rule.narrative_zh || ''
    };
  } else {
    // Fall back to taxonomy defaults
    const taxonomy = findTaxonomyEntry(trigger.type);
    if (taxonomy) {
      verdict = taxonomy.default_verdict;
      intensity = taxonomy.default_intensity;
    }
    // Generate template-based narrative
    narrative = generateTemplateNarrative(natalPos, transitLayer, transitPillar, trigger, verdict, intensity);
  }
  
  return {
    interaction_id: def?.interaction.id || `${natalPos}_x_${transitLayer}_${trigger.type}`,
    name_zh: def?.interaction.name_zh,
    natal_position: natalPos,
    transit_layer: transitLayer,
    transit_pillar: pillarKey(transitPillar),
    trigger_type: trigger.type,
    trigger_element: trigger.element,
    verdict,
    intensity,
    domains,
    affected_pillars: [natalPos],
    narrative
  };
}

function findTaxonomyEntry(triggerType) {
  const tax = MATRIX.interaction_types_taxonomy;
  for (const cat of Object.keys(tax)) {
    const entry = tax[cat].find(t => t.type === triggerType);
    if (entry) return entry;
  }
  return null;
}

function generateTemplateNarrative(natalPos, transitLayer, transitPillar, trigger, verdict, intensity, preferStyle = 'detailed') {
  const candidates = MATRIX.verdict_templates_27_base.templates.filter(t =>
    t.verdict === verdict && t.intensity === intensity
  );
  // Prefer specified style, else first match, else any positive-moderate
  let tpl = candidates.find(t => t.style === preferStyle) ||
            candidates[0] ||
            MATRIX.verdict_templates_27_base.templates.find(t => t.verdict === 'neutral' && t.intensity === 'moderate' && t.style === 'detailed') ||
            MATRIX.verdict_templates_27_base.templates[0];
  
  const layerLabel = { da_yun:'大運', liu_nian:'流年', liu_yue:'流月', liu_ri:'流日', liu_shi:'流時' }[transitLayer] || transitLayer;
  const posLabel = { year:'年柱', month:'月柱', day:'日柱', hour:'時柱' }[natalPos] || natalPos;
  const elemOrGod = trigger.element || trigger.type;
  
  const fill = (str) => str
    .replaceAll('{layer}', layerLabel)
    .replaceAll('{transit_pillar}', pillarKey(transitPillar))
    .replaceAll('{natal_position}', posLabel)
    .replaceAll('{element_or_god}', elemOrGod)
    .replaceAll('{interaction_type}', trigger.type)
    .replaceAll('{domain}', 'general')
    .replaceAll('{action_hint}', '');
  
  return { th: fill(tpl.th), en: fill(tpl.en), zh: fill(tpl.zh) };
}

// ============= MULTI-LAYER STACK DETECTION =============

function detectStacks(activations, natal, transits, opts) {
  const stacks = [];
  
  // Triple resonance positive: da_yun + liu_nian + liu_yue all bring useful god
  const layersWithUsefulGod = ['da_yun','liu_nian','liu_yue'].filter(layer => {
    const t = transits[layer];
    if (!t) return false;
    return isUsefulGod(STEM_ELEMENT[t.stem], opts) || isUsefulGod(BRANCH_ELEMENT[t.branch], opts);
  });
  if (layersWithUsefulGod.length === 3) {
    const def = MATRIX.multi_layer_stack.find(s => s.id === 'triple_resonance_positive');
    if (def) stacks.push({
      stack_id: def.id, name_zh: def.name_zh,
      layers: def.layers, verdict: def.verdict, intensity: def.intensity,
      confidence_modifier: def.confidence_modifier, domains: def.domains,
      narrative: { th: def.narrative_th, en: def.narrative_en, zh: def.narrative_zh }
    });
  }
  
  // Triple resonance negative
  const layersWithJishen = ['da_yun','liu_nian','liu_yue'].filter(layer => {
    const t = transits[layer];
    if (!t) return false;
    return isUnfavorable(STEM_ELEMENT[t.stem], opts) || isUnfavorable(BRANCH_ELEMENT[t.branch], opts);
  });
  if (layersWithJishen.length === 3) {
    const def = MATRIX.multi_layer_stack.find(s => s.id === 'triple_resonance_negative');
    if (def) stacks.push({
      stack_id: def.id, name_zh: def.name_zh,
      layers: def.layers, verdict: def.verdict, intensity: def.intensity,
      confidence_modifier: def.confidence_modifier, domains: def.domains,
      narrative: { th: def.narrative_th, en: def.narrative_en, zh: def.narrative_zh }
    });
  }
  
  // Fan Yin cascade: da_yun + liu_nian both fan_yin same natal pillar
  for (const pos of ['year','month','day','hour']) {
    const dyYin = getYinType(natal[pos], transits.da_yun);
    const lnYin = getYinType(natal[pos], transits.liu_nian);
    if ((dyYin === 'fan_yin' || dyYin === 'fu_yin') &&
        (lnYin === 'fan_yin' || lnYin === 'fu_yin')) {
      const def = MATRIX.multi_layer_stack.find(s => s.id === 'fan_yin_cascade');
      if (def) stacks.push({
        stack_id: def.id, name_zh: def.name_zh,
        layers: def.layers, verdict: def.verdict, intensity: def.intensity,
        confidence_modifier: def.confidence_modifier,
        domains: def.domains, affected_pillar: pos,
        narrative: { th: def.narrative_th, en: def.narrative_en, zh: def.narrative_zh }
      });
    }
  }
  
  // Yongshen pierce 4 layers landing same natal pillar
  for (const pos of ['year','month','day','hour']) {
    if (!natal[pos]) continue;
    const layers4 = ['da_yun','liu_nian','liu_yue','liu_ri'];
    const allHit = layers4.every(layer => {
      const t = transits[layer];
      if (!t) return false;
      const ugStem = isUsefulGod(STEM_ELEMENT[t.stem], opts);
      const ugBranch = isUsefulGod(BRANCH_ELEMENT[t.branch], opts);
      // also require interaction with this natal pillar
      const triggers = detectPairTriggers(natal[pos], t, layer, pos, opts);
      return (ugStem || ugBranch) && triggers.length > 0;
    });
    if (allHit) {
      const def = MATRIX.multi_layer_stack.find(s => s.id === 'yongshen_pierce');
      if (def) stacks.push({
        stack_id: def.id, name_zh: def.name_zh,
        layers: def.layers, verdict: def.verdict, intensity: def.intensity,
        confidence_modifier: def.confidence_modifier,
        domains: def.domains, affected_pillar: pos,
        narrative: { th: def.narrative_th, en: def.narrative_en, zh: def.narrative_zh }
      });
    }
  }
  
  // San He activation via transits
  const allBranches = [
    ...Object.values(natal).filter(p => p).map(p => p.branch),
    ...Object.values(transits).filter(p => p).map(p => p.branch)
  ];
  const sanHeFormed = checkSanHe([...new Set(allBranches)]);
  const natalBranches = Object.values(natal).filter(p => p).map(p => p.branch);
  if (sanHeFormed) {
    const fromTransit = sanHeFormed.branches.filter(b => !natalBranches.includes(b));
    if (fromTransit.length >= 1 && fromTransit.length <= 2) {
      const def = MATRIX.multi_layer_stack.find(s => s.id === 'san_he_activation');
      if (def) stacks.push({
        stack_id: def.id, name_zh: def.name_zh,
        layers: def.layers, verdict: def.verdict, intensity: def.intensity,
        confidence_modifier: def.confidence_modifier,
        domains: def.domains,
        formed_element: sanHeFormed.element,
        narrative: { th: def.narrative_th, en: def.narrative_en, zh: def.narrative_zh }
      });
    }
  }
  
  // Kong Wang collision
  if (opts.kongWangVoids && opts.kongWangVoids.length) {
    for (const layer of ['liu_nian','liu_yue']) {
      const t = transits[layer];
      if (t && opts.kongWangVoids.includes(t.branch)) {
        const def = MATRIX.multi_layer_stack.find(s => s.id === 'kong_wang_void_collision');
        if (def) stacks.push({
          stack_id: def.id, name_zh: def.name_zh,
          layers: [layer], verdict: def.verdict, intensity: def.intensity,
          confidence_modifier: def.confidence_modifier,
          domains: def.domains,
          narrative: { th: def.narrative_th, en: def.narrative_en, zh: def.narrative_zh }
        });
      }
    }
  }
  
  return stacks;
}

// ============= CONFIDENCE SCORING =============

function computeConfidence(activations, stacks, opts) {
  const formula = MATRIX.confidence_score_formula;
  
  const interactionCount = activations.length;
  const interactionFactor = Math.min(100, interactionCount * 12);
  
  const intensityAggregate = activations
    .reduce((sum, a) => sum + intensityScore(a.intensity) * 100, 0) / Math.max(1, activations.length);
  
  // useful god alignment: how many activations have yongshen_arrival or matching domain
  const ugHits = activations.filter(a => 
    a.trigger_type === 'yongshen_arrival' || a.trigger_type === 'jishen_arrival'
  ).length;
  const ugFactor = Math.min(100, ugHits * 25);
  
  // layer resonance: distinct layers with same verdict direction
  const verdictCounts = {};
  activations.forEach(a => {
    if (!verdictCounts[a.verdict]) verdictCounts[a.verdict] = new Set();
    verdictCounts[a.verdict].add(a.transit_layer);
  });
  const maxLayerResonance = Math.max(0, ...Object.values(verdictCounts).map(s => s.size));
  const resonanceFactor = Math.min(100, maxLayerResonance * 25);
  
  // root strength (provided by opts or default 60)
  const rootFactor = opts.rootStrength != null ? opts.rootStrength : 60;
  
  // void modifier
  const voidHits = activations.filter(a => a.trigger_type === 'kong_wang_hit').length;
  const voidModifier = voidHits > 0 ? -15 * voidHits : 0;
  
  // yin modifier
  const yinHits = activations.filter(a => 
    ['fan_yin','fu_yin','half_fan_yin'].includes(a.trigger_type)
  ).length;
  const yinModifier = yinHits > 0 ? +10 * Math.min(yinHits, 3) : 0;
  
  let base =
    formula.base_factors.find(f => f.name === 'interaction_count').weight * interactionFactor +
    formula.base_factors.find(f => f.name === 'root_strength').weight * rootFactor +
    formula.base_factors.find(f => f.name === 'useful_god_alignment').weight * ugFactor +
    formula.base_factors.find(f => f.name === 'intensity_aggregate').weight * intensityAggregate +
    formula.base_factors.find(f => f.name === 'layer_resonance').weight * resonanceFactor +
    formula.base_factors.find(f => f.name === 'void_modifier').weight * voidModifier +
    formula.base_factors.find(f => f.name === 'yin_modifier').weight * yinModifier;
  
  // stack modifier
  let stackMod = 1.0;
  if (stacks.length === 1) stackMod = 1.15;
  else if (stacks.length === 2) stackMod = 1.30;
  else if (stacks.length >= 3) stackMod = 1.50;
  
  const final = Math.max(0, Math.min(100, Math.round(base * stackMod)));
  
  let interpretation = 'very_low';
  if (final >= 75) interpretation = 'high';
  else if (final >= 50) interpretation = 'medium';
  else if (final >= 25) interpretation = 'low';
  
  return { score: final, interpretation, factors: { interactionFactor, rootFactor, ugFactor, intensityAggregate, resonanceFactor, voidModifier, yinModifier, stackMod } };
}

// ============= MAIN ENTRY =============

/**
 * @param {Object} natal - { year, month, day, hour } each {stem, branch}
 * @param {Object} transits - { da_yun, liu_nian, liu_yue, liu_ri, liu_shi } each {stem, branch}
 * @param {Object} opts - { dmElement, usefulGodElements, unfavorableElements, kongWangVoids, rootStrength }
 */
function detectInteractions(natal, transits, opts = {}) {
  // auto-fill kong wang from natal day pillar if not provided
  if (!opts.kongWangVoids && natal.day) {
    opts.kongWangVoids = getKongWang(natal.day.stem, natal.day.branch);
  }
  
  const activations = [];
  const positions = ['year','month','day','hour'];
  const layers = ['da_yun','liu_nian','liu_yue','liu_ri','liu_shi'];
  
  // 4 × 5 = 20 base cases
  for (const pos of positions) {
    if (!natal[pos]) continue;
    for (const layer of layers) {
      if (!transits[layer]) continue;
      const triggers = detectPairTriggers(natal[pos], transits[layer], layer, pos, opts);
      for (const trig of triggers) {
        activations.push(buildActivation(pos, layer, transits[layer], trig, opts));
      }
    }
  }
  
  // Multi-layer stack detection
  const stacks = detectStacks(activations, natal, transits, opts);
  
  // Confidence
  const confidence = computeConfidence(activations, stacks, opts);
  
  // Build summary
  const positiveCount = activations.filter(a => a.verdict === 'positive').length;
  const negativeCount = activations.filter(a => a.verdict === 'negative').length;
  const overallVerdict =
    positiveCount > negativeCount * 1.5 ? 'positive' :
    negativeCount > positiveCount * 1.5 ? 'negative' :
    'mixed';
  
  // Domain aggregation
  const domainCounts = {};
  activations.forEach(a => a.domains.forEach(d => {
    domainCounts[d] = (domainCounts[d] || 0) + intensityScore(a.intensity);
  }));
  stacks.forEach(s => (s.domains || []).forEach(d => {
    domainCounts[d] = (domainCounts[d] || 0) + intensityScore(s.intensity) * (s.confidence_modifier || 1);
  }));
  const topDomains = Object.entries(domainCounts)
    .sort((a,b) => b[1] - a[1]).slice(0,3).map(([d,_]) => d);
  
  return {
    activations,
    stacks,
    confidence,
    summary: {
      activation_count: activations.length,
      stack_count: stacks.length,
      positive_count: positiveCount,
      negative_count: negativeCount,
      overall_verdict: overallVerdict,
      top_domains: topDomains
    }
  };
}

// ============= TEST WITH AEAW 2026 =============

function testAeaw2026() {
  console.log('=== Aeaw 2026 Interaction Detection ===\n');
  console.log('Natal: 甲子 / 丙子 / 己亥 / 辛未');
  console.log('Day Master: 己 (Yin Earth, Frozen winter, weak)');
  console.log('Useful god: Fire (regulating Frozen Crisis)\n');
  
  const natal = {
    year:  { stem:'甲', branch:'子' },
    month: { stem:'丙', branch:'子' },
    day:   { stem:'己', branch:'亥' },
    hour:  { stem:'辛', branch:'未' }
  };
  
  // Test 1: 2026 May (just into 辛巳 LP, annual 丙午, monthly 癸巳)
  const transits = {
    da_yun:   { stem:'辛', branch:'巳' },  // age 42-52
    liu_nian: { stem:'丙', branch:'午' },  // 2026
    liu_yue:  { stem:'癸', branch:'巳' },  // May 2026
    liu_ri:   { stem:'戊', branch:'午' },  // sample auspicious day
    liu_shi:  { stem:'戊', branch:'午' }   // 11am-1pm slot
  };
  
  const opts = {
    dmElement: 'earth',
    usefulGodElements: ['fire', 'earth'],
    unfavorableElements: ['water', 'metal'],
    rootStrength: 30  // weak DM
  };
  
  const result = detectInteractions(natal, transits, opts);
  
  console.log(`Activations detected: ${result.summary.activation_count}`);
  console.log(`Multi-layer stacks: ${result.summary.stack_count}`);
  console.log(`Positive : Negative = ${result.summary.positive_count} : ${result.summary.negative_count}`);
  console.log(`Overall verdict: ${result.summary.overall_verdict}`);
  console.log(`Top domains: ${result.summary.top_domains.join(', ')}`);
  console.log(`Confidence: ${result.confidence.score}/100 (${result.confidence.interpretation})\n`);
  
  console.log('--- Detailed activations ---');
  result.activations.forEach((a, i) => {
    console.log(`[${i+1}] ${a.transit_layer} ${a.transit_pillar} → natal ${a.natal_position}`);
    console.log(`     ${a.trigger_type} | ${a.verdict} | ${a.intensity}`);
    console.log(`     domains: ${a.domains.join(', ')}`);
    if (a.narrative.th) console.log(`     TH: ${a.narrative.th.slice(0,120)}...`);
    console.log();
  });
  
  console.log('--- Multi-layer stacks ---');
  result.stacks.forEach((s, i) => {
    console.log(`[${i+1}] ${s.stack_id} (${s.name_zh})`);
    console.log(`     layers: ${s.layers.join('+')} | ${s.verdict} | ${s.intensity}`);
    console.log(`     confidence_modifier: ${s.confidence_modifier}`);
    if (s.narrative.th) console.log(`     TH: ${s.narrative.th.slice(0,120)}...`);
    console.log();
  });
  
  console.log('--- Confidence factors ---');
  console.log(JSON.stringify(result.confidence.factors, null, 2));
}

module.exports = {
  detectInteractions,
  detectPairTriggers,
  detectStacks,
  computeConfidence,
  getYinType,
  getKongWang,
  STEM_ELEMENT,
  BRANCH_ELEMENT
};

if (require.main === module) testAeaw2026();
