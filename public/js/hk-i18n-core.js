/* hk-i18n-core.js · แกนแปลกลางตัวเดียวของทั้งเว็บ (เฟส 0 แผน 8 ภาษา · 5 ก.ค. 2569)
 *
 * เป้าหมาย: ทุกหน้าใช้กลไกเดียว — เลิกมีหลายสำเนียง (HK_I18N / inline I18N / data-t / data-l)
 * หน้าเดิมยังทำงานได้ระหว่างทยอยย้าย (additive · ไม่ทับของเดิม)
 *
 * มาตรฐาน:
 *  - คลังคำ:      window.HK_I18N  รูป  'key': { th:'..', en:'..', zh:'..', vi:'..', ja:'..', ko:'..', ru:'..', es:'..' }
 *  - ภาษา:        localStorage 'hk_locale' (เขียน 'hk_lang' คู่เพื่อ backward-compat)
 *  - attribute:   data-i18n (textContent) · data-i18n-ph (placeholder) · data-i18n-html (innerHTML — ใช้เท่าที่จำเป็น)
 *  - JS:          HK.t('key', 'ไทย fallback')  — fallback เป็นไทยเสมอ (ภาษาหลักของเว็บ)
 *  - ศัพท์วิชา:    HK.term('沖')  → คำท้องถิ่นตามภาษาปัจจุบัน + glyph กำกับ (จาก /data/i18n/science-terms.json)
 *                 นโยบาย: คำท้องถิ่นนำ · ตัวจีนเป็นสัญลักษณ์วิชากำกับเล็ก ๆ ไม่เคยนำ
 *  - ตรวจความครบ: scripts/i18n-scan.mjs (--langs=th,en,zh,vi,... ) ต้องเขียวก่อน deploy
 */
(function () {
  'use strict';
  var SUPPORTED = ['th', 'en', 'zh', 'vi', 'ja', 'ko', 'ru', 'es'];
  var LIVE = ['th', 'en', 'zh']; // ภาษาที่เปิดใช้จริงแล้ว — เพิ่มทีละภาษาเมื่อผ่าน native review

  window.HK_I18N = window.HK_I18N || {};

  function stateLocale() {
    try {
      var st = window.HK_LANG_STATE || (window.HK && window.HK.langState);
      if (st && typeof st.current === 'function') return st.current();
    } catch (_) {}
    return null;
  }

  function normalizeLocale(raw) {
    var x = String(raw || '').trim().toLowerCase().replace('_', '-');
    if (!x) return '';
    if (x.indexOf('zh') === 0 || x === 'cn' || x === 'hans' || x === 'hant') return 'zh';
    if (x.indexOf('en') === 0) return 'en';
    if (x.indexOf('th') === 0) return 'th';
    return x;
  }

  function getLocale() {
    try {
      var st = stateLocale();
      var l = normalizeLocale(st && st.raw);
      if (!l) l = normalizeLocale(localStorage.getItem('hk_locale') || localStorage.getItem('hk_lang') || 'th');
      if (SUPPORTED.indexOf(l) !== -1) return l;
      return 'th';
    } catch (_) { return 'th'; }
  }

  function setLocale(l) {
    var loc = normalizeLocale(l);
    if (SUPPORTED.indexOf(loc) === -1) return;
    try {
      var st = window.HK_LANG_STATE || (window.HK && window.HK.langState);
      if (st && typeof st.set === 'function') st.set(l);
      else {
        localStorage.setItem('hk_locale', loc);
        localStorage.setItem('hk_lang', loc);
        document.documentElement.lang = loc === 'zh' ? 'zh-Hant' : loc;
        document.documentElement.setAttribute('data-lang', (loc === 'th' || loc === 'en' || loc === 'zh') ? loc : 'en');
      }
    } catch (_) {}
    applyI18N();
    document.dispatchEvent(new CustomEvent('hk:locale', { detail: { locale: loc } }));
  }

  // ── overlay ไฟล์ภาษาเดี่ยว (public/i18n/<locale>.json) — เฟส "ไฟล์ภาษาเดี่ยวต่อภาษา" ──
  // จุดประสงค์: เพิ่มภาษาใหม่ (vi/ja/ko/ru/es) โดยไม่ต้องแก้ 35 หน้า HTML เลย —
  // ทีมแปลแต่ละภาษาแก้คนละไฟล์ public/i18n/<locale>.json ได้อิสระ ไม่ชนกัน
  // โครงไฟล์: { "<หน้า>::<key>": "ข้อความแปล", "*::<key>": "ใช้ทุกหน้า (fallback กว้าง)" }
  window.HK_I18N_OVERLAY = window.HK_I18N_OVERLAY || {};
  var _overlayLocale = null; // ภาษาที่ overlay ก้อนปัจจุบันใน window.HK_I18N_OVERLAY โหลดมา

  // pageId จาก path จริงของเบราว์เซอร์ — ตรงกับชื่อไฟล์ใน public/ เช่น "/auspicious.html" → "auspicious.html"
  // (ใช้ชื่อเดียวกับ key ที่ scripts/i18n-export.mjs ส่งออก "<page>::<key>")
  function getPageId() {
    try {
      var seg = (location.pathname || '').split('/').pop() || '';
      if (!seg) return '';
      return /\.html$/i.test(seg) ? seg : (seg + '.html');
    } catch (_) { return ''; }
  }

  // โหลด overlay ของภาษาที่ระบุจาก /i18n/<locale>.json แล้วเก็บลง window.HK_I18N_OVERLAY
  // คืน Promise<object|null> — เรียกซ้ำได้ (โหลดทับก้อนเดิม), fail แล้วไม่พังหน้า (คืน null + overlay ว่าง)
  function loadOverlay(locale) {
    return fetch('/i18n/' + encodeURIComponent(locale) + '.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HK_I18N overlay not found: ' + locale);
        return r.json();
      })
      .then(function (data) {
        window.HK_I18N_OVERLAY = data && typeof data === 'object' ? data : {};
        _overlayLocale = locale;
        return window.HK_I18N_OVERLAY;
      })
      .catch(function (_err) {
        window.HK_I18N_OVERLAY = {};
        _overlayLocale = null;
        return null;
      });
  }

  // hook เบา ๆ ให้หน้าเก่า (inline I18N / data-t / data-l) เรียกใช้ได้ทันที 1 บรรทัดใน t()/_xxtx ของตัวเอง
  // โดยไม่ต้อง refactor หน้าเดิม — ดู AGENTS.md หมวด i18n ท้ายไฟล์สำหรับตัวอย่างการเรียก
  // คืนค่า string ถ้ามี overlay ตรงเงื่อนไข (exact "page::key" ก่อน แล้วค่อย wildcard "*::key"),
  // คืน null/undefined ถ้าไม่มี overlay ให้ใช้ (หน้าเดิม fallback ไปใช้ค่าตัวเองต่อ)
  function overlayGet(pageId, key, locale) {
    if (locale !== _overlayLocale) return null; // overlay ที่โหลดไว้ ไม่ตรงกับภาษาที่ขอตอนนี้
    var data = window.HK_I18N_OVERLAY;
    if (!data) return null;
    var v = data[pageId + '::' + key];
    if (v != null && v !== '') return v;
    v = data['*::' + key];
    if (v != null && v !== '') return v;
    return null;
  }
  window.HK_OVERLAY_GET = overlayGet;

  function t(key, fallback) {
    var l = getLocale();
    var ov = overlayGet(getPageId(), key, l);
    if (ov != null) return ov;
    var e = window.HK_I18N[key];
    if (!e) return fallback != null ? fallback : key;
    if (e[l] != null && e[l] !== '') return e[l];
    if (l !== 'th' && e.en != null && e.en !== '') return e.en;
    return e.th != null ? e.th : (fallback != null ? fallback : key);
  }

  // ── ศัพท์วิชากลาง (science-terms.json) — โหลดครั้งเดียว แชร์ทุกหน้า ──
  var _terms = null;
  function loadTerms() {
    if (_terms) return Promise.resolve(_terms);
    return fetch('/data/i18n/science-terms.json').then(function (r) { return r.json(); })
      .then(function (j) { _terms = j.terms || {}; return _terms; })
      .catch(function () { _terms = {}; return _terms; });
  }
  // term('沖') → 'ชง' (th) / 'Clash' (en) — glyph แสดงแยกด้วย termGlyph ตามนโยบาย "ท้องถิ่นนำ จีนกำกับ"
  function term(glyph) {
    var e = _terms && _terms[glyph];
    if (!e) return glyph;
    var l = getLocale();
    if (e[l] != null && e[l] !== '') return e[l];
    if (l !== 'th' && e.en != null && e.en !== '') return e.en;
    return e.th || glyph;
  }
  function termWithGlyph(glyph) {
    var w = term(glyph);
    return w === glyph ? glyph : (w + ' (' + glyph + ')');
  }

  function applyI18N() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n'), el.textContent);
      if (el.getAttribute('data-i18n-html') === '1') el.innerHTML = v; else el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'), el.getAttribute('placeholder')));
    });
  }

  window.HK = window.HK || {};
  window.HK.i18n = {
    getLocale: getLocale, setLocale: setLocale, t: t, term: term, termWithGlyph: termWithGlyph,
    loadTerms: loadTerms, apply: applyI18N, SUPPORTED: SUPPORTED, LIVE: LIVE,
    loadOverlay: loadOverlay, getPageId: getPageId, overlayGet: overlayGet,
  };
})();
