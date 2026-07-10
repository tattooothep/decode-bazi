/* hk-daytext.js — ตัวประกอบข้อความช่องวันปฏิทินภาษาคน
 * สถานะ: เตรียมรอ wire (ห้ามย้ายเข้า public/ จนกว่าเจ้านายสั่ง + ทีมแก้ระบบเสร็จ)
 * ใช้ข้อมูลที่ /api/calendar ส่งอยู่แล้ว: d.ten_god · d.day_officer · d.stem · d.branch · d.lunar
 * กติกา: deterministic 100% ห้ามสุ่ม · ไม่มีตัวจีนดิบใน output (ยกเว้นโหมด deep)
 * จาวิสเขียน 10 ก.ค. 2569 · สเปกเต็มดู README.md ข้างไฟล์นี้
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.HK = root.HK || {}; root.HK.daytext = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {

  /* โหลดคลังภาษา: browser ใช้ fetch · node ใช้ require (สำหรับ test) */
  var LIB = {}; // LIB[locale] = {labels, combos, officer, nayin, conditions, goals}
  var FILES = ['labels', 'combo-part1', 'combo-part2', 'combo-part3', 'officer-12', 'nayin-30', 'conditions', 'goals-72'];

  function assemble(parts) {
    return {
      labels: parts['labels'],
      combos: Object.assign({}, parts['combo-part1'], parts['combo-part2'], parts['combo-part3']),
      officer: parts['officer-12'],
      nayin: parts['nayin-30'],
      conditions: parts['conditions'],
      goals: parts['goals-72']
    };
  }

  function loadNode(locale, baseDir) {
    var path = (baseDir || __dirname) + '/' + locale + '/';
    var parts = {};
    FILES.forEach(function (f) { parts[f] = require(path + f + '.json'); });
    LIB[locale] = assemble(parts);
    return LIB[locale];
  }

  function loadBrowser(locale, baseUrl) {
    if (LIB[locale]) return Promise.resolve(LIB[locale]); /* โหลดครั้งเดียวต่อภาษา */
    var base = (baseUrl || '/data/calendar-daytext/') + locale + '/';
    return Promise.all(FILES.map(function (f) {
      return fetch(base + f + '.json?v=1').then(function (r) { return r.json(); });
    })).then(function (arr) {
      var parts = {}; FILES.forEach(function (f, i) { parts[f] = arr[i]; });
      LIB[locale] = assemble(parts);
      return LIB[locale];
    });
  }

  /* API บางจุดส่ง 建除 เป็นจีนตัวย่อ → แปลงเป็นตัวเต็มก่อนค้นคลังเสมอ */
  var OFF_NORM = { '开': '開', '满': '滿', '执': '執', '闭': '閉', '建': '建', '除': '除', '平': '平', '定': '定', '破': '破', '危': '危', '成': '成', '收': '收' };
  /* 六沖: วันกิ่งไหน ชนนักษัตรปีไหน · 六合: สมพงษ์ */
  var CHONG = { '子': '午', '丑': '未', '寅': '申', '卯': '酉', '辰': '戌', '巳': '亥', '午': '子', '未': '丑', '申': '寅', '酉': '卯', '戌': '辰', '亥': '巳' };
  var LIUHE = { '子': '丑', '丑': '子', '寅': '亥', '亥': '寅', '卯': '戌', '戌': '卯', '辰': '酉', '酉': '辰', '巳': '申', '申': '巳', '午': '未', '未': '午' };

  /* แปลงเลขจันทรคติจีน (初五/十五/廿三/三十) → เลข 1-30 */
  var CN_NUM = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  function lunarNum(lunarStr) {
    if (!lunarStr) return null;
    var m = String(lunarStr).match(/(初|十|廿|三十|二十)?([一二三四五六七八九十]+)$/);
    if (!m) return null;
    var pre = m[1] || '', tail = m[2];
    var n = 0;
    if (pre === '初') n = CN_NUM[tail] || 0;
    else if (pre === '廿' || pre === '二十') n = 20 + (CN_NUM[tail] === 10 ? 0 : (CN_NUM[tail] || 0));
    else if (pre === '三十') n = 30;
    else if (pre === '十') n = 10 + (CN_NUM[tail] === 10 ? 0 : (CN_NUM[tail] || 0));
    else if (tail === '十') n = 10;
    else if (tail.length === 2 && tail.charAt(1) === '十') n = (CN_NUM[tail.charAt(0)] || 0) * 10; /* 二十=20 三十=30 */
    else if (tail.length === 2 && tail.charAt(0) === '十') n = 10 + (CN_NUM[tail.charAt(1)] || 0); /* 十五=15 กรณี prefix ไม่ถูกจับ */
    else n = CN_NUM[tail] || 0;
    return n || null;
  }

  function fmt(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : '{' + k + '}'; });
  }

  /**
   * ประกอบช่องวัน 1 วัน
   * @param locale 'th'|'en'|... (ต้อง load แล้ว)
   * @param d ข้อมูลวันจาก /api/calendar: {stem,branch,ganzhi?,ten_god,day_officer,lunar}
   * @param opts { mode:'self'|'tongshu', userYearBranch:'子'.., goal:'wealth'.., nayinZh:'海中金' }
   * @returns {label, chip, chipType, subline, title, text, goalLine} — ทุกค่าเป็นภาษาคนล้วน
   */
  function cell(locale, d, opts) {
    opts = opts || {};
    var L = LIB[locale]; if (!L) throw new Error('daytext: locale not loaded: ' + locale);
    var mode = opts.mode === 'tongshu' ? 'tongshu' : 'self';
    var officer = OFF_NORM[d.day_officer] || d.day_officer || '';
    var out = { label: '', chip: '', chipType: '', subline: '', title: '', text: '', goalLine: '' };

    /* แถวบน: ป้ายพลังวัน (self) หรือหัววันสากล (tongshu) */
    if (mode === 'self' && d.ten_god && L.combos[d.ten_god + '|' + officer]) {
      var combo = L.combos[d.ten_god + '|' + officer];
      out.label = (L.labels.daypower[d.ten_god] || {}).label || '';
      out.title = combo.title; out.text = combo.text;
    } else {
      var off = L.officer[officer] || { title: '', text: '' };
      out.label = off.title; out.title = off.title; out.text = off.text;
    }

    /* ชิพชง/สมพงษ์ */
    var branch = d.branch;
    var chongTarget = CHONG[branch], heTarget = LIUHE[branch];
    var animalOf = function (b) { return (L.labels.branch[b] || {}).animal || ''; };
    if (mode === 'self' && opts.userYearBranch) {
      if (chongTarget === opts.userYearBranch) { out.chip = L.conditions.chong_personal.chip; out.chipType = 'chong'; out.chipLine = L.conditions.chong_personal.line; }
      else if (heTarget === opts.userYearBranch) { out.chip = L.conditions.he_personal.chip; out.chipType = 'he'; out.chipLine = L.conditions.he_personal.line; }
    } else if (chongTarget) {
      out.chip = fmt(L.conditions.chong_universal.chip, { animal: animalOf(chongTarget) });
      out.chipType = 'chong-universal';
    }

    /* บรรทัดรอง: ค่ำจันทรคติ + ธาตุหยินหยางของก้านวัน + นักษัตรวัน (ตามฟอร์มกระดาษ · 10 ก.ค. เจ้านายติ: ห้ามใช้ชื่อนาอินในช่อง คนงง) */
    var parts = [];
    var ln = lunarNum(d.lunar);
    if (ln) parts.push(fmt(L.labels.lunarDay.format, { n: ln }));
    if (L.labels.stem && L.labels.stem[d.stem]) parts.push(L.labels.stem[d.stem]);
    if (L.labels.branch[branch]) parts.push(L.labels.branch[branch].label);
    out.subline = parts.join(' · ');
    /* นาอินยังคืนแยกไว้ให้แผงข้าง/PDF ใช้ ไม่โชว์ในช่อง */
    out.nayin = (opts.nayinZh && L.nayin[opts.nayinZh]) ? L.nayin[opts.nayinZh].name : '';

    /* บรรทัดเป้า (เฉพาะเมื่อเลือก) */
    if (opts.goal && opts.goal !== 'all' && L.goals[officer + '|' + opts.goal]) {
      out.goalLine = L.goals[officer + '|' + opts.goal];
    }
    return out;
  }

  return { loadNode: loadNode, loadBrowser: loadBrowser, cell: cell, lunarNum: lunarNum, CHONG: CHONG, LIUHE: LIUHE, _lib: LIB };
}));
