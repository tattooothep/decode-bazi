/**
 * Step 3 DRY-RUN · เทียบสูตร Element % + 10 Gods % เก่า vs ใหม่ (skip DM)
 * ห้ามแก้ไฟล์จริง · แค่คำนวณเปรียบเทียบ
 */
const STEM_ELEMENT = {
  甲:'Wood',乙:'Wood',丙:'Fire',丁:'Fire',戊:'Earth',己:'Earth',
  庚:'Metal',辛:'Metal',壬:'Water',癸:'Water',
};
const BRANCH_ELEMENT = {
  子:'Water',亥:'Water',寅:'Wood',卯:'Wood',巳:'Fire',午:'Fire',
  申:'Metal',酉:'Metal',辰:'Earth',戌:'Earth',丑:'Earth',未:'Earth',
};
const STEM_POL = {甲:'Yang',乙:'Yin',丙:'Yang',丁:'Yin',戊:'Yang',己:'Yin',庚:'Yang',辛:'Yin',壬:'Yang',癸:'Yin'};
const HIDDEN = {
  子:['癸'], 丑:['己','癸','辛'], 寅:['甲','丙','戊'], 卯:['乙'],
  辰:['戊','乙','癸'], 巳:['丙','戊','庚'], 午:['丁','己'],
  未:['己','丁','乙'], 申:['庚','壬','戊'], 酉:['辛'],
  戌:['戊','辛','丁'], 亥:['壬','甲'],
};
const PRODUCES = {wood:'fire',fire:'earth',earth:'metal',metal:'water',water:'wood'};
const CONTROLS = {wood:'earth',earth:'water',water:'fire',fire:'metal',metal:'wood'};

function tenGod(dm, stem) {
  const dmEl = STEM_ELEMENT[dm].toLowerCase();
  const tEl = STEM_ELEMENT[stem]?.toLowerCase();
  if (!tEl) return null;
  const samePol = STEM_POL[dm] === STEM_POL[stem];
  if (dmEl === tEl) return samePol ? '比肩' : '劫財';
  if (PRODUCES[dmEl] === tEl) return samePol ? '食神' : '傷官';
  if (CONTROLS[dmEl] === tEl) return samePol ? '偏財' : '正財';
  if (CONTROLS[tEl] === dmEl) return samePol ? '七殺' : '正官';
  if (PRODUCES[tEl] === dmEl) return samePol ? '偏印' : '正印';
  return null;
}

function elementsOLD(p) {
  const dist = { Wood:0,Fire:0,Earth:0,Metal:0,Water:0 };
  for (const pos of ['year','month','day','hour']) {
    dist[STEM_ELEMENT[p[pos].stem]] += 12;
    dist[BRANCH_ELEMENT[p[pos].branch]] += 12;
    for (const h of HIDDEN[p[pos].branch] || []) dist[STEM_ELEMENT[h]] += 4;
  }
  const t = Object.values(dist).reduce((a,b)=>a+b,0);
  return Object.fromEntries(Object.entries(dist).map(([k,v])=>[k, Math.round(v/t*100)]));
}

function elementsNEW(p) {
  // skip day stem (DM) จาก count
  const dist = { Wood:0,Fire:0,Earth:0,Metal:0,Water:0 };
  for (const pos of ['year','month','day','hour']) {
    if (pos !== 'day') dist[STEM_ELEMENT[p[pos].stem]] += 12;  // skip day stem
    dist[BRANCH_ELEMENT[p[pos].branch]] += 12;  // branch ทุกตัว
    for (const h of HIDDEN[p[pos].branch] || []) dist[STEM_ELEMENT[h]] += 4;
  }
  const t = Object.values(dist).reduce((a,b)=>a+b,0);
  return Object.fromEntries(Object.entries(dist).map(([k,v])=>[k, Math.round(v/t*100)]));
}

function godsOLD(p) {
  const dm = p.day.stem;
  const c = {'比肩':0,'劫財':0,'食神':0,'傷官':0,'偏財':0,'正財':0,'七殺':0,'正官':0,'偏印':0,'正印':0};
  for (const pos of ['year','month','day','hour']) {
    const g = tenGod(dm, p[pos].stem);
    if (g) c[g] += 12;
    const hh = HIDDEN[p[pos].branch] || [];
    for (let i=0; i<hh.length; i++) {
      const w = i===0 ? 5 : i===1 ? 3 : 2;
      const gh = tenGod(dm, hh[i]);
      if (gh) c[gh] += w;
    }
  }
  const t = Object.values(c).reduce((a,b)=>a+b,0);
  return Object.fromEntries(Object.entries(c).map(([k,v])=>[k, Math.round(v/t*100)]));
}

function godsNEW(p) {
  // skip day stem (DM = 比肩 ตัวเอง · Voytek convention ไม่นับ)
  const dm = p.day.stem;
  const c = {'比肩':0,'劫財':0,'食神':0,'傷官':0,'偏財':0,'正財':0,'七殺':0,'正官':0,'偏印':0,'正印':0};
  for (const pos of ['year','month','day','hour']) {
    if (pos !== 'day') {
      const g = tenGod(dm, p[pos].stem);
      if (g) c[g] += 12;
    }
    const hh = HIDDEN[p[pos].branch] || [];
    for (let i=0; i<hh.length; i++) {
      const w = i===0 ? 5 : i===1 ? 3 : 2;
      const gh = tenGod(dm, hh[i]);
      if (gh) c[gh] += w;
    }
  }
  const t = Object.values(c).reduce((a,b)=>a+b,0) || 1;
  return Object.fromEntries(Object.entries(c).map(([k,v])=>[k, Math.round(v/t*100)]));
}

const cases = [
  { name:'Aeaw',   p:{ year:{stem:'甲',branch:'子'}, month:{stem:'丙',branch:'子'}, day:{stem:'己',branch:'亥'}, hour:{stem:'庚',branch:'午'} } },
  { name:'Mai',    p:{ year:{stem:'丙',branch:'寅'}, month:{stem:'壬',branch:'辰'}, day:{stem:'丙',branch:'戌'}, hour:{stem:'丙',branch:'申'} } },
  { name:'น้องปุญญ์', p:null, dm:null, note:'ยังหาข้อมูล pillars ในระบบไม่เจอ' },
  { name:'เค็ง',   p:{ year:{stem:'丁',branch:'卯'}, month:{stem:'丁',branch:'未'}, day:{stem:'戊',branch:'寅'}, hour:{stem:'癸',branch:'亥'} } },
];

console.log('═══ Step 3 DRY-RUN · Element % เก่า vs ใหม่ (skip DM) ═══\n');
for (const c of cases) {
  if (!c.p) { console.log(`  ${c.name}: ${c.note}\n`); continue; }
  const dm = c.p.day.stem;
  const dmEl = STEM_ELEMENT[dm];
  const eo = elementsOLD(c.p);
  const en = elementsNEW(c.p);
  console.log(`▶ ${c.name} · DM=${dm} (${dmEl})`);
  console.log('   element │  Wood  Fire  Earth Metal Water');
  console.log('   เก่า    │ ', ['Wood','Fire','Earth','Metal','Water'].map(k=>String(eo[k]).padStart(4)+'%').join(' '));
  console.log('   ใหม่    │ ', ['Wood','Fire','Earth','Metal','Water'].map(k=>String(en[k]).padStart(4)+'%').join(' '));
  console.log('   diff    │ ', ['Wood','Fire','Earth','Metal','Water'].map(k=>{
    const d = en[k]-eo[k]; return ((d>=0?'+':'')+d).padStart(4)+'%';
  }).join(' '));
  console.log('');
}

console.log('═══ 10 Gods % เก่า vs ใหม่ (skip DM stem) ═══\n');
for (const c of cases) {
  if (!c.p) { console.log(`  ${c.name}: ${c.note}\n`); continue; }
  const dm = c.p.day.stem;
  const go = godsOLD(c.p);
  const gn = godsNEW(c.p);
  console.log(`▶ ${c.name} · DM=${dm}`);
  const codes = ['比肩','劫財','食神','傷官','偏財','正財','七殺','正官','偏印','正印'];
  console.log('   god   │ ', codes.map(k=>k.padEnd(2)).join(' '));
  console.log('   เก่า  │ ', codes.map(k=>String(go[k]).padStart(2)+'%').join(' '));
  console.log('   ใหม่  │ ', codes.map(k=>String(gn[k]).padStart(2)+'%').join(' '));
  console.log('   diff  │ ', codes.map(k=>{
    const d = gn[k]-go[k]; return ((d>=0?'+':'')+d).padStart(3)+'%';
  }).join(' '));
  console.log('');
}

console.log('═══ Voytek reference ═══');
console.log('  Voytek POST → 23KB form page (anti-bot · ไม่ส่ง chart จริง)');
console.log('  → ดึง element % / 10G % ของ Voytek ไม่ได้');
console.log('  → ใช้ classical convention เป็น reference: Voytek skip DM stem ใน 10G');
console.log('');
console.log('═══ จบ DRY-RUN · ไม่ได้แก้ไฟล์ใดๆ ═══');
