/**
 * Seed Reference Tables · 12 ref_* tables in decode-postgres
 * Source: 47 Hourkey JSON files + solar_terms_full.py
 * Run: node scripts/seed-reference-tables.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB = {
  host: '127.0.0.1',
  port: 5433,
  database: 'decode_db',
  user: 'decode_user',
  password: process.env.PGPASSWORD,
};

const DATA = '/root/decode-app/data';
const STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const STEM_ELEMENT = {甲:'Wood',乙:'Wood',丙:'Fire',丁:'Fire',戊:'Earth',己:'Earth',庚:'Metal',辛:'Metal',壬:'Water',癸:'Water'};
const STEM_POL = {甲:'Yang',乙:'Yin',丙:'Yang',丁:'Yin',戊:'Yang',己:'Yin',庚:'Yang',辛:'Yin',壬:'Yang',癸:'Yin'};
const BRANCH_ELEMENT = {子:'Water',丑:'Earth',寅:'Wood',卯:'Wood',辰:'Earth',巳:'Fire',午:'Fire',未:'Earth',申:'Metal',酉:'Metal',戌:'Earth',亥:'Water'};
const BRANCH_POL = {子:'Yang',丑:'Yin',寅:'Yang',卯:'Yin',辰:'Yang',巳:'Yin',午:'Yang',未:'Yin',申:'Yang',酉:'Yin',戌:'Yang',亥:'Yin'};
const ANIMALS = {子:['Rat','鼠','หนู'],丑:['Ox','牛','วัว'],寅:['Tiger','虎','เสือ'],卯:['Rabbit','兔','กระต่าย'],辰:['Dragon','龙','มังกร'],巳:['Snake','蛇','งู'],午:['Horse','马','ม้า'],未:['Goat','羊','แพะ'],申:['Monkey','猴','ลิง'],酉:['Rooster','鸡','ไก่'],戌:['Dog','狗','สุนัข'],亥:['Pig','猪','หมู']};
const STEM_TH = {甲:'เจี๋ย',乙:'อี่',丙:'ปิ่ง',丁:'ติง',戊:'อู้',己:'จี่',庚:'เกิง',辛:'ซิน',壬:'เหริน',癸:'กุย'};
const BRANCH_TH = {子:'จื่อ',丑:'โฉ่ว',寅:'อิ๋น',卯:'เหม่า',辰:'เฉิน',巳:'ซื่อ',午:'อู่',未:'เว่ย',申:'เซิน',酉:'โหย่ว',戌:'ซวี',亥:'ไห้'};

async function main() {
  const c = new Client(DB);
  await c.connect();
  console.log('✓ connected');

  // Clean re-seed
  for (const t of ['ref_star_pillar_readings','ref_personal_stars','ref_six_destructions','ref_branch_hidden_stems','ref_jia_zi_60','ref_kong_wang_xun','ref_solar_terms','ref_archetypes_25','ref_structures_18','ref_strengths','ref_earthly_branches','ref_heavenly_stems']) {
    await c.query(`DELETE FROM ${t}`);
  }
  console.log('✓ cleaned 12 tables');

  // 1) ref_heavenly_stems · 10 row
  const lt = JSON.parse(fs.readFileSync(`${DATA}/hourkey/hourkey-bazi-lookup-tables.json`));
  let n = 0;
  for (let i = 0; i < 10; i++) {
    const s = STEMS[i];
    await c.query(
      `INSERT INTO ref_heavenly_stems (id, chinese, pinyin, thai, element, polarity, phase_anchor_index, phase_direction, combine_partner, combine_produces) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [i+1, s, ['Jia','Yi','Bing','Ding','Wu','Ji','Geng','Xin','Ren','Gui'][i], STEM_TH[s], STEM_ELEMENT[s], STEM_POL[s], i, i%2===0?1:-1, STEMS[(i+5)%10], ['Earth','Metal','Water','Wood','Fire','Earth','Metal','Water','Wood','Fire'][i]]
    );
    n++;
  }
  console.log(`✓ ref_heavenly_stems: ${n}`);

  // 2) ref_earthly_branches · 12 row
  n = 0;
  const seasons = ['Winter','Winter','Spring','Spring','Spring','Summer','Summer','Summer','Autumn','Autumn','Autumn','Winter'];
  const monthNum = [11,12,1,2,3,4,5,6,7,8,9,10];
  const hourRanges = ['23-01','01-03','03-05','05-07','07-09','09-11','11-13','13-15','15-17','17-19','19-21','21-23'];
  const dirs = [0,30,60,90,120,150,180,210,240,270,300,330];
  for (let i = 0; i < 12; i++) {
    const b = BRANCHES[i];
    const a = ANIMALS[b];
    await c.query(
      `INSERT INTO ref_earthly_branches (id, chinese, pinyin, thai, animal_en, animal_zh, animal_th, element, polarity, sub_element, season, month_number, hour_range, direction_degrees, organ_tcm) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [i+1, b, ['Zi','Chou','Yin','Mao','Chen','Si','Wu','Wei','Shen','You','Xu','Hai'][i], BRANCH_TH[b], a[0], a[1], a[2], BRANCH_ELEMENT[b], BRANCH_POL[b], BRANCH_ELEMENT[b], seasons[i], monthNum[i], hourRanges[i], dirs[i], null]
    );
    n++;
  }
  console.log(`✓ ref_earthly_branches: ${n}`);

  // 3) ref_branch_hidden_stems
  const hs = lt.hidden_stems;
  n = 0;
  const qiTypes = ['residual_qi','middle_qi','main_qi'];  // matches DB check
  const weights = [20, 30, 50];
  for (const [branch, stems] of Object.entries(hs)) {
    for (let i = 0; i < stems.length; i++) {
      if (!stems[i]) continue;
      await c.query(
        `INSERT INTO ref_branch_hidden_stems (branch_chinese, stem_chinese, qi_type, weight, days_active) VALUES ($1,$2,$3,$4,$5)`,
        [branch, stems[i], qiTypes[i], weights[i], null]
      );
      n++;
    }
  }
  console.log(`✓ ref_branch_hidden_stems: ${n}`);

  // 4) ref_kong_wang_xun · 6 row
  const xunVoids = [['甲子','戌','亥'],['甲戌','申','酉'],['甲申','午','未'],['甲午','辰','巳'],['甲辰','寅','卯'],['甲寅','子','丑']];
  for (let i = 0; i < 6; i++) {
    await c.query(`INSERT INTO ref_kong_wang_xun (id, starts_with, void_branch_1, void_branch_2) VALUES ($1,$2,$3,$4)`, [i+1, ...xunVoids[i]]);
  }
  console.log(`✓ ref_kong_wang_xun: 6`);

  // 5) ref_jia_zi_60 · 60 row from na-yin
  const ny = JSON.parse(fs.readFileSync(`${DATA}/hourkey-v3/hourkey-na-yin-60.json`));
  const naYinElToEnum = {Metal:'Metal',Fire:'Fire',Wood:'Wood',Earth:'Earth',Water:'Water'};
  // Compute kong_wang_xun for each pillar
  function getXunIdx(pillar) {
    const stem = pillar[0], branch = pillar[1];
    const si = STEMS.indexOf(stem), bi = BRANCHES.indexOf(branch);
    const offset = ((bi - si) % 12 + 12) % 12;
    return Math.floor(offset / 2) + 1;  // 1..6
  }
  n = 0;
  for (let i = 0; i < 60; i++) {
    const stem = STEMS[i % 10];
    const branch = BRANCHES[i % 12];
    const pillar = stem + branch;
    const nyData = ny[pillar] || {};
    const naYinThai = nyData.na_yin?.includes('金') ? 'ทองคำ' :
                      nyData.na_yin?.includes('火') ? 'ไฟ' :
                      nyData.na_yin?.includes('木') ? 'ไม้' :
                      nyData.na_yin?.includes('水') ? 'น้ำ' :
                      nyData.na_yin?.includes('土') ? 'ดิน' : null;
    await c.query(
      `INSERT INTO ref_jia_zi_60 (id, stem, branch, na_yin_chinese, na_yin_english, na_yin_thai, na_yin_element, kong_wang_xun) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [i+1, stem, branch, nyData.na_yin || null, nyData.en || null, naYinThai, naYinElToEnum[nyData.element] || null, getXunIdx(pillar)]
    );
    n++;
  }
  console.log(`✓ ref_jia_zi_60: ${n}`);

  // 6) ref_archetypes_25
  const arch = JSON.parse(fs.readFileSync(`${DATA}/hourkey/hourkey-archetypes-25.json`));
  const archMap = {Influence:'Leader'};  // DB allows Leader, JSON uses Influence
  n = 0;
  for (const a of arch) {
    await c.query(
      `INSERT INTO ref_archetypes_25 (id, archetype_base, element, title_en, title_th, style_label_en, style_label_th, deep_dive_en, deep_dive_th, awakening_question_en, awakening_question_th) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [++n, archMap[a.archetype]||a.archetype, a.element, a.title, a.titleTh, a.connectionStyle, a.connectionStyleTh, a.deepDive, a.deepDiveTh, a.awakeningQuestion, a.awakeningQuestionTh]
    );
  }
  console.log(`✓ ref_archetypes_25: ${n}`);

  // 7) ref_structures_18
  const st = JSON.parse(fs.readFileSync(`${DATA}/hourkey/hourkey-structures-16.json`));
  n = 0;
  for (const s of st) {
    const cat = s.key?.includes('Transformation') ? 'transformation' :
                s.key?.includes('Follow') ? 'follower' : 'normal';
    await c.query(
      `INSERT INTO ref_structures_18 (id, code, title_en, title_th, category, meaning_en, meaning_th, core_strategy_en, core_strategy_th) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [++n, s.key, s.title, s.titleTh, cat, s.description, s.descriptionTh, s.strategy, s.strategyTh]
    );
  }
  console.log(`✓ ref_structures_18: ${n}`);

  // 8) ref_strengths
  const str = JSON.parse(fs.readFileSync(`${DATA}/hourkey/hourkey-strengths.json`));
  n = 0;
  const codeMap = {extremely_weak:'extremely_weak',very_weak:'very_weak',weak:'weak',slightly_weak:'slightly_weak',balanced:'balanced',slightly_strong:'slightly_strong',strong:'strong',very_strong:'very_strong',extremely_strong:'extremely_strong',transformed:'transformed'};
  for (const s of str) {
    // Normalize: "Strong Day Master" → "strong"
    let code = (s.key || '').toLowerCase().replace(/ day master/g,'').replace(/-/g,'_').replace(/ /g,'_').trim();
    if (!codeMap[code]) { console.log('  skip:', s.key, '→', code); continue; }
    await c.query(
      `INSERT INTO ref_strengths (id, code, label_en, label_th, metaphor_en, metaphor_th, meaning_en, meaning_th, core_strategy_en, core_strategy_th, dos_en, dos_th, donts_en, donts_th) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [++n, code, s.title, s.titleTh, s.subtitle, s.subtitleTh, s.meaning, s.meaningTh, s.coreStrategy, s.coreStrategyTh, JSON.stringify(s.dos||[]), JSON.stringify(s.dosTh||[]), JSON.stringify(s.donts||[]), JSON.stringify(s.dontsTh||[])]
    );
  }
  console.log(`✓ ref_strengths: ${n}`);

  // 9) ref_personal_stars · 14 stars
  const ps = JSON.parse(fs.readFileSync(`${DATA}/hourkey-v5/hourkey-personal-stars-bilingual.json`));
  const sr = JSON.parse(fs.readFileSync(`${DATA}/hourkey-v5/hourkey-star-readings-bilingual.json`));
  const STAR_ZH = {'Nobleman Star':'天乙貴人','Peach Blossom':'桃花','Sky Horse':'驛馬','Intelligence':'文昌','Kong Wang':'空亡','Elegant Seal':'華蓋','The General Star':'將星','Blood Knife':'血刃','Solitary':'孤辰','Lonesome':'寡宿','Funeral Door':'喪門','Robbery Sha':'劫煞','Separating Edge':'天醫','Death God':'亡神','Salty Pool':'鹹池','Thriving':'祿神','Goat Blade':'羊刃','Red Chamber':'紅艷','Study Hall':'學堂','Cascading Clouds':'紫雲','Flying Blade':'飛刃','Gold Carriage':'金舆','Heavenly Wealth':'天厨'};
  n = 0;
  const starIds = {};
  for (const [starName, _] of Object.entries(ps)) {
    starIds[starName] = ++n;
    const r = sr[starName] || {};
    await c.query(
      `INSERT INTO ref_personal_stars (id, name_en, name_chinese, star_type, favorable_reading_en, favorable_reading_th, unfavorable_reading_en, unfavorable_reading_th, mixed_reading_en, mixed_reading_th) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [n, starName, STAR_ZH[starName] || null, 'auspicious', r.favorable?.en, r.favorable?.th, r.unfavorable?.en, r.unfavorable?.th, r.mixed?.en, r.mixed?.th]
    );
  }
  console.log(`✓ ref_personal_stars: ${n}`);

  // 10) ref_star_pillar_readings · 14 × 4 = 56
  n = 0;
  for (const [starName, pillars] of Object.entries(ps)) {
    const sid = starIds[starName];
    for (const [pos, rd] of Object.entries(pillars)) {
      await c.query(
        `INSERT INTO ref_star_pillar_readings (star_id, pillar_position, label_en, label_th, description_en, description_th) VALUES ($1,$2,$3,$4,$5,$6)`,
        [sid, pos, rd.label_en, rd.label_th, rd.description_en, rd.description_th]
      );
      n++;
    }
  }
  console.log(`✓ ref_star_pillar_readings: ${n}`);

  // 11) ref_six_destructions · 6 row
  const sd = JSON.parse(fs.readFileSync(`${DATA}/hourkey-v4/decode-six-destructions.json`));
  n = 0;
  for (const d of sd.destruction_pairs || []) {
    const pair = d.branches || d.pair || [];
    if (pair.length !== 2) continue;
    await c.query(
      `INSERT INTO ref_six_destructions (id, branch_a, branch_b, type_label, domain_primary, intensity, interpretation_en, interpretation_th, remediation, strength_modifier) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [++n, pair[0], pair[1], d.type, d.domain_primary, d.intensity, d.interpretation_en, d.interpretation_th, d.remediation, d.strength_modifier]
    );
  }
  console.log(`✓ ref_six_destructions: ${n}`);

  await c.end();
  console.log('\n✅ seed (non-solar) complete');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
