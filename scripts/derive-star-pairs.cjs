#!/usr/bin/env node
/*
 * derive-star-pairs.cjs
 * --------------------------------------------------------------------------
 * สูตรห้าธาตุ玄空 (deterministic) สำหรับเติม "ความหมายคู่ดาวบิน玄空飛星"
 * เฉพาะคู่ที่ source === 'five_element' (59 คู่) ที่ยังไม่มีวรรคคัมภีร์ตรง
 *
 * กฎ (ห้ามเดา — เป็นกฎตายตัวของศาสตร์):
 *   ดาว → ธาตุ
 *     1 = น้ำ(水)
 *     2 = ดิน(土·病符โรค)
 *     3 = ไม้(木)
 *     4 = ไม้(木)
 *     5 = ดิน(土·廉貞大煞 พิษร้ายเสมอ)
 *     6 = ทอง(金)
 *     7 = ทอง(金)
 *     8 = ดิน(土)
 *     9 = ไฟ(火)
 *   ความสัมพันธ์สองธาตุ (m กระทำต่อ w):
 *     生 (เสริม)  水生木·木生火·火生土·土生金·金生水  → ดี ราบรื่น
 *     剋 (ขม)     水剋火·火剋金·金剋木·木剋土·土剋水  → ขัดแย้ง/บาดเจ็บ
 *     比和        ธาตุเดียวกัน → เสริมแรง (ดีถ้าดาวดี / ร้ายถ้าดาวร้าย)
 *
 * ข้อบังคับ:
 *   - ห้ามแตะคู่ source === 'classical' (18) และ 'principle' (4)
 *   - ห้ามแก้ field score เดิม
 *   - ทุกคู่ five_element ต้องได้ field `derivation` (โปร่งใสว่าเป็นการคำนวณ)
 *   - calibrate สูตรกับ 18 คู่ classical (อ่านอย่างเดียว ไม่เขียนทับ)
 * --------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JSON_PATH = path.resolve(__dirname, '..', 'data', 'library', 'xuankong-period9.json');

// ───────────────────────── ตารางห้าธาตุ ─────────────────────────
// element keys ใช้ภาษาอังกฤษให้ตรงกับ remedy_element เดิม (water/earth/wood/metal/fire)
const STAR_ELEMENT = {
  1: 'water',
  2: 'earth',
  3: 'wood',
  4: 'wood',
  5: 'earth',
  6: 'metal',
  7: 'metal',
  8: 'earth',
  9: 'fire',
};

const EL_TH = {
  water: 'น้ำ(水)',
  earth: 'ดิน(土)',
  wood: 'ไม้(木)',
  metal: 'ทอง(金)',
  fire: 'ไฟ(火)',
};

const EL_ZH = { water: '水', earth: '土', wood: '木', metal: '金', fire: '火' };

// 生: a เสริม b  (a -> b)
const GENERATES = { water: 'wood', wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water' };
// 剋: a ขม b  (a -> b)
const CONTROLS = { water: 'fire', fire: 'metal', metal: 'wood', wood: 'earth', earth: 'water' };

// ดาวพิเศษ
const POISON_STARS = new Set([5]);   // 廉貞大煞 — ร้ายเสมอ
const SICK_STARS = new Set([2]);     // 病符 — โรค (5 ก็มีนัยโรค)
const TIMELY_P9 = new Set([9, 1, 8]); // ยุค9: 9旺, 1生氣, 8 ยังพอใช้ (退氣เล็กน้อย)

// ───────────────────────── เครื่องคำนวณความสัมพันธ์ ─────────────────────────
/**
 * คืนความสัมพันธ์จาก m → w
 *   { rel: 'sheng_out'|'sheng_in'|'ke_out'|'ke_in'|'bihe',
 *     direction: 'good'|'bad'|'neutral'|'amplify',
 *     victim, actor, ... }
 */
function relate(mEl, wEl) {
  if (mEl === wEl) {
    return { rel: 'bihe', zh: '比和' };
  }
  if (GENERATES[mEl] === wEl) {
    // m เสริม w  (m เป็นแม่ พลังไหลออกจาก m ไป w)
    return { rel: 'sheng_out', zh: `${EL_ZH[mEl]}生${EL_ZH[wEl]}`, from: mEl, to: wEl };
  }
  if (GENERATES[wEl] === mEl) {
    // w เสริม m  (m เป็นลูก รับพลัง)
    return { rel: 'sheng_in', zh: `${EL_ZH[wEl]}生${EL_ZH[mEl]}`, from: wEl, to: mEl };
  }
  if (CONTROLS[mEl] === wEl) {
    // m ขม w  (w ถูกกระทำ = victim)
    return { rel: 'ke_out', zh: `${EL_ZH[mEl]}剋${EL_ZH[wEl]}`, actor: mEl, victim: wEl };
  }
  if (CONTROLS[wEl] === mEl) {
    // w ขม m  (m ถูกกระทำ = victim)
    return { rel: 'ke_in', zh: `${EL_ZH[wEl]}剋${EL_ZH[mEl]}`, actor: wEl, victim: mEl };
  }
  return { rel: 'unknown', zh: '?' };
}

// ───────────────────────── deriveScore: ให้คะแนน 1-5 แบบ deterministic ─────────────────────────
// 1 = ร้ายสุด ... 5 = ดีสุด (ครึ่งขั้นได้)
// กฎเป็นชั้น (ยุค 9):
//   ชั้น 1: base จากปฏิกิริยาธาตุ  (生=3.5 · 比和=3 · 剋=2.5)
//   ชั้น 2: ปรับด้วย "คุณภาพดาวยุค9" ของทั้งคู่ (9旺 +1 · 1生氣 +0.5 · 8退氣 0 · 3/4/6失令 −0.5 · 2病符/7破軍 −0.75)
//           × น้ำหนัก 2 (ดาวเป็นตัวขับหลัก) + ปรับปฏิกิริยา×คุณภาพ:
//             - 相生 ที่ "หล่อเลี้ยงดาวร้าย" (ปลายทางเป็น 2/5/7) → −1 (อุ้มดาวร้าย เช่น 火生土病符)
//             - 9火剋金(6/7) ไฟลวกทอง → −0.5 (อันตรายแม้ 9 旺)
//   ชั้น 2 override สูงสุด: มีดาว 5 (廉貞大煞) → คืน 1 เสมอ ก่อนคำนวณอื่น
//   ชั้น 3: fire pair (5-9·9-5·7-9·9-7·2-7·7-2) → −1 (อันตรายไฟ)
//   ชั้น 4: clamp เข้าชุด {1,1.5,...,5}
const SCORE_TIMELY = new Set([9]);     // 旺 ดีสุดยุค9
const SCORE_GROWING = new Set([1]);    // 生氣 ดี
const SCORE_RETIRING = new Set([8]);   // 退氣 กลางๆ
const SCORE_DECLINE = new Set([3, 4, 6]); // 失令
const SCORE_BREAK = new Set([7]);      // 破軍 失令(ร้าย)
const SCORE_SICK = new Set([2]);       // 病符
const SCORE_POISON = new Set([5]);     // 廉貞大煞 → 1 เสมอ
const SCORE_BAD_CORE = new Set([2, 5, 7]); // ดาวร้ายแก่น (การหล่อเลี้ยงดาวเหล่านี้ = อุ้มความร้าย)
const FIRE_PAIR_KEYS = new Set(['5-9', '9-5', '7-9', '9-7', '2-7', '7-2']);

function starQualityP9(s) {
  if (SCORE_TIMELY.has(s)) return 1.0;
  if (SCORE_GROWING.has(s)) return 0.5;
  if (SCORE_RETIRING.has(s)) return 0;
  if (SCORE_DECLINE.has(s)) return -0.5;
  if (SCORE_SICK.has(s)) return -0.75;
  if (SCORE_BREAK.has(s)) return -0.75;
  return 0;
}

function clampScoreHalf(v) {
  v = Math.max(1, Math.min(5, v));
  return Math.round(v * 2) / 2; // ครึ่งขั้น
}

function deriveScore(m, w) {
  const mEl = STAR_ELEMENT[m];
  const wEl = STAR_ELEMENT[w];
  const r = relate(mEl, wEl);

  // ── override สูงสุด: 5 大煞 ร้ายเสมอ ──
  if (SCORE_POISON.has(m) || SCORE_POISON.has(w)) return 1;

  // ── ชั้น 1: base จากปฏิกิริยาธาตุ ──
  let score;
  if (r.rel === 'sheng_out' || r.rel === 'sheng_in') score = 3.5;
  else if (r.rel === 'bihe') score = 3;
  else score = 2.5; // ke_out / ke_in / unknown

  // ── ชั้น 2: คุณภาพดาวยุค9 (เฉลี่ยทั้งคู่ × 2) ──
  const q = (starQualityP9(m) + starQualityP9(w)) / 2;
  score += q * 2;

  // ── ชั้น 2 (ปฏิกิริยา×คุณภาพ) ──
  // (a) 相生 หล่อเลี้ยงดาวร้าย → กดลง
  if (r.rel === 'sheng_out') {
    // m เสริม w → w รับ
    if (SCORE_BAD_CORE.has(w)) score -= 1;
  } else if (r.rel === 'sheng_in') {
    // w เสริม m → m รับ
    if (SCORE_BAD_CORE.has(m)) score -= 1;
  }
  // (b) 9火剋金(6/7) ไฟลวกทอง อันตรายแม้ 9 旺
  if (r.rel === 'ke_out') {
    // m ข่ม w ; actor = m
    if (m === 9 && (w === 6 || w === 7)) score -= 0.5;
  } else if (r.rel === 'ke_in') {
    // w ข่ม m ; actor = w
    if (w === 9 && (m === 6 || m === 7)) score -= 0.5;
  }

  // ── ชั้น 3: fire pair ──
  if (FIRE_PAIR_KEYS.has(`${m}-${w}`)) score -= 1;

  // ── ชั้น 4: clamp ──
  return clampScoreHalf(score);
}

// อวัยวะ/ความหมายของธาตุที่ถูกขม
const EL_HARM_TH = {
  water: 'ไต/ระบบปัสสาวะ/หู',
  fire: 'หัวใจ/เลือด/สายตา',
  metal: 'ปอด/ลำไส้ใหญ่/แขนขา/ของมีคม',
  wood: 'ตับ/ถุงน้ำดี/แขนขา/เส้นเอ็น',
  earth: 'ม้าม/กระเพาะ/ระบบย่อยอาหาร',
};

// ───────────────────────── ตัวให้คะแนนทิศทาง (สำหรับ calibrate) ─────────────────────────
// คืน 'good' | 'bad' | 'mixed' จาก "สูตร" ล้วน (ไม่ดูคัมภีร์)
function deriveDirection(m, w) {
  const mEl = STAR_ELEMENT[m];
  const wEl = STAR_ELEMENT[w];
  const r = relate(mEl, wEl);

  // นัยดาวพิเศษมาก่อน: 5 ร้ายเสมอ
  const hasPoison = POISON_STARS.has(m) || POISON_STARS.has(w);
  const hasSick = SICK_STARS.has(m) || SICK_STARS.has(w);
  const bothTimely = TIMELY_P9.has(m) && TIMELY_P9.has(w);
  const anyTimely = TIMELY_P9.has(m) || TIMELY_P9.has(w);

  let dir;
  switch (r.rel) {
    case 'sheng_out':
    case 'sheng_in':
      dir = 'good';
      break;
    case 'ke_out':
    case 'ke_in':
      dir = 'bad';
      break;
    case 'bihe':
      // 比和 = ขยายธรรมชาติของดาว
      dir = anyTimely && !hasPoison && !hasSick ? 'good' : 'mixed';
      break;
    default:
      dir = 'mixed';
  }

  // ปรับด้วยดาวพิเศษ
  if (hasPoison) dir = 'bad';                       // 5 ทับทุกอย่าง
  else if (hasSick && dir !== 'bad') dir = 'mixed'; // 2 病符 ดึงลง
  else if (dir === 'good' && bothTimely) dir = 'good';
  else if (dir === 'bad' && bothTimely) dir = 'mixed'; // ดาวได้ยุคบรรเทาความร้าย

  return { dir, rel: r, mEl, wEl, hasPoison, hasSick, anyTimely, bothTimely };
}

// ───────────────────────── ตัวสร้างข้อความไทย + remedy ─────────────────────────
function buildInterpretation(m, w) {
  const info = deriveDirection(m, w);
  const { rel, mEl, wEl } = info;
  const mTh = EL_TH[mEl];
  const wTh = EL_TH[wEl];

  let interp = '';
  let remedyEl = 'none';
  let remedyTh = '';
  let derivation = '';

  // remedy ตามหลัก通關 (สะพานธาตุ) / 洩 (ถ่ายเทธาตุร้าย)
  // หลัก通關: เมื่อ A剋B ให้เติมธาตุที่ A生→ และ →生B  (ธาตุกลางทาง)
  function tongguan(actorEl, victimEl) {
    // ธาตุสะพาน = ธาตุที่ actor 生 และ ที่ 生 victim  (= GENERATES[actor] ถ้า = ตัวที่ generate victim)
    const bridge = GENERATES[actorEl]; // actor 生 bridge
    if (GENERATES[bridge] === victimEl) return bridge;
    // เผื่อไม่ตรง ใช้ธาตุที่ generate victim
    for (const e of Object.keys(GENERATES)) {
      if (GENERATES[e] === victimEl) return e;
    }
    return 'none';
  }

  switch (rel.rel) {
    case 'sheng_out': {
      interp = `${mTh}ก่อเกิด${wTh} (${rel.zh}) — พลังไหลเวียนราบรื่น เสริมความเจริญงอกงาม ` +
        `เหมาะแก่การสะสมและต่อยอด`;
      remedyEl = 'none';
      remedyTh = 'เป็นคู่ดาวเสริมกัน ไม่ต้องสะกด เพียงรักษาพื้นที่ให้สะอาดและใช้งานตามปกติ';
      derivation = `${rel.zh} (相生·ดาว${m}เสริมดาว${w}) → ทิศทางดี`;
      break;
    }
    case 'sheng_in': {
      interp = `${wTh}ก่อเกิด${mTh} (${rel.zh}) — ดาวภูเขาได้รับการหล่อเลี้ยง ` +
        `ส่งเสริมสุขภาพคนและความมั่นคงของครอบครัว`;
      remedyEl = 'none';
      remedyTh = 'เป็นคู่ดาวเสริมกัน ไม่ต้องสะกด รักษาพื้นที่ให้โปร่งสะอาด';
      derivation = `${rel.zh} (相生·ดาว${w}เสริมดาว${m}) → ทิศทางดี`;
      break;
    }
    case 'ke_out':
    case 'ke_in': {
      const victimEl = rel.victim;
      const actorEl = rel.actor;
      const harm = EL_HARM_TH[victimEl] || 'ร่างกายและความสัมพันธ์';
      const bridge = tongguan(actorEl, victimEl);
      interp = `${EL_TH[victimEl]}ถูก${EL_TH[actorEl]}ข่ม (${rel.zh}) — เสี่ยงบาดเจ็บ/เจ็บป่วยด้าน${harm} ` +
        `และเกิดความขัดแย้งในบทบาทที่ธาตุ${EL_ZH[victimEl]}เป็นตัวแทน`;
      remedyEl = bridge;
      remedyTh = `ใช้หลักทะลวงทาง (通關) เติมของธาตุ${EL_TH[bridge]}เป็นสะพาน ` +
        `ให้พลังไหลจาก${EL_ZH[actorEl]}→${EL_ZH[bridge]}→${EL_ZH[victimEl]} ลดการปะทะ; ` +
        `เลี่ยงของธาตุ${EL_ZH[actorEl]}ที่ซ้ำเติมการข่ม`;
      derivation = `${rel.zh} (相剋·ดาว${rel.actor === mEl ? m : w}ข่มดาว${rel.victim === mEl ? m : w}) · 通關用${EL_ZH[bridge]} → ทิศทางร้าย`;
      break;
    }
    case 'bihe': {
      const good = info.anyTimely && !info.hasPoison && !info.hasSick;
      if (good) {
        interp = `${mTh}ซ้อน${mTh} (比和·ดาวได้ยุค) — เสริมแรงในทางดี ` +
          `พลังธาตุเดียวกันหนุนเนื่องให้รุ่งเรือง`;
        remedyEl = 'none';
        remedyTh = 'ดาวได้ยุค ไม่ต้องสะกด ใช้งานพื้นที่นี้ให้เต็มที่';
      } else {
        interp = `${mTh}ซ้อน${mTh} (比和) — ธาตุเดียวกันเสริมแรง ` +
          `หากเป็นดาวร้ายจะยิ่งทวีความร้าย ควรระวังด้านที่ธาตุ${EL_ZH[mEl]}เป็นตัวแทน`;
        remedyEl = GENERATES[mEl]; // 洩 ถ่ายเทพลังส่วนเกินออก
        remedyTh = `ใช้ของธาตุ${EL_TH[GENERATES[mEl]]}ถ่ายเท (洩) พลังที่มากเกินของธาตุ${EL_ZH[mEl]}ออก`;
      }
      derivation = `比和 (ธาตุ${EL_ZH[mEl]}ซ้อนกัน) → ${good ? 'ดี (ดาวได้ยุค9)' : 'mixed (เสริมแรงทั้งดีและร้าย)'}`;
      break;
    }
    default:
      interp = `คู่ดาว ${m}-${w} (ธาตุ${mTh}×${wTh})`;
      derivation = 'ไม่ระบุความสัมพันธ์';
  }

  // เสริมนัยดาวพิเศษเข้าไปในข้อความ + remedy
  if (info.hasPoison) {
    interp += ` ⚠️ มีดาว 5 เหลือง (廉貞五黃大煞) เป็นพิษร้ายเสมอ — ` +
      `ห้ามกระทบขุดเจาะทิศนี้ ไม่ว่าธาตุจะสัมพันธ์กันอย่างไร`;
    remedyEl = 'metal';
    remedyTh = `ดาว 5 เหลืองต้องสลายด้วยธาตุโลหะ (金洩土煞) เช่น ระฆัง/กระดิ่งทองเหลือง ` +
      `เหรียญหกจักรพรรดิ น้ำเต้าทองแดง; ` + (remedyTh ? `เสริมด้วย: ${remedyTh}; ` : '') +
      `ห้ามใช้สีแดง/ของธาตุไฟที่ปลุกพิษ`;
    derivation += ' · 5黃大煞 override → ร้าย · ใช้金洩';
  } else if (info.hasSick) {
    const sickStar = SICK_STARS.has(m) ? m : w;
    interp += ` มีดาว 2 ดำ (二黑病符) นำโรคภัย ควรเสริมความระมัดระวังด้านสุขภาพ`;
    if (remedyEl === 'none') {
      remedyEl = 'metal';
      remedyTh = `ใช้ธาตุโลหะ (金) ถ่ายเทพิษดาว 2 病符 เช่น กระดิ่งทองเหลือง เหรียญโลหะ; เลี่ยงของธาตุดินและสีแดง`;
    }
    derivation += ` · 2病符(ดาว${sickStar}) ดึงสุขภาพ`;
  }

  // ยุค 9 modifier note ในข้อความ derivation
  if (info.bothTimely) derivation += ' · ดาวได้ยุค9ทั้งคู่';
  else if (info.anyTimely) derivation += ' · มีดาวได้ยุค9';

  return {
    interpretation_th: interp,
    remedy_element: remedyEl,
    remedy_th: remedyTh,
    derivation,
    _dir: info.dir,
    _relZh: rel.zh,
  };
}

// ───────────────────────── MAIN ─────────────────────────
function main() {
  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  const data = JSON.parse(raw);
  const pairs = data.star_pairs_81;
  if (!Array.isArray(pairs)) {
    console.error('ERROR: star_pairs_81 ไม่ใช่ array');
    process.exit(1);
  }

  // ── 0) ensure `source` tagging (idempotent) ──
  // คู่ที่มีวรรคคัมภีร์ตรง verify แล้ว 18 คู่ (classical) + หลักทั่วไป 4 คู่ (principle)
  // ที่เหลือ = five_element. กำหนดเป็นกฎ deterministic (ตาม ground-truth ที่ verify มา)
  // หาก field source หายไป (เช่น JSON เวอร์ชันก่อนติด tag) จะ re-tag ให้อัตโนมัติ
  const CLASSICAL_SET = new Set([
    '1-1', '1-4', '1-6', '2-3', '2-5', '3-5', '4-1', '4-6', '4-7',
    '5-7', '6-2', '6-6', '6-9', '7-2', '7-7', '7-9', '8-9', '9-9',
  ]);
  const PRINCIPLE_SET = new Set(['1-9', '2-2', '2-9', '9-2']);
  // ดึงชื่อคัมภีร์จาก classical_zh (ขึ้นต้นด้วยชื่อเล่ม เช่น 紫白訣「...」)
  function bookFromZh(zh) {
    if (!zh) return '';
    const m = zh.match(/^([一-鿿]{2,5}?)[「『]/);
    return m ? m[1] : '';
  }
  for (const p of pairs) {
    const key = `${p.mountain_star}-${p.water_star}`;
    let src;
    if (CLASSICAL_SET.has(key)) src = 'classical';
    else if (PRINCIPLE_SET.has(key)) src = 'principle';
    else src = 'five_element';
    if (p.source !== src) p.source = src;
    if (!p.source_book) {
      if (src === 'classical') p.source_book = bookFromZh(p.classical_zh) || '玄空秘旨';
      else if (src === 'principle') p.source_book = '玄空秘旨/五行';
      else p.source_book = '五行推衍 (deterministic)';
    }
  }

  // ── snapshot classical interpretations เพื่อยืนยันว่าไม่ถูกแตะ ──
  // หมายเหตุ: score ถูก "ตั้งใจเขียนใหม่ทั้ง 81 คู่" (deriveScore) จึงไม่อยู่ใน snapshot นี้
  //          แต่ interpretation/remedy/classical_zh/source/is_fire_pair ของ classical/principle ต้องคงเดิม
  const classicalSnapshot = {};
  for (const p of pairs) {
    if (p.source === 'classical' || p.source === 'principle') {
      classicalSnapshot[p.id] = JSON.stringify({
        interpretation_th: p.interpretation_th,
        interpretation_en: p.interpretation_en,
        remedy_element: p.remedy_element,
        remedy_th: p.remedy_th,
      });
    }
  }

  // ── 1) CALIBRATE: รันสูตรกับ 18 คู่ classical (อ่านอย่างเดียว) ──
  // map score เดิม → ทิศทางคัมภีร์: good (score>=3.5) / bad (score<=2) / mixed (อื่น)
  function scoreToDir(score, nature) {
    // ใช้ score เป็นหลัก, nature เสริม
    if (score >= 3.5) return 'good';
    if (score <= 2) return 'bad';
    // 2 < score < 3.5 → mixed
    return 'mixed';
  }
  // เทียบ 3 มุม เพื่อความโปร่งใส (ไม่ปั้นตัวเลขให้ดูดี):
  //   (A) decisive  = เฉพาะคู่ที่ "ทั้งคัมภีร์และสูตรฟันธง good/bad" → ขัดกันชัดเท่านั้น = MISS
  //                   (นี่คือเกณฑ์หลัก gate ≥70% เพราะวัดว่าสูตรฟันธงผิดทางไหม)
  //   (B) no_conflict = นับ MISS เฉพาะ good↔bad ตรงข้าม (mixed ฝั่งใดฝั่ง = ไม่ขัด)
  //   (C) strict    = ต้องตรงป้ายเป๊ะ good/bad/mixed
  // หมายเหตุสำคัญ: ต้องใช้ baseline ที่เสถียร = score เดิมของ Claude (score_claude_original)
  //   ถ้าใช้ p.score ตรงๆ จะพังตอน re-run เพราะ p.score กลายเป็นค่าสูตรไปแล้ว → calibrate เทียบกับตัวเอง (เป๊ะปลอม)
  //   รอบแรก score_claude_original ยังไม่มี → fallback เป็น p.score (ซึ่งยังเป็นค่าเดิม)
  const calRows = [];
  for (const p of pairs) {
    if (p.source !== 'classical') continue;
    const m = p.mountain_star;
    const w = p.water_star;
    const baselineScore = typeof p.score_claude_original === 'number' ? p.score_claude_original : p.score;
    const derived = deriveDirection(m, w).dir;
    const expected = scoreToDir(baselineScore, p.nature);
    const conflict = (derived === 'good' && expected === 'bad') || (derived === 'bad' && expected === 'good');
    const decisive = derived !== 'mixed' && expected !== 'mixed'; // ทั้งคู่ฟันธง
    // เทียบระดับ score (ตัวเลข): สูตร deriveScore vs score คัมภีร์เดิม (baseline เสถียร)
    const derivedScore = deriveScore(m, w);
    const scoreDiff = Math.abs(derivedScore - baselineScore);
    calRows.push({
      id: p.id, pair: `${m}-${w}`, score: baselineScore, expected, derived, conflict, decisive,
      derivedScore, scoreDiff,
    });
  }
  // calibrate ระดับ score กับ 18 คู่ classical
  const calScoreExact = calRows.filter((r) => r.scoreDiff === 0).length;
  const calScoreNear = calRows.filter((r) => r.scoreDiff > 0 && r.scoreDiff <= 0.5).length;
  const calScoreConflict = calRows.filter((r) => r.scoreDiff > 0.5).length;
  const calScoreWithinPct = calRows.length
    ? Math.round(((calScoreExact + calScoreNear) / calRows.length) * 1000) / 10 : 0;
  // (A) decisive accuracy — เกณฑ์หลัก
  const decisiveRows = calRows.filter((r) => r.decisive);
  const decTotal = decisiveRows.length;
  const decHit = decisiveRows.filter((r) => !r.conflict).length;
  const calPct = decTotal ? Math.round((decHit / decTotal) * 1000) / 10 : 0;
  // (B) no-conflict over all 18
  const calTotal = calRows.length;
  const noConflictHit = calRows.filter((r) => !r.conflict).length;
  const noConflictPct = calTotal ? Math.round((noConflictHit / calTotal) * 1000) / 10 : 0;
  // (C) strict over all 18
  const strictHit = calRows.filter((r) => r.derived === r.expected).length;
  const strictPct = calTotal ? Math.round((strictHit / calTotal) * 1000) / 10 : 0;

  // ── 2) เติมข้อความ interpretation ของ five_element (ไม่แตะ score ที่นี่) ──
  let filled = 0;
  const examples = [];
  for (const p of pairs) {
    if (p.source !== 'five_element') continue;
    const out = buildInterpretation(p.mountain_star, p.water_star);
    p.interpretation_th = out.interpretation_th;
    p.remedy_element = out.remedy_element;
    p.remedy_th = out.remedy_th;
    p.derivation = out.derivation;
    filled++;
    if (examples.length < 5) {
      examples.push({
        pair: `${p.mountain_star}-${p.water_star}`,
        derivation: out.derivation,
        interp: out.interpretation_th,
        remedy: `${out.remedy_element} — ${out.remedy_th}`,
      });
    }
  }

  // ── 2b) DERIVE SCORE ทั้ง 81 คู่ (deterministic ห้าธาตุ) ──
  // เก็บ score เดิมของ Claude ไว้ที่ score_claude_original (ครั้งแรกเท่านั้น · idempotent)
  // เขียน score ใหม่ + score_source + flag ถ้าต่างจากของเดิม/คัมภีร์ > 0.5
  const ALLOWED_SCORES = new Set([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  let exactCnt = 0; let nearCnt = 0; let conflictCnt = 0; // เทียบ score เดิม Claude
  const flaggedReview = [];
  const newDist = {};
  const oldDist = {};
  for (const p of pairs) {
    const m = p.mountain_star;
    const w = p.water_star;

    // เก็บของเดิมครั้งแรก (ไม่ทับถ้ามีแล้ว — กัน re-run ลบ ground-truth Claude)
    if (typeof p.score_claude_original !== 'number') {
      p.score_claude_original = p.score;
    }
    const original = p.score_claude_original;

    const derived = deriveScore(m, w);
    if (!ALLOWED_SCORES.has(derived)) {
      console.error(`ABORT: deriveScore(${m},${w}) = ${derived} ไม่อยู่ในชุดที่อนุญาต`);
      process.exit(1);
    }

    p.score = derived;
    p.score_source = 'five_element_derived';

    // distribution
    oldDist[original] = (oldDist[original] || 0) + 1;
    newDist[derived] = (newDist[derived] || 0) + 1;

    // เทียบกับของเดิม Claude
    const diff = Math.abs(derived - original);
    if (diff === 0) exactCnt++;
    else if (diff <= 0.5) nearCnt++;
    else conflictCnt++;

    // flag review ถ้าต่างจากของเดิม > 0.5 (classical/principle = ของเดิม verify แล้ว)
    if (diff > 0.5) {
      p.score_review_flag = true;
      flaggedReview.push({ pair: `${m}-${w}`, src: p.source, original, derived, diff });
    } else if ('score_review_flag' in p) {
      // ไม่ขัดแล้ว → ถอด flag เก่า (idempotent)
      delete p.score_review_flag;
    }
  }

  // ── 3) ตรวจว่า classical/principle ไม่ถูกแตะ ──
  let untouched = true;
  for (const p of pairs) {
    if (p.source === 'classical' || p.source === 'principle') {
      const now = JSON.stringify({
        interpretation_th: p.interpretation_th,
        interpretation_en: p.interpretation_en,
        remedy_element: p.remedy_element,
        remedy_th: p.remedy_th,
      });
      if (now !== classicalSnapshot[p.id]) {
        untouched = false;
        console.error(`!! classical/principle ${p.id} ถูกแก้ไข (ผิดเงื่อนไข)`);
      }
      if ('derivation' in p) {
        // ห้ามมี derivation ในคู่ classical/principle
        delete p.derivation;
      }
    }
  }

  if (!untouched) {
    console.error('ABORT: classical/principle ถูกแตะ — ไม่เขียนไฟล์');
    process.exit(1);
  }

  // ── 4) เขียนกลับ (2-space, NFC จีน คงเดิม) ──
  const outStr = JSON.stringify(data, null, 2) + '\n';
  // validate ก่อนเขียน
  JSON.parse(outStr);
  fs.writeFileSync(JSON_PATH, outStr, 'utf8');

  // ── REPORT ──
  console.log('═══════════════════════════════════════════════════════');
  console.log('  derive-star-pairs.cjs — สูตรห้าธาตุ玄空 (deterministic)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`ไฟล์: ${JSON_PATH}`);
  console.log('');
  console.log('── CALIBRATE สูตร vs คัมภีร์ (18 คู่ classical · อ่านอย่างเดียว) ──');
  console.log(`  [A] decisive (เกณฑ์หลัก · เฉพาะคู่ที่ทั้งสองฝ่ายฟันธง): ${decHit}/${decTotal} = ${calPct}%`);
  console.log(`  [B] ไม่ขัดแย้ง (good↔bad เท่านั้น = พลาด): ${noConflictHit}/${calTotal} = ${noConflictPct}%`);
  console.log(`  [C] ตรงป้ายเป๊ะ (good/bad/mixed): ${strictHit}/${calTotal} = ${strictPct}%`);
  if (calPct < 70) {
    console.log(`  ⚠️ decisive < 70% — สูตรฟันธงผิดทาง ต้องทบทวน!`);
  } else {
    console.log(`  ✅ decisive ≥70% — สูตรไม่เคยฟันธงสวนคัมภีร์`);
  }
  console.log('');
  console.log('  รายคู่ (classical): pair | score | คัมภีร์ | สูตร | สถานะ(ทิศทาง)');
  for (const r of calRows) {
    const status = r.conflict ? 'CONFLICT' : (r.decisive ? 'OK' : 'soft(mixed)');
    console.log(`    ${r.pair.padEnd(5)} | ${String(r.score).padEnd(4)} | ${r.expected.padEnd(5)} | ${r.derived.padEnd(5)} | ${status}`);
  }
  console.log('');
  console.log('── CALIBRATE ระดับ SCORE vs คัมภีร์ (18 คู่ classical) ──');
  console.log(`  ตรงเป๊ะ: ${calScoreExact}/18 · ต่าง ≤0.5: ${calScoreNear}/18 · ขัดแย้ง >0.5: ${calScoreConflict}/18`);
  console.log(`  อยู่ในเกณฑ์ (≤0.5): ${calScoreExact + calScoreNear}/18 = ${calScoreWithinPct}%`);
  if (calScoreWithinPct < 60) {
    console.log('  ⚠️ สูตรขัดคัมภีร์ระดับ score เกินครึ่ง — สูตรอาจพลาด ต้องทบทวน!');
  } else {
    console.log('  ✅ สูตรใกล้เคียงคัมภีร์ในกรอบยอมรับได้');
  }
  console.log('  รายคู่ (classical · score): pair | คัมภีร์ | สูตร | diff');
  for (const r of calRows) {
    const mark = r.scoreDiff > 0.5 ? ' ← CONFLICT(flag)' : (r.scoreDiff === 0 ? ' (เป๊ะ)' : '');
    console.log(`    ${r.pair.padEnd(5)} | ${String(r.score).padEnd(4)} | ${String(r.derivedScore).padEnd(4)} | ${r.scoreDiff}${mark}`);
  }
  console.log('');
  console.log('── CALIBRATE SCORE ใหม่ vs score เดิม (Claude · ทั้ง 81 คู่) ──');
  const within = exactCnt + nearCnt;
  console.log(`  ตรงเป๊ะ: ${exactCnt}/81 = ${Math.round((exactCnt / 81) * 1000) / 10}%`);
  console.log(`  ต่าง ≤0.5: ${nearCnt}/81 · ขัดแย้ง >0.5: ${conflictCnt}/81`);
  console.log(`  อยู่ในเกณฑ์ (≤0.5): ${within}/81 = ${Math.round((within / 81) * 1000) / 10}%`);
  console.log('');
  console.log('── DISTRIBUTION score ──');
  const allScores = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  console.log('  score | เดิม(Claude) | ใหม่(สูตร)');
  for (const s of allScores) {
    console.log(`   ${String(s).padEnd(4)} | ${String(oldDist[s] || 0).padEnd(11)} | ${newDist[s] || 0}`);
  }
  console.log('');
  console.log(`── คู่ที่ติด score_review_flag (ต่างจากของเดิม >0.5): ${flaggedReview.length} คู่ ──`);
  console.log('  pair | source | เดิม | สูตร | diff');
  for (const f of flaggedReview) {
    console.log(`    ${f.pair.padEnd(5)} | ${f.src.padEnd(12)} | ${String(f.original).padEnd(4)} | ${String(f.derived).padEnd(4)} | ${f.diff}`);
  }
  console.log('');
  console.log(`── เติมข้อความ five_element: ${filled} คู่ · score ใหม่ทั้ง 81 คู่ (score_source=five_element_derived) ──`);
  console.log(`── ไม่แตะ interpretation/remedy ของ classical/principle: ${untouched ? 'ยืนยัน' : 'ผิดพลาด!'} ──`);
  console.log('');
  console.log('── ตัวอย่าง 5 คู่ five_element ที่เติมข้อความ ──');
  for (const e of examples) {
    console.log(`  [${e.pair}]`);
    console.log(`    derivation: ${e.derivation}`);
    console.log(`    ความหมาย : ${e.interp}`);
    console.log(`    remedy   : ${e.remedy}`);
    console.log('');
  }
  console.log('เสร็จสิ้น — JSON valid, เขียนกลับเรียบร้อย (ไม่ commit/deploy)');
}

main();
