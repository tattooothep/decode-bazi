/* prototype 相神/成格破格 — 正官格 PoC (Phase A · encode สูตรตำรา §8.2 + craft golden จากกฎ)
   พิสูจน์ pattern (เหมือน化氣格): encode rule-table → craft golden เช็ค (ไม่รอ 14案例)
   รัน: node scripts/proto-xiangshen-v1.cjs */
const S = require('../data/library/wrappers/shared');
const POS = ['year','month','day','hour'];
const active = (n) => POS.filter(p => n[p]);

// ten gods ในผัง (ก้านบน + 本氣ซ่อน) เทียบ DM
function godsInChart(n) {
  const dm = n.day.stem, g = new Set();
  for (const p of active(n)) {
    const tg = S.tenGod(dm, n[p].stem); if (tg) g.add(tg);
    const hs = S.HIDDEN_STEMS[n[p].branch];
    if (hs && hs.main) { const h = S.tenGod(dm, hs.main); if (h) g.add(h); }
  }
  return g;
}
/* §8.2 正官格: 順用 · 相神=財/印 · 破=傷官見官(PO_1)/官煞混雜(PO_3) · 救應=印制傷 */
function gradeZhengGuan(n) {
  const g = godsInChart(n);
  const has = (x) => g.has(x);
  const 官 = has('正官'), 傷 = has('傷官'), 印 = has('正印') || has('偏印');
  const 財 = has('正財') || has('偏財'), 殺 = has('七殺');
  if (!官) return { v: 'ไม่ใช่正官格', reason: 'ไม่มี正官' };
  // 破: 傷官見官 (PO_OFFICIAL_1)
  if (傷) {
    if (印) return { v: '救應', reason: '傷官見官 แต่ 透印制傷 (敗中有成)' };  // 救應_for PO_1
    return { v: '破格', reason: '傷官見官 ไม่มีอินกู้ (PO_OFFICIAL_1)' };
  }
  // 破: 官煞混雜 (PO_OFFICIAL_3)
  if (殺) return { v: '破格', reason: '官煞混雜 (PO_OFFICIAL_3) · ต้อง合殺/去殺留官' };
  // 成: 官透 + 財印 + 無傷
  if (財 || 印) return { v: '成格', reason: `官透 + ${財 ? '財' : ''}${印 ? '印' : ''} + 無傷官 (成格)` };
  return { v: '合格普通', reason: '正官透 แต่ไม่มี財/印 ค้ำ (成格ไม่เต็ม)' };
}

const P = (y,m,d,h) => ({ year:{stem:y[0],branch:y[1]}, month:{stem:m[0],branch:m[1]}, day:{stem:d[0],branch:d[1]}, hour:h?{stem:h[0],branch:h[1]}:null });
// craft golden จากกฎ §8.2 (DM甲: 辛=正官·己/戊=財·丁=傷官·癸=正印·庚=七殺)
const F = [
  ['成格 (官透+財印無傷)', P('己卯','辛未','甲子','戊辰'), '成格'],       // 辛官·己財·戊財·ไม่มี傷
  ['破格 傷官見官 (PO_1·無印)', P('辛酉','丁酉','甲午','丁卯'), '破格'],   // 辛官+丁傷·เลี่ยงกิ่งซ่อนน้ำ(印)
  ['救應 傷官見官+印制傷', P('癸酉','辛未','甲子','丁卯'), '救應'],        // 辛官+丁傷+癸印
  ['破格 官煞混雜 (PO_3)', P('庚寅','辛酉','甲寅','戊寅'), '破格'],        // 辛官+庚殺·เลี่ยงซ่อน丁(傷)/น้ำ(印)
  ['ไม่ใช่正官格', P('丙寅','甲午','甲子','戊辰'), 'ไม่ใช่正官格'],         // ไม่มี辛官
];
console.log('=== proto 相神 · 正官格 PoC vs craft golden ===\n');
let ok=0, bad=0;
for (const [name, n, exp] of F) {
  const r = gradeZhengGuan(n); const pass = r.v === exp; pass?ok++:bad++;
  console.log(`${pass?'✓':'✗'} ${name}\n    → ${r.v} · ${r.reason}\n    expect: ${exp}\n`);
}
console.log(`ผล: ${ok}/${ok+bad}`);
console.log('PoC: ถ้าผ่าน = pattern "encode สูตรตำรา §8.2 + craft golden จากกฎ" ใช้กับ相神ได้ (เหมือน化氣格) → ขยาย 4格順用 + 4格逆用');
