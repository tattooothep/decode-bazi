/* prototype 化氣格 gate (เฟส B · ยังไม่แตะ engine) — รันกับ golden ก่อนตัดสินใจ port
   รัน: node scripts/proto-huaqi-gate.cjs */
const S = require('../data/library/wrappers/shared');

const HUA_MONTHS = {
  earth: ['辰','戌','丑','未'], metal: ['巳','酉','丑','申','戌'], water: ['亥','子','丑','申','辰'],
  wood: ['寅','卯','辰','亥','未'], fire: ['巳','午','未','寅','戌'],
};
const HUA_GUIDE = { earth:'戊', metal:'庚', water:'壬', wood:'甲', fire:'丙' };
const HUA_ZH = { wood:'木', fire:'火', earth:'土', metal:'金', water:'水' };
const POS = ['year','month','day','hour'];
const active = (n) => POS.filter(p => n[p]);

function findCombo(s1, s2) {
  for (const [k, v] of Object.entries(S.STEM_COMBOS))
    if ((v.partner1===s1&&v.partner2===s2)||(v.partner1===s2&&v.partner2===s1)) return { key:k, transformsTo:v.transformsTo };
  return null;
}
function huaRootBranches(n, el) {
  const out = [];
  for (const p of active(n)) { const hs = S.HIDDEN_STEMS[n[p].branch]; if (!hs) continue;
    if ([hs.main,hs.middle,hs.residual].filter(Boolean).some(h => S.STEM_ELEMENT[h]===el)) out.push(n[p].branch); }
  return out;
}
function dmRootGate(n) {
  const dmEl = S.STEM_ELEMENT[n.day.stem]; const rank = {none:0,token:1,partial:2,real:3};
  let level='none'; const rb=[];
  for (const p of active(n)) { const b=n[p].branch; const hs=S.HIDDEN_STEMS[b]; if(!hs) continue;
    let lv='none';
    if (hs.main && S.STEM_ELEMENT[hs.main]===dmEl) lv='real';
    else if (hs.middle && S.STEM_ELEMENT[hs.middle]===dmEl) lv='partial';
    else if (hs.residual && S.STEM_ELEMENT[hs.residual]===dmEl) lv='token';
    if (lv!=='none'){ rb.push(b); if(rank[lv]>rank[level])level=lv; } }
  if (level==='partial') { const atk = rb.some(x=>{const c=S.SIX_CLASH[x]; return c&&active(n).some(p=>n[p].branch===c);}); return atk?'hair':'real'; }
  return level==='token'?'hair':level;
}
function strongController(n, hua) {
  const foes = Object.entries(S.ELEMENT_CONTROLS).filter(([_,v])=>v===hua).map(([k])=>k);
  const stems = active(n).map(p=>n[p].stem);
  const transparent = stems.some(s=>foes.includes(S.STEM_ELEMENT[s]));
  const rooted = active(n).some(p=>{const hs=S.HIDDEN_STEMS[n[p].branch]; return hs&&hs.main&&foes.includes(S.STEM_ELEMENT[hs.main]);});
  return transparent && rooted;
}
function grade(n) {
  const dm = n.day.stem; const pos = active(n); const idx={}; pos.forEach((p,i)=>idx[p]=i);
  for (const other of pos.filter(p=>p!=='day')) {
    const combo = findCombo(dm, n[other].stem); if (!combo) continue;
    const hua = combo.transformsTo, partner = n[other].stem;
    if (Math.abs(idx.day-idx[other])!==1) return { v:'合而不化', hua, reason:'隔位' };
    const gotMonth = HUA_MONTHS[hua].includes(n.month.branch);
    const gotGround = huaRootBranches(n,hua).length>=2;
    const guide = HUA_GUIDE[hua]; const stems = pos.map(p=>n[p].stem);
    const hasGuide = stems.includes(guide) || pos.some(p=>{const hs=S.HIDDEN_STEMS[n[p].branch]; return hs&&[hs.main,hs.middle,hs.residual].includes(guide);});
    const noKiller = !strongController(n,hua);
    const contention = stems.filter(s=>s===dm).length>1 || stems.filter(s=>s===partner).length>1;
    const dmRoot = dmRootGate(n);
    const core = gotMonth && gotGround && hasGuide && noKiller;
    const blocks = contention && !core;
    const dbg = `[gotM=${gotMonth} gotG=${gotGround}(${huaRootBranches(n,hua).length}) guide=${hasGuide} noKill=${noKiller} 競=${contention} dmRoot=${dmRoot}]`;
    if (core && !blocks && dmRoot==='none') return { v:'真化', hua, reason:dbg };
    if ((dmRoot==='none'||dmRoot==='hair') && !blocks && (gotMonth||gotGround)) return { v:'假化', hua, reason:dbg };
    return { v:'合而不化', hua, reason:dbg };
  }
  return { v:'none(ไม่มีคู่五合ติด)', hua:null, reason:'' };
}

const P = (y,m,d,h) => ({ year:{stem:y[0],branch:y[1]}, month:{stem:m[0],branch:m[1]}, day:{stem:d[0],branch:d[1]}, hour:h?{stem:h[0],branch:h[1]}:null });
const F = [
  ['Fixture C (คัมภีร์ · expect 真化)', P('戊辰','己未','甲戌','己巳'), '真化'],
  ['Fixture D (คัมภีร์ · expect 合而不化)', P('甲子','丙子','己酉','乙亥'), '合而不化'],
  ['ไนท์ (expect 合而不化 · 甲己隔位)', P('甲子','丙子','己亥','庚午'), '合而不化'],
  ['Aeaw (ไม่化 · expect none)', P('甲子','丙子','己亥','庚午'), 'none'],  // = ไนท์? Aeaw 庚午/己亥/丙子/甲子
  ['Mai (ไม่化 · expect none)', P('丙寅','壬辰','丙戌','丙申'), 'none'],
  ['F7 synthetic (expect 真化)', P('戊辰','己未','甲戌','己巳'), '真化'],
  ['F8 synthetic (expect 假化)', P('乙卯','甲辰','己卯','乙亥'), '假化'],
  ['F9 synthetic (expect 合而不化)', P('丙午','甲子','己卯',null), '合而不化'],
];
console.log('=== prototype 化氣格 gate vs golden ===\n');
let ok=0, bad=0;
for (const [name, n, exp] of F) {
  const g = grade(n);
  const got = g.v.replace(/\(.*/,'');
  const pass = got === exp;
  console.log(`${pass?'✓':'✗'} ${name}\n    → ${g.v} ${g.hua||''} ${g.reason}\n    expect: ${exp}\n`);
  pass?ok++:bad++;
}
console.log(`ผล: ${ok} ตรง / ${bad} ไม่ตรง (จาก ${F.length})`);
