/* Layer 5 test — invariant (buildXiangShen verdict 16/16 ไม่เปลี่ยน + subLabel) + integration (buildChengBaiNow)
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-layer5.mjs */
import { buildXiangShen, buildChengBaiNow } from '../src/lib/chart-packet.ts';

const P = (y, m, d, h) => ({ year:{stem:y[0],branch:y[1]}, month:{stem:m[0],branch:m[1]}, day:{stem:d[0],branch:d[1]}, hour:h?{stem:h[0],branch:h[1]}:null });
// ชั้น A: invariant — verdict เดิมห้ามเปลี่ยน (reuse golden จาก proto-xiangshen-v2) + subLabel ต้องไม่ throw
const INV = [
  ['正官 成格', P('己卯','辛酉','甲子','戊辰'), '正官格', '成格'],
  ['正官 破格傷官見官', P('辛酉','丁酉','甲午','丁卯'), '正官格', '破格'],
  ['正官 救應印制傷', P('癸酉','辛酉','甲午','丁卯'), '正官格', '救應'],
  ['財格 成格', P('辛酉','己酉','甲午','戊午'), '財格', '成格'],
  ['財格 破格比劫奪財', P('乙卯','己卯','甲子','乙亥'), '財格', '破格'],
  ['印格 成格', P('癸酉','辛酉','甲子','癸酉'), '印綬格', '成格'],
  ['印格 破格財破印', P('戊午','癸酉','甲午','戊午'), '印綬格', '破格'],
  ['食神 成格', P('己卯','丙午','甲午','己巳'), '食神格', '成格'],
  ['食神 破格梟奪食', P('壬子','丙午','甲子','壬申'), '食神格', '破格'],
  ['七殺 成格食制', P('庚午','丙戌','甲申','庚午'), '七殺格', '成格'],
  ['傷官 成格傷生財', P('丁卯','丁未','甲子','己巳'), '傷官格', '成格'],
  ['傷官 破格見官', P('辛酉','丁卯','甲午','丁卯'), '傷官格', '破格'],
  ['陽刃 成格', P('庚午','丁卯','甲子','庚午'), '陽刃格', '成格'],
  ['陽刃 破格無制', P('丙寅','丁卯','甲子','乙亥'), '陽刃格', '破格'],
  ['建祿 成格', P('辛酉','丙寅','甲子','己巳'), '建祿月劫格', '成格'],
  ['建祿 破格純比劫', P('甲寅','丙寅','甲寅','乙亥'), '建祿月劫格', '破格'],
];
let pass=0, fail=0;
console.log('=== ชั้น A: invariant buildXiangShen (verdict เดิม + subLabel) ===');
for (const [name, pil, ge, exp] of INV) {
  const r = buildXiangShen(pil, '甲', ge);
  const ok = r && r.verdict === exp;
  console.log(`${ok?'✓':'✗'} ${name} → ${r?.verdict}/${r?.subLabel ?? 'null'} (expect ${exp})`);
  ok ? pass++ : fail++;
}
// ชั้น B: integration buildChengBaiNow (mock xiangShen + craft วัยจร/ปีจร · dm=甲)
const L = (s,b) => ({stem:s,branch:b});
const INT = [
  // [desc, xiangShen, currentLuck, annual, dmRoot, is3p, expectVerdict, expectAnnualHas]
  ['傷官佩印·運七殺→成',  {geZh:'傷官格',subLabel:'佩印'}, L('庚','申'), null, 'rooted',  false, '成'],  // 申main=庚七殺 (สะอาด·ไม่ใช้辰ที่มี戊偏財ก่อ noise)
  ['傷官佩印·運偏財→破หนัก',{geZh:'傷官格',subLabel:'佩印'}, L('戊','辰'), null, 'no_root', false, '破(หนัก)'],
  ['傷官佩印·運偏財·日旺→破เบา',{geZh:'傷官格',subLabel:'佩印'}, L('戊','辰'), null, 'strong_root', false, '破(เบา)'],
  ['印用官·運傷官+ปีจรหนุน', {geZh:'印綬格',subLabel:'用官'}, L('丁','未'), L('戊','辰'), 'rooted', false, '成', 'หนุนซ้ำ'],
  ['建祿月劫格→map建祿格·用官運傷→破',{geZh:'建祿月劫格',subLabel:'用官'}, L('丁','卯'), null, 'rooted', false, '破(เบา)'],  // 卯=乙劫財 (ไม่ใช้未ที่มี己正財∈xi ก่อ noise)
  ['subLabel null→ไม่ตัดสิน(null)', {geZh:'正官格',subLabel:null}, L('庚','辰'), null, 'rooted', false, 'NULL'],
  ['subLabel มั่ว→UNMAPPED', {geZh:'正官格',subLabel:'มั่ว'}, L('庚','辰'), null, 'rooted', false, 'UNMAPPED'],
  ['3p→ปิด(null)', {geZh:'傷官格',subLabel:'佩印'}, L('庚','辰'), null, 'rooted', true, 'NULL'],
];
console.log('\n=== ชั้น B: integration buildChengBaiNow ===');
for (const [d, xs, luck, ann, root, is3p, exp, annHas] of INT) {
  const r = buildChengBaiNow(xs, '甲', luck, ann, root, is3p);
  const got = r === null ? 'NULL' : r.verdict;
  let ok = got === exp;
  if (ok && annHas) ok = (r?.annual||'').includes(annHas);
  console.log(`${ok?'✓':'✗'} ${d} → ${got}${r?.annual?` [${r.annual}]`:''} (expect ${exp}${annHas?`+${annHas}`:''})`);
  if (ok && r && r.ruleId && r.verdict!=='UNMAPPED') {} // rule-id present
  ok ? pass++ : fail++;
}
// ชั้น C: regression ดวงจริง (end-to-end behavior · กันหลุดรอบหน้า · พิสูจน์แล้วใน prompt dump 28 พ.ค.)
//   Aeaw 假從財格 → 從格 gate → xiangShen null → chengBaiNow null (ไม่มี 行運成敗 ใน prompt)
//   Mai 印綬格(財破印·比劫制財) → xiangShen 救應/財為忌 → chengBaiNow มี (行運成敗 + ZP-1a-10b ใน prompt)
console.log('\n=== ชั้น C: regression ดวงจริง (從格ไม่มี · 正格มี) ===');
{
  const aeawXs = buildXiangShen(P('甲子','丙子','己亥','庚午'), '己', '假從財格');
  const aeawCB = buildChengBaiNow(aeawXs, '己', { stem:'庚', branch:'午' }, null, 'no_root', false);
  const ok1 = aeawXs === null && aeawCB === null;
  console.log(`${ok1?'✓':'✗'} Aeaw 假從財格 → xiangShen=${aeawXs} · chengBaiNow=${aeawCB} (expect null·null = 從格ไม่มี timing)`);
  ok1 ? pass++ : fail++;

  const maiXs = buildXiangShen(P('丙寅','壬辰','丙戌','丙申'), '丙', '印綬格');
  const ok2 = maiXs !== null && maiXs.verdict === '救應' && maiXs.subLabel === '財為忌';
  console.log(`${ok2?'✓':'✗'} Mai 印綬格 → verdict=${maiXs?.verdict}/subLabel=${maiXs?.subLabel} (expect 救應/財為忌)`);
  ok2 ? pass++ : fail++;
  // chengBaiNow ของ Mai: feed currentLuck ที่มี 比劫+偏財 (reproduce prompt dump: วัยจร平·ปีจร比肩หนุน)
  const maiCB = buildChengBaiNow(maiXs, '丙', { stem:'丙', branch:'申' }, { stem:'丙', branch:'寅' }, 'rooted', false);
  const ok3 = maiCB !== null && maiCB.ruleId.startsWith('ZP-1a-10b') && maiCB.verdict === '平';  // lock verdict กัน drift เงียบ 成/破 (พ่อแนะนำ)
  console.log(`${ok3?'✓':'✗'} Mai chengBaiNow → ${maiCB?.verdict} [${maiCB?.ruleId?.slice(0,12)}] (expect 平 + ZP-1a-10b · ตรง dump)`);
  ok3 ? pass++ : fail++;
}
console.log(`\n=== ${pass}/${pass+fail} ${fail?'❌ FAIL':'✅ PASS'} ===`);
process.exit(fail?1:0);
