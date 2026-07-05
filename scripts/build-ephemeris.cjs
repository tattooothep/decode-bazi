#!/usr/bin/env node
/**
 * Ephemeris Cache Builder · Node.js + tyme4ts (อาเจ๊กฮ้ง architecture · 16 พ.ค.)
 *
 * Usage:
 *   node scripts/build-ephemeris.cjs --days 7 --from 2026-05-16
 *
 * Pre-computes 12 shichen × N days into aj_ephemeris_cache.
 * - pillars จาก tyme4ts (single source of truth)
 * - 8 universal modules (ze_ri = real ตำราอาเจ๊ก, 7 อื่น stub พร้อมขยายภายหลัง)
 */

const { Client } = require('pg');
const tyme = require('tyme4ts');

// ─── Args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) argMap[args[i].slice(2)] = args[i+1];
}
const DAYS = parseInt(argMap.days || '7', 10);
const FROM = argMap.from || new Date().toISOString().slice(0, 10);
const DRY = !!argMap['dry-run'];

console.log(`📦 Build ephemeris · ${DAYS} วัน × 12 ยาม = ${DAYS*12} slots · เริ่ม ${FROM}${DRY?' (DRY-RUN)':''}`);

// ─── Constants ──────────────────────────────────────────────────────
const CLASH = {子:'午',丑:'未',寅:'申',卯:'酉',辰:'戌',巳:'亥',午:'子',未:'丑',申:'寅',酉:'卯',戌:'辰',亥:'巳'};
const SANHE = [['申','子','辰'],['寅','午','戌'],['巳','酉','丑'],['亥','卯','未']];
const TIAN_DE_MONTH = {寅:'丁',卯:'申',辰:'壬',巳:'辛',午:'亥',未:'甲',申:'癸',酉:'寅',戌:'丙',亥:'乙',子:'巳',丑:'庚'};
const YUE_DE_MONTH  = {寅:'丙',卯:'甲',辰:'壬',巳:'庚',午:'丙',未:'甲',申:'壬',酉:'庚',戌:'丙',亥:'甲',子:'壬',丑:'庚'};
const SHICHEN_HOUR = [23,1,3,5,7,9,11,13,15,17,19,21]; // index 0=子=23-01

// ─── Helper · build module result ───────────────────────────────────
function buildResult(key, score, pass, tags, up, down, conf=0.8, raw={}) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return {
    module: key, status: 'ready',
    score: { raw: s, normalized: s, weight: 1.0 },
    pass: pass !== undefined ? pass : (s >= 50),
    tags, reasons: { up, down, warning: [] },
    confidence: conf, raw,
  };
}

// ─── 12 建除 (jian-chu) · cycle เริ่มที่ branch ของเดือน ─────────────
// 建除滿平定執破危成收開閉 · 12 ตัว rotate ตาม day branch จาก month branch
const JIAN_CHU = ['建','除','滿','平','定','執','破','危','成','收','開','閉'];
const JIAN_CHU_GOOD = {建:60,除:65,滿:75,平:60,定:80,執:55,破:25,危:40,成:85,收:75,開:80,閉:35};
const BRANCHES_ORDER = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
function twelveOfficersCompute(p) {
  const mb = BRANCHES_ORDER.indexOf(p.month.branch);
  const db = BRANCHES_ORDER.indexOf(p.day.branch);
  const idx = (db - mb + 12) % 12;
  const officer = JIAN_CHU[idx];
  const score = JIAN_CHU_GOOD[officer] || 50;
  const isGood = score >= 60;
  return buildResult('twelve_officers', score, score >= 40,
    [`officer_${officer}`],
    isGood ? [{code:'OFFICER_GOOD', thai:`✓ ${officer}日 (12建除)`, delta: score-50}] : [],
    !isGood && score < 40 ? [{code:'OFFICER_BAD', thai:`⚠ ${officer}日 (12建除)`, delta: score-50}] : [],
    0.85, { officer });
}

// ─── 28 宿 (constellations) · rotate ตาม day branch (28-day cycle) ──
const STARS_28 = ['角','亢','氐','房','心','尾','箕','斗','牛','女','虛','危','室','壁','奎','婁','胃','昴','畢','觜','參','井','鬼','柳','星','張','翼','軫'];
const STAR_28_NATURE = {角:75,亢:35,氐:60,房:80,心:70,尾:75,箕:65,斗:80,牛:55,女:35,虛:30,危:35,室:80,壁:75,奎:55,婁:70,胃:75,昴:30,畢:80,觜:35,參:75,井:75,鬼:25,柳:35,星:55,張:75,翼:55,軫:75};
function twentyEightCompute(p, dayIdx) {
  const sIdx = ((dayIdx % 28) + 28) % 28;
  const star = STARS_28[sIdx];
  const score = STAR_28_NATURE[star] || 50;
  return buildResult('twenty_eight', score, score >= 40,
    [`xiu_${star}`],
    score >= 60 ? [{code:'XIU_GOOD', thai:`⭐ ${star}宿 (28宿)`, delta: score-50}] : [],
    score < 40 ? [{code:'XIU_BAD', thai:`⚠ ${star}宿 (28宿)`, delta: score-50}] : [],
    0.8, { star });
}

// ─── 12 神煞 (shensha · day spirits) · rotate ตาม day branch ────────
const SPIRITS_12 = ['青龍','明堂','天刑','朱雀','金匱','天德','白虎','玉堂','天牢','玄武','司命','勾陳'];
const SPIRIT_NATURE = {青龍:85,明堂:80,金匱:75,天德:85,玉堂:80,司命:70,天刑:30,朱雀:35,白虎:25,天牢:30,玄武:30,勾陳:40};
function twelveSpiritsCompute(p) {
  const idx = BRANCHES_ORDER.indexOf(p.day.branch);
  const spirit = SPIRITS_12[idx % 12];
  const score = SPIRIT_NATURE[spirit] || 50;
  return buildResult('twelve_spirits', score, score >= 40,
    [`spirit_${spirit}`],
    score >= 60 ? [{code:'SPIRIT_GOOD', thai:`✨ ${spirit} (12神煞)`, delta: score-50}] : [],
    score < 40 ? [{code:'SPIRIT_BAD', thai:`⚠ ${spirit} (12神煞)`, delta: score-50}] : [],
    0.8, { spirit });
}

// ─── 9 飛星 (he_luo) · current period 9 (2024-2043) center=9 ────────
// 1白 2黑 3碧 4綠 5黃 6白 7赤 8白 9紫 · ค่ามงคล: 1+ 6+ 8+ 9+ (white/purple) · 2- 5- 7- (black/yellow)
const NINE_STAR_NATURE = {1:80,2:25,3:55,4:65,5:20,6:75,7:35,8:85,9:80};
function nineStarsCompute(p) {
  // simplified: ใช้ day branch index → flying star
  const idx = BRANCHES_ORDER.indexOf(p.day.branch);
  const star = ((idx % 9) + 9) % 9 + 1; // 1-9
  const score = NINE_STAR_NATURE[star] || 50;
  return buildResult('nine_stars', score, score >= 40,
    [`flystar_${star}`],
    score >= 60 ? [{code:'STAR_GOOD', thai:`🌟 ${star}白 (飛星)`, delta: score-50}] : [],
    score < 40 ? [{code:'STAR_BAD', thai:`⚠ ${star}星 (飛星)`, delta: score-50}] : [],
    0.75, { star });
}

// ─── 太歲 (tai_sui) · ปะทะกับปีเกิด · ของเรา general ใช้แค่ year clash
function taiSuiCompute(p) {
  // ถ้า day หรือ hour ปะทะปี (沖) → score ลด
  const yb = p.year.branch;
  const dbClash = CLASH[p.day.branch] === yb;
  const hbClash = CLASH[p.hour.branch] === yb;
  let score = 75;
  const tags = []; const up = []; const down = [];
  if (dbClash) { score -= 30; tags.push('taisui_clash_day'); down.push({code:'TS_DAY', thai:'⚠ 太歲沖日', delta:-30}); }
  if (hbClash) { score -= 20; tags.push('taisui_clash_hour'); down.push({code:'TS_HOUR', thai:'⚠ 太歲沖時', delta:-20}); }
  if (!dbClash && !hbClash) { tags.push('taisui_safe'); up.push({code:'TS_SAFE', thai:'✓ 太歲ปลอดภัย', delta:0}); }
  return buildResult('tai_sui', score, score >= 40, tags, up, down, 0.9, { year_branch: yb });
}

// ─── 奇門 (qi_men) · เรียก qimen-api ของเรา · 5 ก.ค. 2026 rebuild fix ──────
// เปลี่ยนแปลงจากเวอร์ชัน 16 พ.ค.:
//  1. คำนวณที่ "กลางยาม" (ต้นยาม+1ชม.) — engine ใช้真太陽時 กทม. (-18 นาที)
//     ยิงต้นยามตกยามก่อนหน้าทุกช่อง (พิสูจน์ 48/48) · กลางยามถูก 48/48
//  2. เก็บครบ 9 วัง (raw.palaces) + headline = 值使宮 จริง (direction ตามวังนั้น)
//  3. retry 429/network 4 ครั้ง exponential (200/400/800/1600ms)
//     fail-hard → status:'error' · **ห้าม fallback ทิศเหนือปลอม**
const QIMEN_API = process.env.QIMEN_API_URL || 'http://localhost:4090';
const DOOR_SCORE = {開門:80,休門:75,生門:85,景門:65,死門:25,驚門:30,傷門:35,杜門:40};
const STAR_SCORE = {天蓬:30,天任:65,天沖:50,天輔:85,天英:55,天芮:30,天柱:45,天心:80,天禽:75};
// ทิศประจำวัง (洛書 ตายตัว · ไม่ใช่ heuristic): 坎1=N … 離9=S
const PALACE_DIR = {1:'N',2:'SW',3:'E',4:'SE',5:'C',6:'NW',7:'W',8:'NE',9:'S'};
const PALACE_ZH = {1:'坎一宮',2:'坤二宮',3:'震三宮',4:'巽四宮',5:'中五宮',6:'乾六宮',7:'兌七宮',8:'艮八宮',9:'離九宮'};
let QIMEN_ERROR_COUNT = 0;
function qiMenErrorResult(message) {
  QIMEN_ERROR_COUNT++;
  return {
    module: 'qi_men', status: 'error',
    score: { raw: 50, normalized: 50, weight: 1.0 }, // กลางๆ ไม่ถ่วง universal · route กรอง status=error ออกเอง
    pass: false,
    tags: ['qimen_error'],
    reasons: { up: [], down: [], warning: [{ code: 'QM_ERROR', thai: '⚠ 奇門 engine ล้มเหลว (ไม่ใช้คะแนน)', delta: 0 }] },
    confidence: 0,
    raw: { fallback: false, error: message },
  };
}
async function qiMenCompute(p, isoDatetime) {
  let j = null;
  let lastErr = 'no response';
  // Retry 4 ครั้ง exponential 200/400/800/1600ms (429/network/5xx)
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise(s => setTimeout(s, 100 * (2 ** attempt))); // 200/400/800/1600
    try {
      const r = await fetch(`${QIMEN_API}/api/qimen/calculate`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ datetime: isoDatetime, longitude: 100.5018, latitude: 13.7563, profile_id: 1 }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) { lastErr = 'http ' + r.status; continue; }
      j = await r.json();
      break;
    } catch (e) { lastErr = e.message; }
  }
  if (!j) return qiMenErrorResult(lastErr);
  const c = j.data?.chart;
  const apiPalaces = j.data?.palaces || [];
  const zsPalaceId = c?.zhi_shi_palace_id;
  if (!c || apiPalaces.length < 9 || !zsPalaceId) {
    return qiMenErrorResult(`chart incomplete (palaces=${apiPalaces.length} zhi_shi=${zsPalaceId || 'null'})`);
  }
  // เก็บครบ 9 วัง — route /api/auspicious อ่าน raw.palaces[].direction/door/star/deity ตามทิศเป้าหมาย
  const palaces9 = apiPalaces
    .slice().sort((a, b) => (a.palace_id || 0) - (b.palace_id || 0))
    .map(pa => ({
      palace_id: pa.palace_id,
      palace_zh: PALACE_ZH[pa.palace_id] || null,
      direction: pa.direction || PALACE_DIR[pa.palace_id] || null,
      door: pa.door_zh || null,   door_code: pa.door_code || null,
      star: pa.star_zh || null,   star_code: pa.star_code || null,
      deity: pa.deity_zh || null, deity_code: pa.deity_code || null,
    }));
  const zs = palaces9.find(po => po.palace_id === zsPalaceId);
  if (!zs) return qiMenErrorResult(`zhi_shi palace ${zsPalaceId} not in palaces`);
  const { door, star, deity, direction } = zs;
  const doorSc = door && DOOR_SCORE[door] !== undefined ? DOOR_SCORE[door] : 50;
  const starSc = star && STAR_SCORE[star] !== undefined ? STAR_SCORE[star] : 50;
  const score = Math.round((doorSc + starSc) / 2);
  const tags = []; const up = []; const down = [];
  // **16 พ.ค. fix (คงไว้): bad door (死門 ฯลฯ) → pass=false · จะถูกกรองออก**
  const isBadDoor = !!(door && doorSc <= 35); // 死/驚/傷/杜
  if (door) { tags.push(`door_${door}`); (doorSc >= 60 ? up : down).push({code:'QM_DOOR', thai:`🚪 ${door} (奇門)`, delta: doorSc-50}); }
  if (star) { tags.push(`star_${star}`); (starSc >= 60 ? up : down).push({code:'QM_STAR', thai:`⭐ ${star} (奇門星)`, delta: starSc-50}); }
  if (deity) tags.push(`deity_${deity}`);
  const raw = {
    // backward compat — route เดิมอ่าน raw.door/star/deity/direction/palace_id
    door, star, deity, direction,
    ju_number: c.ju_number,
    palace_id: zsPalaceId,
    palace_zh: PALACE_ZH[zsPalaceId] || c.zhi_shi_palace_zh || null,
    bad_door: isBadDoor,
    fallback: false,
    // ใหม่ 5 ก.ค. 2026
    headline: { role: 'zhi_shi', palace_id: zsPalaceId, palace_zh: PALACE_ZH[zsPalaceId] || null, direction, door, star, deity },
    palaces: palaces9,
    engine_hour_pillar: c.pillars?.hour?.zh || null, // ไว้ตรวจว่ายามตรงกับ tyme
    computed_from: isoDatetime,                       // กลางยาม
  };
  // 16 พ.ค. fix (คงไว้): pass=false ถ้า bad door · จะถูกกรองออกใน /api/auspicious SQL
  const pass = !isBadDoor && score >= 40;
  return buildResult('qi_men', score, pass, tags, up, down, 0.9, raw);
}

// ─── 河洛 (he_luo) · 17 พ.ค. v2 · เพิ่ม Pattern recognition (二財一旺 ฯลฯ) ──
const STEM_ELEMENT = {甲:'wood',乙:'wood',丙:'fire',丁:'fire',戊:'earth',己:'earth',庚:'metal',辛:'metal',壬:'water',癸:'water'};
const BR_EL_HE = {子:'water',丑:'earth',寅:'wood',卯:'wood',辰:'earth',巳:'fire',午:'fire',未:'earth',申:'metal',酉:'metal',戌:'earth',亥:'water'};
const PROD_HE = {wood:'fire',fire:'earth',earth:'metal',metal:'water',water:'wood'};
const CTRL_HE = {wood:'earth',earth:'water',water:'fire',fire:'metal',metal:'wood'};
function relToDM(dmEl, tgEl) {
  if (!dmEl || !tgEl) return null;
  if (dmEl === tgEl) return '旺';
  if (PROD_HE[dmEl] === tgEl) return '思';
  if (CTRL_HE[dmEl] === tgEl) return '財';
  if (CTRL_HE[tgEl] === dmEl) return '殺';
  if (PROD_HE[tgEl] === dmEl) return '恩';
  return null;
}
function classifyHeluo(p) {
  const dmEl = STEM_ELEMENT[p.day.stem];
  const comps = [STEM_ELEMENT[p.hour.stem], BR_EL_HE[p.hour.branch], BR_EL_HE[p.year.branch]];
  const rels = comps.map(el => relToDM(dmEl, el)).filter(Boolean);
  const count = {旺:0,思:0,財:0,殺:0,恩:0};
  rels.forEach(r => count[r]++);
  const entries = Object.entries(count).filter(([_,v]) => v > 0).sort((a,b) => b[1]-a[1]);
  if (!entries.length) return { code:'neutral', th:'平 กลาง', score:0 };
  const [first, fc] = entries[0];
  const second = entries[1];
  if (fc >= 3) {
    const m = {財:{th:'三財 · ทรัพย์ล้วน',s:20},旺:{th:'三旺 · พลังล้น',s:15},恩:{th:'三恩 · อุปถัมภ์ล้น',s:18},思:{th:'三思 · พรสวรรค์ล้น',s:12},殺:{th:'三殺 · ระวัง',s:-20}};
    return { code:`三${first}`, th:m[first].th, score:m[first].s };
  }
  if (fc >= 2 && second) {
    const lk = {'財-旺':{t:'二財一旺 · ทรัพย์+รุ่ง',s:18},'財-恩':{t:'二財一恩 · ทรัพย์+อุปถัมภ์',s:16},'財-思':{t:'二財一思 · ทรัพย์+พรสวรรค์',s:12},'財-殺':{t:'二財一殺 · ทรัพย์+ระวัง',s:-5},
      '旺-財':{t:'二旺一財 · รุ่ง+ทรัพย์',s:14},'旺-恩':{t:'二旺一恩 · รุ่ง+อุปถัมภ์',s:15},'旺-思':{t:'二旺一思',s:10},'旺-殺':{t:'二旺一殺',s:-3},
      '恩-財':{t:'二恩一財 · อุปถัมภ์+ทรัพย์',s:14},'恩-旺':{t:'二恩一旺',s:15},'恩-思':{t:'二恩一思',s:12},'恩-殺':{t:'二恩一殺',s:0},
      '思-財':{t:'二思一財',s:13},'思-旺':{t:'二思一旺',s:10},'思-恩':{t:'二思一恩',s:12},'思-殺':{t:'二思一殺',s:-5},
      '殺-財':{t:'二殺一財',s:-10},'殺-旺':{t:'二殺一旺',s:-12},'殺-恩':{t:'二殺一恩',s:-8},'殺-思':{t:'二殺一思',s:-15}};
    const k = `${first}-${second[0]}`;
    return { code:`二${first}一${second[0]}`, th:(lk[k]||{t:`二${first}一${second[0]}`}).t, score:(lk[k]||{s:5}).s };
  }
  return { code:'mixed', th:'ผสม', score:0 };
}
function heLuoCompute(p) {
  let score = 65;
  const tags = []; const up = []; const down = [];
  const dEl = STEM_ELEMENT[p.day.stem];
  if (dEl === 'fire' || dEl === 'wood') { score += 10; tags.push('period9_fav'); up.push({code:'P9_FAV', thai:`🌟 ยุค9 ${dEl} ดี (河洛)`, delta:10}); }
  else if (dEl === 'water') { score -= 10; tags.push('period9_unfav'); down.push({code:'P9_UNFAV', thai:`⚠ ยุค9 ${dEl} เสีย (河洛)`, delta:-10}); }
  // 17 พ.ค. · Pattern recognition
  const pat = classifyHeluo(p);
  score += pat.score;
  tags.push(`heluo_${pat.code}`);
  if (pat.score >= 10) up.push({code:'HL_PAT', thai:`📊 ${pat.th}`, delta:pat.score});
  else if (pat.score <= -5) down.push({code:'HL_PAT', thai:`⚠ ${pat.th}`, delta:pat.score});
  else if (pat.code !== 'neutral') up.push({code:'HL_PAT', thai:`📊 ${pat.th}`, delta:pat.score});
  return buildResult('he_luo', score, score >= 40, tags, up, down, 0.8, { day_element: dEl, period: 9, pattern: pat.code, pattern_th: pat.th });
}

// ─── ze_ri module · port from /tmp/ajek-hng/ze_ri.module.ts ─────────
function zeRiCompute(pillars) {
  const dayBranch = pillars.day.branch;
  const hourBranch = pillars.hour.branch;
  const monthBranch = pillars.month.branch;
  const yearBranch = pillars.year.branch;
  let raw = 50;
  const tags = []; const up = []; const down = [];
  // 沖
  if (CLASH[hourBranch] === dayBranch) { raw -= 20; tags.push('chong'); down.push({ code:'CHONG', thai:'⚠ 時沖日', delta:-20 }); }
  if (CLASH[monthBranch] === dayBranch) { raw -= 15; tags.push('chong_month'); down.push({ code:'CHONG_M', thai:'月沖日', delta:-15 }); }
  // 三合
  for (const grp of SANHE) {
    if (grp.includes(dayBranch) && grp.includes(hourBranch) && dayBranch !== hourBranch) {
      raw += 12; tags.push('sanhe'); up.push({ code:'SANHE', thai:'三合', delta:12 }); break;
    }
  }
  // 天德
  const td = TIAN_DE_MONTH[monthBranch];
  if (td && (pillars.day.stem === td || pillars.day.branch === td)) {
    raw += 18; tags.push('tian_de'); up.push({ code:'TIAN_DE', thai:'天德', delta:18 });
  }
  // 月德
  const yd = YUE_DE_MONTH[monthBranch];
  if (yd && pillars.day.stem === yd) {
    raw += 12; tags.push('yue_de'); up.push({ code:'YUE_DE', thai:'月德', delta:12 });
  }
  raw = Math.max(0, Math.min(100, raw));
  return {
    module: 'ze_ri', status: 'ready',
    score: { raw, normalized: raw, weight: 1.0 },
    pass: raw >= 40, tags,
    reasons: { up, down, warning: [] },
    confidence: 0.85,
    raw: { dayBranch, hourBranch, monthBranch, yearBranch },
  };
}

// ─── Compute one slot ───────────────────────────────────────────────
async function computeSlot(date, shichen) {
  const hour = SHICHEN_HOUR[shichen];
  // tyme4ts ใช้ SolarTime
  const [y, m, d] = date.split('-').map(Number);
  const realHour = hour === 23 ? 23 : hour;
  const realDate = (hour === 23 && shichen === 0) ? new Date(Date.UTC(y, m-1, d, realHour - 7)) : new Date(Date.UTC(y, m-1, d, realHour - 7));
  const st = tyme.SolarTime.fromYmdHms(y, m, d, realHour, 0, 0);
  const ec = st.getLunarHour().getEightChar();
  const ys = ec.getYear().getHeavenStem().getName();
  const yb = ec.getYear().getEarthBranch().getName();
  const ms = ec.getMonth().getHeavenStem().getName();
  const mb = ec.getMonth().getEarthBranch().getName();
  const ds = ec.getDay().getHeavenStem().getName();
  const db = ec.getDay().getEarthBranch().getName();
  const hs = ec.getHour().getHeavenStem().getName();
  const hb = ec.getHour().getEarthBranch().getName();
  const pillars = {
    year: { stem: ys, branch: yb }, month: { stem: ms, branch: mb },
    day: { stem: ds, branch: db }, hour: { stem: hs, branch: hb },
  };
  // ดึง solar term ปัจจุบัน
  let solarTerm = null;
  try {
    const lh = st.getLunarHour();
    const jq = lh.getDay().getMonth().getJieQi();
    if (jq) solarTerm = jq.getName();
  } catch {}
  // zodiac clash = clash ของ year branch + day branch (สำหรับ filter เร็ว)
  const zodiacClash = [CLASH[yb], CLASH[db]].filter(Boolean);
  // modules · 8 universal · ใช้ตำราอากง + อาเจ๊ก
  const dayIdx = Math.floor((Date.UTC(y, m-1, d) - Date.UTC(2026,0,1))/86400000); // for 28 xiu rotation
  // 16 พ.ค. fix: ส่ง datetime พร้อม +07:00 → qimen-api คิดเป็น Bangkok local · ไม่ใช่ UTC
  // 5 ก.ค. 2026 fix: ยิง "กลางยาม" (ต้นยาม+1ชม.) — engine ใช้真太陽時 กทม. -18 นาที
  // ยิงต้นยามเป๊ะจะตกยามก่อนหน้าทุกช่อง (off-by-one · พิสูจน์ 48/48)
  // 子時 (23:00) → กลางยาม = 00:00 วันถัดไป (真太陽時ดึงกลับมา ~23:42 คืนเดิม = 子 ถูกต้อง)
  let qmDate = date, qmHour = hour + 1;
  if (hour === 23) {
    const nd = new Date(Date.UTC(y, m - 1, d));
    nd.setUTCDate(nd.getUTCDate() + 1);
    qmDate = nd.toISOString().slice(0, 10);
    qmHour = 0;
  }
  const isoDatetime = `${qmDate}T${String(qmHour).padStart(2,'0')}:00:00+07:00`;
  const modules = {
    ze_ri:           zeRiCompute(pillars),
    twelve_officers: twelveOfficersCompute(pillars),
    twenty_eight:    twentyEightCompute(pillars, dayIdx),
    twelve_spirits:  twelveSpiritsCompute(pillars),
    nine_stars:      nineStarsCompute(pillars),
    tai_sui:         taiSuiCompute(pillars),
    qi_men:          await qiMenCompute(pillars, isoDatetime),
    he_luo:          heLuoCompute(pillars),
  };
  // universal score = avg ของ 8 modules
  const scores = Object.values(modules).map(m => m.score.normalized);
  const universalScore = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length);
  return {
    date, shichen,
    datetime_start: `${date}T${String(hour).padStart(2,'0')}:00:00+07:00`,
    datetime_end:   `${date}T${String((hour+2)%24).padStart(2,'0')}:00:00+07:00`,
    year_pillar: ys+yb, month_pillar: ms+mb, day_pillar: ds+db, hour_pillar: hs+hb,
    hour_branch: hb, solar_term: solarTerm, zodiac_clash: zodiacClash,
    universal_score: universalScore, modules,
  };
}

// ─── Main ───────────────────────────────────────────────────────────
(async () => {
  const client = new Client({ host:'localhost', port:5433, database:'decode_db', user:'decode_user', password:'98a1021d6df0d117cff8d7aef3be275e' });
  await client.connect();
  // 5 ก.ค. 2026 fix: parse เป็น UTC เสมอ — ถ้า parse เป็น local (เครื่อง TZ +07)
  // toISOString จะถอยไป 1 วัน ทำให้เขียนผิดวันทั้ง batch
  const startDate = new Date(FROM + 'T00:00:00Z');
  let inserted = 0, errors = 0;
  const t0 = Date.now();
  for (let dayIdx = 0; dayIdx < DAYS; dayIdx++) {
    const d = new Date(startDate); d.setUTCDate(d.getUTCDate() + dayIdx);
    const dateStr = d.toISOString().slice(0, 10);
    for (let sc = 0; sc < 12; sc++) {
      try {
        const slot = await computeSlot(dateStr, sc);
        if (DRY) { inserted++; continue; }
        await new Promise(r => setTimeout(r, 40)); // throttle qimen-api
        await client.query(`
          INSERT INTO aj_ephemeris_cache
            (date, shichen, datetime_start, datetime_end, year_pillar, month_pillar, day_pillar, hour_pillar, hour_branch,
             solar_term, zodiac_clash, universal_score,
             ze_ri, twelve_officers, twenty_eight, twelve_spirits, nine_stars, tai_sui, qi_men, he_luo)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
          ON CONFLICT (date, shichen) DO UPDATE SET
            year_pillar=EXCLUDED.year_pillar, month_pillar=EXCLUDED.month_pillar,
            day_pillar=EXCLUDED.day_pillar, hour_pillar=EXCLUDED.hour_pillar, hour_branch=EXCLUDED.hour_branch,
            solar_term=EXCLUDED.solar_term, zodiac_clash=EXCLUDED.zodiac_clash, universal_score=EXCLUDED.universal_score,
            ze_ri=EXCLUDED.ze_ri, twelve_officers=EXCLUDED.twelve_officers, twenty_eight=EXCLUDED.twenty_eight,
            twelve_spirits=EXCLUDED.twelve_spirits, nine_stars=EXCLUDED.nine_stars, tai_sui=EXCLUDED.tai_sui,
            qi_men=EXCLUDED.qi_men, he_luo=EXCLUDED.he_luo, computed_at=NOW()
        `, [
          slot.date, slot.shichen, slot.datetime_start, slot.datetime_end,
          slot.year_pillar, slot.month_pillar, slot.day_pillar, slot.hour_pillar, slot.hour_branch,
          slot.solar_term, slot.zodiac_clash, slot.universal_score,
          JSON.stringify(slot.modules.ze_ri), JSON.stringify(slot.modules.twelve_officers),
          JSON.stringify(slot.modules.twenty_eight), JSON.stringify(slot.modules.twelve_spirits),
          JSON.stringify(slot.modules.nine_stars), JSON.stringify(slot.modules.tai_sui),
          JSON.stringify(slot.modules.qi_men), JSON.stringify(slot.modules.he_luo),
        ]);
        inserted++;
      } catch (e) {
        errors++;
        if (errors < 5) console.error(`✗ ${dateStr} sc=${sc}:`, e.message);
      }
    }
    if ((dayIdx+1) % 7 === 0) console.log(`  ✓ วัน ${dayIdx+1}/${DAYS} · ${inserted} slots ✓ · ${errors} errors`);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n📊 เสร็จสิ้น · ${inserted} inserted · ${errors} errors · qimen_engine_errors=${QIMEN_ERROR_COUNT} · ${elapsed}s`);
  await client.end();
  // fail-hard: ถ้า qimen engine ล้มเหลวแม้แต่ slot เดียว → exit 1 ให้ cron/ผู้รันเห็น
  if (errors > 0 || QIMEN_ERROR_COUNT > 0) process.exitCode = 1;
})();
