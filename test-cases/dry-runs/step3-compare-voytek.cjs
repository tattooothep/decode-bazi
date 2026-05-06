/**
 * Step 3 · เทียบ Decode old vs Decode new (skip-DM) vs Voytek จริง
 * Voytek number copy จาก เจ้านาย session 6 พ.ค. 14:30
 */
const STEM_ELEMENT = {甲:'Wood',乙:'Wood',丙:'Fire',丁:'Fire',戊:'Earth',己:'Earth',庚:'Metal',辛:'Metal',壬:'Water',癸:'Water'};
const BRANCH_ELEMENT = {子:'Water',亥:'Water',寅:'Wood',卯:'Wood',巳:'Fire',午:'Fire',申:'Metal',酉:'Metal',辰:'Earth',戌:'Earth',丑:'Earth',未:'Earth'};
const STEM_POL = {甲:'Yang',乙:'Yin',丙:'Yang',丁:'Yin',戊:'Yang',己:'Yin',庚:'Yang',辛:'Yin',壬:'Yang',癸:'Yin'};
const HIDDEN = {子:['癸'],丑:['己','癸','辛'],寅:['甲','丙','戊'],卯:['乙'],辰:['戊','乙','癸'],巳:['丙','戊','庚'],午:['丁','己'],未:['己','丁','乙'],申:['庚','壬','戊'],酉:['辛'],戌:['戊','辛','丁'],亥:['壬','甲']};
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

function elementDist(p, skipDM) {
  const dist = {Wood:0,Fire:0,Earth:0,Metal:0,Water:0};
  for (const pos of ['year','month','day','hour']) {
    if (!skipDM || pos !== 'day') dist[STEM_ELEMENT[p[pos].stem]] += 12;
    dist[BRANCH_ELEMENT[p[pos].branch]] += 12;
    for (const h of HIDDEN[p[pos].branch] || []) dist[STEM_ELEMENT[h]] += 4;
  }
  const t = Object.values(dist).reduce((a,b)=>a+b,0);
  return Object.fromEntries(Object.entries(dist).map(([k,v])=>[k, Math.round(v/t*100)]));
}

function godDist(p, skipDM) {
  const dm = p.day.stem;
  const c = {'比肩':0,'劫財':0,'食神':0,'傷官':0,'偏財':0,'正財':0,'七殺':0,'正官':0,'偏印':0,'正印':0};
  for (const pos of ['year','month','day','hour']) {
    if (!skipDM || pos !== 'day') {
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
  {
    name:'Aeaw', dm:'己',
    p:{ year:{stem:'甲',branch:'子'}, month:{stem:'丙',branch:'子'}, day:{stem:'己',branch:'亥'}, hour:{stem:'庚',branch:'午'} },
    voytekEl: { Wood:12, Fire:24, Earth:4, Metal:9, Water:51 },
    voytekGod: { '比肩':4,'劫財':0,'食神':0,'傷官':9,'偏財':37,'正財':13,'七殺':0,'正官':12,'偏印':10,'正印':14 },
  },
  {
    name:'ใหม่', dm:'辛',
    p:{ year:{stem:'丙',branch:'寅'}, month:{stem:'壬',branch:'辰'}, day:{stem:'辛',branch:'巳'}, hour:{stem:'庚',branch:'子'} },
    voytekEl: { Wood:11, Fire:16, Earth:27, Metal:16, Water:30 },
    voytekGod: { '比肩':0,'劫財':16,'食神':16,'傷官':14,'偏財':3,'正財':8,'七殺':0,'正官':16,'偏印':0,'正印':27 },
  },
  {
    name:'น้องปุญญ์', dm:'壬',
    p:{ year:{stem:'甲',branch:'辰'}, month:{stem:'庚',branch:'午'}, day:{stem:'壬',branch:'寅'}, hour:{stem:'乙',branch:'巳'} },
    voytekEl: { Wood:27, Fire:29, Earth:25, Metal:17, Water:3 },
    voytekGod: { '比肩':0,'劫財':3,'食神':15,'傷官':11,'偏財':15,'正財':13,'七殺':19,'正官':6,'偏印':17,'正印':0 },
  },
  {
    name:'โชกุน', dm:'壬',
    p:{ year:{stem:'甲',branch:'辰'}, month:{stem:'壬',branch:'申'}, day:{stem:'壬',branch:'申'}, hour:{stem:'乙',branch:'巳'} },
    voytekEl: { Wood:19, Fire:5, Earth:10, Metal:36, Water:30 },
    voytekGod: { '比肩':27,'劫財':4,'食神':9,'傷官':10,'偏財':5,'正財':0,'七殺':10,'正官':0,'偏印':36,'正印':0 },
  },
  {
    name:'ติก', dm:'乙',
    p:{ year:{stem:'乙',branch:'丑'}, month:{stem:'己',branch:'丑'}, day:{stem:'乙',branch:'卯'}, hour:{stem:'己',branch:'卯'} },
    voytekEl: { Wood:36, Fire:0, Earth:52, Metal:5, Water:7 },
    voytekGod: { '比肩':36,'劫財':0,'食神':0,'傷官':0,'偏財':52,'正財':0,'七殺':5,'正官':0,'偏印':0,'正印':7 },
  },
  {
    name:'ป๊า', dm:'甲',
    p:{ year:{stem:'甲',branch:'辰'}, month:{stem:'甲',branch:'戌'}, day:{stem:'甲',branch:'寅'}, hour:{stem:'乙',branch:'巳'} },
    voytekEl: { Wood:39, Fire:15, Earth:33, Metal:9, Water:3 },
    voytekGod: { '比肩':27,'劫財':12,'食神':3,'傷官':0,'偏財':33,'正財':0,'七殺':5,'正官':0,'偏印':3,'正印':0 },
  },
];

const codes = ['比肩','劫財','食神','傷官','偏財','正財','七殺','正官','偏印','正印'];
const els = ['Wood','Fire','Earth','Metal','Water'];

function diffSum(a, b, keys) {
  return keys.reduce((s,k)=>s+Math.abs((a[k]||0)-(b[k]||0)),0);
}

console.log('═══ Step 3 · เทียบ 3 ทาง · 6 เคส ═══\n');

let elBetter=0, elWorse=0, elTie=0;
let gdBetter=0, gdWorse=0, gdTie=0;

for (const c of cases) {
  const eO = elementDist(c.p, false);
  const eN = elementDist(c.p, true);
  const gO = godDist(c.p, false);
  const gN = godDist(c.p, true);

  const eDiffOld = diffSum(eO, c.voytekEl, els);
  const eDiffNew = diffSum(eN, c.voytekEl, els);
  const gDiffOld = diffSum(gO, c.voytekGod, codes);
  const gDiffNew = diffSum(gN, c.voytekGod, codes);

  console.log(`▶ ${c.name} · DM=${c.dm} (${STEM_ELEMENT[c.dm]})`);
  console.log('  ─── ELEMENT % ───');
  console.log('  el       │ ' + els.map(k=>k.padEnd(5)).join(' '));
  console.log('  Decode O │ ' + els.map(k=>String(eO[k]).padStart(3)+'%').map(s=>s.padEnd(5)).join(' '));
  console.log('  Decode N │ ' + els.map(k=>String(eN[k]).padStart(3)+'%').map(s=>s.padEnd(5)).join(' '));
  console.log('  Voytek   │ ' + els.map(k=>String(c.voytekEl[k]).padStart(3)+'%').map(s=>s.padEnd(5)).join(' '));
  console.log(`  |O-V|=${eDiffOld}  |N-V|=${eDiffNew}  → ${eDiffNew<eDiffOld?'✅ NEW ใกล้กว่า':eDiffNew>eDiffOld?'❌ NEW แย่กว่า':'= เท่ากัน'}`);
  if (eDiffNew<eDiffOld) elBetter++; else if (eDiffNew>eDiffOld) elWorse++; else elTie++;

  console.log('  ─── 10 GODS % ───');
  console.log('  god      │ ' + codes.map(k=>k).join(' '));
  console.log('  Decode O │ ' + codes.map(k=>String(gO[k]).padStart(2)+'%').join(' '));
  console.log('  Decode N │ ' + codes.map(k=>String(gN[k]).padStart(2)+'%').join(' '));
  console.log('  Voytek   │ ' + codes.map(k=>String(c.voytekGod[k]).padStart(2)+'%').join(' '));
  console.log(`  |O-V|=${gDiffOld}  |N-V|=${gDiffNew}  → ${gDiffNew<gDiffOld?'✅ NEW ใกล้กว่า':gDiffNew>gDiffOld?'❌ NEW แย่กว่า':'= เท่ากัน'}`);
  if (gDiffNew<gDiffOld) gdBetter++; else if (gDiffNew>gDiffOld) gdWorse++; else gdTie++;
  console.log('');
}

console.log('═══ SUMMARY ═══');
console.log(`  Element % : NEW ดีขึ้น ${elBetter}/6 · เท่า ${elTie} · แย่ลง ${elWorse}`);
console.log(`  10 Gods % : NEW ดีขึ้น ${gdBetter}/6 · เท่า ${gdTie} · แย่ลง ${gdWorse}`);
