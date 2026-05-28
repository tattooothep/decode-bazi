/* prototype Layer 5 行運成敗 timing v1 — encode ตัวบทจริง 2 สำนัก
   §1a 子平真詮 ตารางทองคำ喜運/忌運 per格 · §2d 滴天髓 日主旺衰ปรับร้าย · §2c-lite 流年หนุน/ต้าน
   ทุก verdict อ้าง rule-id (ZP-1a/DTS-2d/DTS-2c) เพื่อตรวจย้อน (ตาม consensus กับพ่อ)
   craft golden god-level (test rule layer) — integration 4เสา/hidden = ชั้น port เข้า chart-packet
   รัน: node scripts/proto-layer5-v1.cjs */
const S = require('../data/library/wrappers/shared');

/* §1a — ตารางทองคำ喜運/忌運 (สิบเทพของวัยจร) per格×相神 · verbatim 子平真詮論行運 ¶122-160
   key = `${格}|${相神/用神}` · ค่า = { xi:[喜運สิบเทพ], ji:[忌運สิบเทพ], src } */
const RUN_RULES = {
  // 正官格
  '正官格|佩印':   { xi:['正印','偏印'],          ji:['正財','偏財'],            src:'ZP-1a-01 官用印制傷·運助印 / 忌財去印' },
  '正官格|無印':   { xi:['正財','偏財'],          ji:['傷官','食神'],            src:'ZP-1a-02 正官無印·運行傷則破' },
  '正官格|用財':   { xi:['正印','偏印'],          ji:['傷官','食神','七殺'],     src:'ZP-1a-03 正官用財·喜印身旺·忌食傷' },
  // 財格
  '財格|生官':     { xi:['正印','偏印','比肩','劫財'], ji:['七殺','傷官'],       src:'ZP-1a-04 財旺生官·喜身旺印·不利煞傷' },
  '財格|食生':     { xi:['正財','偏財','比肩','劫財'], ji:['正官','七殺'],       src:'ZP-1a-05 財用食生·財食重喜幫身·官煞晦' },
  '財格|佩印':     { xi:['正官','正印','偏印'],   ji:['比肩','劫財'],            src:'ZP-1a-06 財佩印·喜官鄉·身弱喜印旺' },
  '財格|帶傷':     { xi:['正財','偏財'],          ji:['七殺'],                   src:'ZP-1a-07 財帶傷官·財運亨·煞運不利' },
  // 印綬格
  '印綬格|用官':   { xi:['正財','偏財','傷官','食神'], ji:[],                    src:'ZP-1a-08 印用官·財運反吉·傷食最利' },
  '印綬格|用傷食': { xi:['正財','偏財','傷官','食神'], ji:['正官','七殺'],       src:'ZP-1a-09 印旺洩秀·財傷食吉·官煞太過' },
  '印綬格|印重用財':{ xi:['正財','偏財'],         ji:['比肩','劫財'],            src:'ZP-1a-10 印重透財抑太過·忌比劫' },
  // 食神格
  '食神格|生財':   { xi:['正財','偏財'],          ji:['正官','七殺','偏印'],     src:'ZP-1a-11 食神生財·忌官煞·畏梟(偏印)奪食' },
  '食神格|帶煞':   { xi:['正印','偏印','比肩','劫財'], ji:['正財','偏財'],       src:'ZP-1a-12 食用煞印·喜印旺身旺·忌財鄉' },
  // 七殺格
  '七殺格|食制':   { xi:['食神','傷官','比肩','劫財'], ji:['正印','偏印','正財','偏財','正官'], src:'ZP-1a-13 煞用食制·喜食傷制煞/比劫助身·畏印綬奪食·忌財黨煞·忌官混' },
  '七殺格|用印':   { xi:['傷官','食神','比肩','劫財'], ji:['正財','偏財'],       src:'ZP-1a-14 煞用印·不利財鄉·傷食美' },
  // 傷官格
  '傷官格|佩印':   { xi:['正官','七殺','正印','偏印'], ji:['正財','偏財'],       src:'ZP-1a-15 傷官佩印·運行官煞美·忌財' },
  '傷官格|生財':   { xi:['正財','偏財'],          ji:['七殺','正印','偏印'],     src:'ZP-1a-16 傷官生財·財運亨·煞印不利' },
  // 陽刃格
  '陽刃格|用官':   { xi:['正財','偏財','正官'],   ji:['食神','傷官'],            src:'ZP-1a-17 陽刃用官·運助財鄉·忌食傷制官' },
  '陽刃格|用煞':   { xi:['正財','偏財','七殺'],   ji:['食神'],                   src:'ZP-1a-18 陽刃用煞·忌食制煞' },
  // 建祿月劫
  '建祿格|用官':   { xi:['正財','正官'],          ji:['傷官'],                   src:'ZP-1a-19 建祿用官·運逢傷則破' },
  '建祿格|用財':   { xi:['傷官','食神','正財','偏財'], ji:['比肩','劫財'],       src:'ZP-1a-20 月劫用財·運行傷食·忌比劫' },
};

/* §2d — 日主旺衰 map (consensus พ่อ: rooted/strong→旺相 · no_root/token→休囚) */
function dmVigor(rootednessLabel) {
  const strong = ['strong_root','rooted','medium_root'];
  return strong.includes(rootednessLabel) ? '旺相' : '休囚';
}

/* judge timing: วัยจร(運)สิบเทพ เทียบตาราง → 成/破/平 + §2d ปรับ + §2c-lite ปีจร */
function judgeTiming({ ge, xiangShen, luckGods, yearGod, dmRoot }) {
  const key = `${ge}|${xiangShen}`;
  const rule = RUN_RULES[key];
  if (!rule) return { verdict:'平', reason:`ยังไม่มีกฎ ${key}`, ruleId:'NONE' };
  // §1a — วัยจรเข้า喜運/忌運?
  const hitXi = luckGods.filter(g => rule.xi.includes(g));
  const hitJi = luckGods.filter(g => rule.ji.includes(g));
  let verdict, ruleId = rule.src, reason;
  if (hitJi.length && !hitXi.length) { verdict='破'; reason=`วัยจร ${hitJi.join('/')} = 忌運 (พังโครง)`; }
  else if (hitXi.length && !hitJi.length) { verdict='成'; reason=`วัยจร ${hitXi.join('/')} = 喜運 (หนุนโครง)`; }
  else if (hitXi.length && hitJi.length) { verdict='平'; reason=`วัยจรมีทั้งหนุน(${hitXi.join('/')})และขัด(${hitJi.join('/')})`; }
  else { verdict='平'; reason='วัยจรเป็นกลางต่อโครงดวง'; }
  // §2d — 旺衰 ปรับความหนักของ破
  const vigor = dmVigor(dmRoot);
  if (verdict==='破') {
    if (vigor==='旺相') { reason+=` · DTS-2d 日主旺相→ทนได้ (เบาลง·ระวังไม่ถึงร้าย)`; verdict='破(เบา)'; }
    else { reason+=` · DTS-2d 日主休囚→รับเต็ม (หนัก)`; verdict='破(หนัก)'; }
  }
  // §2c-lite — 流年หนุน/ต้าน (ปีปัจจุบันเท่านั้น · ไม่ฟันธงเลขปีอนาคต)
  let annual = '';
  if (yearGod) {
    if (rule.xi.includes(yearGod)) annual = `DTS-2c ปีจร ${yearGod} = หนุนซ้ำ`;
    else if (rule.ji.includes(yearGod)) annual = `DTS-2c ปีจร ${yearGod} = ต้าน`;
    else annual = `DTS-2c ปีจร ${yearGod} = เป็นกลาง`;
  }
  return { verdict, reason, ruleId, annual };
}

/* ===== GOLDEN (craft จากกฎ §1a + ตรวจกับเฉลย命例 §4) ===== */
const GOLDEN = [
  // §1a แกน — 8格 喜運/忌運
  { d:'正官佩印·運走印',     ge:'正官格', xiangShen:'佩印', luckGods:['正印'], dmRoot:'rooted',  expect:'成' },
  { d:'正官無印·運走傷官',   ge:'正官格', xiangShen:'無印', luckGods:['傷官'], dmRoot:'rooted',  expect:'破(เบา)' },
  { d:'財旺生官·運走七殺',   ge:'財格',   xiangShen:'生官', luckGods:['七殺'], dmRoot:'no_root', expect:'破(หนัก)' },
  { d:'印用官·運走財(反吉)', ge:'印綬格', xiangShen:'用官', luckGods:['正財'], dmRoot:'rooted',  expect:'成' },
  { d:'食神生財·運走偏印(梟)',ge:'食神格', xiangShen:'生財', luckGods:['偏印'], dmRoot:'rooted',  expect:'破(เบา)' },
  { d:'七殺食制·運逢梟奪食', ge:'七殺格', xiangShen:'食制', luckGods:['偏印'], dmRoot:'no_root', expect:'破(หนัก)' },
  { d:'傷官佩印·運走官煞',   ge:'傷官格', xiangShen:'佩印', luckGods:['七殺'], dmRoot:'rooted',  expect:'成' },
  { d:'傷官佩印·運走財',     ge:'傷官格', xiangShen:'佩印', luckGods:['正財'], dmRoot:'no_root', expect:'破(หนัก)' },
  { d:'陽刃用官·運助財鄉',   ge:'陽刃格', xiangShen:'用官', luckGods:['正財'], dmRoot:'rooted',  expect:'成' },
  { d:'建祿用官·運逢傷',     ge:'建祿格', xiangShen:'用官', luckGods:['傷官'], dmRoot:'rooted',  expect:'破(เบา)' },
  // §2d — 旺衰 แยกความหนัก (忌運เดียวกัน·รากต่าง)
  { d:'同忌運·日主旺→เบา',  ge:'建祿格', xiangShen:'用財', luckGods:['比肩'], dmRoot:'strong_root', expect:'破(เบา)' },
  { d:'同忌運·日主弱→หนัก', ge:'建祿格', xiangShen:'用財', luckGods:['比肩'], dmRoot:'no_root',     expect:'破(หนัก)' },
  // §2c-lite — ปีจรหนุน/ต้าน (verdict 成 + ปีจร tag)
  { d:'成運+ปีจรหนุนซ้ำ',   ge:'印綬格', xiangShen:'用官', luckGods:['傷官'], yearGod:'正財', dmRoot:'rooted', expect:'成', annualHas:'หนุนซ้ำ' },
  { d:'成運+ปีจรต้าน',      ge:'傷官格', xiangShen:'佩印', luckGods:['正印'], yearGod:'正財', dmRoot:'rooted', expect:'成', annualHas:'ต้าน' },
];

let pass=0, fail=0;
console.log('=== Layer 5 行運成敗 timing v1 (§1a+§2d+§2c-lite) ===\n');
for (const g of GOLDEN) {
  const r = judgeTiming(g);
  let ok = r.verdict === g.expect;
  if (ok && g.annualHas) ok = (r.annual||'').includes(g.annualHas);
  console.log(`${ok?'✓':'✗'} ${g.d}`);
  console.log(`   → ${r.verdict} · ${r.reason}`);
  if (r.annual) console.log(`   📅 ${r.annual}`);
  console.log(`   [${r.ruleId}]`);
  if (!ok) console.log(`   ⚠️ expect ${g.expect}${g.annualHas?` +annual "${g.annualHas}"`:''}`);
  ok ? pass++ : fail++;
}
console.log(`\n=== ${pass}/${pass+fail} ${fail?'❌ FAIL':'✅ PASS'} ===`);
process.exit(fail?1:0);
