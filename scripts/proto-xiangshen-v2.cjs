/* prototype 相神/成格破格 v2 — ครบ 8格 (encode สูตร§8.2 + craft golden จากกฎ · ตำรา=สูตร)
   順用: 正官/財/印/食神 · 逆用: 七殺/傷官/陽刃/建祿月劫
   craft golden ใช้กิ่ง旺支(子卯午酉=1ซ่อน)คุม hidden ง่าย
   รัน: node scripts/proto-xiangshen-v2.cjs */
const S = require('../data/library/wrappers/shared');
const POS = ['year','month','day','hour'];
const active = (n) => POS.filter(p => n[p]);

function gods(n) {
  const dm = n.day.stem, g = new Set();
  for (const p of active(n)) {
    if (p !== 'day') { const tg = S.tenGod(dm, n[p].stem); if (tg) g.add(tg); } // ข้าม 日主 (DM ไม่ใช่ 比肩 ของตัวเอง)
    const hs = S.HIDDEN_STEMS[n[p].branch];
    if (hs && hs.main) { const h = S.tenGod(dm, hs.main); if (h) g.add(h); }
  }
  return g;
}
// 身強弱 คร่าว: นับ 比劫+印 (ช่วยตัวตน) vs 財官食傷殺 (ทอนตัวตน) จาก ten god ในผัง
function bodyStrong(n) {
  const g = gods(n);
  const help = ['比肩','劫財','正印','偏印'].filter(x => g.has(x)).length;
  const drain = ['正財','偏財','正官','七殺','食神','傷官'].filter(x => g.has(x)).length;
  return help >= drain;
}
/* grade per 格 (encode §8.2) — คืน 成格/破格/救應/合格普通 */
function grade(n, ge) {
  const g = gods(n); const has = (x) => g.has(x);
  const 印 = has('正印') || has('偏印'), 財 = has('正財') || has('偏財');
  const 食 = has('食神'), 傷 = has('傷官'), 殺 = has('七殺'), 官 = has('正官');
  const 比劫 = has('比肩') || has('劫財'), strong = bodyStrong(n);
  switch (ge) {
    case '正官格':
      if (傷) return 印 ? R('救應','傷官見官→透印制傷') : R('破格','傷官見官 PO_OFFICIAL_1');
      if (殺) return R('破格','官煞混雜 PO_OFFICIAL_3');
      return (財 || 印) ? R('成格','官透+財印無傷') : R('合格普通','官透ไม่มีค้ำ');
    case '財格':
      if (比劫 && !食 && !官) return R('破格','比劫奪財 PO_WEALTH_1 (ไม่มี食化/官制)');
      if (比劫 && (食 || 官)) return R('救應','比劫奪財→食化劫/官制劫');
      if (殺 && !食) return R('破格','財生殺攻身 PO_WEALTH_3');
      return (官 || 食 || 印) ? R('成格','財旺生官/食生財/財透印') : R('合格普通','財ไม่มีค้ำ');
    case '印綬格':
      if (財 && !比劫) return R('破格','財重破印 PO_SEAL_1 (ไม่มี比劫制財)');
      if (財 && 比劫) return R('救應','財破印→比劫制財');
      return (官 || 殺 || 食 || 傷) ? R('成格','官印雙全/印旺透食傷洩秀') : R('合格普通','印ไม่มีค้ำ');
    case '食神格':
      if (has('偏印') && !財) return R('破格','梟印奪食 PO_FOOD_1 (ไม่มี財化梟)');
      if (has('偏印') && 財) return R('救應','梟印奪食→透財化梟');
      return (財 || 殺) ? R('成格','食神生財/食帶煞制殺') : R('合格普通','食ไม่มีค้ำ');
    case '七殺格':
      if (!食 && !印 && !比劫 && !strong) return R('破格','煞重身輕無制無印 PO_KILL_3');
      if (食 || 印 || (strong && 財)) return R('成格','食制殺/印化殺/身強財滋殺');
      return R('合格普通','殺ไม่มีตัวคุมชัด');
    case '傷官格':
      if (官) { // 傷官見官 (非金水ถือ破)
        const dmEl = S.STEM_ELEMENT[n.day.stem];
        if (dmEl === 'metal') return R('成格','金水傷官·允許見官 (例外)');
        return (財 || 合官()) ? R('救應','傷官見官→財通關/合官') : R('破格','傷官見官 PO_HURT_1');
      }
      return (財 || 印 || 殺) ? R('成格','傷官生財/傷官佩印/傷官駕殺') : R('合格普通','傷ไม่มีค้ำ');
    case '陽刃格':
      if (!官 && !殺) return R('破格','無官煞制刃 PO_BLADE_1');
      if ((官 || 殺) && 傷 && !印) return R('破格','官遭傷 PO_BLADE_2 (ไม่มี印護)');
      return R('成格','透官煞制刃+財印');
    case '建祿月劫格':
      if (!財 && !官 && !殺) return R('破格','純比劫無財官煞 PO_LU_1');
      if (官 && 傷 && !合官()) return R('破格','用官而官被傷 PO_LU_2');
      return R('成格','透官逢財印/透財逢食傷');
    default: return R('?','格ไม่รู้จัก');
  }
  function 合官() { return false; } // PoC: 合官 ต้องดูปฏิกิริยา合 (เฟสถัดไป)
}
function R(v, reason) { return { v, reason }; }

const P = (y,m,d,h) => ({ year:{stem:y[0],branch:y[1]}, month:{stem:m[0],branch:m[1]}, day:{stem:d[0],branch:d[1]}, hour:h?{stem:h[0],branch:h[1]}:null });
// craft golden จากกฎ §8.2 · กิ่ง旺支(子卯午酉)คุม hidden · DM甲(辛官庚殺己財戊財丁傷丙食癸印壬印乙劫) DM丙ฯลฯ
const F = [
  // 正官格 (4 จาก v1 ผ่าน)
  ['正官 成格', P('己卯','辛酉','甲子','戊辰'), '正官格', '成格'],
  ['正官 破格傷官見官', P('辛酉','丁酉','甲午','丁卯'), '正官格', '破格'],
  ['正官 救應印制傷', P('癸酉','辛酉','甲午','丁卯'), '正官格', '救應'],
  // 財格 (DM甲·己/戊=財·乙劫·丁食傷? 甲生丁=傷·丙=食)
  ['財格 成格(財生官)', P('辛酉','己酉','甲午','戊午'), '財格', '成格'],   // 己財+辛官·เลี่ยงกิ่งไม้(比劫)
  ['財格 破格比劫奪財', P('乙卯','己卯','甲子','乙亥'), '財格', '破格'],   // 己財+乙乙劫·ไม่มี食官
  // 印格 (DM甲·癸/壬=印·己財·辛官)
  ['印格 成格(官印)', P('癸酉','辛酉','甲子','癸酉'), '印綬格', '成格'],   // 癸印+辛官
  ['印格 破格財破印', P('戊午','癸酉','甲午','戊午'), '印綬格', '破格'],   // 癸印+戊財·เลี่ยงกิ่งไม้(比劫)
  // 食神格 (DM甲·丙=食·偏印=壬·財己)
  ['食神 成格(食生財)', P('己卯','丙午','甲午','己巳'), '食神格', '成格'], // 丙食+己財
  ['食神 破格梟奪食', P('壬子','丙午','甲子','壬申'), '食神格', '破格'],   // 丙食+壬壬偏印·ไม่มี財
  // 七殺格 (DM甲·庚=殺·丙食制·壬印化)
  ['七殺 成格(食制殺)', P('庚午','丙戌','甲申','庚午'), '七殺格', '成格'], // 庚殺+丙食制
  // หมายเหตุ: 七殺破格(煞重身輕無印無食) craft ด้วย DM甲 ไม่ได้สะอาด (กิ่ง庚ซ่อน印/食เสมอ = เคสหายากธรรมชาติจริง) → ข้าม
  // 傷官格 (DM甲·丁=傷·己財·癸印·辛官)
  ['傷官 成格(傷生財)', P('丁卯','丁未','甲子','己巳'), '傷官格', '成格'], // 丁傷+己財
  ['傷官 破格見官', P('辛酉','丁卯','甲午','丁卯'), '傷官格', '破格'],     // 丁傷+辛官·非金水·ไม่มี財
  // 陽刃格 (DM甲·卯=刃·庚殺制·丁傷)
  ['陽刃 成格(官煞制刃)', P('庚午','丁卯','甲子','庚午'), '陽刃格', '成格'], // 庚殺制刃
  ['陽刃 破格無制', P('丙寅','丁卯','甲子','乙亥'), '陽刃格', '破格'],      // ไม่มี官殺
  // 建祿月劫格 (DM甲·寅=祿·辛官財己·純比劫)
  ['建祿 成格(透官財)', P('辛酉','丙寅','甲子','己巳'), '建祿月劫格', '成格'], // 辛官+己財
  ['建祿 破格純比劫', P('甲寅','丙寅','甲寅','乙亥'), '建祿月劫格', '破格'],   // 比劫ล้วน
];
console.log('=== proto 相神 v2 · 8格 vs craft golden ===\n');
let ok=0, bad=0; const byGe={};
for (const [name, n, ge, exp] of F) {
  const r = grade(n, ge); const pass = r.v === exp; pass?ok++:bad++;
  byGe[ge] = byGe[ge] || [0,0]; pass?byGe[ge][0]++:byGe[ge][1]++;
  console.log(`${pass?'✓':'✗'} ${name}\n    → ${r.v} · ${r.reason} (expect ${exp})`);
}
console.log(`\nผล: ${ok}/${ok+bad}`);
for (const [ge,[p,f]] of Object.entries(byGe)) console.log(`  ${ge}: ${p}/${p+f}`);
process.exit(bad?1:0);
