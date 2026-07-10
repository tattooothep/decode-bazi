/* gen-preview.cjs — สร้าง preview.html (ไฟล์เดี่ยว เปิดดูได้เลย ไม่ต้องมีเซิร์ฟเวอร์)
 * ใช้ดูฟอร์มช่องวันภาษาคนก่อน wire จริง · ดวงตัวอย่าง: วันเกิดธาตุดินหยิน (己) ปีชวด
 * รัน: cd /root/decode-app && node data/library/calendar-daytext/gen-preview.cjs
 */
const fs = require('fs');
const path = require('path');
const tyme = require(path.join(__dirname, '../../../node_modules/tyme4ts'));

const DIR = __dirname;
const FILES = ['labels','combo-part1','combo-part2','combo-part3','officer-12','nayin-30','conditions','goals-72'];
const LANGS = ['th','en','zh'];
const nayinMap = JSON.parse(fs.readFileSync(path.join(DIR,'nayin-map.json'),'utf8'));

const LIB = {};
for (const l of LANGS) {
  const p = {};
  for (const f of FILES) p[f] = JSON.parse(fs.readFileSync(path.join(DIR,l,f+'.json'),'utf8'));
  LIB[l] = {
    labels: p['labels'],
    combos: Object.assign({}, p['combo-part1'], p['combo-part2'], p['combo-part3']),
    officer: p['officer-12'], nayin: p['nayin-30'], conditions: p['conditions'], goals: p['goals-72']
  };
}

/* ten god ของก้านวัน เทียบ日主 (ดวงตัวอย่าง 己 = ดิน หยิน) */
const STEM_EL = {甲:'wood',乙:'wood',丙:'fire',丁:'fire',戊:'earth',己:'earth',庚:'metal',辛:'metal',壬:'water',癸:'water'};
const STEM_YANG = {甲:1,乙:0,丙:1,丁:0,戊:1,己:0,庚:1,辛:0,壬:1,癸:0};
const PRODUCES = {wood:'fire',fire:'earth',earth:'metal',metal:'water',water:'wood'};
const CONTROLS = {wood:'earth',earth:'water',water:'fire',fire:'metal',metal:'wood'};
function tenGod(dm, s) {
  const de=STEM_EL[dm], se=STEM_EL[s], same=STEM_YANG[dm]===STEM_YANG[s];
  if (se===de) return same?'比肩':'劫財';
  if (PRODUCES[de]===se) return same?'食神':'傷官';
  if (CONTROLS[de]===se) return same?'偏財':'正財';
  if (CONTROLS[se]===de) return same?'七殺':'正官';
  return same?'偏印':'正印';
}

/* ข้อมูลวันจริง ก.ค. 2569 (2026) */
const DM='己', USER_YEAR='子';
const days=[];
for (let d=1; d<=31; d++) {
  const sd = tyme.SolarDay.fromYmd(2026,7,d);
  const ld = sd.getLunarDay();
  const gz = ld.getSixtyCycle().getName();
  days.push({
    day:d, dow:sd.getWeek().getIndex(),
    stem:gz[0], branch:gz[1], ganzhi:gz,
    officer:ld.getDuty().getName(),
    lunar:ld.getName(),
    tenGod:tenGod(DM,gz[0]),
    nayin:nayinMap[gz]||''
  });
}

const html = `<!doctype html><html lang="th" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>พรีวิว ปฏิทินมงคลภาษาคน · ก.ค. 2569</title>
<style>
:root{--bg:#faf7f2;--bg2:#fff;--bd:#e5ddd0;--fg:#2b2620;--soft:#8a8070;--gold:#b8860b;--good:#2e7d32;--bad:#c62828;--chip-he:#e8f5e9;--chip-ch:#ffebee}
[data-theme=dark]{--bg:#14120e;--bg2:#1e1b16;--bd:#3a352c;--fg:#e8e2d5;--soft:#9a917f;--gold:#d4a017;--good:#81c784;--bad:#ef9a9a;--chip-he:#1b3320;--chip-ch:#3a1f22}
*{box-sizing:border-box;margin:0}body{font-family:'Noto Sans Thai','Noto Sans',sans-serif;background:var(--bg);color:var(--fg);padding:16px}
h1{font-size:18px;margin-bottom:4px}.sub{color:var(--soft);font-size:12px;margin-bottom:12px}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.bar select,.bar button{padding:6px 12px;border:1px solid var(--bd);background:var(--bg2);color:var(--fg);border-radius:8px;font-size:13px;cursor:pointer}
.bar .on{border-color:var(--gold);color:var(--gold);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.dow{font-size:11px;color:var(--soft);text-align:center;padding:4px 0}
.cell{background:var(--bg2);border:1px solid var(--bd);border-radius:10px;padding:8px;min-height:158px;font-size:11.5px;display:flex;flex-direction:column;gap:4px}
.cell .top{display:flex;align-items:center;gap:6px}
.cell .num{font-weight:700;font-size:14px}
.cell .power{color:var(--gold);font-weight:700}
.chip{margin-left:auto;font-size:10px;padding:1px 6px;border-radius:99px}
.chip.ch{background:var(--chip-ch);color:var(--bad)}.chip.he{background:var(--chip-he);color:var(--good)}.chip.chu{background:var(--bg);color:var(--soft);border:1px solid var(--bd)}
.subline{color:var(--soft);font-size:10.5px}
.title{font-weight:600}
.text{color:var(--fg);opacity:.85;line-height:1.45}
.goal{color:var(--gold);font-size:10.5px;border-top:1px dashed var(--bd);padding-top:4px}
.deep{font-family:monospace;color:var(--soft);font-size:10px}
.empty{background:transparent;border:none}
@media(max-width:860px){.grid{grid-template-columns:repeat(2,1fr)}.dow{display:none}}
</style></head><body>
<h1>🗓 พรีวิวฟอร์มใหม่ · กรกฎาคม 2569</h1>
<div class="sub">ดวงตัวอย่าง: คนธาตุดินหยิน (己) ปีชวด · ข้อมูลวันจริงจาก tyme4ts · ไฟล์พรีวิวอย่างเดียว ไม่เชื่อมระบบ</div>
<div class="bar">
 <select id="lang"><option value="th">ไทย</option><option value="en">English</option><option value="zh">中文</option></select>
 <button id="mode" class="on">ดวงฉัน 我</button>
 <select id="goal"><option value="all">เป้าหมาย: ทั้งหมด</option><option value="wealth">เงิน 財</option><option value="career">งาน 業</option><option value="love">รัก 情</option><option value="family">ครอบครัว 家</option><option value="health">สุขภาพ 健</option><option value="travel">เดินทาง 出</option></select>
 <button id="deep">แบบลึก: ปิด</button>
 <button id="theme">🌙/☀️</button>
</div>
<div class="grid" id="g"></div>
<script>
const LIB=${JSON.stringify(LIB)};
const DAYS=${JSON.stringify(days)};
const CHONG=${JSON.stringify({子:'午',丑:'未',寅:'申',卯:'酉',辰:'戌',巳:'亥',午:'子',未:'丑',申:'寅',酉:'卯',戌:'辰',亥:'巳'})};
const LIUHE=${JSON.stringify({子:'丑',丑:'子',寅:'亥',亥:'寅',卯:'戌',戌:'卯',辰:'酉',酉:'辰',巳:'申',申:'巳',午:'未',未:'午'})};
const USER_YEAR='${USER_YEAR}';
const CN={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
function lunarNum(s){const m=String(s||'').match(/(初|十|廿|三十|二十)?([一二三四五六七八九十]+)$/);if(!m)return null;const pre=m[1]||'',t=m[2];
 if(pre==='初')return CN[t]||null;if(pre==='廿'||pre==='二十')return 20+(CN[t]===10?0:CN[t]||0);if(pre==='三十')return 30;
 if(pre==='十')return 10+(CN[t]===10?0:CN[t]||0);if(t==='十')return 10;
 if(t.length===2&&t[1]==='十')return (CN[t[0]]||0)*10;if(t.length===2&&t[0]==='十')return 10+(CN[t[1]]||0);return CN[t]||null}
function fmt(t,v){return String(t||'').replace(/\\{(\\w+)\\}/g,(_,k)=>v[k]??'')}
let st={lang:'th',mode:'self',goal:'all',deep:false};
const DOW=['อา','จ','อ','พ','พฤ','ศ','ส'];
function render(){
 const L=LIB[st.lang],g=document.getElementById('g');let h=DOW.map(d=>'<div class="dow">'+d+'</div>').join('');
 h+='<div class="cell empty"></div>'.repeat(DAYS[0].dow);
 for(const d of DAYS){
  let label,title,text;
  if(st.mode==='self'&&L.combos[d.tenGod+'|'+d.officer]){const c=L.combos[d.tenGod+'|'+d.officer];label=L.labels.daypower[d.tenGod].label;title=c.title;text=c.text}
  else{const o=L.officer[d.officer];label=o.title;title='';text=o.text}
  let chip='';const ct=CHONG[d.branch],he=LIUHE[d.branch];
  if(st.mode==='self'){ if(ct===USER_YEAR)chip='<span class="chip ch">'+L.conditions.chong_personal.chip+'</span>';
   else if(he===USER_YEAR)chip='<span class="chip he">'+L.conditions.he_personal.chip+'</span>'}
  else if(ct)chip='<span class="chip chu">'+fmt(L.conditions.chong_universal.chip,{animal:L.labels.branch[ct].animal})+'</span>';
  const sub=[fmt(L.labels.lunarDay.format,{n:lunarNum(d.lunar)}),(L.nayin[d.nayin]||{}).name,L.labels.branch[d.branch].label].filter(Boolean).join(' · ');
  const goal=(st.goal!=='all'&&L.goals[d.officer+'|'+st.goal])?'<div class="goal">▸ '+L.goals[d.officer+'|'+st.goal]+'</div>':'';
  const deep=st.deep?'<div class="deep">'+d.ganzhi+' · '+d.officer+' · '+d.lunar+' · '+d.tenGod+'</div>':'';
  h+='<div class="cell"><div class="top"><span class="num">'+d.day+'</span><span class="power">'+label+'</span>'+chip+'</div>'
    +'<div class="subline">'+sub+'</div>'+(title?'<div class="title">'+title+'</div>':'')
    +'<div class="text">'+text+'</div>'+goal+deep+'</div>';
 }
 g.innerHTML=h;
 document.getElementById('mode').textContent=st.mode==='self'?'ดวงฉัน 我':'ทั่วไป 黃曆';
 document.getElementById('deep').textContent='แบบลึก: '+(st.deep?'เปิด':'ปิด');
}
document.getElementById('lang').onchange=e=>{st.lang=e.target.value;render()};
document.getElementById('mode').onclick=()=>{st.mode=st.mode==='self'?'tongshu':'self';render()};
document.getElementById('goal').onchange=e=>{st.goal=e.target.value;render()};
document.getElementById('deep').onclick=()=>{st.deep=!st.deep;render()};
document.getElementById('theme').onclick=()=>{const r=document.documentElement;r.dataset.theme=r.dataset.theme==='light'?'dark':'light'};
render();
</script></body></html>`;

fs.writeFileSync(path.join(DIR,'preview.html'), html);
console.log('เขียน preview.html แล้ว', Math.round(html.length/1024)+'KB', '· ตัวอย่างวันที่ 14:', JSON.stringify(days[13]));
