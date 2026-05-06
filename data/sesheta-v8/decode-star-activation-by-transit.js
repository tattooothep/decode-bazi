/**
 * Decode Star Activation by Transit v1.0
 * 
 * Detects which classical stars activate when transit pillars
 * combine with natal pillars. Wraps detect-stars-detector.js
 * (natal-only) + adds transit-aware logic.
 * 
 * "Aeaw 2026 example" but generalized for any chart.
 */

// Reuse star detection tables (subset — full set in decode-symbolic-stars-25-engine.json)
const TIAN_YI = {
  '甲':['丑','未'],'戊':['丑','未'],'庚':['丑','未'],
  '乙':['申','子'],'己':['申','子'],
  '丙':['酉','亥'],'丁':['酉','亥'],
  '辛':['寅','午'],
  '壬':['卯','巳'],'癸':['卯','巳']
};
const WEN_CHANG = {'甲':'巳','乙':'午','丙':'申','戊':'申','丁':'酉','己':'酉','庚':'亥','辛':'子','壬':'寅','癸':'卯'};
const LU_SHEN = {'甲':'寅','乙':'卯','丙':'巳','戊':'巳','丁':'午','己':'午','庚':'申','辛':'酉','壬':'亥','癸':'子'};
const YANG_REN = {'甲':'卯','丙':'午','戊':'午','庚':'酉','壬':'子'};
const HONG_YAN = {'甲':'午','乙':'申','丙':'寅','丁':'未','戊':'辰','己':'辰','庚':'戌','辛':'酉','壬':'子','癸':'申'};
const JIN_YU = {'甲':'辰','乙':'巳','丙':'未','丁':'申','戊':'未','己':'申','庚':'戌','辛':'亥','壬':'丑','癸':'寅'};
const TIAN_DE = {'寅':'丁','卯':'申','辰':'壬','巳':'辛','午':'亥','未':'甲','申':'癸','酉':'寅','戌':'丙','亥':'乙','子':'巳','丑':'庚'};
const YUE_DE = {'寅':'丙','午':'丙','戌':'丙','亥':'甲','卯':'甲','未':'甲','申':'壬','子':'壬','辰':'壬','巳':'庚','酉':'庚','丑':'庚'};

const SAN_HE_GROUP = b => 
  '申子辰'.includes(b) ? 'water' :
  '寅午戌'.includes(b) ? 'fire' :
  '巳酉丑'.includes(b) ? 'metal' :
  '亥卯未'.includes(b) ? 'wood' : null;

const TAO_HUA = {water:'酉',fire:'卯',metal:'午',wood:'子'};
const YI_MA = {water:'寅',fire:'申',metal:'亥',wood:'巳'};
const HUA_GAI = {water:'辰',fire:'戌',metal:'丑',wood:'未'};
const JIANG_XING = {water:'子',fire:'午',metal:'酉',wood:'卯'};
const JIE_SHA = {water:'巳',fire:'亥',metal:'寅',wood:'申'};
const WANG_SHEN = {water:'亥',fire:'巳',metal:'申',wood:'寅'};

const STAR_META = {
  tian_yi: {category: 'auspicious', polarity: 'positive', label_th: 'เทียนอี๋ขุนนาง', label_zh: '天乙貴人',
            domain: ['help', 'rescue', 'mentor'], 
            interpretation_th: 'ผู้ช่วยจากเทพปรากฏ — ในช่วงที่ดาวนี้ active โอกาสได้รับความช่วยเหลือจากผู้มีอำนาจสูงในยามคับขัน'},
  wen_chang: {category: 'auspicious', polarity: 'positive', label_th: 'เหวินชาง / ดาวการศึกษา', label_zh: '文昌',
              domain: ['education', 'writing', 'exams'],
              interpretation_th: 'ปัญญาเฉียบคมและสร้างผลงาน — เหมาะเขียน วิจัย สอบ ตัดสินใจที่ใช้ตรรกะ'},
  tao_hua: {category: 'mixed', polarity: 'neutral', label_th: 'เถาฮัว / ดอกท้อ', label_zh: '桃花',
            domain: ['romance', 'charisma', 'social'],
            interpretation_th: 'เสน่ห์เปิด สังคมเข้าหา — ปี/เดือนที่ดาวนี้ active เหมาะเปิดตัว networking ระวังเรื่องชู้สาวถ้าอยู่กับคู่'},
  yi_ma: {category: 'mobility', polarity: 'neutral', label_th: 'อี้หม่า / ม้าสายลม', label_zh: '驛馬',
          domain: ['travel', 'relocation', 'change'],
          interpretation_th: 'พลังเคลื่อนที่ — เหมาะเดินทาง ย้ายงาน ขยายสาขา ระวังการเปลี่ยนแปลงกะทันหันเกินคาด'},
  hua_gai: {category: 'spiritual', polarity: 'mixed', label_th: 'ฮัวก่าย / มงกุฎโดดเดี่ยว', label_zh: '華蓋',
            domain: ['spirituality', 'art', 'solo'],
            interpretation_th: 'ความเฉลียวฉลาดเชิงศิลป์/ศาสนา — เหมาะคิดงานสร้างสรรค์ ปฏิบัติธรรม ระวังโดดเดี่ยวเกิน'},
  jiang_xing: {category: 'power', polarity: 'positive', label_th: 'เจียงซิ่ง / ดาวแม่ทัพ', label_zh: '將星',
               domain: ['leadership', 'authority', 'command'],
               interpretation_th: 'พลังผู้นำสั่งการ — ปี/วันที่ดาวนี้ active เหมาะตัดสินใจครั้งใหญ่ พูดต่อหน้าทีม รับตำแหน่งสูงขึ้น'},
  tian_de: {category: 'auspicious', polarity: 'positive', label_th: 'เทียนเต๋อ / คุณงามจากฟ้า', label_zh: '天德',
            domain: ['blessing', 'protection', 'luck'],
            interpretation_th: 'พรจากฟ้าคุ้มครอง — ปกป้องจากอุบัติเหตุและภัยพิบัติ เหมาะเริ่มกิจการมงคล'},
  yue_de: {category: 'auspicious', polarity: 'positive', label_th: 'เยฺว่เต๋อ / คุณงามรายเดือน', label_zh: '月德',
           domain: ['blessing', 'kindness', 'merit'],
           interpretation_th: 'บุญประจำเดือน — ความเมตตาได้ผล เหมาะทำบุญ บริจาค เริ่มโครงการช่วยสังคม'},
  lu_shen: {category: 'wealth', polarity: 'positive', label_th: 'ลู่เสิน / ดาวความเจริญ', label_zh: '祿神',
            domain: ['salary', 'official_income', 'stable_wealth'],
            interpretation_th: 'รายได้ทางการ — เลื่อนตำแหน่ง ขึ้นเงินเดือน ได้สัญญาที่มั่นคง'},
  yang_ren: {category: 'aggression', polarity: 'negative', label_th: 'หยางเหริน / มีดแกะ', label_zh: '羊刃',
             domain: ['competition', 'surgery', 'sharp_action'],
             interpretation_th: 'พลังก้าวร้าวคม — ใช้ในการแข่งขัน/ผ่าตัด/ทหาร = บวก ใช้ผิด = อุบัติเหตุ'},
  hong_yan: {category: 'romance', polarity: 'mixed', label_th: 'หงเยี่ยน / ความงามแดง', label_zh: '紅艷',
             domain: ['beauty', 'magnetism', 'attraction'],
             interpretation_th: 'ความงามเสน่ห์ดึงดูด — ระวังความสนใจที่ไม่พึงประสงค์'},
  jin_yu: {category: 'wealth', polarity: 'positive', label_th: 'จินอวี้ / รถทองคำ', label_zh: '金輿',
           domain: ['luxury', 'inheritance', 'wealthy_partner'],
           interpretation_th: 'ทรัพย์สินสูงและคู่ครองรวย — ปีที่ active เหมาะรับมรดก แต่งงานคู่มีฐานะ'},
  jie_sha: {category: 'loss', polarity: 'negative', label_th: 'เจี๋ยซา / ซาปล้น', label_zh: '劫煞',
            domain: ['theft', 'fraud', 'sudden_loss'],
            interpretation_th: 'การโจรกรรม การฉ้อโกง — ระวังคนใกล้ตัวและสัญญาที่รีบเซ็น'},
  wang_shen: {category: 'loss', polarity: 'negative', label_th: 'หวางเสิน / เทพมรณะ', label_zh: '亡神',
              domain: ['mental_traps', 'paranoia', 'careless_accident'],
              interpretation_th: 'กับดักทางจิต — ระวังประมาท หวาดระแวง การตัดสินใจในขณะอารมณ์รุนแรง'}
};

// ============= DETECTION =============

function getStarsForChart(natalPillars) {
  const stars = {};
  const day_stem = natalPillars.day.stem;
  const year_stem = natalPillars.year.stem;
  const day_branch = natalPillars.day.branch;
  const year_branch = natalPillars.year.branch;
  const month_branch = natalPillars.month.branch;
  
  const dayGroup = SAN_HE_GROUP(day_branch);
  const yearGroup = SAN_HE_GROUP(year_branch);
  
  // Returns target branches per star
  return {
    tian_yi:    [...new Set([...(TIAN_YI[day_stem]||[]), ...(TIAN_YI[year_stem]||[])])],
    wen_chang:  [WEN_CHANG[day_stem]],
    tao_hua:    [...new Set([TAO_HUA[dayGroup], TAO_HUA[yearGroup]].filter(Boolean))],
    yi_ma:      [...new Set([YI_MA[dayGroup], YI_MA[yearGroup]].filter(Boolean))],
    hua_gai:    [...new Set([HUA_GAI[dayGroup], HUA_GAI[yearGroup]].filter(Boolean))],
    jiang_xing: [...new Set([JIANG_XING[dayGroup], JIANG_XING[yearGroup]].filter(Boolean))],
    tian_de:    [TIAN_DE[month_branch]],
    yue_de:     [YUE_DE[month_branch]],
    lu_shen:    [LU_SHEN[day_stem]],
    yang_ren:   [YANG_REN[day_stem]].filter(Boolean),
    hong_yan:   [HONG_YAN[day_stem]],
    jin_yu:     [JIN_YU[day_stem]],
    jie_sha:    [...new Set([JIE_SHA[dayGroup], JIE_SHA[yearGroup]].filter(Boolean))],
    wang_shen:  [...new Set([WANG_SHEN[dayGroup], WANG_SHEN[yearGroup]].filter(Boolean))]
  };
}

/**
 * Main: detect which stars activate when transit pillar lands on natal target
 */
function detectStarActivationByTransit(natalPillars, transitPillars) {
  const natalStars = getStarsForChart(natalPillars);
  const activations = [];
  
  for (const [layer, transit] of Object.entries(transitPillars)) {
    if (!transit) continue;
    
    for (const [starName, targetBranches] of Object.entries(natalStars)) {
      if (!targetBranches || targetBranches.length === 0) continue;
      
      // Check if transit branch matches target
      if (targetBranches.includes(transit.branch)) {
        const meta = STAR_META[starName];
        activations.push({
          star: starName,
          star_zh: meta.label_zh,
          star_th: meta.label_th,
          category: meta.category,
          polarity: meta.polarity,
          activated_by: layer,
          transit_pillar: transit.stem + transit.branch,
          target_branch: transit.branch,
          domains: meta.domain,
          interpretation_th: `${meta.label_th} เปิดใช้งานผ่าน${layer} ${transit.stem}${transit.branch} → ${meta.interpretation_th}`,
          interpretation_zh: `${meta.label_zh}經${layer}${transit.stem}${transit.branch}激活`
        });
      }
      
      // Check if transit STEM activates (some stars use stem matching, e.g., Tian De)
      if (starName === 'tian_de' || starName === 'yue_de') {
        if (targetBranches.includes(transit.stem)) {
          const meta = STAR_META[starName];
          activations.push({
            star: starName,
            star_zh: meta.label_zh,
            star_th: meta.label_th,
            category: meta.category,
            polarity: meta.polarity,
            activated_by: layer,
            transit_pillar: transit.stem + transit.branch,
            target_stem: transit.stem,
            domains: meta.domain,
            interpretation_th: `${meta.label_th} เปิดใช้งานผ่านสเต็ม${transit.stem} ใน${layer} → ${meta.interpretation_th}`,
            interpretation_zh: `${meta.label_zh}經${layer}天干${transit.stem}激活`
          });
        }
      }
    }
  }
  
  return activations;
}

/**
 * Group activations by category for summary
 */
function summarizeActivations(activations) {
  const byCategory = {};
  const byPolarity = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
  const byLayer = {};
  
  for (const a of activations) {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a.star);
    
    byPolarity[a.polarity] = (byPolarity[a.polarity] || 0) + 1;
    
    if (!byLayer[a.activated_by]) byLayer[a.activated_by] = [];
    byLayer[a.activated_by].push(a.star);
  }
  
  return { byCategory, byPolarity, byLayer, total: activations.length };
}

// ============= TEST: AEAW 2026 =============

function testAeaw2026() {
  console.log('=== Aeaw 2026 — Star Activation by Transit ===\n');
  
  const natal = {
    year:  { stem:'甲', branch:'子' },
    month: { stem:'丙', branch:'子' },
    day:   { stem:'己', branch:'亥' },
    hour:  { stem:'辛', branch:'未' }
  };
  
  const transits = {
    da_yun:   { stem:'辛', branch:'巳' },
    liu_nian: { stem:'丙', branch:'午' },
    liu_yue:  { stem:'癸', branch:'巳' },
    liu_ri:   { stem:'戊', branch:'午' },
    liu_shi:  { stem:'戊', branch:'午' }
  };
  
  // Show natal star setup
  console.log('Natal star targets:');
  const natalStars = getStarsForChart(natal);
  for (const [star, branches] of Object.entries(natalStars)) {
    if (branches && branches.length) {
      console.log(`  ${STAR_META[star].label_zh} (${star}): branch targets = ${branches.join(', ')}`);
    }
  }
  console.log();
  
  const activations = detectStarActivationByTransit(natal, transits);
  const summary = summarizeActivations(activations);
  
  console.log(`=== ${activations.length} stars activated by transits ===\n`);
  
  console.log('By polarity:');
  for (const [pol, count] of Object.entries(summary.byPolarity)) {
    if (count > 0) console.log(`  ${pol}: ${count}`);
  }
  console.log();
  
  console.log('By layer:');
  for (const [layer, stars] of Object.entries(summary.byLayer)) {
    console.log(`  ${layer}: ${[...new Set(stars)].join(', ')}`);
  }
  console.log();
  
  console.log('--- Detailed activations ---');
  activations.forEach((a, i) => {
    console.log(`[${i+1}] ${a.star_zh} (${a.star}) — ${a.polarity}`);
    console.log(`     activated_by: ${a.activated_by} ${a.transit_pillar}`);
    console.log(`     domains: ${a.domains.join(', ')}`);
    console.log(`     ${a.interpretation_th.slice(0,150)}`);
    console.log();
  });
}

module.exports = {
  detectStarActivationByTransit,
  getStarsForChart,
  summarizeActivations,
  STAR_META
};

if (require.main === module) testAeaw2026();
