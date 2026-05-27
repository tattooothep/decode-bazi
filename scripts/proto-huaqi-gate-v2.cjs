/* prototype 化氣格 gate v2 (เฟส B · 12長生 root model · ตามคัมภีร์ · 3-agent เงื่อนไข)
   เพิ่มจาก v1: dmRootGate ใช้ 12長生 (衰墓絕→สลาย/ปิด · 臨官帝旺長生→ทน) · นิยาม phase ครบ 12 (ไม่ over-fit 2 จุด)
   รัน: node scripts/proto-huaqi-gate-v2.cjs */
const S = require('../data/library/wrappers/shared');

const HUA_MONTHS = {
  earth: ['辰','戌','丑','未'], metal: ['巳','酉','丑','申','戌'], water: ['亥','子','丑','申','辰'],
  wood: ['寅','卯','辰','亥','未'], fire: ['巳','午','未','寅','戌'],
};
const HUA_GUIDE = { earth:'戊', metal:'庚', water:'壬', wood:'甲', fire:'丙' };
const POS = ['year','month','day','hour'];
const active = (n) => POS.filter(p => n[p]);

/* 12長生 phase-set (ครบ 12 · กฎทั่วไป ไม่ fit เฉพาะดวง):
   STRONG = ราก真 (有力) · 墓 = 庫(สอบ沖ถึงเปิด) · ที่เหลือ = 微/敗(อ่อน) */
const STRONG_PHASE = new Set(['長生','冠帶','臨官','帝旺']);
// WEAK (อ่อน·敗·絕地): 沐浴,衰,病,死,絕,胎,養 — ไม่被沖=微根(hair) · 被沖=สลาย(ไม่นับ)
// 墓 (庫): 被沖=沖開庫→ใช้ได้(hair) · ไม่被沖=ปิด(ไม่นับ)

function clashedBranch(n, b) { const c = S.SIX_CLASH[b]; return !!(c && active(n).some(q => n[q].branch === c)); }

function dmRootGate(n) {
  const dm = n.day.stem, dmEl = S.STEM_ELEMENT[dm];
  let strongRoot = false, weakRoot = false;
  for (const p of active(n)) {
    const b = n[p].branch, hs = S.HIDDEN_STEMS[b]; if (!hs) continue;
    if (![hs.main, hs.middle, hs.residual].filter(Boolean).some(h => S.STEM_ELEMENT[h] === dmEl)) continue;
    const ph = S.twelvePhase(dm, b);
    const clashed = clashedBranch(n, b);
    if (STRONG_PHASE.has(ph)) { if (!clashed) return 'real'; strongRoot = true; }   // 真根ไม่被沖=不化เด็ดขาด · 被沖=เหลือ hair
    else if (ph === '墓') { if (clashed) weakRoot = true; }                          // 沖開庫=hair · ปิด=ไม่นับ
    else { if (!clashed) weakRoot = true; }                                          // 微根ไม่被沖=hair · 被沖=สลาย
  }
  if (strongRoot || weakRoot) return 'hair';
  return 'none';
}

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
    // หมายเหตุ: ไม่ skip hua===dmEl — ตำรา (Fixture D) พิจารณา DM=化神ธาตุ เป็น化格candidate (合官化)
    if (Math.abs(idx.day-idx[other])!==1) return { v:'合而不化', hua, reason:'隔位' };
    const gotMonth = HUA_MONTHS[hua].includes(n.month.branch);
    const gotGround = huaRootBranches(n,hua).length>=2;
    const guide = HUA_GUIDE[hua]; const stems = pos.map(p=>n[p].stem);
    const hasGuide = stems.includes(guide) || pos.some(p=>{const hs=S.HIDDEN_STEMS[n[p].branch]; return hs&&[hs.main,hs.middle,hs.residual].includes(guide);});
    const noKiller = !strongController(n,hua);
    const contention = stems.filter(s=>s===dm).length>1 || stems.filter(s=>s===partner).length>1;
    const dmRoot = dmRootGate(n);
    const core = gotMonth && gotGround && hasGuide && noKiller;
    const blocks = contention && !core;   // 妒合 exception: core ครบ → ไม่ block (烈女不更二夫 · 真化ก่อน·競ทีหลัง)
    const phDbg = `日@กิ่งราก:${active(n).filter(p=>{const hs=S.HIDDEN_STEMS[n[p].branch];return hs&&[hs.main,hs.middle,hs.residual].filter(Boolean).some(h=>S.STEM_ELEMENT[h]===S.STEM_ELEMENT[dm]);}).map(p=>`${n[p].branch}=${S.twelvePhase(dm,n[p].branch)}${clashedBranch(n,n[p].branch)?'(沖)':''}`).join(',')||'-'}`;
    const dbg = `[gotM=${gotMonth} gotG=${gotGround}(${huaRootBranches(n,hua).length}) guide=${hasGuide} noKill=${noKiller} 競=${contention} dmRoot=${dmRoot} · ${phDbg}]`;
    if (core && !blocks && dmRoot==='none') return { v:'真化', hua, reason:dbg };
    if ((dmRoot==='none'||dmRoot==='hair') && !blocks && (gotMonth||gotGround)) return { v:'假化', hua, reason:dbg };
    return { v:'合而不化', hua, reason:dbg };
  }
  return { v:'none(ไม่มีคู่五合ติด)', hua:null, reason:'' };
}

const P = (y,m,d,h) => ({ year:{stem:y[0],branch:y[1]}, month:{stem:m[0],branch:m[1]}, day:{stem:d[0],branch:d[1]}, hour:h?{stem:h[0],branch:h[1]}:null });
const F = [
  ['Fixture C (คัมภีร์ · 真化)', P('戊辰','己未','甲戌','己巳'), '真化'],
  ['Fixture D (คัมภีร์ · 合而不化 隔位)', P('甲子','丙子','己酉','乙亥'), '合而不化'],
  ['ไนท์ (假從·甲己隔位丙คั่น → 合而不化)', P('甲子','丙子','己亥','庚午'), '合而不化'],
  ['Aeaw (=ไนท์ ก้านเดียวกัน → 合而不化 隔位)', P('甲子','丙子','己亥','庚午'), '合而不化'],
  ['Mai (ไม่มีคู่五合 → none)', P('丙寅','壬辰','丙戌','丙申'), 'none'],
  ['F7 synthetic (真化·妒合override)', P('戊辰','己未','甲戌','己巳'), '真化'],
  ['F8 synthetic (假化)', P('乙卯','甲辰','己卯','乙亥'), '假化'],
  ['F9 synthetic (合而不化)', P('丙午','甲子','己卯',null), '合而不化'],
];
console.log('=== prototype 化氣格 gate v2 (12長生) vs golden ===\n');
let ok=0, bad=0;
for (const [name, n, exp] of F) {
  const g = grade(n); const got = g.v.replace(/\(.*/,'');
  const pass = got === exp; pass?ok++:bad++;
  console.log(`${pass?'✓':'✗'} ${name}\n    → ${g.v} ${g.hua||''} ${g.reason}\n    expect: ${exp}\n`);
}
console.log(`ผล: ${ok} ตรง / ${bad} ไม่ตรง (จาก ${F.length})`);
console.log(`เกณฑ์ 3-agent: C(真化)+D+ไนท์(合而不化)+Mai(none) ต้องผ่านพร้อมกัน = ${['真化','合而不化','合而不化','none'].length} โกลด์เด้นจริง`);
