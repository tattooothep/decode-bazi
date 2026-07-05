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

  function getLocale() {
    try {
      var l = localStorage.getItem('hk_locale') || localStorage.getItem('hk_lang') || 'th';
      return LIVE.indexOf(l) !== -1 ? l : 'th';
    } catch (_) { return 'th'; }
  }

  function setLocale(l) {
    if (SUPPORTED.indexOf(l) === -1) return;
    try { localStorage.setItem('hk_locale', l); localStorage.setItem('hk_lang', l); } catch (_) {}
    document.documentElement.lang = l;
    applyI18N();
    document.dispatchEvent(new CustomEvent('hk:locale', { detail: { locale: l } }));
  }

  function t(key, fallback) {
    var e = window.HK_I18N[key];
    if (!e) return fallback != null ? fallback : key;
    var l = getLocale();
    return (e[l] != null && e[l] !== '') ? e[l] : (e.th != null ? e.th : (fallback != null ? fallback : key));
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
    return (e[l] != null && e[l] !== '') ? e[l] : (e.th || glyph);
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
  window.HK.i18n = { getLocale: getLocale, setLocale: setLocale, t: t, term: term, termWithGlyph: termWithGlyph, loadTerms: loadTerms, apply: applyI18N, SUPPORTED: SUPPORTED, LIVE: LIVE };
})();
