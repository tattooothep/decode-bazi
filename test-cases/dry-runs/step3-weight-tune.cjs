/**
 * Step 3 · ลอง 5 สูตร × 6 เคส · เทียบ Voytek
 * formula 1: old (current · keep DM · weight 5/3/2)
 * formula 2: skip-DM + 5/3/2
 * formula 3: skip-DM + 7/4/2
 * formula 4: skip-DM + 8/3/1
 * formula 5: skip-DM + 7/3/1
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

// generic compute · skipDM + weight tuple [main, middle, residual] for hidden
// stemBaseWeight: 12 (current weight of stem) · branchWeight: 12
function elementDist(p, skipDM, weight, stemW=12, branchW=12) {
  const dist = {Wood:0,Fire:0,Earth:0,Metal:0,Water:0};
  for (const pos of ['year','month','day','hour']) {
    if (!skipDM || pos !== 'day') dist[STEM_ELEMENT[p[pos].stem]] += stemW;
    dist[BRANCH_ELEMENT[p[pos].branch]] += branchW;
    const hh = HIDDEN[p[pos].branch] || [];
    for (let i=0; i<hh.length; i++) {
      const w = weight[i] || 0;
      dist[STEM_ELEMENT[hh[i]]] += w;
    }
  }
  const t = Object.values(dist).reduce((a,b)=>a+b,0);
  return Object.fromEntries(Object.entries(dist).map(([k,v])=>[k, Math.round(v/t*100)]));
}

function godDist(p, skipDM, weight, stemW=12) {
  const dm = p.day.stem;
  const c = {'比肩':0,'劫財':0,'食神':0,'傷官':0,'偏財':0,'正財':0,'七殺':0,'正官':0,'偏印':0,'正印':0};
  for (const pos of ['year','month','day','hour']) {
    if (!skipDM || pos !== 'day') {
      const g = tenGod(dm, p[pos].stem);
      if (g) c[g] += stemW;
    }
    const hh = HIDDEN[p[pos].branch] || [];
    for (let i=0; i<hh.length; i++) {
      const w = weight[i] || 0;
      const gh = tenGod(dm, hh[i]);
      if (gh) c[gh] += w;
    }
  }
  const t = Object.values(c).reduce((a,b)=>a+b,0) || 1;
  return Object.fromEntries(Object.entries(c).map(([k,v])=>[k, Math.round(v/t*100)]));
}

const cases = [
  { name:'Aeaw', dm:'己',
    p:{ year:{stem:'甲',branch:'子'}, month:{stem:'丙',branch:'子'}, day:{stem:'己',branch:'亥'}, hour:{stem:'庚',branch:'午'} },
    voytekEl: { Wood:12, Fire:24, Earth:4, Metal:9, Water:51 },
    voytekGod:{ '比肩':4,'劫財':0,'食神':0,'傷官':9,'偏財':37,'正財':13,'七殺':0,'正官':12,'偏印':10,'正印':14 },
  },
  { name:'ใหม่', dm:'辛',
    p:{ year:{stem:'丙',branch:'寅'}, month:{stem:'壬',branch:'辰'}, day:{stem:'辛',branch:'巳'}, hour:{stem:'庚',branch:'子'} },
    voytekEl: { Wood:11, Fire:16, Earth:27, Metal:16, Water:30 },
    voytekGod:{ '比肩':0,'劫財':16,'食神':16,'傷官':14,'偏財':3,'正財':8,'七殺':0,'正官':16,'偏印':0,'正印':27 },
  },
  { name:'น้องปุญญ์', dm:'壬',
    p:{ year:{stem:'甲',branch:'辰'}, month:{stem:'庚',branch:'午'}, day:{stem:'壬',branch:'寅'}, hour:{stem:'乙',branch:'巳'} },
    voytekEl: { Wood:27, Fire:29, Earth:25, Metal:17, Water:3 },
    voytekGod:{ '比肩':0,'劫財':3,'食神':15,'傷官':11,'偏財':15,'正財':13,'七殺':19,'正官':6,'偏印':17,'正印':0 },
  },
  { name:'โชกุน', dm:'壬',
    p:{ year:{stem:'甲',branch:'辰'}, month:{stem:'壬',branch:'申'}, day:{stem:'壬',branch:'申'}, hour:{stem:'乙',branch:'巳'} },
    voytekEl: { Wood:19, Fire:5, Earth:10, Metal:36, Water:30 },
    voytekGod:{ '比肩':27,'劫財':4,'食神':9,'傷官':10,'偏財':5,'正財':0,'七殺':10,'正官':0,'偏印':36,'正印':0 },
  },
  { name:'ติก', dm:'乙',
    p:{ year:{stem:'乙',branch:'丑'}, month:{stem:'己',branch:'丑'}, day:{stem:'乙',branch:'卯'}, hour:{stem:'己',branch:'卯'} },
    voytekEl: { Wood:36, Fire:0, Earth:52, Metal:5, Water:7 },
    voytekGod:{ '比肩':36,'劫財':0,'食神':0,'傷官':0,'偏財':52,'正財':0,'七殺':5,'正官':0,'偏印':0,'正印':7 },
  },
  { name:'ป๊า', dm:'甲',
    p:{ year:{stem:'甲',branch:'辰'}, month:{stem:'甲',branch:'戌'}, day:{stem:'甲',branch:'寅'}, hour:{stem:'乙',branch:'巳'} },
    voytekEl: { Wood:39, Fire:15, Earth:33, Metal:9, Water:3 },
    voytekGod:{ '比肩':27,'劫財':12,'食神':3,'傷官':0,'偏財':33,'正財':0,'七殺':5,'正官':0,'偏印':3,'正印':0 },
  },
  { name:'AubMax6/1903', dm:'辛',
    p:{ year:{stem:'癸',branch:'卯'}, month:{stem:'丁',branch:'巳'}, day:{stem:'辛',branch:'酉'}, hour:{stem:'甲',branch:'午'} },
    voytekEl: { Wood:17, Fire:39, Earth:13, Metal:23, Water:8 },
    voytekGod:{ '比肩':19,'劫財':4,'食神':8,'傷官':0,'偏財':8,'正財':8,'七殺':29,'正官':10,'偏印':8,'正印':5 },
  },
  { name:'AubMax7/1903', dm:'辛',
    p:{ year:{stem:'癸',branch:'卯'}, month:{stem:'戊',branch:'午'}, day:{stem:'辛',branch:'卯'}, hour:{stem:'甲',branch:'午'} },
    voytekEl: { Wood:26, Fire:24, Earth:41, Metal:0, Water:9 },
    voytekGod:{ '比肩':0,'劫財':0,'食神':9,'傷官':0,'偏財':17,'正財':9,'七殺':24,'正官':0,'偏印':15,'正印':26 },
  },
  { name:'ดหก1950', dm:'戊',
    p:{ year:{stem:'庚',branch:'寅'}, month:{stem:'壬',branch:'午'}, day:{stem:'戊',branch:'戌'}, hour:{stem:'戊',branch:'午'} },
    voytekEl: { Wood:4, Fire:35, Earth:47, Metal:8, Water:7 },
    voytekGod:{ '比肩':35,'劫財':12,'食神':7,'傷官':1,'偏財':7,'正財':0,'七殺':4,'正官':0,'偏印':4,'正印':31 },
  },
  { name:'ดหก1967', dm:'癸',
    p:{ year:{stem:'丁',branch:'未'}, month:{stem:'庚',branch:'戌'}, day:{stem:'癸',branch:'酉'}, hour:{stem:'戊',branch:'午'} },
    voytekEl: { Wood:2, Fire:24, Earth:38, Metal:37, Water:0 },
    voytekGod:{ '比肩':0,'劫財':0,'食神':2,'傷官':0,'偏財':24,'正財':0,'七殺':14,'正官':24,'偏印':20,'正印':17 },
  },
  { name:'หกฟ1987', dm:'戊',
    p:{ year:{stem:'丁',branch:'卯'}, month:{stem:'庚',branch:'戌'}, day:{stem:'戊',branch:'午'}, hour:{stem:'戊',branch:'午'} },
    voytekEl: { Wood:7, Fire:38, Earth:43, Metal:12, Water:0 },
    voytekGod:{ '比肩':31,'劫財':12,'食神':10,'傷官':2,'偏財':0,'正財':0,'七殺':0,'正官':7,'偏印':0,'正印':38 },
  },
];

const codes = ['比肩','劫財','食神','傷官','偏財','正財','七殺','正官','偏印','正印'];
const els = ['Wood','Fire','Earth','Metal','Water'];

const formulas = [
  { id:'F1 old',          skipDM:false, w:[5,3,2], stemW:12 },
  { id:'F2 skip+5/3/2',   skipDM:true,  w:[5,3,2], stemW:12 },
  { id:'F3 skip+7/4/2',   skipDM:true,  w:[7,4,2], stemW:12 },
  { id:'F4 skip+8/3/1',   skipDM:true,  w:[8,3,1], stemW:12 },
  { id:'F5 skip+7/3/1',   skipDM:true,  w:[7,3,1], stemW:12 },
  // F6 mixed: Element = F1 old · 10G = F3 skip+7/4/2
  { id:'F6 mixed',        skipDM:'mixed', wEl:[5,3,2], wGd:[7,4,2], stemW:12 },
];

function diffSum(a, b, keys) {
  return keys.reduce((s,k)=>s+Math.abs((a[k]||0)-(b[k]||0)),0);
}

// per-formula totals
const totals = {};
for (const f of formulas) totals[f.id] = { totalEl:0, totalGd:0, perCaseEl:{}, perCaseGd:{} };

for (const c of cases) {
  for (const f of formulas) {
    let e, g;
    if (f.skipDM === 'mixed') {
      e = elementDist(c.p, false, f.wEl, f.stemW);   // Element = F1 keep DM
      g = godDist(c.p, true, f.wGd, f.stemW);        // 10G = F3 skip DM 7/4/2
    } else {
      e = elementDist(c.p, f.skipDM, f.w, f.stemW);
      g = godDist(c.p, f.skipDM, f.w, f.stemW);
    }
    const dE = diffSum(e, c.voytekEl, els);
    const dG = diffSum(g, c.voytekGod, codes);
    totals[f.id].totalEl += dE;
    totals[f.id].totalGd += dG;
    totals[f.id].perCaseEl[c.name] = dE;
    totals[f.id].perCaseGd[c.name] = dG;
  }
}

// compare each formula vs F1 (old)
const baseline = totals['F1 old'];
console.log('═══ FORMULA SUMMARY · เทียบ Voytek 6 เคส ═══\n');
console.log('  formula           │ totalΔel │ totalΔ10G │ Element ดี/แย่/เท่า  │ 10Gods ดี/แย่/เท่า');
console.log('  ─────────────────┼──────────┼───────────┼──────────────────────┼─────────────────────');

for (const f of formulas) {
  const t = totals[f.id];
  let elBet=0,elWor=0,elTie=0,gdBet=0,gdWor=0,gdTie=0;
  if (f.id === 'F1 old') {
    console.log(`  ${f.id.padEnd(17)} │ ${String(t.totalEl).padStart(7)}  │ ${String(t.totalGd).padStart(8)}   │ baseline             │ baseline`);
    continue;
  }
  for (const c of cases) {
    const ed = t.perCaseEl[c.name] - baseline.perCaseEl[c.name];
    const gd = t.perCaseGd[c.name] - baseline.perCaseGd[c.name];
    if (ed < 0) elBet++; else if (ed > 0) elWor++; else elTie++;
    if (gd < 0) gdBet++; else if (gd > 0) gdWor++; else gdTie++;
  }
  console.log(`  ${f.id.padEnd(17)} │ ${String(t.totalEl).padStart(7)}  │ ${String(t.totalGd).padStart(8)}   │ ดี${elBet} แย่${elWor} เท่า${elTie}  (${(t.totalEl<baseline.totalEl?'↓':'↑')}${Math.abs(t.totalEl-baseline.totalEl)})  │ ดี${gdBet} แย่${gdWor} เท่า${gdTie} (${(t.totalGd<baseline.totalGd?'↓':'↑')}${Math.abs(t.totalGd-baseline.totalGd)})`);
}

console.log('\n═══ PER-CASE DETAIL ═══\n');
console.log('              Element diff vs Voytek (small=ใกล้)');
console.log('  case            │ ' + formulas.map(f=>f.id.padEnd(15)).join('│ '));
for (const c of cases) {
  console.log('  ' + c.name.padEnd(14) + ' │ ' + formulas.map(f=>String(totals[f.id].perCaseEl[c.name]).padStart(5).padEnd(15)).join('│ '));
}
console.log('');
console.log('              10 Gods diff vs Voytek');
console.log('  case            │ ' + formulas.map(f=>f.id.padEnd(15)).join('│ '));
for (const c of cases) {
  console.log('  ' + c.name.padEnd(14) + ' │ ' + formulas.map(f=>String(totals[f.id].perCaseGd[c.name]).padStart(5).padEnd(15)).join('│ '));
}

console.log('\n═══ VERDICT ═══');
let anyWin = false;
for (const f of formulas) {
  if (f.id === 'F1 old') continue;
  let allBetterOrEqElement = true, allBetterOrEqGod = true;
  for (const c of cases) {
    if (totals[f.id].perCaseEl[c.name] > baseline.perCaseEl[c.name]) allBetterOrEqElement = false;
    if (totals[f.id].perCaseGd[c.name] > baseline.perCaseGd[c.name]) allBetterOrEqGod = false;
  }
  if (allBetterOrEqElement && allBetterOrEqGod) {
    console.log(`  ✅ ${f.id} · ดีขึ้นหรือเท่าทุกเคส (Element + 10G) · ปลอดภัย`);
    anyWin = true;
  }
}
if (!anyWin) console.log('  🛑 ไม่มีสูตรไหนดีขึ้นทุกเคส (no formula wins all 6) · ยังไม่มีสูตรปลอดภัย');
