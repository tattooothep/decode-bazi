/**
 * Wrapper-8 · 化氣格 verdict (真化 / 假化 / 合而不化)
 *
 * promote จาก proto v2 (scripts/proto-huaqi-gate-v2.cjs · 8/8 golden PASS)
 * blueprint: data/library/wrapper8-huahe-cong-blueprint.md
 *
 * ════════════════════ contract ════════════════════
 * input  · natal (4p หรือ 3p จาก calcBazi) · field: year/month/day/hour {stem,branch}
 * output · {
 *     verdict: '真化' | '假化' | '合而不化' | null,  // null = ไม่มีคู่ 五合 ติด → ไม่ใช่ 化格 candidate
 *     transformElement: 'wood' | 'fire' | 'earth' | 'metal' | 'water' | null,
 *     stems: { dm, partner },
 *     partnerPosition: 'year' | 'month' | 'hour' | null,
 *     monthSupport: boolean,
 *     dmRootLabel: 'none' | 'hair' | 'real',
 *     confidence: 'high' | 'medium' | 'low',
 *     sourceRuleIds: string[],
 *     reasonZh: string,
 *     thaiSummary: string,
 *   }
 *
 * ════════════════════ ห้ามแตะ ════════════════════
 * - wrapper-7 (LOCKED 45/45 test)
 * - usefulGods engine output (LOCKED)
 * - shared.js (Layer-2 base)
 * - bazi-calc.ts (Layer 0-1 LOCKED)
 *
 * ════════════════════ ตำรา reference ════════════════════
 * 子平真詮·論化氣 · 滴天髓·從化論 · 化象
 * 12 長生 (discriminator: 真化 vs 假從 ราก中氣被沖signature เหมือนกัน · ใช้ 衰墓絕/臨官帝旺 แยก)
 */

const S = require('./shared');

/* ── tables ────────────────────────────────────────────────────────── */
const HUA_MONTHS = {
  earth: ['辰','戌','丑','未'],
  metal: ['巳','酉','丑','申','戌'],
  water: ['亥','子','丑','申','辰'],
  wood:  ['寅','卯','辰','亥','未'],
  fire:  ['巳','午','未','寅','戌'],
};
const HUA_GUIDE = { earth:'戊', metal:'庚', water:'壬', wood:'甲', fire:'丙' };
const HUA_ZH = { wood:'木', fire:'火', earth:'土', metal:'金', water:'水' };
const ELEMENT_TH = { wood:'ไม้', fire:'ไฟ', earth:'ดิน', metal:'ทอง', water:'น้ำ' };

/* 12 長生 phase-set · STRONG = ราก真 · 墓 = 庫 · ที่เหลือ = 微/敗
 * STRONG ราก ไม่被沖 = 不化 (real) · 被沖 = เหลือ hair
 * 墓ราก 被沖 = 沖開庫 (hair) · ปิด = ไม่นับ
 * 微/敗ราก ไม่被沖 = hair · 被沖 = สลาย */
const STRONG_PHASE = new Set(['長生','冠帶','臨官','帝旺']);

const POSITIONS = ['year','month','day','hour'];

function activePositions(natal) {
  return POSITIONS.filter((p) => natal[p]);
}

function findStemCombo(s1, s2) {
  for (const [key, v] of Object.entries(S.STEM_COMBOS)) {
    if ((v.partner1 === s1 && v.partner2 === s2) || (v.partner1 === s2 && v.partner2 === s1)) {
      return { key, transformsTo: v.transformsTo };
    }
  }
  return null;
}

function clashedBranch(natal, b) {
  const c = S.SIX_CLASH[b];
  if (!c) return false;
  return activePositions(natal).some((p) => natal[p].branch === c);
}

/** dmRootGate — 5→3 level ตาม 12 長生 + 沖
 *   real = ราก真 ไม่被沖 → 不化 เด็ดขาด
 *   hair = ราก微/รากเหลือเศษหลังถูกถอน → 假化 eligible
 *   none = ไร้รากเลย → 真化 ได้ */
function dmRootGate(natal) {
  const dm = natal.day.stem;
  const dmEl = S.STEM_ELEMENT[dm];
  let strongRoot = false;
  let weakRoot = false;
  for (const p of activePositions(natal)) {
    const b = natal[p].branch;
    const hs = S.HIDDEN_STEMS[b];
    if (!hs) continue;
    const hidden = [hs.main, hs.middle, hs.residual].filter(Boolean);
    if (!hidden.some((h) => S.STEM_ELEMENT[h] === dmEl)) continue;
    const ph = S.twelvePhase(dm, b);
    const cl = clashedBranch(natal, b);
    if (STRONG_PHASE.has(ph)) {
      if (!cl) return 'real';
      strongRoot = true;
    } else if (ph === '墓') {
      if (cl) weakRoot = true; // 沖開庫
    } else {
      if (!cl) weakRoot = true;
    }
  }
  if (strongRoot || weakRoot) return 'hair';
  return 'none';
}

function huaRootBranches(natal, el) {
  const out = [];
  for (const p of activePositions(natal)) {
    const hs = S.HIDDEN_STEMS[natal[p].branch];
    if (!hs) continue;
    const hidden = [hs.main, hs.middle, hs.residual].filter(Boolean);
    if (hidden.some((h) => S.STEM_ELEMENT[h] === el)) out.push(natal[p].branch);
  }
  return out;
}

function strongController(natal, hua) {
  const foes = Object.entries(S.ELEMENT_CONTROLS)
    .filter(([, v]) => v === hua)
    .map(([k]) => k);
  const stems = activePositions(natal).map((p) => natal[p].stem);
  const transparent = stems.some((s) => foes.includes(S.STEM_ELEMENT[s]));
  const rooted = activePositions(natal).some((p) => {
    const hs = S.HIDDEN_STEMS[natal[p].branch];
    return hs && hs.main && foes.includes(S.STEM_ELEMENT[hs.main]);
  });
  return transparent && rooted;
}

/** 5-level ราก DM label → ใช้ map เป็น chart-packet RootLabel (no_root/token_root/...)
 *  packet ส่ง rootedness?.dmLabel ตรงให้ wrapper-8 ใช้แทน 12長生 ก็ได้ แต่ wrapper-8 ตัดสินเอง */
function dmRootLabelForPacket(gate) {
  // gate (none/hair/real) → packet label
  if (gate === 'none') return 'no_root';
  if (gate === 'hair') return 'token_root';
  return 'rooted'; // real
}

/* ── main verdict ─────────────────────────────────────────────────── */
/**
 * analyzeHuaQi(natal) → verdict object หรือ null
 *   null = ไม่มีคู่ 五合 ที่ DM เกี่ยวข้อง (= ไม่ใช่ candidate ของ 化氣格)
 *
 * verdict semantics:
 *   真化 = ครบ 4 core (得令+得地+元神+不受剋) + DM rootless (none) + 緊貼 + ไม่มี 爭合 (หรือ core override)
 *   假化 = (none|hair) + ขาด core บางส่วน แต่ยังได้ month หรือ ground → flag เปราะ
 *   合而不化 = ทุกกรณีนอกเหนือ (緊貼ผ่าน combo มี แต่ไม่ครบเกณฑ์)
 */
function analyzeHuaQi(natal) {
  if (!natal || !natal.day || !natal.day.stem || !natal.month || !natal.month.branch) return null;
  const dm = natal.day.stem;
  const pos = activePositions(natal);
  const idx = {}; pos.forEach((p, i) => idx[p] = i);
  for (const other of pos.filter((p) => p !== 'day')) {
    if (!natal[other] || !natal[other].stem) continue;
    const combo = findStemCombo(dm, natal[other].stem);
    if (!combo) continue;
    const hua = combo.transformsTo;
    const partner = natal[other].stem;
    const adjacency = Math.abs(idx.day - (idx[other] ?? -99)) === 1;
    const gotMonth = HUA_MONTHS[hua].includes(natal.month.branch);
    const groundBranches = huaRootBranches(natal, hua);
    const gotGround = groundBranches.length >= 2;
    const guide = HUA_GUIDE[hua];
    const stems = pos.map((p) => natal[p].stem);
    const hasGuide = stems.includes(guide) || pos.some((p) => {
      const hs = S.HIDDEN_STEMS[natal[p].branch];
      return hs && [hs.main, hs.middle, hs.residual].includes(guide);
    });
    const noKiller = !strongController(natal, hua);
    const contention = stems.filter((s) => s === dm).length > 1 || stems.filter((s) => s === partner).length > 1;
    const dmRoot = dmRootGate(natal);
    const core = gotMonth && gotGround && hasGuide && noKiller;
    const blocks = contention && !core; // 妒合 exception · core ครบ override

    const baseReason = `合${combo.key}→${HUA_ZH[hua]} · 月令=${gotMonth ? 'ตรง' : 'ไม่ตรง'} · 化神得地=${groundBranches.length} · 元神=${hasGuide ? 'มี' : 'ไม่มี'} · 不受剋=${noKiller ? 'ใช่' : 'ไม่ใช่'} · 爭合=${contention ? 'มี' : 'ไม่มี'} · 緊貼=${adjacency ? 'ใช่' : 'ไม่ใช่'} · DM=${dmRoot}`;

    // (1) 隔位 → 合而不化 ทันที (ตำรา conghua: 合而不化 隔位)
    if (!adjacency) {
      return buildVerdict({
        verdict: '合而不化',
        hua, partner, other,
        gotMonth, dmRoot,
        confidence: 'high',
        sourceRuleIds: ['ZPZQ-HUA-002'],
        reasonZh: `${baseReason} · 隔位`,
        thaiHead: '合แต่ไม่แปร (隔位)',
        thaiNote: 'ก้าน五合ห่างเสาวันเกินไป (มีก้านอื่นคั่น) → ไม่แปรเต็มตัว',
      });
    }

    // (2) 真化 = core ครบ + DM rootless + ไม่ block
    if (core && !blocks && dmRoot === 'none') {
      return buildVerdict({
        verdict: '真化',
        hua, partner, other,
        gotMonth, dmRoot,
        confidence: 'high',
        sourceRuleIds: ['ZPZQ-HUA-001', 'DTS-CONGHUA-001'],
        reasonZh: baseReason,
        thaiHead: '真化 · แปรเต็มตัว',
        thaiNote: `ตัวตน${ELEMENT_TH[S.STEM_ELEMENT[dm]]}ไร้ราก + เดือนเกิดหนุน${ELEMENT_TH[hua]} + 元神 ${guide} + ไม่ถูกคุม → แปรเป็น${ELEMENT_TH[hua]}จริง`,
      });
    }

    // (3) 假化 = (none|hair) + ขาด core บางส่วน แต่ยังได้ month หรือ ground (มี seed) → flag เปราะ
    if ((dmRoot === 'none' || dmRoot === 'hair') && !blocks && (gotMonth || gotGround)) {
      const conf = dmRoot === 'none' ? 'medium' : 'low';
      return buildVerdict({
        verdict: '假化',
        hua, partner, other,
        gotMonth, dmRoot,
        confidence: conf,
        sourceRuleIds: ['ZPZQ-HUA-003', 'DTS-CONGHUA-002'],
        reasonZh: baseReason,
        thaiHead: '假化 · แปรไม่มั่นคง',
        thaiNote: `ตัวตน${ELEMENT_TH[S.STEM_ELEMENT[dm]]}${dmRoot === 'hair' ? 'รากบางมาก(微根)' : 'ไร้ราก'} · ขาดเงื่อนไขครบ${gotMonth ? '' : ' (เดือนไม่หนุน)'}${gotGround ? '' : ' (化神得地ไม่ถึง 2)'}${hasGuide ? '' : ' (ไม่มี元神)'}${noKiller ? '' : ' (มีตัวคุม化神)'} → จังหวะปี印/比劫เสริมรากเดิม จะเด้งกลับเป็นตัวเดิม`,
      });
    }

    // (4) อื่นๆ → 合而不化
    return buildVerdict({
      verdict: '合而不化',
      hua, partner, other,
      gotMonth, dmRoot,
      confidence: 'medium',
      sourceRuleIds: ['ZPZQ-HUA-002'],
      reasonZh: baseReason,
      thaiHead: '合แต่ไม่แปร',
      thaiNote: `ก้านชิดกันแต่ขาด${gotMonth ? '' : ' เดือนหนุน'}${gotGround ? '' : ' 化神得地'}${hasGuide ? '' : ' 元神'}${noKiller ? '' : ' (มีตัวคุม)'}${blocks ? ' · มี爭合' : ''} · ทั้งคู่ทำงานครึ่งเดียว`,
    });
  }
  return null; // ไม่มีคู่ 五合 → ไม่ใช่ candidate
}

function buildVerdict({ verdict, hua, partner, other, gotMonth, dmRoot, confidence, sourceRuleIds, reasonZh, thaiHead, thaiNote }) {
  const dmLabel = dmRootLabelForPacket(dmRoot);
  const thaiSummary = `${thaiHead} → ${ELEMENT_TH[hua]} · ราก日干=${dmLabel} · เดือนหนุน=${gotMonth ? 'ใช่' : 'ไม่ใช่'} · ความมั่นใจ=${confidence === 'high' ? 'สูง' : confidence === 'medium' ? 'กลาง' : 'ต่ำ'}\n${thaiNote}\nตำราอ้าง: 子平真詮·化氣 · 滴天髓·從化論`;
  return {
    verdict,
    transformElement: hua,
    stems: { dm: undefined, partner }, // dm fill ใน wrapper-3 layer (เพื่อไม่ให้ wrapper-8 ผูก natal กลับ)
    partnerPosition: other,
    monthSupport: !!gotMonth,
    dmRootLabel: dmLabel,
    dmRootGate: dmRoot, // raw gate label
    confidence,
    sourceRuleIds,
    reasonZh,
    thaiSummary,
  };
}

/* ── runner ──────────────────────────────────────────────────────── */
function selfTest() {
  const P = (y, m, d, h) => ({
    year:  { stem: y[0], branch: y[1] },
    month: { stem: m[0], branch: m[1] },
    day:   { stem: d[0], branch: d[1] },
    hour:  h ? { stem: h[0], branch: h[1] } : null,
  });
  const F = [
    ['Fixture C · 真化',           P('戊辰','己未','甲戌','己巳'), '真化'],
    ['Fixture D · 合而不化 (隔位)', P('甲子','丙子','己酉','乙亥'), '合而不化'],
    ['ไนท์ · 合而不化 (隔位)',      P('甲子','丙子','己亥','庚午'), '合而不化'],
    ['Aeaw · 合而不化 (隔位)',      P('甲子','丙子','己亥','庚午'), '合而不化'],
    ['Mai · null (ไม่มีคู่)',        P('丙寅','壬辰','丙戌','丙申'), null],
    ['F7 · 真化 妒合 override',     P('戊辰','己未','甲戌','己巳'), '真化'],
    ['F8 · 假化',                    P('乙卯','甲辰','己卯','乙亥'), '假化'],
    ['F9 · 合而不化',                P('丙午','甲子','己卯', null), '合而不化'],
  ];
  let ok = 0;
  for (const [name, n, exp] of F) {
    const r = analyzeHuaQi(n);
    const got = r ? r.verdict : null;
    const pass = got === exp;
    if (pass) ok++;
    console.log(`  ${pass ? '✓' : '✗'} ${name} → got=${got} expect=${exp}`);
  }
  console.log(`\nwrapper-8 self-test: ${ok}/${F.length}`);
  return ok === F.length;
}

module.exports = {
  analyzeHuaQi,
  // exposed สำหรับ wrapper-3 backward compat (คืน object เฉพาะ 真化 + null ทุกอย่างอื่น)
  findTrueTransformation(natal) {
    const r = analyzeHuaQi(natal);
    if (!r || r.verdict !== '真化') return null;
    return r;
  },
  selfTest,
};

if (require.main === module) {
  const ok = selfTest();
  process.exit(ok ? 0 : 1);
}
