/* gen-preview2.cjs — พรีวิวโครงใหม่ 7 บรรทัด (ก๊อป CSS .ez จริงจาก calendar.html เพื่อความเที่ยงตรง)
 * รัน: cd /root/decode-app && node data/library/calendar-daytext/gen-preview2.cjs
 * ผลลัพธ์: preview2.html + ใช้ chromium ถ่ายภาพต่อได้
 */
const fs = require('fs');
const path = require('path');
const tyme = require(path.join(__dirname, '../../../node_modules/tyme4ts'));

const DIR = __dirname;
const cal = fs.readFileSync(path.join(DIR, '../../../public/calendar.html'), 'utf8');

/* ดึง CSS .ez จริงจากหน้า (จากคอมเมนต์ 10 ก.ค. ถึงจบ media มือถือ) */
const cssStart = cal.indexOf('/* 10 ก.ค. · โหมดอ่านง่าย (ปฏิทินภาษาคน)');
const cssEnd = cal.indexOf('}', cal.indexOf('.ez-dir{border-top:none', cssStart)) + 2;
const EZ_CSS = cal.slice(cssStart, cssEnd) + '\n}';

const FILES = ['labels','combo-part1','combo-part2','combo-part3','officer-12','nayin-30','conditions','goals-72'];
function loadLib(l){ const p={}; FILES.forEach(f=>p[f]=JSON.parse(fs.readFileSync(path.join(DIR,l,f+'.json'),'utf8')));
  return { labels:p['labels'], combos:Object.assign({},p['combo-part1'],p['combo-part2'],p['combo-part3']), officer:p['officer-12'], nayin:p['nayin-30'], conditions:p['conditions'], goals:p['goals-72'] }; }
const LIB = { th: loadLib('th') };

const STEM_EL={甲:'wood',乙:'wood',丙:'fire',丁:'fire',戊:'earth',己:'earth',庚:'metal',辛:'metal',壬:'water',癸:'water'};
const BR_EL={子:'water',丑:'earth',寅:'wood',卯:'wood',辰:'earth',巳:'fire',午:'fire',未:'earth',申:'metal',酉:'metal',戌:'earth',亥:'water'};
const STEM_YANG={甲:1,乙:0,丙:1,丁:0,戊:1,己:0,庚:1,辛:0,壬:1,癸:0};
const PRODUCES={wood:'fire',fire:'earth',earth:'metal',metal:'water',water:'wood'};
const CONTROLS={wood:'earth',earth:'water',water:'fire',fire:'metal',metal:'wood'};
function tenGod(dm,s){const de=STEM_EL[dm],se=STEM_EL[s],same=STEM_YANG[dm]===STEM_YANG[s];
 if(se===de)return same?'比肩':'劫財'; if(PRODUCES[de]===se)return same?'食神':'傷官';
 if(CONTROLS[de]===se)return same?'偏財':'正財'; if(CONTROLS[se]===de)return same?'七殺':'正官'; return same?'偏印':'正印';}
const CHONG={子:'午',丑:'未',寅:'申',卯:'酉',辰:'戌',巳:'亥',午:'子',未:'丑',申:'寅',酉:'卯',戌:'辰',亥:'巳'};
const EZ_CAISHEN={甲:'NE',乙:'NE',丙:'SE',丁:'SE',戊:'S',己:'S',庚:'SW',辛:'SW',壬:'NW',癸:'NW'};
const EZ_XISHEN={甲:'NE',己:'NE',乙:'NW',庚:'NW',丙:'SW',辛:'SW',丁:'S',壬:'S',戊:'SE',癸:'SE'};
const EZ_DIR_TH={N:'เหนือ',NE:'ตอ.เฉียงเหนือ',E:'ตะวันออก',SE:'ตอ.เฉียงใต้',S:'ใต้',SW:'ตต.เฉียงใต้',W:'ตะวันตก',NW:'ตต.เฉียงเหนือ'};
const EZ_EL_COLOR={wood:'#66a06a',fire:'#d96a5f',earth:'#c9a04e',metal:'#a8b0b8',water:'#5f8fc9'};
const CN={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
function lunarNum(s){const m=String(s||'').match(/(初|十|廿|三十|二十)?([一二三四五六七八九十]+)$/);if(!m)return null;const pre=m[1]||'',t=m[2];
 if(pre==='初')return CN[t]||null;if(pre==='廿'||pre==='二十')return 20+(CN[t]===10?0:CN[t]||0);if(pre==='三十')return 30;
 if(pre==='十')return 10+(CN[t]===10?0:CN[t]||0);if(t==='十')return 10;
 if(t.length===2&&t[1]==='十')return (CN[t[0]]||0)*10;if(t.length===2&&t[0]==='十')return 10+(CN[t[1]]||0);return CN[t]||null}

const DM='己', USER_YEAR='子', GOAL='wealth'; // ดวงตัวอย่าง + เลือกเป้าเงิน (โชว์บรรทัด⑦)
const L=LIB.th;
const days=[];
for(let d=1;d<=31;d++){const sd=tyme.SolarDay.fromYmd(2026,7,d);const ld=sd.getLunarDay();const gz=ld.getSixtyCycle().getName();
 const OFF_NORM={'开':'開','满':'滿','执':'執','闭':'閉'};
 const rawOff=ld.getDuty().getName();
 days.push({day:d,dow:sd.getWeek().getIndex(),stem:gz[0],branch:gz[1],officer:OFF_NORM[rawOff]||rawOff,lunar:ld.getName(),tg:tenGod(DM,gz[0])});}

function cellHtml(d){
  const combo=L.combos[d.tg+'|'+d.officer]||{};
  const label=(L.labels.daypower[d.tg]||{}).label||'';
  const title=combo.title||'', text=combo.text||'';
  const LIUHE={子:'丑',丑:'子',寅:'亥',亥:'寅',卯:'戌',戌:'卯',辰:'酉',酉:'辰',巳:'申',申:'巳',午:'未',未:'午'};
  let chip='',chipCls='chu';
  if(CHONG[d.branch]===USER_YEAR){chip=L.conditions.chong_personal.chip;chipCls='ch';}
  else if(LIUHE[d.branch]===USER_YEAR){chip=L.conditions.he_personal.chip;chipCls='he';}
  const sub=['ค่ำ '+lunarNum(d.lunar), L.labels.stem[d.stem], (L.labels.branch[d.branch]||{}).label].filter(Boolean).join(' · ');
  const goal=L.goals[d.officer+'|'+GOAL]||'';
  const cai=EZ_CAISHEN[d.stem],xi=EZ_XISHEN[d.stem];
  const dots=[STEM_EL[d.stem],BR_EL[d.branch]].map(e=>`<i class="ez-dot" style="background:${EZ_EL_COLOR[e]}"></i>`).join('');
  return `<div class="day-cell ez${d.day===10?' is-today':''}">
    <div class="ez-top"><span class="ez-num">${d.day}</span><span class="ez-power">${label}</span>${chip?`<span class="ez-chip ${chipCls}">${chip}</span>`:''}</div>
    <div class="ez-sub">${sub}</div>
    ${title&&title!==label?`<div class="ez-title">${title}</div>`:''}
    <div class="ez-text">${text}</div>
    ${goal?`<div class="ez-goal">▸ ${goal}</div>`:''}
    <div class="ez-dir"><span class="ez-dir-t">💰${EZ_DIR_TH[cai]||''}${xi&&xi!==cai?` · 🌸${EZ_DIR_TH[xi]}`:''}</span><span class="ez-dots">${dots}</span></div>
  </div>`;
}

const DOW=['อา','จ','อ','พ','พฤ','ศ','ส'];
let grid=DOW.map(d=>`<div class="dow">${d}</div>`).join('')+'<div class="day-cell empty"></div>'.repeat(days[0].dow)+days.map(cellHtml).join('');

const html=`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><title>พรีวิว 7 บรรทัด</title><style>
:root{--gold:#b8860b;--gold-soft:rgba(184,134,11,.08);--gold-line:rgba(184,134,11,.35);--tile:#fff;--tile-bd:#e5ddd0;--bg-2:#fff;--bg-3:#f5efe4;--bg:#faf7f2;--fg-soft:#8a8070;}
*{box-sizing:border-box;margin:0}body{font-family:'Noto Sans Thai',sans-serif;background:var(--bg);color:#2b2620;padding:14px}
h3{font-size:14px;margin-bottom:8px}
.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);}
.dow{font-size:10px;color:var(--fg-soft);text-align:center;padding:4px 0}
.day-cell{border-right:1px solid var(--tile-bd);border-bottom:1px solid var(--tile-bd);cursor:pointer;position:relative;display:flex;flex-direction:column;background:var(--bg-2);}
.day-cell.is-today{background:var(--gold-soft);box-shadow:inset 0 0 0 2px var(--gold);}
.day-cell.empty{background:transparent;border:none}
${EZ_CSS}
</style></head><body>
<h3>🗓 กรกฎาคม 2569 · ดวงตัวอย่าง (ดินหยิน ปีชวด) · โหมดดวงฉัน + เป้า:เงิน · เดสก์ท็อป 1440px</h3>
<div class="calendar-grid">${grid}</div>
</body></html>`;
fs.writeFileSync(path.join(DIR,'preview2.html'),html);
console.log('preview2.html', Math.round(html.length/1024)+'KB');
